# KIYT

**Cognitive intelligence for your models and agents.**

KIYT is a hosted API for reasoning, persistent memory, reinforcement learning, and adaptive decisions. Connect your existing application or agent while keeping your own models and tools.

[Console](https://console.kiyt.io) · [Documentation](https://console.kiyt.io/docs) · [Website](https://kiyt.io)

## How it works

1. Send a goal, context, and the actions your application can execute.
2. KIYT reasons over the task, memory, and available actions to return a structured decision.
3. Execute the action in your application and report the result back to KIYT.
4. Evaluated outcomes become learning signals that help improve future decision strategies.

## What you get

- **Decisions** — choose the next step using context, memory, and available actions.
- **Memory** — working, episodic, and semantic memory scoped to your workspace.
- **Reinforcement Learning** — learn from evaluated outcomes and rewards to improve decision strategies over time.
- **Adaptive Policy** — continuously refine strategy selection through workspace-scoped online learning.
- **Visibility** — saved runs, decision history, learning outcomes, and Activity Token usage.

## Built for your existing stack

KIYT does not replace your application, models, or tools.

Your system keeps control of execution while KIYT provides the cognitive layer for reasoning, memory, decisions, and learning.

## Get started

Create a workspace and API key in the [console](https://console.kiyt.io), then follow the [quickstart](https://console.kiyt.io/docs/quickstart).

## Project timeline

KIYT changed shape quickly during this hackathon.

- **Days 1–7** — I built the first architecture and learned fast that it was not the right foundation. Instead of forcing it, I rebuilt it.
- **Two days ago** — I started this repository with a cleaner structure, adapting the strongest parts of my private KIYT MVP repository, which was still at a very early stage.
- **Today** — The new architecture works end to end. This hackathon helped me simplify the product, find the right technical direction, and turn KIYT into a working MVP.

## Built During the Project

In the rebuilt repository, the last two days focused on turning KIYT from an early MVP foundation into a working cognitive platform.

- **Cognitive API** — real decision-making through a durable API lifecycle.
- **Persistent Memory** — working, episodic, and semantic memory across runs.
- **Adaptive Learning** — evaluated outcomes, rewards, and workspace-level policy learning.
- **Developer Console** — workspace management, API keys, Playground, runs, usage, and billing visibility.
- **Executable Playground** — guided Easy, Medium, and Hard scenarios using real KIYT API calls.
- **Public API Documentation** — OpenAPI contract, quickstarts, examples, and developer documentation.
- **Production Reliability** — tenant isolation, idempotency, persistence, recovery, and release verification.
- **Global Learning Foundation** — the architecture is now ready for the next phase of KIYT model training and reinforcement learning.

---

[Third-party notices](thirdparty/)
