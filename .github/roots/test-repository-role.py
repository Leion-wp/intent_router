#!/usr/bin/env python3
import importlib.util
import json
import pathlib
import tempfile
import unittest

import jsonschema

ROOT = pathlib.Path(__file__).resolve().parent
ROLE_SPEC = importlib.util.spec_from_file_location("role_guard", ROOT / "validate-repository-role.py")
role_guard = importlib.util.module_from_spec(ROLE_SPEC)
assert ROLE_SPEC.loader is not None
ROLE_SPEC.loader.exec_module(role_guard)

BRAIN_SPEC = importlib.util.spec_from_file_location("product_brain", ROOT / "factory-product-brain.py")
product_brain = importlib.util.module_from_spec(BRAIN_SPEC)
assert BRAIN_SPEC.loader is not None
BRAIN_SPEC.loader.exec_module(product_brain)

ACTIVE_PR_SPEC = importlib.util.spec_from_file_location(
    "factory_active_linked_prs", ROOT / "factory_active_linked_prs.py"
)
active_prs = importlib.util.module_from_spec(ACTIVE_PR_SPEC)
assert ACTIVE_PR_SPEC.loader is not None
ACTIVE_PR_SPEC.loader.exec_module(active_prs)


class RepositoryRoleContractTests(unittest.TestCase):
    repo = "Leion-wp/example"

    def profile(self, role="factory_substrate"):
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

    def decision(self, role="factory_substrate"):
        if role == "generated_product":
            context = {
                "value_proposition": "Reduce repetitive work for operators.",
                "target_user": "Small business operators.",
                "next_question": "Does repeated usage support deeper product investment?",
            }
            objective = "Improve the generated product's bounded user workflow."
            hypothesis = "A simpler user workflow will improve product activation."
            metric = "More users complete the product workflow successfully."
        else:
            context = {
                "consumer": "Roots factory + human operator + coding agents",
                "purpose": "Reusable factory substrate for generated micro-SaaS.",
                "next_question": "Which repeated generated-product changes should become declarative substrate capabilities?",
            }
            objective = "Reduce factory manufacturing friction for future generated micro-SaaS."
            hypothesis = "More reusable substrate capabilities reduce product-specific code and manual intervention."
            metric = "Generated micro-SaaS require less product-specific code and fewer manual interventions."
        return {
            "version": 1,
            "decision_id": "role-aware-v1",
            "repository": self.repo,
            "repository_role": role,
            "precondition": {"expected_last_decision_id": None, "expected_phase": None},
            "program": {
                "transition": "PAUSE",
                "program_id": "role-aware-program",
                "title": "Role-aware strategic program",
                "strategic_objective": objective,
                "success_metric": metric,
                "candidate_next_milestones": [],
                "workstreams": [
                    {"id": "role-contract", "title": "Role Contract", "objective": "Keep repository strategy aligned with the deterministic repository role."}
                ],
                "learnings": [],
            },
            "action": "PAUSE",
            "objective": objective,
            "hypothesis": hypothesis,
            "success_metric": metric,
            "product_context": context,
            "confidence": 0.8,
            "risk": "LOW",
            "evidence": ["Repository role contract is available."],
            "milestone": None,
            "human_gate": {"required": False, "reason": ""},
            "extensions": {},
        }

    def write(self, directory, name, value):
        path = pathlib.Path(directory) / name
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def test_factory_substrate_profile_is_valid(self):
        with tempfile.TemporaryDirectory() as directory:
            profile = self.write(directory, "profile.json", self.profile())
            validated = role_guard.validate_profile(profile, self.repo)
            self.assertEqual(validated["repository_role"], "factory_substrate")

    def test_missing_role_fails_closed(self):
        profile_value = self.profile()
        del profile_value["repository_role"]
        with tempfile.TemporaryDirectory() as directory:
            profile = self.write(directory, "profile.json", profile_value)
            with self.assertRaises(jsonschema.ValidationError):
                role_guard.validate_profile(profile, self.repo)

    def test_unknown_role_fails_closed(self):
        profile_value = self.profile("factory_substrate")
        profile_value["repository_role"] = "mystery_role"
        with tempfile.TemporaryDirectory() as directory:
            profile = self.write(directory, "profile.json", profile_value)
            with self.assertRaises(jsonschema.ValidationError):
                role_guard.validate_profile(profile, self.repo)


    def test_missing_governance_fails_closed(self):
        profile_value = self.profile()
        del profile_value["governance"]
        with tempfile.TemporaryDirectory() as directory:
            profile = self.write(directory, "profile.json", profile_value)
            with self.assertRaises(jsonschema.ValidationError):
                role_guard.validate_profile(profile, self.repo)

    def test_incomplete_governance_fails_closed(self):
        for field in ("production_gate", "workflow_changes", "credential_changes"):
            profile_value = self.profile()
            del profile_value["governance"][field]
            with tempfile.TemporaryDirectory() as directory:
                profile = self.write(directory, "profile.json", profile_value)
                with self.assertRaises(jsonschema.ValidationError, msg=field):
                    role_guard.validate_profile(profile, self.repo)

    def test_generated_product_keeps_product_market_context(self):
        with tempfile.TemporaryDirectory() as directory:
            profile = self.write(directory, "profile.json", self.profile("generated_product"))
            decision = self.write(directory, "decision.json", self.decision("generated_product"))
            validated = role_guard.validate_decision_against_profile(decision, profile)
            self.assertEqual(validated["repository_role"], "generated_product")

    def test_factory_substrate_accepts_manufacturing_context(self):
        with tempfile.TemporaryDirectory() as directory:
            profile = self.write(directory, "profile.json", self.profile())
            decision = self.write(directory, "decision.json", self.decision())
            validated = role_guard.validate_decision_against_profile(decision, profile)
            self.assertEqual(validated["repository_role"], "factory_substrate")

    def test_role_mismatch_proposal_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            profile = self.write(directory, "profile.json", self.profile("factory_substrate"))
            decision = self.write(directory, "decision.json", self.decision("generated_product"))
            with self.assertRaisesRegex(ValueError, "repository role mismatch"):
                role_guard.validate_decision_against_profile(decision, profile)

    def test_substrate_external_starter_kit_optimization_is_rejected(self):
        decision_value = self.decision("factory_substrate")
        decision_value["objective"] = "Increase starter kit adoption among indie founders."
        with tempfile.TemporaryDirectory() as directory:
            profile = self.write(directory, "profile.json", self.profile("factory_substrate"))
            decision = self.write(directory, "decision.json", decision_value)
            with self.assertRaisesRegex(ValueError, "cannot optimize external product adoption"):
                role_guard.validate_decision_against_profile(decision, profile)

    def test_substrate_state_role_mismatch_is_rejected(self):
        state = {
            "version": 1,
            "repository": self.repo,
            "repository_role": "generated_product",
            "planner_mode": "DYNAMIC",
            "subject": {
                "name": "example",
                "value_proposition": "Example product value.",
                "target_user": "Example users",
            },
            "phase": "HARDENING",
            "strategy": {
                "current_hypothesis": "Example hypothesis",
                "success_metric": "Example metric",
                "next_question": "Example question?",
            },
            "last_decision": None,
            "governance": {
                "production_gate": "HUMAN_REQUIRED",
                "credential_gate": "HUMAN_REQUIRED",
                "spend_gate": "HUMAN_REQUIRED",
            },
            "updated_at": None,
            "extensions": {},
        }
        with tempfile.TemporaryDirectory() as directory:
            profile = self.write(directory, "profile.json", self.profile("factory_substrate"))
            state_path = self.write(directory, "state.json", state)
            with self.assertRaisesRegex(ValueError, "state repository role mismatch"):
                role_guard.validate_state_against_profile(state_path, profile)

    def test_product_brain_preserves_substrate_role_in_state(self):
        with tempfile.TemporaryDirectory() as directory:
            decision_path = self.write(directory, "decision.json", self.decision("factory_substrate"))
            output = pathlib.Path(directory) / "state.json"
            product_brain.update_state(
                str(decision_path), self.repo, "2026-09-11T15:00:00Z", "-", str(output)
            )
            state = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(state["repository_role"], "factory_substrate")
            self.assertEqual(state["subject"]["consumer"], "Roots factory + human operator + coding agents")
            self.assertNotIn("target_user", state["subject"])


class LocalActivePrAdmissionContractTests(unittest.TestCase):
    def pr(self, number, body="", base="Android"):
        return {
            "number": number,
            "body": body,
            "base": {"ref": base},
            "html_url": f"https://github.com/Leion-wp/intent_router/pull/{number}",
        }

    def test_linked_pr_beyond_default_cli_window_is_detected(self):
        prs = [self.pr(index, f"Unrelated PR {index}") for index in range(1, 35)]
        prs.append(self.pr(35, "Refs #123"))
        matches = active_prs.linked_prs(123, prs, "Android")
        self.assertEqual([pr["number"] for pr in matches], [35])

    def test_multiple_linked_prs_remain_multiple_for_fail_closed_callers(self):
        prs = [self.pr(1, "Fixes #123"), self.pr(40, "References #123")]
        matches = active_prs.linked_prs(123, prs, "Android")
        self.assertEqual([pr["number"] for pr in matches], [1, 40])

    def test_similar_issue_number_does_not_match(self):
        prs = [self.pr(1, "Fixes #1234")]
        self.assertEqual(active_prs.linked_prs(123, prs, "Android"), [])

    def test_local_scheduler_and_dispatch_use_bounded_complete_pr_set(self):
        workflows = ROOT.parent / "workflows"
        for name in ("factory-scheduler.yml", "factory-dispatch.yml"):
            text = (workflows / name).read_text(encoding="utf-8")
            self.assertIn(".github/roots/factory-gh-array-collection.sh", text, msg=name)
            self.assertIn("pulls?state=open&base=Android&per_page=100", text, msg=name)
            self.assertNotIn("gh api --paginate --slurp", text, msg=name)
            self.assertIn("factory_active_linked_prs.py", text, msg=name)
            self.assertNotIn("gh pr list", text, msg=name)
            self.assertIn("CONTROL_PLANE_ANOMALY", text, msg=name)


if __name__ == "__main__":
    unittest.main(verbosity=2)
