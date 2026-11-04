export type DocHeading = {
  id: string;
  title: string;
};

export type DocMeta = {
  path: string;
  title: string;
  section: string;
  summary: string;
  headings: DocHeading[];
  search: string;
};

export const DOC_PAGES: DocMeta[] = [
  {
    path: "/docs",
    title: "Introduction",
    section: "Getting started",
    summary: "Understand KIYT's cognitive decision API and the customer-owned execution loop.",
    headings: [
      { id: "what-kiyt-does", title: "What KIYT does" },
      { id: "integration-loop", title: "The integration loop" },
      { id: "public-api", title: "Public API" },
      { id: "start-building", title: "Start building" },
    ],
    search: "cognitive decision service objective context available_actions decision action observation input REST HTTPS JSON",
  },
  {
    path: "/docs/quickstart",
    title: "Quickstart",
    section: "Getting started",
    summary: "Create a real run, poll for a decision, and continue it with an observation or missing input.",
    headings: [
      { id: "prerequisites", title: "Prerequisites" },
      { id: "configure", title: "Configure your environment" },
      { id: "run-example", title: "Run the example" },
      { id: "what-happens", title: "What happens" },
      { id: "production-notes", title: "Production notes" },
    ],
    search: "curl bash jq python typescript node quickstart create run poll action observation needs_input input completed",
  },
  {
    path: "/docs/authentication",
    title: "Authentication",
    section: "Getting started",
    summary: "Authenticate server-to-server requests with a workspace-scoped KIYT API key.",
    headings: [
      { id: "bearer-api-key", title: "Bearer API key" },
      { id: "create-a-key", title: "Create a key" },
      { id: "workspace-scope", title: "Workspace scope" },
      { id: "key-safety", title: "Key safety" },
    ],
    search: "Authorization Bearer kiyt_ api key revoked workspace 401 server secret",
  },
  {
    path: "/docs/concepts/runs",
    title: "Runs and lifecycle",
    section: "Core concepts",
    summary: "Learn how an asynchronous KIYT run moves from accepted work to a structured decision.",
    headings: [
      { id: "run-model", title: "Run model" },
      { id: "statuses", title: "Statuses" },
      { id: "decision-envelope", title: "Decision envelope" },
      { id: "polling", title: "Polling" },
    ],
    search: "run lifecycle queued running requires_action needs_input completed failed decision_id reason_summary polling 202",
  },
  {
    path: "/docs/concepts/actions-and-observations",
    title: "Actions and observations",
    section: "Core concepts",
    summary: "Define actions your application can execute and report their real outcomes back to KIYT.",
    headings: [
      { id: "available-actions", title: "Available actions" },
      { id: "requires-action", title: "When KIYT requires an action" },
      { id: "submit-observation", title: "Submit the observation" },
      { id: "execution-safety", title: "Execution safety" },
    ],
    search: "available_actions input_schema action arguments requires_action observation success failure output tool execution",
  },
  {
    path: "/docs/concepts/inputs",
    title: "Providing missing input",
    section: "Core concepts",
    summary: "Continue the same run when KIYT needs additional customer information.",
    headings: [
      { id: "needs-input", title: "needs_input" },
      { id: "input-contract", title: "Input contract" },
      { id: "same-run-continuation", title: "Same-run continuation" },
    ],
    search: "needs_input decision_id input_id data continuation same run clarification",
  },
  {
    path: "/docs/concepts/memory",
    title: "Working, episodic, and semantic memory",
    section: "Core concepts",
    summary: "Understand the integration-level behavior of KIYT memory without depending on private implementation details.",
    headings: [
      { id: "memory-purpose", title: "What memory is for" },
      { id: "memory-types", title: "Memory types" },
      { id: "scope-and-trust", title: "Scope and trust" },
      { id: "integration-guidance", title: "Integration guidance" },
    ],
    search: "memory working episodic semantic workspace persistence recall trust provenance customer provided verified",
  },
  {
    path: "/docs/concepts/evaluation-and-learning",
    title: "Evaluation and adaptive learning",
    section: "Core concepts",
    summary: "See how execution evidence can improve workspace decision strategy without changing your integration contract.",
    headings: [
      { id: "evaluation", title: "Evaluation" },
      { id: "workspace-adaptation", title: "Workspace adaptation" },
      { id: "feedback", title: "Feedback is not outcome proof" },
      { id: "global-learning", title: "Global learning" },
    ],
    search: "evaluation adaptive learning reward evidence workspace strategy feedback outcome global learning planned",
  },
  {
    path: "/docs/guides/connect-your-agent",
    title: "Connect your agent",
    section: "Integration guides",
    summary: "Put KIYT around an existing agent loop while keeping tool execution in your application.",
    headings: [
      { id: "architecture", title: "Architecture" },
      { id: "map-agent-state", title: "Map agent state to KIYT" },
      { id: "dispatch-actions", title: "Dispatch actions safely" },
      { id: "continue-the-run", title: "Continue the run" },
    ],
    search: "agent integration tool loop dispatcher allowed action arguments observation agent framework",
  },
  {
    path: "/docs/guides/use-your-own-model",
    title: "Use KIYT with your model",
    section: "Integration guides",
    summary: "Keep your model for domain work while using KIYT's structured decision output to coordinate next steps.",
    headings: [
      { id: "model-boundary", title: "Model boundary" },
      { id: "integration-pattern", title: "Integration pattern" },
      { id: "context-design", title: "Design context deliberately" },
      { id: "avoid-false-integrations", title: "Avoid false integrations" },
    ],
    search: "own model LLM integration decision layer context domain model provider framework",
  },
  {
    path: "/docs/api-reference/runs/create",
    title: "Create a run",
    section: "API reference",
    summary: "Start asynchronous cognitive work from an objective, context, and optional available actions.",
    headings: [
      { id: "request", title: "Request" },
      { id: "body", title: "Request body" },
      { id: "response", title: "Response" },
      { id: "errors", title: "Errors" },
    ],
    search: "POST /api/v1/runs objective context available_actions Idempotency-Key 202 run_id operation_id",
  },
  {
    path: "/docs/api-reference/runs/retrieve",
    title: "Retrieve a run",
    section: "API reference",
    summary: "Poll a persisted run until KIYT returns a decision or terminal failure.",
    headings: [
      { id: "request", title: "Request" },
      { id: "response", title: "Response" },
      { id: "decision-fields", title: "Decision fields" },
      { id: "errors", title: "Errors" },
    ],
    search: "GET /api/v1/runs/{id} poll run status decision action reason_summary error retryable 404",
  },
  {
    path: "/docs/api-reference/runs/observations",
    title: "Submit an observation",
    section: "API reference",
    summary: "Report the real result of the active customer-executed action and continue the run.",
    headings: [
      { id: "request", title: "Request" },
      { id: "body", title: "Request body" },
      { id: "response", title: "Response" },
      { id: "errors", title: "Errors" },
    ],
    search: "POST observations decision_id observation_id result status success failure output 202 conflict",
  },
  {
    path: "/docs/api-reference/runs/inputs",
    title: "Provide input",
    section: "API reference",
    summary: "Supply missing information for an active needs_input decision and continue the same run.",
    headings: [
      { id: "request", title: "Request" },
      { id: "body", title: "Request body" },
      { id: "response", title: "Response" },
      { id: "errors", title: "Errors" },
    ],
    search: "POST inputs decision_id input_id data needs_input 202 same run conflict",
  },
  {
    path: "/docs/api-reference/runs/feedback",
    title: "Submit feedback",
    section: "API reference",
    summary: "Attach subjective feedback to a run without treating it as objective execution evidence.",
    headings: [
      { id: "request", title: "Request" },
      { id: "body", title: "Request body" },
      { id: "response", title: "Response" },
      { id: "errors", title: "Errors" },
    ],
    search: "POST feedback rating -1 0 1 comment decision_id 201 subjective outcome",
  },
  {
    path: "/docs/errors",
    title: "Errors, idempotency, retries, and limits",
    section: "Operations",
    summary: "Handle API errors, safe retries, duplicate requests, payload limits, and asynchronous runtime failures.",
    headings: [
      { id: "error-shape", title: "Error shape" },
      { id: "http-statuses", title: "HTTP statuses" },
      { id: "idempotency", title: "Idempotency" },
      { id: "runtime-failures", title: "Runtime failures" },
      { id: "implemented-limits", title: "Implemented limits" },
    ],
    search: "400 401 404 409 413 422 503 error reason idempotency retry payload limit provider runtime failure",
  },
  {
    path: "/docs/billing",
    title: "Activity Tokens and billing",
    section: "Operations",
    summary: "Understand KIYT's customer-facing Activity Token usage and public MVP price.",
    headings: [
      { id: "activity-tokens", title: "Activity Tokens" },
      { id: "pricing", title: "Pricing" },
      { id: "what-at-is-not", title: "What AT is not" },
      { id: "view-usage", title: "View usage" },
    ],
    search: "Activity Tokens AT billing pricing $5 1000 usage provider tokens console",
  },
];

export const DOC_SECTIONS = [
  "Getting started",
  "Core concepts",
  "Integration guides",
  "API reference",
  "Operations",
].map((name) => ({
  name,
  pages: DOC_PAGES.filter((page) => page.section === name),
}));

export const DOC_SEARCH_INDEX = DOC_PAGES.flatMap((page) => [
  {
    href: page.path,
    title: page.title,
    detail: page.section,
    search: `${page.title} ${page.summary} ${page.search}`.toLowerCase(),
  },
  ...page.headings.map((heading) => ({
    href: `${page.path}#${heading.id}`,
    title: heading.title,
    detail: page.title,
    search: `${heading.title} ${page.title} ${page.search}`.toLowerCase(),
  })),
]);

export function getDocMeta(path: string) {
  return DOC_PAGES.find((page) => page.path === path);
}

export function getAdjacentDocs(path: string) {
  const index = DOC_PAGES.findIndex((page) => page.path === path);

  return {
    previous: index > 0 ? DOC_PAGES[index - 1] : null,
    next: index >= 0 && index < DOC_PAGES.length - 1 ? DOC_PAGES[index + 1] : null,
  };
}
