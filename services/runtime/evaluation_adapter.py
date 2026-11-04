from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any


class KIYTEvaluationError(
    RuntimeError
):
    def __init__(
        self,
        code: str,
        retryable: bool,
    ) -> None:
        super().__init__(
            code
        )

        self.code = code
        self.retryable = (
            retryable
        )


class KIYTEvaluationAdapter:
    def __init__(
        self,
        *,
        python_path: str,
        worker_path: str,
        timeout_seconds: float,
    ) -> None:
        self.python_path = (
            python_path
        )

        self.worker_path = (
            worker_path
        )

        self.timeout_seconds = (
            timeout_seconds
        )

    @classmethod
    def from_env(
        cls,
    ) -> "KIYTEvaluationAdapter":
        python_path = os.environ.get(
            "KIYT_ALK_PYTHON",
            (
                "/opt/kiyt-alk-venv/"
                "bin/python"
            ),
        )

        worker_path = os.environ.get(
            "KIYT_ALK_WORKER",
            (
                "/app/"
                "alk_evaluator_worker.py"
            ),
        )

        raw_timeout = os.environ.get(
            "KIYT_ALK_TIMEOUT_SECONDS",
            "60",
        )

        try:
            timeout_seconds = (
                float(raw_timeout)
            )

        except ValueError:
            timeout_seconds = 60.0

        timeout_seconds = max(
            5.0,
            min(
                timeout_seconds,
                120.0,
            ),
        )

        if not Path(
            python_path
        ).is_file():
            raise RuntimeError(
                "KIYT ALK Python "
                "runtime missing"
            )

        if not os.access(
            python_path,
            os.X_OK,
        ):
            raise RuntimeError(
                "KIYT ALK Python "
                "runtime not executable"
            )

        if not Path(
            worker_path
        ).is_file():
            raise RuntimeError(
                "KIYT ALK worker missing"
            )

        return cls(
            python_path=
                python_path,

            worker_path=
                worker_path,

            timeout_seconds=
                timeout_seconds,
        )

    async def evaluate(
        self,
        payload: dict[
            str,
            Any,
        ],
    ) -> dict[
        str,
        Any,
    ]:
        encoded = json.dumps(
            payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        ).encode("utf-8")

        worker_env = {
            "HOME": "/tmp",
            "PYTHONUNBUFFERED":
                "1",
            "LITELLM_LOCAL_MODEL_COST_MAP":
                "True",
            "LITELLM_OFFLINE_MODE":
                "true",
        }

        for name in (
            "LANG",
            "LC_ALL",
        ):
            value = os.environ.get(
                name
            )

            if value:
                worker_env[
                    name
                ] = value

        try:
            process = await (
                asyncio
                .create_subprocess_exec(
                    self.python_path,
                    self.worker_path,
                    stdin=
                        asyncio.subprocess.PIPE,
                    stdout=
                        asyncio.subprocess.PIPE,
                    stderr=
                        asyncio.subprocess.PIPE,
                    env=worker_env,
                )
            )

        except OSError as exc:
            raise (
                KIYTEvaluationError(
                    "evaluation_worker_spawn_failed",
                    True,
                )
            ) from exc

        try:
            stdout, stderr = (
                await asyncio.wait_for(
                    process.communicate(
                        input=encoded
                    ),
                    timeout=
                        self.timeout_seconds,
                )
            )

        except TimeoutError as exc:
            process.kill()

            await process.wait()

            raise (
                KIYTEvaluationError(
                    "evaluation_worker_timeout",
                    True,
                )
            ) from exc

        if process.returncode != 0:
            raise KIYTEvaluationError(
                "evaluation_worker_failed",
                True,
            )

        if len(stdout) > (
            2 * 1024 * 1024
        ):
            raise KIYTEvaluationError(
                "evaluation_output_too_large",
                False,
            )

        try:
            result = json.loads(
                stdout
            )

        except json.JSONDecodeError as exc:
            raise (
                KIYTEvaluationError(
                    "invalid_evaluation_json",
                    False,
                )
            ) from exc

        if not isinstance(
            result,
            dict,
        ):
            raise KIYTEvaluationError(
                "invalid_evaluation_payload",
                False,
            )

        required_object_paths = (
            "evaluator",
            "rubric",
            "components",
            "artifact",
        )

        for key in (
            required_object_paths
        ):
            if not isinstance(
                result.get(key),
                dict,
            ):
                raise (
                    KIYTEvaluationError(
                        "invalid_evaluation_payload",
                        False,
                    )
                )

        score = result.get(
            "score"
        )

        if (
            not isinstance(
                score,
                (int, float),
            )
            or not (
                0.0
                <= float(score)
                <= 1.0
            )
        ):
            raise KIYTEvaluationError(
                "invalid_evaluation_score",
                False,
            )

        for key in (
            "evidence_hash",
            "artifact_hash",
        ):
            value = result.get(
                key
            )

            if (
                not isinstance(
                    value,
                    str,
                )
                or len(value)
                    != 64
                or any(
                    char
                    not in (
                        "0123456789abcdef"
                    )
                    for char
                    in value
                )
            ):
                raise (
                    KIYTEvaluationError(
                        "invalid_evaluation_hash",
                        False,
                    )
                )

        return result
