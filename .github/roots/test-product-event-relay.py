"""Offline tests of the product relay's real bash/jq event classifier and sender."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import yaml

ROOT = Path(__file__).resolve().parent
WORKFLOW = yaml.safe_load((ROOT / 'fleet/product-event-relay.yml').read_text())
STEPS = WORKFLOW['jobs']['relay']['steps']
REPO = 'Leion-wp/micro-saas-boilerplate'


class RelayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.env = {**os.environ, 'GITHUB_REPOSITORY': REPO,
                    'GITHUB_EVENT_PATH': str(self.path / 'event.json'),
                    'GITHUB_OUTPUT': str(self.path / 'output'),
                    'MANUAL_EVENT_TYPE': ''}

    def classify(self, name, payload, manual=''):
        (self.path / 'event.json').write_text(json.dumps(payload))
        (self.path / 'output').write_text('')
        result = subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', STEPS[0]['run']],
                                env={**self.env, 'GITHUB_EVENT_NAME': name, 'MANUAL_EVENT_TYPE': manual},
                                text=True, capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        return (self.path / 'output').read_text().strip().removeprefix('event_type=')

    def test_ci_success_and_failure_both_wake_receiver(self):
        run = dict(event='pull_request', status='completed', path='.github/workflows/factory-ci.yml',
                   head_repository={'full_name': REPO})
        for conclusion in ['success', 'failure', 'cancelled', 'timed_out']:
            self.assertEqual(self.classify('workflow_run', {'workflow_run': {**run, 'conclusion': conclusion}}),
                             'factory-ci-completed')
        for change in [dict(event='push'), dict(status='in_progress'),
                       dict(path='.github/workflows/other.yml'), dict(head_repository={'full_name': 'fork/repo'})]:
            self.assertEqual(self.classify('workflow_run', {'workflow_run': {**run, **change}}), '')

    def test_only_merged_pr_not_abandoned_pr(self):
        pr = dict(merged=True, base={'repo': {'full_name': REPO}})
        self.assertEqual(self.classify('pull_request_target', {'action': 'closed', 'pull_request': pr}),
                         'factory-pr-merged')
        pr['merged'] = False
        self.assertEqual(self.classify('pull_request_target', {'action': 'closed', 'pull_request': pr}), '')

    def test_all_quality_verdicts_on_source_issue_only(self):
        for verdict in ['PASS', 'PASS_WITH_FOLLOW_UP', 'REWORK', 'BLOCK']:
            body = f"Report\n<!-- roots-quality-verdict head={'a' * 40} verdict={verdict} -->\nRisk: low"
            event = {'issue': {}, 'comment': {'body': body}}
            self.assertEqual(self.classify('issue_comment', event), 'factory-quality-verdict')
            event['issue']['pull_request'] = {'url': 'https://example.com/pr'}
            self.assertEqual(self.classify('issue_comment', event), '')
        for body in ['ordinary discussion', '<!-- roots-quality-verdict head=short verdict=PASS -->',
                     '$(touch /tmp/should-not-run)', None]:
            self.assertEqual(self.classify('issue_comment', {'issue': {}, 'comment': {'body': body}}), '')

    def test_product_brain_proposal_label_has_dedicated_event(self):
        payload = {
            'action': 'labeled',
            'label': {'name': 'factory:brain-proposal'},
            'issue': {'labels': [{'name': 'factory:brain-proposal'}]},
        }
        self.assertEqual(self.classify('issues', payload), 'factory-product-proposal')
        payload['issue']['pull_request'] = {'url': 'https://example.com/pr'}
        self.assertEqual(self.classify('issues', payload), '')

    def test_queue_producers_and_blocker_resolution(self):
        for action in ['opened', 'edited', 'reopened']:
            payload = {'action': action, 'issue': {'labels': [{'name': 'factory:queued'}]}}
            self.assertEqual(self.classify('issues', payload), 'factory-queue-updated')
            payload['issue']['labels'] = []
            self.assertEqual(self.classify('issues', payload), '')
        self.assertEqual(self.classify('issues', {'action': 'closed', 'issue': {}}), 'factory-queue-updated')
        for action, label, expected in [('labeled', 'factory:queued', 'factory-queue-updated'),
                                         ('unlabeled', 'factory:blocked', 'factory-queue-updated'),
                                         ('labeled', 'factory:done', ''), ('labeled', 'factory:dispatched', '')]:
            self.assertEqual(self.classify('issues', {'action': action, 'label': {'name': label}, 'issue': {}}), expected)

    def test_sender_uses_only_actions_dispatch_to_android_and_fails_without_token(self):
        executable = self.path / 'gh'
        executable.write_text('#!/usr/bin/env python3\nimport json,os,sys\nfrom pathlib import Path\n'
                              'args=sys.argv[1:]\n'
                              'payload=json.loads(Path(args[args.index("--input")+1]).read_text())\n'
                              'Path(os.environ["CAPTURE"]).write_text(json.dumps({"args":args,"payload":payload}))\n')
        executable.chmod(0o755)
        env = {**self.env, 'PATH': f'{self.path}:{os.environ["PATH"]}',
               'EVENT_TYPE': 'factory-ci-completed', 'CAPTURE': str(self.path / 'capture'), 'GH_TOKEN': ''}
        result = subprocess.run(['bash', '-c', STEPS[1]['run']], env=env, text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('HUMAN_REQUIRED', result.stderr)
        self.assertFalse((self.path / 'capture').exists())
        env['GH_TOKEN'] = 'offline-fixture'
        result = subprocess.run(['bash', '-c', STEPS[1]['run']], env=env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        captured = json.loads((self.path / 'capture').read_text())
        self.assertEqual(captured['payload'], {'ref': 'Android', 'inputs': {'repository': REPO, 'event_type': 'factory-ci-completed'}})
        self.assertEqual(captured['args'][3], 'repos/Leion-wp/intent_router/actions/workflows/factory-fleet-events.yml/dispatches')

    def test_no_product_checkout_no_secret_in_classifier_no_cron(self):
        self.assertEqual(WORKFLOW['permissions'], {})
        self.assertNotIn('schedule', WORKFLOW['on'])
        self.assertFalse(any('uses' in step for step in STEPS))
        self.assertNotIn('secrets.', json.dumps(STEPS[0]))
        for step in STEPS:
            result = subprocess.run(['bash', '-n'], input=step['run'], text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)
