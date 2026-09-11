#!/usr/bin/env python3
import json
import pathlib
import sys

import jsonschema

ROOT = pathlib.Path(__file__).resolve().parent
VALID_ROLES = {
    "factory_control_plane",
    "factory_substrate",
    "generated_product",
    "internal_tool",
}
SUBSTRATE_EXTERNAL_PRODUCT_SIGNALS = (
    "starter kit",
    "indie founder",
    "developer adoption",
    "external developer",
    "boilerplate customers",
    "sell the boilerplate",
)
SUBSTRATE_MANUFACTURING_SIGNALS = (
    "manufactur",
    "factory",
    "substrate",
    "reusab",
    "reuse",
    "bootstrap",
    "clone-to",
    "generated micro-saas",
    "generated saas",
    "product-specific code",
    "manual intervention",
    "declarative",
    "throughput",
    "worker effort",
    "build/ci",
)


def load_json(path):
    with pathlib.Path(path).open(encoding="utf-8") as handle:
        return json.load(handle)


def load_schema(name):
    return load_json(ROOT / name)


def validate_schema(document, schema_name):
    schema = load_schema(schema_name)
    jsonschema.Draft202012Validator(schema).validate(document)


def validate_profile(profile_path, expected_repo=None):
    profile = load_json(profile_path)
    validate_schema(profile, "factory-repository-profile.schema.json")
    if expected_repo and profile["repository"] != expected_repo:
        raise ValueError(f"profile repository mismatch: {profile['repository']} != {expected_repo}")
    if profile["repository_role"] not in VALID_ROLES:
        raise ValueError(f"unknown repository role: {profile['repository_role']}")
    return profile


def validate_state_against_profile(state_path, profile_path):
    profile = validate_profile(profile_path)
    state = load_json(state_path)
    validate_schema(state, "factory-product-state.schema.json")
    if state["repository"] != profile["repository"]:
        raise ValueError(
            f"state repository mismatch: {state['repository']} != {profile['repository']}"
        )
    if state["repository_role"] != profile["repository_role"]:
        raise ValueError(
            "state repository role mismatch: "
            f"{state['repository_role']} != {profile['repository_role']}"
        )
    return state


def validate_decision_against_profile(decision_path, profile_path):
    profile = validate_profile(profile_path)
    decision = load_json(decision_path)
    validate_schema(decision, "factory-product-decision.schema.json")
    if decision["repository"] != profile["repository"]:
        raise ValueError(
            f"decision repository mismatch: {decision['repository']} != {profile['repository']}"
        )
    if decision["repository_role"] != profile["repository_role"]:
        raise ValueError(
            "decision repository role mismatch: "
            f"{decision['repository_role']} != {profile['repository_role']}"
        )

    if profile["repository_role"] == "factory_substrate":
        context = decision["product_context"]
        text = " ".join(
            [
                decision["objective"],
                decision["hypothesis"],
                decision["success_metric"],
                context["consumer"],
                context["purpose"],
                context["next_question"],
            ]
        ).lower()
        if not decision["human_gate"]["required"]:
            for signal in SUBSTRATE_EXTERNAL_PRODUCT_SIGNALS:
                if signal in text:
                    raise ValueError(
                        "factory_substrate cannot optimize external product adoption "
                        f"without human authorization: {signal}"
                    )
        if not any(signal in text for signal in SUBSTRATE_MANUFACTURING_SIGNALS):
            raise ValueError(
                "factory_substrate decision lacks a manufacturing-oriented objective or metric"
            )
    return decision


def main():
    if len(sys.argv) < 3:
        raise SystemExit(
            "usage: validate-repository-role.py <profile|state|decision> <document> [profile-or-expected-repo]"
        )
    command = sys.argv[1]
    if command == "profile" and len(sys.argv) in {3, 4}:
        profile = validate_profile(sys.argv[2], sys.argv[3] if len(sys.argv) == 4 else None)
        print(profile["repository_role"])
        return
    if command == "state" and len(sys.argv) == 4:
        validate_state_against_profile(sys.argv[2], sys.argv[3])
        print("state repository role validation passed")
        return
    if command == "decision" and len(sys.argv) == 4:
        validate_decision_against_profile(sys.argv[2], sys.argv[3])
        print("decision repository role validation passed")
        return
    raise SystemExit("invalid repository role validation command")


if __name__ == "__main__":
    main()
