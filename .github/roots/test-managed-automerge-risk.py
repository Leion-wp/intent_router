#!/usr/bin/env python3
import json
from pathlib import Path

policy = json.loads(Path('.github/roots/factory-managed-merge-policy.json').read_text())
schema = json.loads(Path('.github/roots/factory-managed-merge-policy.schema.json').read_text())
workflow = Path('.github/workflows/factory-managed-automerge.yml').read_text()

assert policy['risk']['required_low_risk_label'] == 'factory:risk-low'
assert policy['risk']['fail_closed_when_unclassified'] is True
assert set(policy['risk']['denied_risk_labels']) == {
    'factory:risk-medium', 'factory:risk-high', 'factory:risk-unknown'
}
assert 'factory:escalated' in policy['source_issue']['blocking_labels']
assert 'risk' in schema['required']
assert schema['properties']['risk']['properties']['required_low_risk_label']['const'] == 'factory:risk-low'
assert 'AUTO_MERGE_HUMAN' in workflow
assert 'factory:risk-low' in workflow
assert 'Final race guard' in workflow
assert 'reviewDecision' in workflow
assert 'head moved' in workflow
assert 'LOW_RISK managed PR' in workflow

print('managed auto-merge LOW_RISK contract: PASS')
