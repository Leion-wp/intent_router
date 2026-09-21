#!/usr/bin/env python3
"""Fetch and validate untrusted repository-local factory documents safely.

Repository-local state is not control-plane authority. Callers may isolate a local
failure to one managed repository, but they must not confuse an unavailable read
with a confirmed missing file. This helper therefore provides two bounded
primitives:

- fetch a repository contents endpoint and classify it as PRESENT, ABSENT_404 or
  ERROR without echoing response bodies/errors;
- validate a fetched JSON document against a committed schema, optionally bound
  to an exact repository identity.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable

import jsonschema


class RepositoryDocumentError(Exception):
    pass


PRESENT = "PRESENT"
ABSENT_404 = "ABSENT_404"
ERROR = "ERROR"
_HTTP_STATUS_RE = re.compile(rb"HTTP(?:/[^\s]+)?\s+(\d{3})")


def _load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise RepositoryDocumentError("document is not readable JSON") from exc


def validate_document(document_path: Path, schema_path: Path, expect_repository: str | None = None) -> None:
    document = _load_json(document_path)
    schema = _load_json(schema_path)
    try:
        jsonschema.Draft202012Validator(schema).validate(document)
    except jsonschema.ValidationError as exc:
        raise RepositoryDocumentError("document does not satisfy schema") from exc

    if expect_repository is not None:
        if not isinstance(document, dict) or document.get("repository") != expect_repository:
            raise RepositoryDocumentError("document repository identity does not match target repository")


def _http_status(stdout: bytes, stderr: bytes) -> int | None:
    matches = _HTTP_STATUS_RE.findall(stdout + b"\n" + stderr)
    if not matches:
        return None
    try:
        return int(matches[-1])
    except ValueError:
        return None


def _included_body(stdout: bytes) -> bytes | None:
    for separator in (b"\r\n\r\n", b"\n\n"):
        if separator in stdout:
            return stdout.split(separator, 1)[1]
    return None


def fetch_repository_content(
    endpoint: str,
    output_path: Path,
    runner: Callable[..., subprocess.CompletedProcess[bytes]] | None = None,
) -> str:
    """Fetch one raw GitHub contents endpoint without conflating errors with 404.

    The GitHub CLI is asked to include response headers. HTTP status is parsed
    from captured stdout/stderr but neither is emitted. Only a successful 2xx
    response may materialize ``output_path``. A confirmed HTTP 404 is the sole
    missing-file state. Every other failure, including an unparseable/transport
    failure, is ERROR and leaves no output file behind.
    """

    output_path.unlink(missing_ok=True)
    run = runner or subprocess.run
    completed = run(
        [
            "gh",
            "api",
            "--include",
            "-H",
            "Accept: application/vnd.github.raw+json",
            endpoint,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    stdout = completed.stdout or b""
    stderr = completed.stderr or b""
    status = _http_status(stdout, stderr)

    if completed.returncode == 0 and status is not None and 200 <= status < 300:
        body = _included_body(stdout)
        if body is None:
            return ERROR
        temp_path = output_path.with_name(output_path.name + ".tmp")
        try:
            temp_path.write_bytes(body)
            temp_path.replace(output_path)
        except OSError:
            temp_path.unlink(missing_ok=True)
            output_path.unlink(missing_ok=True)
            return ERROR
        return PRESENT

    if status == 404:
        return ABSENT_404

    return ERROR


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--document", type=Path)
    parser.add_argument("--schema", type=Path)
    parser.add_argument("--expect-repository")
    parser.add_argument("--fetch-endpoint")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--kind", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)

    if args.fetch_endpoint is not None:
        if args.output is None or args.document is not None or args.schema is not None:
            parser.error("fetch mode requires --fetch-endpoint and --output only")
        print(fetch_repository_content(args.fetch_endpoint, args.output))
        return 0

    if args.document is None or args.schema is None or args.output is not None:
        parser.error("validation mode requires --document and --schema")

    try:
        validate_document(args.document, args.schema, args.expect_repository)
    except RepositoryDocumentError:
        print(f"INVALID_REPOSITORY_DOCUMENT: {args.kind}", file=sys.stderr)
        return 2
    print(f"VALID_REPOSITORY_DOCUMENT: {args.kind}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
