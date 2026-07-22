import { describe, expect, it } from "vitest";
import {
  CRM_FIELD_OWNERSHIP,
  initialPersonProjection,
  memberProjection,
  proposalProjection,
} from "./_core/crmProjection";
import { TwentyCrmClient, TwentyCrmError } from "./_core/twentyClient";
import { verifyTwentyWebhookSignature } from "./_core/twentyWebhook";
import { createHmac } from "node:crypto";

describe("Twenty CRM provider contract", () => {
  it("sends typed record operations with bearer authentication and idempotency headers", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const client = new TwentyCrmClient({
      baseUrl: "https://twenty.contract.test",
      apiToken: "twenty_contract_token",
      coreApiBasePath: "/rest",
      metadataBasePath: "/metadata",
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            data: {
              id: "person_contract",
              updatedAt: "2026-07-22T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });

    const record = await client.createRecord(
      "people",
      { name: "Contract Member", lanaiMemberId: "17" },
      "crm:contract:person:17",
    );

    expect(record.id).toBe("person_contract");
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://twenty.contract.test/rest/people");
    expect(requests[0].init?.method).toBe("POST");
    const headers = new Headers(requests[0].init?.headers);
    expect(headers.get("authorization")).toBe("Bearer twenty_contract_token");
    expect(headers.get("idempotency-key")).toBe("crm:contract:person:17");
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      name: "Contract Member",
      lanaiMemberId: "17",
    });
  });

  it("raises a bounded typed error when the CRM rejects an operation", async () => {
    const client = new TwentyCrmClient({
      baseUrl: "https://twenty.contract.test",
      apiToken: "twenty_contract_token",
      fetchImpl: (async () =>
        new Response("forbidden", { status: 403 })) as typeof fetch,
    });
    await expect(
      client.getRecord("people", "forbidden"),
    ).rejects.toMatchObject<TwentyCrmError>({
      name: "TwentyCrmError",
      status: 403,
    });
  });

  it("projects CRM-safe member and proposal fields without sensitive concierge or margin data", () => {
    const initial = initialPersonProjection({
      memberId: 17,
      name: "Contract Member",
      email: "contract@lanai.test",
      phone: "+44 20 0000 0000",
      tier: "platinum",
      active: true,
      assignedAdvisorId: 3,
    });
    const update = memberProjection({
      memberId: 17,
      tier: "platinum",
      active: true,
      assignedAdvisorId: 3,
      travelStyle: "wellness",
      favouriteDestinations: ["Kyoto", "Reykjavik"],
    });
    const proposal = proposalProjection({
      proposalId: 44,
      title: "Japan journey",
      status: "sent",
      totalPrice: "12500.00",
      currency: "GBP",
    });

    expect(initial).toMatchObject({
      lanaiMemberId: "17",
      lanaiMembershipTier: "platinum",
    });
    expect(update).not.toHaveProperty("name");
    expect(update).not.toHaveProperty("passportNumber");
    expect(proposal).not.toHaveProperty("margin");
    expect(proposal).not.toHaveProperty("commission");
    expect(CRM_FIELD_OWNERSHIP.person.passportNumber).toBeUndefined();
    expect(CRM_FIELD_OWNERSHIP.proposal.margin).toBeUndefined();
  });

  it("verifies raw Twenty webhook bytes with a timing-safe HMAC contract", () => {
    const secret = "twenty_webhook_test_secret";
    const body = Buffer.from(
      '{"id":"evt_contract","type":"person.updated"}',
      "utf8",
    );
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    expect(
      verifyTwentyWebhookSignature(body, `sha256=${signature}`, secret),
    ).toBe(true);
    expect(verifyTwentyWebhookSignature(body, "sha256=invalid", secret)).toBe(
      false,
    );
    expect(verifyTwentyWebhookSignature(body, undefined, secret)).toBe(false);
  });
});
