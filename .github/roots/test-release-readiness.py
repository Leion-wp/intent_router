#!/usr/bin/env python3
import importlib.util
import json
import tempfile
from pathlib import Path

workflow = Path('.github/workflows/factory-release-readiness.yml').read_text()
credential_workflow = Path('.github/workflows/factory-credential-readiness.yml').read_text()
contract = Path('.github/roots/factory-release-readiness-v1.md').read_text()

HELPER_PATH = Path('.github/roots/factory_repo_local_state.py')
SPEC = importlib.util.spec_from_file_location('factory_repo_local_state', HELPER_PATH)
assert SPEC is not None and SPEC.loader is not None
repo_local_state = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(repo_local_state)

head_lookup = 'repos/${repo}/git/ref/heads/${default_branch}'
exact_head_filter = '[.workflow_runs[] | select(.head_sha == $head)]'

# Release evidence must be tied to the current default-branch HEAD, not merely
# to the newest historical push run on the same branch.
assert workflow.count(head_lookup) >= 2
assert exact_head_filter in workflow
assert 'current_head=' in workflow
assert 'run_sha=' in workflow
assert '[ "$run_sha" != "$current_head" ]' in workflow
assert 'final_head=' in workflow
assert '[ "$final_head" != "$run_sha" ]' in workflow

# The final HEAD recheck must happen after required-job validation and before
# the release-ready issue can be created or refreshed.
required_jobs_pos = workflow.index('if [ "$required_ok" != \'true\' ]')
final_head_pos = workflow.index('final_head=')
create_pos = workflow.index('gh issue create --repo "$repo" --title "$release_title"')
edit_pos = workflow.index('gh issue edit "$release_issue" --repo "$repo"')
assert required_jobs_pos < final_head_pos < create_pos
assert final_head_pos < edit_pos

# A branch-only latest-run lookup would reintroduce the stale-CI bug.
assert "latest_run=\"$(jq -c '.workflow_runs | sort_by(.created_at) | last // null'" not in workflow
assert 'no push CI run for current default-branch HEAD' in workflow
assert 'waiting for exact-head CI' in workflow

# Repository-local malformed state must be contained to that repository. The
# shared helper performs bounded schema validation without echoing document
# contents; workflows catch a local failure, emit one deterministic anomaly,
# and continue before any readiness/release mutation for that repository.
assert HELPER_PATH.exists()
assert 'INVALID_REPOSITORY_DOCUMENT:' in HELPER_PATH.read_text()
assert 'anomalies=0' in credential_workflow
assert 'anomalies=0' in workflow
assert credential_workflow.count('factory_repo_local_state.py') >= 3
assert workflow.count('factory_repo_local_state.py') >= 2
assert 'CONTROL_PLANE_ANOMALY: ${repo} has invalid .factory/credential-requirements.json' in credential_workflow
assert 'CONTROL_PLANE_ANOMALY: ${repo} has invalid .factory/product-state.json' in credential_workflow
assert 'CONTROL_PLANE_ANOMALY: ${repo} has invalid .factory/product-state.json' in workflow

credential_manifest_guard = credential_workflow.index('--kind credential-requirements')
credential_state_guard = credential_workflow.index('--kind product-state')
credential_first_label = credential_workflow.index("gh label create 'factory:credentials-ready'")
credential_manifest_put = credential_workflow.index('gh api --method PUT "$endpoint"')
assert credential_manifest_guard < credential_first_label
assert credential_state_guard < credential_first_label
assert credential_manifest_guard < credential_manifest_put
assert credential_state_guard < credential_manifest_put

release_profile_guard = workflow.index('--kind profile')
release_state_guard = workflow.index('--kind product-state')
release_first_label = workflow.index("gh label create 'factory:release-ready'")
assert release_profile_guard < release_state_guard < release_first_label

# Control-plane policy/schema failures remain globally fatal and occur before
# entering the per-repository loop.
credential_loop = credential_workflow.index('while IFS= read -r repo; do')
release_loop = workflow.index('while IFS= read -r repo; do')
assert credential_workflow.index('micro-saas-credentials-v1.json') < credential_loop
assert credential_workflow.index('jsonschema.Draft202012Validator(s).validate(d)') < credential_loop
assert workflow.index('factory-release-policy.schema.json') < release_loop
assert workflow.index('jsonschema.Draft202012Validator(s).validate(d)') < release_loop
assert workflow.index("jq -e '.enabled == true and .production_deploy == \"HUMAN_REQUIRED\"'") < release_loop

# Helper behavior is independently exercised with a harmless local fixture:
# valid documents pass; schema-invalid, identity-mismatched and malformed JSON
# fail without exposing source content in the exception contract.
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    schema_path = root / 'schema.json'
    valid_path = root / 'valid.json'
    invalid_path = root / 'invalid.json'
    malformed_path = root / 'malformed.json'
    schema_path.write_text(json.dumps({
        '$schema': 'https://json-schema.org/draft/2020-12/schema',
        'type': 'object',
        'additionalProperties': False,
        'required': ['repository', 'managed'],
        'properties': {
            'repository': {'type': 'string'},
            'managed': {'const': True},
        },
    }), encoding='utf-8')
    valid_path.write_text(json.dumps({'repository': 'Leion-wp/example', 'managed': True}), encoding='utf-8')
    invalid_path.write_text(json.dumps({'repository': 'Leion-wp/example', 'managed': False}), encoding='utf-8')
    malformed_path.write_text('{"repository":"Leion-wp/example","managed":', encoding='utf-8')

    repo_local_state.validate_document(valid_path, schema_path, 'Leion-wp/example')
    for path, expected_repo in (
        (invalid_path, 'Leion-wp/example'),
        (valid_path, 'Leion-wp/other'),
        (malformed_path, 'Leion-wp/example'),
    ):
        try:
            repo_local_state.validate_document(path, schema_path, expected_repo)
        except repo_local_state.RepositoryDocumentError:
            pass
        else:
            raise AssertionError(f'{path.name} should fail repository-local validation')

# Documentation must describe the same exact-head contract and fail-closed race handling.
assert 'push CI run for that exact HEAD' in contract
assert 'successful historical run on the same branch is never sufficient' in contract
assert 'HEAD is re-read immediately before' in contract
assert 'default-branch HEAD change during reconciliation' in contract

print('release readiness exact-head + repository fault-isolation contract: PASS')
