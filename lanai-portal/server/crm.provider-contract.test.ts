import http from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/authMiddleware", () => ({
  requireAdvisorAuth: (_req: unknown, _res: unknown, next: () => void) =>
    next(),
}));

import { registerCrmProxy } from "./_core/crmProxy";

type CapturedRequest = {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
};

const originalCrmUrl = process.env.TWENTY_CRM_URL;
const originalCrmToken = process.env.TWENTY_CRM_API_TOKEN;

let upstream: http.Server;
let portal: http.Server;
let upstreamUrl: string;
let portalUrl: string;
let requests: CapturedRequest[] = [];

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not receive a TCP address");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: http.Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

beforeEach(async () => {
  requests = [];
  upstream = http.createServer(async (req, res) => {
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
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: { __typename: "Query" } }));
  });
  upstreamUrl = await listen(upstream);

  process.env.TWENTY_CRM_URL = upstreamUrl;
  process.env.TWENTY_CRM_API_TOKEN = "crm_provider_contract_token";
  const app = express();
  app.use(express.json());
  registerCrmProxy(app);
  portal = http.createServer(app);
  portalUrl = await listen(portal);
});

afterEach(async () => {
  await Promise.all([close(portal), close(upstream)]);
  if (originalCrmUrl === undefined) delete process.env.TWENTY_CRM_URL;
  else process.env.TWENTY_CRM_URL = originalCrmUrl;
  if (originalCrmToken === undefined) delete process.env.TWENTY_CRM_API_TOKEN;
  else process.env.TWENTY_CRM_API_TOKEN = originalCrmToken;
});

describe("Twenty CRM provider contract", () => {
  it("forwards the target path, JSON body, and server-side bearer token", async () => {
    const response = await fetch(
      `${portalUrl}/crm/graphql?operationName=Contract`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ query: "{ __typename }" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { __typename: "Query" },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/graphql?operationName=Contract",
    });
    expect(requests[0].headers.authorization).toBe(
      "Bearer crm_provider_contract_token",
    );
    expect(requests[0].headers["content-type"]).toBe("application/json");
    expect(JSON.parse(requests[0].body)).toEqual({ query: "{ __typename }" });
  });

  it("returns an explicit unavailable response when no CRM token is configured", async () => {
    await Promise.all([close(portal), close(upstream)]);
    delete process.env.TWENTY_CRM_API_TOKEN;

    const app = express();
    registerCrmProxy(app);
    portal = http.createServer(app);
    portalUrl = await listen(portal);
    upstream = http.createServer();

    const response = await fetch(`${portalUrl}/crm/graphql`);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "CRM not configured",
    });
  });
});
