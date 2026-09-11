"""Regression guards for completion -> planning -> dispatch ownership."""
from pathlib import Path
import importlib.util
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[2]
IDENTITY_SPEC = importlib.util.spec_from_file_location(
    'factory_worker_identity', ROOT / '.github/roots/factory_worker_identity.py'
)
identity = importlib.util.module_from_spec(IDENTITY_SPEC)
assert IDENTITY_SPEC.loader is not None
IDENTITY_SPEC.loader.exec_module(identity)


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

    def test_completion_requires_shared_worker_pr_correlation(self):
        path = ROOT / '.github/workflows/factory-fleet-completion-reconciler.yml'
        workflow = yaml.safe_load(path.read_text())
        script = next(
            step.get('run', '')
            for step in next(iter(workflow['jobs'].values()))['steps']
            if step.get('name') == 'Close completed issues and advance the fleet'
        )
        self.assertIn('factory_worker_identity.py', script)
        self.assertIn('python "$identity_helper" select', script)
        self.assertIn('--state merged', script)
        self.assertNotIn('explicit issue reference first', script)
        self.assertNotIn('test("(?i)(fixes|closes|resolves|refs|references)', script)

    def test_unrelated_merged_pr_reference_cannot_complete_jules_identity(self):
        repo = 'Leion-wp/example-product'
        issue_number = 42
        comments = [
            {'body': '<!-- roots-jules-session task_id=Leion-wp/example-product#42 session=sessions/abc123 -->'}
        ]
        merged_prs = [
            {
                'number': 99,
                'body': 'Refs #42',
                'headRefName': 'manual/unrelated-change',
                'baseRefName': 'main',
                'isDraft': False,
            }
        ]
        with self.assertRaises(identity.IdentityNoMatch):
            identity.select_pr(repo, issue_number, comments, merged_prs, 'main')

    def test_canonical_merged_jules_pr_is_selected(self):
        repo = 'Leion-wp/example-product'
        issue_number = 42
        comments = [
            {'body': '<!-- roots-jules-session task_id=Leion-wp/example-product#42 session=sessions/abc123 -->'}
        ]
        merged_prs = [
            {
                'number': 100,
                'body': 'Fixes #42',
                'headRefName': 'jules/feature-abc123',
                'baseRefName': 'main',
                'isDraft': False,
                'headRefOid': 'a' * 40,
            }
        ]
        selected = identity.select_pr(repo, issue_number, comments, merged_prs, 'main')
        self.assertEqual(selected['provider'], 'jules')
        self.assertEqual(selected['pr'], 100)
        self.assertEqual(selected['branch'], 'jules/feature-abc123')

    def test_canonical_chatgpt_identity_stays_bound_to_exact_pr(self):
        repo = 'Leion-wp/example-product'
        issue_number = 43
        comments = [
            {
                'body': '<!-- roots-chatgpt-worker task_id=Leion-wp/example-product#43 branch=chatgpt/task-43 pr=101 -->'
            }
        ]
        merged_prs = [
            {
                'number': 102,
                'body': 'Refs #43',
                'headRefName': 'chatgpt/task-43',
                'baseRefName': 'main',
                'isDraft': False,
            }
        ]
        with self.assertRaises(identity.IdentityConflict):
            identity.select_pr(repo, issue_number, comments, merged_prs, 'main')

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
