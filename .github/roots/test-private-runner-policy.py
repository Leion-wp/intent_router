"""Contract tests for private-repository Actions runner policy."""
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / ".github/roots/factory-private-runner-policy-v1.json"
SCHEMA = ROOT / ".github/roots/factory-private-runner-policy.schema.json"
BROKER = ROOT / ".github/roots/mint-private-runner-registration.py"
VERSION_CHECKER = ROOT / ".github/roots/check-private-runner-version.py"
RUNNER = ROOT / ".github/roots/run-one-private-actions-runner.sh"
RUNNER_PIN = ROOT / ".github/roots/factory-private-runner-version-v1.json"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class PrivateRunnerPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.policy = json.loads(POLICY.read_text(encoding="utf-8"))
        cls.schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
        cls.broker = load_module("roots_private_runner_broker", BROKER)
        cls.version_checker = load_module("roots_private_runner_version", VERSION_CHECKER)

    def test_untrusted_private_profile_is_one_job_ephemeral(self):
        profile = self.policy["profiles"]["private_untrusted_ephemeral"]
        self.assertEqual(profile["repository_visibility"], "private")
        self.assertEqual(profile["runner_strategy"], "ephemeral_self_hosted")
        self.assertEqual(
            profile["required_labels"],
            ["self-hosted", "linux", "x64", "roots-private-ci"],
        )
        self.assertEqual(profile["max_jobs_per_registration"], 1)
        self.assertTrue(profile["requires_disposable_environment"])
        self.assertFalse(profile["automatic_github_hosted_fallback"])
        self.assertTrue(profile["may_execute_untrusted_pr_code"])
        self.assertFalse(profile["may_hold_cross_repo_relay_secret"])

    def test_privileged_control_profile_is_isolated_from_pr_code(self):
        profile = self.policy["profiles"]["private_control_ephemeral"]
        self.assertEqual(
            profile["required_labels"],
            ["self-hosted", "linux", "x64", "roots-private-control"],
        )
        self.assertEqual(profile["max_jobs_per_registration"], 1)
        self.assertTrue(profile["requires_disposable_environment"])
        self.assertFalse(profile["automatic_github_hosted_fallback"])
        self.assertFalse(profile["may_execute_untrusted_pr_code"])
        self.assertTrue(profile["may_hold_cross_repo_relay_secret"])

    def test_no_private_profile_combines_untrusted_code_and_relay_secret(self):
        for name, profile in self.policy["profiles"].items():
            if profile["repository_visibility"] != "private":
                continue
            with self.subTest(profile=name):
                self.assertFalse(
                    profile["may_execute_untrusted_pr_code"]
                    and profile["may_hold_cross_repo_relay_secret"]
                )

    def test_private_workflows_are_split_by_trust_boundary(self):
        workflows = self.policy["managed_private_workflows"]
        self.assertEqual(workflows["factory-ci"], "private_untrusted_ephemeral")
        self.assertEqual(workflows["memory-validate"], "private_untrusted_ephemeral")
        self.assertEqual(
            workflows["factory-product-event-relay"],
            "private_control_ephemeral",
        )
        self.assertNotEqual(
            workflows["factory-ci"],
            workflows["factory-product-event-relay"],
        )

    def test_private_repository_scope_is_explicit_and_bounded(self):
        self.assertEqual(
            self.policy["managed_private_repositories"],
            [
                "Leion-wp/micro-saas-boilerplate",
                "Leion-wp/memory_factory",
            ],
        )

    def test_public_control_plane_remains_on_github_hosted(self):
        profile = self.policy["profiles"]["public_control_plane"]
        self.assertEqual(profile["repository_visibility"], "public")
        self.assertEqual(profile["runner_strategy"], "github_hosted_standard")
        self.assertEqual(profile["required_labels"], ["ubuntu-latest"])

    def test_broker_reads_same_repository_allowlist(self):
        self.assertEqual(
            self.broker.load_allowed_repositories(POLICY),
            set(self.policy["managed_private_repositories"]),
        )

    def test_broker_secret_file_is_private_and_non_overwriting(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runner-token"
            self.broker.write_secret_file(path, "short-lived-registration-token")
            self.assertEqual(path.read_text(encoding="utf-8"), "short-lived-registration-token\n")
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            with self.assertRaises(SystemExit):
                self.broker.write_secret_file(path, "replacement-token")

    def test_runner_version_pin_is_explicit_and_checksum_bound(self):
        pin = json.loads(RUNNER_PIN.read_text(encoding="utf-8"))
        self.assertEqual(pin["version"], 1)
        self.assertRegex(pin["runner_version"], r"^\d+\.\d+\.\d+$")
        self.assertEqual(pin["platform"], "linux")
        self.assertEqual(pin["architecture"], "x64")
        self.assertRegex(pin["sha256"], r"^[0-9a-f]{64}$")
        self.assertIn(pin["runner_version"], pin["asset"])

    def test_runner_version_watch_allows_current_verified_asset(self):
        pin = json.loads(RUNNER_PIN.read_text(encoding="utf-8"))
        latest = {
            "tag_name": "v" + pin["runner_version"],
            "published_at": pin["published_at"],
            "assets": [{"name": pin["asset"], "digest": "sha256:" + pin["sha256"]}],
        }
        now = self.version_checker.parse_time(pin["published_at"])
        self.assertEqual(self.version_checker.evaluate(pin, latest, now), ("CURRENT", 0))

    def test_runner_version_watch_warns_then_fails_before_github_deadline(self):
        pin = json.loads(RUNNER_PIN.read_text(encoding="utf-8"))
        latest = {
            "tag_name": "v99.0.0",
            "published_at": "2026-09-01T00:00:00Z",
            "assets": [],
        }
        published = self.version_checker.parse_time(latest["published_at"])
        self.assertEqual(
            self.version_checker.evaluate(
                pin, latest, published + self.version_checker.dt.timedelta(days=5)
            ),
            ("UPDATE_AVAILABLE", 0),
        )
        self.assertEqual(
            self.version_checker.evaluate(
                pin, latest, published + self.version_checker.dt.timedelta(days=21)
            ),
            ("UPDATE_REQUIRED", 1),
        )

    def test_runner_version_watch_rejects_digest_drift(self):
        pin = json.loads(RUNNER_PIN.read_text(encoding="utf-8"))
        latest = {
            "tag_name": "v" + pin["runner_version"],
            "published_at": pin["published_at"],
            "assets": [{"name": pin["asset"], "digest": "sha256:" + ("0" * 64)}],
        }
        now = self.version_checker.parse_time(pin["published_at"])
        self.assertEqual(
            self.version_checker.evaluate(pin, latest, now),
            ("PIN_DIGEST_MISMATCH", 2),
        )

    def test_runner_consumes_token_file_and_accepts_only_canonical_classes(self):
        text = RUNNER.read_text(encoding="utf-8")
        self.assertIn("ROOTS_RUNNER_REGISTRATION_TOKEN_FILE", text)
        self.assertIn('registration_token="$(cat "$token_file")"', text)
        self.assertIn('rm -f "$token_file"', text)
        self.assertIn("roots-private-ci|roots-private-control", text)
        self.assertIn('--labels "$runner_label"', text)
        self.assertIn("--ephemeral", text)
        self.assertIn("--disableupdate", text)
        self.assertIn("factory-private-runner-version-v1.json", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
