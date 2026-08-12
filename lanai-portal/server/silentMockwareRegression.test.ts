import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname);
const source = (name: string) => readFileSync(resolve(root, name), "utf8");

describe("silent mockware regression guards", () => {
  it("member document vault reads persisted, visible member documents instead of a fabricated empty list", () => {
    const routers = source("routers.ts");
    expect(routers).toContain(".from(documents)");
    expect(routers).toContain("eq(documents.memberId, ctx.member.id)");
    expect(routers).toContain("eq(documents.isVisibleToMember, true)");
    expect(routers).not.toContain("documents: [] as");
  });

  it("Chatwoot configuration and sync paths do not swallow failures or report a local row count as a remote sync", () => {
    const router = source("chatwootRouter.ts");
    const service = source("chatwootService.ts");

    expect(router).not.toContain("initializeChatwootConfig().catch(() => {})");
    expect(router).toContain("await syncChatwootConversations()");
    expect(router).toContain("const synced = await syncChatwootConversations()");
    expect(service).not.toContain("}).catch(() => {})");
    expect(service).toContain("Chatwoot configuration was not persisted");
  });

  it("Chatwoot configuration responses redact stored access tokens", () => {
    const router = source("chatwootRouter.ts");
    expect(router).toContain("function toPublicChatwootConfig");
    expect(router).toContain("hasAccessToken: Boolean(config.accessToken)");
    expect(router).toContain("return toPublicChatwootConfig(await getChatwootConfigService())");
    expect(router).not.toContain("return getChatwootConfigService();");
  });

  it("Chatwoot AI drafting invokes the configured AI gateway rather than returning canned copy", () => {
    const router = source("chatwootRouter.ts");
    expect(router).toContain('import { invokeLocalAi } from "./_core/localAi"');
    expect(router).toContain("const result = await invokeLocalAi({");
    expect(router).toContain('generated: true');
    expect(router).not.toContain("I have reviewed your message and will ensure this is handled");
  });

  it("Chatwoot mirrors require remote identifiers and persisted local identifiers", () => {
    const db = source("db.ts");
    const service = source("chatwootService.ts");
    const router = source("chatwootRouter.ts");

    expect(db).not.toContain("return result[0]?.id ?? 0");
    expect(service).toContain("did not return conversation and message identifiers");
    expect(service).toContain("did not return a message identifier");
    expect(router).toContain("Chatwoot local conversation mirror was not updated");
  });

  it("Stripe cannot silently present an outage as an inactive subscription or acknowledge an unapplied webhook", () => {
    const stripe = source("stripeRouter.ts");

    expect(stripe).toContain(
      "STRIPE_PRICE_ID_${tier.toUpperCase()} must be configured in production",
    );
    expect(stripe).toContain("await handleStripeEvent(event)");
    expect(stripe).not.toContain("void handleStripeEvent(event)");
    expect(stripe).toContain("if (!member?.stripeSubscriptionId) {");
    expect(stripe).toContain("return { active: false, subscription: null };");
    expect(stripe).toContain("} catch (error) {");
    expect(stripe).toContain("Stripe subscription lookup failed:");
  });

  it("the Settings UI does not label static localhost assumptions as live service health", () => {
    const settings = readFileSync(
      resolve(root, "../client/src/pages/SettingsPage.tsx"),
      "utf8",
    );
    expect(settings).toContain("Live status is shown only after a service returns a verified response.");
    expect(settings).not.toContain('status:"online"');
    expect(settings).not.toContain("http://localhost:5555");
  });
});
