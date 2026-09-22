#!/usr/bin/env python3
import argparse
import json
import re
import sys

import jsonschema


SECRET_PATTERNS = (
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"sk-(?:proj-)?[A-Za-z0-9_-]{20,}"),
    re.compile(r"AIza[0-9A-Za-z_-]{20,}"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
)

ALLOWED_NEXT_ACTIONS = {
    "REWORK": {"REWORK"},
    "FAILED": {"CLOSE", "HUMAN_REQUIRED", "NONE"},
    "BLOCKED": {"WAIT", "HUMAN_REQUIRED", "CLOSE"},
    "SUCCEEDED": {"REVIEW", "WAIT", "NONE"},
}


def _load(path: str):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def _string_values(value, path="$"):
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, dict):
        for key, child in value.items():
            yield from _string_values(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _string_values(child, f"{path}[{index}]")


def _reject_secret_shaped_values(result):
    for location, value in _string_values(result):
        if any(pattern.search(value) for pattern in SECRET_PATTERNS):
            raise ValueError(
                f"FactoryResult contains a secret-shaped value at {location}; value omitted"
            )


def _validate_schema(schema, result):
    jsonschema.Draft202012Validator.check_schema(schema)
    validator = jsonschema.Draft202012Validator(schema)
    errors = sorted(
        validator.iter_errors(result),
        key=lambda error: [str(part) for part in error.absolute_path],
    )
    if errors:
        rendered = []
        for error in errors:
            location = ".".join(str(part) for part in error.absolute_path) or "$"
            rendered.append(f"{location}: validator={error.validator}")
        raise ValueError(
            "FactoryResult schema validation failed: " + "; ".join(rendered)
        )


def _validate_semantics(result):
    status = result["status"]
    next_action = result["next_action"]
    if next_action not in ALLOWED_NEXT_ACTIONS[status]:
        raise ValueError("FactoryResult status/next_action transition is not allowed")


def _validate_binding(result, expected_task_id=None, expected_worker=None):
    if expected_task_id is not None and result["task_id"] != expected_task_id:
        raise ValueError("FactoryResult task_id does not match expected task")
    if expected_worker is not None and result["worker"] != expected_worker:
        raise ValueError("FactoryResult worker does not match expected worker")


def validate_result(
    schema_path: str,
    result_path: str,
    expected_task_id=None,
    expected_worker=None,
):
    schema = _load(schema_path)
    result = _load(result_path)
    _reject_secret_shaped_values(result)
    _validate_schema(schema, result)
    _validate_semantics(result)
    _validate_binding(result, expected_task_id, expected_worker)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--schema", required=True)
    parser.add_argument("--result", required=True)
    parser.add_argument("--expected-task-id")
    parser.add_argument("--expected-worker")
    args = parser.parse_args(argv)
    try:
        validate_result(
            args.schema,
            args.result,
            expected_task_id=args.expected_task_id,
            expected_worker=args.expected_worker,
        )
    except (OSError, json.JSONDecodeError, jsonschema.SchemaError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
