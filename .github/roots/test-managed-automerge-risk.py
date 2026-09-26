#!/usr/bin/env python3
import json
from pathlib import Path

from factory_quality_verdict import latest_exact_head_verdict
from factory_worker_identity import IdentityConflict, IdentityNoMatch, issue_identity, select_pr, validate_pr

policy = json.loads(Path('.github/roots/factory-managed-merge-policy.json').read_text())
schema = json.loads(Path('.github/roots/factory-managed-merge-policy.schema.json').read_text())
workflow = Path('.github/workflows/factory-managed-automerge.yml').read_text()

assert policy['risk']['required_low_risk_label'] == 'factory:risk-low'
assert policy['risk']['fail_closed_when_unclassified'] is True
assert set(policy['risk']['denied_risk_labels']) == {
    'factory:risk-medium', 'factory:risk-high', 'factory:risk-unknown'
}
assert 'factory:escalated' in policy['source_issue']['blocking_labels']
assert policy['source_issue']['require_persisted_worker_session'] is True
assert 'risk' in schema['required']
assert schema['properties']['risk']['properties']['required_low_risk_label']['const'] == 'factory:risk-low'
assert 'factory-managed-automerge-v3' in workflow
assert 'AUTO_MERGE_HUMAN' in workflow
assert 'factory:risk-low' in workflow
assert 'roots-jules-session' in workflow
assert 'roots-chatgpt-worker' in workflow
assert 'conflicting worker identities' in workflow
assert 'factory_worker_identity.py' in workflow
assert 'factory_quality_verdict.py' in workflow
assert 'canonical worker/PR correlation failed' in workflow
assert 'identity changed before merge' in workflow
assert 'Quality authority changed ambiguously before merge' in workflow
assert 'latest exact-head Quality changed' in workflow
assert 'reviewDecision' in workflow
assert 'head moved' in workflow
assert 'LOW_RISK managed PR' in workflow
assert 'forbidden_path_prefixes' in workflow
assert 'require_head_specific_verdict' in workflow

# The PR body is no longer allowed to select an issue before persisted worker identity.
assert 'select((.body // "") | test(' not in workflow
assert 'canonical worker identity' in workflow

repo = 'Leion-wp/product'
jules_comments = [{
    'body': '<!-- roots-jules-session task_id=Leion-wp/product#17 session=sessions/11111111111 -->'
}]
chatgpt_comments = [{
    'body': '<!-- roots-chatgpt-worker task_id=Leion-wp/product#18 branch=chatgpt-18 pr=22 -->'
}]
jules_pr = {
    'number': 21,
    'body': 'Fixes #17',
    'headRefOid': 'a' * 40,
    'headRefName': 'feature-11111111111',
    'baseRefName': 'main',
    'isDraft': False,
}
chatgpt_pr = {
    'number': 22,
    'body': 'Fixes #18',
    'headRefOid': 'b' * 40,
    'headRefName': 'chatgpt-18',
    'baseRefName': 'main',
    'isDraft': False,
}

selected = select_pr(repo, 17, jules_comments, [jules_pr, chatgpt_pr], 'main')
assert selected['provider'] == 'jules'
assert selected['pr'] == 21

selected = select_pr(repo, 18, chatgpt_comments, [jules_pr, chatgpt_pr], 'main')
assert selected['provider'] == 'chatgpt'
assert selected['pr'] == 22

# Restart persistence appends a generated Jules marker while retaining the historical
# legacy marker. The highest valid generation is the canonical active identity.
restart_comments = jules_comments + [{
    'body': (
        '<!-- roots-jules-session task_id=Leion-wp/product#17 '
        'session=sessions/22222222222 generation=1 -->\n'
        '<!-- roots-jules-restart-complete task_id=Leion-wp/product#17 attempt=1 '
        'from=sessions/11111111111 to=sessions/22222222222 mode=manual -->'
    )
}]
restart_pr = {
    'number': 23,
    'body': 'Fixes #17',
    'headRefOid': 'd' * 40,
    'headRefName': 'feature-22222222222',
    'baseRefName': 'main',
    'isDraft': False,
}
canonical = issue_identity(repo, 17, restart_comments)
assert canonical['session'] == 'sessions/22222222222'
assert canonical['generation'] == 1
selected = select_pr(repo, 17, restart_comments, [jules_pr, restart_pr], 'main')
assert selected['provider'] == 'jules'
assert selected['pr'] == 23
assert selected['session'] == 'sessions/22222222222'

# Later restart generations supersede earlier generations deterministically.
second_restart_comments = restart_comments + [{
    'body': '<!-- roots-jules-session task_id=Leion-wp/product#17 session=sessions/33333333333 generation=2 -->'
}]
assert issue_identity(repo, 17, second_restart_comments)['session'] == 'sessions/33333333333'

# Two distinct sessions claiming the same restart generation are ambiguous.
duplicate_generation = restart_comments + [{
    'body': '<!-- roots-jules-session task_id=Leion-wp/product#17 session=sessions/99999999999 generation=1 -->'
}]
try:
    issue_identity(repo, 17, duplicate_generation)
except IdentityConflict:
    pass
else:
    raise AssertionError('duplicate Jules restart generation must fail closed')

# A marker-like record with an invalid generation must not silently fall back to a stale
# legacy identity.
malformed_generation = jules_comments + [{
    'body': '<!-- roots-jules-session task_id=Leion-wp/product#17 session=sessions/22222222222 generation=zero -->'
}]
try:
    issue_identity(repo, 17, malformed_generation)
except IdentityConflict:
    pass
else:
    raise AssertionError('malformed Jules restart generation must fail closed')

# A PR may not substitute another task via its body.
bad_body = dict(jules_pr, body='Fixes #18')
try:
    select_pr(repo, 17, jules_comments, [bad_body], 'main')
except IdentityConflict:
    pass
else:
    raise AssertionError('body/task substitution must fail closed')

# A ChatGPT marker names both branch and PR; a wrong PR number cannot be claimed.
bad_chat_marker = [{
    'body': '<!-- roots-chatgpt-worker task_id=Leion-wp/product#18 branch=chatgpt-18 pr=999 -->'
}]
try:
    select_pr(repo, 18, bad_chat_marker, [chatgpt_pr], 'main')
except (IdentityConflict, IdentityNoMatch):
    pass
else:
    raise AssertionError('ChatGPT branch/pr mismatch must fail closed')

# Conflicting providers on one issue cannot select or validate a PR.
conflicting = jules_comments + [{
    'body': '<!-- roots-chatgpt-worker task_id=Leion-wp/product#17 branch=feature-11111111111 pr=21 -->'
}]
try:
    validate_pr(repo, 17, conflicting, jules_pr, 'main')
except IdentityConflict:
    pass
else:
    raise AssertionError('dual worker identity must fail closed')

sha = 'c' * 40
quality = [
    {'body': f'<!-- roots-quality-verdict head={sha} verdict=PASS -->\nRisk: low'},
    {'body': f'<!-- roots-quality-verdict head={sha} verdict=REWORK -->'},
]
assert latest_exact_head_verdict(quality, sha)['verdict'] == 'REWORK'
quality.append({'body': f'<!-- roots-quality-verdict head={sha} verdict=PASS -->\nRisk: low'})
assert latest_exact_head_verdict(quality, sha)['verdict'] == 'PASS'

print('provider-neutral managed auto-merge + latest exact-head Quality contract: PASS')
