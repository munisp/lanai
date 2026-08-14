import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startLocalProviderMocks, type LocalProviderMocks } from "./test/localProviderMocks";

describe("AI gateway deterministic local fixture", () => {
  let providers: LocalProviderMocks;

  beforeAll(async () => {
    providers = await startLocalProviderMocks();
  });

  afterAll(async () => {
    await providers.close();
  });

  it.each([
    ["/proposals/generate-proposal", "title", "Local Provider Proposal"],
    ["/briefing/morning-briefing", "summary", "Local provider morning briefing"],
    ["/whatsapp/draft-reply", "draft", "Local provider reply"],
  ])("returns deterministic AI protocol output for %s", async (path, field, expected) => {
    const response = await fetch(`${providers.crmBaseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: "Bearer ai_local_provider_token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ fixture: true }),
    });

    expect(response.ok).toBe(true);
    const payload = await response.json() as Record<string, unknown>;
    expect(payload[field]).toBe(expected);
    expect(payload.provider).toBe("local-fixture");
  });
});
