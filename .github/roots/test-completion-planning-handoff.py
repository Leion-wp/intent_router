"""Regression guards for completion -> planning -> dispatch ownership."""
from pathlib import Path
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[2]


class CompletionPlanningHandoffTests(unittest.TestCase):
    def test_completion_hands_off_only_to_planner(self):
        path = ROOT / '.github/workflows/factory-fleet-completion-reconciler.yml'
        workflow = yaml.safe_load(path.read_text())
        scripts = [step.get('run', '') for step in next(iter(workflow['jobs'].values()))['steps']]
        planner_scripts = [script for script in scripts if 'gh workflow run factory-autonomous-planning.yml' in script]
        scheduler_scripts = [script for script in scripts if 'gh workflow run factory-fleet-scheduler.yml' in script]
        self.assertEqual(len(planner_scripts), 1)
        self.assertIn('--ref Android -f execute=true', planner_scripts[0])
        self.assertEqual(scheduler_scripts, [], 'Completion must not race planning with an early scheduler dispatch')

    def test_planner_hands_materialized_queue_to_dispatch_only(self):
        path = ROOT / '.github/workflows/factory-autonomous-planning.yml'
        workflow = yaml.safe_load(path.read_text())
        scripts = [step.get('run', '') for step in next(iter(workflow['jobs'].values()))['steps']]
        scheduler = next(script for script in scripts if 'gh workflow run factory-fleet-scheduler.yml' in script)
        self.assertIn('-f execute=true -f dispatch_only=true', scheduler)

    def test_planner_hands_completed_fixed_roadmap_to_dynamic_planning(self):
        path = ROOT / '.github/workflows/factory-autonomous-planning.yml'
        workflow = yaml.safe_load(path.read_text())
        steps = next(iter(workflow['jobs'].values()))['steps']
        dynamic = next(step for step in steps if step.get('name') == 'Hand completed fixed roadmap directly to dynamic planning')
        self.assertEqual(dynamic['if'], "steps.planning.outputs.needs_dynamic_handoff == '1' && env.EXECUTE == 'true'")
        self.assertIn('gh workflow run factory-dynamic-planning-handoff.yml', dynamic['run'])
        self.assertIn('--ref Android', dynamic['run'])

    def test_product_brain_hands_materialized_queue_to_dispatch_only(self):
        path = ROOT / '.github/workflows/factory-product-brain.yml'
        workflow = yaml.safe_load(path.read_text())
        scripts = [step.get('run', '') for step in next(iter(workflow['jobs'].values()))['steps']]
        scheduler = next(script for script in scripts if 'gh workflow run factory-fleet-scheduler.yml' in script)
        self.assertIn('-f execute=true -f dispatch_only=true', scheduler)


if __name__ == '__main__':
    unittest.main(verbosity=2)
