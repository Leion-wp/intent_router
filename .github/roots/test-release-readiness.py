#!/usr/bin/env python3
import importlib.util
import json
import subprocess
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
helper_text = HELPER_PATH.read_text()
assert 'INVALID_REPOSITORY_DOCUMENT:' in helper_text
assert 'ABSENT_404' in helper_text
assert 'PRESENT' in helper_text
assert 'ERROR' in helper_text
assert 'anomalies=0' in credential_workflow
assert 'anomalies=0' in workflow
assert credential_workflow.count('factory_repo_local_state.py') >= 6
assert workflow.count('factory_repo_local_state.py') >= 4
assert 'CONTROL_PLANE_ANOMALY: ${repo} has invalid .factory/credential-requirements.json' in credential_workflow
assert 'CONTROL_PLANE_ANOMALY: ${repo} has invalid .factory/product-state.json' in credential_workflow
assert 'CONTROL_PLANE_ANOMALY: ${repo} has invalid .factory/product-state.json' in workflow

# GitHub contents reads have a three-state contract: only a confirmed 404 is
# absence. Any permission/rate-limit/server/transport failure must be isolated
# to the current repository instead of becoming an implicit missing document.
for text in (credential_workflow, workflow):
    assert '--fetch-endpoint' in text
    assert 'ABSENT_404)' in text
    assert 'ERROR)' in text
    assert '.factory/profile.json could not be read; skipping repository.' in text
assert '.factory/credential-requirements.json could not be read; no readiness mutation applied.' in credential_workflow
assert '.factory/product-state.json could not be read; no readiness mutation applied.' in credential_workflow
assert '.factory/product-state.json could not be read; no release mutation applied.' in workflow

credential_manifest_guard = credential_workflow.index('--kind credential-requirements)')
credential_state_guard = credential_workflow.index('--kind product-state)')
credential_first_label = credential_workflow.index("gh label create 'factory:credentials-ready'")
credential_manifest_put = credential_workflow.index('gh api --method PUT "$endpoint"')
assert credential_manifest_guard < credential_first_label
assert credential_state_guard < credential_first_label
assert credential_manifest_guard < credential_manifest_put
assert credential_state_guard < credential_manifest_put

# Only the explicit not-found state may mark the human-owned manifest missing;
# ERROR branches continue before labels, manifest installation or gate writes.
missing_pos = credential_workflow.index('ABSENT_404)\n                manifest_missing=true')
manifest_error_pos = credential_workflow.index('.factory/credential-requirements.json could not be read')
state_error_pos = credential_workflow.index('.factory/product-state.json could not be read')
assert missing_pos < credential_first_label
assert manifest_error_pos < credential_first_label
assert state_error_pos < credential_first_label

release_profile_guard = workflow.index('--kind profile')
release_state_guard = workflow.index('--kind product-state)')
release_first_label = workflow.index("gh label create 'factory:release-ready'")
assert release_profile_guard < release_state_guard < release_first_label
assert workflow.index('.factory/product-state.json could not be read') < release_first_label

# Control-plane policy/schema failures remain globally fatal and occur before
# entering the per-repository loop.
credential_loop = credential_workflow.index('while IFS= read -r repo; do')
release_loop = workflow.index('while IFS= read -r repo; do')
assert credential_workflow.index('micro-saas-credentials-v1.json') < credential_loop
assert credential_workflow.index('jsonschema.Draft202012Validator(s).validate(d)') < credential_loop
assert workflow.index('factory-release-policy.schema.json') < release_loop
assert workflow.index('jsonschema.Draft202012Validator(s).validate(d)') < release_loop
assert workflow.index("jq -e '.enabled == true and .production_deploy == \"HUMAN_REQUIRED\"'") < release_loop

# Helper validation behavior is independently exercised with harmless local
# fixtures: valid documents pass; schema-invalid, identity-mismatched and
# malformed JSON fail without exposing source content in the exception contract.
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

# Fetch classification is tested without network access. The fake runner models
# the forms emitted by `gh api --include`, including GitHub CLI's stderr 404.
def fake_runner(returncode: int, stdout: bytes = b'', stderr: bytes = b''):
    def run(*_args, **_kwargs):
        return subprocess.CompletedProcess(args=['gh'], returncode=returncode, stdout=stdout, stderr=stderr)
    return run

with tempfile.TemporaryDirectory() as tmp:
    output = Path(tmp) / 'document.json'
    payload = b'{"repository":"Leion-wp/example"}\n'
    success = b'HTTP/2.0 200 OK\r\ncontent-type: application/json\r\n\r\n' + payload
    state = repo_local_state.fetch_repository_content(
        'repos/Leion-wp/example/contents/.factory/profile.json',
        output,
        fake_runner(0, stdout=success),
    )
    assert state == repo_local_state.PRESENT
    assert output.read_bytes() == payload

    for returncode, stdout, stderr, expected in (
        (1, b'', b'gh: Not Found (HTTP 404)', repo_local_state.ABSENT_404),
        (1, b'HTTP/2.0 403 Forbidden\n\n', b'', repo_local_state.ERROR),
        (1, b'HTTP/2.0 429 Too Many Requests\n\n', b'', repo_local_state.ERROR),
        (1, b'HTTP/2.0 503 Service Unavailable\n\n', b'', repo_local_state.ERROR),
        (1, b'', b'connection reset by peer', repo_local_state.ERROR),
    ):
        output.write_text('stale-data-must-not-survive', encoding='utf-8')
        state = repo_local_state.fetch_repository_content(
            'repos/Leion-wp/example/contents/.factory/product-state.json',
            output,
            fake_runner(returncode, stdout=stdout, stderr=stderr),
        )
        assert state == expected
        assert not output.exists()

# Documentation must describe the same exact-head contract and fail-closed race handling.
assert 'push CI run for that exact HEAD' in contract
assert 'successful historical run on the same branch is never sufficient' in contract
assert 'HEAD is re-read immediately before' in contract
assert 'default-branch HEAD change during reconciliation' in contract

print('release readiness exact-head + repository fault-isolation contract: PASS')
