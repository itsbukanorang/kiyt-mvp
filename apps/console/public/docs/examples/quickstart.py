#!/usr/bin/env python3
import json
import os
import time
import uuid
from urllib.error import HTTPError
from urllib.request import Request, urlopen

API_KEY = os.environ.get("KIYT_API_KEY")
BASE_URL = os.environ.get("KIYT_BASE_URL", "https://console.kiyt.io/api/v1").rstrip("/")

if not API_KEY:
    raise SystemExit("Set KIYT_API_KEY first")


def request(method: str, path: str, body=None, idempotency_key: str | None = None):
    headers = {"Authorization": f"Bearer {API_KEY}"}
    data = None

    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")

    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key

    req = Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)

    try:
        with urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"KIYT HTTP {exc.code}: {detail}") from exc


def poll_ready(run_id: str):
    for _ in range(30):
        payload = request("GET", f"/runs/{run_id}")
        status = payload["run"]["status"]

        if status in {"requires_action", "needs_input", "completed", "failed"}:
            return payload

        if status not in {"queued", "running"}:
            raise RuntimeError(f"Unexpected run status: {status}")

        time.sleep(2)

    raise TimeoutError("Timed out waiting for KIYT run")


def lookup_order(arguments: dict):
    if set(arguments) != {"order_id"} or not isinstance(arguments["order_id"], str):
        raise ValueError("lookup_order arguments did not match the local contract")

    return {
        "order_id": arguments["order_id"],
        "status": "packed",
        "dispatch_ready": True,
    }


suffix = uuid.uuid4().hex
created = request(
    "POST",
    "/runs",
    {
        "objective": (
            "Confirm whether order ORD-1007 is ready to dispatch. "
            "Use the available order lookup before completing."
        ),
        "context": {"order_id": "ORD-1007"},
        "available_actions": [
            {
                "name": "lookup_order",
                "description": "Look up the current state of an order.",
                "input_schema": {
                    "type": "object",
                    "properties": {"order_id": {"type": "string"}},
                    "required": ["order_id"],
                    "additionalProperties": False,
                },
            }
        ],
    },
    f"quickstart-run-{suffix}",
)

run_id = created["run_id"]
print(f"Created {run_id}")

for cycle in range(1, 9):
    payload = poll_ready(run_id)
    run = payload["run"]
    status = run["status"]

    if status == "completed":
        print(json.dumps(run, indent=2))
        print("Run completed.")
        break

    if status == "failed":
        raise RuntimeError(f"Run failed: {run.get('error')}")

    decision = run["decision"]
    decision_id = decision["decision_id"]

    if status == "requires_action":
        action = decision["action"]

        if action["name"] != "lookup_order":
            raise RuntimeError(f"Refusing unknown action: {action['name']}")

        output = lookup_order(action["arguments"])
        observation_id = f"quickstart-observation-{suffix}-{cycle}"

        request(
            "POST",
            f"/runs/{run_id}/observations",
            {
                "decision_id": decision_id,
                "observation_id": observation_id,
                "result": {"status": "success", "output": output},
            },
            f"observation-{suffix}-{cycle}",
        )
        continue

    if status == "needs_input":
        input_id = f"quickstart-input-{suffix}-{cycle}"

        request(
            "POST",
            f"/runs/{run_id}/inputs",
            {
                "decision_id": decision_id,
                "input_id": input_id,
                "data": {"order_id": "ORD-1007"},
            },
            f"input-{suffix}-{cycle}",
        )
else:
    raise RuntimeError("Stopped after 8 decision cycles")
