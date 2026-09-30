#!/usr/bin/env bash
set -euo pipefail

: "${ROOTS_RUNNER_REPOSITORY:?set owner/repository}"
: "${ROOTS_RUNNER_VERSION:?set an explicit actions/runner version, for example 2.x.y}"
: "${ROOTS_RUNNER_SHA256:?set the published SHA-256 for that runner archive}"

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

url="https://github.com/actions/runner/releases/download/v${ROOTS_RUNNER_VERSION}/actions-runner-linux-x64-${ROOTS_RUNNER_VERSION}.tar.gz"
curl --fail --location --silent --show-error "$url" --output "$archive"
printf '%s  %s\n' "$ROOTS_RUNNER_SHA256" "$archive" | sha256sum --check --status

tar -xzf "$archive" -C "$runner_dir"
cd "$runner_dir"

./config.sh \
  --unattended \
  --ephemeral \
  --url "https://github.com/$ROOTS_RUNNER_REPOSITORY" \
  --token "$registration_token" \
  --name "roots-private-ci-$(hostname)-$$" \
  --labels "roots-private-ci" \
  --work "_work"

unset ROOTS_RUNNER_REGISTRATION_TOKEN
unset ROOTS_RUNNER_REGISTRATION_TOKEN_FILE
registration_token=''
exec ./run.sh
