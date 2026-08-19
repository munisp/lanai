import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = readFileSync(
  resolve(process.cwd(), "../config/k8s/smoke-test.yaml"),
  "utf8",
);

describe("staging smoke manifest", () => {
  it("uses Keycloak management health and does not require hidden database health output", () => {
    expect(manifest).toContain('KEYCLOAK_MANAGEMENT_URL, value: "http://keycloak:9000"');
    expect(manifest).toContain('"$KEYCLOAK_MANAGEMENT_URL/health/ready"');
    expect(manifest).not.toContain('check_contains "Portal DB connected"');
  });

  it("exercises protected calls through the APISIX host route and accepts HTTP 401 assertions", () => {
    expect(manifest).toContain('APISIX_PORTAL_HOST, value: "api.$(LANAI_DOMAIN)"');
    expect(manifest).toContain('-H "Host: $APISIX_PORTAL_HOST"');
    expect(manifest).toContain('"$APISIX_URL/api/trpc/members.list"');
    expect(manifest).toContain('curl -sS -o /tmp/body -w "%{http_code}"');
    expect(manifest).not.toContain('check "APISIX rejects no-JWT"');
  });
});
