#!/usr/bin/env python3
from pathlib import Path

workflow = Path('.github/workflows/factory-release-readiness.yml').read_text()
contract = Path('.github/roots/factory-release-readiness-v1.md').read_text()

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

# Documentation must describe the same exact-head contract and fail-closed race handling.
assert 'push CI run for that exact HEAD' in contract
assert 'successful historical run on the same branch is never sufficient' in contract
assert 'HEAD is re-read immediately before' in contract
assert 'default-branch HEAD change during reconciliation' in contract

print('release readiness exact-head CI contract: PASS')
