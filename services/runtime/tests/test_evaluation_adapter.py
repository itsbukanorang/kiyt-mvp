from __future__ import annotations

import asyncio
import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest


from evaluation_adapter import (
    KIYTEvaluationAdapter,
)


class EvaluationAdapterTest(
    unittest.TestCase
):
    def test_isolated_worker_contract(
        self,
    ) -> None:
        asyncio.run(
            self._test_isolated_worker_contract()
        )

    async def _test_isolated_worker_contract(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as root:
            worker = (
                Path(root)
                / "worker.py"
            )

            worker.write_text(
                """
import json
import sys

json.load(sys.stdin)

json.dump(
    {
        "evaluator": {
            "name":
                "future-agi-agent-learning-kit",
            "version":
                "0.3.5",
        },
        "rubric": {
            "name":
                "kiyt-task-evidence",
            "version":
                "v1",
        },
        "evidence_class":
            "customer_reported_outcome",
        "evidence_hash":
            "a" * 64,
        "score":
            0.8,
        "passed":
            True,
        "components": {
            "outcome": {
                "status":
                    "success"
            }
        },
        "artifact_hash":
            "b" * 64,
        "artifact": {
            "kind":
                "agent-learning.artifact-evaluation.v1"
        },
    },
    sys.stdout,
)
""".strip()
                + "\n"
            )

            worker.chmod(
                worker.stat().st_mode
                | stat.S_IXUSR
            )

            adapter = (
                KIYTEvaluationAdapter(
                    python_path=
                        sys.executable,

                    worker_path=
                        str(worker),

                    timeout_seconds=
                        5,
                )
            )

            result = await (
                adapter.evaluate(
                    {
                        "objective":
                            "test",

                        "decision":
                            {},

                        "observation": {
                            "status":
                                "success"
                        },

                        "available_actions":
                            [],

                        "feedback":
                            None,
                    }
                )
            )

            self.assertEqual(
                result["score"],
                0.8,
            )

            self.assertEqual(
                result[
                    "artifact_hash"
                ],
                "b" * 64,
            )


if __name__ == "__main__":
    unittest.main()
