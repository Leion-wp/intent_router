"""Contract tests for private-repository Actions runner policy."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / ".github/roots/factory-private-runner-policy-v1.json"
SCHEMA = ROOT / ".github/roots/factory-private-runner-policy.schema.json"


class PrivateRunnerPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.policy = json.loads(POLICY.read_text(encoding="utf-8"))
        cls.schema = json.loads(SCHEMA.read_text(encoding="utf-8"))

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

    def test_sensitive_private_workflows_share_the_ephemeral_profile(self):
        workflows = self.policy["managed_private_workflows"]
        self.assertEqual(workflows["factory-ci"], "private_ephemeral")
        self.assertEqual(workflows["factory-product-event-relay"], "private_ephemeral")

    def test_public_control_plane_remains_on_github_hosted(self):
        profile = self.policy["profiles"]["public_control_plane"]
        self.assertEqual(profile["repository_visibility"], "public")
        self.assertEqual(profile["runner_strategy"], "github_hosted_standard")
        self.assertEqual(profile["required_labels"], ["ubuntu-latest"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
