#!/usr/bin/env bash
set -euo pipefail

workflow='.github/workflows/factory-low-risk-auto-merge.yml'

test -f "$workflow"
grep -Fq 'factory:risk-low' "$workflow"
grep -Fq 'factory:human-required' "$workflow"
grep -Fq 'factory:blocked' "$workflow"
grep -Fq 'factory:escalated' "$workflow"
grep -Fq 'required_jobs' "$workflow"
grep -Fq 'current_head' "$workflow"
grep -Fq 'head moved; revalidation required' "$workflow"
grep -Fq '.github/workflows/' "$workflow"
grep -Fq '.factory/' "$workflow"
grep -Fq 'pulls/${number}/merge' "$workflow"
grep -Fq 'merge_method=squash' "$workflow"

echo 'factory-low-risk-auto-merge contract: PASS'
