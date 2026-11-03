use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use reqwest::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use std::{
    collections::HashSet,
    env,
    net::SocketAddr,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::time::sleep;
use tracing::{error, warn};

#[derive(Clone)]
struct AppState {
    client: Client,
    runtime_url: String,
    internal_token: String,
    console_gateway_token: String,
    db: PgPool,
}

type ApiResponse = (StatusCode, Json<Value>);
type ApiAuthError = ApiResponse;

#[derive(Debug)]
struct ClaimedOperation {
    id: String,
    run_id: String,
    workspace_id: String,
    sequence: i32,
    kind: String,
    attempt_count: i32,
    max_attempts: i32,
    lease_owner: String,
}

fn api_error(
    status: StatusCode,
    reason: &str,
) -> ApiResponse {
    (
        status,
        Json(json!({
            "status": "error",
            "reason": reason,
        })),
    )
}

async fn healthz() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "kiyt-gateway",
        "runtime": "rust",
    }))
}

async fn api_health(
    State(state): State<AppState>,
) -> ApiResponse {
    let url = format!(
        "{}/healthz",
        state.runtime_url.trim_end_matches('/')
    );

    match state
        .client
        .get(url)
        .timeout(Duration::from_secs(3))
        .header(
            "x-kiyt-internal-token",
            &state.internal_token,
        )
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {
            match response.json::<Value>().await {
                Ok(runtime) => (
                    StatusCode::OK,
                    Json(json!({
                        "status": "ok",
                        "service": "kiyt-gateway",
                        "runtime": runtime,
                    })),
                ),

                Err(_) => api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "invalid_runtime_response",
                ),
            }
        }

        _ => api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "runtime_unavailable",
        ),
    }
}

fn read_bearer(
    headers: &HeaderMap,
) -> Result<&str, ApiAuthError> {
    let value = headers
        .get("authorization")
        .ok_or_else(|| {
            api_error(
                StatusCode::UNAUTHORIZED,
                "missing_bearer_token",
            )
        })?
        .to_str()
        .map_err(|_| {
            api_error(
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
        return Err(api_error(
            StatusCode::UNAUTHORIZED,
            "invalid_bearer_token",
        ));
    }

    Ok(token)
}

fn sha256_hex(
    value: &str,
) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn deterministic_id(
    prefix: &str,
    material: &str,
) -> String {
    let digest = sha256_hex(material);

    format!("{prefix}_{}", &digest[..32])
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
            api_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "api_key_store_unavailable",
            )
        })?;

    workspace_id.ok_or_else(|| {
        api_error(
            StatusCode::UNAUTHORIZED,
            "invalid_or_revoked_api_key",
        )
    })
}

async fn authenticate_workspace(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<String, ApiAuthError> {
    if let Some(value) =
        headers.get("x-kiyt-console-token")
    {
        let token =
            value
                .to_str()
                .map_err(|_| {
                    api_error(
                        StatusCode::UNAUTHORIZED,
                        "invalid_console_principal",
                    )
                })?;

        if token.is_empty()
            || token != state.console_gateway_token
        {
            return Err(api_error(
                StatusCode::UNAUTHORIZED,
                "invalid_console_principal",
            ));
        }

        let workspace_id =
            headers
                .get("x-kiyt-workspace-id")
                .ok_or_else(|| {
                    api_error(
                        StatusCode::UNAUTHORIZED,
                        "invalid_console_principal",
                    )
                })?
                .to_str()
                .map_err(|_| {
                    api_error(
                        StatusCode::UNAUTHORIZED,
                        "invalid_console_principal",
                    )
                })?
                .trim();

        if workspace_id.is_empty()
            || workspace_id.len() > 128
        {
            return Err(api_error(
                StatusCode::UNAUTHORIZED,
                "invalid_console_principal",
            ));
        }

        return Ok(
            workspace_id.to_owned()
        );
    }

    authenticate_api_key(
        headers,
        state,
    )
    .await
}

async fn api_auth(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResponse {
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
                "workspace_id": workspace_id,
            })),
        ),

        Err(error) => error,
    }
}

fn read_idempotency_key(
    headers: &HeaderMap,
) -> Result<String, ApiResponse> {
    let value = headers
        .get("idempotency-key")
        .ok_or_else(|| {
            api_error(
                StatusCode::BAD_REQUEST,
                "missing_idempotency_key",
            )
        })?
        .to_str()
        .map_err(|_| {
            api_error(
                StatusCode::BAD_REQUEST,
                "invalid_idempotency_key",
            )
        })?
        .trim();

    if value.is_empty()
        || value.len() > 200
        || !value
            .chars()
            .all(|ch| ch.is_ascii_graphic())
    {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "invalid_idempotency_key",
        ));
    }

    Ok(value.to_owned())
}

fn validate_run_payload(
    payload: Value,
) -> Result<Value, ApiResponse> {
    let object =
        payload.as_object().ok_or_else(|| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_run_payload",
            )
        })?;

    let objective = object
        .get("objective")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "objective_required",
            )
        })?;

    if objective.len() > 20_000 {
        return Err(api_error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "objective_too_large",
        ));
    }

    let context = object
        .get("context")
        .cloned()
        .unwrap_or_else(|| json!({}));

    if !context.is_object() {
        return Err(api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "context_must_be_object",
        ));
    }

    let available_actions = object
        .get("available_actions")
        .cloned()
        .unwrap_or_else(|| json!([]));

    let actions =
        available_actions.as_array().ok_or_else(|| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "available_actions_must_be_array",
            )
        })?;

    if actions.len() > 100 {
        return Err(api_error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "too_many_available_actions",
        ));
    }

    let mut names = HashSet::new();

    for action in actions {
        let action_object =
            action.as_object().ok_or_else(|| {
                api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_action_definition",
                )
            })?;

        let name = action_object
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_action_name",
                )
            })?;

        if !names.insert(name.to_owned()) {
            return Err(api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "duplicate_action_name",
            ));
        }

        if let Some(description) =
            action_object.get("description")
        {
            if !description.is_string() {
                return Err(api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_action_description",
                ));
            }
        }

        if let Some(schema) =
            action_object.get("input_schema")
        {
            if !schema.is_object() {
                return Err(api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_action_input_schema",
                ));
            }
        }
    }

    let normalized = json!({
        "objective": objective,
        "context": context,
        "available_actions": available_actions,
    });

    let encoded =
        serde_json::to_vec(&normalized)
            .map_err(|_| {
                api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_run_payload",
                )
            })?;

    if encoded.len() > 1_000_000 {
        return Err(api_error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "run_payload_too_large",
        ));
    }

    Ok(normalized)
}

fn validate_observation_payload(
    payload: Value,
) -> Result<Value, ApiResponse> {
    let object =
        payload.as_object().ok_or_else(|| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_observation_payload",
            )
        })?;

    let decision_id = object
        .get("decision_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "observation_decision_id_required",
            )
        })?;

    if decision_id.len() > 128 {
        return Err(api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "invalid_observation_decision_id",
        ));
    }

    let client_observation_id = object
        .get("observation_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "observation_id_required",
            )
        })?;

    if client_observation_id.len() > 128 {
        return Err(api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "invalid_observation_id",
        ));
    }

    let result = object
        .get("result")
        .and_then(Value::as_object)
        .ok_or_else(|| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "observation_result_required",
            )
        })?;

    let status = result
        .get("status")
        .and_then(Value::as_str)
        .map(str::trim)
        .ok_or_else(|| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "observation_status_required",
            )
        })?;

    if !matches!(
        status,
        "success" | "failure"
    ) {
        return Err(api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "invalid_observation_status",
        ));
    }

    let output = result
        .get("output")
        .cloned()
        .unwrap_or_else(|| json!({}));

    let normalized = json!({
        "decision_id": decision_id,
        "observation_id":
            client_observation_id,
        "result": {
            "status": status,
            "output": output,
        },
    });

    let encoded =
        serde_json::to_vec(&normalized)
            .map_err(|_| {
                api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_observation_payload",
                )
            })?;

    if encoded.len() > 1_000_000 {
        return Err(api_error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "observation_payload_too_large",
        ));
    }

    Ok(normalized)
}



fn validate_input_payload(
    payload: Value,
) -> Result<Value, ApiResponse> {
    let object =
        payload.as_object().ok_or_else(|| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_input_payload",
            )
        })?;

    let decision_id = object
        .get("decision_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "input_decision_id_required",
            )
        })?;

    let input_id = object
        .get("input_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "input_id_required",
            )
        })?;

    if decision_id.len() > 128
        || input_id.len() > 128
    {
        return Err(api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "invalid_input_identifier",
        ));
    }

    let data = object
        .get("data")
        .and_then(Value::as_object)
        .ok_or_else(|| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "input_data_object_required",
            )
        })?;

    let normalized = json!({
        "decision_id": decision_id,
        "input_id": input_id,
        "data": data,
    });

    let encoded =
        serde_json::to_vec(&normalized)
            .map_err(|_| {
                api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_input_payload",
                )
            })?;

    if encoded.len() > 1_000_000 {
        return Err(api_error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "input_payload_too_large",
        ));
    }

    Ok(normalized)
}

fn validate_feedback_payload(
    payload: Value,
) -> Result<Value, ApiResponse> {
    let object =
        payload.as_object().ok_or_else(|| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_feedback_payload",
            )
        })?;

    let rating = object
        .get("rating")
        .and_then(Value::as_i64)
        .ok_or_else(|| {
            api_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "feedback_rating_required",
            )
        })?;

    if !matches!(rating, -1 | 0 | 1) {
        return Err(api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "invalid_feedback_rating",
        ));
    }

    let decision_id =
        match object.get("decision_id") {
            None | Some(Value::Null) =>
                Value::Null,

            Some(Value::String(value)) => {
                let value = value.trim();

                if value.is_empty()
                    || value.len() > 128
                {
                    return Err(api_error(
                        StatusCode::UNPROCESSABLE_ENTITY,
                        "invalid_feedback_decision_id",
                    ));
                }

                json!(value)
            }

            _ => {
                return Err(api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_feedback_decision_id",
                ));
            }
        };

    let comment =
        match object.get("comment") {
            None | Some(Value::Null) =>
                Value::Null,

            Some(Value::String(value)) => {
                let value = value.trim();

                if value.chars().count() > 5000 {
                    return Err(api_error(
                        StatusCode::PAYLOAD_TOO_LARGE,
                        "feedback_comment_too_large",
                    ));
                }

                if value.is_empty() {
                    Value::Null
                } else {
                    json!(value)
                }
            }

            _ => {
                return Err(api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_feedback_comment",
                ));
            }
        };

    let normalized = json!({
        "rating": rating,
        "decision_id": decision_id,
        "comment": comment,
    });

    let encoded =
        serde_json::to_vec(&normalized)
            .map_err(|_| {
                api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_feedback_payload",
                )
            })?;

    if encoded.len() > 100_000 {
        return Err(api_error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "feedback_payload_too_large",
        ));
    }

    Ok(normalized)
}


fn pending_status(
    status: &str,
) -> bool {
    matches!(status, "queued" | "running")
}

fn public_run_status(
    status: &str,
) -> &str {
    match status {
        "awaiting_observation" =>
            "requires_action",
        value => value,
    }
}

async fn load_run_json(
    db: &PgPool,
    workspace_id: &str,
    run_id: &str,
) -> Result<Option<Value>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT
            r.id,
            r.status,
            r.error_code,
            r.error_retryable,
            r.created_at::text AS created_at,
            r.updated_at::text AS updated_at,
            r.completed_at::text AS completed_at,

            d.id AS decision_id,
            d.decision_json::text AS decision_json,
            d.provider_name,
            d.model,
            d.reasoning_effort,
            d.provider_response_id

        FROM runs r

        LEFT JOIN LATERAL (
            SELECT
                d0.id,
                d0.decision_json,
                d0.provider_name,
                d0.model,
                d0.reasoning_effort,
                d0.provider_response_id
            FROM decisions d0
            WHERE d0.run_id = r.id
              AND d0.workspace_id = r.workspace_id
            ORDER BY d0.sequence DESC
            LIMIT 1
        ) d ON true

        WHERE r.id = $1
          AND r.workspace_id = $2
        "#,
    )
    .bind(run_id)
    .bind(workspace_id)
    .fetch_optional(db)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    let id: String =
        row.try_get("id")?;

    let status: String =
        row.try_get("status")?;

    let error_code: Option<String> =
        row.try_get("error_code")?;

    let error_retryable: Option<bool> =
        row.try_get("error_retryable")?;

    let created_at: String =
        row.try_get("created_at")?;

    let updated_at: String =
        row.try_get("updated_at")?;

    let completed_at: Option<String> =
        row.try_get("completed_at")?;

    let decision_id: Option<String> =
        row.try_get("decision_id")?;

    let decision_text: Option<String> =
        row.try_get("decision_json")?;

    let provider_name: Option<String> =
        row.try_get("provider_name")?;

    let model: Option<String> =
        row.try_get("model")?;

    let reasoning_effort: Option<String> =
        row.try_get("reasoning_effort")?;

    let provider_response_id: Option<String> =
        row.try_get("provider_response_id")?;

    let mut decision =
        decision_text.and_then(|text| {
            serde_json::from_str::<Value>(
                &text
            )
            .ok()
        });

    if let (
        Some(Value::Object(object)),
        Some(decision_id),
    ) = (
        &mut decision,
        decision_id.as_ref(),
    ) {
        object.insert(
            "run_id".to_owned(),
            Value::String(id.clone()),
        );

        object.insert(
            "decision_id".to_owned(),
            Value::String(
                decision_id.clone()
            ),
        );
    }

    let usage_rows = sqlx::query(
        r#"
        SELECT
            phase,
            input_tokens,
            cached_input_tokens,
            output_tokens,
            reasoning_tokens,
            total_tokens

        FROM usage_events

        WHERE run_id = $1
          AND workspace_id = $2
          AND decision_id = (
              SELECT id
              FROM decisions
              WHERE run_id = $1
                AND workspace_id = $2
              ORDER BY sequence DESC
              LIMIT 1
          )

        ORDER BY phase
        "#,
    )
    .bind(run_id)
    .bind(workspace_id)
    .fetch_all(db)
    .await?;

    let mut usage =
        serde_json::Map::new();

    for usage_row in usage_rows {
        let phase: String =
            usage_row.try_get("phase")?;

        let input_tokens: i64 =
            usage_row.try_get("input_tokens")?;

        let cached_input_tokens: i64 =
            usage_row.try_get(
                "cached_input_tokens"
            )?;

        let output_tokens: i64 =
            usage_row.try_get("output_tokens")?;

        let reasoning_tokens: i64 =
            usage_row.try_get(
                "reasoning_tokens"
            )?;

        let total_tokens: i64 =
            usage_row.try_get("total_tokens")?;

        usage.insert(
            phase,
            json!({
                "input_tokens":
                    input_tokens,
                "cached_input_tokens":
                    cached_input_tokens,
                "output_tokens":
                    output_tokens,
                "reasoning_tokens":
                    reasoning_tokens,
                "total_tokens":
                    total_tokens,
            }),
        );
    }

    let provider =
        if decision.is_some() {
            json!({
                "name": provider_name,
                "model": model,
                "reasoning_effort":
                    reasoning_effort,
                "response_id":
                    provider_response_id,
                "usage":
                    Value::Object(usage),
            })
        } else {
            Value::Null
        };

    Ok(Some(json!({
        "id": id,
        "status":
            public_run_status(&status),
        "decision": decision,
        "provider": provider,

        "error":
            if error_code.is_some() {
                json!({
                    "code": error_code,
                    "retryable":
                        error_retryable,
                })
            } else {
                Value::Null
            },

        "created_at": created_at,
        "updated_at": updated_at,
        "completed_at": completed_at,
    })))
}

async fn create_run(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> ApiResponse {
    let workspace_id =
        match authenticate_workspace(
            &headers,
            &state,
        )
        .await
        {
            Ok(value) => value,
            Err(error) => return error,
        };

    let idempotency_key =
        match read_idempotency_key(
            &headers,
        ) {
            Ok(value) => value,
            Err(error) => return error,
        };

    let payload =
        match validate_run_payload(payload) {
            Ok(value) => value,
            Err(error) => return error,
        };

    let request_json =
        match serde_json::to_string(
            &payload
        ) {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_run_payload",
                );
            }
        };

    let request_hash =
        sha256_hex(&request_json);

    let run_id =
        deterministic_id(
            "run",
            &format!(
                "{workspace_id}\0{idempotency_key}"
            ),
        );

    let operation_id =
        deterministic_id(
            "op",
            &format!("{run_id}:1"),
        );

    let mut tx =
        match state.db.begin().await {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "run_store_unavailable",
                );
            }
        };

    let inserted = sqlx::query(
        r#"
        INSERT INTO runs (
            id,
            workspace_id,
            idempotency_key,
            request_hash,
            request_payload,
            status
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5::jsonb,
            'queued'
        )

        ON CONFLICT (
            workspace_id,
            idempotency_key
        )
        DO NOTHING
        "#,
    )
    .bind(&run_id)
    .bind(&workspace_id)
    .bind(&idempotency_key)
    .bind(&request_hash)
    .bind(&request_json)
    .execute(&mut *tx)
    .await;

    let inserted =
        match inserted {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "run_store_unavailable",
                );
            }
        };

    if inserted.rows_affected() == 0 {
        let existing =
            sqlx::query_as::<
                _,
                (
                    String,
                    String,
                    String,
                ),
            >(
                r#"
                SELECT
                    id,
                    status,
                    request_hash
                FROM runs
                WHERE workspace_id = $1
                  AND idempotency_key = $2
                "#,
            )
            .bind(&workspace_id)
            .bind(&idempotency_key)
            .fetch_optional(&mut *tx)
            .await;

        let existing =
            match existing {
                Ok(Some(value)) => value,

                _ => {
                    return api_error(
                        StatusCode::SERVICE_UNAVAILABLE,
                        "run_store_unavailable",
                    );
                }
            };

        if existing.2 != request_hash {
            return api_error(
                StatusCode::CONFLICT,
                "idempotency_key_payload_conflict",
            );
        }

        if tx.commit().await.is_err() {
            return api_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "run_store_unavailable",
            );
        }

        let run =
            match load_run_json(
                &state.db,
                &workspace_id,
                &existing.0,
            )
            .await
            {
                Ok(Some(value)) => value,

                _ => {
                    return api_error(
                        StatusCode::SERVICE_UNAVAILABLE,
                        "run_store_unavailable",
                    );
                }
            };

        let response_status =
            if pending_status(&existing.1) {
                StatusCode::ACCEPTED
            } else {
                StatusCode::OK
            };

        let public_status =
            run.get("status")
                .and_then(Value::as_str)
                .unwrap_or("");

        let replay_operation_id =
            deterministic_id(
                "op",
                &format!(
                    "{}:1",
                    existing.0
                ),
            );

        return (
            response_status,
            Json(json!({
                "run_id":
                    &existing.0,
                "operation_id":
                    replay_operation_id,
                "status":
                    public_status,
                "idempotent_replay":
                    true,
                "run":
                    run,
            })),
        );
    }

    let operation_insert =
        sqlx::query(
            r#"
            INSERT INTO operations (
                id,
                run_id,
                workspace_id,
                sequence,
                kind,
                status,
                max_attempts
            )
            VALUES (
                $1,
                $2,
                $3,
                1,
                'cognitive_decision',
                'queued',
                3
            )
            "#,
        )
        .bind(&operation_id)
        .bind(&run_id)
        .bind(&workspace_id)
        .execute(&mut *tx)
        .await;

    if operation_insert.is_err() {
        return api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "operation_store_unavailable",
        );
    }

    if tx.commit().await.is_err() {
        return api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "run_store_unavailable",
        );
    }

    (
        StatusCode::ACCEPTED,
        Json(json!({
            "run_id":
                &run_id,
            "operation_id":
                &operation_id,
            "status":
                "queued",
            "idempotent_replay":
                false,
            "run": {
                "id": &run_id,
                "status": "queued",
            },
        })),
    )
}

async fn get_run(
    Path(run_id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResponse {
    let workspace_id =
        match authenticate_workspace(
            &headers,
            &state,
        )
        .await
        {
            Ok(value) => value,
            Err(error) => return error,
        };

    match load_run_json(
        &state.db,
        &workspace_id,
        &run_id,
    )
    .await
    {
        Ok(Some(run)) => (
            StatusCode::OK,
            Json(json!({
                "run": run,
            })),
        ),

        Ok(None) => api_error(
            StatusCode::NOT_FOUND,
            "run_not_found",
        ),

        Err(_) => api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "run_store_unavailable",
        ),
    }
}

async fn create_observation(
    Path(run_id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> ApiResponse {
    let workspace_id =
        match authenticate_workspace(
            &headers,
            &state,
        )
        .await
        {
            Ok(value) => value,
            Err(error) => return error,
        };

    let idempotency_key =
        match read_idempotency_key(
            &headers,
        ) {
            Ok(value) => value,
            Err(error) => return error,
        };

    let payload =
        match validate_observation_payload(
            payload
        ) {
            Ok(value) => value,
            Err(error) => return error,
        };

    let request_json =
        match serde_json::to_string(
            &payload
        ) {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_observation_payload",
                );
            }
        };

    let request_hash =
        sha256_hex(&request_json);

    let requested_decision_id =
        payload
            .get("decision_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();

    let requested_observation_id =
        payload
            .get("observation_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();

    let result_json =
        match serde_json::to_string(
            &payload["result"]
        ) {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_observation_payload",
                );
            }
        };

    let observation_id =
        deterministic_id(
            "obs",
            &format!(
                "{workspace_id}\0{run_id}\0{requested_observation_id}"
            ),
        );

    let mut tx =
        match state.db.begin().await {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "observation_store_unavailable",
                );
            }
        };

    let existing =
        sqlx::query_as::<
            _,
            (String, String, i32),
        >(
            r#"
            SELECT
                id,
                request_hash,
                sequence
            FROM observations
            WHERE run_id = $1
              AND workspace_id = $2
              AND idempotency_key = $3
            "#,
        )
        .bind(&run_id)
        .bind(&workspace_id)
        .bind(&idempotency_key)
        .fetch_optional(&mut *tx)
        .await;

    let existing =
        match existing {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "observation_store_unavailable",
                );
            }
        };

    if let Some((
        existing_id,
        existing_hash,
        existing_sequence,
    )) = existing
    {
        if existing_hash != request_hash {
            return api_error(
                StatusCode::CONFLICT,
                "idempotency_key_payload_conflict",
            );
        }

        if tx.commit().await.is_err() {
            return api_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "observation_store_unavailable",
            );
        }

        let run =
            match load_run_json(
                &state.db,
                &workspace_id,
                &run_id,
            )
            .await
            {
                Ok(Some(value)) => value,

                Ok(None) => {
                    return api_error(
                        StatusCode::NOT_FOUND,
                        "run_not_found",
                    );
                }

                Err(_) => {
                    return api_error(
                        StatusCode::SERVICE_UNAVAILABLE,
                        "run_store_unavailable",
                    );
                }
            };

        let status =
            run.get("status")
                .and_then(Value::as_str)
                .unwrap_or("");

        let response_status =
            if pending_status(status) {
                StatusCode::ACCEPTED
            } else {
                StatusCode::OK
            };

        let replay_operation_id =
            deterministic_id(
                "op",
                &format!(
                    "{run_id}:{}",
                    existing_sequence + 1
                ),
            );

        return (
            response_status,
            Json(json!({
                "run_id":
                    &run_id,
                "operation_id":
                    replay_operation_id,
                "status":
                    status,
                "idempotent_replay": true,
                "observation": {
                    "id": existing_id,
                },
                "run": run,
            })),
        );
    }

    let existing_observation =
        sqlx::query_scalar::<_, String>(
            r#"
            SELECT id
            FROM observations
            WHERE id = $1
              AND run_id = $2
              AND workspace_id = $3
            LIMIT 1
            "#,
        )
        .bind(&observation_id)
        .bind(&run_id)
        .bind(&workspace_id)
        .fetch_optional(&mut *tx)
        .await;

    let existing_observation =
        match existing_observation {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "observation_store_unavailable",
                );
            }
        };

    if existing_observation.is_some() {
        return api_error(
            StatusCode::CONFLICT,
            "observation_id_already_recorded",
        );
    }

    let run_row =
        sqlx::query_as::<
            _,
            (
                String,
                Option<String>,
                Option<i32>,
                Option<String>,
            ),
        >(
            r#"
            SELECT
                r.status,
                d.id,
                d.sequence,
                d.decision_json::text
            FROM runs r

            LEFT JOIN LATERAL (
                SELECT
                    id,
                    sequence,
                    decision_json
                FROM decisions
                WHERE run_id = r.id
                  AND workspace_id =
                      r.workspace_id
                ORDER BY sequence DESC
                LIMIT 1
            ) d ON true

            WHERE r.id = $1
              AND r.workspace_id = $2

            FOR UPDATE OF r
            "#,
        )
        .bind(&run_id)
        .bind(&workspace_id)
        .fetch_optional(&mut *tx)
        .await;

    let run_row =
        match run_row {
            Ok(Some(value)) => value,

            Ok(None) => {
                return api_error(
                    StatusCode::NOT_FOUND,
                    "run_not_found",
                );
            }

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "run_store_unavailable",
                );
            }
        };

    if run_row.0 != "awaiting_observation" {
        return api_error(
            StatusCode::CONFLICT,
            "run_not_awaiting_observation",
        );
    }

    let decision_id =
        match run_row.1 {
            Some(value) => value,

            None => {
                return api_error(
                    StatusCode::CONFLICT,
                    "run_has_no_decision",
                );
            }
        };

    if requested_decision_id
        != decision_id
    {
        return api_error(
            StatusCode::CONFLICT,
            "observation_decision_mismatch",
        );
    }

    let decision_sequence =
        match run_row.2 {
            Some(value) if value > 0 => value,

            _ => {
                return api_error(
                    StatusCode::CONFLICT,
                    "run_has_no_decision",
                );
            }
        };

    let decision_json =
        match run_row.3
            .and_then(|value| {
                serde_json::from_str::<Value>(
                    &value
                )
                .ok()
            })
        {
            Some(value) => value,

            None => {
                return api_error(
                    StatusCode::CONFLICT,
                    "run_decision_invalid",
                );
            }
        };

    if decision_json
        .get("status")
        .and_then(Value::as_str)
        != Some("requires_action")
    {
        return api_error(
            StatusCode::CONFLICT,
            "decision_not_awaiting_observation",
        );
    }

    let inserted =
        sqlx::query(
            r#"
            INSERT INTO observations (
                id,
                run_id,
                workspace_id,
                sequence,
                observation_json,
                decision_id,
                idempotency_key,
                request_hash
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5::jsonb,
                $6,
                $7,
                $8
            )
            ON CONFLICT (
                run_id,
                sequence
            )
            DO NOTHING
            "#,
        )
        .bind(&observation_id)
        .bind(&run_id)
        .bind(&workspace_id)
        .bind(decision_sequence)
        .bind(&result_json)
        .bind(&decision_id)
        .bind(&idempotency_key)
        .bind(&request_hash)
        .execute(&mut *tx)
        .await;

    let inserted =
        match inserted {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "observation_store_unavailable",
                );
            }
        };

    if inserted.rows_affected() != 1 {
        return api_error(
            StatusCode::CONFLICT,
            "observation_already_recorded",
        );
    }

    let operation_sequence =
        decision_sequence + 1;

    let operation_id =
        deterministic_id(
            "op",
            &format!(
                "{run_id}:{operation_sequence}"
            ),
        );

    let operation_insert =
        sqlx::query(
            r#"
            INSERT INTO operations (
                id,
                run_id,
                workspace_id,
                sequence,
                kind,
                status,
                max_attempts
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                'observation_continuation',
                'queued',
                3
            )
            ON CONFLICT (
                run_id,
                sequence
            )
            DO NOTHING
            "#,
        )
        .bind(&operation_id)
        .bind(&run_id)
        .bind(&workspace_id)
        .bind(operation_sequence)
        .execute(&mut *tx)
        .await;

    let operation_insert =
        match operation_insert {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "operation_store_unavailable",
                );
            }
        };

    if operation_insert.rows_affected() != 1 {
        return api_error(
            StatusCode::CONFLICT,
            "continuation_already_exists",
        );
    }

    let run_update =
        sqlx::query(
            r#"
            UPDATE runs
            SET
                status = 'queued',
                error_code = NULL,
                error_retryable = NULL,
                updated_at = now(),
                completed_at = NULL
            WHERE id = $1
              AND workspace_id = $2
              AND status =
                  'awaiting_observation'
            "#,
        )
        .bind(&run_id)
        .bind(&workspace_id)
        .execute(&mut *tx)
        .await;

    let run_update =
        match run_update {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "run_store_unavailable",
                );
            }
        };

    if run_update.rows_affected() != 1 {
        return api_error(
            StatusCode::CONFLICT,
            "run_not_awaiting_observation",
        );
    }

    if tx.commit().await.is_err() {
        return api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "observation_store_unavailable",
        );
    }

    (
        StatusCode::ACCEPTED,
        Json(json!({
            "run_id":
                &run_id,
            "operation_id":
                &operation_id,
            "status":
                "queued",
            "idempotent_replay": false,
            "observation": {
                "id": observation_id,
                "sequence": decision_sequence,
                "decision_id": decision_id,
                "status": payload["result"]["status"],
            },
            "run": {
                "id": &run_id,
                "status": "queued",
            },
        })),
    )
}



async fn create_input(
    Path(run_id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> ApiResponse {
    let workspace_id =
        match authenticate_workspace(
            &headers,
            &state,
        )
        .await
        {
            Ok(value) => value,
            Err(error) => return error,
        };

    let idempotency_key =
        match read_idempotency_key(
            &headers,
        ) {
            Ok(value) => value,
            Err(error) => return error,
        };

    let payload =
        match validate_input_payload(
            payload
        ) {
            Ok(value) => value,
            Err(error) => return error,
        };

    let request_json =
        match serde_json::to_string(
            &payload
        ) {
            Ok(value) => value,
            Err(_) => {
                return api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_input_payload",
                );
            }
        };

    let request_hash =
        sha256_hex(&request_json);

    let requested_decision_id =
        payload
            .get("decision_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();

    let requested_input_id =
        payload
            .get("input_id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();

    let input_json =
        match serde_json::to_string(
            &payload["data"]
        ) {
            Ok(value) => value,
            Err(_) => {
                return api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_input_payload",
                );
            }
        };

    let input_id =
        deterministic_id(
            "inp",
            &format!(
                "{workspace_id}\0{run_id}\0{requested_input_id}"
            ),
        );

    let mut tx =
        match state.db.begin().await {
            Ok(value) => value,
            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "input_store_unavailable",
                );
            }
        };

    let existing =
        sqlx::query_as::<
            _,
            (String, String, i32),
        >(
            r#"
            SELECT
                id,
                request_hash,
                sequence
            FROM run_inputs
            WHERE run_id = $1
              AND workspace_id = $2
              AND idempotency_key = $3
            "#,
        )
        .bind(&run_id)
        .bind(&workspace_id)
        .bind(&idempotency_key)
        .fetch_optional(&mut *tx)
        .await;

    let existing =
        match existing {
            Ok(value) => value,
            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "input_store_unavailable",
                );
            }
        };

    if let Some((
        existing_id,
        existing_hash,
        existing_sequence,
    )) = existing
    {
        if existing_hash != request_hash {
            return api_error(
                StatusCode::CONFLICT,
                "idempotency_key_payload_conflict",
            );
        }

        if tx.commit().await.is_err() {
            return api_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "input_store_unavailable",
            );
        }

        let run =
            match load_run_json(
                &state.db,
                &workspace_id,
                &run_id,
            )
            .await
            {
                Ok(Some(value)) => value,
                Ok(None) => {
                    return api_error(
                        StatusCode::NOT_FOUND,
                        "run_not_found",
                    );
                }
                Err(_) => {
                    return api_error(
                        StatusCode::SERVICE_UNAVAILABLE,
                        "run_store_unavailable",
                    );
                }
            };

        let status =
            run.get("status")
                .and_then(Value::as_str)
                .unwrap_or("");

        let response_status =
            if pending_status(status) {
                StatusCode::ACCEPTED
            } else {
                StatusCode::OK
            };

        return (
            response_status,
            Json(json!({
                "run_id": &run_id,
                "operation_id":
                    deterministic_id(
                        "op",
                        &format!(
                            "{run_id}:{}",
                            existing_sequence + 1
                        ),
                    ),
                "status": status,
                "idempotent_replay": true,
                "input": {
                    "id": existing_id,
                },
                "run": run,
            })),
        );
    }

    let run_row =
        sqlx::query_as::<
            _,
            (
                String,
                Option<String>,
                Option<i32>,
                Option<String>,
            ),
        >(
            r#"
            SELECT
                r.status,
                d.id,
                d.sequence,
                d.decision_json::text
            FROM runs r

            LEFT JOIN LATERAL (
                SELECT
                    id,
                    sequence,
                    decision_json
                FROM decisions
                WHERE run_id = r.id
                  AND workspace_id =
                      r.workspace_id
                ORDER BY sequence DESC
                LIMIT 1
            ) d ON true

            WHERE r.id = $1
              AND r.workspace_id = $2

            FOR UPDATE OF r
            "#,
        )
        .bind(&run_id)
        .bind(&workspace_id)
        .fetch_optional(&mut *tx)
        .await;

    let run_row =
        match run_row {
            Ok(Some(value)) => value,

            Ok(None) => {
                return api_error(
                    StatusCode::NOT_FOUND,
                    "run_not_found",
                );
            }

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "input_store_unavailable",
                );
            }
        };

    if run_row.0 != "needs_input" {
        return api_error(
            StatusCode::CONFLICT,
            "run_not_awaiting_input",
        );
    }

    let decision_id =
        match run_row.1 {
            Some(value) => value,

            None => {
                return api_error(
                    StatusCode::CONFLICT,
                    "run_has_no_decision",
                );
            }
        };

    if requested_decision_id
        != decision_id
    {
        return api_error(
            StatusCode::CONFLICT,
            "input_decision_mismatch",
        );
    }

    let decision_sequence =
        match run_row.2 {
            Some(value) if value > 0 =>
                value,

            _ => {
                return api_error(
                    StatusCode::CONFLICT,
                    "run_has_no_decision",
                );
            }
        };

    let decision_json =
        match run_row.3
            .and_then(|value| {
                serde_json::from_str::<Value>(
                    &value
                )
                .ok()
            })
        {
            Some(value) => value,

            None => {
                return api_error(
                    StatusCode::CONFLICT,
                    "run_decision_invalid",
                );
            }
        };

    if decision_json
        .get("status")
        .and_then(Value::as_str)
        != Some("needs_input")
    {
        return api_error(
            StatusCode::CONFLICT,
            "decision_not_awaiting_input",
        );
    }

    let inserted =
        sqlx::query(
            r#"
            INSERT INTO run_inputs (
                id,
                run_id,
                workspace_id,
                sequence,
                decision_id,
                input_json,
                idempotency_key,
                request_hash
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6::jsonb,
                $7,
                $8
            )
            ON CONFLICT (
                run_id,
                sequence
            )
            DO NOTHING
            "#,
        )
        .bind(&input_id)
        .bind(&run_id)
        .bind(&workspace_id)
        .bind(decision_sequence)
        .bind(&decision_id)
        .bind(&input_json)
        .bind(&idempotency_key)
        .bind(&request_hash)
        .execute(&mut *tx)
        .await;

    let inserted =
        match inserted {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "input_store_unavailable",
                );
            }
        };

    if inserted.rows_affected() != 1 {
        return api_error(
            StatusCode::CONFLICT,
            "input_already_recorded",
        );
    }

    let operation_sequence =
        decision_sequence + 1;

    let operation_id =
        deterministic_id(
            "op",
            &format!(
                "{run_id}:{operation_sequence}"
            ),
        );

    let operation_insert =
        sqlx::query(
            r#"
            INSERT INTO operations (
                id,
                run_id,
                workspace_id,
                sequence,
                kind,
                status,
                max_attempts
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                'input_continuation',
                'queued',
                3
            )
            ON CONFLICT (
                run_id,
                sequence
            )
            DO NOTHING
            "#,
        )
        .bind(&operation_id)
        .bind(&run_id)
        .bind(&workspace_id)
        .bind(operation_sequence)
        .execute(&mut *tx)
        .await;

    let operation_insert =
        match operation_insert {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "operation_store_unavailable",
                );
            }
        };

    if operation_insert.rows_affected() != 1 {
        return api_error(
            StatusCode::CONFLICT,
            "continuation_already_exists",
        );
    }

    let updated =
        sqlx::query(
            r#"
            UPDATE runs
            SET
                status = 'queued',
                error_code = NULL,
                error_retryable = NULL,
                updated_at = now(),
                completed_at = NULL
            WHERE id = $1
              AND workspace_id = $2
              AND status = 'needs_input'
            "#,
        )
        .bind(&run_id)
        .bind(&workspace_id)
        .execute(&mut *tx)
        .await;

    let updated =
        match updated {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "input_store_unavailable",
                );
            }
        };

    if updated.rows_affected() != 1 {
        return api_error(
            StatusCode::CONFLICT,
            "run_not_awaiting_input",
        );
    }

    if tx.commit().await.is_err() {
        return api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "input_store_unavailable",
        );
    }

    (
        StatusCode::ACCEPTED,
        Json(json!({
            "run_id": &run_id,
            "operation_id":
                &operation_id,
            "status": "queued",
            "idempotent_replay":
                false,
            "input": {
                "id": input_id,
                "sequence":
                    decision_sequence,
                "decision_id":
                    decision_id,
            },
            "run": {
                "id": &run_id,
                "status": "queued",
            },
        })),
    )
}

async fn create_feedback(
    Path(run_id): Path<String>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> ApiResponse {
    let workspace_id =
        match authenticate_workspace(
            &headers,
            &state,
        )
        .await
        {
            Ok(value) => value,
            Err(error) => return error,
        };

    let idempotency_key =
        match read_idempotency_key(
            &headers,
        ) {
            Ok(value) => value,
            Err(error) => return error,
        };

    let payload =
        match validate_feedback_payload(
            payload,
        ) {
            Ok(value) => value,
            Err(error) => return error,
        };

    let encoded =
        match serde_json::to_string(
            &payload,
        ) {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "invalid_feedback_payload",
                );
            }
        };

    let request_hash =
        sha256_hex(&encoded);

    let feedback_id =
        deterministic_id(
            "fb",
            &format!(
                "{workspace_id}\0{run_id}\0{idempotency_key}"
            ),
        );

    let rating =
        payload
            .get("rating")
            .and_then(Value::as_i64)
            .unwrap_or_default()
            as i16;

    let decision_id =
        payload
            .get("decision_id")
            .and_then(Value::as_str);

    let comment =
        payload
            .get("comment")
            .and_then(Value::as_str);

    let run_exists =
        sqlx::query_scalar::<_, i32>(
            r#"
            SELECT 1
            FROM runs
            WHERE id = $1
              AND workspace_id = $2
            LIMIT 1
            "#,
        )
        .bind(&run_id)
        .bind(&workspace_id)
        .fetch_optional(&state.db)
        .await;

    match run_exists {
        Ok(Some(_)) => {}

        Ok(None) => {
            return api_error(
                StatusCode::NOT_FOUND,
                "run_not_found",
            );
        }

        Err(_) => {
            return api_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "feedback_store_unavailable",
            );
        }
    }

    if let Some(decision_id) =
        decision_id
    {
        let decision_exists =
            sqlx::query_scalar::<_, i32>(
                r#"
                SELECT 1
                FROM decisions
                WHERE id = $1
                  AND run_id = $2
                  AND workspace_id = $3
                LIMIT 1
                "#,
            )
            .bind(decision_id)
            .bind(&run_id)
            .bind(&workspace_id)
            .fetch_optional(&state.db)
            .await;

        match decision_exists {
            Ok(Some(_)) => {}

            Ok(None) => {
                return api_error(
                    StatusCode::CONFLICT,
                    "feedback_decision_mismatch",
                );
            }

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "feedback_store_unavailable",
                );
            }
        }
    }

    let insert =
        sqlx::query(
            r#"
            INSERT INTO feedback_events (
                id,
                run_id,
                decision_id,
                workspace_id,
                rating,
                comment,
                idempotency_key,
                request_hash
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8
            )
            ON CONFLICT (
                workspace_id,
                run_id,
                idempotency_key
            )
            DO NOTHING
            "#,
        )
        .bind(&feedback_id)
        .bind(&run_id)
        .bind(decision_id)
        .bind(&workspace_id)
        .bind(rating)
        .bind(comment)
        .bind(&idempotency_key)
        .bind(&request_hash)
        .execute(&state.db)
        .await;

    let insert =
        match insert {
            Ok(value) => value,

            Err(_) => {
                return api_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "feedback_store_unavailable",
                );
            }
        };

    if insert.rows_affected() == 1 {
        return (
            StatusCode::CREATED,
            Json(json!({
                "idempotent_replay": false,
                "feedback": {
                    "id": feedback_id,
                    "run_id": run_id,
                    "decision_id": decision_id,
                    "rating": rating,
                },
            })),
        );
    }

    let existing =
        sqlx::query_as::<
            _,
            (String, String),
        >(
            r#"
            SELECT
                id,
                request_hash
            FROM feedback_events
            WHERE workspace_id = $1
              AND run_id = $2
              AND idempotency_key = $3
            LIMIT 1
            "#,
        )
        .bind(&workspace_id)
        .bind(&run_id)
        .bind(&idempotency_key)
        .fetch_optional(&state.db)
        .await;

    match existing {
        Ok(Some((
            existing_id,
            existing_hash,
        ))) => {
            if existing_hash
                != request_hash
            {
                return api_error(
                    StatusCode::CONFLICT,
                    "idempotency_key_payload_conflict",
                );
            }

            (
                StatusCode::OK,
                Json(json!({
                    "idempotent_replay": true,
                    "feedback": {
                        "id": existing_id,
                        "run_id": run_id,
                        "decision_id": decision_id,
                        "rating": rating,
                    },
                })),
            )
        }

        Ok(None) => api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "feedback_store_unavailable",
        ),

        Err(_) => api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "feedback_store_unavailable",
        ),
    }
}


async fn fail_exhausted_operations(
    tx: &mut sqlx::Transaction<
        '_,
        sqlx::Postgres,
    >,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        WITH exhausted AS (
            UPDATE operations
            SET
                status = 'failed',
                lease_owner = NULL,
                lease_expires_at = NULL,
                last_error_code =
                    'operation_attempts_exhausted',
                last_error_retryable = false,
                updated_at = now(),
                completed_at = now()

            WHERE
                attempt_count >= max_attempts

                AND (
                    (
                        status = 'queued'
                        AND available_at <= now()
                    )

                    OR

                    (
                        status = 'running'
                        AND lease_expires_at
                            IS NOT NULL
                        AND lease_expires_at
                            < now()
                    )
                )

            RETURNING
                run_id,
                workspace_id
        )

        UPDATE runs
        SET
            status = 'failed',
            error_code =
                'operation_attempts_exhausted',
            error_retryable = false,
            updated_at = now(),
            completed_at = now()

        FROM exhausted

        WHERE runs.id =
            exhausted.run_id

          AND runs.workspace_id =
            exhausted.workspace_id
        "#,
    )
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn claim_next_operation(
    state: &AppState,
    worker_id: &str,
) -> Result<
    Option<ClaimedOperation>,
    sqlx::Error,
> {
    let mut tx =
        state.db.begin().await?;

    fail_exhausted_operations(
        &mut tx
    )
    .await?;

    let row = sqlx::query(
        r#"
        WITH candidate AS (
            SELECT id
            FROM operations

            WHERE
                attempt_count < max_attempts

                AND (
                    (
                        status = 'queued'
                        AND available_at <= now()
                    )

                    OR

                    (
                        status = 'running'
                        AND lease_expires_at
                            IS NOT NULL
                        AND lease_expires_at
                            < now()
                    )
                )

            ORDER BY created_at

            FOR UPDATE SKIP LOCKED

            LIMIT 1
        )

        UPDATE operations AS operation

        SET
            status = 'running',

            attempt_count =
                operation.attempt_count + 1,

            lease_owner = $1,

            lease_expires_at =
                now()
                + interval '5 minutes',

            started_at =
                COALESCE(
                    operation.started_at,
                    now()
                ),

            updated_at = now()

        FROM candidate

        WHERE operation.id =
            candidate.id

        RETURNING
            operation.id,
            operation.run_id,
            operation.workspace_id,
            operation.sequence,
            operation.kind,
            operation.attempt_count,
            operation.max_attempts
        "#,
    )
    .bind(worker_id)
    .fetch_optional(&mut *tx)
    .await?;

    let Some(row) = row else {
        tx.commit().await?;
        return Ok(None);
    };

    let operation =
        ClaimedOperation {
            id:
                row.try_get("id")?,

            run_id:
                row.try_get("run_id")?,

            workspace_id:
                row.try_get(
                    "workspace_id"
                )?,

            sequence:
                row.try_get(
                    "sequence"
                )?,

            kind:
                row.try_get(
                    "kind"
                )?,

            attempt_count:
                row.try_get(
                    "attempt_count"
                )?,

            max_attempts:
                row.try_get(
                    "max_attempts"
                )?,

            lease_owner:
                worker_id.to_owned(),
        };

    sqlx::query(
        r#"
        UPDATE runs
        SET
            status = 'running',
            error_code = NULL,
            error_retryable = NULL,
            updated_at = now()

        WHERE id = $1
          AND workspace_id = $2
          AND status IN (
              'queued',
              'running'
          )
        "#,
    )
    .bind(&operation.run_id)
    .bind(&operation.workspace_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Some(operation))
}

fn usage_value(
    body: &Value,
    phase: &str,
    field: &str,
) -> i64 {
    body.pointer(
        &format!(
            "/provider/usage/{phase}/{field}"
        )
    )
    .and_then(Value::as_i64)
    .unwrap_or(0)
}

async fn complete_operation(
    state: &AppState,
    operation: &ClaimedOperation,
    body: &Value,
    run_status: &str,
) -> Result<(), sqlx::Error> {
    let decision =
        body.get("decision")
            .expect(
                "decision validated"
            );

    let provider =
        body.get("provider")
            .expect(
                "provider validated"
            );

    let provider_name =
        provider
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("meta");

    let model =
        provider
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or("unknown");

    let reasoning_effort =
        provider
            .get("reasoning_effort")
            .and_then(Value::as_str)
            .unwrap_or("low");

    let provider_response_id =
        provider
            .get("response_id")
            .and_then(Value::as_str)
            .map(str::to_owned);

    let decision_json =
        serde_json::to_string(
            decision
        )
        .expect(
            "decision serialization"
        );

    let decision_id =
        deterministic_id(
            "dec",
            &format!(
                "{}:{}",
                operation.run_id,
                operation.sequence
            ),
        );

    let mut tx =
        state.db.begin().await?;

    let operation_update =
        sqlx::query(
            r#"
            UPDATE operations
            SET
                status = 'completed',
                lease_owner = NULL,
                lease_expires_at = NULL,
                last_error_code = NULL,
                last_error_retryable = NULL,
                updated_at = now(),
                completed_at = now()

            WHERE id = $1
              AND status = 'running'
              AND lease_owner = $2
            "#,
        )
        .bind(&operation.id)
        .bind(&operation.lease_owner)
        .execute(&mut *tx)
        .await?;

    if operation_update.rows_affected() != 1 {
        tx.rollback().await?;
        return Ok(());
    }

    sqlx::query(
        r#"
        INSERT INTO decisions (
            id,
            run_id,
            workspace_id,
            sequence,
            decision_json,
            provider_name,
            model,
            reasoning_effort,
            provider_response_id
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5::jsonb,
            $6,
            $7,
            $8,
            $9
        )

        ON CONFLICT (
            run_id,
            sequence
        )

        DO UPDATE SET
            decision_json =
                EXCLUDED.decision_json,

            provider_name =
                EXCLUDED.provider_name,

            model =
                EXCLUDED.model,

            reasoning_effort =
                EXCLUDED.reasoning_effort,

            provider_response_id =
                EXCLUDED.provider_response_id
        "#,
    )
    .bind(&decision_id)
    .bind(&operation.run_id)
    .bind(&operation.workspace_id)
    .bind(operation.sequence)
    .bind(&decision_json)
    .bind(provider_name)
    .bind(model)
    .bind(reasoning_effort)
    .bind(provider_response_id)
    .execute(&mut *tx)
    .await?;

    for phase in [
        "router",
        "decision",
    ] {
        let usage_id =
            deterministic_id(
                "use",
                &format!(
                    "{decision_id}:{phase}"
                ),
            );

        sqlx::query(
            r#"
            INSERT INTO usage_events (
                id,
                run_id,
                decision_id,
                workspace_id,
                phase,
                input_tokens,
                cached_input_tokens,
                output_tokens,
                reasoning_tokens,
                total_tokens
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10
            )

            ON CONFLICT (
                decision_id,
                phase
            )

            DO UPDATE SET
                input_tokens =
                    EXCLUDED.input_tokens,

                cached_input_tokens =
                    EXCLUDED.cached_input_tokens,

                output_tokens =
                    EXCLUDED.output_tokens,

                reasoning_tokens =
                    EXCLUDED.reasoning_tokens,

                total_tokens =
                    EXCLUDED.total_tokens
            "#,
        )
        .bind(usage_id)
        .bind(&operation.run_id)
        .bind(&decision_id)
        .bind(&operation.workspace_id)
        .bind(phase)
        .bind(
            usage_value(
                body,
                phase,
                "input_tokens",
            )
        )
        .bind(
            usage_value(
                body,
                phase,
                "cached_input_tokens",
            )
        )
        .bind(
            usage_value(
                body,
                phase,
                "output_tokens",
            )
        )
        .bind(
            usage_value(
                body,
                phase,
                "reasoning_tokens",
            )
        )
        .bind(
            usage_value(
                body,
                phase,
                "total_tokens",
            )
        )
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        r#"
        UPDATE runs
        SET
            status = $2,
            error_code = NULL,
            error_retryable = NULL,
            updated_at = now(),

            completed_at =
                CASE
                    WHEN $2 = 'completed'
                    THEN now()
                    ELSE NULL
                END

        WHERE id = $1
          AND workspace_id = $3
        "#,
    )
    .bind(&operation.run_id)
    .bind(run_status)
    .bind(&operation.workspace_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(())
}

async fn record_failure(
    state: &AppState,
    operation: &ClaimedOperation,
    code: &str,
    retryable: bool,
) -> Result<(), sqlx::Error> {
    let should_retry =
        retryable
            && operation.attempt_count
                < operation.max_attempts;

    let mut tx =
        state.db.begin().await?;

    if should_retry {
        let delay_seconds =
            operation
                .attempt_count
                .clamp(1, 5);

        let updated = sqlx::query(
            r#"
            UPDATE operations
            SET
                status = 'queued',

                available_at =
                    now()
                    + (
                        $3::int
                        * interval '1 second'
                    ),

                lease_owner = NULL,
                lease_expires_at = NULL,

                last_error_code = $4,
                last_error_retryable = true,

                updated_at = now()

            WHERE id = $1
              AND lease_owner = $2
            "#,
        )
        .bind(&operation.id)
        .bind(&operation.lease_owner)
        .bind(delay_seconds)
        .bind(code)
        .execute(&mut *tx)
        .await?;

        if updated.rows_affected() == 1 {
            sqlx::query(
                r#"
                UPDATE runs
                SET
                    status = 'queued',
                    error_code = $2,
                    error_retryable = true,
                    updated_at = now(),
                    completed_at = NULL

                WHERE id = $1
                  AND workspace_id = $3
                "#,
            )
            .bind(&operation.run_id)
            .bind(code)
            .bind(&operation.workspace_id)
            .execute(&mut *tx)
            .await?;
        }
    } else {
        let updated = sqlx::query(
            r#"
            UPDATE operations
            SET
                status = 'failed',
                lease_owner = NULL,
                lease_expires_at = NULL,
                last_error_code = $3,
                last_error_retryable = $4,
                updated_at = now(),
                completed_at = now()

            WHERE id = $1
              AND lease_owner = $2
            "#,
        )
        .bind(&operation.id)
        .bind(&operation.lease_owner)
        .bind(code)
        .bind(retryable)
        .execute(&mut *tx)
        .await?;

        if updated.rows_affected() == 1 {
            sqlx::query(
                r#"
                UPDATE runs
                SET
                    status = 'failed',
                    error_code = $2,
                    error_retryable = $3,
                    updated_at = now(),
                    completed_at = now()

                WHERE id = $1
                  AND workspace_id = $4
                "#,
            )
            .bind(&operation.run_id)
            .bind(code)
            .bind(retryable)
            .bind(&operation.workspace_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    Ok(())
}

async fn process_operation(
    state: &AppState,
    operation: &ClaimedOperation,
) -> Result<(), sqlx::Error> {
    let payload_text =
        sqlx::query_scalar::<_, String>(
            r#"
            SELECT request_payload::text
            FROM runs
            WHERE id = $1
              AND workspace_id = $2
            "#,
        )
        .bind(&operation.run_id)
        .bind(&operation.workspace_id)
        .fetch_one(&state.db)
        .await?;

    let payload =
        match serde_json::from_str::<Value>(
            &payload_text
        ) {
            Ok(value) => value,

            Err(_) => {
                record_failure(
                    state,
                    operation,
                    "invalid_durable_request_payload",
                    false,
                )
                .await?;

                return Ok(());
            }
        };

    let mut latest_observation:
        Option<Value> = None;

    let mut latest_input:
        Option<Value> = None;

    if operation.kind
        == "input_continuation"
    {
        let input_sequence =
            operation.sequence - 1;

        if input_sequence <= 0 {
            record_failure(
                state,
                operation,
                "invalid_input_sequence",
                false,
            )
            .await?;

            return Ok(());
        }

        let input_text =
            sqlx::query_scalar::<_, String>(
                r#"
                SELECT input_json::text
                FROM run_inputs
                WHERE run_id = $1
                  AND workspace_id = $2
                  AND sequence = $3
                "#,
            )
            .bind(&operation.run_id)
            .bind(&operation.workspace_id)
            .bind(input_sequence)
            .fetch_optional(&state.db)
            .await?;

        let Some(input_text) =
            input_text
        else {
            record_failure(
                state,
                operation,
                "input_not_found",
                false,
            )
            .await?;

            return Ok(());
        };

        latest_input =
            match serde_json::from_str::<Value>(
                &input_text
            ) {
                Ok(value) =>
                    Some(value),

                Err(_) => {
                    record_failure(
                        state,
                        operation,
                        "invalid_input_json",
                        false,
                    )
                    .await?;

                    return Ok(());
                }
            };
    }
    else if operation.kind
        == "observation_continuation"
    {
        let observation_sequence =
            operation.sequence - 1;

        if observation_sequence <= 0 {
            record_failure(
                state,
                operation,
                "invalid_observation_sequence",
                false,
            )
            .await?;

            return Ok(());
        }

        let episode_row =
            sqlx::query_as::<
                _,
                (
                    String,
                    String,
                    String,
                    String,
                    String,
                ),
            >(
                r#"
                SELECT
                    o.id,
                    o.decision_id,
                    o.observation_json::text,
                    d.decision_json::text,
                    COALESCE(
                        r.request_payload
                            ->> 'objective',
                        ''
                    )
                FROM observations o

                JOIN decisions d
                  ON d.id = o.decision_id
                 AND d.run_id = o.run_id
                 AND d.workspace_id =
                     o.workspace_id

                JOIN runs r
                  ON r.id = o.run_id
                 AND r.workspace_id =
                     o.workspace_id

                WHERE o.run_id = $1
                  AND o.workspace_id = $2
                  AND o.sequence = $3
                "#,
            )
            .bind(&operation.run_id)
            .bind(&operation.workspace_id)
            .bind(observation_sequence)
            .fetch_optional(&state.db)
            .await?;

        let Some((
            observation_id,
            decision_id,
            observation_text,
            decision_text,
            objective,
        )) = episode_row
        else {
            record_failure(
                state,
                operation,
                "observation_not_found",
                false,
            )
            .await?;

            return Ok(());
        };

        let observation_value =
            match serde_json::from_str::<Value>(
                &observation_text
            ) {
                Ok(value) => value,

                Err(_) => {
                    record_failure(
                        state,
                        operation,
                        "invalid_observation_json",
                        false,
                    )
                    .await?;

                    return Ok(());
                }
            };

        let decision_value =
            match serde_json::from_str::<Value>(
                &decision_text
            ) {
                Ok(value) => value,

                Err(_) => {
                    record_failure(
                        state,
                        operation,
                        "invalid_decision_json",
                        false,
                    )
                    .await?;

                    return Ok(());
                }
            };

        let episode_url = format!(
            "{}/memory/episodes",
            state.runtime_url
                .trim_end_matches('/')
        );

        let episode_payload = json!({
            "workspace_id":
                operation.workspace_id,
            "run_id":
                operation.run_id,
            "decision_id":
                decision_id,
            "observation_id":
                observation_id,
            "objective":
                objective,
            "decision":
                decision_value,
            "result":
                observation_value,
        });

        let episode_response =
            state
                .client
                .post(episode_url)
                .header(
                    "x-kiyt-internal-token",
                    &state.internal_token,
                )
                .json(&episode_payload)
                .send()
                .await;

        let episode_response =
            match episode_response {
                Ok(value) => value,

                Err(_) => {
                    record_failure(
                        state,
                        operation,
                        "episodic_sync_transport_failure",
                        true,
                    )
                    .await?;

                    return Ok(());
                }
            };

        let episode_status =
            episode_response.status();

        if !episode_status.is_success() {
            let retryable =
                episode_status.is_server_error()
                    || episode_status
                        == StatusCode::
                            TOO_MANY_REQUESTS;

            record_failure(
                state,
                operation,
                "episodic_sync_failure",
                retryable,
            )
            .await?;

            return Ok(());
        }

        latest_observation =
            Some(observation_value);
    } else if operation.kind
        != "cognitive_decision"
    {
        record_failure(
            state,
            operation,
            "unknown_operation_kind",
            false,
        )
        .await?;

        return Ok(());
    }

    let url = format!(
        "{}/cognition/decide",
        state.runtime_url.trim_end_matches('/')
    );

    let mut runtime_payload = payload;

    let runtime_object =
        match runtime_payload.as_object_mut() {
            Some(value) => value,

            None => {
                record_failure(
                    state,
                    operation,
                    "invalid_durable_request_payload",
                    false,
                )
                .await?;

                return Ok(());
            }
        };

    //
    // Tenant/run identity comes from the claimed
    // durable operation, never from customer input.
    //
    runtime_object.insert(
        "workspace_id".to_string(),
        Value::String(
            operation.workspace_id.clone()
        ),
    );

    runtime_object.insert(
        "run_id".to_string(),
        Value::String(
            operation.run_id.clone()
        ),
    );

    if (
        latest_observation.is_some()
        || latest_input.is_some()
    )
        && runtime_object
            .get("context")
            .and_then(Value::as_object)
            .is_none()
    {
        record_failure(
            state,
            operation,
            "invalid_durable_context",
            false,
        )
        .await?;

        return Ok(());
    }

    if let Some(observation) =
        latest_observation
    {
        runtime_object
            .get_mut("context")
            .and_then(Value::as_object_mut)
            .expect(
                "context validated as object"
            )
            .insert(
                "latest_observation".to_string(),
                observation,
            );
    }

    if let Some(input) =
        latest_input
    {
        runtime_object
            .get_mut("context")
            .and_then(Value::as_object_mut)
            .expect(
                "context validated as object"
            )
            .insert(
                "latest_input".to_string(),
                input,
            );
    }

    let response = state
        .client
        .post(url)
        .header(
            "x-kiyt-internal-token",
            &state.internal_token,
        )
        .json(&runtime_payload)
        .send()
        .await;

    let response =
        match response {
            Ok(value) => value,

            Err(_) => {
                record_failure(
                    state,
                    operation,
                    "runtime_transport_failure",
                    true,
                )
                .await?;

                return Ok(());
            }
        };

    let status = response.status();

    let body_text =
        match response.text().await {
            Ok(value) => value,

            Err(_) => {
                record_failure(
                    state,
                    operation,
                    "runtime_response_read_failure",
                    true,
                )
                .await?;

                return Ok(());
            }
        };

    if !status.is_success() {
        let parsed =
            serde_json::from_str::<Value>(
                &body_text
            )
            .ok();

        let code = parsed
            .as_ref()
            .and_then(|value| {
                value.pointer(
                    "/detail/code"
                )
            })
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| {
                format!(
                    "runtime_http_{}",
                    status.as_u16()
                )
            });

        let retryable = parsed
            .as_ref()
            .and_then(|value| {
                value.pointer(
                    "/detail/retryable"
                )
            })
            .and_then(Value::as_bool)
            .unwrap_or_else(|| {
                status.is_server_error()
                    || status
                        == StatusCode::
                            TOO_MANY_REQUESTS
            });

        record_failure(
            state,
            operation,
            &code,
            retryable,
        )
        .await?;

        return Ok(());
    }

    let body =
        match serde_json::from_str::<Value>(
            &body_text
        ) {
            Ok(value) => value,

            Err(_) => {
                record_failure(
                    state,
                    operation,
                    "invalid_runtime_json",
                    true,
                )
                .await?;

                return Ok(());
            }
        };

    let decision_status =
        body.pointer(
            "/decision/status"
        )
        .and_then(Value::as_str);

    let provider_valid =
        body.get("provider")
            .and_then(Value::as_object)
            .is_some();

    let usage_valid =
        body.pointer(
            "/provider/usage/router"
        )
        .and_then(Value::as_object)
        .is_some()
        &&
        body.pointer(
            "/provider/usage/decision"
        )
        .and_then(Value::as_object)
        .is_some();

    let run_status =
        match decision_status {
            Some("requires_action") =>
                "awaiting_observation",

            Some("needs_input") =>
                "needs_input",

            Some("completed") =>
                "completed",

            _ => {
                record_failure(
                    state,
                    operation,
                    "invalid_runtime_decision",
                    false,
                )
                .await?;

                return Ok(());
            }
        };

    if !provider_valid || !usage_valid {
        record_failure(
            state,
            operation,
            "invalid_runtime_provider_metadata",
            false,
        )
        .await?;

        return Ok(());
    }

    complete_operation(
        state,
        operation,
        &body,
        run_status,
    )
    .await
}

async fn worker_loop(
    state: AppState,
    worker_id: String,
) {
    loop {
        match claim_next_operation(
            &state,
            &worker_id,
        )
        .await
        {
            Ok(Some(operation)) => {
                if let Err(error) =
                    process_operation(
                        &state,
                        &operation,
                    )
                    .await
                {
                    error!(
                        worker = %worker_id,
                        operation = %operation.id,
                        error = %error,
                        "operation processing database failure"
                    );
                }
            }

            Ok(None) => {
                sleep(
                    Duration::from_millis(250)
                )
                .await;
            }

            Err(error) => {
                warn!(
                    worker = %worker_id,
                    error = %error,
                    "operation claim failed"
                );

                sleep(
                    Duration::from_secs(1)
                )
                .await;
            }
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::
                EnvFilter::
                from_default_env(),
        )
        .init();

    let runtime_url =
        env::var("KIYT_RUNTIME_URL")
            .expect(
                "KIYT_RUNTIME_URL is required"
            );

    let internal_token =
        env::var("KIYT_INTERNAL_TOKEN")
            .expect(
                "KIYT_INTERNAL_TOKEN is required"
            );

    let console_gateway_token =
        env::var(
            "KIYT_CONSOLE_GATEWAY_TOKEN"
        )
        .expect(
            "KIYT_CONSOLE_GATEWAY_TOKEN is required"
        );

    let database_url =
        env::var("KIYT_DATABASE_URL")
            .expect(
                "KIYT_DATABASE_URL is required"
            );

    let worker_count =
        env::var("KIYT_RUN_WORKERS")
            .ok()
            .and_then(|value| {
                value
                    .parse::<usize>()
                    .ok()
            })
            .unwrap_or(4)
            .clamp(1, 16);

    let db =
        PgPoolOptions::new()
            .max_connections(8)
            .acquire_timeout(
                Duration::from_secs(3),
            )
            .connect(&database_url)
            .await
            .expect(
                "PostgreSQL connection failed"
            );

    let client =
        Client::builder()
            .timeout(
                Duration::from_secs(250),
            )
            .build()
            .expect(
                "HTTP client initialization failed"
            );

    let state = AppState {
        client,
        runtime_url,
        internal_token,
        console_gateway_token,
        db,
    };

    let startup_id =
        SystemTime::now()
            .duration_since(
                UNIX_EPOCH,
            )
            .expect("system clock")
            .as_nanos();

    for index in 0..worker_count {
        let worker_state =
            state.clone();

        let worker_id =
            format!(
                "gateway-{startup_id}-{index}"
            );

        tokio::spawn(
            worker_loop(
                worker_state,
                worker_id,
            )
        );
    }

    let app = Router::new()
        .route(
            "/healthz",
            get(healthz),
        )
        .route(
            "/api/v1/health",
            get(api_health),
        )
        .route(
            "/api/v1/auth",
            get(api_auth),
        )
        .route(
            "/api/v1/runs",
            post(create_run),
        )
        .route(
            "/api/v1/runs/{run_id}",
            get(get_run),
        )
        .route(
            "/api/v1/runs/{run_id}/observations",
            post(create_observation),
        )
        .route(
            "/api/v1/runs/{run_id}/inputs",
            post(create_input),
        )
        .route(
            "/api/v1/runs/{run_id}/feedback",
            post(create_feedback),
        )
        .with_state(state);

    let addr =
        SocketAddr::from(
            ([0, 0, 0, 0], 8080)
        );

    let listener =
        tokio::net::
            TcpListener::bind(addr)
            .await
            .expect(
                "gateway bind failed"
            );

    axum::serve(
        listener,
        app,
    )
    .await
    .expect(
        "gateway server failed"
    );
}
