#!/usr/bin/env python3
"""Mint one repository-scoped GitHub Actions runner registration token safely."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_POLICY = ROOT / ".github/roots/factory-private-runner-policy-v1.json"
API_VERSION = "2026-03-10"


def fail(message: str) -> "NoReturn":
    raise SystemExit(message)


def load_allowed_repositories(path: Path) -> set[str]:
    try:
        policy = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read private runner policy: {exc}")
    repositories = policy.get("managed_private_repositories")
    if not isinstance(repositories, list) or not repositories:
        fail("private runner policy has no managed_private_repositories")
    if not all(isinstance(item, str) and item.count("/") == 1 for item in repositories):
        fail("managed_private_repositories is malformed")
    return set(repositories)


def mint(repository: str, admin_token: str) -> tuple[str, str]:
    owner, name = repository.split("/", 1)
    url = f"https://api.github.com/repos/{owner}/{name}/actions/runners/registration-token"
    request = urllib.request.Request(
        url,
        data=b"",
        method="POST",
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {admin_token}",
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": "roots-private-runner-token-broker/1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        fail(f"GitHub runner token request failed with HTTP {exc.code}")
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        fail(f"GitHub runner token request failed: {type(exc).__name__}")

    token = payload.get("token")
    expires_at = payload.get("expires_at")
    if not isinstance(token, str) or len(token) < 16 or not isinstance(expires_at, str):
        fail("GitHub runner token response was malformed")
    return token, expires_at


def write_secret_file(path: Path, token: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        fail(f"refusing to overwrite existing token file: {path}")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(token)
            handle.write("\n")
    except Exception:
        try:
            path.unlink()
        except OSError:
            pass
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--policy", type=Path, default=DEFAULT_POLICY)
    args = parser.parse_args()

    allowed = load_allowed_repositories(args.policy)
    if args.repository not in allowed:
        fail(f"repository is not admitted by private runner policy: {args.repository}")

    admin_token = os.environ.get("ROOTS_RUNNER_ADMIN_TOKEN")
    if not admin_token:
        fail("ROOTS_RUNNER_ADMIN_TOKEN is required")

    token, expires_at = mint(args.repository, admin_token)
    write_secret_file(args.output, token)

    # Never print the registration token. The admin credential remains only in
    # the broker process; the disposable runner consumes the short-lived file.
    print(
        json.dumps(
            {
                "repository": args.repository,
                "expires_at": expires_at,
                "token_file": str(args.output),
                "token_exposed": False,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
