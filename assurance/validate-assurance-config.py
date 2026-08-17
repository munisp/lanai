#!/usr/bin/env python3
"""Fail-fast structural checks for assurance-critical deployment controls."""
from __future__ import annotations

from pathlib import Path
import json
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]
checks: list[tuple[str, bool]] = []


def text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def package(path: str) -> dict:
    return json.loads(text(path))


ci = text(".github/workflows/ci.yml")
checks.extend([
    ("CI pins trusted pnpm 11.20.0", "version: 11.20.0" in ci),
    ("CI pins supported Node 22.14.0", "node-version: 22.14.0" in ci),
    ("CI uses root workspace lockfile", "cache-dependency-path: pnpm-lock.yaml" in ci),
    ("CI starts isolated Permify stack", "docker-compose.permify-test.yml up --detach --wait" in ci),
    ("CI supplies live Permify endpoint", "PERMIFY_GRPC_ADDRESS: 127.0.0.1:34788" in ci),
    ("CI enables deterministic local provider fixtures", "RUN_LOCAL_PROVIDER_TESTS: \"1\"" in ci),
    ("CI builds from workspace-root Docker context", "docker build -f lanai-portal/Dockerfile" in ci),
])

nightly = text(".github/workflows/nightly-security.yml")
checks.extend([
    ("nightly audit pins trusted pnpm 11.20.0", "version: 11.20.0" in nightly),
    ("nightly audit pins supported Node 22.14.0", "node-version: 22.14.0" in nightly),
    ("nightly audit uses root workspace lockfile", "cache-dependency-path: pnpm-lock.yaml" in nightly),
    ("nightly uses pnpm 11-compatible root production audit", "run: pnpm audit --prod --audit-level=high" in nightly),
    ("nightly image scan uses workspace-root Docker context", "docker build -f lanai-portal/Dockerfile" in nightly),
    ("nightly Python safety fails closed", "safety check -r requirements.txt --output text || true" not in nightly),
])

external_workflow = text(".github/workflows/external-provider-tests.yml")
checks.extend([
    ("external provider workflow is environment protected", "name: external-integration" in external_workflow),
    ("external provider workflow is opt-in", "EXTERNAL_INTEGRATION_ENABLED" in external_workflow),
    ("external provider workflow does not run on pull requests", "pull_request:" not in external_workflow),
    ("external provider workflow uses sandbox secret mapping", "STRIPE_TEST_SECRET_KEY" in external_workflow),
    ("external provider workflow runs the guarded launcher", "test:external" in external_workflow),
])

workspace = text("pnpm-workspace.yaml")
checks.extend([
    ("workspace enforces seven-day dependency maturity", "minimumReleaseAge: 10080" in workspace),
    ("workspace blocks exotic transitive dependencies", "blockExoticSubdeps: true" in workspace),
    ("workspace rejects trust downgrades", "trustPolicy: no-downgrade" in workspace),
    ("workspace uses explicit pnpm 11 build allowlist", "allowBuilds:" in workspace),
    ("workspace denies Fluvio package-level builds", '"@fluvio/client": false' in workspace),
])

root_package = package("package.json")
portal_package = package("lanai-portal/package.json")
checks.extend([
    ("root package-manager pin is pnpm 11.20.0", root_package.get("packageManager") == "pnpm@11.20.0"),
    ("portal package-manager pin is pnpm 11.20.0", portal_package.get("packageManager") == "pnpm@11.20.0"),
    ("portal development pnpm pin is exact 11.20.0", portal_package.get("devDependencies", {}).get("pnpm") == "11.20.0"),
    ("portal Resend pin preserves trusted publisher version", portal_package.get("dependencies", {}).get("resend") == "6.18.0"),
])

portal_dockerfile = text("lanai-portal/Dockerfile")
checks.extend([
    ("production Dockerfile installs pnpm 11.20.0", "ARG PNPM_VERSION=11.20.0" in portal_dockerfile),
    ("production Dockerfile copies root workspace lock controls", "COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./" in portal_dockerfile),
    ("production Dockerfile installs frozen lockfile", "pnpm install --frozen-lockfile" in portal_dockerfile),
])

external_launcher = text("lanai-portal/scripts/test-external.sh")
checks.extend([
    ("external launcher rejects live Stripe keys", '"$STRIPE_SECRET_KEY" == sk_live_*' in external_launcher),
    ("external launcher requires Stripe sandbox keys", '"$STRIPE_SECRET_KEY" != sk_test_*' in external_launcher),
])

ignore = text(".gitignore")
checks.append(("GitHub Actions workflows are not ignored", ".github/workflows/" not in ignore))

for manifest in ("config/k8s/app-tier.yaml", "config/k8s/jobs.yaml"):
    body = text(manifest)
    checks.append((f"{manifest} does not force plaintext Permify", 'PERMIFY_INSECURE, value: "true"' not in body))
    list(yaml.safe_load_all(body))

smoke = text("config/k8s/smoke-test.yaml")
checks.extend([
    ("smoke test has no placeholder client secret", "placeholder-replace-with-secret" not in smoke),
    ("smoke test injects a dedicated secret", "KEYCLOAK_SMOKE_CLIENT_SECRET" in smoke),
    ("smoke test fails on protected-call denial", "protected call denied" in smoke),
])
list(yaml.safe_load_all(smoke))

for label, passed in checks:
    print(f"{'PASS' if passed else 'FAIL'}: {label}")

failed = [label for label, passed in checks if not passed]
if failed:
    print("\nFailed assurance configuration checks:", ", ".join(failed), file=sys.stderr)
    raise SystemExit(1)

print(f"\n{len(checks)} assurance configuration checks passed.")
