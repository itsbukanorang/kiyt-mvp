from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from training_dataset_v001 import (
    PRIVACY_CANARY,
    build_records,
    privacy_findings,
    write_snapshot,
)


class TrainingDatasetV001Test(
    unittest.TestCase
):
    def test_counts_and_family_split(
        self,
    ) -> None:
        train, holdout = (
            build_records()
        )

        self.assertEqual(
            len(train),
            128,
        )

        self.assertEqual(
            len(holdout),
            32,
        )

        train_groups = {
            row["source_group"]
            for row in train
        }

        holdout_groups = {
            row["source_group"]
            for row in holdout
        }

        self.assertFalse(
            train_groups
            & holdout_groups
        )

    def test_privacy_canary_detected(
        self,
    ) -> None:
        findings = (
            privacy_findings(
                [
                    {
                        "objective":
                            PRIVACY_CANARY
                    }
                ]
            )
        )

        self.assertTrue(
            findings
        )

    def test_internal_source_is_not_secret(
        self,
    ) -> None:
        findings = privacy_findings(
            [
                {
                    "provenance": {
                        "source":
                            "kiyt_internal_synthetic"
                    }
                }
            ]
        )

        self.assertEqual(
            findings,
            [],
        )

    def test_realistic_kiyt_api_key_is_detected(
        self,
    ) -> None:
        findings = privacy_findings(
            [
                {
                    "value":
                        "kiyt_"
                        + ("A" * 43)
                }
            ]
        )

        self.assertTrue(
            findings
        )

    def test_snapshot_is_clean(
        self,
    ) -> None:
        with (
            tempfile
            .TemporaryDirectory()
        ) as root:
            manifest = (
                write_snapshot(
                    Path(root)
                )
            )

            self.assertEqual(
                manifest[
                    "train_count"
                ],
                128,
            )

            self.assertEqual(
                manifest[
                    "holdout_count"
                ],
                32,
            )

            self.assertEqual(
                manifest[
                    "family_overlap"
                ],
                [],
            )

            self.assertEqual(
                manifest[
                    "privacy_findings"
                ],
                [],
            )


if __name__ == "__main__":
    unittest.main()
