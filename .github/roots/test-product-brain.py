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
        return {
            "version": 1,
            "decision_id": "build-value-v1",
            "repository": self.repo,
            "precondition": {
                "expected_last_decision_id": None,
                "expected_phase": None,
            },
            "action": "BUILD",
            "objective": "Deliver one testable user value slice without privileged side effects.",
            "hypothesis": "A narrow end-to-end workflow will provide a measurable activation signal.",
            "success_metric": "A user can complete the workflow and reach the defined success state.",
            "product_context": {
                "value_proposition": "Reduce a repetitive workflow to a reliable guided action.",
                "target_user": "A small business operator with a recurring operational task.",
                "next_question": "Does the target user complete the workflow and return to use it again?",
            },
            "confidence": 0.7,
            "risk": "LOW",
            "evidence": ["The repository foundation and CI are available."],
            "milestone": {
                "id": "value-slice-v1",
                "title": "Deliver the first value slice",
                "description": "Implement one bounded end-to-end product workflow and instrument its success state.",
                "tasks": [
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
                ],
            },
            "human_gate": {"required": False, "reason": ""},
            "extensions": {},
        }

    def write_json(self, directory, name, value):
        path = pathlib.Path(directory) / name
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def test_valid_decision_compiles_to_plan(self):
        with tempfile.TemporaryDirectory() as directory:
            decision_path = self.write_json(directory, "decision.json", self.decision())
            plan_path = pathlib.Path(directory) / "plan.json"
            planning.validate_decision(decision_path, self.repo)
            planning.decision_to_plan(decision_path, plan_path)
            planning.validate_plan(plan_path)
            plan = json.loads(plan_path.read_text(encoding="utf-8"))
            self.assertEqual(plan["repository"], self.repo)
            self.assertEqual(planning.topological_tasks(plan["tasks"]), ["value-flow", "value-signal"])

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
