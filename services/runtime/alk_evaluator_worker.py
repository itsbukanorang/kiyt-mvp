from __future__ import annotations

from hashlib import sha256
from importlib.metadata import version
import json
import os
import socket
import sys
from typing import Any


os.environ[
    "LITELLM_LOCAL_MODEL_COST_MAP"
] = "True"

os.environ[
    "LITELLM_OFFLINE_MODE"
] = "true"


def _network_forbidden(
    *args: Any,
    **kwargs: Any,
) -> None:
    raise RuntimeError(
        "alk_network_access_forbidden"
    )


socket.socket.connect = (
    _network_forbidden
)

socket.create_connection = (
    _network_forbidden
)


from fi.alk import evals  # noqa: E402


EVALUATOR_NAME = (
    "future-agi-agent-learning-kit"
)

RUBRIC_NAME = (
    "kiyt-task-evidence"
)

RUBRIC_VERSION = "v1"

THRESHOLD = 0.70


def canonical_json(
    value: Any,
) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )


def sha256_json(
    value: Any,
) -> str:
    return sha256(
        canonical_json(
            value
        ).encode("utf-8")
    ).hexdigest()


def action_names(
    actions: list[
        dict[str, Any]
    ],
) -> list[str]:
    result: list[str] = []

    for action in actions:
        if not isinstance(
            action,
            dict,
        ):
            continue

        name = action.get(
            "name"
        )

        if (
            isinstance(name, str)
            and name.strip()
            and name.strip()
            not in result
        ):
            result.append(
                name.strip()
            )

    return result


def numeric_metrics(
    raw: Any,
) -> dict[str, float]:
    if not isinstance(
        raw,
        dict,
    ):
        return {}

    result: dict[
        str,
        float,
    ] = {}

    for key, value in raw.items():
        if isinstance(
            value,
            (int, float),
        ):
            result[
                str(key)
            ] = round(
                float(value),
                6,
            )

    return result


def main() -> None:
    payload = json.load(
        sys.stdin
    )

    objective = str(
        payload.get(
            "objective"
        )
        or ""
    ).strip()

    if not objective:
        raise RuntimeError(
            "objective_required"
        )

    decision = payload.get(
        "decision"
    )

    observation = payload.get(
        "observation"
    )

    actions = payload.get(
        "available_actions"
    )

    feedback = payload.get(
        "feedback"
    )

    if not isinstance(
        decision,
        dict,
    ):
        raise RuntimeError(
            "decision_required"
        )

    if not isinstance(
        observation,
        dict,
    ):
        raise RuntimeError(
            "observation_required"
        )

    if not isinstance(
        actions,
        list,
    ):
        raise RuntimeError(
            "available_actions_invalid"
        )

    observation_status = (
        observation.get(
            "status"
        )
    )

    if observation_status not in {
        "success",
        "failure",
    }:
        raise RuntimeError(
            "observation_status_invalid"
        )

    selected_action = (
        decision.get(
            "action"
        )
        or {}
    )

    action_name: (
        str | None
    ) = None

    action_args: dict[
        str,
        Any,
    ] = {}

    if isinstance(
        selected_action,
        dict,
    ):
        raw_name = (
            selected_action.get(
                "name"
            )
        )

        raw_args = (
            selected_action.get(
                "arguments"
            )
        )

        if (
            isinstance(
                raw_name,
                str,
            )
            and raw_name.strip()
        ):
            action_name = (
                raw_name.strip()
            )

        if isinstance(
            raw_args,
            dict,
        ):
            action_args = (
                raw_args
            )

    messages: list[
        dict[str, Any]
    ] = [
        {
            "role":
                "user",
            "content":
                objective,
        },
        {
            "role":
                "assistant",
            "content":
                str(
                    decision.get(
                        "reason_summary",
                        "",
                    )
                ),
        },
    ]

    tool_calls: list[
        dict[str, Any]
    ] = []

    if action_name:
        messages[-1][
            "tool_calls"
        ] = [
            {
                "id":
                    "kiyt-action",
                "name":
                    action_name,
                "arguments":
                    action_args,
            }
        ]

        messages.append(
            {
                "role":
                    "tool",
                "tool_call_id":
                    "kiyt-action",
                "content":
                    canonical_json(
                        observation
                    ),
            }
        )

        tool_calls.append(
            {
                "id":
                    "kiyt-action",
                "name":
                    action_name,
                "arguments":
                    action_args,
                "result":
                    observation,
            }
        )

    feedback_rating: (
        int | None
    ) = None

    feedback_id: (
        str | None
    ) = None

    if isinstance(
        feedback,
        dict,
    ):
        raw_rating = (
            feedback.get(
                "rating"
            )
        )

        if raw_rating in (
            -1,
            0,
            1,
        ):
            feedback_rating = (
                int(raw_rating)
            )

        raw_feedback_id = (
            feedback.get(
                "id"
            )
        )

        if isinstance(
            raw_feedback_id,
            str,
        ):
            feedback_id = (
                raw_feedback_id
            )

    evidence_class = (
        "customer_reported_outcome"
    )

    if feedback_rating is not None:
        evidence_class += (
            "+subjective_feedback"
        )

    available_names = (
        action_names(
            actions
        )
    )

    evidence = {
        "id":
            "kiyt-evaluation",

        "task_description":
            objective,

        "input":
            objective,

        "output":
            canonical_json(
                observation
            ),

        "messages":
            messages,

        "tool_calls":
            tool_calls,

        "environment_state": {
            "kiyt_evidence": {
                "observation_status":
                    observation_status,

                "evidence_class":
                    evidence_class,

                "feedback_present":
                    feedback_rating
                    is not None,
            }
        },
    }

    evidence_hash_source = {
        "objective":
            objective,

        "decision":
            decision,

        "observation":
            observation,

        "available_action_names":
            available_names,

        "feedback":
            feedback,
    }

    config = (
        evals
        .build_task_evaluation_config(
            task_description=
                objective,

            available_tools=
                available_names,

            required_tools=[],
        )
    )

    result = (
        evals
        .evaluate_task_evidence(
            evidence,
            config=config,
            threshold=THRESHOLD,
            name="kiyt-evaluation",
        )
    )

    if result.get(
        "kind"
    ) != (
        "agent-learning."
        "artifact-evaluation.v1"
    ):
        raise RuntimeError(
            "invalid_alk_artifact_kind"
        )

    status = result.get(
        "status"
    )

    if status not in {
        "passed",
        "failed",
    }:
        raise RuntimeError(
            "invalid_alk_status"
        )

    summary = result.get(
        "summary"
    )

    if not isinstance(
        summary,
        dict,
    ):
        raise RuntimeError(
            "invalid_alk_summary"
        )

    score = summary.get(
        "score"
    )

    if not isinstance(
        score,
        (int, float),
    ):
        raise RuntimeError(
            "invalid_alk_score"
        )

    score = round(
        float(score),
        6,
    )

    if not (
        0.0
        <= score
        <= 1.0
    ):
        raise RuntimeError(
            "alk_score_out_of_range"
        )

    artifact = {
        "kind":
            result["kind"],

        "status":
            status,

        "summary": {
            "score":
                score,

            "threshold":
                summary.get(
                    "threshold",
                    THRESHOLD,
                ),

            "case_count":
                summary.get(
                    "case_count"
                ),

            "passed_case_count":
                summary.get(
                    "passed_case_count"
                ),

            "failed_case_count":
                summary.get(
                    "failed_case_count"
                ),

            "finding_count":
                summary.get(
                    "finding_count"
                ),

            "metric_averages":
                numeric_metrics(
                    summary.get(
                        "metric_averages"
                    )
                ),
        },
    }

    components = {
        "outcome": {
            "source":
                "customer_reported_observation",

            "status":
                observation_status,

            "objective_progress":
                None,
        },

        "customer_feedback": {
            "source":
                "subjective_feedback",

            "present":
                feedback_rating
                is not None,

            "event_id":
                feedback_id,

            "rating":
                feedback_rating,
        },

        "evaluator_inference": {
            "source":
                "alk_local_inference",

            "score":
                score,

            "passed":
                status
                == "passed",
        },
    }

    response = {
        "evaluator": {
            "name":
                EVALUATOR_NAME,

            "version":
                version(
                    "agent-learning-kit"
                ),
        },

        "rubric": {
            "name":
                RUBRIC_NAME,

            "version":
                RUBRIC_VERSION,
        },

        "evidence_class":
            evidence_class,

        "evidence_hash":
            sha256_json(
                evidence_hash_source
            ),

        "score":
            score,

        "passed":
            status
            == "passed",

        "components":
            components,

        "artifact_hash":
            sha256_json(
                artifact
            ),

        "artifact":
            artifact,
    }

    sys.stdout.write(
        canonical_json(
            response
        )
    )


if __name__ == "__main__":
    main()
