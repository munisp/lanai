#!/usr/bin/env python3
"""Validate Lanai provider-test automation wiring without requiring Docker or secrets."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
PORTAL = ROOT / "lanai-portal"


def load_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"{path} must contain a top-level mapping")
    return payload


def workflow_trigger(workflow: dict) -> dict:
    return workflow.get("on") or workflow.get(True) or {}


def main() -> int:
    errors: list[str] = []

    compose = load_yaml(ROOT / "docker-compose.test.yml")
    services = compose.get("services", {})
    for name in ("postgres", "permify", "stripe-mock"):
        if name not in services:
            errors.append(f"test Compose topology is missing service: {name}")

    package = json.loads((PORTAL / "package.json").read_text(encoding="utf-8"))
    scripts = package.get("scripts", {})
    for name in ("test", "test:provider-contract", "test:integration", "test:external", "test:all"):
        if name not in scripts:
            errors.append(f"package.json is missing script: {name}")
    if "server/*.external.test.ts" not in scripts.get("test", ""):
        errors.append("default test command must exclude protected external suites")
    if "scripts/test-external.sh" not in scripts.get("test:external", ""):
        errors.append("test:external must invoke the protected external runner")

    for path in (PORTAL / "scripts/test-external.sh", PORTAL / "scripts/test-integration.sh"):
        if not path.exists():
            errors.append(f"missing test runner: {path.relative_to(ROOT)}")

    internal = load_yaml(ROOT / ".github/workflows/internal-tests.yml")
    external = load_yaml(ROOT / ".github/workflows/external-provider-tests.yml")
    internal_triggers = workflow_trigger(internal)
    external_triggers = workflow_trigger(external)
    if "pull_request" not in internal_triggers:
        errors.append("internal workflow must run on pull requests")
    if "pull_request" in external_triggers or "pull_request_target" in external_triggers:
        errors.append("external workflow must not expose provider secrets to pull request triggers")

    external_jobs = external.get("jobs", {})
    job = external_jobs.get("external-provider-tests", {})
    if job.get("environment") != "external-integration":
        errors.append("external job must use the external-integration protected environment")
    if "vars.EXTERNAL_INTEGRATION_ENABLED" not in str(job.get("if", "")):
        errors.append("external job must require EXTERNAL_INTEGRATION_ENABLED")

    workflow_text = (ROOT / ".github/workflows/external-provider-tests.yml").read_text(encoding="utf-8")
    expected_secrets = {
        "TWENTY_TEST_CRM_URL",
        "TWENTY_TEST_CRM_API_TOKEN",
        "STRIPE_TEST_SECRET_KEY",
        "STRIPE_TEST_WEBHOOK_SECRET",
    }
    found_secrets = set(re.findall(r"secrets\.([A-Z0-9_]+)", workflow_text))
    unexpected = found_secrets - expected_secrets
    if unexpected:
        errors.append(f"external workflow references unexpected secrets: {', '.join(sorted(unexpected))}")

    if errors:
        print("TEST AUTOMATION VALIDATION FAILED:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("TEST AUTOMATION VALIDATION PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
