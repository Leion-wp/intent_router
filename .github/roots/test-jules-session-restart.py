#!/usr/bin/env python3
import importlib.util
import json
import pathlib
import tempfile
import unittest
from datetime import datetime, timezone

import yaml

ROOT = pathlib.Path(__file__).resolve().parent
WORKFLOWS = ROOT.parent / "workflows"
SPEC = importlib.util.spec_from_file_location("jules_restart", ROOT / "factory_jules_restart.py")
restart = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(restart)


class JulesRestartPolicyTests(unittest.TestCase):
    def test_policy_is_bounded_and_pr_safe(self):
        policy = restart.load_policy()
        self.assertEqual(policy["worker"], "jules")
        self.assertGreaterEqual(policy["automatic"]["no_progress_minutes"], 15)
        self.assertIn("IN_PROGRESS", policy["automatic"]["eligible_states"])
        self.assertLessEqual(policy["max_restarts_per_issue"], 5)
        self.assertEqual(policy["pr_policy"], "REFUSE_IF_OPEN_PR")

    def test_latest_progress_uses_newest_session_or_activity_timestamp(self):
        session = {
            "createTime": "2026-09-11T15:00:00Z",
            "updateTime": "2026-09-11T15:10:00Z",
        }
        activities = {
            "activities": [
                {"createTime": "2026-09-11T15:20:00Z"},
                {"createTime": "2026-09-11T15:15:00Z"},
            ]
        }
        latest = restart.latest_progress_time(session, activities)
        self.assertEqual(latest, datetime(2026, 9, 11, 15, 20, tzinfo=timezone.utc))
        self.assertEqual(
            restart.inactivity_minutes(session, activities, "2026-09-11T16:20:00Z"), 60
        )

    def decision(self, **overrides):
        values = {
            "mode": "automatic",
            "state": "IN_PROGRESS",
            "inactivity": 60,
            "restart_count": 0,
            "has_open_pr": False,
            "blocked": False,
            "human_required": False,
            "escalated": False,
        }
        values.update(overrides)
        return restart.restart_decision(**values)

    def test_automatic_restart_requires_threshold(self):
        self.assertEqual(self.decision(inactivity=59), "noop")
        self.assertEqual(self.decision(inactivity=60), "restart")

    def test_automatic_restart_requires_eligible_state(self):
        self.assertEqual(self.decision(state="AWAITING_USER_FEEDBACK", inactivity=999), "noop")
        self.assertEqual(self.decision(state="FAILED", inactivity=999), "noop")

    def test_manual_restart_bypasses_age_only(self):
        self.assertEqual(self.decision(mode="manual", state="PLANNING", inactivity=0), "restart")
        self.assertEqual(
            self.decision(mode="manual", inactivity=0, has_open_pr=True), "refuse_open_pr"
        )
        self.assertEqual(
            self.decision(mode="manual", inactivity=0, human_required=True),
            "refuse_governance",
        )

    def test_restart_limit_escalates(self):
        policy = restart.load_policy()
        self.assertEqual(
            self.decision(restart_count=policy["max_restarts_per_issue"]),
            "escalate_restart_limit",
        )


class JulesRestartWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.restart_path = WORKFLOWS / "factory-jules-session-restart.yml"
        cls.frontdoor_path = WORKFLOWS / "factory-jules-session-restart-by-issue.yml"
        cls.watchdog_path = WORKFLOWS / "factory-jules-restart-watchdog.yml"
        cls.ci_rework_path = WORKFLOWS / "factory-jules-ci-rework.yml"
        cls.resume_path = WORKFLOWS / "factory-jules-resume.yml"
        cls.stalled_reconciler_path = WORKFLOWS / "factory-stalled-reconciler.yml"
        cls.restart_text = cls.restart_path.read_text(encoding="utf-8")
        cls.frontdoor_text = cls.frontdoor_path.read_text(encoding="utf-8")
        cls.watchdog_text = cls.watchdog_path.read_text(encoding="utf-8")
        cls.ci_rework_text = cls.ci_rework_path.read_text(encoding="utf-8")
        cls.resume_text = cls.resume_path.read_text(encoding="utf-8")
        cls.stalled_reconciler_text = cls.stalled_reconciler_path.read_text(encoding="utf-8")
        cls.restart_yaml = yaml.safe_load(cls.restart_text)
        cls.frontdoor_yaml = yaml.safe_load(cls.frontdoor_text)
        cls.watchdog_yaml = yaml.safe_load(cls.watchdog_text)

    def test_core_restart_requires_canonical_repository(self):
        inputs = self.restart_yaml["on"]["workflow_dispatch"]["inputs"]
        self.assertTrue(inputs["issue_number"]["required"])
        self.assertEqual(inputs["issue_number"]["type"], "number")
        self.assertTrue(inputs["repository"]["required"])
        self.assertNotIn("default", inputs["repository"])
        self.assertIn("Canonical managed repository", inputs["repository"]["description"])
        self.assertEqual(inputs["mode"]["default"], "manual")
        self.assertIn('test -n "$REQUESTED_REPO"', self.restart_text)

    def test_issue_only_manual_frontdoor_delegates_to_canonical_core(self):
        inputs = self.frontdoor_yaml["on"]["workflow_dispatch"]["inputs"]
        self.assertTrue(inputs["issue_number"]["required"])
        self.assertEqual(inputs["issue_number"]["type"], "number")
        self.assertNotIn("repository", inputs)
        self.assertIn("factory-jules-session-restart.yml", self.frontdoor_text)
        self.assertIn('-f issue_number="$ISSUE_NUMBER"', self.frontdoor_text)
        self.assertIn('-f repository="$target_repo"', self.frontdoor_text)
        self.assertIn('-f mode=manual', self.frontdoor_text)
        self.assertIn('--ref Android', self.frontdoor_text)
        self.assertIn('actions: write', self.frontdoor_text)

    def test_kill_is_confirmed_before_replacement_create(self):
        delete_at = self.restart_text.index("-X DELETE")
        verify_at = self.restart_text.index("[ \"$code\" = '404' ]")
        create_at = self.restart_text.index("'https://jules.googleapis.com/v1alpha/sessions' > /tmp/replacement-session.json")
        self.assertLess(delete_at, verify_at)
        self.assertLess(verify_at, create_at)
        self.assertIn("Old Jules session still resolves after DELETE; replacement refused.", self.restart_text)

    def test_existing_pr_is_fail_closed(self):
        self.assertIn("RESTART_REFUSED_OPEN_PR", self.restart_text)
        self.assertIn("REFUSE_IF_OPEN_PR", (ROOT / "factory-jules-restart-policy.json").read_text())
        self.assertIn("V1 restart was allowed only because no correlated open PR existed", self.restart_text)

    def test_restart_is_auditable_and_recoverable(self):
        self.assertIn("roots-jules-restart-intent", self.restart_text)
        self.assertIn("roots-jules-restart-killed", self.restart_text)
        self.assertIn("roots-jules-restart-create-failed", self.restart_text)
        self.assertIn("roots-jules-restart-complete", self.restart_text)
        self.assertIn("factory:restarting", self.restart_text)
        self.assertIn("generation=${ATTEMPT}", self.restart_text)

    def test_automatic_watchdog_only_delegates_after_progress_check(self):
        self.assertIn("progress-minutes", self.watchdog_text)
        self.assertIn(".automatic.eligible_states", self.watchdog_text)
        self.assertIn("factory-jules-session-restart.yml", self.watchdog_text)
        self.assertIn("-f mode=automatic", self.watchdog_text)
        self.assertIn("-f issue_number=\"$issue\"", self.watchdog_text)
        self.assertIn("-f repository=\"$repo\"", self.watchdog_text)
        self.assertIn("actions: write", self.watchdog_text)

    def test_core_restart_serializes_canonical_jules_identity(self):
        concurrency = self.restart_yaml["concurrency"]
        self.assertFalse(concurrency["cancel-in-progress"])
        self.assertEqual(
            concurrency["group"],
            "factory-jules-restart-jules-${{ inputs.repository }}-${{ inputs.issue_number }}",
        )
        self.assertNotIn("auto-resolve", concurrency["group"])
        self.assertIn("inputs.repository", concurrency["group"])
        self.assertIn("inputs.issue_number", concurrency["group"])

    def test_frontdoor_is_not_the_worker_mutation_lock(self):
        concurrency = self.frontdoor_yaml["concurrency"]
        self.assertFalse(concurrency["cancel-in-progress"])
        self.assertEqual(
            concurrency["group"],
            "factory-jules-restart-frontdoor-${{ inputs.issue_number }}",
        )
        self.assertNotIn("repository", concurrency["group"])

    def test_rework_and_resume_use_canonical_worker_identity(self):
        for workflow_text in (self.ci_rework_text, self.resume_text):
            self.assertIn("factory_worker_identity", workflow_text)
            self.assertIn("issue_identity", workflow_text)
            self.assertIn("factory_worker_identity.py validate", workflow_text)
            self.assertNotIn('capture("<!-- roots-jules-session', workflow_text)

        self.assertIn("Resolve canonical Jules identity", self.ci_rework_text)
        self.assertIn("--pr-json pr.json", self.ci_rework_text)
        self.assertIn("--base Android", self.ci_rework_text)
        self.assertIn("Revalidate canonical worker identity before follow-up", self.resume_text)
        self.assertIn("identity_rc", self.resume_text)
        self.assertIn("api_discovery", self.resume_text)
        self.assertIn("Discovered Jules session ${session} does not match active PR branch", self.resume_text)

    def test_stalled_reconciler_uses_canonical_versioned_identity(self):
        self.assertIn("actions/checkout@v4", self.stalled_reconciler_text)
        self.assertIn("factory_worker_identity", self.stalled_reconciler_text)
        self.assertIn("issue_identity", self.stalled_reconciler_text)
        self.assertIn("IDENTITY_CONFLICT", self.stalled_reconciler_text)
        self.assertIn("canonical persisted Jules session ID", self.stalled_reconciler_text)
        self.assertNotIn("sed -n 's/.* session=", self.stalled_reconciler_text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
