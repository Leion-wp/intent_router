#!/usr/bin/env python3
import json
from pathlib import Path

import factory_worker_provider as provider

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
assert capacity['workers']['jules']['ownership_label'] == 'factory:worker:jules'
assert capacity['workers']['chatgpt']['max_concurrency'] == 1
assert capacity['workers']['chatgpt']['selection_label'] == 'factory:agent:chatgpt'
assert capacity['workers']['chatgpt']['ownership_label'] == 'factory:worker:chatgpt'
worker_enum = profile_schema['properties']['worker_policy']['properties']['enabled']['items']['enum']
assert 'jules' in worker_enum
assert 'chatgpt' in worker_enum

# Jules requires explicit provider authorization and must not claim ChatGPT-routed queued tasks.
assert 'factory-fleet-scheduler-v4' in scheduler
assert '.worker_policy.enabled | index("jules") != null' in scheduler
assert proves_exclusion(scheduler)
assert 'WORKER_ROUTE_REFUSED' in dispatcher

# Active scheduler/watchdog/rework/telemetry resolve provider from machine ownership/durable identity,
# never from a freely mutable route label after claim.
for workflow in (scheduler, dispatcher, watchdog, ci_rework, quality_rework, telemetry):
    assert 'factory_worker_provider.py' in workflow
for workflow in (scheduler, dispatcher, watchdog, ci_rework, quality_rework, telemetry):
    assert 'route_mismatch' in workflow
assert 'factory:worker:jules' in scheduler

# Canonical provider resolver: queued uses route; dispatching uses ownership; delivered work uses identity.
assert provider.resolve_provider(
    'Leion-wp/product', 17, 'factory:queued',
    ['factory:queued', 'factory:agent:chatgpt'], [],
)['provider'] == 'chatgpt'

jules_comments = [
    {'body': '<!-- roots-jules-session task_id=Leion-wp/product#17 session=sessions/abc -->'},
]
jules_drift = provider.resolve_provider(
    'Leion-wp/product', 17, 'factory:dispatched',
    ['factory:dispatched', 'factory:worker:jules', 'factory:agent:chatgpt'], jules_comments,
)
assert jules_drift['provider'] == 'jules'
assert jules_drift['source'] == 'identity'
assert jules_drift['route_mismatch'] is True

chatgpt_comments = [
    {'body': '<!-- roots-chatgpt-worker task_id=Leion-wp/product#17 branch=chatgpt-17 pr=21 -->'},
]
chatgpt_drift = provider.resolve_provider(
    'Leion-wp/product', 17, 'factory:dispatched',
    ['factory:dispatched', 'factory:worker:chatgpt'], chatgpt_comments,
)
assert chatgpt_drift['provider'] == 'chatgpt'
assert chatgpt_drift['route_mismatch'] is True

dispatching_drift = provider.resolve_provider(
    'Leion-wp/product', 17, 'factory:dispatching',
    ['factory:dispatching', 'factory:worker:jules', 'factory:agent:chatgpt'], [],
)
assert dispatching_drift['provider'] == 'jules'
assert dispatching_drift['source'] == 'ownership'
assert dispatching_drift['route_mismatch'] is True

try:
    provider.resolve_provider(
        'Leion-wp/product', 17, 'factory:dispatching',
        ['factory:dispatching', 'factory:worker:jules', 'factory:worker:chatgpt'], [],
    )
except provider.ProviderConflict:
    pass
else:
    raise AssertionError('conflicting active provider ownership labels must fail closed')

try:
    provider.resolve_provider(
        'Leion-wp/product', 17, 'factory:dispatched', ['factory:dispatched'],
        [
            {'body': '<!-- roots-jules-session task_id=Leion-wp/product#17 session=sessions/abc -->'},
            {'body': '<!-- roots-chatgpt-worker task_id=Leion-wp/product#17 branch=chatgpt-17 pr=21 -->'},
        ],
    )
except provider.ProviderConflict:
    pass
else:
    raise AssertionError('conflicting provider identities must fail closed')

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
assert 'factory:worker:chatgpt' in doc
assert 'audit trace only' in doc
assert 'must not' in doc.lower()
assert 'publish `roots-quality-verdict`' in doc
assert 'merge its own PR' in doc
assert 'at most three attempts' in doc

print('ChatGPT worker routing contract: PASS')
