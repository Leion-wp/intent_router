#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path('.github/roots')
WORKFLOWS = Path('.github/workflows')

capacity = json.loads((ROOT / 'factory-worker-capacity.json').read_text())
profile_schema = json.loads((ROOT / 'factory-repository-profile.schema.json').read_text())
scheduler = (WORKFLOWS / 'factory-fleet-scheduler.yml').read_text()
dispatcher = (WORKFLOWS / 'factory-cross-repo-dispatch.yml').read_text()
watchdog = (WORKFLOWS / 'factory-fleet-watchdog.yml').read_text()
ci_rework = (WORKFLOWS / 'factory-fleet-jules-rework.yml').read_text()
quality_rework = (WORKFLOWS / 'factory-fleet-jules-quality-rework.yml').read_text()
risk = (WORKFLOWS / 'factory-quality-risk-reconciler.yml').read_text()
automerge = (WORKFLOWS / 'factory-managed-automerge.yml').read_text()
completion = (WORKFLOWS / 'factory-fleet-completion-reconciler.yml').read_text()
telemetry = (WORKFLOWS / 'factory-portfolio-telemetry.yml').read_text()
telemetry_schema = json.loads((ROOT / 'factory-portfolio-telemetry.schema.json').read_text())
doc = (ROOT / 'factory-chatgpt-worker-v1.md').read_text()


def proves_exclusion(text: str) -> bool:
    return 'factory:agent:chatgpt' in text and '== null' in text


assert capacity['workers']['jules']['max_concurrency'] == 15
assert capacity['workers']['chatgpt']['max_concurrency'] == 1
assert capacity['workers']['chatgpt']['selection_label'] == 'factory:agent:chatgpt'
worker_enum = profile_schema['properties']['worker_policy']['properties']['enabled']['items']['enum']
assert 'jules' in worker_enum
assert 'chatgpt' in worker_enum

# Jules requires explicit provider authorization and must not claim/recover ChatGPT-routed tasks.
assert 'factory-fleet-scheduler-v4' in scheduler
assert '.worker_policy.enabled | index("jules") != null' in scheduler
assert proves_exclusion(scheduler)
assert 'WORKER_ROUTE_REFUSED' in dispatcher
assert proves_exclusion(watchdog)
assert proves_exclusion(ci_rework)
assert proves_exclusion(quality_rework)

# Shared downstream stages accept one recognized worker identity and fail on conflicts.
for workflow in (risk, automerge, completion):
    assert 'roots-jules-session' in workflow
    assert 'roots-chatgpt-worker' in workflow
    assert 'conflicting' in workflow.lower()

# Shared gates are not weakened for the second provider.
assert 'roots-quality-verdict head=${sha} verdict=${verdict}' in risk
assert 'factory:risk-low' in risk
assert 'forbidden_path_prefixes' in automerge
assert 'reviewDecision' in automerge
assert 'require_head_specific_verdict' in automerge
assert 'factory-autonomous-planning.yml' in completion

# Telemetry reports the two pools separately.
assert 'factory-portfolio-telemetry-v3' in telemetry
assert 'chatgpt_capacity' in telemetry
assert 'jules-active.tsv' in telemetry
assert 'chatgpt-active.tsv' in telemetry
assert 'chatgpt_capacity' in telemetry_schema['required']
assert telemetry_schema['properties']['chatgpt_capacity']['properties']['provider']['const'] == 'chatgpt'

# The cognitive adapter contract remains profile-authorized, bounded and does not own Quality/merge.
assert 'worker_policy.enabled` contains `chatgpt`' in doc
assert '<!-- roots-chatgpt-worker task_id=<owner/repo>#<issue> branch=<branch> pr=<number> -->' in doc
assert 'must not' in doc.lower()
assert 'publish `roots-quality-verdict`' in doc
assert 'merge its own PR' in doc
assert 'at most three attempts' in doc

print('ChatGPT worker routing contract: PASS')
