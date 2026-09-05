#!/usr/bin/env python3
from pathlib import Path

workflow = Path('.github/workflows/factory-quality-risk-reconciler.yml').read_text()
automerge = Path('.github/workflows/factory-managed-automerge.yml').read_text()

assert 'factory-quality-risk-reconciler-v1' in workflow
assert 'roots-quality-verdict head=${sha} verdict=${verdict}' in workflow
assert "for verdict in REWORK BLOCK" in workflow
assert "risk:[[:space:]]*low" in workflow
assert 'factory:risk-low' in workflow
assert 'QUALITY_RISK_UNCLASSIFIED' in workflow
assert 'LOW_RISK label did not persist' in workflow
assert 'factory-managed-automerge.yml' in workflow
assert '--ref Android' in workflow
assert '-f execute=true' in workflow
assert 'factory:risk-low' in automerge
assert 'require_head_specific_verdict' in automerge

print('Quality LOW_RISK handoff contract: PASS')
