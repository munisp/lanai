import http, { type Server } from "node:http";

export type LocalProviderMocks = {
  stripeBaseUrl: string;
  crmBaseUrl: string;
  close: () => Promise<void>;
};

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function stripeResponse(pathname: string, method: string, body: string): unknown {
  const params = new URLSearchParams(body);
  if (method === "POST" && pathname === "/v1/customers") {
    return { id: "cus_local_provider", object: "customer", email: params.get("email") };
  }
  if (method === "POST" && pathname === "/v1/payment_methods/pm_card_visa/attach") {
    return { id: "pm_card_visa", object: "payment_method", type: "card", card: { brand: "visa", last4: "4242" } };
  }
  if (method === "POST" && pathname === "/v1/subscriptions") {
    return {
      id: "sub_local_provider",
      object: "subscription",
      status: "active",
      currency: "usd",
      current_period_end: 1_900_000_000,
      cancel_at_period_end: false,
      items: { data: [{ price: { recurring: { interval: "month" } } }] },
    };
  }
  if (method === "GET" && pathname.startsWith("/v1/subscriptions/")) {
    return {
      id: pathname.split("/").at(-1),
      object: "subscription",
      status: "active",
      currency: "usd",
      current_period_end: 1_900_000_000,
      cancel_at_period_end: false,
      items: { data: [{ price: { recurring: { interval: "month" } } }] },
    };
  }
  if (method === "GET" && pathname === "/v1/payment_methods") {
    return { object: "list", data: [{ id: "pm_card_visa", type: "card", card: { brand: "visa", last4: "4242" } }] };
  }
  if (method === "POST" && pathname === "/v1/checkout/sessions") {
    return { id: "cs_local_provider", object: "checkout.session", url: "https://checkout.local.test/cs_local_provider" };
  }
  if (method === "POST" && pathname === "/v1/billing_portal/sessions") {
    return { id: "bps_local_provider", object: "billing_portal.session", url: "https://billing.local.test/bps_local_provider" };
  }
  if (method === "DELETE" && (pathname.startsWith("/v1/customers/") || pathname.startsWith("/v1/subscriptions/"))) {
    return { id: pathname.split("/").at(-1), object: "deleted", deleted: true };
  }
  if (method === "POST" && pathname.startsWith("/v1/customers/")) {
    return { id: pathname.split("/").at(-1), object: "customer" };
  }
  return { error: { type: "invalid_request_error", message: `Unsupported local Stripe fixture request: ${method} ${pathname}` } };
}

export async function startLocalProviderMocks(): Promise<LocalProviderMocks> {
  const server: Server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const body = await readBody(request);
      if (url.pathname === "/graphql") {
        response.writeHead(200, { "content-type": "application/json" });
        const payload = body.includes("__schema")
          ? { data: { __schema: { queryType: { name: "Query" } } } }
          : { data: { __typename: "Query", healthCheck: true } };
        response.end(JSON.stringify(payload));
        return;
      }
      if (url.pathname === "/proposals/generate-proposal") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ title: "Local Provider Proposal", sections: [], provider: "local-fixture" }));
        return;
      }
      if (url.pathname === "/briefing/morning-briefing") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ summary: "Local provider morning briefing", provider: "local-fixture" }));
        return;
      }
      if (url.pathname === "/whatsapp/draft-reply") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ draft: "Local provider reply", provider: "local-fixture" }));
        return;
      }
      if (url.pathname.startsWith("/v1/")) {
        const payload = stripeResponse(url.pathname, request.method ?? "GET", body);
        const status = "error" in (payload as Record<string, unknown>) ? 400 : 200;
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(payload));
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "not found" } }));
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: String(error) } }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local provider fixture did not expose a TCP port");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    stripeBaseUrl: baseUrl,
    crmBaseUrl: baseUrl,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
