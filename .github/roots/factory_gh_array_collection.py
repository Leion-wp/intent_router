#!/usr/bin/env python3
"""Bounded streaming normalizer for concatenated JSON array pages from `gh api --paginate`."""
from __future__ import annotations

import codecs
import json
import os
import sys

DEFAULTS = {"pages": 100, "items": 10_000, "bytes": 8 * 1024 * 1024}
HARD_MAX = {"pages": 200, "items": 20_000, "bytes": 16 * 1024 * 1024}


def read_limit(name: str, key: str) -> int:
    raw = os.environ.get(name)
    value = DEFAULTS[key] if raw in (None, "") else int(raw)
    if value < 1 or value > HARD_MAX[key]:
        raise SystemExit(f"{name} must be in 1..{HARD_MAX[key]}")
    return value


def main() -> None:
    max_pages = read_limit("ROOTS_GH_COLLECTION_MAX_PAGES", "pages")
    max_items = read_limit("ROOTS_GH_COLLECTION_MAX_ITEMS", "items")
    max_bytes = read_limit("ROOTS_GH_COLLECTION_MAX_BYTES", "bytes")

    decoder = json.JSONDecoder()
    utf8 = codecs.getincrementaldecoder("utf-8")()
    buffer = ""
    pages = 0
    items: list[object] = []
    bytes_seen = 0

    def consume(final: bool = False) -> None:
        nonlocal buffer, pages, items
        while True:
            buffer = buffer.lstrip()
            if not buffer:
                return
            try:
                value, end = decoder.raw_decode(buffer)
            except json.JSONDecodeError:
                if final:
                    raise SystemExit("paginated GitHub response contained incomplete/invalid JSON")
                return
            if not isinstance(value, list):
                raise SystemExit("paginated GitHub endpoint did not return JSON array pages")
            pages += 1
            if pages > max_pages:
                raise SystemExit(
                    f"GitHub collection page budget exceeded: {pages}>{max_pages}; "
                    "consumer must use a narrower/incremental query or a persisted watermark"
                )
            if len(items) + len(value) > max_items:
                raise SystemExit(
                    f"GitHub collection item budget exceeded: {len(items) + len(value)}>{max_items}; "
                    "consumer must use a narrower/incremental query or a persisted watermark"
                )
            items.extend(value)
            buffer = buffer[end:]

    while True:
        chunk = sys.stdin.buffer.read(65536)
        if not chunk:
            break
        bytes_seen += len(chunk)
        if bytes_seen > max_bytes:
            raise SystemExit(
                f"GitHub collection byte budget exceeded: {bytes_seen}>{max_bytes}; "
                "consumer must use a narrower/incremental query or a persisted watermark"
            )
        buffer += utf8.decode(chunk)
        consume()

    buffer += utf8.decode(b"", final=True)
    consume(final=True)
    print(json.dumps(items, separators=(",", ":")))


if __name__ == "__main__":
    main()
