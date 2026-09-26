"""Regression tests for local GitHub Actions workflow_run subscriptions."""
from collections import defaultdict
from pathlib import Path
import unittest

import yaml

WORKFLOWS = Path(__file__).resolve().parents[1] / 'workflows'


class WorkflowRunSubscriptionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflows = {}
        cls.names = defaultdict(list)
        for path in sorted(WORKFLOWS.glob('*.yml')):
            data = yaml.safe_load(path.read_text()) or {}
            cls.workflows[path.name] = data
            name = data.get('name')
            if name:
                cls.names[name].append(path.name)

    def test_workflow_display_names_are_unique(self):
        duplicates = {name: paths for name, paths in self.names.items() if len(paths) > 1}
        self.assertEqual(duplicates, {}, f'duplicate workflow display names: {duplicates}')

    def test_every_workflow_run_subscription_targets_a_current_local_workflow_name(self):
        available = set(self.names)
        stale = []
        for filename, data in self.workflows.items():
            triggers = data.get('on') or {}
            workflow_run = triggers.get('workflow_run') if isinstance(triggers, dict) else None
            if not isinstance(workflow_run, dict):
                continue
            for producer_name in workflow_run.get('workflows') or []:
                if producer_name not in available:
                    stale.append((filename, producer_name))
        self.assertEqual(stale, [], f'stale workflow_run subscriptions: {stale}')

    def test_escalated_diagnostics_tracks_current_watchdog_name(self):
        producer = self.workflows['factory-fleet-watchdog.yml']['name']
        consumer = self.workflows['factory-escalated-worker-diagnostics.yml']
        subscriptions = consumer['on']['workflow_run']['workflows']
        self.assertEqual(subscriptions, [producer])
        self.assertIn('workflow_dispatch', consumer['on'])

    def test_portfolio_handoff_tracks_current_producer_names_and_explicit_repository(self):
        producer_files = [
            'factory-fleet-watchdog.yml',
            'factory-fleet-scheduler.yml',
            'factory-cross-repo-dispatch.yml',
            'factory-fleet-completion-reconciler.yml',
            'factory-managed-automerge.yml',
            'factory-autonomous-planning.yml',
            'factory-product-brain.yml',
        ]
        expected = [self.workflows[path]['name'] for path in producer_files]
        consumer = self.workflows['factory-portfolio-telemetry-handoff.yml']
        self.assertEqual(consumer['on']['workflow_run']['workflows'], expected)
        run = consumer['jobs']['refresh']['steps'][0]['run']
        self.assertIn('--repo "$GITHUB_REPOSITORY"', run)


if __name__ == '__main__':
    unittest.main(verbosity=2)
