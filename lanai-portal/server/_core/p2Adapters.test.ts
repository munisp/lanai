/**
 * P2 zero-coverage elimination suite.
 *
 * Covers six external-adapter modules with a loopback HTTP fixture rather than
 * permissive value-returning mocks. Every fixture request validates the
 * outgoing path, serialization, and security-relevant request headers.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";

const storagePutSpy = vi.fn();

vi.mock("./env", () => ({
  ENV: {
    get forgeApiUrl() { return (globalThis as Record<string, string>).__P2_FORGE_URL ?? ""; },
    get forgeApiKey() { return (globalThis as Record<string, string>).__P2_FORGE_KEY ?? ""; },
    get aiGatewayUrl() { return (globalThis as Record<string, string>).__P2_AI_URL ?? ""; },
    get aiGatewayToken() { return (globalThis as Record<string, string>).__P2_AI_TOKEN ?? ""; },
  },
}));

vi.mock("server/storage", () => ({
  storagePut: (...args: unknown[]) => storagePutSpy(...args),
}));

type CapturedRequest = {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
};

let fixture: http.Server;
let fixtureUrl: string;
let requests: CapturedRequest[] = [];

function respond(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

beforeAll(async () => {
  fixture = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const path = req.url ?? "/";
      requests.push({ method: req.method ?? "GET", path, headers: req.headers, body });

      if (path === "/audio/source.wav") {
        res.writeHead(200, { "content-type": "audio/wav" });
        res.end(Buffer.from("wav-fixture"));
        return;
      }
      if (path === "/audio/unavailable.wav") {
        respond(res, 404, { error: "missing" });
        return;
      }
      if (path === "/v1/audio/transcriptions") {
        respond(res, 200, {
          task: "transcribe", language: "en", duration: 1.2,
          text: "Concierge request", segments: [],
        });
        return;
      }
      if (path === "/v1/storage/presign/put?path=assets%2Fwelcome_banner_12345678.png") {
        // This exact route is intentionally not used because storage keys have a random suffix.
        respond(res, 500, { error: "unexpected deterministic key" });
        return;
      }
      if (path.startsWith("/v1/storage/presign/put")) {
        respond(res, 200, { url: `${fixtureUrl}/object-store/upload` });
        return;
      }
      if (path === "/object-store/upload" && req.method === "PUT") {
        res.writeHead(200);
        res.end();
        return;
      }
      if (path.startsWith("/v1/storage/presign/get")) {
        respond(res, 200, { url: "https://objects.example.test/signed-download" });
        return;
      }
      if (path === "/images.v1.ImageService/GenerateImage") {
        respond(res, 200, { image: { b64Json: Buffer.from("png-fixture").toString("base64"), mimeType: "image/png" } });
        return;
      }
      if (path === "/images.v1.ImageService/ListModels") {
        respond(res, 200, { models: [{ model: "MODEL_GPT_IMAGE_2", id: "gpt-image-2" }] });
        return;
      }
      if (path === "/infer") {
        const input = JSON.parse(body || "{}");
        if (input.prompt === "empty") {
          respond(res, 200, { output: "   " });
          return;
        }
        if (input.prompt === "upstream-error") {
          respond(res, 503, "unavailable");
          return;
        }
        respond(res, 200, { output: input.response_format === "json" ? '{"tier":"vip"}' : "Tailored recommendation" });
        return;
      }
      if (path.startsWith("/v1/maps/proxy/")) {
        if (path.includes("/bad")) {
          respond(res, 429, "quota exhausted");
          return;
        }
        respond(res, 200, { status: "OK", route: path, method: req.method, body: body || null });
        return;
      }
      if (path.includes("webdevtoken.v1.WebDevService/")) {
        const rpc = path.split("/").pop();
        if (rpc === "ListHeartbeatJobs") {
          respond(res, 200, { total: 1, actorUserId: "advisor-1", jobs: [] });
          return;
        }
        if (rpc === "UpdateHeartbeatJob" && body.includes("force-rate-limit")) {
          respond(res, 429, "rate limited");
          return;
        }
        if (rpc === "CreateHeartbeatJob") {
          respond(res, 200, { taskUid: "task-1", nextExecutionAt: "2026-08-22T09:00:00Z" });
          return;
        }
        respond(res, 200, {});
        return;
      }
      respond(res, 404, { error: "fixture route not found", path });
    });
  });

  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address() as { port: number };
  fixtureUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
});

beforeEach(() => {
  requests = [];
  storagePutSpy.mockReset();
  storagePutSpy.mockResolvedValue({ key: "generated/image.png", url: "/manus-storage/generated/image.png" });
  (globalThis as Record<string, string>).__P2_FORGE_URL = fixtureUrl;
  (globalThis as Record<string, string>).__P2_FORGE_KEY = "forge-test-token";
  (globalThis as Record<string, string>).__P2_AI_URL = fixtureUrl;
  (globalThis as Record<string, string>).__P2_AI_TOKEN = "ai-test-token";
});

describe("heartbeat adapter", () => {
  it("creates a scoped job with defaults, serialized payload, and user session header", async () => {
    const { createHeartbeatJob } = await import("./heartbeat");
    const result = await createHeartbeatJob({
      name: "morning-briefing",
      cron: "0 0 9 * * *",
      path: "/api/scheduled/briefing",
      payload: { locale: "en" },
    }, "advisor-session-token");

    expect(result.taskUid).toBe("task-1");
    const call = requests.find((request) => request.path.includes("CreateHeartbeatJob"));
    expect(call?.headers.authorization).toBe("Bearer forge-test-token");
    expect(call?.headers["x-manus-user-session"]).toBe("advisor-session-token");
    expect(JSON.parse(call?.body ?? "{}")).toMatchObject({
      callbackMethod: "POST", callbackPayload: '{"locale":"en"}', callbackPath: "/api/scheduled/briefing",
    });
  });

  it("rejects an unsafe callback path before issuing a network request", async () => {
    const { createHeartbeatJob } = await import("./heartbeat");
    await expect(createHeartbeatJob({ name: "bad", cron: "0 * * * * *", path: "/admin/run" }, "")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(requests).toHaveLength(0);
  });

  it("maps provider rate limits to tRPC TOO_MANY_REQUESTS errors", async () => {
    const { updateHeartbeatJob } = await import("./heartbeat");
    await expect(updateHeartbeatJob("task-1", { description: "force-rate-limit" }, "")).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("lists jobs without forwarding an empty session header", async () => {
    const { listHeartbeatJobs } = await import("./heartbeat");
    const result = await listHeartbeatJobs("", { page: 2, pageSize: 10 });
    expect(result.total).toBe(1);
    const call = requests.find((request) => request.path.includes("ListHeartbeatJobs"));
    expect(call?.headers["x-manus-user-session"]).toBeUndefined();
    expect(JSON.parse(call?.body ?? "{}")).toEqual({ page: 2, pageSize: 10 });
  });
});

describe("voice transcription adapter", () => {
  it("downloads audio and posts a multipart transcription request", async () => {
    const { transcribeAudio } = await import("./voiceTranscription");
    const result = await transcribeAudio({ audioUrl: `${fixtureUrl}/audio/source.wav`, language: "en" });
    expect(result).toMatchObject({ text: "Concierge request", language: "en" });
    const request = requests.find((item) => item.path === "/v1/audio/transcriptions");
    expect(request?.method).toBe("POST");
    expect(request?.headers.authorization).toBe("Bearer forge-test-token");
    expect(request?.headers["content-type"]).toContain("multipart/form-data");
    expect(request?.body).toContain("English");
  });

  it("returns a structured configuration error when Forge is unavailable", async () => {
    (globalThis as Record<string, string>).__P2_FORGE_URL = "";
    const { transcribeAudio } = await import("./voiceTranscription");
    await expect(transcribeAudio({ audioUrl: `${fixtureUrl}/audio/source.wav` })).resolves.toMatchObject({ code: "SERVICE_ERROR" });
  });

  it("returns INVALID_FORMAT when the source audio cannot be downloaded", async () => {
    const { transcribeAudio } = await import("./voiceTranscription");
    await expect(transcribeAudio({ audioUrl: `${fixtureUrl}/audio/unavailable.wav` })).resolves.toMatchObject({ code: "INVALID_FORMAT" });
  });
});

describe("storage adapter", () => {
  it("obtains a presigned PUT URL, uploads content, and returns a sanitized portal path", async () => {
    const { storagePut } = await import("../storage");
    const result = await storagePut("/assets/welcome_banner.png", "image-data", "image/png");
    expect(result.key).toMatch(/^assets\/welcome_banner_[a-f0-9]{8}\.png$/);
    expect(result.url).toBe(`/manus-storage/${result.key}`);
    expect(requests.some((request) => request.path.startsWith("/v1/storage/presign/put?path=assets%2F"))).toBe(true);
    expect(requests.some((request) => request.path === "/object-store/upload" && request.method === "PUT")).toBe(true);
  });

  it("normalizes a read-only download path and retrieves signed URLs", async () => {
    const { storageGet, storageGetSignedUrl } = await import("../storage");
    await expect(storageGet("///reports/a.pdf")).resolves.toEqual({ key: "reports/a.pdf", url: "/manus-storage/reports/a.pdf" });
    await expect(storageGetSignedUrl("/reports/a.pdf")).resolves.toBe("https://objects.example.test/signed-download");
  });

  it("fails closed when storage credentials are absent", async () => {
    (globalThis as Record<string, string>).__P2_FORGE_KEY = "";
    const { storageGetSignedUrl } = await import("../storage");
    await expect(storageGetSignedUrl("reports/a.pdf")).rejects.toThrow("Storage config missing");
  });
});

describe("image generation adapter", () => {
  it("uses the secure image service, applies GPT Image defaults, and persists returned bytes", async () => {
    const { generateImage } = await import("./imageGeneration");
    const result = await generateImage({ prompt: "Luxury villa at dusk" });
    expect(result.url).toBe("/manus-storage/generated/image.png");
    const request = requests.find((item) => item.path === "/images.v1.ImageService/GenerateImage");
    expect(JSON.parse(request?.body ?? "{}")).toMatchObject({ model: "MODEL_GPT_IMAGE_2", quality: "medium" });
    expect(storagePutSpy).toHaveBeenCalledWith(expect.stringMatching(/^generated\/\d+\.png$/), expect.any(Buffer), "image/png");
  });

  it("lists models from the image provider", async () => {
    const { listImageModels } = await import("./imageGeneration");
    await expect(listImageModels()).resolves.toEqual({ models: [{ model: "MODEL_GPT_IMAGE_2", id: "gpt-image-2" }] });
  });

  it("fails closed when the image-provider configuration is absent", async () => {
    (globalThis as Record<string, string>).__P2_FORGE_URL = "";
    const { generateImage } = await import("./imageGeneration");
    await expect(generateImage({ prompt: "x" })).rejects.toThrow("BUILT_IN_FORGE_API_URL");
  });
});

describe("local AI gateway adapter", () => {
  it("sends a normalized inference request and returns text output", async () => {
    const { invokeLocalAi } = await import("./localAi");
    const result = await invokeLocalAi({ capability: "proposal", system: "system", prompt: "recommend" });
    expect(result).toEqual({ output: "Tailored recommendation" });
    const request = requests.find((item) => item.path === "/infer");
    expect(request?.headers.authorization).toBe("Bearer ai-test-token");
    expect(JSON.parse(request?.body ?? "{}")).toMatchObject({ response_format: "text", temperature: 0.2, max_tokens: 1024 });
  });

  it("parses validated structured output for JSON requests", async () => {
    const { invokeLocalAi } = await import("./localAi");
    await expect(invokeLocalAi({ capability: "intelligence", system: "system", prompt: "structured", responseFormat: "json" })).resolves.toEqual({ output: '{"tier":"vip"}', structured: { tier: "vip" } });
  });

  it("fails closed for missing configuration and empty responses", async () => {
    const { invokeLocalAi } = await import("./localAi");
    (globalThis as Record<string, string>).__P2_AI_TOKEN = "";
    await expect(invokeLocalAi({ capability: "briefing", system: "s", prompt: "p" })).rejects.toThrow("not configured");
    (globalThis as Record<string, string>).__P2_AI_TOKEN = "ai-test-token";
    await expect(invokeLocalAi({ capability: "briefing", system: "s", prompt: "empty" })).rejects.toThrow("empty response");
  });
});

describe("Google Maps adapter", () => {
  it("serializes key and query parameters for GET requests", async () => {
    const { makeRequest } = await import("./map");
    const result = await makeRequest<{ status: string }>("/maps/api/geocode/json", { address: "Paris", language: "en" });
    expect(result.status).toBe("OK");
    const request = requests.find((item) => item.path.startsWith("/v1/maps/proxy/maps/api/geocode/json"));
    expect(request?.path).toContain("key=forge-test-token");
    expect(request?.path).toContain("address=Paris");
  });

  it("supports POST request bodies and maps provider failures", async () => {
    const { makeRequest } = await import("./map");
    await expect(makeRequest("/maps/api/route", { region: "EU" }, { method: "POST", body: { origin: "London" } })).resolves.toMatchObject({ method: "POST" });
    await expect(makeRequest("/bad", {})).rejects.toThrow("429");
  });

  it("fails closed when Google Maps proxy credentials are absent", async () => {
    (globalThis as Record<string, string>).__P2_FORGE_KEY = "";
    const { makeRequest } = await import("./map");
    await expect(makeRequest("/maps/api/geocode/json")).rejects.toThrow("Google Maps proxy credentials missing");
  });
});
