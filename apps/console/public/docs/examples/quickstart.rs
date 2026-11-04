use reqwest::Client;
use serde_json::{json, Value};
use std::{env, time::Duration};
use tokio::time::sleep;

const DEFAULT_BASE: &str = "https://console.kiyt.io/api/v1";

fn required_env(name: &str) -> Result<String, Box<dyn std::error::Error>> {
    env::var(name).map_err(|_| format!("Set {name} first").into())
}

async fn api(
    client: &Client,
    api_key: &str,
    base: &str,
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
    idempotency_key: Option<&str>,
) -> Result<Value, Box<dyn std::error::Error>> {
    let mut request = client
        .request(method, format!("{base}{path}"))
        .bearer_auth(api_key);

    if let Some(key) = idempotency_key {
        request = request.header("Idempotency-Key", key);
    }

    if let Some(value) = body {
        request = request.json(&value);
    }

    let response = request.send().await?;
    let status = response.status();
    let text = response.text().await?;

    if !status.is_success() {
        return Err(format!("KIYT HTTP {status}: {text}").into());
    }

    Ok(serde_json::from_str(&text)?)
}

async fn poll_ready(
    client: &Client,
    api_key: &str,
    base: &str,
    run_id: &str,
) -> Result<Value, Box<dyn std::error::Error>> {
    for _ in 0..30 {
        let payload = api(
            client,
            api_key,
            base,
            reqwest::Method::GET,
            &format!("/runs/{run_id}"),
            None,
            None,
        )
        .await?;

        let status = payload["run"]["status"]
            .as_str()
            .ok_or("Missing run.status")?;

        if matches!(status, "requires_action" | "needs_input" | "completed" | "failed") {
            return Ok(payload);
        }

        if !matches!(status, "queued" | "running") {
            return Err(format!("Unexpected run status: {status}").into());
        }

        sleep(Duration::from_secs(2)).await;
    }

    Err("Timed out waiting for KIYT run".into())
}

fn lookup_order(arguments: &Value) -> Result<Value, Box<dyn std::error::Error>> {
    let object = arguments
        .as_object()
        .ok_or("lookup_order arguments must be an object")?;

    if object.len() != 1 {
        return Err("lookup_order arguments did not match the local contract".into());
    }

    let order_id = object
        .get("order_id")
        .and_then(Value::as_str)
        .ok_or("lookup_order.order_id must be a string")?;

    Ok(json!({
        "order_id": order_id,
        "status": "packed",
        "dispatch_ready": true
    }))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let api_key = required_env("KIYT_API_KEY")?;
    let base = env::var("KIYT_BASE_URL").unwrap_or_else(|_| DEFAULT_BASE.into());
    let base = base.trim_end_matches('/').to_owned();
    let client = Client::builder().timeout(Duration::from_secs(20)).build()?;
    let suffix = format!("{}-{}", std::process::id(), chrono_like_nonce());

    let created = api(
        &client,
        &api_key,
        &base,
        reqwest::Method::POST,
        "/runs",
        Some(json!({
            "objective": "Confirm whether order ORD-1007 is ready to dispatch. Use the available order lookup before completing.",
            "context": {"order_id": "ORD-1007"},
            "available_actions": [{
                "name": "lookup_order",
                "description": "Look up the current state of an order.",
                "input_schema": {
                    "type": "object",
                    "properties": {"order_id": {"type": "string"}},
                    "required": ["order_id"],
                    "additionalProperties": false
                }
            }]
        })),
        Some(&format!("quickstart-run-{suffix}")),
    )
    .await?;

    let run_id = created["run_id"]
        .as_str()
        .ok_or("Missing run_id")?
        .to_owned();

    println!("Created {run_id}");

    for cycle in 1..=8 {
        let payload = poll_ready(&client, &api_key, &base, &run_id).await?;
        let run = &payload["run"];
        let status = run["status"].as_str().ok_or("Missing run.status")?;

        if status == "completed" {
            println!("{}", serde_json::to_string_pretty(run)?);
            println!("Run completed.");
            return Ok(());
        }

        if status == "failed" {
            return Err(format!("Run failed: {}", run["error"]).into());
        }

        let decision = &run["decision"];
        let decision_id = decision["decision_id"]
            .as_str()
            .ok_or("Missing decision_id")?;

        if status == "requires_action" {
            let action = &decision["action"];
            let action_name = action["name"].as_str().ok_or("Missing action.name")?;

            if action_name != "lookup_order" {
                return Err(format!("Refusing unknown action: {action_name}").into());
            }

            let output = lookup_order(&action["arguments"])?;
            let observation_id = format!("quickstart-observation-{suffix}-{cycle}");
            let idempotency = format!("observation-{suffix}-{cycle}");

            api(
                &client,
                &api_key,
                &base,
                reqwest::Method::POST,
                &format!("/runs/{run_id}/observations"),
                Some(json!({
                    "decision_id": decision_id,
                    "observation_id": observation_id,
                    "result": {"status": "success", "output": output}
                })),
                Some(&idempotency),
            )
            .await?;

            continue;
        }

        if status == "needs_input" {
            let input_id = format!("quickstart-input-{suffix}-{cycle}");
            let idempotency = format!("input-{suffix}-{cycle}");

            api(
                &client,
                &api_key,
                &base,
                reqwest::Method::POST,
                &format!("/runs/{run_id}/inputs"),
                Some(json!({
                    "decision_id": decision_id,
                    "input_id": input_id,
                    "data": {"order_id": "ORD-1007"}
                })),
                Some(&idempotency),
            )
            .await?;
        }
    }

    Err("Stopped after 8 decision cycles".into())
}

fn chrono_like_nonce() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before UNIX_EPOCH")
        .as_nanos()
}
