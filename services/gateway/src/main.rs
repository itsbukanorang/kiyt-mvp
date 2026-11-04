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

    let evaluation_row =
        sqlx::query(
            r#"
            SELECT
                id,
                decision_id,
                observation_id,
                feedback_event_id,
                evaluator_name,
                evaluator_version,
                rubric_name,
                rubric_version,
                evidence_class,
                evidence_hash,
                score,
                passed,
                components_json::text
                    AS components_json,
                artifact_json::text
                    AS artifact_json,
                artifact_hash,
                created_at::text
                    AS created_at

            FROM evaluation_events

            WHERE run_id = $1
              AND workspace_id = $2

            ORDER BY
                created_at DESC,
                id DESC

            LIMIT 1
            "#,
        )
        .bind(run_id)
        .bind(workspace_id)
        .fetch_optional(db)
        .await?;

    let evaluation =
        if let Some(row) =
            evaluation_row
        {
            let components_text:
                String =
                row.try_get(
                    "components_json"
                )?;

            let artifact_text:
                String =
                row.try_get(
                    "artifact_json"
                )?;

            json!({
                "id":
                    row.try_get::<
                        String,
                        _
                    >("id")?,

                "decision_id":
                    row.try_get::<
                        String,
                        _
                    >("decision_id")?,

                "observation_id":
                    row.try_get::<
                        String,
                        _
                    >("observation_id")?,

                "feedback_event_id":
                    row.try_get::<
                        Option<String>,
                        _
                    >(
                        "feedback_event_id"
                    )?,

                "evaluator": {
                    "name":
                        row.try_get::<
                            String,
                            _
                        >(
                            "evaluator_name"
                        )?,

                    "version":
                        row.try_get::<
                            String,
                            _
                        >(
                            "evaluator_version"
                        )?,
                },

                "rubric": {
                    "name":
                        row.try_get::<
                            String,
                            _
                        >(
                            "rubric_name"
                        )?,

                    "version":
                        row.try_get::<
                            String,
                            _
                        >(
                            "rubric_version"
                        )?,
                },

                "evidence_class":
                    row.try_get::<
                        String,
                        _
                    >(
                        "evidence_class"
                    )?,

                "evidence_hash":
                    row.try_get::<
                        String,
                        _
                    >(
                        "evidence_hash"
                    )?,

                "score":
                    row.try_get::<
                        f64,
                        _
                    >("score")?,

                "passed":
                    row.try_get::<
                        bool,
                        _
                    >("passed")?,

                "components":
                    serde_json::from_str::<
                        Value
                    >(
                        &components_text
                    )
                    .unwrap_or(
                        Value::Null
                    ),

                "artifact":
                    serde_json::from_str::<
                        Value
                    >(
                        &artifact_text
                    )
                    .unwrap_or(
                        Value::Null
                    ),

                "artifact_hash":
                    row.try_get::<
                        String,
                        _
                    >(
                        "artifact_hash"
                    )?,

                "created_at":
                    row.try_get::<
                        String,
                        _
                    >("created_at")?,
            })
        }
        else {
            Value::Null
        };

    Ok(Some(json!({
        "id": id,
        "status":
            public_run_status(&status),
        "decision": decision,
        "provider": provider,
        "evaluation": evaluation,

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


fn policy_strategy_valid(
    strategy: &str,
) -> bool {
    matches!(
        strategy,
        "direct"
            | "retrieve_first"
            | "decompose_verify"
            | "cautious_verify"
    )
}


fn validate_policy_selection(
    body: &Value,
) -> bool {
    let Some(policy) =
        body.get("policy_selection")
            .and_then(Value::as_object)
    else {
        return false;
    };

    let identity_valid =
        policy.get("policy_name")
            .and_then(Value::as_str)
            == Some(
                "kiyt-cognitive-strategy"
            )
        &&
        policy.get("policy_version")
            .and_then(Value::as_str)
            == Some("v1")
        &&
        policy.get("learner_name")
            .and_then(Value::as_str)
            == Some("mabwiser-linucb")
        &&
        policy.get("learner_version")
            .and_then(Value::as_str)
            == Some("2.7.4");

    if !identity_valid {
        return false;
    }

    let Some(strategy) =
        policy.get("strategy")
            .and_then(Value::as_str)
    else {
        return false;
    };

    if !policy_strategy_valid(
        strategy
    ) {
        return false;
    }

    if !matches!(
        policy.get("mode")
            .and_then(Value::as_str),
        Some("cold_start")
            | Some("linucb")
    ) {
        return false;
    }

    let Some(context_vector) =
        policy.get("context_vector")
            .and_then(Value::as_array)
    else {
        return false;
    };

    if context_vector.len() != 8
        || !context_vector.iter().all(
            |value| {
                value.as_f64()
                    .map(f64::is_finite)
                    .unwrap_or(false)
            }
        )
    {
        return false;
    }

    let Some(expectations) =
        policy.get("expectations")
            .and_then(Value::as_object)
    else {
        return false;
    };

    if expectations.len() != 4 {
        return false;
    }

    for arm in [
        "direct",
        "retrieve_first",
        "decompose_verify",
        "cautious_verify",
    ] {
        let Some(value) =
            expectations.get(arm)
        else {
            return false;
        };

        if !value.is_null()
            && !value.as_f64()
                .map(f64::is_finite)
                .unwrap_or(false)
        {
            return false;
        }
    }

    let revision_valid =
        policy.get("snapshot_revision")
            .and_then(Value::as_i64)
            .map(|value| value >= 0)
            .unwrap_or(false);

    let history_valid =
        policy.get("history_count")
            .and_then(Value::as_i64)
            .map(|value| value >= 0)
            .unwrap_or(false);

    revision_valid
        && history_valid
}


async fn load_policy_state(
    state: &AppState,
    workspace_id: &str,
) -> Result<Value, sqlx::Error> {
    let rows =
        sqlx::query(
            r#"
            SELECT
                strategy,
                reward,
                context_vector_json::text
                    AS context_vector_json
            FROM policy_learning_events
            WHERE workspace_id = $1
              AND policy_name =
                  'kiyt-cognitive-strategy'
              AND policy_version = 'v1'
              AND learner_name =
                  'mabwiser-linucb'
              AND learner_version =
                  '2.7.4'
              AND applied = true
            ORDER BY
                created_at ASC,
                id ASC
            "#,
        )
        .bind(workspace_id)
        .fetch_all(&state.db)
        .await?;

    let mut history =
        Vec::with_capacity(
            rows.len()
        );

    for row in rows {
        let strategy: String =
            row.try_get("strategy")?;

        let reward: f64 =
            row.try_get("reward")?;

        let context_text: String =
            row.try_get(
                "context_vector_json"
            )?;

        let context_vector =
            serde_json::from_str::<Value>(
                &context_text
            )
            .unwrap_or(Value::Null);

        history.push(
            json!({
                "strategy":
                    strategy,
                "reward":
                    reward,
                "context_vector":
                    context_vector,
            })
        );
    }

    let revision =
        sqlx::query_scalar::<_, i64>(
            r#"
            SELECT revision
            FROM policy_snapshots
            WHERE workspace_id = $1
              AND policy_name =
                  'kiyt-cognitive-strategy'
              AND policy_version = 'v1'
            LIMIT 1
            "#,
        )
        .bind(workspace_id)
        .fetch_optional(&state.db)
        .await?
        .unwrap_or(0);

    Ok(
        json!({
            "policy_name":
                "kiyt-cognitive-strategy",

            "policy_version":
                "v1",

            "learner_name":
                "mabwiser-linucb",

            "learner_version":
                "2.7.4",

            "snapshot_revision":
                revision,

            "history":
                history,
        })
    )
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

    let policy =
        body.get("policy_selection")
            .expect(
                "policy selection validated"
            );

    let policy_name =
        policy.get("policy_name")
            .and_then(Value::as_str)
            .expect(
                "policy name validated"
            );

    let policy_version =
        policy.get("policy_version")
            .and_then(Value::as_str)
            .expect(
                "policy version validated"
            );

    let learner_name =
        policy.get("learner_name")
            .and_then(Value::as_str)
            .expect(
                "learner name validated"
            );

    let learner_version =
        policy.get("learner_version")
            .and_then(Value::as_str)
            .expect(
                "learner version validated"
            );

    let strategy =
        policy.get("strategy")
            .and_then(Value::as_str)
            .expect(
                "strategy validated"
            );

    let policy_mode =
        policy.get("mode")
            .and_then(Value::as_str)
            .expect(
                "policy mode validated"
            );

    let policy_context =
        policy.get("context_vector")
            .expect(
                "policy context validated"
            );

    let policy_expectations =
        policy.get("expectations")
            .expect(
                "policy expectations validated"
            );

    let snapshot_revision =
        policy.get("snapshot_revision")
            .and_then(Value::as_i64)
            .expect(
                "snapshot revision validated"
            );

    let history_count =
        policy.get("history_count")
            .and_then(Value::as_i64)
            .expect(
                "history count validated"
            );

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

    let policy_context_json =
        serde_json::to_string(
            policy_context
        )
        .expect(
            "policy context serialization"
        );

    let policy_expectations_json =
        serde_json::to_string(
            policy_expectations
        )
        .expect(
            "policy expectations serialization"
        );

    let selection_basis =
        format!(
            "kiyt-policy-selection\0v1\0{}\0{}\0{}\0{}\0{}\0{}\0{}\0{}\0{}\0{}",
            operation.workspace_id,
            operation.run_id,
            decision_id,
            policy_name,
            policy_version,
            strategy,
            policy_mode,
            snapshot_revision,
            history_count,
            policy_context_json,
        );

    let selection_hash =
        sha256_hex(
            &format!(
                "{}\0{}",
                selection_basis,
                policy_expectations_json,
            )
        );

    let policy_selection_id =
        deterministic_id(
            "policy_sel",
            &format!(
                "{}:{}:{}",
                decision_id,
                policy_name,
                policy_version,
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

    sqlx::query(
        r#"
        INSERT INTO policy_selections (
            id,
            workspace_id,
            run_id,
            decision_id,
            operation_sequence,
            policy_name,
            policy_version,
            learner_name,
            learner_version,
            strategy,
            mode,
            context_vector_json,
            expectations_json,
            snapshot_revision,
            history_count,
            selection_hash
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
            $10,
            $11,
            $12::jsonb,
            $13::jsonb,
            $14,
            $15,
            $16
        )
        "#,
    )
    .bind(&policy_selection_id)
    .bind(&operation.workspace_id)
    .bind(&operation.run_id)
    .bind(&decision_id)
    .bind(operation.sequence)
    .bind(policy_name)
    .bind(policy_version)
    .bind(learner_name)
    .bind(learner_version)
    .bind(strategy)
    .bind(policy_mode)
    .bind(&policy_context_json)
    .bind(&policy_expectations_json)
    .bind(snapshot_revision)
    .bind(history_count)
    .bind(&selection_hash)
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


async fn ensure_observation_evaluation(
    state: &AppState,
    operation: &ClaimedOperation,
    observation_id: &str,
    decision_id: &str,
    objective: &str,
    decision: &Value,
    observation: &Value,
    available_actions: &Value,
) -> Result<bool, sqlx::Error> {
    let existing =
        sqlx::query_scalar::<_, String>(
            r#"
            SELECT id
            FROM evaluation_events
            WHERE workspace_id = $1
              AND run_id = $2
              AND decision_id = $3
              AND observation_id = $4
              AND evaluator_name =
                  'future-agi-agent-learning-kit'
              AND evaluator_version =
                  '0.3.5'
              AND rubric_version =
                  'v1'
            LIMIT 1
            "#,
        )
        .bind(&operation.workspace_id)
        .bind(&operation.run_id)
        .bind(decision_id)
        .bind(observation_id)
        .fetch_optional(&state.db)
        .await?;

    if existing.is_some() {
        return Ok(true);
    }

    let feedback_row =
        sqlx::query_as::<
            _,
            (
                String,
                i16,
                Option<String>,
            ),
        >(
            r#"
            SELECT
                id,
                rating,
                comment
            FROM feedback_events
            WHERE workspace_id = $1
              AND run_id = $2
              AND decision_id = $3
            ORDER BY
                created_at DESC,
                id DESC
            LIMIT 1
            "#,
        )
        .bind(&operation.workspace_id)
        .bind(&operation.run_id)
        .bind(decision_id)
        .fetch_optional(&state.db)
        .await?;

    let feedback_event_id =
        feedback_row
            .as_ref()
            .map(|value| {
                value.0.clone()
            });

    let feedback_payload =
        match feedback_row.as_ref() {
            Some((
                id,
                rating,
                comment,
            )) => {
                json!({
                    "id": id,
                    "rating": rating,
                    "comment": comment,
                })
            }

            None => Value::Null,
        };

    let evaluation_url = format!(
        "{}/evaluation/evaluate",
        state.runtime_url
            .trim_end_matches('/')
    );

    let evaluation_payload = json!({
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
            decision,

        "observation":
            observation,

        "available_actions":
            available_actions,

        "feedback":
            feedback_payload,
    });

    let response =
        state
            .client
            .post(evaluation_url)
            .timeout(
                Duration::from_secs(75)
            )
            .header(
                "x-kiyt-internal-token",
                &state.internal_token,
            )
            .json(
                &evaluation_payload
            )
            .send()
            .await;

    let response =
        match response {
            Ok(value) => value,

            Err(_) => {
                record_failure(
                    state,
                    operation,
                    "evaluation_transport_failure",
                    true,
                )
                .await?;

                return Ok(false);
            }
        };

    let status =
        response.status();

    let body_text =
        match response.text().await {
            Ok(value) => value,

            Err(_) => {
                record_failure(
                    state,
                    operation,
                    "evaluation_response_read_failure",
                    true,
                )
                .await?;

                return Ok(false);
            }
        };

    if !status.is_success() {
        let parsed =
            serde_json::from_str::<Value>(
                &body_text
            )
            .ok();

        let code =
            parsed
                .as_ref()
                .and_then(|value| {
                    value.pointer(
                        "/detail/code"
                    )
                })
                .and_then(
                    Value::as_str
                )
                .map(str::to_owned)
                .unwrap_or_else(|| {
                    format!(
                        "evaluation_http_{}",
                        status.as_u16()
                    )
                });

        let retryable =
            parsed
                .as_ref()
                .and_then(|value| {
                    value.pointer(
                        "/detail/retryable"
                    )
                })
                .and_then(
                    Value::as_bool
                )
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

        return Ok(false);
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
                    "invalid_evaluation_json",
                    false,
                )
                .await?;

                return Ok(false);
            }
        };

    let identity_valid =
        body.get("workspace_id")
            .and_then(Value::as_str)
            == Some(
                operation.workspace_id
                    .as_str()
            )
        &&
        body.get("run_id")
            .and_then(Value::as_str)
            == Some(
                operation.run_id
                    .as_str()
            )
        &&
        body.get("decision_id")
            .and_then(Value::as_str)
            == Some(decision_id)
        &&
        body.get("observation_id")
            .and_then(Value::as_str)
            == Some(observation_id);

    if !identity_valid {
        record_failure(
            state,
            operation,
            "evaluation_identity_mismatch",
            false,
        )
        .await?;

        return Ok(false);
    }

    let evaluator_name =
        body.pointer(
            "/evaluation/evaluator/name"
        )
        .and_then(Value::as_str)
        .map(str::to_owned);

    let evaluator_version =
        body.pointer(
            "/evaluation/evaluator/version"
        )
        .and_then(Value::as_str)
        .map(str::to_owned);

    let rubric_name =
        body.pointer(
            "/evaluation/rubric/name"
        )
        .and_then(Value::as_str)
        .map(str::to_owned);

    let rubric_version =
        body.pointer(
            "/evaluation/rubric/version"
        )
        .and_then(Value::as_str)
        .map(str::to_owned);

    let evidence_class =
        body.pointer(
            "/evaluation/evidence_class"
        )
        .and_then(Value::as_str)
        .map(str::to_owned);

    let evidence_hash =
        body.pointer(
            "/evaluation/evidence_hash"
        )
        .and_then(Value::as_str)
        .map(str::to_owned);

    let score =
        body.pointer(
            "/evaluation/score"
        )
        .and_then(Value::as_f64);

    let passed =
        body.pointer(
            "/evaluation/passed"
        )
        .and_then(Value::as_bool);

    let components =
        body.pointer(
            "/evaluation/components"
        )
        .cloned()
        .filter(
            Value::is_object
        );

    let artifact =
        body.pointer(
            "/evaluation/artifact"
        )
        .cloned()
        .filter(
            Value::is_object
        );

    let artifact_hash =
        body.pointer(
            "/evaluation/artifact_hash"
        )
        .and_then(Value::as_str)
        .map(str::to_owned);

    let (
        Some(evaluator_name),
        Some(evaluator_version),
        Some(rubric_name),
        Some(rubric_version),
        Some(evidence_class),
        Some(evidence_hash),
        Some(score),
        Some(passed),
        Some(components),
        Some(artifact),
        Some(artifact_hash),
    ) = (
        evaluator_name,
        evaluator_version,
        rubric_name,
        rubric_version,
        evidence_class,
        evidence_hash,
        score,
        passed,
        components,
        artifact,
        artifact_hash,
    )
    else {
        record_failure(
            state,
            operation,
            "invalid_evaluation_payload",
            false,
        )
        .await?;

        return Ok(false);
    };

    let valid_hash =
        |value: &str| {
            value.len() == 64
                && value
                    .chars()
                    .all(|character| {
                        character
                            .is_ascii_hexdigit()
                        &&
                        !character
                            .is_ascii_uppercase()
                    })
        };

    if (
        evaluator_name
            != "future-agi-agent-learning-kit"
        || evaluator_version
            != "0.3.5"
        || rubric_name
            != "kiyt-task-evidence"
        || rubric_version
            != "v1"
        || !(
            0.0
            <= score
            && score
                <= 1.0
        )
        || !valid_hash(
            &evidence_hash
        )
        || !valid_hash(
            &artifact_hash
        )
    ) {
        record_failure(
            state,
            operation,
            "invalid_evaluation_contract",
            false,
        )
        .await?;

        return Ok(false);
    }

    let evaluation_id =
        deterministic_id(
            "eval",
            &format!(
                "{}\0{}\0{}\0{}\0{}\0{}\0{}\0{}",
                operation.workspace_id,
                operation.run_id,
                decision_id,
                observation_id,
                evaluator_name,
                evaluator_version,
                rubric_name,
                rubric_version,
            ),
        );

    sqlx::query(
        r#"
        INSERT INTO evaluation_events (
            id,
            workspace_id,
            run_id,
            decision_id,
            observation_id,
            feedback_event_id,
            evaluator_name,
            evaluator_version,
            rubric_name,
            rubric_version,
            evidence_class,
            evidence_hash,
            score,
            passed,
            components_json,
            artifact_json,
            artifact_hash
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
            $10,
            $11,
            $12,
            $13,
            $14,
            $15::jsonb,
            $16::jsonb,
            $17
        )
        ON CONFLICT (
            workspace_id,
            run_id,
            decision_id,
            observation_id,
            evaluator_name,
            evaluator_version,
            rubric_version
        )
        DO NOTHING
        "#,
    )
    .bind(&evaluation_id)
    .bind(&operation.workspace_id)
    .bind(&operation.run_id)
    .bind(decision_id)
    .bind(observation_id)
    .bind(feedback_event_id)
    .bind(&evaluator_name)
    .bind(&evaluator_version)
    .bind(&rubric_name)
    .bind(&rubric_version)
    .bind(&evidence_class)
    .bind(&evidence_hash)
    .bind(score)
    .bind(passed)
    .bind(components.to_string())
    .bind(artifact.to_string())
    .bind(&artifact_hash)
    .execute(&state.db)
    .await?;

    let stored_hash =
        sqlx::query_scalar::<_, String>(
            r#"
            SELECT artifact_hash
            FROM evaluation_events
            WHERE workspace_id = $1
              AND run_id = $2
              AND decision_id = $3
              AND observation_id = $4
              AND evaluator_name = $5
              AND evaluator_version = $6
              AND rubric_version = $7
            LIMIT 1
            "#,
        )
        .bind(&operation.workspace_id)
        .bind(&operation.run_id)
        .bind(decision_id)
        .bind(observation_id)
        .bind(&evaluator_name)
        .bind(&evaluator_version)
        .bind(&rubric_version)
        .fetch_one(&state.db)
        .await?;

    if stored_hash
        != artifact_hash
    {
        record_failure(
            state,
            operation,
            "evaluation_artifact_conflict",
            false,
        )
        .await?;

        return Ok(false);
    }

    Ok(true)
}


fn map_reward_v1(
    evidence_class: &str,
    score: f64,
    components: &Value,
) -> (
    bool,
    Option<f64>,
    Option<String>,
    &'static str,
) {
    if !score.is_finite()
        || !(0.0..=1.0).contains(&score)
    {
        return (
            false,
            None,
            None,
            "invalid_evaluation_score",
        );
    }

    let evidence_eligible =
        matches!(
            evidence_class,
            "customer_reported_outcome"
                | "customer_reported_outcome+subjective_feedback"
        );

    let outcome_status =
        components
            .pointer("/outcome/status")
            .and_then(Value::as_str)
            .map(str::to_owned);

    if !evidence_eligible {
        return (
            false,
            None,
            outcome_status,
            "ineligible_evidence_class",
        );
    }

    match outcome_status.as_deref() {
        Some("success") => (
            true,
            Some(score),
            outcome_status,
            "observed_success",
        ),

        Some("failure") => (
            true,
            Some(-score),
            outcome_status,
            "observed_failure",
        ),

        _ => (
            false,
            None,
            outcome_status,
            "unknown_outcome",
        ),
    }
}


async fn ensure_observation_reward(
    state: &AppState,
    operation: &ClaimedOperation,
    observation_id: &str,
    decision_id: &str,
) -> Result<bool, sqlx::Error> {
    let evaluation =
        sqlx::query(
            r#"
            SELECT
                id,
                evidence_class,
                score,
                components_json::text
                    AS components_json,
                artifact_hash
            FROM evaluation_events
            WHERE workspace_id = $1
              AND run_id = $2
              AND decision_id = $3
              AND observation_id = $4
              AND evaluator_name =
                  'future-agi-agent-learning-kit'
              AND evaluator_version =
                  '0.3.5'
              AND rubric_name =
                  'kiyt-task-evidence'
              AND rubric_version =
                  'v1'
            LIMIT 1
            "#,
        )
        .bind(&operation.workspace_id)
        .bind(&operation.run_id)
        .bind(decision_id)
        .bind(observation_id)
        .fetch_optional(&state.db)
        .await?;

    let Some(evaluation) = evaluation
    else {
        record_failure(
            state,
            operation,
            "reward_evaluation_not_found",
            true,
        )
        .await?;

        return Ok(false);
    };

    let evaluation_event_id: String =
        evaluation.try_get("id")?;

    let evidence_class: String =
        evaluation.try_get(
            "evidence_class"
        )?;

    let evaluation_score: f64 =
        evaluation.try_get("score")?;

    let components_text: String =
        evaluation.try_get(
            "components_json"
        )?;

    let source_artifact_hash: String =
        evaluation.try_get(
            "artifact_hash"
        )?;

    let components =
        match serde_json::from_str::<Value>(
            &components_text
        ) {
            Ok(value)
                if value.is_object() =>
            {
                value
            }

            _ => {
                record_failure(
                    state,
                    operation,
                    "reward_components_invalid",
                    false,
                )
                .await?;

                return Ok(false);
            }
        };

    let (
        eligible,
        reward,
        outcome_status,
        reason_code,
    ) = map_reward_v1(
        &evidence_class,
        evaluation_score,
        &components,
    );

    let reward_text =
        reward
            .map(|value| {
                format!("{value:.17}")
            })
            .unwrap_or_else(|| {
                "null".to_owned()
            });

    let outcome_text =
        outcome_status
            .as_deref()
            .unwrap_or("");

    let reward_basis = format!(
        "kiyt-deterministic-reward\0v1\0{}\0{}\0{}\0{}\0{:.17}\0{}\0{}\0{}",
        evaluation_event_id,
        source_artifact_hash,
        evidence_class,
        outcome_text,
        evaluation_score,
        eligible,
        reward_text,
        reason_code,
    );

    let reward_hash =
        sha256_hex(&reward_basis);

    let reward_event_id =
        deterministic_id(
            "reward",
            &format!(
                "{}:kiyt-deterministic-reward:v1",
                evaluation_event_id
            ),
        );

    let existing =
        sqlx::query_as::<
            _,
            (String, String),
        >(
            r#"
            SELECT
                id,
                reward_hash
            FROM reward_events
            WHERE evaluation_event_id = $1
              AND mapper_name =
                  'kiyt-deterministic-reward'
              AND mapper_version = 'v1'
            LIMIT 1
            "#,
        )
        .bind(&evaluation_event_id)
        .fetch_optional(&state.db)
        .await?;

    if let Some((
        _existing_id,
        existing_hash,
    )) = existing
    {
        if existing_hash == reward_hash {
            return Ok(true);
        }

        record_failure(
            state,
            operation,
            "reward_mapping_conflict",
            false,
        )
        .await?;

        return Ok(false);
    }

    sqlx::query(
        r#"
        INSERT INTO reward_events (
            id,
            workspace_id,
            run_id,
            decision_id,
            observation_id,
            evaluation_event_id,
            mapper_name,
            mapper_version,
            evidence_class,
            outcome_status,
            evaluation_score,
            eligible,
            reward,
            reason_code,
            source_artifact_hash,
            reward_hash
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'kiyt-deterministic-reward',
            'v1',
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14
        )
        ON CONFLICT (
            evaluation_event_id,
            mapper_name,
            mapper_version
        )
        DO NOTHING
        "#,
    )
    .bind(&reward_event_id)
    .bind(&operation.workspace_id)
    .bind(&operation.run_id)
    .bind(decision_id)
    .bind(observation_id)
    .bind(&evaluation_event_id)
    .bind(&evidence_class)
    .bind(&outcome_status)
    .bind(evaluation_score)
    .bind(eligible)
    .bind(reward)
    .bind(reason_code)
    .bind(&source_artifact_hash)
    .bind(&reward_hash)
    .execute(&state.db)
    .await?;

    let persisted_hash =
        sqlx::query_scalar::<_, String>(
            r#"
            SELECT reward_hash
            FROM reward_events
            WHERE evaluation_event_id = $1
              AND mapper_name =
                  'kiyt-deterministic-reward'
              AND mapper_version = 'v1'
            LIMIT 1
            "#,
        )
        .bind(&evaluation_event_id)
        .fetch_optional(&state.db)
        .await?;

    match persisted_hash {
        Some(value)
            if value == reward_hash =>
        {
            Ok(true)
        }

        Some(_) => {
            record_failure(
                state,
                operation,
                "reward_mapping_conflict",
                false,
            )
            .await?;

            Ok(false)
        }

        None => {
            record_failure(
                state,
                operation,
                "reward_persistence_failure",
                true,
            )
            .await?;

            Ok(false)
        }
    }
}



async fn ensure_observation_policy_evidence(
    state: &AppState,
    operation: &ClaimedOperation,
    observation_id: &str,
    decision_id: &str,
) -> Result<bool, sqlx::Error> {
    let source =
        sqlx::query(
            r#"
            SELECT
                r.id AS reward_event_id,
                r.evaluation_event_id,
                r.evidence_class,
                r.eligible,
                r.reward,
                r.reward_hash,

                ru.request_hash
                    AS run_request_hash,

                d.reasoning_effort

            FROM reward_events r

            JOIN runs ru
              ON ru.id = r.run_id
             AND ru.workspace_id =
                 r.workspace_id

            JOIN decisions d
              ON d.id = r.decision_id
             AND d.workspace_id =
                 r.workspace_id

            WHERE r.workspace_id = $1
              AND r.run_id = $2
              AND r.decision_id = $3
              AND r.observation_id = $4
              AND r.mapper_name =
                  'kiyt-deterministic-reward'
              AND r.mapper_version = 'v1'

            LIMIT 1
            "#,
        )
        .bind(&operation.workspace_id)
        .bind(&operation.run_id)
        .bind(decision_id)
        .bind(observation_id)
        .fetch_optional(&state.db)
        .await?;

    let Some(source) = source
    else {
        record_failure(
            state,
            operation,
            "policy_evidence_reward_not_found",
            true,
        )
        .await?;

        return Ok(false);
    };

    let reward_event_id: String =
        source.try_get(
            "reward_event_id"
        )?;

    let evaluation_event_id: String =
        source.try_get(
            "evaluation_event_id"
        )?;

    let evidence_class: String =
        source.try_get(
            "evidence_class"
        )?;

    let reward_eligible: bool =
        source.try_get(
            "eligible"
        )?;

    let reward: Option<f64> =
        source.try_get(
            "reward"
        )?;

    let reward_hash: String =
        source.try_get(
            "reward_hash"
        )?;

    let run_request_hash: String =
        source.try_get(
            "run_request_hash"
        )?;

    let reasoning_effort: String =
        source.try_get(
            "reasoning_effort"
        )?;

    if reward_eligible
        != reward.is_some()
    {
        record_failure(
            state,
            operation,
            "policy_evidence_reward_contract",
            false,
        )
        .await?;

        return Ok(false);
    }

    let reward_text =
        reward
            .map(|value| {
                format!("{value:.17}")
            })
            .unwrap_or_else(|| {
                "null".to_owned()
            });

    let basis = format!(
        "kiyt-policy-evidence\0v1\0{}\0{}\0{}\0{}\0{}\0{}\0{}\0{}\0{}",
        reward_event_id,
        evaluation_event_id,
        operation.workspace_id,
        operation.run_id,
        decision_id,
        observation_id,
        evidence_class,
        reward_eligible,
        format!(
            "{}\0{}\0{}\0{}",
            reward_text,
            reward_hash,
            run_request_hash,
            reasoning_effort,
        ),
    );

    let policy_evidence_hash =
        sha256_hex(&basis);

    let event_id =
        deterministic_id(
            "policy_evidence",
            &format!(
                "{}:kiyt-policy-evidence:v1",
                reward_event_id
            ),
        );

    let existing =
        sqlx::query_as::<
            _,
            (String, String),
        >(
            r#"
            SELECT
                id,
                policy_evidence_hash
            FROM policy_evidence_events
            WHERE reward_event_id = $1
              AND ledger_name =
                  'kiyt-policy-evidence'
              AND ledger_version = 'v1'
            LIMIT 1
            "#,
        )
        .bind(&reward_event_id)
        .fetch_optional(&state.db)
        .await?;

    if let Some((
        _existing_id,
        existing_hash,
    )) = existing
    {
        if existing_hash
            == policy_evidence_hash
        {
            return Ok(true);
        }

        record_failure(
            state,
            operation,
            "policy_evidence_conflict",
            false,
        )
        .await?;

        return Ok(false);
    }

    sqlx::query(
        r#"
        INSERT INTO policy_evidence_events (
            id,
            workspace_id,
            run_id,
            decision_id,
            observation_id,
            evaluation_event_id,
            reward_event_id,
            ledger_name,
            ledger_version,
            evidence_class,
            reward_eligible,
            reward,
            reward_hash,
            run_request_hash,
            reasoning_effort,
            policy_evidence_hash
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            'kiyt-policy-evidence',
            'v1',
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14
        )
        ON CONFLICT (
            reward_event_id,
            ledger_name,
            ledger_version
        )
        DO NOTHING
        "#,
    )
    .bind(&event_id)
    .bind(&operation.workspace_id)
    .bind(&operation.run_id)
    .bind(decision_id)
    .bind(observation_id)
    .bind(&evaluation_event_id)
    .bind(&reward_event_id)
    .bind(&evidence_class)
    .bind(reward_eligible)
    .bind(reward)
    .bind(&reward_hash)
    .bind(&run_request_hash)
    .bind(&reasoning_effort)
    .bind(&policy_evidence_hash)
    .execute(&state.db)
    .await?;

    let persisted =
        sqlx::query_scalar::<_, String>(
            r#"
            SELECT policy_evidence_hash
            FROM policy_evidence_events
            WHERE reward_event_id = $1
              AND ledger_name =
                  'kiyt-policy-evidence'
              AND ledger_version = 'v1'
            LIMIT 1
            "#,
        )
        .bind(&reward_event_id)
        .fetch_optional(&state.db)
        .await?;

    match persisted {
        Some(value)
            if value
                == policy_evidence_hash =>
        {
            Ok(true)
        }

        Some(_) => {
            record_failure(
                state,
                operation,
                "policy_evidence_conflict",
                false,
            )
            .await?;

            Ok(false)
        }

        None => {
            record_failure(
                state,
                operation,
                "policy_evidence_persistence_failure",
                true,
            )
            .await?;

            Ok(false)
        }
    }
}



async fn ensure_policy_learning_event(
    state: &AppState,
    operation: &ClaimedOperation,
    observation_id: &str,
    decision_id: &str,
) -> Result<bool, sqlx::Error> {
    let source =
        sqlx::query(
            r#"
            SELECT
                p.id
                    AS policy_evidence_id,

                p.reward_eligible,
                p.reward,
                p.policy_evidence_hash,

                s.id
                    AS policy_selection_id,

                s.strategy,

                s.context_vector_json::text
                    AS context_vector_json,

                s.selection_hash

            FROM policy_evidence_events p

            JOIN policy_selections s
              ON s.workspace_id =
                 p.workspace_id
             AND s.run_id =
                 p.run_id
             AND s.decision_id =
                 p.decision_id
             AND s.policy_name =
                 'kiyt-cognitive-strategy'
             AND s.policy_version =
                 'v1'

            WHERE p.workspace_id = $1
              AND p.run_id = $2
              AND p.decision_id = $3
              AND p.observation_id = $4
              AND p.ledger_name =
                  'kiyt-policy-evidence'
              AND p.ledger_version =
                  'v1'

            LIMIT 1
            "#,
        )
        .bind(&operation.workspace_id)
        .bind(&operation.run_id)
        .bind(decision_id)
        .bind(observation_id)
        .fetch_optional(&state.db)
        .await?;

    //
    // Legacy pre-07D decisions have no
    // policy selection. They continue safely
    // without policy learning.
    //
    let Some(source) = source
    else {
        return Ok(true);
    };

    let policy_evidence_id: String =
        source.try_get(
            "policy_evidence_id"
        )?;

    let reward_eligible: bool =
        source.try_get(
            "reward_eligible"
        )?;

    let reward: Option<f64> =
        source.try_get(
            "reward"
        )?;

    let policy_evidence_hash: String =
        source.try_get(
            "policy_evidence_hash"
        )?;

    let policy_selection_id: String =
        source.try_get(
            "policy_selection_id"
        )?;

    let strategy: String =
        source.try_get(
            "strategy"
        )?;

    let context_vector_json: String =
        source.try_get(
            "context_vector_json"
        )?;

    let selection_hash: String =
        source.try_get(
            "selection_hash"
        )?;

    let applied =
        reward_eligible
        && reward.is_some();

    let applied_reward =
        if applied {
            reward
        } else {
            None
        };

    let reason_code =
        if applied {
            "eligible_reward"
        } else {
            "ineligible_policy_evidence"
        };

    let reward_text =
        applied_reward
            .map(|value| {
                format!("{value:.17}")
            })
            .unwrap_or_else(|| {
                "null".to_owned()
            });

    let update_basis =
        format!(
            "kiyt-policy-learning\\0v1\\0{}\\0{}\\0{}\\0{}\\0{}\\0{}\\0{}",
            policy_evidence_id,
            policy_selection_id,
            policy_evidence_hash,
            selection_hash,
            strategy,
            applied,
            reward_text,
        );

    let update_hash =
        sha256_hex(
            &format!(
                "{}\\0{}",
                update_basis,
                reason_code,
            )
        );

    let event_id =
        deterministic_id(
            "policy_learn",
            &format!(
                "{}:kiyt-cognitive-strategy:v1",
                policy_evidence_id
            ),
        );

    let existing =
        sqlx::query_scalar::<_, String>(
            r#"
            SELECT update_hash
            FROM policy_learning_events
            WHERE policy_evidence_event_id =
                  $1
              AND policy_name =
                  'kiyt-cognitive-strategy'
              AND policy_version =
                  'v1'
            LIMIT 1
            "#,
        )
        .bind(&policy_evidence_id)
        .fetch_optional(&state.db)
        .await?;

    if let Some(existing_hash) =
        existing
    {
        if existing_hash == update_hash {
            return Ok(true);
        }

        record_failure(
            state,
            operation,
            "policy_learning_conflict",
            false,
        )
        .await?;

        return Ok(false);
    }

    let mut tx =
        state.db.begin().await?;

    sqlx::query(
        r#"
        INSERT INTO policy_learning_events (
            id,
            workspace_id,
            run_id,
            decision_id,
            policy_evidence_event_id,
            policy_selection_id,
            policy_name,
            policy_version,
            learner_name,
            learner_version,
            strategy,
            context_vector_json,
            applied,
            reward,
            reason_code,
            update_hash
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            'kiyt-cognitive-strategy',
            'v1',
            'mabwiser-linucb',
            '2.7.4',
            $7,
            $8::jsonb,
            $9,
            $10,
            $11,
            $12
        )
        "#,
    )
    .bind(&event_id)
    .bind(&operation.workspace_id)
    .bind(&operation.run_id)
    .bind(decision_id)
    .bind(&policy_evidence_id)
    .bind(&policy_selection_id)
    .bind(&strategy)
    .bind(&context_vector_json)
    .bind(applied)
    .bind(applied_reward)
    .bind(reason_code)
    .bind(&update_hash)
    .execute(&mut *tx)
    .await?;

    if applied {
        let genesis_hash =
            sha256_hex(
                &format!(
                    "kiyt-policy-snapshot\\0v1\\0genesis\\0{}",
                    operation.workspace_id
                )
            );

        sqlx::query(
            r#"
            INSERT INTO policy_snapshots (
                workspace_id,
                policy_name,
                policy_version,
                learner_name,
                learner_version,
                revision,
                update_count,
                state_hash
            )
            VALUES (
                $1,
                'kiyt-cognitive-strategy',
                'v1',
                'mabwiser-linucb',
                '2.7.4',
                0,
                0,
                $2
            )
            ON CONFLICT (
                workspace_id,
                policy_name,
                policy_version
            )
            DO NOTHING
            "#,
        )
        .bind(&operation.workspace_id)
        .bind(&genesis_hash)
        .execute(&mut *tx)
        .await?;

        let snapshot =
            sqlx::query_as::<
                _,
                (i64, i64, String),
            >(
                r#"
                SELECT
                    revision,
                    update_count,
                    state_hash
                FROM policy_snapshots
                WHERE workspace_id = $1
                  AND policy_name =
                      'kiyt-cognitive-strategy'
                  AND policy_version =
                      'v1'
                FOR UPDATE
                "#,
            )
            .bind(&operation.workspace_id)
            .fetch_one(&mut *tx)
            .await?;

        let next_revision =
            snapshot.0 + 1;

        let next_count =
            snapshot.1 + 1;

        let next_state_hash =
            sha256_hex(
                &format!(
                    "{}\\0{}",
                    snapshot.2,
                    update_hash,
                )
            );

        sqlx::query(
            r#"
            UPDATE policy_snapshots
            SET
                revision = $2,
                update_count = $3,
                state_hash = $4,
                last_learning_event_id =
                    $5,
                updated_at = now()
            WHERE workspace_id = $1
              AND policy_name =
                  'kiyt-cognitive-strategy'
              AND policy_version =
                  'v1'
            "#,
        )
        .bind(&operation.workspace_id)
        .bind(next_revision)
        .bind(next_count)
        .bind(&next_state_hash)
        .bind(&event_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(true)
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
                decision_value.clone(),
            "result":
                observation_value.clone(),
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

        let available_actions =
            payload
                .get(
                    "available_actions"
                )
                .cloned()
                .unwrap_or_else(|| {
                    json!([])
                });

        let evaluation_ready =
            ensure_observation_evaluation(
                state,
                operation,
                &observation_id,
                &decision_id,
                &objective,
                &decision_value,
                &observation_value,
                &available_actions,
            )
            .await?;

        if !evaluation_ready {
            return Ok(());
        }

        let reward_ready =
            ensure_observation_reward(
                state,
                operation,
                &observation_id,
                &decision_id,
            )
            .await?;

        if !reward_ready {
            return Ok(());
        }

        let policy_evidence_ready =
            ensure_observation_policy_evidence(
                state,
                operation,
                &observation_id,
                &decision_id,
            )
            .await?;

        if !policy_evidence_ready {
            return Ok(());
        }

        let policy_learning_ready =
            ensure_policy_learning_event(
                state,
                operation,
                &observation_id,
                &decision_id,
            )
            .await?;

        if !policy_learning_ready {
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

    let policy_state =
        load_policy_state(
            state,
            &operation.workspace_id,
        )
        .await?;

    runtime_object.insert(
        "policy_state".to_string(),
        policy_state,
    );

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

    let policy_valid =
        validate_policy_selection(
            &body
        );

    let expected_policy_revision =
        runtime_payload
            .pointer(
                "/policy_state/snapshot_revision"
            )
            .and_then(Value::as_i64);

    let returned_policy_revision =
        body.pointer(
            "/policy_selection/snapshot_revision"
        )
        .and_then(Value::as_i64);

    let expected_history_count =
        runtime_payload
            .pointer(
                "/policy_state/history"
            )
            .and_then(Value::as_array)
            .map(|value| {
                value.len() as i64
            });

    let returned_history_count =
        body.pointer(
            "/policy_selection/history_count"
        )
        .and_then(Value::as_i64);

    if !policy_valid
        || expected_policy_revision
            != returned_policy_revision
        || expected_history_count
            != returned_history_count
    {
        record_failure(
            state,
            operation,
            "invalid_runtime_policy_selection",
            false,
        )
        .await?;

        return Ok(());
    }

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


#[cfg(test)]
mod reward_mapping_tests {
    use super::*;

    #[test]
    fn success_maps_to_positive_score() {
        let components = json!({
            "outcome": {
                "status": "success"
            }
        });

        let (
            eligible,
            reward,
            outcome,
            reason,
        ) = map_reward_v1(
            "customer_reported_outcome",
            0.8756,
            &components,
        );

        assert!(eligible);

        assert_eq!(
            reward,
            Some(0.8756)
        );

        assert_eq!(
            outcome.as_deref(),
            Some("success")
        );

        assert_eq!(
            reason,
            "observed_success"
        );
    }

    #[test]
    fn failure_maps_to_negative_score() {
        let components = json!({
            "outcome": {
                "status": "failure"
            }
        });

        let (
            eligible,
            reward,
            outcome,
            reason,
        ) = map_reward_v1(
            "customer_reported_outcome",
            0.75,
            &components,
        );

        assert!(eligible);

        assert_eq!(
            reward,
            Some(-0.75)
        );

        assert_eq!(
            outcome.as_deref(),
            Some("failure")
        );

        assert_eq!(
            reason,
            "observed_failure"
        );
    }

    #[test]
    fn subjective_feedback_does_not_change_reward() {
        let components = json!({
            "outcome": {
                "status": "success"
            },
            "feedback": {
                "rating": -1
            }
        });

        let (
            eligible,
            reward,
            _outcome,
            _reason,
        ) = map_reward_v1(
            "customer_reported_outcome+subjective_feedback",
            0.61,
            &components,
        );

        assert!(eligible);

        assert_eq!(
            reward,
            Some(0.61)
        );
    }

    #[test]
    fn unknown_evidence_is_not_eligible() {
        let components = json!({
            "outcome": {
                "status": "unknown"
            }
        });

        let (
            eligible,
            reward,
            _outcome,
            reason,
        ) = map_reward_v1(
            "unverified_evaluator_inference",
            0.99,
            &components,
        );

        assert!(!eligible);
        assert_eq!(reward, None);

        assert_eq!(
            reason,
            "ineligible_evidence_class"
        );
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
