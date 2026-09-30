"""Contract tests for repository-scoped PR Forge writer ownership."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ROUTING = ROOT / ".github/roots/factory-pr-forge-routing-v1.json"
RESOLVER = ROOT / ".github/roots/resolve-pr-forge-routing.py"
PIPELINE = ROOT / ".github/roots/factory-event-driven-pipeline-v1.md"
WORKFLOWS = ROOT / ".github/workflows"
TARGET = "Leion-wp/micro-saas-boilerplate"


class RoutingContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = json.loads(ROUTING.read_text(encoding="utf-8"))
        cls.pipeline = PIPELINE.read_text(encoding="utf-8")

    def _resolve(self, repository, lane, routing=ROUTING):
        return subprocess.run(
            [
                sys.executable,
                str(RESOLVER),
                "--routing",
                str(routing),
                "--repository",
                repository,
                "--lane",
                lane,
            ],
            check=False,
            capture_output=True,
            text=True,
        )

    def _write_contract(self, contract):
        tempdir = tempfile.TemporaryDirectory()
        path = Path(tempdir.name) / "routing.json"
        path.write_text(json.dumps(contract), encoding="utf-8")
        self.addCleanup(tempdir.cleanup)
        return path

    def test_micro_saas_has_one_declared_technical_writer(self):
        self.assertEqual(self.contract["version"], 1)
        route = self.contract["repositories"][TARGET]
        self.assertEqual(route["technical_rework_owner"], "Roots — PR Forge")
        self.assertEqual(route["reconciliation_owner"], "Roots — PR Forge Reconciliation")
        self.assertEqual(route["lanes"], ["CI_REWORK", "QUALITY_REWORK", "HARDEN", "INTEGRATE"])
        self.assertFalse(route["native_jules_ci_rework"])
        self.assertFalse(route["native_jules_quality_rework"])

    def test_delegated_ci_and_quality_lanes_disable_native_jules(self):
        for lane in ("CI_REWORK", "QUALITY_REWORK"):
            with self.subTest(lane=lane):
                result = self._resolve(TARGET, lane)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.strip(), "false")

    def test_non_delegated_repository_keeps_native_jules(self):
        for lane in ("CI_REWORK", "QUALITY_REWORK"):
            with self.subTest(lane=lane):
                result = self._resolve("Leion-wp/example-product", lane)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.strip(), "true")

    def test_contradictory_delegation_fails_closed(self):
        contract = json.loads(json.dumps(self.contract))
        contract["repositories"][TARGET]["native_jules_ci_rework"] = True
        result = self._resolve(TARGET, "CI_REWORK", self._write_contract(contract))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("routing contract error", result.stderr)

    def test_disabled_native_writer_without_lane_delegation_fails_closed(self):
        contract = json.loads(json.dumps(self.contract))
        route = contract["repositories"][TARGET]
        route["lanes"].remove("QUALITY_REWORK")
        result = self._resolve(TARGET, "QUALITY_REWORK", self._write_contract(contract))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("routing contract error", result.stderr)

    def test_invalid_json_fails_closed(self):
        tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(tempdir.cleanup)
        path = Path(tempdir.name) / "routing.json"
        path.write_text("{not-json", encoding="utf-8")
        result = self._resolve(TARGET, "CI_REWORK", path)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("routing contract error", result.stderr)

    def _assert_native_writer_consumes_canonical_routing(self, filename, lane):
        text = (WORKFLOWS / filename).read_text(encoding="utf-8")
        self.assertIn('ROUTING_FILE=".github/roots/factory-pr-forge-routing-v1.json"', text)
        self.assertIn('ROUTING_RESOLVER=".github/roots/resolve-pr-forge-routing.py"', text)
        self.assertIn("--lane " + lane, text)
        self.assertIn('native_jules_rework="$(python3 "$ROUTING_RESOLVER"', text)
        self.assertNotIn('[ "$repo" = "Leion-wp/micro-saas-boilerplate" ] && continue', text)

    def test_native_ci_rework_consumes_canonical_routing(self):
        self._assert_native_writer_consumes_canonical_routing(
            "factory-fleet-jules-rework.yml", "CI_REWORK"
        )

    def test_native_quality_rework_consumes_canonical_routing(self):
        self._assert_native_writer_consumes_canonical_routing(
            "factory-fleet-jules-quality-rework.yml", "QUALITY_REWORK"
        )

    def test_pipeline_declares_repository_scoped_writer_routing(self):
        self.assertIn("factory-pr-forge-routing-v1.json", self.pipeline)
        self.assertGreaterEqual(self.pipeline.count("non-delegated repositories only"), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
