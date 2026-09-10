from pathlib import Path
import json
import os
import subprocess
import tempfile
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / '.github/workflows'
REPO = 'Leion-wp/product'
CONTROL = 'Leion-wp/intent_router'
SHA_A = 'a' * 40
SHA_B = 'b' * 40
TOKEN_A = '11111111111'
TOKEN_B = '22222222222'


FAKE_GH = r'''#!/usr/bin/env python3
import json
import os
import subprocess
import sys

args = sys.argv[1:]

def values(flag):
    return [args[i + 1] for i, arg in enumerate(args[:-1]) if arg == flag]

def value(flag, default=None):
    vals = values(flag)
    return vals[0] if vals else default

def emit(data):
    expression = value('--jq')
    if expression:
        result = subprocess.run(['jq', '-r', expression], input=json.dumps(data), text=True, capture_output=True)
        sys.stdout.write(result.stdout)
        sys.stderr.write(result.stderr)
        raise SystemExit(result.returncode)
    print(json.dumps(data))
    raise SystemExit(0)

def api_endpoint():
    valued = {'-H', '--jq', '--method', '-f', '-F', '--input'}
    i = 1
    while i < len(args):
        if args[i] in valued:
            i += 2
        elif args[i].startswith('-'):
            i += 1
        else:
            return args[i].split('?', 1)[0]
    raise SystemExit('missing api endpoint: ' + repr(args))

mismatch_first = os.environ.get('MISMATCH_FIRST', 'false') == 'true'
chatgpt_bad_pr = os.environ.get('CHATGPT_BAD_PR', 'false') == 'true'
conflict_first = os.environ.get('CONFLICT_FIRST', 'false') == 'true'
first_branch = 'chatgpt-17' if chatgpt_bad_pr else 'jules-a-11111111111'
first_body = 'Fixes #18' if mismatch_first else 'Fixes #17'

issue17_comments = []
if chatgpt_bad_pr:
    issue17_comments.append({
        'body': '<!-- roots-chatgpt-worker task_id=Leion-wp/product#17 branch=chatgpt-17 pr=999 -->'
    })
else:
    issue17_comments.append({
        'body': '<!-- roots-jules-session task_id=Leion-wp/product#17 session=sessions/11111111111 -->'
    })
if conflict_first:
    issue17_comments.append({
        'body': '<!-- roots-chatgpt-worker task_id=Leion-wp/product#17 branch=' + first_branch + ' pr=21 -->'
    })

issue18_comments = [{
    'body': '<!-- roots-jules-session task_id=Leion-wp/product#18 session=sessions/22222222222 -->'
}]

if args[:2] == ['pr', 'list']:
    emit([
        {
            'number': 21,
            'body': first_body,
            'headRefOid': 'a' * 40,
            'headRefName': first_branch,
            'baseRefName': 'main',
            'isDraft': False,
            'createdAt': '2026-09-10T00:00:00Z',
        },
        {
            'number': 22,
            'body': 'Fixes #18',
            'headRefOid': 'b' * 40,
            'headRefName': 'jules-b-22222222222',
            'baseRefName': 'main',
            'isDraft': False,
            'createdAt': '2026-09-10T00:01:00Z',
        },
    ])

if args[:2] == ['issue', 'list']:
    emit([
        {'number': 17, 'comments': issue17_comments},
        {'number': 18, 'comments': issue18_comments},
    ])

if args and args[0] == 'api':
    endpoint = api_endpoint()
    raw_endpoint = next((arg for arg in args[1:] if not arg.startswith('-') and arg not in values('-H') and arg not in values('--jq')), endpoint)
    if endpoint == 'user':
        emit({'login': 'Leion-wp'})
    if endpoint.endswith('/contents/.factory/profile.json'):
        emit({
            'managed': True,
            'repository': 'Leion-wp/product',
            'blueprint': 'roots-micro-saas-v1',
            'default_branch': 'main',
            'ci': {'required_jobs': ['quality']},
        })
    if endpoint.endswith('/actions/runs'):
        run_id = 1 if ('a' * 40) in raw_endpoint else 2
        emit({'workflow_runs': [{
            'id': run_id,
            'name': 'factory-ci',
            'status': 'completed',
            'conclusion': 'success',
        }]})
    if endpoint.endswith('/jobs'):
        emit({'jobs': [{
            'name': 'quality',
            'status': 'completed',
            'conclusion': 'success',
            'started_at': '2026-09-10T00:02:00Z',
        }]})
    if endpoint.endswith('/issues/17/comments'):
        comments = list(issue17_comments)
        if os.environ.get('FIRST_REVIEWED', 'true') == 'true':
            comments.append({'body': '<!-- roots-quality-verdict head=' + ('a' * 40) + ' verdict=PASS -->\nRisk: low'})
        emit(comments)
    if endpoint.endswith('/issues/18/comments'):
        emit(issue18_comments)
    if endpoint.endswith('/issues/17'):
        emit({'number': 17, 'title': 'first', 'body': '', 'labels': [], 'milestone': None})
    if endpoint.endswith('/issues/18'):
        emit({'number': 18, 'title': 'second', 'body': '', 'labels': [], 'milestone': None})
    if endpoint.endswith('/pulls/21'):
        if any('application/vnd.github.v3.diff' in header for header in values('-H')):
            print('diff --git a/one b/one')
            raise SystemExit(0)
        emit({
            'number': 21, 'title': 'one', 'body': first_body,
            'state': 'open', 'draft': False,
            'base': {'ref': 'main'}, 'head': {'ref': first_branch, 'sha': 'a' * 40},
            'changed_files': 1, 'additions': 1, 'deletions': 0,
        })
    if endpoint.endswith('/pulls/22'):
        if any('application/vnd.github.v3.diff' in header for header in values('-H')):
            print('diff --git a/two b/two')
            raise SystemExit(0)
        emit({
            'number': 22, 'title': 'two', 'body': 'Fixes #18',
            'state': 'open', 'draft': False,
            'base': {'ref': 'main'}, 'head': {'ref': 'jules-b-22222222222', 'sha': 'b' * 40},
            'changed_files': 1, 'additions': 1, 'deletions': 0,
        })

raise SystemExit('Unexpected gh call: ' + repr(args))
'''


class CopilotQualityGateTests(unittest.TestCase):
    def workflow(self, name):
        return yaml.safe_load((WORKFLOWS / name).read_text())

    def test_ci_completion_dispatches_quality_gate_immediately(self):
        workflow = self.workflow('factory-fleet-events.yml')
        steps = workflow['jobs']['route']['steps']
        step = next(item for item in steps if item.get('name') == 'Run native exact-head Quality on completed CI')
        self.assertEqual(step['if'], "env.EVENT_TYPE == 'factory-ci-completed'")
        script = step['run']
        self.assertIn('gh workflow run factory-copilot-quality-gate.yml', script)
        self.assertIn('--ref Android', script)
        self.assertIn('-f repository="$TARGET_REPO"', script)

    def test_quality_gate_is_parallel_pool_aware_bounded_exact_head_and_identity_aware(self):
        workflow = self.workflow('factory-copilot-quality-gate.yml')
        self.assertEqual(workflow['name'], 'factory-copilot-quality-gate-v2')
        self.assertEqual(workflow['permissions']['contents'], 'read')
        self.assertEqual(workflow['permissions']['copilot-requests'], 'write')
        self.assertIn('workflow_dispatch', workflow['on'])
        self.assertEqual(workflow['concurrency']['group'], 'factory-copilot-quality-gate-${{ inputs.repository }}')
        job = workflow['jobs']['review']
        self.assertEqual(job['timeout-minutes'], 10)
        scripts = '\n'.join(step.get('run', '') for step in job['steps'])
        self.assertNotIn('expected exactly one active managed PR', scripts)
        self.assertIn('sort_by([.createdAt, .number])[]', scripts)
        self.assertIn('no eligible green unreviewed managed PR', scripts)
        self.assertIn('factory-ci is not green', scripts)
        self.assertIn('required_jobs', scripts)
        self.assertIn('factory_worker_identity.py', scripts)
        self.assertIn('canonical worker identity changed', scripts)
        self.assertIn('current_sha=', scripts)
        self.assertIn('roots-quality-verdict head=${sha} verdict=${verdict}', scripts)
        self.assertIn('another exact-head verdict won the race', scripts)

    def run_resolver(
        self,
        first_reviewed=True,
        mismatch_first=False,
        chatgpt_bad_pr=False,
        conflict_first=False,
    ):
        workflow = self.workflow('factory-copilot-quality-gate.yml')
        step = next(item for item in workflow['jobs']['review']['steps'] if item.get('id') == 'target')
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bin_dir = root / 'bin'
            bin_dir.mkdir()
            gh = bin_dir / 'gh'
            gh.write_text(FAKE_GH)
            gh.chmod(0o755)
            scratch = root / 'tmp'
            scratch.mkdir()
            output = root / 'output'
            env = {
                **os.environ,
                'PATH': f'{bin_dir}:{os.environ["PATH"]}',
                'FLEET_TOKEN': 'offline',
                'OWNER': 'Leion-wp',
                'TARGET_REPO': REPO,
                'GITHUB_REPOSITORY': CONTROL,
                'GITHUB_WORKSPACE': str(ROOT),
                'GITHUB_OUTPUT': str(output),
                'FIRST_REVIEWED': 'true' if first_reviewed else 'false',
                'MISMATCH_FIRST': 'true' if mismatch_first else 'false',
                'CHATGPT_BAD_PR': 'true' if chatgpt_bad_pr else 'false',
                'CONFLICT_FIRST': 'true' if conflict_first else 'false',
            }
            script = step['run'].replace('/tmp/', f'{scratch}/')
            result = subprocess.run(
                ['bash', '-e', '-o', 'pipefail', '-c', script],
                cwd=root,
                env=env,
                text=True,
                capture_output=True,
                timeout=20,
            )
            selected = None
            if result.returncode == 0 and output.exists() and 'ready=true' in output.read_text():
                selected = {
                    'pr': (scratch / 'pr-number.txt').read_text().strip(),
                    'issue': (scratch / 'issue-number.txt').read_text().strip(),
                    'sha': (scratch / 'head-sha.txt').read_text().strip(),
                }
            return result, selected

    def test_multiple_active_prs_skip_reviewed_head_and_select_next_eligible_identity(self):
        result, selected = self.run_resolver(first_reviewed=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(selected, {'pr': '22', 'issue': '18', 'sha': SHA_B})
        self.assertIn('exact-head verdict already exists for PR #21', result.stdout)

    def test_multiple_unreviewed_prs_choose_deterministic_oldest_candidate(self):
        result, selected = self.run_resolver(first_reviewed=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(selected, {'pr': '21', 'issue': '17', 'sha': SHA_A})

    def test_body_cannot_substitute_another_factory_identity(self):
        result, selected = self.run_resolver(first_reviewed=False, mismatch_first=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(selected, {'pr': '22', 'issue': '18', 'sha': SHA_B})
        self.assertIn('IDENTITY_CONFLICT', result.stdout)
        self.assertIn('canonical worker identity is 17', result.stdout)

    def test_chatgpt_marker_pr_mismatch_is_fail_closed(self):
        result, selected = self.run_resolver(first_reviewed=False, chatgpt_bad_pr=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(selected, {'pr': '22', 'issue': '18', 'sha': SHA_B})
        self.assertIn('IDENTITY_CONFLICT', result.stdout)
        self.assertIn('persisted pr=999', result.stdout)

    def test_conflicting_worker_markers_do_not_claim_pr(self):
        result, selected = self.run_resolver(first_reviewed=False, conflict_first=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(selected, {'pr': '22', 'issue': '18', 'sha': SHA_B})
        self.assertIn('conflicting/ambiguous worker identities', result.stdout)


if __name__ == '__main__':
    unittest.main(verbosity=2)
