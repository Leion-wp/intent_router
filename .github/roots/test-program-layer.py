#!/usr/bin/env python3
import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent

PLANNING_SPEC = importlib.util.spec_from_file_location("planning", ROOT / "validate-planning.py")
planning = importlib.util.module_from_spec(PLANNING_SPEC)
assert PLANNING_SPEC.loader is not None
PLANNING_SPEC.loader.exec_module(planning)

PROGRAM_SPEC = importlib.util.spec_from_file_location("program_manager", ROOT / "factory-program-manager.py")
program_manager = importlib.util.module_from_spec(PROGRAM_SPEC)
assert PROGRAM_SPEC.loader is not None
PROGRAM_SPEC.loader.exec_module(program_manager)

RESULT_SPEC = importlib.util.spec_from_file_location("factory_result_validate", ROOT / "factory_result_validate.py")
factory_result_validate = importlib.util.module_from_spec(RESULT_SPEC)
assert RESULT_SPEC.loader is not None
RESULT_SPEC.loader.exec_module(factory_result_validate)


class StrategicProgramContractTests(unittest.TestCase):
    repo = "Leion-wp/example-product"

    def profile(self, role="generated_product"):
        return {
            "version": 1,
            "managed": True,
            "repository": self.repo,
            "repository_role": role,
            "default_branch": "main",
            "workspace": "/",
            "blueprint": "roots-micro-saas-v1",
            "worker_policy": {"enabled": ["jules"], "preferred": "jules"},
            "ci": {"workflow": "factory-ci.yml", "required_jobs": ["quality"]},
            "governance": {
                "production_gate": "HUMAN_REQUIRED",
                "workflow_changes": "HUMAN_REQUIRED",
                "credential_changes": "HUMAN_REQUIRED",
            },
        }

    def workstreams(self):
        return [
            {"id": "architecture", "title": "Architecture", "objective": "Own stable contracts and architecture boundaries for the program."},
            {"id": "runtime", "title": "Runtime", "objective": "Implement runtime behavior behind the program contracts."},
            {"id": "validation", "title": "Validation", "objective": "Prove the program capabilities through deterministic validation."},
        ]

    def flat_tasks(self, prefix="m1"):
        streams = ["architecture", "runtime", "validation"]
        return [
            {
                "id": f"{prefix}-task-{index:02d}",
                "title": f"Implement bounded program task {index:02d}",
                "workstream": streams[(index - 1) % len(streams)],
                "scope": [f"Implement bounded program slice {index:02d}."],
                "acceptance_criteria": [f"Program slice {index:02d} has deterministic acceptance evidence."],
                "done": [f"Program slice {index:02d} is tested and documented."],
                "priority": index,
                "blocked_by": [],
            }
            for index in range(1, 24)
        ]

    def decision(self, transition="START", milestone_id="program-m1"):
        milestone = None
        if transition in {"START", "CONTINUE", "ADAPT"}:
            milestone = {
                "id": milestone_id,
                "title": f"Deliver {milestone_id}",
                "description": "Deliver a bounded strategic milestone across coordinated engineering workstreams.",
                "planning": {"expected_ready_width": [23], "narrowing_rationale": ""},
                "tasks": self.flat_tasks(milestone_id),
            }
        candidate_id = "program-m3" if milestone_id == "program-m2" else "program-m2"
        return {
            "version": 1,
            "decision_id": f"decision-{transition.lower()}-{milestone_id}",
            "repository": self.repo,
            "repository_role": "generated_product",
            "precondition": {"expected_last_decision_id": None, "expected_phase": None},
            "program": {
                "transition": transition,
                "program_id": "strategic-program-v1",
                "title": "Strategic multi-milestone program",
                "strategic_objective": "Deliver a strategic product transformation through adaptive milestones managed as coordinated engineering workstreams.",
                "success_metric": "The strategic transformation reaches its measurable outcome without losing deterministic execution or worker governance.",
                "candidate_next_milestones": [] if transition in {"COMPLETE", "PAUSE"} else [
                    {
                        "id": candidate_id,
                        "title": "Validate the next strategic capability",
                        "objective": "Use evidence from the current milestone to validate the next bounded strategic capability."
                    }
                ],
                "workstreams": self.workstreams(),
                "learnings": [],
            },
            "action": "PAUSE" if transition == "PAUSE" else "BUILD",
            "objective": "Advance the current strategic program by one evidence-backed milestone.",
            "hypothesis": "Coordinated workstreams and adaptive milestone planning improve engineering throughput without weakening deterministic gates.",
            "success_metric": "The milestone completes with its declared ready-width profile and deterministic acceptance evidence.",
            "product_context": {
                "value_proposition": "Deliver reliable bounded product value through a factory-managed engineering program.",
                "target_user": "Operators who depend on the generated product.",
                "next_question": "What did this milestone teach the active strategic program?",
            },
            "confidence": 0.8,
            "risk": "LOW",
            "evidence": ["The factory supports role-aware dynamic planning and deterministic worker execution."],
            "milestone": milestone,
            "human_gate": {"required": False, "reason": ""},
            "extensions": {},
        }

    def width_collapse_decision(self, rationale=""):
        decision = self.decision("START", "program-m1")
        tasks = []
        streams = ["architecture", "runtime", "validation"]
        for index in range(1, 16):
            tasks.append({
                "id": f"root-{index:02d}",
                "title": f"Root task {index:02d}",
                "workstream": streams[(index - 1) % len(streams)],
                "scope": ["Implement one independent root slice."],
                "acceptance_criteria": ["The root slice has deterministic evidence."],
                "done": ["The root slice is complete and tested."],
                "priority": index,
                "blocked_by": [],
            })
        root_ids = [task["id"] for task in tasks]
        bridge_dependencies = [root_ids[:8], root_ids[7:15]]
        for index, dependencies in enumerate(bridge_dependencies, start=1):
            tasks.append({
                "id": f"bridge-{index}",
                "title": f"Bridge task {index}",
                "workstream": "runtime",
                "scope": ["Integrate the completed root slices through one bounded bridge."],
                "acceptance_criteria": ["The bridge integrates the required roots deterministically."],
                "done": ["The bridge integration is tested."],
                "priority": 30 + index,
                "blocked_by": dependencies,
            })
        for index in range(1, 7):
            tasks.append({
                "id": f"tail-{index}",
                "title": f"Tail task {index}",
                "workstream": "validation",
                "scope": ["Validate one independent downstream slice."],
                "acceptance_criteria": ["The downstream slice has deterministic evidence."],
                "done": ["The downstream slice is complete and tested."],
                "priority": 40 + index,
                "blocked_by": ["bridge-1", "bridge-2"],
            })
        decision["milestone"]["tasks"] = tasks
        decision["milestone"]["planning"] = {
            "expected_ready_width": [15, 2, 6],
            "narrowing_rationale": rationale,
        }
        return decision

    def write(self, directory, name, value):
        path = pathlib.Path(directory) / name
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def create_state(self, directory, decision, existing="-", timestamp="2026-09-11T16:30:00Z"):
        decision_path = self.write(directory, "decision.json", decision)
        profile_path = self.write(directory, "profile.json", self.profile())
        output = pathlib.Path(directory) / "program-state.json"
        program_manager.build_state(
            str(decision_path), self.repo, timestamp, existing, str(profile_path), str(output)
        )
        return output

    def test_start_creates_active_program(self):
        with tempfile.TemporaryDirectory() as directory:
            output = self.create_state(directory, self.decision("START", "program-m1"))
            state = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(state["status"], "ACTIVE")
            self.assertEqual(state["current_milestone"]["id"], "program-m1")
            self.assertEqual(state["program_id"], "strategic-program-v1")

    def test_continue_rolls_completed_milestone_forward(self):
        with tempfile.TemporaryDirectory() as directory:
            first = self.create_state(directory, self.decision("START", "program-m1"))
            existing = pathlib.Path(directory) / "existing.json"
            existing.write_text(first.read_text(encoding="utf-8"), encoding="utf-8")
            second = self.create_state(directory, self.decision("CONTINUE", "program-m2"), str(existing), "2026-09-11T17:00:00Z")
            state = json.loads(second.read_text(encoding="utf-8"))
            self.assertEqual(state["current_milestone"]["id"], "program-m2")
            self.assertEqual(state["completed_milestones"][0]["id"], "program-m1")

    def test_adapt_can_revise_candidates_and_accumulate_learning(self):
        with tempfile.TemporaryDirectory() as directory:
            first = self.create_state(directory, self.decision("START", "program-m1"))
            existing = pathlib.Path(directory) / "existing.json"
            existing.write_text(first.read_text(encoding="utf-8"), encoding="utf-8")
            adapted = self.decision("ADAPT", "program-m2")
            adapted["program"]["learnings"] = ["The first milestone showed that runtime composition is the next highest-leverage constraint."]
            adapted["program"]["candidate_next_milestones"] = [{
                "id": "program-m3",
                "title": "Deepen runtime composition",
                "objective": "Use evidence from the first milestone to deepen the runtime composition boundary."
            }]
            output = self.create_state(directory, adapted, str(existing), "2026-09-11T17:15:00Z")
            state = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(state["candidate_next_milestones"][0]["id"], "program-m3")
            self.assertEqual(len(state["learnings"]), 1)

    def test_complete_closes_program_without_open_milestone(self):
        with tempfile.TemporaryDirectory() as directory:
            first = self.create_state(directory, self.decision("START", "program-m1"))
            existing = pathlib.Path(directory) / "existing.json"
            existing.write_text(first.read_text(encoding="utf-8"), encoding="utf-8")
            completed = self.decision("COMPLETE", "program-complete")
            output = self.create_state(directory, completed, str(existing), "2026-09-11T17:30:00Z")
            state = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(state["status"], "COMPLETED")
            self.assertIsNone(state["current_milestone"])
            self.assertEqual(state["completed_milestones"][0]["id"], "program-m1")

    def test_pause_requires_active_program(self):
        with tempfile.TemporaryDirectory() as directory:
            decision_path = self.write(directory, "decision.json", self.decision("PAUSE", "program-pause"))
            profile_path = self.write(directory, "profile.json", self.profile())
            with self.assertRaisesRegex(ValueError, "requires an existing program"):
                program_manager.validate_decision(str(decision_path), "-", str(profile_path))

    def test_program_role_mismatch_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            decision_path = self.write(directory, "decision.json", self.decision("START", "program-m1"))
            profile_path = self.write(directory, "profile.json", self.profile("factory_substrate"))
            with self.assertRaisesRegex(ValueError, "repository role mismatch"):
                program_manager.validate_decision(str(decision_path), "-", str(profile_path))

    def test_severe_mid_program_width_collapse_requires_rationale(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.write(directory, "decision.json", self.width_collapse_decision())
            with self.assertRaisesRegex(ValueError, "severe sustained ready-width collapse"):
                planning.validate_decision(path, self.repo)

    def test_severe_width_collapse_can_be_explicitly_justified(self):
        rationale = "The two integration bridges encode a real semantic convergence boundary that downstream validation cannot begin before both contracts are integrated."
        with tempfile.TemporaryDirectory() as directory:
            path = self.write(directory, "decision.json", self.width_collapse_decision(rationale))
            planning.validate_decision(path, self.repo)


class FactoryResultSchemaAuthorityTests(unittest.TestCase):
    schema_path = ROOT / "factory-result.schema.json"
    workflow_path = ROOT.parent / "workflows" / "factory-result-validate.yml"
    worker_paths = {
        worker: ROOT.parent / "workflows" / f"factory-worker-{worker}.yml"
        for worker in ("jules", "codex", "claude", "gemini")
    }

    def valid_result(self):
        return {
            "version": 1,
            "task_id": "Leion-wp/example#7",
            "status": "SUCCEEDED",
            "worker": "jules",
            "summary": "Validated result",
            "outputs": {
                "branch": "task/example",
                "commit": "abc1234",
                "pull_request": 9,
                "worker_execution_id": "sessions/123",
                "worker_url": None,
            },
            "evidence": {
                "tests": [{"name": "unit", "status": "PASS", "details": "ok"}],
                "checks": ["factory-ci"],
            },
            "risks": ["none observed"],
            "next_action": "REVIEW",
            "extensions": {"provider": {"attempt": 1}},
        }

    def validate(self, payload, expected_task_id=None, expected_worker=None):
        with tempfile.TemporaryDirectory() as directory:
            result_path = pathlib.Path(directory) / "result.json"
            result_path.write_text(json.dumps(payload), encoding="utf-8")
            return factory_result_validate.validate_result(
                str(self.schema_path),
                str(result_path),
                expected_task_id=expected_task_id,
                expected_worker=expected_worker,
            )

    def test_valid_factory_result_satisfies_canonical_boundary(self):
        result = self.validate(
            self.valid_result(),
            expected_task_id="Leion-wp/example#7",
            expected_worker="jules",
        )
        self.assertEqual(result["outputs"]["pull_request"], 9)

    def test_schema_invalid_shapes_fail_closed(self):
        invalid_cases = []

        payload = self.valid_result()
        payload["outputs"]["pull_request"] = "9"
        invalid_cases.append(payload)

        payload = self.valid_result()
        payload["outputs"]["unexpected"] = "x"
        invalid_cases.append(payload)

        payload = self.valid_result()
        payload["evidence"]["tests"] = ["not-a-test-object"]
        invalid_cases.append(payload)

        payload = self.valid_result()
        payload["risks"] = [123]
        invalid_cases.append(payload)

        payload = self.valid_result()
        payload["extensions"] = []
        invalid_cases.append(payload)

        for payload in invalid_cases:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                self.validate(payload)

    def test_secret_shaped_values_fail_before_value_bearing_diagnostics(self):
        sentinel = "github_pat_" + ("A" * 24)

        schema_valid = self.valid_result()
        schema_valid["summary"] = sentinel
        with self.assertRaises(ValueError) as secret_error:
            self.validate(schema_valid)
        self.assertNotIn(sentinel, str(secret_error.exception))
        self.assertIn("secret-shaped value", str(secret_error.exception))

        schema_invalid = self.valid_result()
        schema_invalid["outputs"]["pull_request"] = sentinel
        with self.assertRaises(ValueError) as schema_error:
            self.validate(schema_invalid)
        self.assertNotIn(sentinel, str(schema_error.exception))
        self.assertIn("secret-shaped value", str(schema_error.exception))

    def test_semantic_and_dispatch_binding_fail_closed(self):
        payload = self.valid_result()
        payload["next_action"] = "HUMAN_REQUIRED"
        with self.assertRaisesRegex(ValueError, "status/next_action"):
            self.validate(payload)

        with self.assertRaisesRegex(ValueError, "expected task"):
            self.validate(self.valid_result(), expected_task_id="Leion-wp/example#8")

        with self.assertRaisesRegex(ValueError, "expected worker"):
            self.validate(self.valid_result(), expected_worker="codex")

    def test_workflow_uses_one_immutable_shared_validation_boundary(self):
        text = self.workflow_path.read_text(encoding="utf-8")
        self.assertIn("factory-result.schema.json", text)
        self.assertIn("factory_result_validate.py", text)
        self.assertIn("jsonschema==4.23.0", text)
        self.assertIn("Validate canonical FactoryResult boundary", text)
        self.assertIn("ref: ${{ github.sha }}", text)
        self.assertNotIn("ref: Android", text)
        self.assertNotIn("grep -Eiq", text)
        self.assertNotIn("Validate strict core envelope", text)

    def test_every_provider_adapter_validates_before_publishing_result(self):
        for worker, path in self.worker_paths.items():
            with self.subTest(worker=worker):
                text = path.read_text(encoding="utf-8")
                self.assertIn("Validate FactoryResult before publication", text)
                self.assertIn("factory_result_validate.py", text)
                self.assertIn("--expected-task-id", text)
                self.assertIn(f"--expected-worker {worker}", text)
                self.assertIn(f"name: validated-factory-result-{worker}", text)
                self.assertNotIn(f"name: factory-result-{worker}\n", text)
                self.assertLess(
                    text.index("Validate FactoryResult before publication"),
                    text.index("Upload validated FactoryResult"),
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)
