import http from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStripeClient } from "./stripeRouter";

type CapturedRequest = {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
};

const originalStripeKey = process.env.STRIPE_SECRET_KEY;
const originalStripeApiBaseUrl = process.env.STRIPE_API_BASE_URL;
const originalNodeEnv = process.env.NODE_ENV;

let requests: CapturedRequest[] = [];
let server: http.Server;
let baseUrl: string;

async function closeServer(instance: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    instance.close((error) => (error ? reject(error) : resolve()));
  });
}

beforeEach(async () => {
  requests = [];
  server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    requests.push({
      method: req.method ?? "",
      path: req.url ?? "",
      headers: req.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    });

    if (req.url === "/v1/customers") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "cus_contract", object: "customer" }));
      return;
    }
    if (req.url === "/v1/checkout/sessions") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "cs_contract",
          object: "checkout.session",
          url: "https://checkout.example.test/session/cs_contract",
        }),
      );
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "unexpected Stripe route" } }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Stripe contract fixture did not receive a TCP address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.STRIPE_SECRET_KEY = "sk_test_provider_contract";
  process.env.STRIPE_API_BASE_URL = baseUrl;
});

afterEach(async () => {
  await closeServer(server);
  if (originalStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalStripeKey;
  if (originalStripeApiBaseUrl === undefined)
    delete process.env.STRIPE_API_BASE_URL;
  else process.env.STRIPE_API_BASE_URL = originalStripeApiBaseUrl;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

describe("Stripe provider contract", () => {
  it("routes customer creation to the configured test endpoint with bearer authentication", async () => {
    const customer = await createStripeClient().customers.create({
      email: "provider-contract@lanai.test",
      metadata: { memberId: "10" },
    });

    expect(customer.id).toBe("cus_contract");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/customers",
    });
    expect(requests[0].headers.authorization).toBe(
      "Bearer sk_test_provider_contract",
    );
    expect(requests[0].body).toContain("email=provider-contract%40lanai.test");
    expect(requests[0].body).toContain("metadata[memberId]=10");
  });

  it("serializes Checkout session contract fields to the configured endpoint", async () => {
    const session = await createStripeClient().checkout.sessions.create({
      customer: "cus_contract",
      mode: "subscription",
      line_items: [{ price: "price_contract", quantity: 1 }],
      success_url: "https://lanai.test/client/dashboard?payment=success",
      cancel_url: "https://lanai.test/client/dashboard?payment=cancelled",
      subscription_data: { metadata: { memberId: "10", tier: "platinum" } },
    });

    expect(session.url).toBe(
      "https://checkout.example.test/session/cs_contract",
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/checkout/sessions",
    });
    expect(requests[0].body).toContain("mode=subscription");
    expect(requests[0].body).toContain("line_items[0][price]=price_contract");
    expect(requests[0].body).toContain(
      "subscription_data[metadata][memberId]=10",
    );
  });

  it("rejects a configured endpoint that includes a path", () => {
    process.env.STRIPE_API_BASE_URL = `${baseUrl}/v1`;
    expect(() => createStripeClient()).toThrow(
      "STRIPE_API_BASE_URL must not include a path",
    );
  });

  it("rejects the test endpoint override in production", () => {
    process.env.NODE_ENV = "production";
    expect(() => createStripeClient()).toThrow(
      "STRIPE_API_BASE_URL is only permitted outside production",
    );
  });
});
