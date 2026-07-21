import crypto from "node:crypto";
import { Readable } from "node:stream";
import type {
  Express,
  NextFunction,
  Request,
  Response as ExpressResponse,
} from "express";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  aiInferenceRuns,
  bookings,
  memberPreferences,
  members,
  proposals,
  travelRequests,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "./env";
import { Permify } from "./infrastructure";
import { sdk, type AuthenticatedUser } from "./sdk";

type AiCapability = "proposal" | "intelligence" | "briefing" | "whatsapp";

type AuthenticatedRequest = Request & { advisor?: AuthenticatedUser };

function digest(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function gatewayUrl(path: string): string {
  if (!ENV.aiGatewayUrl || !ENV.aiGatewayToken)
    throw new Error("AI gateway is not configured");
  return `${ENV.aiGatewayUrl.replace(/\/$/, "")}${path}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("JSON object request body is required");
  return value as Record<string, unknown>;
}

async function requireAdvisor(
  req: AuthenticatedRequest,
  res: ExpressResponse,
  next: NextFunction,
) {
  try {
    const advisor = await sdk.authenticateRequest(req);
    const allowed = await Permify.check(
      `user:${advisor.id}`,
      "manage",
      "platform:lanai",
    );
    if (!allowed) {
      res.status(403).json({ error: "Platform authorization denied" });
      return;
    }
    req.advisor = advisor;
    next();
  } catch (error) {
    console.error("[AI proxy] advisor authorization failed", error);
    res.status(401).json({ error: "Advisor authentication is required" });
  }
}

async function createRun(
  capability: AiCapability,
  advisor: AuthenticatedUser,
  input: unknown,
  metadata: Record<string, unknown> = {},
) {
  const db = await getDb();
  const requestId = nanoid(24);
  const [run] = await db
    .insert(aiInferenceRuns)
    .values({
      requestId,
      capability,
      provider: "ollama",
      model: ENV.aiModel,
      initiatedByUserId: advisor.id,
      inputDigest: digest(input),
      inputMetadata: metadata,
      status: "running",
    })
    .returning({
      id: aiInferenceRuns.id,
      requestId: aiInferenceRuns.requestId,
    });
  if (!run) throw new Error("Unable to record inference run");
  return run;
}

async function completeRun(
  runId: number,
  output: unknown,
  startedAt: number,
): Promise<void> {
  const db = await getDb();
  await db
    .update(aiInferenceRuns)
    .set({
      status: "succeeded",
      latencyMs: Math.round(performance.now() - startedAt),
      outputMetadata:
        typeof output === "object" && output
          ? (output as Record<string, unknown>)
          : { output_digest: digest(output) },
      completedAt: new Date(),
    })
    .where(eq(aiInferenceRuns.id, runId));
}

async function failRun(
  runId: number,
  error: unknown,
  startedAt: number,
): Promise<void> {
  const db = await getDb();
  await db
    .update(aiInferenceRuns)
    .set({
      status: "failed",
      latencyMs: Math.round(performance.now() - startedAt),
      error: String(error).slice(0, 4_000),
      completedAt: new Date(),
    })
    .where(eq(aiInferenceRuns.id, runId));
}

async function callGateway(
  path: string,
  payload: unknown,
): Promise<globalThis.Response> {
  const response = await fetch(gatewayUrl(path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.aiGatewayToken}`,
    },
    body: JSON.stringify(payload),
  });
  return response;
}

async function memberFacts(memberId: number): Promise<Record<string, unknown>> {
  const db = await getDb();
  const member = await db
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  if (!member[0]) throw new Error("Member was not found");
  const [preferences, requests, memberBookings, memberProposals] =
    await Promise.all([
      db
        .select()
        .from(memberPreferences)
        .where(eq(memberPreferences.memberId, memberId))
        .limit(1),
      db
        .select()
        .from(travelRequests)
        .where(eq(travelRequests.memberId, memberId))
        .orderBy(desc(travelRequests.createdAt))
        .limit(20),
      db
        .select()
        .from(bookings)
        .where(eq(bookings.memberId, memberId))
        .orderBy(desc(bookings.createdAt))
        .limit(20),
      db
        .select()
        .from(proposals)
        .where(eq(proposals.memberId, memberId))
        .orderBy(desc(proposals.createdAt))
        .limit(20),
    ]);
  return {
    member: {
      name: member[0].name,
      tier: member[0].tier,
      active: member[0].active,
      preferences: preferences[0] ?? null,
      joined_at: member[0].createdAt,
      last_activity_at: member[0].lastSignedIn,
    },
    travel_requests: requests.map((item) => ({
      destination: item.destination,
      dates: item.dates,
      status: item.status,
      budget: item.budget,
      created_at: item.createdAt,
    })),
    bookings: memberBookings.map((item) => ({
      status: item.status,
      currency: item.currency,
      created_at: item.createdAt,
      commission_received: item.commissionReceived,
    })),
    proposals: memberProposals.map((item) => ({
      status: item.status,
      total_price: item.totalPrice,
      currency: item.currency,
      created_at: item.createdAt,
    })),
  };
}

function normalizeProposalPayload(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return {
    client_name: String(
      input.client_name ?? input.clientName ?? input.memberName ?? "",
    ),
    destination: String(input.destination ?? ""),
    dates: String(input.dates ?? input.travelDates ?? ""),
    pax: Number(input.pax ?? input.travelers ?? input.guests ?? 0),
    budget: input.budget ? String(input.budget) : undefined,
    preferences: input.preferences
      ? String(input.preferences)
      : input.notes
        ? String(input.notes)
        : undefined,
  };
}

function genericFailure(
  res: ExpressResponse,
  response: globalThis.Response,
): Promise<void> {
  return response.text().then((text) => {
    res
      .status(
        response.status >= 400 && response.status < 600 ? response.status : 502,
      )
      .json({ error: "AI inference failed", detail: text.slice(0, 2_000) });
  });
}

export function registerAiRoutes(app: Express): void {
  app.post(
    "/api/proposals/generate-proposal",
    requireAdvisor,
    async (req: AuthenticatedRequest, res) => {
      const started = performance.now();
      let run: { id: number; requestId: string } | undefined;
      try {
        const input = normalizeProposalPayload(asRecord(req.body));
        run = await createRun("proposal", req.advisor!, input);
        const upstream = await callGateway(
          "/proposals/generate-proposal",
          input,
        );
        if (!upstream.ok) return await genericFailure(res, upstream);
        const output = await upstream.json();
        await completeRun(run.id, output, started);
        res.json({ ...output, request_id: run.requestId });
      } catch (error) {
        if (run) await failRun(run.id, error, started);
        res.status(503).json({ error: "AI proposal generation unavailable" });
      }
    },
  );

  app.post(
    "/api/proposals/generate-proposal-stream",
    requireAdvisor,
    async (req: AuthenticatedRequest, res) => {
      const started = performance.now();
      let run: { id: number; requestId: string } | undefined;
      try {
        const input = normalizeProposalPayload(asRecord(req.body));
        run = await createRun("proposal", req.advisor!, input, {
          streaming: true,
        });
        const upstream = await callGateway(
          "/proposals/generate-proposal-stream",
          input,
        );
        if (!upstream.ok || !upstream.body)
          return await genericFailure(res, upstream);
        res.status(200).set({
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
          "x-inference-request-id": run.requestId,
        });
        let output = "";
        const source = Readable.fromWeb(upstream.body as never);
        source.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        source.on("end", () => {
          void completeRun(run!.id, { stream_digest: digest(output) }, started);
        });
        source.on("error", (error) => {
          void failRun(run!.id, error, started);
        });
        source.pipe(res);
      } catch (error) {
        if (run) await failRun(run.id, error, started);
        res
          .status(503)
          .json({ error: "Streaming AI proposal generation unavailable" });
      }
    },
  );

  const intelligenceRoute =
    (path: string) =>
    async (req: AuthenticatedRequest, res: ExpressResponse) => {
      const started = performance.now();
      let run: { id: number; requestId: string } | undefined;
      try {
        const input = asRecord(req.body);
        const memberId = Number(
          input.memberId ??
            input.member_id ??
            input.clientId ??
            input.client_id,
        );
        if (!Number.isInteger(memberId) || memberId <= 0)
          throw new Error("A persisted memberId is required");
        const facts = await memberFacts(memberId);
        const name = String(
          (facts.member as Record<string, unknown>).name ?? "",
        );
        run = await createRun("intelligence", req.advisor!, facts, {
          memberId,
          endpoint: path,
        });
        const upstream = await callGateway(path, {
          client_name: name,
          client_facts: facts,
        });
        if (!upstream.ok) return await genericFailure(res, upstream);
        const output = await upstream.json();
        await completeRun(run.id, output, started);
        res.json({ ...output, request_id: run.requestId, member_id: memberId });
      } catch (error) {
        if (run) await failRun(run.id, error, started);
        res
          .status(503)
          .json({ error: "AI intelligence generation unavailable" });
      }
    };
  app.post(
    "/api/intelligence/client-profile",
    requireAdvisor,
    intelligenceRoute("/intelligence/client-profile"),
  );
  app.post(
    "/api/intelligence/churn-risk",
    requireAdvisor,
    intelligenceRoute("/intelligence/churn-risk"),
  );
  app.post(
    "/api/intelligence/opportunity-spot",
    requireAdvisor,
    intelligenceRoute("/intelligence/opportunity-spot"),
  );

  app.post(
    "/api/briefing/morning-briefing",
    requireAdvisor,
    async (req: AuthenticatedRequest, res) => {
      const started = performance.now();
      let run: { id: number; requestId: string } | undefined;
      try {
        const db = await getDb();
        const [openRequests, pendingBookings] = await Promise.all([
          db
            .select()
            .from(travelRequests)
            .where(and(eq(travelRequests.status, "new")))
            .orderBy(desc(travelRequests.createdAt))
            .limit(50),
          db
            .select()
            .from(bookings)
            .where(eq(bookings.status, "pending"))
            .orderBy(desc(bookings.createdAt))
            .limit(50),
        ]);
        const input = {
          open_travel_requests: openRequests,
          pending_bookings: pendingBookings,
          requested_by_user_id: req.advisor!.id,
        };
        run = await createRun("briefing", req.advisor!, input);
        const upstream = await callGateway("/briefing/morning-briefing", input);
        if (!upstream.ok) return await genericFailure(res, upstream);
        const output = await upstream.json();
        await completeRun(run.id, output, started);
        res.json({ ...output, request_id: run.requestId });
      } catch (error) {
        if (run) await failRun(run.id, error, started);
        res
          .status(503)
          .json({ error: "AI morning briefing generation unavailable" });
      }
    },
  );

  app.post(
    "/api/whatsapp/api/draft-reply",
    requireAdvisor,
    async (req: AuthenticatedRequest, res) => {
      const started = performance.now();
      let run: { id: number; requestId: string } | undefined;
      try {
        const input = asRecord(req.body);
        if (!input.message || typeof input.message !== "string")
          throw new Error("message is required");
        run = await createRun("whatsapp", req.advisor!, input);
        const upstream = await callGateway("/whatsapp/draft-reply", input);
        if (!upstream.ok) return await genericFailure(res, upstream);
        const output = await upstream.json();
        await completeRun(run.id, output, started);
        res.json({ ...output, request_id: run.requestId });
      } catch (error) {
        if (run) await failRun(run.id, error, started);
        res.status(503).json({ error: "AI reply drafting unavailable" });
      }
    },
  );
}
