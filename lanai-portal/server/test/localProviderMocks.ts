import http, { type Server } from "node:http";

export type ProviderName = "stripe" | "crm" | "ai";

export type LocalProviderFailure = {
  provider: ProviderName;
  /** Exact path (for example `/v1/customers`), or omitted for any provider request. */
  path?: string;
  count: number;
  status: 429 | 500 | 503;
  retryAfterSeconds?: number;
};

export type LocalProviderMocks = {
  stripeBaseUrl: string;
  crmBaseUrl: string;
  aiGatewayBaseUrl: string;
  /** Fail the next matching calls, then resume normal deterministic responses. */
  failNext: (failure: LocalProviderFailure) => void;
  /** Captured provider requests, with secrets redacted. */
  requests: Array<{ provider: ProviderName; method: string; path: string; idempotencyKey?: string }>;
  close: () => Promise<void>;
};

type FixtureOptions = {
  failures?: LocalProviderFailure[];
};

type PendingFailure = LocalProviderFailure;

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response: http.ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(payload));
}

function authorize(request: http.IncomingMessage, provider: ProviderName): boolean {
  const authorization = request.headers.authorization ?? "";
  if (provider === "stripe") return /^Bearer sk_(test|live)_/.test(authorization);
  if (provider === "crm") return /^Bearer crm_/.test(authorization);
  return authorization === "Bearer ai_local_provider_token";
}

function stripeSubscription(id = "sub_local_provider"): object {
  return {
    id,
    object: "subscription",
    status: "active",
    currency: "usd",
    current_period_end: 1_900_000_000,
    cancel_at_period_end: false,
    items: { data: [{ price: { recurring: { interval: "month" }, unit_amount: 1_000, currency: "usd" } }] },
  };
}

function stripeResponse(pathname: string, method: string, body: string): unknown {
  const params = new URLSearchParams(body);
  if (method === "POST" && pathname === "/v1/customers") {
    return { id: "cus_local_provider", object: "customer", email: params.get("email") };
  }
  if (method === "POST" && pathname === "/v1/payment_methods/pm_card_visa/attach") {
    return { id: "pm_card_visa", object: "payment_method", type: "card", card: { brand: "visa", last4: "4242" } };
  }
  if (method === "POST" && pathname === "/v1/subscriptions") return stripeSubscription();
  if (method === "GET" && pathname.startsWith("/v1/subscriptions/")) return stripeSubscription(pathname.split("/").at(-1));
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

export async function startLocalProviderMocks(options: FixtureOptions = {}): Promise<LocalProviderMocks> {
  const failures: PendingFailure[] = [...(options.failures ?? [])];
  const idempotentResponses = new Map<string, unknown>();
  const requests: LocalProviderMocks["requests"] = [];

  const takeFailure = (provider: ProviderName, path: string): LocalProviderFailure | undefined => {
    const failure = failures.find((candidate) => candidate.provider === provider && candidate.count > 0 && (!candidate.path || candidate.path === path));
    if (!failure) return undefined;
    failure.count -= 1;
    return failure;
  };

  const server: Server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const method = request.method ?? "GET";
      const body = await readBody(request);
      const provider: ProviderName = url.pathname.startsWith("/v1/") ? "stripe" : url.pathname === "/graphql" ? "crm" : "ai";
      const idempotencyKey = typeof request.headers["idempotency-key"] === "string" ? request.headers["idempotency-key"] : undefined;
      requests.push({ provider, method, path: url.pathname, idempotencyKey });

      if (!authorize(request, provider)) {
        sendJson(response, 401, { error: { type: "authentication_error", message: `${provider} fixture requires a valid bearer token` } });
        return;
      }

      const injectedFailure = takeFailure(provider, url.pathname);
      if (injectedFailure) {
        const headers: Record<string, string> = injectedFailure.status === 429
          ? { "retry-after": String(injectedFailure.retryAfterSeconds ?? 1) }
          : {};
        sendJson(response, injectedFailure.status, { error: { type: injectedFailure.status === 429 ? "rate_limit_error" : "api_error", message: "Injected transient fixture failure" } }, headers);
        return;
      }

      if (provider === "crm") {
        let graphQl: { query?: unknown };
        try {
          graphQl = JSON.parse(body) as { query?: unknown };
        } catch {
          sendJson(response, 400, { errors: [{ message: "Malformed GraphQL JSON" }] });
          return;
        }
        if (typeof graphQl.query !== "string" || graphQl.query.trim() === "") {
          sendJson(response, 400, { errors: [{ message: "GraphQL query is required" }] });
          return;
        }
        const payload = graphQl.query.includes("__schema")
          ? { data: { __schema: { queryType: { name: "Query" } } } }
          : { data: { __typename: "Query", healthCheck: true } };
        sendJson(response, 200, payload);
        return;
      }

      if (provider === "ai") {
        if (url.pathname === "/proposals/generate-proposal") {
          sendJson(response, 200, { title: "Local Provider Proposal", sections: [], provider: "local-fixture" });
          return;
        }
        if (url.pathname === "/briefing/morning-briefing") {
          sendJson(response, 200, { summary: "Local provider morning briefing", provider: "local-fixture" });
          return;
        }
        if (url.pathname === "/whatsapp/draft-reply") {
          sendJson(response, 200, { draft: "Local provider reply", provider: "local-fixture" });
          return;
        }
        sendJson(response, 404, { error: { message: "Unsupported local AI fixture path" } });
        return;
      }

      const idempotencyMapKey = idempotencyKey && method === "POST" ? `${method}:${url.pathname}:${idempotencyKey}` : undefined;
      if (idempotencyMapKey && idempotentResponses.has(idempotencyMapKey)) {
        sendJson(response, 200, idempotentResponses.get(idempotencyMapKey), { "idempotent-replayed": "true" });
        return;
      }

      const payload = stripeResponse(url.pathname, method, body);
      const status = "error" in (payload as Record<string, unknown>) ? 400 : 200;
      if (status === 200 && idempotencyMapKey) idempotentResponses.set(idempotencyMapKey, payload);
      sendJson(response, status, payload);
    } catch (error) {
      sendJson(response, 500, { error: { message: String(error) } });
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
    aiGatewayBaseUrl: baseUrl,
    failNext: (failure) => failures.push({ ...failure }),
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
