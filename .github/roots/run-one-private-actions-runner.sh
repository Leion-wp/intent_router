#!/usr/bin/env bash
set -euo pipefail

: "${ROOTS_RUNNER_REPOSITORY:?set owner/repository}"

pin_file="${ROOTS_RUNNER_PIN_FILE:-.github/roots/factory-private-runner-version-v1.json}"
runner_version="${ROOTS_RUNNER_VERSION:-}"
runner_sha256="${ROOTS_RUNNER_SHA256:-}"
if [ -z "$runner_version" ] && [ -z "$runner_sha256" ]; then
  test -f "$pin_file"
  runner_version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["runner_version"])' "$pin_file")"
  runner_sha256="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sha256"])' "$pin_file")"
elif [ -z "$runner_version" ] || [ -z "$runner_sha256" ]; then
  echo "ROOTS_RUNNER_VERSION and ROOTS_RUNNER_SHA256 must be set together" >&2
  exit 2
fi

case "$ROOTS_RUNNER_REPOSITORY" in
  */*) ;;
  *) echo "ROOTS_RUNNER_REPOSITORY must be owner/repository" >&2; exit 2 ;;
esac

registration_token="${ROOTS_RUNNER_REGISTRATION_TOKEN:-}"
if [ -n "${ROOTS_RUNNER_REGISTRATION_TOKEN_FILE:-}" ]; then
  if [ -n "$registration_token" ]; then
    echo "set either ROOTS_RUNNER_REGISTRATION_TOKEN or ROOTS_RUNNER_REGISTRATION_TOKEN_FILE, not both" >&2
    exit 2
  fi
  token_file="$ROOTS_RUNNER_REGISTRATION_TOKEN_FILE"
  test -f "$token_file"
  registration_token="$(cat "$token_file")"
  rm -f "$token_file"
fi
test -n "$registration_token"

work_root="$(mktemp -d)"
cleanup() {
  rm -rf "$work_root"
}
trap cleanup EXIT INT TERM

archive="$work_root/actions-runner.tar.gz"
runner_dir="$work_root/runner"
mkdir -p "$runner_dir"

url="https://github.com/actions/runner/releases/download/v${runner_version}/actions-runner-linux-x64-${runner_version}.tar.gz"
curl --fail --location --silent --show-error "$url" --output "$archive"
printf '%s  %s\n' "$runner_sha256" "$archive" | sha256sum --check --status

tar -xzf "$archive" -C "$runner_dir"
cd "$runner_dir"

./config.sh \
  --unattended \
  --ephemeral \
  --url "https://github.com/$ROOTS_RUNNER_REPOSITORY" \
  --token "$registration_token" \
  --name "roots-private-ci-$(hostname)-$$" \
  --labels "roots-private-ci" \
  --disableupdate \
  --work "_work"

unset ROOTS_RUNNER_REGISTRATION_TOKEN
unset ROOTS_RUNNER_REGISTRATION_TOKEN_FILE
registration_token=''
exec ./run.sh
