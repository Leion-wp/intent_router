#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo 'usage: factory-gh-array-collection.sh <github-api-endpoint>' >&2
  exit 2
fi

endpoint="$1"

gh api --paginate --slurp "$endpoint" \
  | jq -c '
      if type != "array" then
        error("paginated GitHub response was not a page array")
      elif all(.[]; type == "array") then
        (add // [])
      else
        error("paginated GitHub endpoint did not return JSON array pages")
      end
    '
