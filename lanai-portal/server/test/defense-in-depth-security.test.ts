import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("defence-in-depth release controls", () => {
  it("requires TOTP enrollment and records privileged MFA lifecycle events", () => {
    const realm = read("config/keycloak/lanai-realm.json");
    const parsed = JSON.parse(realm) as {
      otpPolicyAlgorithm: string;
      requiredActions: Array<{ alias: string; defaultAction: boolean; enabled: boolean }>;
      enabledEventTypes: string[];
    };
    expect(parsed.otpPolicyAlgorithm).toBe("HmacSHA256");
    expect(parsed.requiredActions).toContainEqual({
      alias: "CONFIGURE_TOTP",
      name: "Configure OTP",
      providerId: "CONFIGURE_TOTP",
      enabled: true,
      defaultAction: true,
      priority: 10,
    });
    expect(parsed.enabledEventTypes).toEqual(expect.arrayContaining(["UPDATE_TOTP", "REMOVE_TOTP"]));
  });

  it("bounds edge request bodies, preserves source-IP integrity, and rate-limits privileged hosts", () => {
    const caddy = read("config/caddy/Caddyfile");
    expect(caddy).toContain("admin off");
    expect(caddy).toContain("trusted_proxies_strict");
    expect(caddy).toContain("max_size 10MB");
    expect(caddy).toContain("zone admin_api");
    expect(caddy).toContain("zone inbox_api");
    expect(caddy).toContain('Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"');
    const caddyDockerfile = read("config/caddy/Dockerfile");
    expect(caddyDockerfile).toContain("Host: health.invalid");
    expect(caddyDockerfile).not.toContain("localhost:2019/health");
  });

  it("keeps the OpenAppSec policy in prevention mode with active high-risk protections", () => {
    const policy = read("config/openappsec/policy.yaml");
    expect(policy).toContain("mode: prevent-learn");
    expect(policy).toContain("max-body-size-kb: 10240");
    expect(policy).toContain("csrf-protection: true");
    expect(policy).toContain("error-disclosure: true");
    expect(policy).toContain("open-redirect: true");
    expect(policy).toContain("request-body: false");
  });

  it("defines an OPA Gatekeeper baseline for immutable images and restricted workload controls", () => {
    const policy = read("config/opa/lanai-workload-security.yaml");
    expect(policy).toContain("kind: ConstraintTemplate");
    expect(policy).toContain("@sha256:");
    expect(policy).toContain("allowPrivilegeEscalation=false");
    expect(policy).toContain("readOnlyRootFilesystem=true");
    expect(policy).toContain("not input.review.object.spec.securityContext.runAsNonRoot == true");
    expect(policy).toContain("automountServiceAccountToken=false");
    expect(policy).toContain("enforcementAction: dryrun");
  });

  it("rejects mutable image references while allowing only fail-closed signed placeholders in source templates", () => {
    const result = execFileSync(
      "bash",
      ["lanai-portal/scripts/audit-kubernetes-images.sh", "template"],
      { cwd: root, encoding: "utf8" },
    );
    expect(result).toContain("audit passed");
  });
});
