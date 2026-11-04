import json
import math
from importlib.metadata import version
from typing import Any

from mabwiser.mab import (
    LearningPolicy,
    MAB,
)


POLICY_NAME = "kiyt-cognitive-strategy"
POLICY_VERSION = "v1"

LEARNER_NAME = "mabwiser-linucb"
LEARNER_VERSION = "2.7.4"

ARMS = [
    "direct",
    "retrieve_first",
    "decompose_verify",
    "cautious_verify",
]

FEATURE_DIMENSION = 8


class KIYTPolicyError(RuntimeError):
    def __init__(
        self,
        code: str,
    ) -> None:
        super().__init__(code)
        self.code = code


def _finite_number(
    value: Any,
) -> bool:
    return (
        isinstance(
            value,
            (int, float),
        )
        and not isinstance(value, bool)
        and math.isfinite(float(value))
    )


class KIYTPolicySelector:
    def __init__(self) -> None:
        if version("mabwiser") != LEARNER_VERSION:
            raise KIYTPolicyError(
                "policy_mabwiser_version_mismatch"
            )

    @staticmethod
    def instruction(
        strategy: str,
    ) -> str:
        instructions = {
            "direct": (
                "Use the shortest reliable reasoning "
                "path. Avoid unnecessary decomposition, "
                "but do not skip evidence required for "
                "correctness."
            ),
            "retrieve_first": (
                "Prioritize relevant recalled workspace "
                "memory and reconcile it with current "
                "context before deciding."
            ),
            "decompose_verify": (
                "Decompose the task into dependent "
                "reasoning steps, verify key assumptions, "
                "then produce the next decision."
            ),
            "cautious_verify": (
                "Use conservative evidence discipline. "
                "When required evidence is missing, "
                "prefer requesting external action or "
                "input instead of assuming facts."
            ),
        }

        try:
            return instructions[strategy]

        except KeyError as exc:
            raise KIYTPolicyError(
                "policy_strategy_invalid"
            ) from exc

    @staticmethod
    def recall_limits(
        strategy: str,
    ) -> tuple[int, int]:
        limits = {
            "direct": (3, 3),
            "retrieve_first": (8, 8),
            "decompose_verify": (5, 5),
            "cautious_verify": (5, 5),
        }

        try:
            return limits[strategy]

        except KeyError as exc:
            raise KIYTPolicyError(
                "policy_strategy_invalid"
            ) from exc

    @staticmethod
    def _feature_vector(
        *,
        objective: str,
        context: dict[str, Any],
        available_actions: list[
            dict[str, Any]
        ],
    ) -> list[float]:

        context_json = json.dumps(
            context,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )

        actions_json = json.dumps(
            available_actions,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )

        vector = [
            1.0,

            min(
                len(objective),
                20000,
            ) / 20000.0,

            min(
                len(context_json),
                50000,
            ) / 50000.0,

            min(
                len(available_actions),
                64,
            ) / 64.0,

            min(
                len(actions_json),
                50000,
            ) / 50000.0,

            1.0
            if context.get(
                "latest_observation"
            ) is not None
            else 0.0,

            1.0
            if context.get(
                "latest_input"
            ) is not None
            else 0.0,

            min(
                len(context),
                64,
            ) / 64.0,
        ]

        if (
            len(vector)
            != FEATURE_DIMENSION
        ):
            raise KIYTPolicyError(
                "policy_feature_dimension"
            )

        return vector

    @staticmethod
    def _history(
        policy_state: dict[str, Any],
    ) -> tuple[
        list[str],
        list[float],
        list[list[float]],
        int,
    ]:
        if not isinstance(
            policy_state,
            dict,
        ):
            raise KIYTPolicyError(
                "policy_state_invalid"
            )

        if (
            policy_state.get("policy_name")
            != POLICY_NAME
            or policy_state.get(
                "policy_version"
            )
            != POLICY_VERSION
            or policy_state.get(
                "learner_name"
            )
            != LEARNER_NAME
            or policy_state.get(
                "learner_version"
            )
            != LEARNER_VERSION
        ):
            raise KIYTPolicyError(
                "policy_state_identity"
            )

        revision = policy_state.get(
            "snapshot_revision",
            0,
        )

        history = policy_state.get(
            "history",
            [],
        )

        if (
            not isinstance(revision, int)
            or isinstance(revision, bool)
            or revision < 0
            or not isinstance(history, list)
        ):
            raise KIYTPolicyError(
                "policy_state_contract"
            )

        decisions: list[str] = []
        rewards: list[float] = []
        contexts: list[list[float]] = []

        for item in history:

            if not isinstance(item, dict):
                raise KIYTPolicyError(
                    "policy_history_item"
                )

            strategy = item.get(
                "strategy"
            )

            reward = item.get(
                "reward"
            )

            vector = item.get(
                "context_vector"
            )

            if strategy not in ARMS:
                raise KIYTPolicyError(
                    "policy_history_strategy"
                )

            if not _finite_number(reward):
                raise KIYTPolicyError(
                    "policy_history_reward"
                )

            reward = float(reward)

            if not -1.0 <= reward <= 1.0:
                raise KIYTPolicyError(
                    "policy_history_reward"
                )

            if (
                not isinstance(vector, list)
                or len(vector)
                != FEATURE_DIMENSION
                or not all(
                    _finite_number(value)
                    for value in vector
                )
            ):
                raise KIYTPolicyError(
                    "policy_history_context"
                )

            decisions.append(strategy)
            rewards.append(reward)

            contexts.append([
                float(value)
                for value in vector
            ])

        if revision != len(history):
            raise KIYTPolicyError(
                "policy_snapshot_history_mismatch"
            )

        return (
            decisions,
            rewards,
            contexts,
            revision,
        )

    def select(
        self,
        *,
        objective: str,
        context: dict[str, Any],
        available_actions: list[
            dict[str, Any]
        ],
        policy_state: dict[str, Any],
    ) -> dict[str, Any]:

        vector = self._feature_vector(
            objective=objective,
            context=context,
            available_actions=
                available_actions,
        )

        (
            decisions,
            rewards,
            contexts,
            revision,
        ) = self._history(
            policy_state
        )

        counts = {
            arm: decisions.count(arm)
            for arm in ARMS
        }

        missing = [
            arm
            for arm in ARMS
            if counts[arm] == 0
        ]

        if missing:
            strategy = missing[0]
            mode = "cold_start"

            expectations = {
                arm: None
                for arm in ARMS
            }

        else:
            mab = MAB(
                arms=ARMS,
                learning_policy=(
                    LearningPolicy.LinUCB(
                        alpha=1.0,
                        l2_lambda=1.0,
                        scale=False,
                    )
                ),
                seed=123456,
                n_jobs=1,
            )

            mab.fit(
                decisions=decisions,
                rewards=rewards,
                contexts=contexts,
            )

            prediction = mab.predict(
                [vector]
            )

            if isinstance(
                prediction,
                list,
            ):
                prediction = prediction[0]

            strategy = str(
                prediction
            )

            raw_expectations = (
                mab.predict_expectations(
                    [vector]
                )
            )

            if isinstance(
                raw_expectations,
                list,
            ):
                raw_expectations = (
                    raw_expectations[0]
                )

            if not isinstance(
                raw_expectations,
                dict,
            ):
                raise KIYTPolicyError(
                    "policy_expectations_invalid"
                )

            expectations = {}

            for arm in ARMS:
                value = raw_expectations.get(
                    arm
                )

                if not _finite_number(value):
                    raise KIYTPolicyError(
                        "policy_expectation_invalid"
                    )

                expectations[arm] = float(
                    value
                )

            if strategy not in ARMS:
                raise KIYTPolicyError(
                    "policy_prediction_invalid"
                )

            mode = "linucb"

        return {
            "policy_name":
                POLICY_NAME,

            "policy_version":
                POLICY_VERSION,

            "learner_name":
                LEARNER_NAME,

            "learner_version":
                LEARNER_VERSION,

            "strategy":
                strategy,

            "mode":
                mode,

            "context_vector":
                vector,

            "expectations":
                expectations,

            "snapshot_revision":
                revision,

            "history_count":
                len(decisions),
        }
