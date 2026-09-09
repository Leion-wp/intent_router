#!/usr/bin/env python3
"""Parallel-pool regression suite layered on the historical fleet pipeline harness.

The legacy harness remains the executable model for the event-driven chain. This
suite inherits every legacy regression and overrides only the assertion whose
meaning changed when Roots moved from a global worker lock to bounded capacity.
"""
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "fleet_pipeline_legacy", ROOT / "test-fleet-pipeline.py"
)
legacy = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(legacy)


class ParallelPipelineTests(legacy.PipelineTests):
    def test_negative_stale_unclassified_and_denied_risk_hold_lock(self):
        """A bad task holds its own identity, not the whole Jules pool."""
        for change in ["REWORK", "BLOCK", "stale", "unclassified", "denied", "ci_failure"]:
            with self.subTest(change=change):
                state = legacy.fixture()
                comment = state["issues"]["17"]["comments"][1]
                if change in ("REWORK", "BLOCK"):
                    comment["body"] = comment["body"].replace("PASS", change)
                elif change == "stale":
                    comment["body"] = comment["body"].replace(legacy.SHA, "b" * 40)
                elif change == "unclassified":
                    comment["body"] = comment["body"].replace("Risk: low", "")
                elif change == "denied":
                    state["issues"]["17"]["labels"].append({"name": "factory:risk-high"})
                else:
                    state["ci"] = "failure"

                self.put(state)
                self.start()
                workers = self.workers()

                self.assertEqual(
                    [worker["inputs"]["issue_number"] for worker in workers],
                    ["18"],
                    "Independent queued work should use remaining Jules capacity",
                )
                self.assertFalse(
                    any(worker["inputs"]["issue_number"] == "17" for worker in workers),
                    "The affected task identity must never receive a replacement worker",
                )
                labels17 = {row["name"] for row in self.get()["issues"]["17"]["labels"]}
                self.assertIn("factory:dispatched", labels17)
                self.assertFalse(
                    any(row["kind"] == "merge" for row in self.get()["mutations"]),
                    "A negative/stale/unclassified decision must never merge the affected PR",
                )

    def test_dispatch_only_fills_pool_without_exceeding_capacity(self):
        """One active identity plus excess queue fills exactly the 14 free slots."""
        state = legacy.fixture()
        for number in range(18, 38):
            state["issues"][str(number)] = {
                "number": number,
                "labels": [{"name": "factory:queued"}],
                "state": "OPEN",
                "stateReason": None,
                "body": "",
                "comments": [],
                "createdAt": f"2026-09-01T00:{number:02d}:00Z",
            }
        self.put(state)

        self.success(
            "factory-fleet-scheduler",
            inputs={"execute": True, "dispatch_only": True},
        )
        workers = self.workers()
        dispatched_issues = [worker["inputs"]["issue_number"] for worker in workers]

        self.assertEqual(len(workers), 14)
        self.assertNotIn("17", dispatched_issues)
        self.assertEqual(len(set(dispatched_issues)), 14)

        active_labels = 0
        for issue in self.get()["issues"].values():
            labels = {row["name"] for row in issue["labels"]}
            if "factory:dispatching" in labels or "factory:dispatched" in labels:
                active_labels += 1
        self.assertEqual(active_labels, 15)


if __name__ == "__main__":
    unittest.main(verbosity=2)
