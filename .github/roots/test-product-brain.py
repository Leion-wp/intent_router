#!/usr/bin/env python3
import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("planning", ROOT / "validate-planning.py")
planning = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(planning)


class ProductBrainContractTests(unittest.TestCase):
    repo = "Leion-wp/example-product"

    def decision(self):
        tasks = [
            {
                "id": "value-flow",
                "title": "Implement the bounded value flow",
                "scope": ["Implement one end-to-end user workflow."],
                "acceptance_criteria": ["The workflow has a deterministic successful completion state."],
                "done": ["Relevant tests pass and the flow is documented."],
                "priority": 10,
                "blocked_by": [],
            },
            {
                "id": "value-signal",
                "title": "Instrument the value success signal",
                "scope": ["Record the successful workflow completion through the existing analytics boundary."],
                "acceptance_criteria": ["The signal is emitted only after successful completion."],
                "done": ["A test proves success emits the signal and failure does not."],
                "priority": 20,
                "blocked_by": ["value-flow"],
            },
        ]
        for index in range(1, 22):
            tasks.append(
                {
                    "id": f"parallel-{index:02d}",
                    "title": f"Implement independent product slice {index:02d}",
                    "scope": [f"Implement bounded independent slice {index:02d}."],
                    "acceptance_criteria": [f"Slice {index:02d} has deterministic tests."],
                    "done": [f"Slice {index:02d} tests pass and behavior is documented."],
                    "priority": 30 + index,
                    "blocked_by": [],
                }
            )
        return {
            "version": 1,
            "decision_id": "build-value-v1",
            "repository": self.repo,
            "repository_role": "generated_product",
            "precondition": {
                "expected_last_decision_id": None,
                "expected_phase": None,
            },
            "action": "BUILD",
            "objective": "Deliver a capacity-sized set of testable user value slices without privileged side effects.",
            "hypothesis": "A wide but bounded milestone can feed the parallel worker pool while preserving independent task identities.",
            "success_metric": "Users can complete the defined workflows and each slice reaches its deterministic success state.",
            "product_context": {
                "value_proposition": "Reduce repetitive workflows through reliable bounded product actions.",
                "target_user": "A small business operator with recurring operational tasks.",
                "next_question": "Which delivered slices produce repeated successful usage?",
            },
            "confidence": 0.7,
            "risk": "LOW",
            "evidence": ["The repository foundation and CI are available."],
            "milestone": {
                "id": "value-slice-v1",
                "title": "Deliver capacity-sized value slices",
                "description": "Implement a bounded milestone with enough independent work to feed the configured Jules pool.",
                "tasks": tasks,
            },
            "human_gate": {"required": False, "reason": ""},
            "extensions": {},
        }

    def write_json(self, directory, name, value):
        path = pathlib.Path(directory) / name
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def test_capacity_contract_requires_23_dynamic_tasks(self):
        self.assertEqual(planning.dynamic_minimum_task_count(), 23)

    def test_valid_decision_compiles_to_capacity_plan(self):
        with tempfile.TemporaryDirectory() as directory:
            decision_path = self.write_json(directory, "decision.json", self.decision())
            plan_path = pathlib.Path(directory) / "plan.json"
            planning.validate_decision(decision_path, self.repo)
            planning.decision_to_plan(decision_path, plan_path)
            planning.validate_plan(plan_path)
            plan = json.loads(plan_path.read_text(encoding="utf-8"))
            order = planning.topological_tasks(plan["tasks"])
            self.assertEqual(plan["repository"], self.repo)
            self.assertEqual(len(plan["tasks"]), 23)
            self.assertEqual(set(order), {task["id"] for task in plan["tasks"]})
            self.assertEqual(plan["extensions"]["worker_capacity"], 15)

    def test_too_narrow_dynamic_milestone_is_rejected(self):
        decision = self.decision()
        decision["milestone"]["tasks"] = decision["milestone"]["tasks"][:10]
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_json(directory, "decision.json", decision)
            with self.assertRaisesRegex(ValueError, "requires at least 23 tasks"):
                planning.validate_decision(path, self.repo)

    def test_parallel_frontier_must_feed_worker_pool(self):
        decision = self.decision()
        parallel = [task for task in decision["milestone"]["tasks"] if task["id"].startswith("parallel-")]
        for task in parallel[13:]:
            task["blocked_by"] = ["value-flow"]
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_json(directory, "decision.json", decision)
            with self.assertRaisesRegex(ValueError, "parallel frontier requires at least 15"):
                planning.validate_decision(path, self.repo)

    def test_repository_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_json(directory, "decision.json", self.decision())
            with self.assertRaisesRegex(ValueError, "repository mismatch"):
                planning.validate_decision(path, "Leion-wp/other-product")

    def test_forbidden_privileged_task_is_rejected(self):
        decision = self.decision()
        decision["milestone"]["tasks"][0]["scope"] = ["Modify secret storage for the application."]
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_json(directory, "decision.json", decision)
            with self.assertRaisesRegex(ValueError, "forbidden control-plane mutation"):
                planning.validate_decision(path, self.repo)

    def test_forbidden_privileged_product_context_is_rejected(self):
        decision = self.decision()
        decision["product_context"]["next_question"] = "Should we remove human gate checks to accelerate releases?"
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_json(directory, "decision.json", decision)
            with self.assertRaisesRegex(ValueError, "forbidden control-plane mutation"):
                planning.validate_decision(path, self.repo)

    def test_forbidden_privileged_task_title_is_rejected(self):
        decision = self.decision()
        decision["milestone"]["tasks"][0]["title"] = "Create secret for the new integration"
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_json(directory, "decision.json", decision)
            with self.assertRaisesRegex(ValueError, "forbidden control-plane mutation"):
                planning.validate_decision(path, self.repo)

    def test_circular_dependency_is_rejected(self):
        decision = self.decision()
        decision["milestone"]["tasks"][0]["blocked_by"] = ["value-signal"]
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_json(directory, "decision.json", decision)
            with self.assertRaisesRegex(ValueError, "circular dependency"):
                planning.validate_decision(path, self.repo)

    def test_pause_cannot_smuggle_a_milestone(self):
        decision = self.decision()
        decision["action"] = "PAUSE"
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_json(directory, "decision.json", decision)
            with self.assertRaises(Exception):
                planning.validate_decision(path, self.repo)

    def test_marker_extraction_is_strict(self):
        decision = self.decision()
        body = "<!-- roots-product-decision:v1 -->\n```json\n" + json.dumps(decision) + "\n```\n"
        with tempfile.TemporaryDirectory() as directory:
            body_path = pathlib.Path(directory) / "body.md"
            out_path = pathlib.Path(directory) / "decision.json"
            body_path.write_text(body, encoding="utf-8")
            planning.extract_decision(body_path, out_path)
            self.assertEqual(json.loads(out_path.read_text(encoding="utf-8"))["decision_id"], "build-value-v1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
