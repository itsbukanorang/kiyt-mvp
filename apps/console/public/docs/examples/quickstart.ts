import { randomUUID } from "node:crypto";

const API_KEY = process.env.KIYT_API_KEY;
const BASE_URL = (process.env.KIYT_BASE_URL ?? "https://console.kiyt.io/api/v1").replace(/\/+$/, "");

if (!API_KEY) {
  throw new Error("Set KIYT_API_KEY first");
}

async function api(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  idempotencyKey?: string,
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`KIYT HTTP ${response.status}: ${text}`);
  }

  return JSON.parse(text);
}

async function pollReady(runId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const payload = await api("GET", `/runs/${encodeURIComponent(runId)}`);
    const status = payload.run.status as string;

    if (["requires_action", "needs_input", "completed", "failed"].includes(status)) {
      return payload;
    }

    if (!["queued", "running"].includes(status)) {
      throw new Error(`Unexpected run status: ${status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error("Timed out waiting for KIYT run");
}

function lookupOrder(argumentsValue: unknown) {
  if (
    typeof argumentsValue !== "object" ||
    argumentsValue === null ||
    Array.isArray(argumentsValue)
  ) {
    throw new Error("lookup_order arguments must be an object");
  }

  const argumentsObject = argumentsValue as Record<string, unknown>;

  if (
    Object.keys(argumentsObject).length !== 1 ||
    typeof argumentsObject.order_id !== "string"
  ) {
    throw new Error("lookup_order arguments did not match the local contract");
  }

  return {
    order_id: argumentsObject.order_id,
    status: "packed",
    dispatch_ready: true,
  };
}

const suffix = randomUUID();
const created = await api(
  "POST",
  "/runs",
  {
    objective:
      "Confirm whether order ORD-1007 is ready to dispatch. Use the available order lookup before completing.",
    context: { order_id: "ORD-1007" },
    available_actions: [
      {
        name: "lookup_order",
        description: "Look up the current state of an order.",
        input_schema: {
          type: "object",
          properties: { order_id: { type: "string" } },
          required: ["order_id"],
          additionalProperties: false,
        },
      },
    ],
  },
  `quickstart-run-${suffix}`,
);

const runId = created.run_id as string;
console.log(`Created ${runId}`);

let finished = false;

for (let cycle = 1; cycle <= 8; cycle += 1) {
  const payload = await pollReady(runId);
  const run = payload.run;
  const status = run.status as string;

  if (status === "completed") {
    console.log(JSON.stringify(run, null, 2));
    console.log("Run completed.");
    finished = true;
    break;
  }

  if (status === "failed") {
    throw new Error(`Run failed: ${JSON.stringify(run.error)}`);
  }

  const decision = run.decision;
  const decisionId = decision.decision_id as string;

  if (status === "requires_action") {
    const action = decision.action;

    if (action.name !== "lookup_order") {
      throw new Error(`Refusing unknown action: ${action.name}`);
    }

    const output = lookupOrder(action.arguments);
    const observationId = `quickstart-observation-${suffix}-${cycle}`;

    await api(
      "POST",
      `/runs/${encodeURIComponent(runId)}/observations`,
      {
        decision_id: decisionId,
        observation_id: observationId,
        result: { status: "success", output },
      },
      `observation-${suffix}-${cycle}`,
    );

    continue;
  }

  if (status === "needs_input") {
    const inputId = `quickstart-input-${suffix}-${cycle}`;

    await api(
      "POST",
      `/runs/${encodeURIComponent(runId)}/inputs`,
      {
        decision_id: decisionId,
        input_id: inputId,
        data: { order_id: "ORD-1007" },
      },
      `input-${suffix}-${cycle}`,
    );
  }
}

if (!finished) {
  throw new Error("Stopped after 8 decision cycles");
}
