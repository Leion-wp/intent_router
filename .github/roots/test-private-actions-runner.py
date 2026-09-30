#!/usr/bin/env python3
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
CONTRACT = json.loads((ROOT / "factory-private-actions-runner-v1.json").read_text(encoding="utf-8"))
CI = (ROOT / "fleet/product-ci-self-hosted.yml").read_text(encoding="utf-8")
RELAY = (ROOT / "fleet/product-event-relay.yml").read_text(encoding="utf-8")


class PrivateActionsRunnerContractTests(unittest.TestCase):
    def test_runner_classes_are_distinct_and_self_hosted(self):
        classes = CONTRACT["classes"]
        ci = classes["product_ci"]
        relay = classes["control_relay"]
        self.assertIn("self-hosted", ci["labels"])
        self.assertIn("self-hosted", relay["labels"])
        self.assertIn("roots-private-ci", ci["labels"])
        self.assertIn("roots-private-control", relay["labels"])
        self.assertNotEqual(ci["labels"], relay["labels"])
        self.assertFalse(ci["repository_secrets_allowed"])
        self.assertTrue(relay["repository_secrets_allowed"])
        self.assertFalse(relay["product_checkout_allowed"])

    def test_product_ci_has_no_hosted_runner_fallback(self):
        self.assertIn("runs-on: [self-hosted, linux, x64, roots-private-ci]", CI)
        self.assertNotIn("runs-on: ubuntu-latest", CI)
        self.assertIn("cancel-in-progress: true", CI)

    def test_control_relay_uses_separate_privileged_runner(self):
        self.assertIn("runs-on: [self-hosted, linux, x64, roots-private-control]", RELAY)
        self.assertNotIn("runs-on: ubuntu-latest", RELAY)
        self.assertNotIn("actions/checkout", RELAY)

    def test_contract_forbids_public_private_code_proxy(self):
        invariants = CONTRACT["invariants"]
        self.assertTrue(invariants["separate_runner_classes"])
        self.assertFalse(invariants["github_hosted_fallback_after_migration"])
        self.assertTrue(invariants["public_control_plane_must_not_execute_private_product_code"])
        self.assertTrue(invariants["quality_risk_merge_gates_unchanged"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
