#!/usr/bin/env python3
import importlib.util
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
VALIDATOR = ROOT / "validate-planning.py"

spec = importlib.util.spec_from_file_location("validate_planning", VALIDATOR)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def expect_rejected(text: str) -> None:
    try:
        module.reject_forbidden_text(text, "regression-test")
    except ValueError:
        return
    raise AssertionError(f"unsafe planning text was accepted: {text!r}")


# Positive control-plane mutation language must remain rejected.
expect_rejected("perform production deploy now")
expect_rejected("create secret for the runtime")
expect_rejected("modify .github/workflows/factory.yml")

# Validate the committed roadmap end-to-end so policy text and fixtures cannot drift silently.
module.validate_roadmap(ROOT / "micro-saas-roadmap-v1.json")
print("planning safety regression tests passed")
