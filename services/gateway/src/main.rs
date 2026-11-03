use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use reqwest::Client;
use sha2::{Digest, Sha256};
use sqlx::{postgres::PgPoolOptions, PgPool};
use serde_json::{json, Value};
use std::{env, net::SocketAddr, time::Duration};

#[derive(Clone)]
struct AppState {
    client: Client,
    runtime_url: String,
    internal_token: String,
    db: PgPool,
}

async fn healthz() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "kiyt-gateway",
        "runtime": "rust"
    }))
}

async fn api_health(
    State(state): State<AppState>,
) -> (StatusCode, Json<Value>) {
    let url = format!(
        "{}/healthz",
        state.runtime_url.trim_end_matches('/')
    );

    let response = state
        .client
        .get(url)
        .header(
            "x-kiyt-internal-token",
            &state.internal_token,
        )
        .send()
        .await;

    match response {
        Ok(response) if response.status().is_success() => {
            match response.json::<Value>().await {
                Ok(runtime) => (
                    StatusCode::OK,
                    Json(json!({
                        "status": "ok",
                        "service": "kiyt-gateway",
                        "runtime": runtime
                    })),
                ),
                Err(_) => (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(json!({
                        "status": "error",
                        "reason": "invalid_runtime_response"
                    })),
                ),
            }
        }
        _ => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "error",
                "reason": "runtime_unavailable"
            })),
        ),
    }
}


type ApiAuthError = (StatusCode, Json<Value>);

fn auth_error(
    status: StatusCode,
    reason: &'static str,
) -> ApiAuthError {
    (
        status,
        Json(json!({
            "status": "error",
            "reason": reason
        })),
    )
}

fn read_bearer(
    headers: &HeaderMap,
) -> Result<&str, ApiAuthError> {
    let value = headers
        .get("authorization")
        .ok_or_else(|| {
            auth_error(
                StatusCode::UNAUTHORIZED,
                "missing_bearer_token",
            )
        })?
        .to_str()
        .map_err(|_| {
            auth_error(
                StatusCode::UNAUTHORIZED,
                "invalid_bearer_token",
            )
        })?;

    let mut parts = value.split_whitespace();

    let scheme = parts.next().unwrap_or("");
    let token = parts.next().unwrap_or("");

    if !scheme.eq_ignore_ascii_case("Bearer")
        || token.is_empty()
        || parts.next().is_some()
        || !token.starts_with("kiyt_")
    {
        return Err(auth_error(
            StatusCode::UNAUTHORIZED,
            "invalid_bearer_token",
        ));
    }

    Ok(token)
}

fn sha256_hex(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

async fn authenticate_api_key(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<String, ApiAuthError> {
    let raw = read_bearer(headers)?;
    let hash = sha256_hex(raw);

    let workspace_id =
        sqlx::query_scalar::<_, String>(
            r#"
            UPDATE api_keys
            SET last_used_at = now()
            WHERE key_hash = $1
              AND revoked_at IS NULL
            RETURNING workspace_id
            "#,
        )
        .bind(hash)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| {
            auth_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "api_key_store_unavailable",
            )
        })?;

    workspace_id.ok_or_else(|| {
        auth_error(
            StatusCode::UNAUTHORIZED,
            "invalid_or_revoked_api_key",
        )
    })
}

async fn api_auth(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> (StatusCode, Json<Value>) {
    match authenticate_api_key(
        &headers,
        &state,
    )
    .await
    {
        Ok(workspace_id) => (
            StatusCode::OK,
            Json(json!({
                "authenticated": true,
                "workspace_id": workspace_id
            })),
        ),

        Err(error) => error,
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env(),
        )
        .init();

    let runtime_url =
        env::var("KIYT_RUNTIME_URL")
            .expect("KIYT_RUNTIME_URL is required");

    let internal_token =
        env::var("KIYT_INTERNAL_TOKEN")
            .expect("KIYT_INTERNAL_TOKEN is required");

    let database_url =
        env::var("KIYT_DATABASE_URL")
            .expect("KIYT_DATABASE_URL is required");

    let db =
        PgPoolOptions::new()
            .max_connections(8)
            .acquire_timeout(
                Duration::from_secs(3),
            )
            .connect(&database_url)
            .await
            .expect("PostgreSQL connection failed");

    let client = Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .expect("HTTP client initialization failed");

    let state = AppState {
        client,
        runtime_url,
        internal_token,
        db,
    };

    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/api/v1/health", get(api_health))
        .route("/api/v1/auth", get(api_auth))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("gateway bind failed");

    axum::serve(listener, app)
        .await
        .expect("gateway server failed");
}
