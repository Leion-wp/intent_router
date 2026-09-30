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

IDENTITY_SPEC = importlib.util.spec_from_file_location(
    "factory_worker_identity", ROOT / "factory_worker_identity.py"
)
worker_identity = importlib.util.module_from_spec(IDENTITY_SPEC)
assert IDENTITY_SPEC.loader is not None
IDENTITY_SPEC.loader.exec_module(worker_identity)

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


class WorkerIdentityGenerationTests(unittest.TestCase):
    def test_valid_generation_with_malformed_same_task_sibling_fails_closed(self):
        repo = "Leion-wp/example"
        issue = 7
        comments = [
            {
                "body": (
                    "<!-- roots-jules-session task_id=Leion-wp/example#7 "
                    "session=sessions/S2 generation=1 -->\n"
                    "<!-- roots-jules-session task_id=Leion-wp/example#7 "
                    "session=sessions/S3 generation=bogus -->"
                )
            }
        ]
        with self.assertRaises(worker_identity.IdentityConflict):
            worker_identity.issue_identity(repo, issue, comments)


class JulesRestartWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.restart_path = WORKFLOWS / "factory-jules-session-restart.yml"
        cls.frontdoor_path = WORKFLOWS / "factory-jules-session-restart-by-issue.yml"
        cls.watchdog_path = WORKFLOWS / "factory-jules-restart-watchdog.yml"
        cls.ci_rework_path = WORKFLOWS / "factory-jules-ci-rework.yml"
        cls.resume_path = WORKFLOWS / "factory-jules-resume.yml"
        cls.stalled_reconciler_path = WORKFLOWS / "factory-stalled-reconciler.yml"
        cls.quality_risk_path = WORKFLOWS / "factory-quality-risk-reconciler.yml"
        cls.quality_gate_path = WORKFLOWS / "factory-copilot-quality-gate.yml"
        cls.quality_block_path = WORKFLOWS / "factory-quality-block-reconciler.yml"
        cls.quality_block_human_rework_path = WORKFLOWS / "factory-quality-block-human-rework.yml"
        cls.restart_text = cls.restart_path.read_text(encoding="utf-8")
        cls.frontdoor_text = cls.frontdoor_path.read_text(encoding="utf-8")
        cls.watchdog_text = cls.watchdog_path.read_text(encoding="utf-8")
        cls.ci_rework_text = cls.ci_rework_path.read_text(encoding="utf-8")
        cls.resume_text = cls.resume_path.read_text(encoding="utf-8")
        cls.stalled_reconciler_text = cls.stalled_reconciler_path.read_text(encoding="utf-8")
        cls.quality_risk_text = cls.quality_risk_path.read_text(encoding="utf-8")
        cls.quality_gate_text = cls.quality_gate_path.read_text(encoding="utf-8")
        cls.quality_block_text = cls.quality_block_path.read_text(encoding="utf-8")
        cls.quality_block_human_rework_text = cls.quality_block_human_rework_path.read_text(encoding="utf-8")
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

    def test_restart_reason_is_audit_only_not_worker_authority(self):
        self.assertIn("JULES_RESTART_INTENT: mode=${MODE}; reason=${reason_text}", self.restart_text)
        self.assertNotIn("Restart reason:", self.restart_text)
        prompt_at = self.restart_text.index("CONTROL-PLANE POLICY (authoritative):")
        prompt_end = self.restart_text.index("/tmp/replacement-request.json", prompt_at)
        self.assertNotIn("REASON", self.restart_text[prompt_at:prompt_end])
        self.assertNotIn("reason_text", self.restart_text[prompt_at:prompt_end])

    def test_live_governance_is_revalidated_before_provider_side_effects_and_restore(self):
        before_delete = self.restart_text.index("RESTART_REFUSED_LIVE_GOVERNANCE_BEFORE_DELETE")
        delete_at = self.restart_text.index("-X DELETE")
        before_create = self.restart_text.index("RESTART_REFUSED_LIVE_GOVERNANCE_BEFORE_CREATE")
        create_at = self.restart_text.index("'https://jules.googleapis.com/v1alpha/sessions' > /tmp/replacement-session.json")
        persisted_at = self.restart_text.index("gh api --method POST \"repos/${TARGET_REPO}/issues/${ISSUE_NUMBER}/comments\" -f body=\"$body\"")
        before_restore = self.restart_text.index("RESTART_REFUSED_LIVE_GOVERNANCE_BEFORE_RESTORE")
        restore_at = self.restart_text.index("--add-label 'factory:dispatched'", before_restore)
        self.assertLess(before_delete, delete_at)
        self.assertLess(delete_at, before_create)
        self.assertLess(before_create, create_at)
        self.assertLess(create_at, persisted_at)
        self.assertLess(persisted_at, before_restore)
        self.assertLess(before_restore, restore_at)
        helper_text = (ROOT / "factory_jules_restart.py").read_text(encoding="utf-8")
        for marker in (
            "factory:agent:chatgpt",
            "factory:blocked",
            "factory:escalated",
            "factory:human-required",
        ):
            self.assertIn(marker, helper_text)
        self.assertEqual(self.restart_text.count("admit-governance /tmp/live-issue-"), 4)


    def test_governance_admission_is_fail_closed(self):
        base = {
            "state": "open",
            "pull_request": None,
            "labels": [{"name": "factory:dispatched"}],
        }
        self.assertTrue(restart.governance_admission(base))
        for label in (
            "factory:blocked",
            "factory:escalated",
            "factory:human-required",
            "factory:agent:chatgpt",
        ):
            candidate = json.loads(json.dumps(base))
            candidate["labels"].append({"name": label})
            self.assertFalse(restart.governance_admission(candidate), label)

        closed = json.loads(json.dumps(base))
        closed["state"] = "closed"
        self.assertFalse(restart.governance_admission(closed))

        pull_request = json.loads(json.dumps(base))
        pull_request["pull_request"] = {"url": "https://example.invalid/pr"}
        self.assertFalse(restart.governance_admission(pull_request))

        self.assertFalse(restart.governance_admission(base, require_restarting=True))
        restarting = json.loads(json.dumps(base))
        restarting["labels"].append({"name": "factory:restarting"})
        self.assertTrue(restart.governance_admission(restarting, require_restarting=True))

    def test_late_human_gate_stops_delete_create_and_restore(self):
        def issue(*labels):
            return {
                "state": "open",
                "pull_request": None,
                "labels": [{"name": label} for label in labels],
            }

        def simulate(before_delete, before_create, before_restore):
            effects = []
            if not restart.governance_admission(before_delete):
                return effects
            effects.append("DELETE")
            if not restart.governance_admission(before_create, require_restarting=True):
                return effects
            effects.append("POST")
            effects.append("PERSIST_IDENTITY")
            if not restart.governance_admission(before_restore):
                return effects
            effects.append("RESTORE_DISPATCHED")
            return effects

        normal = issue("factory:restarting")
        human_locked = issue("factory:restarting", "factory:human-required")

        self.assertEqual(simulate(human_locked, normal, normal), [])
        self.assertEqual(simulate(normal, human_locked, normal), ["DELETE"])
        self.assertEqual(
            simulate(normal, normal, human_locked),
            ["DELETE", "POST", "PERSIST_IDENTITY"],
        )

    def test_workflow_calls_shared_admission_at_each_irreversible_boundary(self):
        checks = (
            ("before-intent", "false"),
            ("before-delete", "false"),
            ("before-create", "true"),
            ("before-restore", "false"),
        )
        for phase, require_restarting in checks:
            self.assertIn(
                f"factory_jules_restart.py admit-governance /tmp/live-issue-{phase}.json {require_restarting}",
                self.restart_text,
            )

        delete_guard = self.restart_text.index("admit-governance /tmp/live-issue-before-delete.json false")
        delete_at = self.restart_text.index("-X DELETE")
        create_guard = self.restart_text.index("admit-governance /tmp/live-issue-before-create.json true")
        create_at = self.restart_text.index("'https://jules.googleapis.com/v1alpha/sessions' > /tmp/replacement-session.json")
        persist_at = self.restart_text.index("complete_marker=", create_at)
        restore_guard = self.restart_text.index("admit-governance /tmp/live-issue-before-restore.json false")
        restore_at = self.restart_text.index("--add-label 'factory:dispatched'", restore_guard)

        self.assertLess(delete_guard, delete_at)
        self.assertLess(delete_at, create_guard)
        self.assertLess(create_guard, create_at)
        self.assertLess(create_at, persist_at)
        self.assertLess(persist_at, restore_guard)
        self.assertLess(restore_guard, restore_at)


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

    def test_ci_rework_event_metadata_is_data_and_secret_is_final_step_scoped(self):
        workflow = yaml.safe_load(self.ci_rework_text)
        job = workflow["jobs"]["feed-ci-failure"]
        self.assertNotIn("JULES_API_KEY", job.get("env", {}))
        self.assertNotIn("toJSON(github.event.workflow_run.pull_requests)", self.ci_rework_text)
        self.assertIn("$GITHUB_EVENT_PATH", self.ci_rework_text)
        self.assertIn(".workflow_run.pull_requests // []", self.ci_rework_text)

        steps = job["steps"]
        send_index = next(
            index for index, step in enumerate(steps)
            if step.get("name") == "Send REWORK to the same Jules session"
        )
        for step in steps[:send_index]:
            self.assertNotIn("JULES_API_KEY", step.get("env", {}))
        send = steps[send_index]
        self.assertEqual(send["env"]["JULES_API_KEY"], "${{ secrets.JULES_API_KEY }}")
        run = send["run"]
        for marker in (
            'pulls/${PR_NUMBER}',
            'issues/${ISSUE_NUMBER}',
            'factory:dispatched',
            'factory:blocked',
            'factory:escalated',
            'factory:human-required',
            'factory:agent:chatgpt',
            'factory_worker_identity.py validate',
            '--comments-json current-comments.json',
            '--pr-json current-pr.json',
            '"$HEAD_SHA"',
        ):
            self.assertIn(marker, run)
        self.assertLess(run.index("current-identity.json"), run.index("jules.googleapis.com"))

    def test_stalled_reconciler_uses_canonical_versioned_identity(self):
        self.assertIn("actions/checkout@v4", self.stalled_reconciler_text)
        self.assertIn("factory_worker_identity", self.stalled_reconciler_text)
        self.assertIn("issue_identity", self.stalled_reconciler_text)
        self.assertIn("IDENTITY_CONFLICT", self.stalled_reconciler_text)
        self.assertIn("canonical persisted Jules session ID", self.stalled_reconciler_text)
        self.assertIn(
            'gh api --paginate --slurp "repos/${repo}/issues/${issue}/comments"',
            self.stalled_reconciler_text,
        )
        self.assertIn("| jq 'add // []'", self.stalled_reconciler_text)
        self.assertNotIn("sed -n 's/.* session=", self.stalled_reconciler_text)

    def test_quality_risk_reconciler_uses_canonical_versioned_identity(self):
        self.assertIn("factory_worker_identity.py", self.quality_risk_text)
        self.assertIn('python "$worker_helper" select', self.quality_risk_text)
        self.assertIn("--comments-json /tmp/comments.json", self.quality_risk_text)
        self.assertIn("--prs-json /tmp/prs.json", self.quality_risk_text)
        self.assertIn('--base "$default_branch"', self.quality_risk_text)
        self.assertIn("canonical worker identity/PR correlation failed", self.quality_risk_text)
        self.assertNotIn("jules_marker=", self.quality_risk_text)
        self.assertNotIn("chatgpt_marker=", self.quality_risk_text)
        self.assertNotIn("sed -n 's/.* session=", self.quality_risk_text)

    def test_identity_consumers_normalize_paginated_comment_history(self):
        for workflow_text in (
            self.stalled_reconciler_text,
            self.quality_gate_text,
            self.quality_block_text,
            self.quality_block_human_rework_text,
        ):
            self.assertIn("gh api --paginate --slurp", workflow_text)
            self.assertIn("| jq 'add // []'", workflow_text)

        self.assertNotIn(
            'gh api --paginate "repos/${TARGET_REPO}/issues/${issue}/comments" > /tmp/identity-comments.json',
            self.quality_gate_text,
        )
        self.assertNotIn(
            'gh api --paginate "repos/${repo}/issues/${issue}/comments" > /tmp/current-comments.json',
            self.quality_gate_text,
        )
        self.assertNotIn(
            'gh api --paginate "repos/${repo}/issues/${issue}/comments" > /tmp/comments.json',
            self.quality_block_text,
        )
        self.assertNotIn(
            'gh api --paginate "repos/${TARGET_REPO}/issues/${ISSUE}/comments"',
            self.quality_block_human_rework_text,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
