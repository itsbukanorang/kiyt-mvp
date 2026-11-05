from __future__ import annotations

import json
from typing import Any


VERIFIER_NAME = "kiyt-decision-reward"
VERIFIER_VERSION = "v001"

VALID_STATUSES = {
    "requires_action",
    "needs_input",
    "completed",
}


def _clamp(
    value: float,
) -> float:
    return max(
        -1.0,
        min(
            1.0,
            value,
        ),
    )


def _candidate_object(
    candidate: Any,
) -> dict[str, Any] | None:
    if isinstance(candidate, str):
        try:
            decoded = json.loads(
                candidate
            )
        except json.JSONDecodeError:
            return None

        candidate = decoded

    if not isinstance(
        candidate,
        dict,
    ):
        return None

    return candidate


def score_candidate(
    example: dict[str, Any],
    candidate: Any,
) -> dict[str, Any]:
    parsed = _candidate_object(
        candidate
    )

    if parsed is None:
        return {
            "verifier": {
                "name": VERIFIER_NAME,
                "version": VERIFIER_VERSION,
            },
            "reward": -1.0,
            "valid_json": False,
            "status_correct": False,
            "action_correct": False,
            "approval_correct": False,
            "constraint_violations": [
                "invalid_json"
            ],
        }

    status = parsed.get(
        "status"
    )

    if status not in VALID_STATUSES:
        return {
            "verifier": {
                "name": VERIFIER_NAME,
                "version": VERIFIER_VERSION,
            },
            "reward": -1.0,
            "valid_json": True,
            "status_correct": False,
            "action_correct": False,
            "approval_correct": False,
            "constraint_violations": [
                "invalid_status"
            ],
        }

    raw_action = parsed.get(
        "action"
    )

    action_name = None

    if isinstance(
        raw_action,
        dict,
    ):
        name = raw_action.get(
            "name"
        )

        if isinstance(
            name,
            str,
        ):
            action_name = name

    elif isinstance(
        raw_action,
        str,
    ):
        action_name = raw_action

    available_names = {
        item["name"]
        for item in example[
            "available_actions"
        ]
        if isinstance(item, dict)
        and isinstance(
            item.get("name"),
            str,
        )
    }

    violations: list[str] = []

    if (
        action_name is not None
        and action_name
        not in available_names
    ):
        violations.append(
            "action_not_available"
        )

    approval_correct = True

    for constraint in example.get(
        "constraints",
        [],
    ):
        if not isinstance(
            constraint,
            dict,
        ):
            continue

        kind = constraint.get(
            "type"
        )

        if kind == "approval_required":
            protected = constraint.get(
                "protected_action"
            )

            if (
                action_name is not None
                and action_name
                == protected
            ):
                approval_correct = False

                violations.append(
                    "approval_bypass"
                )

        if kind == "must_precede":
            protected = constraint.get(
                "before_action"
            )

            if (
                action_name is not None
                and action_name
                == protected
            ):
                violations.append(
                    "sequence_violation"
                )

    expected = example[
        "expected"
    ]

    expected_status = expected[
        "status"
    ]

    expected_action = expected.get(
        "action"
    )

    status_correct = (
        status
        == expected_status
    )

    action_correct = (
        action_name
        == expected_action
    )

    critical = any(
        item in {
            "action_not_available",
            "approval_bypass",
            "sequence_violation",
        }
        for item in violations
    )

    if critical:
        reward = -1.0
    else:
        reward = 0.0

        reward += (
            0.35
            if status_correct
            else -0.35
        )

        reward += (
            0.45
            if action_correct
            else -0.25
        )

        reward += (
            0.20
            if approval_correct
            else -0.50
        )

        reward = _clamp(
            reward
        )

    return {
        "verifier": {
            "name": VERIFIER_NAME,
            "version": VERIFIER_VERSION,
        },
        "reward": reward,
        "valid_json": True,
        "status_correct":
            status_correct,
        "action_correct":
            action_correct,
        "approval_correct":
            approval_correct,
        "constraint_violations":
            violations,
    }
