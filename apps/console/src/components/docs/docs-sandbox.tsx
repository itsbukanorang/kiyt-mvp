"use client";

import { CheckCircle2, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

export type DocsSandboxScenario =
  | "quickstart"
  | "create-run"
  | "retrieve-run"
  | "observation"
  | "input"
  | "feedback";

type SandboxVariant = {
  id: string;
  label: string;
  summary: string;
  request: string;
  steps: string[];
  status: number;
  response: unknown;
};

type ScenarioConfig = {
  title: string;
  description: string;
  variants: SandboxVariant[];
};

const CONFIG: Record<DocsSandboxScenario, ScenarioConfig> = {
  quickstart: {
    title: "Run the lifecycle locally",
    description:
      "Simulate the KIYT run loop in your browser with deterministic fixtures. No API request, model call, Activity Token, or API key is used.",
    variants: [
      {
        id: "action-path",
        label: "Action path",
        summary: "queued → requires_action → observation → completed",
        request: `POST /api/v1/runs\n{\n  "objective": "Confirm whether order ORD-1007 is ready to dispatch.",\n  "context": {"order_id": "ORD-1007"},\n  "available_actions": [{"name": "lookup_order"}]\n}`,
        steps: [
          "POST /runs returns 202 queued.",
          "Polling reaches requires_action with lookup_order({ order_id: \"ORD-1007\" }).",
          "The browser fixture executes the customer-owned lookup_order test tool.",
          "The simulated observation is accepted and the same run continues.",
          "Polling reaches completed with a deterministic final decision.",
        ],
        status: 200,
        response: {
          run: {
            id: "run_test_order_1007",
            status: "completed",
            decision: {
              status: "completed",
              action: null,
              reason_summary: "Order ORD-1007 is packed and ready to dispatch.",
              run_id: "run_test_order_1007",
              decision_id: "dec_test_02",
            },
            error: null,
          },
          sandbox: { local: true, activity_tokens: 0 },
        },
      },
      {
        id: "input-path",
        label: "Needs input",
        summary: "queued → needs_input → input → completed",
        request: `POST /api/v1/runs\n{\n  "objective": "Check an order before dispatch.",\n  "context": {},\n  "available_actions": [{"name": "lookup_order"}]\n}`,
        steps: [
          "POST /runs returns 202 queued.",
          "Polling reaches needs_input because order_id is missing.",
          "The fixture supplies { order_id: \"ORD-1007\" } through the input continuation.",
          "The same simulated run resumes and completes.",
        ],
        status: 200,
        response: {
          run: {
            id: "run_test_missing_input",
            status: "completed",
            decision: {
              status: "completed",
              action: null,
              reason_summary: "The required order identifier was supplied and the test flow completed.",
              run_id: "run_test_missing_input",
              decision_id: "dec_test_input_02",
            },
            error: null,
          },
          sandbox: { local: true, activity_tokens: 0 },
        },
      },
    ],
  },
  "create-run": {
    title: "Test create run",
    description: "Preview accepted, replay, and conflict behavior locally without creating a real run.",
    variants: [
      {
        id: "accepted",
        label: "202 Accepted",
        summary: "A fresh idempotent mutation is accepted.",
        request: `POST /api/v1/runs\nIdempotency-Key: demo-create-001\n\n{\n  "objective": "Confirm order readiness",\n  "context": {"order_id": "ORD-1007"},\n  "available_actions": [{"name": "lookup_order"}]\n}`,
        steps: ["Validate the request fixture.", "Persist a simulated run and operation.", "Return the accepted envelope."],
        status: 202,
        response: {
          run_id: "run_test_create_001",
          operation_id: "op_test_create_001",
          status: "queued",
          idempotent_replay: false,
          run: { id: "run_test_create_001", status: "queued" },
        },
      },
      {
        id: "replay",
        label: "Idempotent replay",
        summary: "The same key plus the same normalized payload replays the same logical mutation.",
        request: `POST /api/v1/runs\nIdempotency-Key: demo-create-001\n\n{ "objective": "Confirm order readiness", "context": {"order_id": "ORD-1007"} }`,
        steps: ["Match the idempotency key.", "Compare the normalized payload.", "Replay the existing simulated mutation."],
        status: 202,
        response: {
          run_id: "run_test_create_001",
          operation_id: "op_test_create_001",
          status: "queued",
          idempotent_replay: true,
          run: { id: "run_test_create_001", status: "queued" },
        },
      },
      {
        id: "conflict",
        label: "409 Conflict",
        summary: "The same key with a different payload is rejected.",
        request: `POST /api/v1/runs\nIdempotency-Key: demo-create-001\n\n{ "objective": "A different objective" }`,
        steps: ["Match the existing idempotency key.", "Detect a different normalized payload.", "Reject the conflicting retry."],
        status: 409,
        response: { status: "error", reason: "idempotency_key_payload_conflict" },
      },
    ],
  },
  "retrieve-run": {
    title: "Test run states",
    description: "Switch between public lifecycle states using fixed local responses.",
    variants: [
      {
        id: "requires-action",
        label: "Requires action",
        summary: "A decision is ready for a customer-owned action.",
        request: `GET /api/v1/runs/run_test_1007`,
        steps: ["Load the simulated run.", "Expose only the customer-facing decision contract."],
        status: 200,
        response: {
          run: {
            id: "run_test_1007",
            status: "requires_action",
            decision: {
              status: "requires_action",
              action: { name: "lookup_order", arguments: { order_id: "ORD-1007" } },
              reason_summary: "The order state must be checked before completing.",
              run_id: "run_test_1007",
              decision_id: "dec_test_01",
            },
            error: null,
          },
        },
      },
      {
        id: "needs-input",
        label: "Needs input",
        summary: "The run needs structured information from the customer application.",
        request: `GET /api/v1/runs/run_test_missing_input`,
        steps: ["Load the simulated run.", "Return the needs_input decision."],
        status: 200,
        response: {
          run: {
            id: "run_test_missing_input",
            status: "needs_input",
            decision: {
              status: "needs_input",
              action: null,
              reason_summary: "Provide order_id before the run can continue.",
              run_id: "run_test_missing_input",
              decision_id: "dec_test_input_01",
            },
            error: null,
          },
        },
      },
      {
        id: "completed",
        label: "Completed",
        summary: "The run has reached a terminal successful state.",
        request: `GET /api/v1/runs/run_test_completed`,
        steps: ["Load the simulated run.", "Return the completed decision."],
        status: 200,
        response: {
          run: {
            id: "run_test_completed",
            status: "completed",
            decision: {
              status: "completed",
              action: null,
              reason_summary: "The objective is complete.",
              run_id: "run_test_completed",
              decision_id: "dec_test_completed",
            },
            error: null,
          },
        },
      },
    ],
  },
  observation: {
    title: "Test observation continuation",
    description: "Exercise accepted and conflict outcomes using a fixed requires_action run.",
    variants: [
      {
        id: "accepted",
        label: "202 Accepted",
        summary: "A matching observation queues the next operation.",
        request: `POST /api/v1/runs/run_test_1007/observations\nIdempotency-Key: demo-observation-001\n\n{\n  "decision_id": "dec_test_01",\n  "observation_id": "obs_customer_001",\n  "result": {"status": "success", "output": {"dispatch_ready": true}}\n}`,
        steps: ["Validate decision and observation IDs.", "Record the simulated observation.", "Queue the next simulated operation."],
        status: 202,
        response: {
          run_id: "run_test_1007",
          operation_id: "op_test_02",
          status: "queued",
          idempotent_replay: false,
          observation: { id: "obs_customer_001", sequence: 1, decision_id: "dec_test_01", status: "success" },
          run: { id: "run_test_1007", status: "queued" },
        },
      },
      {
        id: "mismatch",
        label: "409 Mismatch",
        summary: "An observation for a different decision is rejected.",
        request: `POST /api/v1/runs/run_test_1007/observations\n\n{ "decision_id": "dec_wrong", "observation_id": "obs_customer_002", "result": {"status": "success"} }`,
        steps: ["Load the active simulated decision.", "Detect the decision ID mismatch.", "Reject the continuation."],
        status: 409,
        response: { status: "error", reason: "observation_decision_mismatch" },
      },
    ],
  },
  input: {
    title: "Test input continuation",
    description: "Exercise a needs_input continuation without resuming real cognition.",
    variants: [
      {
        id: "accepted",
        label: "202 Accepted",
        summary: "Structured missing information queues the next operation.",
        request: `POST /api/v1/runs/run_test_missing_input/inputs\nIdempotency-Key: demo-input-001\n\n{\n  "decision_id": "dec_test_input_01",\n  "input_id": "input_customer_001",\n  "data": {"order_id": "ORD-1007"}\n}`,
        steps: ["Validate the active needs_input decision.", "Record the simulated input.", "Queue the continuation."],
        status: 202,
        response: {
          run_id: "run_test_missing_input",
          operation_id: "op_test_input_02",
          status: "queued",
          idempotent_replay: false,
          input: { id: "input_customer_001", sequence: 1, decision_id: "dec_test_input_01" },
          run: { id: "run_test_missing_input", status: "queued" },
        },
      },
      {
        id: "wrong-state",
        label: "409 Wrong state",
        summary: "Input is rejected when the run is not awaiting input.",
        request: `POST /api/v1/runs/run_test_1007/inputs\n\n{ "decision_id": "dec_test_01", "input_id": "input_customer_002", "data": {"order_id": "ORD-1007"} }`,
        steps: ["Load the simulated run state.", "Detect that it is not needs_input.", "Reject the continuation."],
        status: 409,
        response: { status: "error", reason: "run_not_awaiting_input" },
      },
    ],
  },
  feedback: {
    title: "Test feedback mutation",
    description: "Preview created, replay, and mismatch behavior without writing a feedback event.",
    variants: [
      {
        id: "created",
        label: "201 Created",
        summary: "A valid feedback fixture is accepted.",
        request: `POST /api/v1/runs/run_test_1007/feedback\nIdempotency-Key: demo-feedback-001\n\n{ "rating": 1, "decision_id": "dec_test_01", "comment": "Useful decision." }`,
        steps: ["Validate the rating and decision ID.", "Create a simulated feedback record."],
        status: 201,
        response: {
          idempotent_replay: false,
          feedback: { id: "fb_test_001", run_id: "run_test_1007", decision_id: "dec_test_01", rating: 1 },
        },
      },
      {
        id: "replay",
        label: "200 Replay",
        summary: "The same logical feedback mutation is replayed.",
        request: `POST /api/v1/runs/run_test_1007/feedback\nIdempotency-Key: demo-feedback-001\n\n{ "rating": 1, "decision_id": "dec_test_01", "comment": "Useful decision." }`,
        steps: ["Match the idempotency key and normalized payload.", "Replay the simulated feedback record."],
        status: 200,
        response: {
          idempotent_replay: true,
          feedback: { id: "fb_test_001", run_id: "run_test_1007", decision_id: "dec_test_01", rating: 1 },
        },
      },
      {
        id: "mismatch",
        label: "409 Mismatch",
        summary: "Feedback for a decision outside the run is rejected.",
        request: `POST /api/v1/runs/run_test_1007/feedback\n\n{ "rating": -1, "decision_id": "dec_other" }`,
        steps: ["Load the simulated run.", "Detect that the decision ID does not belong to the run.", "Reject the mutation."],
        status: 409,
        response: { status: "error", reason: "feedback_decision_mismatch" },
      },
    ],
  },
};

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function DocsSandbox({ scenario }: { scenario: DocsSandboxScenario }) {
  const config = CONFIG[scenario];
  const [variantId, setVariantId] = useState(config.variants[0]?.id ?? "");
  const [hasRun, setHasRun] = useState(false);
  const [runCount, setRunCount] = useState(0);

  const variant = useMemo(
    () => config.variants.find((item) => item.id === variantId) ?? config.variants[0],
    [config.variants, variantId],
  );

  if (!variant) return null;

  function chooseVariant(id: string) {
    setVariantId(id);
    setHasRun(false);
  }

  return (
    <div className="docs-sandbox">
      <div className="docs-sandbox-head">
        <div>
          <span className="docs-sandbox-eyebrow">
            <ShieldCheck size={14} aria-hidden="true" />
            Local test sandbox · 0 AT
          </span>
          <h3>{config.title}</h3>
          <p>{config.description}</p>
        </div>
        <span className="docs-sandbox-local">No API key</span>
      </div>

      <div className="docs-sandbox-variants" aria-label="Sandbox test scenario">
        {config.variants.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === variant.id ? "active" : ""}
            onClick={() => chooseVariant(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="docs-sandbox-summary">{variant.summary}</p>

      <div className="docs-sandbox-request">
        <div className="docs-sandbox-code-label">Fixture request</div>
        <pre><code>{variant.request}</code></pre>
      </div>

      <div className="docs-sandbox-actions">
        <button
          type="button"
          className="docs-sandbox-run"
          onClick={() => {
            setRunCount((value) => value + 1);
            setHasRun(true);
          }}
        >
          <Play size={15} aria-hidden="true" />
          Run test
        </button>
        {hasRun && (
          <button type="button" className="docs-sandbox-reset" onClick={() => setHasRun(false)}>
            <RotateCcw size={14} aria-hidden="true" />
            Reset
          </button>
        )}
        <span>Runs locally in this page. No network request is sent to KIYT.</span>
      </div>

      {hasRun && (
        <div className="docs-sandbox-result" key={`${variant.id}-${runCount}`}>
          <div className="docs-sandbox-timeline">
            {variant.steps.map((step, index) => (
              <div key={`${variant.id}-${index}`}>
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>{step}</span>
              </div>
            ))}
          </div>
          <div className="docs-sandbox-response">
            <div className="docs-sandbox-code-label">
              Simulated response <strong>HTTP {variant.status}</strong>
            </div>
            <pre><code>{pretty(variant.response)}</code></pre>
          </div>
        </div>
      )}
    </div>
  );
}
