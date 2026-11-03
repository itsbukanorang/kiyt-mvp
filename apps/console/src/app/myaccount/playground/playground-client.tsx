"use client";

import type {FormEvent, ReactNode} from "react";
import {useCallback, useEffect, useState} from "react";
import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from "lucide-react";

import {Badge, Card, EmptyState, PageTitle} from "@/components/dashboard/ui";
import {EXAMPLES, HELP, type HelpKey, type PlaygroundExample} from "./playground-data";

type Decision = {
  run_id?: string;
  decision_id?: string;
  status?: string;
  action?: {name?: string; arguments?: unknown} | null;
  reason_summary?: string;
};

type RunState = {
  id: string;
  status: string;
  decision?: Decision | null;
  error?: {code?: string; retryable?: boolean} | null;
};

const PENDING = new Set(["queued", "running"]);
const firstExample = EXAMPLES[0];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pretty = (value: unknown) =>
  value === undefined || value === null ? "—" : JSON.stringify(value, null, 2);

const storageKey = (workspaceId: string) => `kiyt.playground.run:${workspaceId}`;

const statusLabel = (status?: string) => {
  switch (status) {
    case "requires_action": return "ACTION SELECTED";
    case "needs_input": return "INPUT NEEDED";
    case "queued": return "QUEUED";
    case "running": return "REASONING";
    case "completed": return "COMPLETED";
    case "failed": return "FAILED";
    default: return status?.replaceAll("_", " ").toUpperCase() ?? "READY";
  }
};

const tone = (status?: string): "neutral" | "blue" | "green" | "amber" => {
  if (status === "completed") return "green";
  if (status === "queued" || status === "running") return "blue";
  if (status === "requires_action" || status === "needs_input" || status === "failed") return "amber";
  return "neutral";
};

async function readBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : {data: parsed};
  } catch {
    return {error: text};
  }
}

const messageFrom = (body: Record<string, unknown>, fallback: string) =>
  typeof body.error === "string" ? body.error.replaceAll("_", " ") : fallback;

function normalizeRun(raw: unknown): RunState {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.status !== "string") {
    throw new Error("Invalid run response.");
  }

  return {
    id: raw.id,
    status: raw.status,
    decision: isRecord(raw.decision) ? raw.decision as Decision : null,
    error: isRecord(raw.error) ? raw.error as RunState["error"] : null,
  };
}

function Modal({
  title,
  wide = false,
  onClose,
  children,
}: {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="kiyt-modal-backdrop" onMouseDown={onClose}>
      <div
        className={wide ? "kiyt-modal kiyt-modal-wide" : "kiyt-modal"}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="kiyt-modal-header">
          <div>
            <p className="kiyt-modal-kicker">PLAYGROUND HELP</p>
            <h2>{title}</h2>
          </div>
          <button className="kiyt-modal-close" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="kiyt-modal-body">{children}</div>
      </div>
    </div>
  );
}

function HelpButton({open}: {open: () => void}) {
  return (
    <button className="playground-help-button" type="button" onClick={open} aria-label="Open help">
      <CircleHelp size={14} />
    </button>
  );
}

export default function PlaygroundClient() {
  const [selectedExample, setSelectedExample] = useState(firstExample.id);
  const [objective, setObjective] = useState(firstExample.objective);
  const [contextText, setContextText] = useState(pretty(firstExample.context));
  const [actionsText, setActionsText] = useState(pretty(firstExample.actions));
  const [workspaceId, setWorkspaceId] = useState("");
  const [runId, setRunId] = useState("");
  const [run, setRun] = useState<RunState | null>(null);
  const [error, setError] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState<"run" | "observation" | "input" | null>(null);
  const [observationStatus, setObservationStatus] = useState<"success" | "failure">("success");
  const [observationOutput, setObservationOutput] = useState("{}");
  const [inputText, setInputText] = useState("{}");
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [helpKey, setHelpKey] = useState<HelpKey | null>(null);

  const example = EXAMPLES.find((item) => item.id === selectedExample) ?? firstExample;

  const loadRun = useCallback(async (id: string, activeWorkspaceId: string) => {
    const response = await fetch(
      `/api/console/cognitive/runs/${encodeURIComponent(id)}`,
      {cache: "no-store"},
    );

    const body = await readBody(response);

    if (response.status === 404) {
      localStorage.removeItem(storageKey(activeWorkspaceId));
      setRunId("");
      setRun(null);
      throw new Error("Saved run is not available in this workspace.");
    }

    if (!response.ok) throw new Error(messageFrom(body, "Unable to load run."));

    const next = normalizeRun(body.run);
    setRun(next);
    setRunId(next.id);
    setError("");
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/console/workspaces", {cache: "no-store"});
        const body = await readBody(response);

        if (!response.ok) throw new Error(messageFrom(body, "Unable to load workspace."));

        const activeId =
          typeof body.activeWorkspaceId === "string" ? body.activeWorkspaceId : "";

        if (!activeId) throw new Error("No active workspace is available.");
        if (cancelled) return;

        setWorkspaceId(activeId);

        const saved = localStorage.getItem(storageKey(activeId));
        if (saved) {
          setRunId(saved);
          await loadRun(saved, activeId);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to initialize Playground.");
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => {cancelled = true;};
  }, [loadRun]);

  useEffect(() => {
    if (!runId || !workspaceId || !run || !PENDING.has(run.status)) return;

    const timer = window.setTimeout(() => {
      void loadRun(runId, workspaceId).catch((cause) => {
        setError(cause instanceof Error ? cause.message : "Unable to refresh run.");
      });
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [loadRun, run, runId, workspaceId]);

  function applyExample(preset: PlaygroundExample) {
    setSelectedExample(preset.id);
    setObjective(preset.objective);
    setContextText(pretty(preset.context));
    setActionsText(pretty(preset.actions));
    setObservationOutput("{}");
    setInputText("{}");
    setError("");
    setExamplesOpen(false);
  }

  function clearForm() {
    setObjective("");
    setContextText("{}");
    setActionsText("[]");
    setObservationOutput("{}");
    setInputText("{}");
    setError("");
  }

  async function submitRun(event: FormEvent) {
    event.preventDefault();
    if (busy || !workspaceId) return;

    setBusy("run");
    setError("");

    try {
      if (!objective.trim()) throw new Error("Objective is required.");

      const context: unknown = JSON.parse(contextText);
      const availableActions: unknown = JSON.parse(actionsText);

      if (!isRecord(context)) throw new Error("Context must be a JSON object.");
      if (!Array.isArray(availableActions)) throw new Error("Available actions must be a JSON array.");

      const nonce = crypto.randomUUID();
      const response = await fetch("/api/console/cognitive/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `playground-run-${nonce}`,
        },
        body: JSON.stringify({
          objective: objective.trim(),
          context,
          available_actions: availableActions,
        }),
      });

      const body = await readBody(response);
      if (!response.ok) throw new Error(messageFrom(body, "Unable to submit run."));

      const id = typeof body.run_id === "string" ? body.run_id : "";
      if (!id) throw new Error("Run accepted without run_id.");

      localStorage.setItem(storageKey(workspaceId), id);
      setRunId(id);
      setRun({id, status: typeof body.status === "string" ? body.status : "queued"});
      await loadRun(id, workspaceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit run.");
    } finally {
      setBusy(null);
    }
  }

  const decision = run?.decision ?? null;
  const decisionId =
    typeof decision?.decision_id === "string" ? decision.decision_id : "";
  const actionName =
    typeof decision?.action?.name === "string" ? decision.action.name : "—";
  const reason =
    typeof decision?.reason_summary === "string" ? decision.reason_summary : "—";
  const canObserve = run?.status === "requires_action" && Boolean(decisionId);
  const canInput = run?.status === "needs_input" && Boolean(decisionId);

  async function postContinuation(
    kind: "observation" | "input",
    body: Record<string, unknown>,
  ) {
    if (!runId || !workspaceId) return;

    const nonce = crypto.randomUUID();
    const path = kind === "input" ? "inputs" : "observations";

    const response = await fetch(
      `/api/console/cognitive/runs/${encodeURIComponent(runId)}/${path}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `playground-${kind}-${nonce}`,
        },
        body: JSON.stringify(body),
      },
    );

    const payload = await readBody(response);
    if (!response.ok) throw new Error(messageFrom(payload, `Unable to submit ${kind}.`));

    setRun((current) =>
      current ? {...current, status: typeof payload.status === "string" ? payload.status : "queued"} : current
    );

    await loadRun(runId, workspaceId);
  }

  async function submitObservation(event: FormEvent) {
    event.preventDefault();
    if (busy || !canObserve) return;

    setBusy("observation");
    setError("");

    try {
      const output: unknown = JSON.parse(observationOutput);
      const nonce = crypto.randomUUID();

      await postContinuation("observation", {
        decision_id: decisionId,
        observation_id: `pg-${nonce}`,
        result: {status: observationStatus, output},
      });

      setObservationOutput("{}");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit observation.");
    } finally {
      setBusy(null);
    }
  }

  async function submitInput(event: FormEvent) {
    event.preventDefault();
    if (busy || !canInput) return;

    setBusy("input");
    setError("");

    try {
      const data: unknown = JSON.parse(inputText);
      if (!isRecord(data)) throw new Error("Additional input must be a JSON object.");

      const nonce = crypto.randomUUID();

      await postContinuation("input", {
        decision_id: decisionId,
        input_id: `pg-input-${nonce}`,
        data,
      });

      setInputText("{}");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to continue run.");
    } finally {
      setBusy(null);
    }
  }

  const help = helpKey ? HELP[helpKey] : null;

  return (
    <>
      <PageTitle
        title="Playground"
        description="Send real cognitive requests to KIYT and continue the same persisted run."
      >
        <Badge tone={tone(run?.status)}>{statusLabel(run?.status)}</Badge>
      </PageTitle>

      <div className="notice">
        <ShieldCheck size={18} />
        <p>
          KIYT selects the next action. Your application executes business actions
          and reports the result back to KIYT.
        </p>
        <HelpButton open={() => setHelpKey("playground")} />
      </div>

      {error && <div className="notice" role="alert"><p>{error}</p></div>}

      <div className="playground-grid">
        <Card className="form-panel">
          <div className="panel-heading">
            <div>
              <div className="playground-title-row">
                <h2>Cognitive request</h2>
                <HelpButton open={() => setHelpKey("playground")} />
              </div>
              <p>Edit the example freely or choose another scenario.</p>
              <div className="playground-example-badge">
                <span>Current example</span>
                <strong>{example.title}</strong>
              </div>
            </div>

            <div className="playground-panel-actions">
              <button
                type="button"
                className="button playground-small-button"
                onClick={() => setExamplesOpen(true)}
              >
                <BookOpen size={14} />
                Examples
              </button>

              <button
                type="button"
                className="playground-icon-button"
                onClick={clearForm}
                title="Clear form"
                aria-label="Clear form"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <form onSubmit={submitRun}>
            <div className="playground-label-row">
              <label htmlFor="objective">Objective</label>
              <HelpButton open={() => setHelpKey("objective")} />
            </div>

            <textarea
              id="objective"
              rows={4}
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
            />

            <div className="playground-label-row">
              <label htmlFor="context">Context</label>
              <div className="playground-label-tools">
                <span>JSON OBJECT</span>
                <HelpButton open={() => setHelpKey("context")} />
              </div>
            </div>

            <textarea
              id="context"
              rows={10}
              className="code-input"
              value={contextText}
              onChange={(event) => setContextText(event.target.value)}
            />

            <div className="playground-label-row">
              <label htmlFor="actions">Available actions</label>
              <div className="playground-label-tools">
                <span>JSON ARRAY</span>
                <HelpButton open={() => setHelpKey("actions")} />
              </div>
            </div>

            <textarea
              id="actions"
              rows={18}
              className="code-input"
              value={actionsText}
              onChange={(event) => setActionsText(event.target.value)}
            />

            <p className="field-help">
              These are actions your application can execute. KIYT only selects among them.
            </p>

            <button
              className="button primary full-button"
              disabled={Boolean(busy) || initializing || !workspaceId}
            >
              <Terminal size={16} />
              {busy === "run" ? "Submitting..." : "Submit objective"}
            </button>
          </form>
        </Card>

        <div className="results-column">
          <Card className="result-panel">
            <div className="panel-heading">
              <div>
                <div className="playground-title-row">
                  <h2>Decision</h2>
                  <HelpButton open={() => setHelpKey("decision")} />
                </div>
                {runId && <p className="playground-run-meta">{runId}</p>}
              </div>
              <Badge tone={tone(run?.status)}>{statusLabel(run?.status)}</Badge>
            </div>

            {initializing && !run ? (
              <EmptyState kind="loading" title="Restoring Playground" description="Checking this workspace for its last run." />
            ) : !run ? (
              <EmptyState kind="empty" title="Example ready" description="Review the request and submit it when ready." />
            ) : PENDING.has(run.status) ? (
              <EmptyState kind="loading" title={run.status === "queued" ? "Run accepted" : "KIYT is reasoning"} description="Playground is polling the persisted run." />
            ) : run.status === "failed" ? (
              <EmptyState kind="error" title="Run failed" description={run.error?.code?.replaceAll("_", " ") ?? "The runtime reported a failure."} />
            ) : decision ? (
              <>
                <div className="result-fields">
                  <span>Status<strong>{statusLabel(run.status)}</strong></span>
                  <span>Action<strong>{actionName}</strong></span>
                  <span>Decision ID<strong>{decisionId || "—"}</strong></span>
                </div>

                <div className="playground-result-copy">
                  <h3>Arguments</h3>
                  <pre className="playground-code">
                    {decision.action ? pretty(decision.action.arguments) : "—"}
                  </pre>

                  <h3>Reason summary</h3>
                  <p className="playground-reason">{reason}</p>
                </div>
              </>
            ) : (
              <EmptyState title="No decision" description="The run does not currently contain a decision." />
            )}
          </Card>

          {run?.status === "needs_input" ? (
            <Card className="form-panel observation-panel">
              <div className="panel-heading">
                <div>
                  <div className="playground-title-row">
                    <h2>Input needed</h2>
                    <HelpButton open={() => setHelpKey("input")} />
                  </div>
                  <p>KIYT needs another fact before it can safely choose the next step.</p>
                </div>

                <button
                  type="button"
                  className="button playground-small-button"
                  onClick={() => setInputText(pretty(example.inputExample))}
                >
                  <Sparkles size={14} />
                  Use example input
                </button>
              </div>

              <div className="kiyt-needs-input-reason">
                <span>WHY KIYT NEEDS MORE INFORMATION</span>
                <p>{reason}</p>
              </div>

              <form onSubmit={submitInput}>
                <div className="playground-label-row">
                  <label htmlFor="input-json">Additional input</label>
                  <div className="playground-label-tools">
                    <span>JSON OBJECT</span>
                    <HelpButton open={() => setHelpKey("input")} />
                  </div>
                </div>

                <textarea
                  id="input-json"
                  rows={7}
                  className="code-input"
                  value={inputText}
                  disabled={!canInput || Boolean(busy)}
                  onChange={(event) => setInputText(event.target.value)}
                />

                <button className="button primary full-button" disabled={!canInput || Boolean(busy)}>
                  {busy === "input" ? "Continuing..." : "Continue run"}
                  <ArrowRight size={16} />
                </button>
              </form>
            </Card>
          ) : (
            <Card className="form-panel observation-panel">
              <div className="panel-heading">
                <div>
                  <div className="playground-title-row">
                    <h2>Observation</h2>
                    <HelpButton open={() => setHelpKey("observation")} />
                  </div>
                  <p>Report what actually happened after your application executed the selected action.</p>
                </div>

                <button
                  type="button"
                  className="button playground-small-button"
                  onClick={() => setObservationOutput(pretty(example.observationExample))}
                >
                  <Sparkles size={14} />
                  Use example result
                </button>
              </div>

              <form onSubmit={submitObservation}>
                <label>Result status</label>

                <div className="playground-observation-status">
                  <button
                    type="button"
                    className={observationStatus === "success" ? "button primary" : "button"}
                    disabled={!canObserve || Boolean(busy)}
                    onClick={() => setObservationStatus("success")}
                  >
                    Success
                  </button>

                  <button
                    type="button"
                    className={observationStatus === "failure" ? "button primary" : "button"}
                    disabled={!canObserve || Boolean(busy)}
                    onClick={() => setObservationStatus("failure")}
                  >
                    Failure
                  </button>
                </div>

                <div className="playground-label-row">
                  <label htmlFor="observation-json">Action result</label>
                  <span>JSON</span>
                </div>

                <textarea
                  id="observation-json"
                  rows={7}
                  className="code-input"
                  value={observationOutput}
                  disabled={!canObserve || Boolean(busy)}
                  onChange={(event) => setObservationOutput(event.target.value)}
                />

                <button className="button full-button" disabled={!canObserve || Boolean(busy)}>
                  {busy === "observation" ? "Submitting..." : "Submit observation"}
                  <ArrowRight size={16} />
                </button>
              </form>
            </Card>
          )}
        </div>
      </div>

      {examplesOpen && (
        <Modal title="Choose an example" wide onClose={() => setExamplesOpen(false)}>
          <div className="kiyt-example-grid">
            {EXAMPLES.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={preset.id === selectedExample ? "kiyt-example-card kiyt-example-card-active" : "kiyt-example-card"}
                onClick={() => applyExample(preset)}
              >
                <div className="kiyt-example-card-top">
                  <span className="kiyt-example-chip">{preset.category}</span>
                  {preset.id === selectedExample && <span className="kiyt-example-current">Current</span>}
                </div>

                <h3>{preset.title}</h3>
                <p>{preset.summary}</p>

                <div className="kiyt-example-card-footer">
                  <span>{preset.actions.length} actions</span>
                  <strong>Use example</strong>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {help && (
        <Modal title={help.title} onClose={() => setHelpKey(null)}>
          <div className="kiyt-help-description-box">
            <span className="kiyt-help-box-kicker">DESCRIPTION</span>
            <p>{help.description}</p>
          </div>

          <div className="kiyt-help-bullets-box">
            <span className="kiyt-help-box-kicker">KEY POINTS</span>
            <ul>
              {help.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
          </div>

          <div className="kiyt-help-sample">
            <span>SAMPLE</span>
            <blockquote className="kiyt-help-quote">
              <pre>{help.sample}</pre>
            </blockquote>
          </div>
        </Modal>
      )}
    </>
  );
}
