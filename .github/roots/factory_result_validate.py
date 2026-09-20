#!/usr/bin/env python3
import argparse
import json
import pathlib
import sys

import jsonschema


def _load(path: str):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def validate_result(schema_path: str, result_path: str):
    schema = _load(schema_path)
    result = _load(result_path)
    jsonschema.Draft202012Validator.check_schema(schema)
    validator = jsonschema.Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(result), key=lambda error: list(error.absolute_path))
    if errors:
        rendered = []
        for error in errors:
            location = ".".join(str(part) for part in error.absolute_path) or "$"
            rendered.append(f"{location}: {error.message}")
        raise ValueError("FactoryResult schema validation failed: " + "; ".join(rendered))
    return result


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--schema", required=True)
    parser.add_argument("--result", required=True)
    args = parser.parse_args(argv)
    try:
        validate_result(args.schema, args.result)
    except (OSError, json.JSONDecodeError, jsonschema.SchemaError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
