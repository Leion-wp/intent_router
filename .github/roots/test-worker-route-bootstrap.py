#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path('.github/roots')
WORKFLOW = Path('.github/workflows/factory-worker-route-bootstrap.yml').read_text()
CAPACITY = json.loads((ROOT / 'factory-worker-capacity.json').read_text())
PROFILE_SCHEMA = json.loads((ROOT / 'factory-repository-profile.schema.json').read_text())

assert 'factory-worker-route-bootstrap-v2' in WORKFLOW
assert '.value.selection_label? != null' in WORKFLOW
assert '.value.ownership_label? != null' in WORKFLOW
assert '.worker_policy.enabled | index($provider) != null' in WORKFLOW
assert 'gh label create "$label"' in WORKFLOW
assert 'Route labels select an already-authorized provider while queued' in WORKFLOW
assert 'ownership labels reserve active provider capacity after claim' in WORKFLOW
assert 'factory:agent:chatgpt' not in WORKFLOW, 'bootstrap must remain provider-neutral'
assert 'factory:worker:jules' not in WORKFLOW, 'bootstrap must derive ownership labels from the capacity contract'
assert 'factory:worker:chatgpt' not in WORKFLOW, 'bootstrap must derive ownership labels from the capacity contract'

jules = CAPACITY['workers']['jules']
chatgpt = CAPACITY['workers']['chatgpt']
assert jules['max_concurrency'] == 15
assert jules['ownership_label'] == 'factory:worker:jules'
assert chatgpt['selection_label'] == 'factory:agent:chatgpt'
assert chatgpt['ownership_label'] == 'factory:worker:chatgpt'
assert chatgpt['max_concurrency'] == 1
worker_enum = PROFILE_SCHEMA['properties']['worker_policy']['properties']['enabled']['items']['enum']
assert 'jules' in worker_enum
assert 'chatgpt' in worker_enum

print('worker route and ownership bootstrap contract: PASS')
