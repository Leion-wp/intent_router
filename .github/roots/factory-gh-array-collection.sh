#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo 'usage: factory-gh-array-collection.sh <github-api-endpoint>' >&2
  exit 2
fi

endpoint="$1"
timeout_seconds="${ROOTS_GH_COLLECTION_TIMEOUT_SECONDS:-60}"
if ! [[ "$timeout_seconds" =~ ^[0-9]+$ ]] || [ "$timeout_seconds" -lt 1 ] || [ "$timeout_seconds" -gt 120 ]; then
  echo 'ROOTS_GH_COLLECTION_TIMEOUT_SECONDS must be in 1..120' >&2
  exit 2
fi

# Do not use gh --slurp here: page/item/byte budgets must be enforceable while data
# is still streaming so an unexpectedly large history cannot consume unbounded memory.
timeout "$timeout_seconds" gh api --paginate "$endpoint" \
  | python3 "$(dirname "$0")/factory_gh_array_collection.py"
