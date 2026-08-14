#!/usr/bin/env python3
"""Fail-fast structural checks for assurance-critical deployment controls."""
from __future__ import annotations

from pathlib import Path
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]
checks: list[tuple[str, bool]] = []


def text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


ci = text(".github/workflows/ci.yml")
checks.extend([
    ("CI pins pnpm 10.26.0", "version: 10.26.0" in ci),
    ("CI uses root workspace lockfile", "cache-dependency-path: pnpm-lock.yaml" in ci),
    ("CI starts isolated Permify stack", "docker-compose.permify-test.yml up --detach --wait" in ci),
    ("CI supplies live Permify endpoint", "PERMIFY_GRPC_ADDRESS: 127.0.0.1:34788" in ci),
])

nightly = text(".github/workflows/nightly-security.yml")
checks.extend([
    ("nightly audit pins pnpm 10.26.0", "version: 10.26.0" in nightly),
    ("nightly audit uses root workspace lockfile", "cache-dependency-path: pnpm-lock.yaml" in nightly),
    ("nightly Python safety fails closed", "safety check -r requirements.txt --output text || true" not in nightly),
])

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
