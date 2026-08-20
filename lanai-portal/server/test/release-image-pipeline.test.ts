import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("immutable financial evidence release controls", () => {
  it("builds, scans, attests, and keylessly signs each deployable evidence image", () => {
    const workflow = read(".github/workflows/release-images.yml");
    expect(workflow).toContain('tags:\n      - "v*"');
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("attestations: write");
    expect(workflow).toContain("lanai_ai/gateway/Dockerfile");
    expect(workflow).toContain("realm-render.Dockerfile");
    expect(workflow).toContain("lanai_ai/pillars/whatsapp/Dockerfile");
    expect(workflow).toContain("Dockerfile.financial-workflow-runner");
    expect(workflow).toContain("Dockerfile.loadtest");
    expect(workflow).toContain("actions/attest-build-provenance@v2");
    expect(workflow).toContain("cosign sign --yes");
    expect(workflow).toContain("severity: HIGH,CRITICAL");
  });

  it("requires the dedicated workflow runner digest and verifies its trusted signature before launch", () => {
    const liveRunner = read("config/k8s/loadtest/live-financial-workflow-runner.yaml");
    const dailyAudit = read("config/k8s/loadtest/daily-financial-audit.yaml");
    const stagingGate = read("lanai-portal/scripts/run-staging-release-gates.sh");
    const soakGate = read("lanai-portal/scripts/preflight-ledger-soak.sh");

    expect(liveRunner).toContain("lanai-financial-workflow-runner:REPLACE_WITH_SIGNED_DIGEST");
    expect(dailyAudit).toContain("lanai-financial-workflow-runner:REPLACE_WITH_SIGNED_DIGEST");
    expect(stagingGate).toContain("cosign verify");
    expect(soakGate).toContain("cosign verify");
    expect(stagingGate).toContain("release-images");
    expect(soakGate).toContain("release-images");
    expect(stagingGate).toContain("certificate-identity-regexp");
    expect(soakGate).toContain("certificate-identity-regexp");
    expect(read("lanai-portal/scripts/render-signed-kustomize.sh")).toContain("cosign verify");
    expect(read("lanai-portal/scripts/render-signed-kustomize.sh")).toContain("Rendered manifest contains a mutable or unpinned image reference");
  });
});
