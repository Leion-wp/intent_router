"""Regression guard for the completion -> deterministic planning edge."""
from pathlib import Path
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[2]


class CompletionPlanningHandoffTests(unittest.TestCase):
    def test_completion_hands_off_to_planner_before_scheduler(self):
        path = ROOT / '.github/workflows/factory-fleet-completion-reconciler.yml'
        workflow = yaml.safe_load(path.read_text())
        steps = next(iter(workflow['jobs'].values()))['steps']
        scripts = [step.get('run', '') for step in steps]
        planner = next(i for i, script in enumerate(scripts)
                       if 'gh workflow run factory-autonomous-planning.yml' in script)
        scheduler = next(i for i, script in enumerate(scripts)
                         if 'gh workflow run factory-fleet-scheduler.yml' in script)
        self.assertLess(planner, scheduler)
        self.assertIn('--ref Android -f execute=true', scripts[planner])


if __name__ == '__main__':
    unittest.main(verbosity=2)
