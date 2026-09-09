#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path('.github/roots')
WORKFLOW = Path('.github/workflows/factory-worker-route-bootstrap.yml').read_text()
CAPACITY = json.loads((ROOT / 'factory-worker-capacity.json').read_text())
PROFILE_SCHEMA = json.loads((ROOT / 'factory-repository-profile.schema.json').read_text())

assert 'factory-worker-route-bootstrap-v1' in WORKFLOW
assert '.value.selection_label? != null' in WORKFLOW
assert '.worker_policy.enabled | index($provider) != null' in WORKFLOW
assert 'gh label create "$label"' in WORKFLOW
assert 'Labels select an already-authorized provider' in WORKFLOW
assert 'factory:agent:chatgpt' not in WORKFLOW, 'bootstrap must remain provider-neutral'

chatgpt = CAPACITY['workers']['chatgpt']
assert chatgpt['selection_label'] == 'factory:agent:chatgpt'
assert chatgpt['max_concurrency'] == 1
worker_enum = PROFILE_SCHEMA['properties']['worker_policy']['properties']['enabled']['items']['enum']
assert 'chatgpt' in worker_enum

print('worker route bootstrap contract: PASS')
