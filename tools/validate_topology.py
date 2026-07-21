#!/usr/bin/env python3
"""Static checks for Compose service dependencies and Caddy upstream targets."""
from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text())
services = set((compose.get("services") or {}).keys())
errors: list[str] = []

for service_name, definition in (compose.get("services") or {}).items():
    depends_on = definition.get("depends_on") or {}
    declared = depends_on.keys() if isinstance(depends_on, dict) else depends_on
    for dependency in declared:
        if dependency not in services:
            errors.append(f"{service_name} depends on undeclared service {dependency}")

caddy = (ROOT / "config/caddy/Caddyfile").read_text()
for upstream in sorted(set(re.findall(r"reverse_proxy\s+([A-Za-z0-9_-]+):\d+", caddy))):
    if upstream not in services:
        errors.append(f"Caddy references undeclared upstream service {upstream}")

for path in [
    ROOT / "config/apisix/routes/lanai-routes.yaml",
    ROOT / "config/dapr/components/redis.yaml",
    ROOT / "config/openappsec/policy.yaml",
]:
    list(yaml.safe_load_all(path.read_text()))

if errors:
    print("TOPOLOGY VALIDATION FAILED")
    print("\n".join(f"- {error}" for error in errors))
    sys.exit(1)
print(f"TOPOLOGY VALIDATION PASSED: {len(services)} declared services, all dependencies and Caddy upstreams resolve.")
