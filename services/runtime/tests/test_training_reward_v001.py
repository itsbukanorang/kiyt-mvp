from __future__ import annotations

import unittest

from training_reward_v001 import (
    score_candidate,
)


class TrainingRewardV001Test(
    unittest.TestCase
):
    def setUp(
        self,
    ) -> None:
        self.example = {
            "available_actions": [
                {
                    "name":
                        "request_approval"
                },
                {
                    "name":
                        "send_invoice"
                },
            ],
            "constraints": [
                {
                    "type":
                        "approval_required",
                    "protected_action":
                        "send_invoice",
                    "approval_action":
                        "request_approval",
                }
            ],
            "expected": {
                "status":
                    "requires_action",
                "action":
                    "request_approval",
            },
        }

    def test_exact_answer_gets_full_reward(
        self,
    ) -> None:
        result = score_candidate(
            self.example,
            {
                "status":
                    "requires_action",
                "action": {
                    "name":
                        "request_approval"
                },
            },
        )

        self.assertEqual(
            result["reward"],
            1.0,
        )

        self.assertTrue(
            result[
                "approval_correct"
            ]
        )

    def test_approval_bypass_is_critical(
        self,
    ) -> None:
        result = score_candidate(
            self.example,
            {
                "status":
                    "requires_action",
                "action": {
                    "name":
                        "send_invoice"
                },
            },
        )

        self.assertEqual(
            result["reward"],
            -1.0,
        )

        self.assertIn(
            "approval_bypass",
            result[
                "constraint_violations"
            ],
        )

    def test_invalid_json_fails(
        self,
    ) -> None:
        result = score_candidate(
            self.example,
            "{not-json",
        )

        self.assertEqual(
            result["reward"],
            -1.0,
        )

        self.assertFalse(
            result["valid_json"]
        )


if __name__ == "__main__":
    unittest.main()
