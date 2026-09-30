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
RUNNER = ROOT / ".github/roots/run-one-private-actions-runner.sh"


def load_broker_module():
    spec = importlib.util.spec_from_file_location("roots_private_runner_broker", BROKER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class PrivateRunnerPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.policy = json.loads(POLICY.read_text(encoding="utf-8"))
        cls.schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
        cls.broker = load_broker_module()

    def test_private_profile_is_one_job_ephemeral_self_hosted(self):
        profile = self.policy["profiles"]["private_ephemeral"]
        self.assertEqual(profile["repository_visibility"], "private")
        self.assertEqual(profile["runner_strategy"], "ephemeral_self_hosted")
        self.assertEqual(
            profile["required_labels"],
            ["self-hosted", "linux", "x64", "roots-private-ci"],
        )
        self.assertEqual(profile["max_jobs_per_registration"], 1)
        self.assertTrue(profile["requires_disposable_environment"])
        self.assertFalse(profile["automatic_github_hosted_fallback"])

    def test_private_repository_scope_is_explicit_and_bounded(self):
        self.assertEqual(
            self.policy["managed_private_repositories"],
            [
                "Leion-wp/micro-saas-boilerplate",
                "Leion-wp/memory_factory",
            ],
        )

    def test_sensitive_private_workflows_share_the_ephemeral_profile(self):
        workflows = self.policy["managed_private_workflows"]
        self.assertEqual(workflows["factory-ci"], "private_ephemeral")
        self.assertEqual(workflows["factory-product-event-relay"], "private_ephemeral")

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

    def test_runner_consumes_and_deletes_token_file(self):
        text = RUNNER.read_text(encoding="utf-8")
        self.assertIn("ROOTS_RUNNER_REGISTRATION_TOKEN_FILE", text)
        self.assertIn('registration_token="$(cat "$token_file")"', text)
        self.assertIn('rm -f "$token_file"', text)
        self.assertIn("--ephemeral", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
