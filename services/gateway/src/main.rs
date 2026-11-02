use axum::{
    extract::State,
    http::StatusCode,
    routing::get,
    Json, Router,
};
use reqwest::Client;
use serde_json::{json, Value};
use std::{env, net::SocketAddr, time::Duration};

#[derive(Clone)]
struct AppState {
    client: Client,
    runtime_url: String,
    internal_token: String,
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

    let client = Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .expect("HTTP client initialization failed");

    let state = AppState {
        client,
        runtime_url,
        internal_token,
    };

    let app = Router::new()
        .route("/healthz", get(healthz))
        .route("/api/v1/health", get(api_health))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("gateway bind failed");

    axum::serve(listener, app)
        .await
        .expect("gateway server failed");
}
