#!/usr/bin/env python3
"""Validate untrusted repository-local factory documents without leaking their contents.

The caller decides whether a validation failure is globally fatal or isolated to one
managed repository. This helper deliberately returns a bounded deterministic error
instead of printing jsonschema instance data.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import jsonschema


class RepositoryDocumentError(Exception):
    pass


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


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--document", required=True, type=Path)
    parser.add_argument("--schema", required=True, type=Path)
    parser.add_argument("--expect-repository")
    parser.add_argument("--kind", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        validate_document(args.document, args.schema, args.expect_repository)
    except RepositoryDocumentError:
        print(f"INVALID_REPOSITORY_DOCUMENT: {args.kind}", file=sys.stderr)
        return 2
    print(f"VALID_REPOSITORY_DOCUMENT: {args.kind}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
