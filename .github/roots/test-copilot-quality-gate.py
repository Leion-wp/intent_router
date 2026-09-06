from pathlib import Path
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / '.github/workflows'


class CopilotQualityGateTests(unittest.TestCase):
    def workflow(self, name):
        return yaml.safe_load((WORKFLOWS / name).read_text())

    def test_ci_completion_dispatches_quality_gate_immediately(self):
        workflow = self.workflow('factory-fleet-events.yml')
        steps = workflow['jobs']['wake']['steps']
        step = next(item for item in steps if item.get('name') == 'Run event-driven Copilot Quality Gate on CI completion')
        self.assertEqual(step['if'], "env.EVENT_TYPE == 'factory-ci-completed'")
        self.assertEqual(step['uses'], 'actions/github-script@v7')
        script = step['with']['script']
        self.assertIn('createWorkflowDispatch', script)
        self.assertIn("workflow_id: 'factory-copilot-quality-gate.yml'", script)
        self.assertIn("ref: 'Android'", script)
        self.assertIn('process.env.TARGET_REPO', script)

    def test_quality_gate_is_bounded_and_exact_head(self):
        workflow = self.workflow('factory-copilot-quality-gate.yml')
        self.assertEqual(workflow['permissions']['contents'], 'read')
        self.assertEqual(workflow['permissions']['copilot-requests'], 'write')
        self.assertIn('workflow_dispatch', workflow['on'])
        job = workflow['jobs']['review']
        self.assertEqual(job['timeout-minutes'], 10)
        scripts = '\n'.join(step.get('run', '') for step in job['steps'])
        self.assertIn('factory-ci is not green', scripts)
        self.assertIn('current_sha=', scripts)
        self.assertIn('roots-quality-verdict head=${sha} verdict=${verdict}', scripts)
        self.assertIn('another exact-head verdict won the race', scripts)


if __name__ == '__main__':
    unittest.main(verbosity=2)
