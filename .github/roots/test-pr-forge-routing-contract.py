"""Contract tests for repository-scoped PR Forge writer ownership."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ROUTING = ROOT / ".github/roots/factory-pr-forge-routing-v1.json"
PIPELINE = ROOT / ".github/roots/factory-event-driven-pipeline-v1.md"
WORKFLOWS = ROOT / ".github/workflows"
TARGET = "Leion-wp/micro-saas-boilerplate"


class RoutingContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = json.loads(ROUTING.read_text(encoding="utf-8"))
        cls.pipeline = PIPELINE.read_text(encoding="utf-8")

    def test_micro_saas_has_one_declared_technical_writer(self):
        self.assertEqual(self.contract["version"], 1)
        route = self.contract["repositories"][TARGET]
        self.assertEqual(route["technical_rework_owner"], "Roots — PR Forge")
        self.assertEqual(route["reconciliation_owner"], "Roots — PR Forge Reconciliation")
        self.assertEqual(route["lanes"], ["CI_REWORK", "QUALITY_REWORK", "HARDEN", "INTEGRATE"])
        self.assertFalse(route["native_jules_ci_rework"])
        self.assertFalse(route["native_jules_quality_rework"])

    def _assert_native_jules_writer_skips_target(self, filename):
        text = (WORKFLOWS / filename).read_text(encoding="utf-8")
        self.assertIn("PR Forge owns technical rework for this product", text)
        self.assertIn('[ "$repo" = "Leion-wp/micro-saas-boilerplate" ] && continue', text)

    def test_native_ci_rework_is_fenced_for_delegated_product(self):
        self._assert_native_jules_writer_skips_target("factory-fleet-jules-rework.yml")

    def test_native_quality_rework_is_fenced_for_delegated_product(self):
        self._assert_native_jules_writer_skips_target("factory-fleet-jules-quality-rework.yml")

    def test_pipeline_declares_repository_scoped_writer_routing(self):
        self.assertIn("factory-pr-forge-routing-v1.json", self.pipeline)
        self.assertIn("`factory-fleet-jules-rework.yml` (non-delegated repositories only)", self.pipeline)
        self.assertIn("`factory-fleet-jules-quality-rework.yml` (non-delegated repositories only)", self.pipeline)
        self.assertNotIn("| `factory-ci-completed` | `factory-fleet-jules-rework.yml` +", self.pipeline)
        self.assertNotIn("| `factory-quality-verdict` | `factory-fleet-jules-quality-rework.yml` +", self.pipeline)


if __name__ == "__main__":
    unittest.main(verbosity=2)
