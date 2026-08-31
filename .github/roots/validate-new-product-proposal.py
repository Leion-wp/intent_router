#!/usr/bin/env python3
import json
import pathlib
import re
import sys

import jsonschema

ROOT = pathlib.Path(__file__).resolve().parent
MARKER = "<!-- roots-new-product-proposal:v1 -->"
FORBIDDEN = (
    ".github/workflows",
    "modify workflow",
    "create secret",
    "modify secret",
    "rotate secret",
    "export secret",
    "expand permission",
    "production deploy",
    "deploy production",
    "automatic spending",
    "unrestricted spending",
)


def load_json(path: pathlib.Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def validate_document(document):
    schema = load_json(ROOT / "factory-new-product-proposal.schema.json")
    jsonschema.Draft202012Validator(schema).validate(document)
    text = " ".join(
        [
            document["product_name"],
            document["one_liner"],
            document["target_user"],
            document["problem"],
            document["hypothesis"],
            document["success_metric"],
            document["human_gate"]["reason"],
        ]
        + document["validation_plan"]
        + document["evidence"]
    ).lower()
    for forbidden in FORBIDDEN:
        if forbidden in text:
            raise ValueError(f"forbidden authority request in proposal: {forbidden}")
    if document["repository_name"].lower() == "intent_router":
        raise ValueError("new-product proposal cannot target the control-plane repository")


def extract(body_path: pathlib.Path, out_path: pathlib.Path):
    body = body_path.read_text(encoding="utf-8")
    if MARKER not in body:
        raise ValueError("missing roots-new-product-proposal:v1 marker")
    matches = re.findall(r"```json\s*(\{.*?\})\s*```", body, flags=re.DOTALL)
    if len(matches) != 1:
        raise ValueError(f"expected exactly one fenced JSON proposal payload, found {len(matches)}")
    document = json.loads(matches[0])
    validate_document(document)
    out_path.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main():
    if len(sys.argv) < 3:
        raise SystemExit("usage: validate-new-product-proposal.py <validate|extract> ...")
    command = sys.argv[1]
    if command == "validate" and len(sys.argv) == 3:
        validate_document(load_json(pathlib.Path(sys.argv[2])))
        print(f"new-product proposal validation passed: {sys.argv[2]}")
        return
    if command == "extract" and len(sys.argv) == 4:
        extract(pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]))
        print(f"new-product proposal extraction passed: {sys.argv[3]}")
        return
    raise SystemExit("invalid new-product proposal validator command")


if __name__ == "__main__":
    main()
