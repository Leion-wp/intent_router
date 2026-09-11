#!/usr/bin/env python3
from pathlib import Path

from factory_quality_verdict import VerdictConflict, VerdictNoMatch, latest_exact_head_verdict

workflow = Path('.github/workflows/factory-quality-risk-reconciler.yml').read_text()
automerge = Path('.github/workflows/factory-managed-automerge.yml').read_text()

assert 'factory-quality-risk-reconciler-v3' in workflow
assert 'factory_quality_verdict.py' in workflow
assert 'QUALITY_RISK_REVOKED' in workflow
assert '--remove-label "$low_label"' in workflow
assert 'latest canonical exact-head Quality verdict' in workflow
assert "risk:[[:space:]]*low" in workflow
assert 'factory:risk-low' in workflow
assert 'QUALITY_RISK_UNCLASSIFIED' in workflow
assert 'LOW_RISK label did not persist' in workflow
assert 'superseded LOW_RISK label did not revoke' in workflow
assert 'roots-jules-session' in workflow
assert 'roots-chatgpt-worker' in workflow
assert 'conflicting Jules and ChatGPT worker identities' in workflow
assert 'factory-managed-automerge.yml' in workflow
assert '--ref Android' in workflow
assert '-f execute=true' in workflow
assert 'factory:risk-low' in automerge
assert 'require_head_specific_verdict' in automerge
assert 'factory_quality_verdict.py' in automerge

sha = 'a' * 40
old_sha = 'b' * 40

def q(head, verdict, suffix=''):
    return {'body': f'<!-- roots-quality-verdict head={head} verdict={verdict} -->\n{suffix}'}

# Same SHA: a later negative verdict supersedes an earlier PASS.
comments = [q(sha, 'PASS', 'Risk: low'), q(sha, 'REWORK', 'Risk: low')]
assert latest_exact_head_verdict(comments, sha)['verdict'] == 'REWORK'

# Reverse transition is legal: a later PASS restores Quality eligibility.
comments = [q(sha, 'REWORK'), q(sha, 'PASS_WITH_FOLLOW_UP', 'Risk: low')]
latest = latest_exact_head_verdict(comments, sha)
assert latest['verdict'] == 'PASS_WITH_FOLLOW_UP'
assert 'Risk: low' in latest['body']

# An old-head PASS never authorizes a new head without its own verdict.
try:
    latest_exact_head_verdict([q(old_sha, 'PASS', 'Risk: low')], sha)
except VerdictNoMatch:
    pass
else:
    raise AssertionError('old-head PASS must not authorize a new head')

# Duplicate wake-ups do not change canonical comment authority.
comments = [q(sha, 'PASS', 'Risk: low'), q(sha, 'PASS', 'Risk: low')]
assert latest_exact_head_verdict(comments, sha)['verdict'] == 'PASS'

# One comment claiming two different verdicts for the same head fails closed.
ambiguous = [{
    'body': (
        f'<!-- roots-quality-verdict head={sha} verdict=PASS -->\n'
        f'<!-- roots-quality-verdict head={sha} verdict=BLOCK -->'
    )
}]
try:
    latest_exact_head_verdict(ambiguous, sha)
except VerdictConflict:
    pass
else:
    raise AssertionError('conflicting same-comment Quality markers must fail closed')

print('latest exact-head Quality LOW_RISK handoff contract: PASS')
