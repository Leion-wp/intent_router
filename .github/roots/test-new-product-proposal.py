#!/usr/bin/env python3
import json
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent
VALIDATOR = ROOT / "validate-new-product-proposal.py"

VALID = {
    "version": 1,
    "proposal_id": "invoice-chaser-001",
    "repository_name": "invoice-chaser",
    "product_name": "Invoice Chaser",
    "blueprint": "roots-micro-saas-v1",
    "one_liner": "Help small agencies follow unpaid invoices without manual reminder spreadsheets.",
    "target_user": "Small service agencies that issue recurring invoices.",
    "problem": "Owners lose time checking overdue invoices and manually deciding when to send reminders.",
    "hypothesis": "A lightweight reminder workflow can save enough administrative time to justify a small subscription.",
    "success_metric": "At least three external target users complete the reminder workflow and one indicates willingness to pay.",
    "validation_plan": [
        "Interview five target users about their current overdue-invoice workflow.",
        "Offer a narrow interactive prototype before adding unrelated features."
    ],
    "evidence": ["Problem evidence must be linked or summarized from real target-user research before approval."],
    "risk": "MEDIUM",
    "complexity": "LOW",
    "budget_request_eur": 20,
    "human_gate": {
        "required": True,
        "action": "CREATE_REPOSITORY",
        "reason": "Repository creation is a human-owned portfolio boundary."
    }
}


def run(*args):
    return subprocess.run(["python3", str(VALIDATOR), *map(str, args)], capture_output=True, text=True)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        valid_json = tmp / "valid.json"
        valid_json.write_text(json.dumps(VALID), encoding="utf-8")
        assert run("validate", valid_json).returncode == 0

        body = tmp / "body.md"
        body.write_text(
            "<!-- roots-new-product-proposal:v1 -->\n\n```json\n"
            + json.dumps(VALID)
            + "\n```\n",
            encoding="utf-8",
        )
        extracted = tmp / "extracted.json"
        result = run("extract", body, extracted)
        assert result.returncode == 0, result.stderr
        assert json.loads(extracted.read_text(encoding="utf-8")) == VALID

        missing_gate = dict(VALID)
        missing_gate["human_gate"] = {"required": False, "action": "CREATE_REPOSITORY", "reason": "invalid"}
        invalid_json = tmp / "invalid.json"
        invalid_json.write_text(json.dumps(missing_gate), encoding="utf-8")
        assert run("validate", invalid_json).returncode != 0

        duplicate_fence = tmp / "duplicate.md"
        duplicate_fence.write_text(
            "<!-- roots-new-product-proposal:v1 -->\n```json\n"
            + json.dumps(VALID)
            + "\n```\n```json\n{}\n```\n",
            encoding="utf-8",
        )
        assert run("extract", duplicate_fence, extracted).returncode != 0

        forbidden = dict(VALID)
        forbidden["validation_plan"] = ["Modify workflow permissions before validating demand."]
        forbidden_json = tmp / "forbidden.json"
        forbidden_json.write_text(json.dumps(forbidden), encoding="utf-8")
        assert run("validate", forbidden_json).returncode != 0

    print("new-product proposal contract tests passed")


if __name__ == "__main__":
    main()
