/**
 * CRM Data Aggregator
 *
 * The advisor portal pages (Dashboard, Clients, Members, Travel Requests) were
 * originally wired to read from an external Twenty CRM via the /crm GraphQL proxy.
 * When that external CRM is not configured, those pages break. This route serves
 * the same CRM-shaped data sourced from the platform's own database (members,
 * travel_requests, proposals, celebrations, advisor_tasks) so the full workflow
 * is functional and testable without the external dependency.
 *
 * Shape mirrors the legacy crmApi.ts TypeScript interfaces so the frontend pages
 * need no changes.
 */
import type { Express, Request, Response } from "express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { requireAnyAuth } from "./authMiddleware";

type Ctx = Awaited<ReturnType<typeof createContext>>;

async function makeCaller(req: Request, res: Response) {
  const ctx: Ctx = await createContext({ req, res } as any);
  return appRouter.createCaller(ctx);
}

function splitName(full?: string | null): { firstName: string; lastName: string } {
  if (!full) return { firstName: "", lastName: "" };
  const parts = full.trim().split(/\s+/);
  const firstName = parts.shift() ?? "";
  const lastName = parts.join(" ");
  return { firstName, lastName };
}

export function registerCrmDataRoutes(app: Express) {
  app.use("/api/crm", requireAnyAuth);

  // All CRM-shaped data in one call (mirrors fetchDashboardStats + page loads).
  app.get("/api/crm/data", async (req: Request, res: Response) => {
    try {
      const caller = await makeCaller(req, res);

      const [members, travelRequests, proposals, celebrations, tasks] = await Promise.all([
        caller.members.list().catch(() => []),
        caller.travelRequests.list().catch(() => []),
        caller.proposals.listByRequest({ travelRequestId: 0 }).catch(() => []),
        caller.celebrations.upcoming({ daysAhead: 365 }).catch(() => []),
        caller.tasks.myTasks({}).catch(() => []),
      ]);

      const clients = (members as any[]).map((m) => ({
        id: String(m.id),
        name: splitName(m.name),
        emails: { primaryEmail: m.email ?? "" },
        phones: { primaryPhoneNumber: m.phone ?? "" },
        city: (m as any).city ?? "",
        tier: m.tier ?? "",
        createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: m.updatedAt ? new Date(m.updatedAt).toISOString() : new Date().toISOString(),
      }));

      const memberLookup = new Map<number, string>();
      for (const m of members as any[]) {
        if (m.id != null) memberLookup.set(Number(m.id), m.name ?? "");
      }
      const stageMap: Record<string, string> = {
        new: "NEW",
        in_progress: "IN_PROGRESS",
        proposal_sent: "PROPOSAL",
        booked: "BOOKED",
        completed: "CLOSED_WON",
        cancelled: "CLOSED_LOST",
      };
      const opportunities = (travelRequests as any[]).map((t) => ({
        id: String(t.id),
        name: `Travel — ${t.destination ?? "Unknown"}`,
        stage: stageMap[t.status ?? "new"] ?? "NEW",
        amount: {
          amountMicros: Math.round((parseFloat(t.budget ?? "0") || 0) * 1_000_000),
          currencyCode: (t.budgetCurrency ?? "GBP").toUpperCase(),
        },
        closeDate:
          t.departureDate != null
            ? new Date(t.departureDate).toISOString()
            : t.createdAt
              ? new Date(t.createdAt).toISOString()
              : new Date().toISOString(),
        createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : new Date().toISOString(),
        pointOfContact: t.memberId != null ? { id: String(t.memberId), name: splitName(memberLookup.get(Number(t.memberId)) ?? "") } : undefined,
      }));

      const notes = (celebrations as any[]).slice(0, 20).map((c: any) => ({
        id: String(c.id),
        title: c.title ?? c.type ?? "Note",
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString(),
      }));

      const mappedTasks = (tasks as any[]).slice(0, 20).map((t: any) => ({
        id: String(t.id),
        title: t.title ?? "Task",
        status: t.status ?? "open",
        dueAt: t.dueAt ? new Date(t.dueAt).toISOString() : new Date().toISOString(),
        createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
        assignee: t.assignee ? { id: String(t.assignee.id), name: splitName(t.assignee.name) } : undefined,
      }));

      const pipelineValue = opportunities.reduce(
        (sum, o) => sum + (o.amount?.amountMicros ?? 0) / 1_000_000,
        0
      );
      const openRequests = opportunities.filter((o) =>
        ["NEW", "SCREENING", "MEETING", "PROPOSAL", "IN_PROGRESS"].includes(o.stage)
      ).length;
      const activeMembers = opportunities.filter((o) => o.stage === "CUSTOMER" || o.stage === "BOOKED").length;

      res.json({
        clients: { totalCount: clients.length, clients },
        opportunities: { totalCount: opportunities.length, opportunities },
        notes: { totalCount: notes.length, notes },
        tasks: { totalCount: mappedTasks.length, tasks: mappedTasks },
        stats: {
          activeClients: clients.length,
          openRequests,
          activeMembers,
          pipelineValue: Math.round(pipelineValue),
          recentOpportunities: opportunities.slice(0, 8),
        },
      });
    } catch (err) {
      console.error("[CRM Data] failed:", err);
      res.status(500).json({ error: "Failed to aggregate CRM data", detail: String(err) });
    }
  });
}
