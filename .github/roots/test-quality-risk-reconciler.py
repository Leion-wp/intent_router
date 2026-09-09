#!/usr/bin/env python3
from pathlib import Path

workflow = Path('.github/workflows/factory-quality-risk-reconciler.yml').read_text()
automerge = Path('.github/workflows/factory-managed-automerge.yml').read_text()

assert 'factory-quality-risk-reconciler-v2' in workflow
assert 'roots-quality-verdict head=${sha} verdict=${verdict}' in workflow
assert "for verdict in REWORK BLOCK" in workflow
assert "risk:[[:space:]]*low" in workflow
assert 'factory:risk-low' in workflow
assert 'QUALITY_RISK_UNCLASSIFIED' in workflow
assert 'LOW_RISK label did not persist' in workflow
assert 'roots-jules-session' in workflow
assert 'roots-chatgpt-worker' in workflow
assert 'conflicting Jules and ChatGPT worker identities' in workflow
assert 'factory-managed-automerge.yml' in workflow
assert '--ref Android' in workflow
assert '-f execute=true' in workflow
assert 'factory:risk-low' in automerge
assert 'require_head_specific_verdict' in automerge
assert 'roots-jules-session' in automerge
assert 'roots-chatgpt-worker' in automerge
assert 'conflicting worker identities' in automerge

print('Provider-neutral Quality LOW_RISK handoff contract: PASS')
