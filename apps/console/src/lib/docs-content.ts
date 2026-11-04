export type CodeExample = {
  label: string;
  language: "bash" | "python" | "rust" | "typescript" | "json";
  code: string;
};

export type DocBlock =
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "callout"; title: string; text: string; tone?: "note" | "warning" }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "steps"; items: { title: string; text: string }[] }
  | { type: "code"; examples: CodeExample[] }
  | { type: "quickstart-code" }
  | { type: "sandbox"; scenario: "quickstart" | "create-run" | "retrieve-run" | "observation" | "input" | "feedback" }
  | { type: "links"; items: { title: string; description: string; href: string }[] };

export type DocSectionContent = {
  id: string;
  title: string;
  blocks: DocBlock[];
};

export type DocContent = {
  sections: DocSectionContent[];
};

const BASE = "https://console.kiyt.io/api/v1";

const createRunCurl = `curl --fail-with-body -sS \\
  -X POST "$KIYT_BASE_URL/runs" \\
  -H "Authorization: Bearer $KIYT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: run-$(date +%s)" \\
  -d '{
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
  }'`;

const createRunResponse = `{
  "run_id": "run_<generated>",
  "operation_id": "op_<generated>",
  "status": "queued",
  "idempotent_replay": false,
  "run": {
    "id": "run_<generated>",
    "status": "queued"
  }
}`;

const retrieveRunCurl = `curl --fail-with-body -sS \\
  "$KIYT_BASE_URL/runs/$RUN_ID" \\
  -H "Authorization: Bearer $KIYT_API_KEY"`;

const retrieveRunResponse = `{
  "run": {
    "id": "run_<generated>",
    "status": "requires_action",
    "decision": {
      "status": "requires_action",
      "action": {
        "name": "lookup_order",
        "arguments": {"order_id": "ORD-1007"}
      },
      "reason_summary": "The order state must be checked before the objective can be completed.",
      "run_id": "run_<generated>",
      "decision_id": "dec_<generated>"
    },
    "error": null,
    "created_at": "2026-11-04T14:00:00Z",
    "updated_at": "2026-11-04T14:00:02Z",
    "completed_at": null
  }
}`;

const observationCurl = `curl --fail-with-body -sS \\
  -X POST "$KIYT_BASE_URL/runs/$RUN_ID/observations" \\
  -H "Authorization: Bearer $KIYT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: observation-$OBSERVATION_ID" \\
  -d "{
    \\"decision_id\\": \\"$DECISION_ID\\",
    \\"observation_id\\": \\"$OBSERVATION_ID\\",
    \\"result\\": {
      \\"status\\": \\"success\\",
      \\"output\\": {
        \\"order_id\\": \\"ORD-1007\\",
        \\"status\\": \\"packed\\",
        \\"dispatch_ready\\": true
      }
    }
  }"`;

const observationResponse = `{
  "run_id": "run_<generated>",
  "operation_id": "op_<generated>",
  "status": "queued",
  "idempotent_replay": false,
  "observation": {
    "id": "obs_<generated>",
    "sequence": 1,
    "decision_id": "dec_<generated>",
    "status": "success"
  },
  "run": {
    "id": "run_<generated>",
    "status": "queued"
  }
}`;

const inputCurl = `curl --fail-with-body -sS \\
  -X POST "$KIYT_BASE_URL/runs/$RUN_ID/inputs" \\
  -H "Authorization: Bearer $KIYT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: input-$INPUT_ID" \\
  -d "{
    \\"decision_id\\": \\"$DECISION_ID\\",
    \\"input_id\\": \\"$INPUT_ID\\",
    \\"data\\": {
      \\"order_id\\": \\"ORD-1007\\"
    }
  }"`;

const inputResponse = `{
  "run_id": "run_<generated>",
  "operation_id": "op_<generated>",
  "status": "queued",
  "idempotent_replay": false,
  "input": {
    "id": "input_<generated>",
    "sequence": 1,
    "decision_id": "dec_<generated>"
  },
  "run": {
    "id": "run_<generated>",
    "status": "queued"
  }
}`;

const feedbackCurl = `curl --fail-with-body -sS \\
  -X POST "$KIYT_BASE_URL/runs/$RUN_ID/feedback" \\
  -H "Authorization: Bearer $KIYT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: feedback-$(date +%s)" \\
  -d "{
    \\"rating\\": 1,
    \\"decision_id\\": \\"$DECISION_ID\\",
    \\"comment\\": \\"The decision was useful.\\"
  }"`;

const feedbackResponse = `{
  "idempotent_replay": false,
  "feedback": {
    "id": "fb_<generated>",
    "run_id": "run_<generated>",
    "decision_id": "dec_<generated>",
    "rating": 1
  }
}`;


const createRunPython = `import json, os, time
from urllib.request import Request, urlopen

base = os.getenv("KIYT_BASE_URL", "https://console.kiyt.io/api/v1")
key = os.environ["KIYT_API_KEY"]
body = {
    "objective": "Confirm whether order ORD-1007 is ready to dispatch.",
    "context": {"order_id": "ORD-1007"},
    "available_actions": [{
        "name": "lookup_order",
        "description": "Look up the current state of an order.",
        "input_schema": {
            "type": "object",
            "properties": {"order_id": {"type": "string"}},
            "required": ["order_id"],
            "additionalProperties": False,
        },
    }],
}
req = Request(
    f"{base}/runs",
    data=json.dumps(body).encode(),
    method="POST",
    headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Idempotency-Key": f"run-{time.time_ns()}",
    },
)
with urlopen(req, timeout=20) as response:
    print(response.read().decode())`;

const createRunRust = `use reqwest::Client;
use serde_json::json;
use std::{env, time::{SystemTime, UNIX_EPOCH}};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base = env::var("KIYT_BASE_URL")
        .unwrap_or_else(|_| "https://console.kiyt.io/api/v1".into());
    let key = env::var("KIYT_API_KEY")?;
    let idempotency = format!(
        "run-{}",
        SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()
    );

    let response = Client::new()
        .post(format!("{base}/runs"))
        .bearer_auth(key)
        .header("Idempotency-Key", idempotency)
        .json(&json!({
            "objective": "Confirm whether order ORD-1007 is ready to dispatch.",
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
        }))
        .send().await?
        .error_for_status()?;

    println!("{}", response.text().await?);
    Ok(())
}`;

const createRunTypeScript = `import { randomUUID } from "node:crypto";

const base = process.env.KIYT_BASE_URL ?? "https://console.kiyt.io/api/v1";
const key = process.env.KIYT_API_KEY!;

const response = await fetch(\`\${base}/runs\`, {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${key}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": \`run-\${randomUUID()}\`,
  },
  body: JSON.stringify({
    objective: "Confirm whether order ORD-1007 is ready to dispatch.",
    context: { order_id: "ORD-1007" },
    available_actions: [{
      name: "lookup_order",
      description: "Look up the current state of an order.",
      input_schema: {
        type: "object",
        properties: { order_id: { type: "string" } },
        required: ["order_id"],
        additionalProperties: false,
      },
    }],
  }),
});
if (!response.ok) throw new Error(await response.text());
console.log(await response.json());`;

const retrieveRunPython = `import json, os
from urllib.request import Request, urlopen

base = os.getenv("KIYT_BASE_URL", "https://console.kiyt.io/api/v1")
run_id = os.environ["RUN_ID"]
req = Request(
    f"{base}/runs/{run_id}",
    headers={"Authorization": f"Bearer {os.environ['KIYT_API_KEY']}"},
)
with urlopen(req, timeout=20) as response:
    print(json.dumps(json.load(response), indent=2))`;

const retrieveRunRust = `use reqwest::Client;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base = env::var("KIYT_BASE_URL")
        .unwrap_or_else(|_| "https://console.kiyt.io/api/v1".into());
    let run_id = env::var("RUN_ID")?;
    let key = env::var("KIYT_API_KEY")?;

    let body = Client::new()
        .get(format!("{base}/runs/{run_id}"))
        .bearer_auth(key)
        .send().await?
        .error_for_status()?
        .text().await?;

    println!("{body}");
    Ok(())
}`;

const retrieveRunTypeScript = `const base = process.env.KIYT_BASE_URL ?? "https://console.kiyt.io/api/v1";
const runId = process.env.RUN_ID!;
const response = await fetch(\`\${base}/runs/\${encodeURIComponent(runId)}\`, {
  headers: { Authorization: \`Bearer \${process.env.KIYT_API_KEY}\` },
});
if (!response.ok) throw new Error(await response.text());
console.log(await response.json());`;

const observationPython = `import json, os, time
from urllib.request import Request, urlopen

base = os.getenv("KIYT_BASE_URL", "https://console.kiyt.io/api/v1")
run_id = os.environ["RUN_ID"]
body = {
    "decision_id": os.environ["DECISION_ID"],
    "observation_id": f"obs-{time.time_ns()}",
    "result": {
        "status": "success",
        "output": {"order_id": "ORD-1007", "status": "packed", "dispatch_ready": True},
    },
}
req = Request(
    f"{base}/runs/{run_id}/observations",
    data=json.dumps(body).encode(),
    method="POST",
    headers={
        "Authorization": f"Bearer {os.environ['KIYT_API_KEY']}",
        "Content-Type": "application/json",
        "Idempotency-Key": f"observation-{time.time_ns()}",
    },
)
with urlopen(req, timeout=20) as response:
    print(response.read().decode())`;

const observationRust = `use reqwest::Client;
use serde_json::json;
use std::{env, time::{SystemTime, UNIX_EPOCH}};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base = env::var("KIYT_BASE_URL")
        .unwrap_or_else(|_| "https://console.kiyt.io/api/v1".into());
    let run_id = env::var("RUN_ID")?;
    let decision_id = env::var("DECISION_ID")?;
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();

    let response = Client::new()
        .post(format!("{base}/runs/{run_id}/observations"))
        .bearer_auth(env::var("KIYT_API_KEY")?)
        .header("Idempotency-Key", format!("observation-{nonce}"))
        .json(&json!({
            "decision_id": decision_id,
            "observation_id": format!("obs-{nonce}"),
            "result": {
                "status": "success",
                "output": {"order_id": "ORD-1007", "status": "packed", "dispatch_ready": true}
            }
        }))
        .send().await?.error_for_status()?;

    println!("{}", response.text().await?);
    Ok(())
}`;

const observationTypeScript = `import { randomUUID } from "node:crypto";
const base = process.env.KIYT_BASE_URL ?? "https://console.kiyt.io/api/v1";
const id = randomUUID();
const response = await fetch(
  \`\${base}/runs/\${encodeURIComponent(process.env.RUN_ID!)}/observations\`,
  {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.KIYT_API_KEY}\`,
      "Content-Type": "application/json",
      "Idempotency-Key": \`observation-\${id}\`,
    },
    body: JSON.stringify({
      decision_id: process.env.DECISION_ID,
      observation_id: \`obs-\${id}\`,
      result: {
        status: "success",
        output: { order_id: "ORD-1007", status: "packed", dispatch_ready: true },
      },
    }),
  },
);
if (!response.ok) throw new Error(await response.text());
console.log(await response.json());`;

const inputPython = `import json, os, time
from urllib.request import Request, urlopen

base = os.getenv("KIYT_BASE_URL", "https://console.kiyt.io/api/v1")
run_id = os.environ["RUN_ID"]
nonce = time.time_ns()
body = {
    "decision_id": os.environ["DECISION_ID"],
    "input_id": f"input-{nonce}",
    "data": {"order_id": "ORD-1007"},
}
req = Request(
    f"{base}/runs/{run_id}/inputs",
    data=json.dumps(body).encode(),
    method="POST",
    headers={
        "Authorization": f"Bearer {os.environ['KIYT_API_KEY']}",
        "Content-Type": "application/json",
        "Idempotency-Key": f"input-{nonce}",
    },
)
with urlopen(req, timeout=20) as response:
    print(response.read().decode())`;

const inputRust = `use reqwest::Client;
use serde_json::json;
use std::{env, time::{SystemTime, UNIX_EPOCH}};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base = env::var("KIYT_BASE_URL")
        .unwrap_or_else(|_| "https://console.kiyt.io/api/v1".into());
    let run_id = env::var("RUN_ID")?;
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();

    let response = Client::new()
        .post(format!("{base}/runs/{run_id}/inputs"))
        .bearer_auth(env::var("KIYT_API_KEY")?)
        .header("Idempotency-Key", format!("input-{nonce}"))
        .json(&json!({
            "decision_id": env::var("DECISION_ID")?,
            "input_id": format!("input-{nonce}"),
            "data": {"order_id": "ORD-1007"}
        }))
        .send().await?.error_for_status()?;

    println!("{}", response.text().await?);
    Ok(())
}`;

const inputTypeScript = `import { randomUUID } from "node:crypto";
const base = process.env.KIYT_BASE_URL ?? "https://console.kiyt.io/api/v1";
const id = randomUUID();
const response = await fetch(
  \`\${base}/runs/\${encodeURIComponent(process.env.RUN_ID!)}/inputs\`,
  {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.KIYT_API_KEY}\`,
      "Content-Type": "application/json",
      "Idempotency-Key": \`input-\${id}\`,
    },
    body: JSON.stringify({
      decision_id: process.env.DECISION_ID,
      input_id: \`input-\${id}\`,
      data: { order_id: "ORD-1007" },
    }),
  },
);
if (!response.ok) throw new Error(await response.text());
console.log(await response.json());`;

const feedbackPython = `import json, os, time
from urllib.request import Request, urlopen

base = os.getenv("KIYT_BASE_URL", "https://console.kiyt.io/api/v1")
run_id = os.environ["RUN_ID"]
body = {
    "rating": 1,
    "decision_id": os.getenv("DECISION_ID"),
    "comment": "The decision was useful.",
}
req = Request(
    f"{base}/runs/{run_id}/feedback",
    data=json.dumps(body).encode(),
    method="POST",
    headers={
        "Authorization": f"Bearer {os.environ['KIYT_API_KEY']}",
        "Content-Type": "application/json",
        "Idempotency-Key": f"feedback-{time.time_ns()}",
    },
)
with urlopen(req, timeout=20) as response:
    print(response.read().decode())`;

const feedbackRust = `use reqwest::Client;
use serde_json::json;
use std::{env, time::{SystemTime, UNIX_EPOCH}};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base = env::var("KIYT_BASE_URL")
        .unwrap_or_else(|_| "https://console.kiyt.io/api/v1".into());
    let run_id = env::var("RUN_ID")?;
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();

    let response = Client::new()
        .post(format!("{base}/runs/{run_id}/feedback"))
        .bearer_auth(env::var("KIYT_API_KEY")?)
        .header("Idempotency-Key", format!("feedback-{nonce}"))
        .json(&json!({
            "rating": 1,
            "decision_id": env::var("DECISION_ID").ok(),
            "comment": "The decision was useful."
        }))
        .send().await?.error_for_status()?;

    println!("{}", response.text().await?);
    Ok(())
}`;

const feedbackTypeScript = `import { randomUUID } from "node:crypto";
const base = process.env.KIYT_BASE_URL ?? "https://console.kiyt.io/api/v1";
const response = await fetch(
  \`\${base}/runs/\${encodeURIComponent(process.env.RUN_ID!)}/feedback\`,
  {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.KIYT_API_KEY}\`,
      "Content-Type": "application/json",
      "Idempotency-Key": \`feedback-\${randomUUID()}\`,
    },
    body: JSON.stringify({
      rating: 1,
      decision_id: process.env.DECISION_ID ?? null,
      comment: "The decision was useful.",
    }),
  },
);
if (!response.ok) throw new Error(await response.text());
console.log(await response.json());`;

const createRunExamples: CodeExample[] = [
  { label: "cURL", language: "bash", code: createRunCurl },
  { label: "Python", language: "python", code: createRunPython },
  { label: "Rust", language: "rust", code: createRunRust },
  { label: "TypeScript", language: "typescript", code: createRunTypeScript },
];

const retrieveRunExamples: CodeExample[] = [
  { label: "cURL", language: "bash", code: retrieveRunCurl },
  { label: "Python", language: "python", code: retrieveRunPython },
  { label: "Rust", language: "rust", code: retrieveRunRust },
  { label: "TypeScript", language: "typescript", code: retrieveRunTypeScript },
];

const observationExamples: CodeExample[] = [
  { label: "cURL", language: "bash", code: observationCurl },
  { label: "Python", language: "python", code: observationPython },
  { label: "Rust", language: "rust", code: observationRust },
  { label: "TypeScript", language: "typescript", code: observationTypeScript },
];

const inputExamples: CodeExample[] = [
  { label: "cURL", language: "bash", code: inputCurl },
  { label: "Python", language: "python", code: inputPython },
  { label: "Rust", language: "rust", code: inputRust },
  { label: "TypeScript", language: "typescript", code: inputTypeScript },
];

const feedbackExamples: CodeExample[] = [
  { label: "cURL", language: "bash", code: feedbackCurl },
  { label: "Python", language: "python", code: feedbackPython },
  { label: "Rust", language: "rust", code: feedbackRust },
  { label: "TypeScript", language: "typescript", code: feedbackTypeScript },
];

export const DOC_CONTENT: Record<string, DocContent> = {
  "/docs": {
    sections: [
      {
        id: "what-kiyt-does",
        title: "What KIYT does",
        blocks: [
          { type: "paragraph", text: "KIYT is a hosted cognitive decision service. Your application sends an `objective`, relevant `context`, and the `available_actions` it can execute. KIYT returns a structured next decision while your application remains responsible for executing tools and side effects." },
          { type: "callout", title: "A decision layer, not a tool host", text: "KIYT does not take control of your infrastructure. It selects a next step from the contract you provide, asks for missing information when needed, and receives the real outcome after your application executes an action." },
        ],
      },
      {
        id: "integration-loop",
        title: "The integration loop",
        blocks: [
          { type: "steps", items: [
            { title: "Create a run", text: "Send the objective, context, and available actions to `POST /api/v1/runs`." },
            { title: "Poll the run", text: "The create call is asynchronous. Poll `GET /api/v1/runs/{id}` until a decision is ready." },
            { title: "Handle the decision", text: "Execute a returned action in your application, provide missing input, or accept completion." },
            { title: "Continue the same run", text: "Submit an observation or input, then poll the same run again." },
          ] },
        ],
      },
      {
        id: "public-api",
        title: "Public API",
        blocks: [
          { type: "table", columns: ["Method", "Path", "Purpose"], rows: [
            ["POST", "/api/v1/runs", "Create an asynchronous cognitive run."],
            ["GET", "/api/v1/runs/{id}", "Retrieve status and the latest decision."],
            ["POST", "/api/v1/runs/{id}/observations", "Report the result of an executed action."],
            ["POST", "/api/v1/runs/{id}/inputs", "Supply missing information for `needs_input`."],
            ["POST", "/api/v1/runs/{id}/feedback", "Attach subjective feedback to a run."],
          ] },
          { type: "paragraph", text: `The production base URL is \`${BASE}\`. External clients authenticate with a workspace-scoped Bearer API key.` },
        ],
      },
      {
        id: "start-building",
        title: "Start building",
        blocks: [
          { type: "links", items: [
            { title: "Quickstart", description: "Run the complete action/input continuation loop.", href: "/docs/quickstart" },
            { title: "Authentication", description: "Create and safely use a workspace API key.", href: "/docs/authentication" },
            { title: "API reference", description: "See exact request, response, and error contracts.", href: "/docs/api-reference/runs/create" },
          ] },
        ],
      },
    ],
  },

  "/docs/quickstart": {
    sections: [
      {
        id: "prerequisites",
        title: "Prerequisites",
        blocks: [
          { type: "bullets", items: [
            "A KIYT account and an active workspace.",
            "A KIYT API key created from Console → API Keys.",
            "For cURL: Bash, `curl`, and `jq`.",
            "For Python: Python 3.11+; the example uses only the standard library.",
            "For Rust: stable Rust/Cargo. Add `reqwest` (features `json,rustls-tls`), `serde_json`, and `tokio` (features `macros,rt-multi-thread,time`).",
            "For TypeScript: Node.js 20+ and `tsx` (`npm install --save-dev tsx`).",
          ] },
        ],
      },
      {
        id: "configure",
        title: "Configure your environment",
        blocks: [
          { type: "paragraph", text: "Keep the API key on your application server. The examples read credentials from environment variables and never embed a real key in source." },
          { type: "code", examples: [
            { label: "Bash", language: "bash", code: `export KIYT_API_KEY="kiyt_your_key_here"\nexport KIYT_BASE_URL="${BASE}"` },
          ] },
        ],
      },
      {
        id: "run-example",
        title: "Run the example",
        blocks: [
          { type: "paragraph", text: "Each language implements the same fixture-backed customer tool, creates a real KIYT run, polls with a bound, handles `requires_action` and `needs_input`, submits the continuation, and stops on `completed` or `failed`." },
          { type: "quickstart-code" },
          { type: "sandbox", scenario: "quickstart" },
          { type: "callout", title: "Example tool ownership", text: "The `lookup_order` function is local fixture data owned by the example application. KIYT API calls are real; KIYT never executes that function itself." },
        ],
      },
      {
        id: "what-happens",
        title: "What happens",
        blocks: [
          { type: "steps", items: [
            { title: "POST returns 202", text: "KIYT persists the run and operation before returning an accepted response." },
            { title: "GET exposes the current state", text: "The example polls until the run requires an action, needs input, completes, or fails." },
            { title: "Your code owns execution", text: "Only an explicitly allowed local action is dispatched. Its result is reported as an observation." },
            { title: "Continuation stays on one run", text: "Observations and inputs resume cognition under the original run ID." },
          ] },
        ],
      },
      {
        id: "production-notes",
        title: "Production notes",
        blocks: [
          { type: "bullets", items: [
            "Generate a distinct `Idempotency-Key` for each logical mutation and reuse it only when retrying that same payload.",
            "Use bounded polling with backoff instead of an unbounded tight loop.",
            "Treat action names and arguments as untrusted input: allowlist actions and validate arguments again before execution.",
            "Do not retry a customer side effect merely because a network response was lost. KIYT idempotency does not make your external tool execution exactly once.",
          ] },
        ],
      },
    ],
  },

  "/docs/authentication": {
    sections: [
      {
        id: "bearer-api-key",
        title: "Bearer API key",
        blocks: [
          { type: "paragraph", text: "Every public cognitive API request must include `Authorization: Bearer <KIYT_API_KEY>`. KIYT API keys use the `kiyt_` prefix." },
          { type: "code", examples: [
            { label: "Header", language: "bash", code: `Authorization: Bearer $KIYT_API_KEY` },
          ] },
          { type: "table", columns: ["Failure", "HTTP", "Reason"], rows: [
            ["Header missing", "401", "missing_bearer_token"],
            ["Bearer format invalid", "401", "invalid_bearer_token"],
            ["Key unknown or revoked", "401", "invalid_or_revoked_api_key"],
          ] },
        ],
      },
      {
        id: "create-a-key",
        title: "Create a key",
        blocks: [
          { type: "paragraph", text: "Create keys from the protected `Console → API Keys` page. The secret is displayed when the key is created; store it in your server-side secret manager or deployment environment." },
          { type: "links", items: [
            { title: "Open API Keys", description: "Manage keys for your active workspace.", href: "/myaccount/api-keys" },
          ] },
        ],
      },
      {
        id: "workspace-scope",
        title: "Workspace scope",
        blocks: [
          { type: "paragraph", text: "An external API key is bound to exactly one workspace. KIYT derives the request workspace from the authenticated key. Supplying a workspace identifier in your request does not grant access to another workspace." },
          { type: "callout", title: "Tenant boundary", text: "A run that belongs to another workspace is not exposed through your key. Treat a `404 run_not_found` as not accessible; do not use it to probe tenant data." },
        ],
      },
      {
        id: "key-safety",
        title: "Key safety",
        blocks: [
          { type: "bullets", items: [
            "Never ship a KIYT API key in browser JavaScript, a mobile bundle, or a public repository.",
            "Use separate keys for separate server environments when practical.",
            "Revoke a key immediately if it may have been exposed.",
            "Do not log the full Authorization header.",
          ] },
        ],
      },
    ],
  },

  "/docs/concepts/runs": {
    sections: [
      {
        id: "run-model",
        title: "Run model",
        blocks: [
          { type: "paragraph", text: "A run is the durable unit of cognitive work. Creating a run accepts an objective and persists work before cognition finishes. Observations and missing input continue that same run instead of creating a new conversation." },
          { type: "callout", title: "202 means accepted", text: "`HTTP 202` confirms that work was accepted into the durable lifecycle. It does not mean a decision is ready." },
        ],
      },
      {
        id: "statuses",
        title: "Statuses",
        blocks: [
          { type: "table", columns: ["Status", "Meaning", "Client action"], rows: [
            ["queued", "Work is persisted and waiting to run.", "Poll with bounded backoff."],
            ["running", "Cognition is active.", "Poll with bounded backoff."],
            ["requires_action", "KIYT selected one of your available actions.", "Validate, execute, then submit an observation."],
            ["needs_input", "Required information is missing.", "Submit input for the active decision."],
            ["completed", "The current objective is resolved without another customer action.", "Stop the run loop."],
            ["failed", "The operation could not complete.", "Inspect the run error and its retryable flag."],
          ] },
        ],
      },
      {
        id: "decision-envelope",
        title: "Decision envelope",
        blocks: [
          { type: "code", examples: [
            { label: "Decision", language: "json", code: `{
  "status": "requires_action",
  "action": {
    "name": "lookup_order",
    "arguments": {"order_id": "ORD-1007"}
  },
  "reason_summary": "The order state must be checked before completion.",
  "run_id": "run_<generated>",
  "decision_id": "dec_<generated>"
}` },
          ] },
          { type: "paragraph", text: "`reason_summary` is a concise decision explanation, not hidden chain-of-thought. For `needs_input` and `completed`, `action` is `null`. For `requires_action`, the action name must come from the `available_actions` submitted by the customer." },
        ],
      },
      {
        id: "polling",
        title: "Polling",
        blocks: [
          { type: "paragraph", text: "Use `GET /api/v1/runs/{id}` after create or continuation requests. Poll only while the run is `queued` or `running`; introduce a delay and a local timeout. KIYT does not require streaming or webhooks for the MVP contract." },
        ],
      },
    ],
  },

  "/docs/concepts/actions-and-observations": {
    sections: [
      {
        id: "available-actions",
        title: "Available actions",
        blocks: [
          { type: "paragraph", text: "`available_actions` is the capability boundary supplied by your application. Each action has a unique `name`, an optional `description`, and an optional JSON `input_schema` object." },
          { type: "code", examples: [
            { label: "Action definition", language: "json", code: `{
  "name": "lookup_order",
  "description": "Look up the current state of an order.",
  "input_schema": {
    "type": "object",
    "properties": {
      "order_id": {"type": "string"}
    },
    "required": ["order_id"],
    "additionalProperties": false
  }
}` },
          ] },
          { type: "paragraph", text: "A run may contain zero actions. KIYT must not invent an action name that was not supplied." },
        ],
      },
      {
        id: "requires-action",
        title: "When KIYT requires an action",
        blocks: [
          { type: "paragraph", text: "When `run.decision.status` is `requires_action`, validate the returned `action.name` against your allowlist and validate `action.arguments` against the schema you control. Execute the action only after those checks pass." },
        ],
      },
      {
        id: "submit-observation",
        title: "Submit the observation",
        blocks: [
          { type: "paragraph", text: "An observation binds the execution result to the exact active `decision_id`. Give it a client-generated `observation_id` and report `result.status` as `success` or `failure`." },
          { type: "links", items: [
            { title: "Submit an observation", description: "See the complete request and retry contract.", href: "/docs/api-reference/runs/observations" },
          ] },
        ],
      },
      {
        id: "execution-safety",
        title: "Execution safety",
        blocks: [
          { type: "callout", tone: "warning", title: "Idempotency stops duplicate API mutations, not duplicate side effects", text: "Your tool may have completed even when your process lost a network response. Give customer actions their own safe retry semantics and never assume KIYT can guarantee exactly-once execution in another system." },
        ],
      },
    ],
  },

  "/docs/concepts/inputs": {
    sections: [
      {
        id: "needs-input",
        title: "needs_input",
        blocks: [
          { type: "paragraph", text: "KIYT returns `needs_input` when information required to make a reliable next decision is absent. The decision carries a `decision_id`; `action` is `null`, and the concise `reason_summary` describes why the run cannot continue yet." },
        ],
      },
      {
        id: "input-contract",
        title: "Input contract",
        blocks: [
          { type: "code", examples: [
            { label: "Input", language: "json", code: `{
  "decision_id": "dec_<active>",
  "input_id": "input_customer_001",
  "data": {
    "order_id": "ORD-1007"
  }
}` },
          ] },
          { type: "paragraph", text: "`decision_id` and `input_id` are required non-empty strings up to 128 characters. `data` must be a JSON object." },
        ],
      },
      {
        id: "same-run-continuation",
        title: "Same-run continuation",
        blocks: [
          { type: "paragraph", text: "Post input to `/api/v1/runs/{id}/inputs`. KIYT verifies that the run is still waiting for input and that the decision ID matches the active decision. A successful continuation returns `202`, queues the next operation, and keeps the same run ID." },
        ],
      },
    ],
  },

  "/docs/concepts/memory": {
    sections: [
      {
        id: "memory-purpose",
        title: "What memory is for",
        blocks: [
          { type: "paragraph", text: "KIYT can retain relevant workspace and run context so later decisions do not have to start from zero. Memory supports continuity; it is not a replacement for the authoritative state in your own application." },
        ],
      },
      {
        id: "memory-types",
        title: "Memory types",
        blocks: [
          { type: "table", columns: ["Type", "Integration-level purpose"], rows: [
            ["Working", "Keeps current run objective, plan state, and recent evidence available to the decision loop."],
            ["Episodic", "Retains prior run experiences and outcomes that may be relevant later."],
            ["Semantic", "Retains sourced knowledge with provenance and trust distinctions."],
          ] },
        ],
      },
      {
        id: "scope-and-trust",
        title: "Scope and trust",
        blocks: [
          { type: "bullets", items: [
            "Private memory is scoped to the authenticated workspace.",
            "Recalled content is evidence, not a system instruction that can override the current objective or action contract.",
            "Customer-provided information is not automatically equivalent to independently verified information.",
            "Memory retrieval is relevance-based and is not a guarantee that every prior detail will be returned on every decision.",
          ] },
        ],
      },
      {
        id: "integration-guidance",
        title: "Integration guidance",
        blocks: [
          { type: "paragraph", text: "Send current authoritative facts in `context` when they materially affect the decision. Use observations for real execution outcomes. Do not depend on undocumented memory internals, storage identifiers, or retrieval behavior." },
        ],
      },
    ],
  },

  "/docs/concepts/evaluation-and-learning": {
    sections: [
      {
        id: "evaluation",
        title: "Evaluation",
        blocks: [
          { type: "paragraph", text: "After an action result is reported, KIYT can evaluate outcome evidence associated with that decision. Integration code does not need to call a separate public evaluation endpoint." },
        ],
      },
      {
        id: "workspace-adaptation",
        title: "Workspace adaptation",
        blocks: [
          { type: "paragraph", text: "Eligible evidence can update the decision strategy used inside that workspace for later decisions. The public run, action, observation, and input contract stays the same while strategy selection adapts." },
          { type: "callout", title: "Scoped learning", text: "One workspace's private adaptation does not directly become another workspace's private policy." },
        ],
      },
      {
        id: "feedback",
        title: "Feedback is not outcome proof",
        blocks: [
          { type: "paragraph", text: "The feedback endpoint records a customer rating and optional comment. Subjective feedback can be useful context, but it does not by itself prove that a real-world task succeeded." },
        ],
      },
      {
        id: "global-learning",
        title: "Global learning",
        blocks: [
          { type: "paragraph", text: "Global model-weight learning is a post-MVP release milestone. It is not part of the current customer API contract, and the documentation does not claim automatic global training or guaranteed model improvement from customer usage." },
        ],
      },
    ],
  },

  "/docs/guides/connect-your-agent": {
    sections: [
      {
        id: "architecture",
        title: "Architecture",
        blocks: [
          { type: "paragraph", text: "Keep your existing agent runtime. Add KIYT as a decision boundary around the next-step loop: your agent/application supplies objective and state, KIYT returns a structured decision, and your runtime executes only the customer-owned actions it already supports." },
        ],
      },
      {
        id: "map-agent-state",
        title: "Map agent state to KIYT",
        blocks: [
          { type: "table", columns: ["Your agent", "KIYT field"], rows: [
            ["Current goal", "objective"],
            ["Relevant durable state", "context"],
            ["Tool/function allowlist", "available_actions"],
            ["Tool result", "observation.result"],
            ["Clarification supplied later", "input.data"],
          ] },
        ],
      },
      {
        id: "dispatch-actions",
        title: "Dispatch actions safely",
        blocks: [
          { type: "bullets", items: [
            "Map each KIYT action name to one known local function.",
            "Reject unknown action names even if they appear in a response.",
            "Validate arguments before invoking the local function.",
            "Apply your normal approval, authorization, and side-effect controls.",
          ] },
        ],
      },
      {
        id: "continue-the-run",
        title: "Continue the run",
        blocks: [
          { type: "paragraph", text: "After execution, submit an observation using the active `decision_id`, then resume polling. If KIYT returns `needs_input`, supply an input instead. The runnable Quickstart demonstrates both branches without requiring a KIYT SDK." },
          { type: "links", items: [
            { title: "Run the Quickstart", description: "See the complete customer-owned dispatcher loop.", href: "/docs/quickstart" },
          ] },
        ],
      },
    ],
  },

  "/docs/guides/use-your-own-model": {
    sections: [
      {
        id: "model-boundary",
        title: "Model boundary",
        blocks: [
          { type: "paragraph", text: "Your application can continue using its current model for domain generation, extraction, coding, or conversation. KIYT's public contract is HTTPS/JSON and does not require replacing that model or adopting a specific model provider." },
        ],
      },
      {
        id: "integration-pattern",
        title: "Integration pattern",
        blocks: [
          { type: "steps", items: [
            { title: "Produce domain state", text: "Your model or application prepares the facts needed for the next decision." },
            { title: "Ask KIYT for the next decision", text: "Pass the objective, selected context, and only the actions your application is prepared to execute." },
            { title: "Use the decision", text: "Your application can invoke a tool, ask a user for information, or finish its own flow based on the structured status." },
          ] },
        ],
      },
      {
        id: "context-design",
        title: "Design context deliberately",
        blocks: [
          { type: "paragraph", text: "Prefer concise structured facts over dumping an entire model transcript into `context`. Keep secrets out unless the decision truly requires them, and keep the authoritative state in your own system of record." },
        ],
      },
      {
        id: "avoid-false-integrations",
        title: "Avoid false integrations",
        blocks: [
          { type: "callout", title: "No framework-specific compatibility claim", text: "KIYT does not claim a verified adapter for every agent or model framework. If you wrap the HTTP contract in LangChain, an internal SDK, or another framework, that adapter remains your integration unless KIYT explicitly publishes and tests one." },
        ],
      },
    ],
  },

  "/docs/api-reference/runs/create": {
    sections: [
      {
        id: "request",
        title: "Request",
        blocks: [
          { type: "code", examples: createRunExamples },
          { type: "sandbox", scenario: "create-run" },
          { type: "table", columns: ["Header", "Required", "Value"], rows: [
            ["Authorization", "Yes", "Bearer KIYT API key."],
            ["Content-Type", "Yes", "application/json"],
            ["Idempotency-Key", "Yes", "1–200 printable ASCII characters; reuse only for the same logical request."],
          ] },
        ],
      },
      {
        id: "body",
        title: "Request body",
        blocks: [
          { type: "table", columns: ["Field", "Type", "Required", "Constraints / default"], rows: [
            ["objective", "string", "Yes", "Non-empty after trimming; maximum 20,000 bytes in the current gateway."],
            ["context", "object", "No", "Defaults to `{}`."],
            ["available_actions", "array", "No", "Defaults to `[]`; maximum 100 actions."],
            ["available_actions[].name", "string", "Yes", "Non-empty and unique within the request."],
            ["available_actions[].description", "string", "No", "Human-readable action purpose."],
            ["available_actions[].input_schema", "object", "No", "JSON Schema object used to validate action arguments."],
          ] },
          { type: "callout", title: "Unknown fields", text: "The current gateway normalizes only the documented run fields. Do not use unrecognized fields as policy or instruction channels." },
        ],
      },
      {
        id: "response",
        title: "Response",
        blocks: [
          { type: "paragraph", text: "A new valid run returns `HTTP 202 Accepted`. The fresh response contains a compact `run` summary with `id` and `status`. Poll `GET /api/v1/runs/{id}` for the full persisted run state." },
          { type: "code", examples: [
            { label: "202 Accepted", language: "json", code: createRunResponse },
          ] },
          { type: "paragraph", text: "Replaying the same key and normalized payload returns the same logical run with `idempotent_replay: true`. A replay is `202` while the run is still queued/running and `200` after it has moved beyond pending work. Replay responses may contain the full current run." },
        ],
      },
      {
        id: "errors",
        title: "Errors",
        blocks: [
          { type: "table", columns: ["HTTP", "Reason", "Meaning"], rows: [
            ["400", "missing_idempotency_key / invalid_idempotency_key", "Required idempotency header is absent or invalid."],
            ["401", "authentication reasons", "Bearer key is missing, malformed, unknown, or revoked."],
            ["409", "idempotency_key_payload_conflict", "The same key was reused with a different normalized payload."],
            ["413", "objective_too_large / too_many_available_actions / run_payload_too_large", "Implemented payload bound was exceeded."],
            ["422", "validation reason", "Objective, context, or action definition is invalid."],
            ["503", "run_store_unavailable / operation_store_unavailable", "The gateway could not persist accepted work."],
          ] },
        ],
      },
    ],
  },

  "/docs/api-reference/runs/retrieve": {
    sections: [
      {
        id: "request",
        title: "Request",
        blocks: [
          { type: "paragraph", text: "`GET /api/v1/runs/{id}` requires only Bearer authentication. Do not send an `Idempotency-Key` for this read operation." },
          { type: "code", examples: retrieveRunExamples },
          { type: "sandbox", scenario: "retrieve-run" },
        ],
      },
      {
        id: "response",
        title: "Response",
        blocks: [
          { type: "code", examples: [
            { label: "Decision ready", language: "json", code: retrieveRunResponse },
          ] },
          { type: "callout", title: "Stable integration surface", text: "Build against the documented run, decision, error, and timestamp fields. Clients should ignore response fields they do not recognize rather than depending on undocumented service metadata." },
        ],
      },
      {
        id: "decision-fields",
        title: "Decision fields",
        blocks: [
          { type: "table", columns: ["Field", "Type", "Meaning"], rows: [
            ["run.id", "string", "Durable run identifier."],
            ["run.status", "string", "Current public lifecycle status."],
            ["run.decision.status", "string", "`requires_action`, `needs_input`, or `completed` for a ready decision."],
            ["run.decision.action", "object | null", "Customer action plus validated arguments, or null."],
            ["run.decision.reason_summary", "string", "Concise decision explanation; not chain-of-thought."],
            ["run.decision.decision_id", "string", "Identifier required by observation/input continuation."],
            ["run.error", "object | null", "Failure code plus whether the failure was classified retryable."],
            ["run.created_at / updated_at / completed_at", "timestamp | null", "Persisted lifecycle timestamps."],
          ] },
        ],
      },
      {
        id: "errors",
        title: "Errors",
        blocks: [
          { type: "table", columns: ["HTTP", "Reason", "Meaning"], rows: [
            ["401", "authentication reasons", "API key is not valid for the request."],
            ["404", "run_not_found", "The run does not exist in the authenticated workspace or is not accessible."],
            ["503", "run_store_unavailable", "Run state could not be read."],
          ] },
        ],
      },
    ],
  },

  "/docs/api-reference/runs/observations": {
    sections: [
      {
        id: "request",
        title: "Request",
        blocks: [
          { type: "paragraph", text: "Use this operation only for the active `requires_action` decision. The run and decision must still be waiting for an observation." },
          { type: "code", examples: observationExamples },
          { type: "sandbox", scenario: "observation" },
        ],
      },
      {
        id: "body",
        title: "Request body",
        blocks: [
          { type: "table", columns: ["Field", "Type", "Required", "Constraints"], rows: [
            ["decision_id", "string", "Yes", "Active decision ID; 1–128 characters."],
            ["observation_id", "string", "Yes", "Customer-generated identifier; 1–128 characters."],
            ["result", "object", "Yes", "Execution result object."],
            ["result.status", "string", "Yes", "`success` or `failure`."],
            ["result.output", "any JSON", "No", "Defaults to `{}` when omitted."],
          ] },
          { type: "paragraph", text: "The normalized observation payload is currently limited to 1 MB." },
        ],
      },
      {
        id: "response",
        title: "Response",
        blocks: [
          { type: "paragraph", text: "A fresh accepted continuation returns `HTTP 202` and queues the next operation on the same run. Fresh responses contain a compact `run` summary; an idempotent replay may contain the full current run." },
          { type: "code", examples: [
            { label: "202 Accepted", language: "json", code: observationResponse },
          ] },
        ],
      },
      {
        id: "errors",
        title: "Errors",
        blocks: [
          { type: "table", columns: ["HTTP", "Representative reason", "Recovery"], rows: [
            ["404", "run_not_found", "Check the run ID and authenticated workspace."],
            ["409", "run_not_awaiting_observation", "Refresh the run before submitting."],
            ["409", "observation_decision_mismatch", "Use the active decision ID from the latest run."],
            ["409", "observation_id_already_recorded", "Do not reuse a customer observation ID for a different logical observation."],
            ["409", "continuation_already_exists", "Poll the run; another continuation is already recorded."],
            ["422", "observation_* validation reason", "Fix the request body."],
            ["503", "observation_store_unavailable / operation_store_unavailable", "Retry the same API mutation with the same idempotency key after backoff."],
          ] },
        ],
      },
    ],
  },

  "/docs/api-reference/runs/inputs": {
    sections: [
      {
        id: "request",
        title: "Request",
        blocks: [
          { type: "paragraph", text: "Use this operation only for the active `needs_input` decision. Input resumes cognition on the same durable run." },
          { type: "code", examples: inputExamples },
          { type: "sandbox", scenario: "input" },
        ],
      },
      {
        id: "body",
        title: "Request body",
        blocks: [
          { type: "table", columns: ["Field", "Type", "Required", "Constraints"], rows: [
            ["decision_id", "string", "Yes", "Active decision ID; 1–128 characters."],
            ["input_id", "string", "Yes", "Customer-generated identifier; 1–128 characters."],
            ["data", "object", "Yes", "Structured missing information."],
          ] },
          { type: "paragraph", text: "The normalized input payload is currently limited to 1 MB." },
        ],
      },
      {
        id: "response",
        title: "Response",
        blocks: [
          { type: "code", examples: [
            { label: "202 Accepted", language: "json", code: inputResponse },
          ] },
          { type: "paragraph", text: "Fresh accepted input responses contain a compact `run` summary; an idempotent replay may contain the full current run. Poll `GET /api/v1/runs/{id}` for full run state." },
        ],
      },
      {
        id: "errors",
        title: "Errors",
        blocks: [
          { type: "table", columns: ["HTTP", "Representative reason", "Recovery"], rows: [
            ["404", "run_not_found", "Check the run ID and authenticated workspace."],
            ["409", "run_not_awaiting_input", "Refresh the run before submitting input."],
            ["409", "input_decision_mismatch", "Use the decision ID from the active `needs_input` decision."],
            ["409", "input_already_recorded", "Do not submit the same logical input twice under a different retry key."],
            ["409", "continuation_already_exists", "Poll the run; a continuation is already active."],
            ["422", "input_* validation reason", "Fix identifiers or ensure `data` is an object."],
            ["503", "input_store_unavailable / operation_store_unavailable", "Retry the same API mutation with the same idempotency key after backoff."],
          ] },
        ],
      },
    ],
  },

  "/docs/api-reference/runs/feedback": {
    sections: [
      {
        id: "request",
        title: "Request",
        blocks: [
          { type: "code", examples: feedbackExamples },
          { type: "sandbox", scenario: "feedback" },
          { type: "paragraph", text: "Feedback is a mutation and therefore requires its own `Idempotency-Key`." },
        ],
      },
      {
        id: "body",
        title: "Request body",
        blocks: [
          { type: "table", columns: ["Field", "Type", "Required", "Constraints / default"], rows: [
            ["rating", "integer", "Yes", "Exactly `-1`, `0`, or `1`."],
            ["decision_id", "string | null", "No", "If supplied, must identify a decision in this run; maximum 128 characters."],
            ["comment", "string | null", "No", "Trimmed; empty becomes null; maximum 5,000 characters."],
          ] },
          { type: "paragraph", text: "The normalized feedback payload is currently limited to 100 KB." },
        ],
      },
      {
        id: "response",
        title: "Response",
        blocks: [
          { type: "paragraph", text: "New feedback returns `HTTP 201 Created`. An identical idempotent replay returns `HTTP 200` with `idempotent_replay: true`." },
          { type: "code", examples: [
            { label: "201 Created", language: "json", code: feedbackResponse },
          ] },
        ],
      },
      {
        id: "errors",
        title: "Errors",
        blocks: [
          { type: "table", columns: ["HTTP", "Reason", "Meaning"], rows: [
            ["404", "run_not_found", "Run is not accessible in this workspace."],
            ["409", "feedback_decision_mismatch", "Supplied decision ID does not belong to this run."],
            ["409", "idempotency_key_payload_conflict", "Retry key was reused with different feedback."],
            ["413", "feedback_comment_too_large / feedback_payload_too_large", "Implemented size limit exceeded."],
            ["422", "feedback_* validation reason", "Rating, decision ID, or comment type is invalid."],
            ["503", "feedback_store_unavailable", "Persistence is temporarily unavailable."],
          ] },
        ],
      },
    ],
  },

  "/docs/errors": {
    sections: [
      {
        id: "error-shape",
        title: "Error shape",
        blocks: [
          { type: "paragraph", text: "Gateway validation and persistence errors use a compact JSON envelope." },
          { type: "code", examples: [
            { label: "Error", language: "json", code: `{
  "status": "error",
  "reason": "idempotency_key_payload_conflict"
}` },
          ] },
        ],
      },
      {
        id: "http-statuses",
        title: "HTTP statuses",
        blocks: [
          { type: "table", columns: ["HTTP", "Use"], rows: [
            ["200", "Successful read or completed idempotent replay."],
            ["201", "New feedback record created."],
            ["202", "Asynchronous run or continuation accepted."],
            ["400", "Missing or invalid `Idempotency-Key`."],
            ["401", "Bearer authentication failure."],
            ["404", "Run not found in the authenticated workspace."],
            ["409", "State conflict, stale decision, duplicate logical continuation, or idempotency conflict."],
            ["413", "Implemented payload/field size limit exceeded."],
            ["422", "Request body failed schema/field validation."],
            ["503", "Required gateway persistence/runtime dependency was unavailable for the operation."],
          ] },
        ],
      },
      {
        id: "idempotency",
        title: "Idempotency",
        blocks: [
          { type: "paragraph", text: "Every public mutation requires `Idempotency-Key`. A key must contain 1–200 printable ASCII characters. Scope a fresh key to one logical mutation; if a network retry sends the identical normalized payload, reuse that same key." },
          { type: "callout", tone: "warning", title: "Do not recycle keys", text: "Reusing a key with a different normalized payload returns `409 idempotency_key_payload_conflict`. Idempotency protects KIYT's mutation lifecycle; it does not provide exactly-once guarantees for a side effect executed in your own system." },
        ],
      },
      {
        id: "runtime-failures",
        title: "Runtime failures",
        blocks: [
          { type: "paragraph", text: "Because cognition is asynchronous, a provider or runtime failure can appear later on the persisted run. When `run.status` is `failed`, inspect `run.error.code` and `run.error.retryable`. Do not convert a failed run into success locally or assume that a provider attempt was never billed merely because the client lost a response." },
        ],
      },
      {
        id: "implemented-limits",
        title: "Implemented limits",
        blocks: [
          { type: "table", columns: ["Item", "Current limit"], rows: [
            ["Idempotency-Key", "1–200 printable ASCII characters."],
            ["Run objective", "20,000 bytes."],
            ["Available actions", "100 per run request."],
            ["Normalized run payload", "1,000,000 bytes."],
            ["decision_id / observation_id / input_id", "128 characters each."],
            ["Normalized observation payload", "1,000,000 bytes."],
            ["Normalized input payload", "1,000,000 bytes."],
            ["Feedback comment", "5,000 characters."],
            ["Normalized feedback payload", "100,000 bytes."],
          ] },
          { type: "paragraph", text: "The public MVP documentation does not publish invented request-per-minute limits, retry headers, streaming, webhooks, or pagination behavior that the current cognitive surface does not implement." },
        ],
      },
    ],
  },

  "/docs/billing": {
    sections: [
      {
        id: "activity-tokens",
        title: "Activity Tokens",
        blocks: [
          { type: "paragraph", text: "Activity Tokens (AT) are KIYT's customer-facing unit for recorded service usage. Runs and decisions can consume different amounts of AT depending on the work actually recorded." },
        ],
      },
      {
        id: "pricing",
        title: "Pricing",
        blocks: [
          { type: "callout", title: "$5 / 1,000 AT", text: "The public MVP price is USD $5 for 1,000 Activity Tokens. Billing views use recorded workspace usage rather than a fixed per-run charge." },
        ],
      },
      {
        id: "what-at-is-not",
        title: "What AT is not",
        blocks: [
          { type: "bullets", items: [
            "AT is not the same unit as a model-provider token.",
            "One AT is not documented as a fixed number of provider input/output tokens.",
            "A run does not have a guaranteed fixed AT cost.",
            "Provider credits or supplier balances are not customer AT balances.",
            "The MVP documentation does not invent prepaid expiry, subscriptions, refunds, or automatic payment collection that has not been implemented.",
          ] },
        ],
      },
      {
        id: "view-usage",
        title: "View usage",
        blocks: [
          { type: "paragraph", text: "Open the protected Billing and Runs pages in Console to see the customer-visible recorded usage for your active workspace." },
          { type: "links", items: [
            { title: "Billing", description: "View workspace Activity Token usage and public pricing.", href: "/myaccount/billing" },
            { title: "Runs", description: "Inspect customer-safe run history and usage.", href: "/myaccount/runs" },
          ] },
        ],
      },
    ],
  },
};
