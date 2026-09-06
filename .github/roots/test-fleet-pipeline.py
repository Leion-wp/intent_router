"""Execute the real workflow shell steps against a stateful, offline GitHub CLI.

No live token, network request, Jules message or GitHub mutation is used.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / '.github/workflows'
REPO = 'Leion-wp/product'
CONTROL = 'Leion-wp/intent_router'
SHA = 'a' * 40

# The fake CLI implements API behavior, not the workflow's selection logic.
# jq and bash are real, so the correlation and gate predicates are exercised.
FAKE_GH = r'''#!/usr/bin/env python3
import json, os, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

path = Path(os.environ['FAKE_STATE'])
state = json.loads(path.read_text())
args = sys.argv[1:]

def values(flag):
    return [args[i+1] for i, arg in enumerate(args[:-1]) if arg == flag]

def value(flag, default=None):
    return next(iter(values(flag)), default)

def save():
    path.write_text(json.dumps(state))

def emit(data):
    expression = value('--jq')
    if expression:
        result = subprocess.run(['jq', '-r', expression], input=json.dumps(data), text=True, capture_output=True)
        sys.stdout.write(result.stdout)
        sys.stderr.write(result.stderr)
        sys.exit(result.returncode)
    print(json.dumps(data))
    sys.exit(0)

def mutate(kind, **fields):
    state['mutations'].append(dict(kind=kind, **fields))
    save()

if args[:2] == ['workflow', 'run']:
    workflow = args[2]
    if state.get('fail_workflow') == workflow:
        sys.exit(1)
    assert value('--ref') == 'Android', args
    assert value('--repo') == 'Leion-wp/intent_router', args
    inputs = dict(field.split('=', 1) for field in values('-f'))
    state['dispatches'].append(dict(workflow=workflow, inputs=inputs))
    save()
    sys.exit(0)

if args[:2] == ['issue', 'list']:
    rows = list(state['issues'].values())
    wanted = value('--state', 'open').upper()
    if wanted != 'ALL':
        rows = [row for row in rows if row['state'] == wanted]
    for label in values('--label'):
        rows = [row for row in rows if label in [x['name'] for x in row['labels']]]
    emit(rows[:int(value('--limit', '100'))])

if args[:2] == ['issue', 'edit']:
    number = args[2]
    if state.get('fail_edit_once') == number:
        del state['fail_edit_once']
        save()
        sys.exit(1)
    issue = state['issues'][number]
    labels = {x['name'] for x in issue['labels']}
    labels.difference_update(values('--remove-label'))
    labels.update(values('--add-label'))
    issue['labels'] = [{'name': label} for label in sorted(labels)]
    mutate('labels', issue=number, labels=sorted(labels))
    sys.exit(0)

if args[:2] == ['label', 'create']:
    sys.exit(0)

if args[:2] == ['pr', 'list']:
    wanted = value('--state', 'open')
    emit([pr for pr in state['prs'] if
          (wanted == 'merged' and pr.get('mergedAt')) or
          (wanted == 'open' and pr['state'] == 'open')])

if args[:2] == ['pr', 'view']:
    emit({'reviewDecision': state.get('review', 'APPROVED')})

if args and args[0] == 'api':
    flags = {'-H', '--method', '-f', '-F', '--jq'}
    positional = []
    i = 1
    while i < len(args):
        if args[i] in flags:
            i += 2
        elif args[i].startswith('--'):
            i += 1
        else:
            positional.append(args[i])
            i += 1
    endpoint = positional[0].split('?')[0]
    if state.get('fail_api') == endpoint:
        sys.exit(1)
    method = value('--method', 'GET')
    fields = dict(item.split('=', 1) for item in values('-f'))
    if endpoint == 'user':
        emit({'login': 'Leion-wp'})
    if endpoint == 'user/repos':
        emit([{'owner': {'login': 'Leion-wp'}, 'full_name': 'Leion-wp/product'}])
    if endpoint.endswith('/contents/.factory/profile.json'):
        emit(state['profile'])
    if '/issues/' in endpoint:
        number = endpoint.split('/issues/')[1].split('/')[0]
        issue = state['issues'][number]
        if endpoint.endswith('/comments'):
            if method == 'POST':
                issue['comments'].append({'body': fields['body'], 'created_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')})
                mutate('comment', issue=number)
            emit(issue['comments'])
        if method == 'PATCH':
            issue['state'] = fields['state'].upper()
            issue['stateReason'] = fields['state_reason'].upper()
            mutate('close', issue=number)
        emit({**issue, 'state': issue['state'].lower()})
    if '/pulls/' in endpoint:
        pr = state['prs'][0]
        if endpoint.endswith('/files'):
            emit([{'filename': 'src/example.ts'}])
        if endpoint.endswith('/merge'):
            assert fields['sha'] == pr['headRefOid']
            pr['state'] = 'closed'
            pr['mergedAt'] = '2026-09-06T01:00:00Z'
            if state.get('auto_close', True):
                state['issues']['17']['state'] = 'CLOSED'
                state['issues']['17']['stateReason'] = 'COMPLETED'
            mutate('merge', sha=fields['sha'])
            emit({'merged': True})
        emit({**pr, 'head': {'sha': pr['headRefOid']},
              'base': {'ref': pr['baseRefName']}, 'draft': pr['isDraft'],
              'mergeable': True, 'mergeable_state': 'clean'})
    if endpoint.endswith('/actions/runs'):
        emit({'workflow_runs': [{'id': 1, 'status': 'completed',
              'conclusion': state.get('ci', 'success')}]})
    if endpoint.endswith('/jobs'):
        emit({'jobs': [{'name': 'quality', 'status': 'completed',
              'conclusion': state.get('ci', 'success'), 'started_at': '2026-09-06'}]})

raise SystemExit('Unexpected gh call: ' + repr(args))
'''


def fixture():
    def issue(number, labels):
        return dict(number=number, labels=[{'name': name} for name in labels],
                    state='OPEN', stateReason=None, body='', comments=[],
                    createdAt=f'2026-09-0{number - 16}T00:00:00Z')
    active = issue(17, ['factory:dispatched'])
    active['comments'] = [
        {'body': f'<!-- roots-jules-session task_id={REPO}#17 session=sessions/123 -->'},
        {'body': f'<!-- roots-quality-verdict head={SHA} verdict=PASS -->\nRisk: low'},
    ]
    return dict(
        issues={'17': active, '18': issue(18, ['factory:queued'])},
        profile=dict(managed=True, repository=REPO, blueprint='roots-micro-saas-v1',
                     default_branch='main', ci={'required_jobs': ['quality']}),
        prs=[dict(number=21, body='Fixes #17', headRefOid=SHA, headRefName='jules-123',
                  baseRefName='main', isDraft=False, state='open', url=f'https://github.com/{REPO}/pull/21',
                  mergedAt=None)],
        dispatches=[], mutations=[],
    )


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.state_file = self.directory / 'state.json'
        self.put(fixture())
        self.bin = self.directory / 'bin'
        self.bin.mkdir()
        executable = self.bin / 'gh'
        executable.write_text(FAKE_GH)
        executable.chmod(0o755)
        # Any accidental worker/network invocation fails the regression test.
        for name in ['curl', 'wget']:
            executable = self.bin / name
            executable.write_text('#!/bin/sh\nexit 99\n')
            executable.chmod(0o755)
        self.executions = 0

    def get(self):
        return json.loads(self.state_file.read_text())

    def put(self, state):
        self.state_file.write_text(json.dumps(state))

    def workflow(self, name):
        return yaml.safe_load((WORKFLOWS / f'{name}.yml').read_text())

    def run_workflow(self, name, inputs=None, event='workflow_dispatch', action=''):
        workflow = self.workflow(name)
        supplied = inputs or {}
        inputs = {key: info.get('default', '') for key, info in
                  (workflow['on'].get('workflow_dispatch') or {}).get('inputs', {}).items()}
        inputs.update(supplied)
        self.executions += 1
        work = self.directory / f'run-{self.executions}'
        work.mkdir()
        shutil.copytree(ROOT / '.github/roots', work / '.github/roots')
        scratch = work / 'tmp'
        scratch.mkdir()
        outputs = {}
        context = {
            'github.event_name': event, 'github.event.action': action,
            'github.token': 'offline', 'github.repository_owner': 'Leion-wp',
            'github.event.client_payload.repository': supplied.get('repository', REPO),
        }
        for key, val in inputs.items():
            if val in ('true', 'false'):
                val = val == 'true'
            context[f'inputs.{key}'] = val

        def atom(text):
            text = text.strip()
            if text.startswith("'") and text.endswith("'"):
                return text[1:-1]
            if text in ('true', 'false'):
                return text == 'true'
            if text.startswith('secrets.'):
                return 'offline'
            return context.get(text, '')

        def evaluate(expression):
            result = ''
            for alternative in expression.split('||'):
                value = True
                for term in alternative.split('&&'):
                    comparison = re.fullmatch(r'\s*(.*?)\s*(==|!=)\s*(.*?)\s*', term)
                    if comparison:
                        left, operator, right = comparison.groups()
                        current = atom(left) == atom(right)
                        if operator == '!=':
                            current = not current
                    else:
                        current = atom(term)
                    value = current if value else value
                result = value
                if result:
                    break
            return result

        def env_value(value):
            if value.startswith('${{'):
                value = evaluate(value[3:-2].strip())
            if isinstance(value, bool):
                return str(value).lower()
            return str(value)

        environment = {**os.environ, 'PATH': f'{self.bin}:{os.environ["PATH"]}',
                       'FAKE_STATE': str(self.state_file), 'GITHUB_REPOSITORY': CONTROL,
                       'GITHUB_RUN_ID': '100', 'GITHUB_RUN_ATTEMPT': '1',
                       'GITHUB_STEP_SUMMARY': str(work / 'summary')}
        job = next(iter(workflow['jobs'].values()))
        for key, value in job.get('env', {}).items():
            environment[key] = env_value(value)
            context[f'env.{key}'] = environment[key]
        for index, step in enumerate(job['steps']):
            if 'run' not in step or not evaluate(step.get('if', 'true')):
                continue
            output = work / f'output-{index}'
            step_env = {**environment, 'GITHUB_OUTPUT': str(output)}
            step_env.update({key: env_value(value) for key, value in step.get('env', {}).items()})
            script = step['run'].replace('/tmp/', f'{scratch}/')
            result = subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', script],
                                    cwd=work, env=step_env, text=True, capture_output=True, timeout=30)
            if result.returncode:
                return result
            if 'id' in step and output.exists():
                outputs[step['id']] = dict(line.split('=', 1) for line in output.read_text().splitlines())
                for key, value in outputs[step['id']].items():
                    context[f'steps.{step["id"]}.outputs.{key}'] = value
        return subprocess.CompletedProcess([], 0, '', '')

    def success(self, name, **kwargs):
        result = self.run_workflow(name, **kwargs)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def drain(self, start=0):
        # Planning is a separate control-plane subsystem with its own contract tests.
        # This execution-loop harness verifies that the handoff is emitted but does
        # not emulate the planner's milestone/issue GitHub API surface.
        sinks = {'factory-cross-repo-dispatch.yml', 'factory-fleet-jules-quality-rework.yml',
                 'factory-fleet-jules-rework.yml', 'factory-autonomous-planning.yml'}
        cursor = start
        while cursor < len(self.get()['dispatches']):
            self.assertLess(cursor - start, 12, 'Pipeline failed to terminate')
            item = self.get()['dispatches'][cursor]
            cursor += 1
            if item['workflow'] not in sinks:
                self.success(item['workflow'][:-4], inputs=item['inputs'])

    def start(self):
        self.success('factory-fleet-scheduler', inputs={'execute': True}, event='schedule')
        self.drain()

    def workers(self):
        return [row for row in self.get()['dispatches'] if row['workflow'] == 'factory-cross-repo-dispatch.yml']

    def test_scheduler_hands_off_before_selecting_work(self):
        self.success('factory-fleet-scheduler', inputs={'execute': True})
        self.assertEqual([x['workflow'] for x in self.get()['dispatches']],
                         ['factory-fleet-jules-quality-rework.yml', 'factory-quality-risk-reconciler.yml'])
        self.assertEqual(self.get()['mutations'], [])

    def test_whole_chain_auto_closed_issue_and_duplicate_event(self):
        self.start()
        state = self.get()
        self.assertEqual(state['issues']['17']['state'], 'CLOSED')
        self.assertEqual(state['issues']['17']['labels'], [{'name': 'factory:done'}, {'name': 'factory:risk-low'}])
        self.assertEqual(len(self.workers()), 1)
        self.assertEqual(self.workers()[0]['inputs']['issue_number'], '18')
        mutations = state['mutations']
        risk_index = next(i for i, row in enumerate(mutations) if 'factory:risk-low' in row.get('labels', []))
        merge_index = next(i for i, row in enumerate(mutations) if row['kind'] == 'merge')
        self.assertLess(risk_index, merge_index)
        offset = len(state['dispatches'])
        self.success('factory-fleet-scheduler', inputs={'execute': True})
        self.drain(offset)
        self.assertEqual(len(self.workers()), 1, 'Duplicate event dispatched a second worker')

    def test_negative_stale_unclassified_and_denied_risk_hold_lock(self):
        for change in ['REWORK', 'BLOCK', 'stale', 'unclassified', 'denied', 'ci_failure']:
            with self.subTest(change=change):
                state = fixture()
                comment = state['issues']['17']['comments'][1]
                if change in ('REWORK', 'BLOCK'):
                    comment['body'] = comment['body'].replace('PASS', change)
                elif change == 'stale':
                    comment['body'] = comment['body'].replace(SHA, 'b' * 40)
                elif change == 'unclassified':
                    comment['body'] = comment['body'].replace('Risk: low', '')
                elif change == 'denied':
                    state['issues']['17']['labels'].append({'name': 'factory:risk-high'})
                else:
                    state['ci'] = 'failure'
                self.put(state)
                self.start()
                self.assertFalse(self.workers())
                self.assertFalse(any(row['kind'] == 'merge' for row in self.get()['mutations']))

    def test_completion_finishes_partial_transition_even_with_marker(self):
        state = fixture()
        state['prs'][0].update(state='closed', mergedAt='2026-09-06')
        state['issues']['17']['comments'].append({'body': '<!-- roots-fleet-task-done issue=17 pr=21 -->'})
        state['fail_edit_once'] = '17'
        self.put(state)
        self.assertNotEqual(self.run_workflow('factory-fleet-completion-reconciler').returncode, 0)
        self.assertEqual(self.get()['issues']['17']['state'], 'CLOSED')
        self.assertFalse(self.get()['dispatches'], 'Failed transition advanced the scheduler')
        self.success('factory-fleet-completion-reconciler')
        self.drain()
        self.assertEqual(len(self.workers()), 1)
        comments = self.get()['issues']['17']['comments']
        self.assertEqual(sum('roots-fleet-task-done' in item['body'] for item in comments), 1)

    def test_zero_completions_still_advances_after_already_finished_task(self):
        state = fixture()
        state['issues']['17'].update(state='CLOSED', stateReason='COMPLETED', labels=[{'name': 'factory:done'}])
        state['prs'][0].update(state='closed', mergedAt='2026-09-06')
        self.put(state)
        self.success('factory-fleet-completion-reconciler')
        self.drain()
        self.assertEqual(len(self.workers()), 1)

    def test_not_planned_and_human_blocked_tasks_are_not_reconciled(self):
        for reason in ['NOT_PLANNED', 'human']:
            state = fixture()
            state['prs'][0].update(state='closed', mergedAt='2026-09-06')
            if reason == 'NOT_PLANNED':
                state['issues']['17'].update(state='CLOSED', stateReason=reason)
            else:
                state['issues']['17']['labels'].append({'name': 'factory:human-required'})
            self.put(state)
            self.success('factory-fleet-completion-reconciler')
            self.assertFalse(self.get()['mutations'])

    def test_failed_dispatch_stops_initial_scheduler(self):
        state = fixture()
        state['fail_workflow'] = 'factory-quality-risk-reconciler.yml'
        self.put(state)
        self.assertNotEqual(self.run_workflow('factory-fleet-scheduler', inputs={'execute': True}).returncode, 0)
        self.assertFalse(self.workers())
        self.assertFalse(self.get()['mutations'])

    def test_failed_merge_scan_never_hands_off(self):
        state = fixture()
        state['fail_api'] = 'user'
        self.put(state)
        self.assertNotEqual(self.run_workflow('factory-managed-automerge').returncode, 0)
        self.assertFalse(self.get()['dispatches'])

    def test_scheduler_dry_run_starts_no_mutation_and_automerge_dry_run_no_handoff(self):
        self.success('factory-fleet-scheduler', inputs={'execute': False})
        self.assertFalse(self.get()['dispatches'])
        self.assertFalse(self.get()['mutations'])
        self.success('factory-managed-automerge', inputs={'execute': False})
        self.assertFalse(self.get()['dispatches'])

    def test_event_receiver_validates_profile_and_ignores_payload_authority(self):
        self.success('factory-fleet-events', inputs={'repository': REPO},
                     event='repository_dispatch', action='factory-ci-completed')
        self.assertEqual([row['workflow'] for row in self.get()['dispatches']],
                         ['factory-fleet-jules-rework.yml', 'factory-fleet-scheduler.yml'])
        self.assertEqual(self.get()['dispatches'][1]['inputs'], {'execute': 'true'})
        for target in ['other/product', CONTROL, 'Leion-wp/../../evil', REPO]:
            state = fixture()
            state['profile']['managed'] = False
            self.put(state)
            self.assertNotEqual(self.run_workflow('factory-fleet-events', inputs={'repository': target}).returncode, 0)
            self.assertFalse(self.get()['dispatches'])

    def test_fallback_crons_and_no_duplicate_automerge_subscription(self):
        for name in ['factory-fleet-scheduler', 'factory-managed-automerge', 'factory-fleet-completion-reconciler']:
            self.assertTrue(self.workflow(name)['on']['schedule'])
            self.assertFalse(self.workflow(name)['concurrency']['cancel-in-progress'])
        self.assertNotIn('workflow_run', self.workflow('factory-managed-automerge-handoff')['on'])

    def test_workflow_dispatch_ci_hint_matches_repository_dispatch(self):
        self.success('factory-fleet-events', inputs={'repository': REPO, 'event_type': 'factory-ci-completed'})
        self.assertEqual([row['workflow'] for row in self.get()['dispatches']],
                         ['factory-fleet-jules-rework.yml', 'factory-fleet-scheduler.yml'])
        state = fixture()
        self.put(state)
        self.assertNotEqual(self.run_workflow('factory-fleet-events', inputs={
            'repository': REPO, 'event_type': 'run-arbitrary-workflow'}).returncode, 0)
        self.assertFalse(self.get()['dispatches'])


if __name__ == '__main__':
    unittest.main(verbosity=2)