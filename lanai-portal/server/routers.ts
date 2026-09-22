import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import {
  adminProcedure,
  anyAuthProcedure,
  memberProcedure,
  platinumMemberProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  seniorAdvisorProcedure,
} from "./_core/trpc";
import { sendInvitationEmail } from "./email";
import { memberPaymentsRouter } from "./stripeRouter";
import { chatwootRouter } from "./chatwootRouter";
import { syncContactForMember } from "./chatwootService";
import {
  travelRequestsRouter,
  proposalsRouter,
  bookingsRouter,
  suppliersRouter,
  documentsRouter,
} from "./travelRouter";
import {
  notificationsRouter,
  aiInsightsRouter,
  messagingRouter,
  commissionRouter,
  auditRouter,
  preferencesRouter,
  tasksRouter,
  tagsRouter,
  proposalItemsRouter,
  analyticsRouter,
  supplierContactsRouter,
} from "./platformRouter";
import {
  memberProfileRouter,
  familyMembersRouter,
  supplierServicesRouter,
  invoicingRouter,
  celebrationsRouter,
  npsRouter,
  communicationHubRouter,
  taskTemplatesRouter,
  tripTimelineRouter,
  vipAmenitiesRouter,
  revenueAnalyticsRouter,
  aiConciergeRouter,
  celebrationsPatchRouter,
  vipAmenitiesPatchRouter,
  tripTimelinePatchRouter,
  npsPatchRouter,
  aiConciergePatchRouter,
} from "./phase2Router";
import {
  createInvitation,
  createMember,
  createMemberSession,
  deleteMemberSession,
  getAllAdvisors,
  getAllMembers,
  getInvitationByToken,
  getMemberByEmail,
  getPendingInvitations,
  getDb,
  markInvitationAccepted,
  updateMember,
  updateMemberPin,
  updateUserRole,
} from "./db";
import { favouriteSuppliers, memberSpending, bookings, suppliers, proposals, members } from "../drizzle/schema";
import { itinerariesRouter } from "./itinerariesRouter";
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";

// ─── Constants ────────────────────────────────────────────────────────────────

const MEMBER_COOKIE = "lanai_member_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
const BCRYPT_ROUNDS = 12;

// ─── CRM helper — fetch person by email to get crmPersonId ───────────────────

async function lookupCrmPersonByEmail(email: string): Promise<string | null> {
  try {
    const crmToken = process.env.TWENTY_CRM_API_TOKEN;
    const crmUrl = process.env.TWENTY_CRM_URL ?? "http://localhost:3000";
    if (!crmToken) return null;

    const query = `
      query FindPersonByEmail($email: String!) {
        people(filter: { emails: { primaryEmail: { eq: $email } } }, first: 1) {
          edges { node { id } }
        }
      }
    `;
    const res = await fetch(`${crmUrl}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${crmToken}`,
      },
      body: JSON.stringify({ query, variables: { email } }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { people?: { edges?: { node?: { id?: string } }[] } };
    };
    return json.data?.people?.edges?.[0]?.node?.id ?? null;
  } catch {
    return null;
  }
}

// ─── CRM helper — fetch opportunities for a specific person ──────────────────

async function fetchMemberOpportunities(crmPersonId: string) {
  try {
    const crmToken = process.env.TWENTY_CRM_API_TOKEN;
    const crmUrl = process.env.TWENTY_CRM_URL ?? "http://localhost:3000";
    if (!crmToken) return [];

    const query = `
      query GetPersonOpportunities($personId: ID!) {
        opportunities(
          filter: { pointOfContact: { id: { eq: $personId } } }
          orderBy: { updatedAt: DescNullsLast }
          first: 50
        ) {
          edges {
            node {
              id
              name
              stage
              amount { amountMicros currencyCode }
              closeDate
              createdAt
              updatedAt
            }
          }
        }
      }
    `;
    const res = await fetch(`${crmUrl}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${crmToken}`,
      },
      body: JSON.stringify({ query, variables: { personId: crmPersonId } }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: {
        opportunities?: {
          edges?: {
            node?: {
              id: string;
              name: string;
              stage: string;
              amount?: { amountMicros: number; currencyCode: string };
              closeDate?: string;
              createdAt: string;
              updatedAt: string;
            };
          }[];
        };
      };
    };
    return (json.data?.opportunities?.edges ?? [])
      .map((e) => e.node)
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Member session cookie helpers ───────────────────────────────────────────

import type { Request, Response } from "express";

function setMemberSessionCookie(req: Request, res: Response, token: string) {
  const opts = getSessionCookieOptions(req);
  res.cookie(MEMBER_COOKIE, token, { ...opts, maxAge: SESSION_TTL_MS });
}

function clearMemberSessionCookie(req: Request, res: Response) {
  const opts = getSessionCookieOptions(req);
  res.clearCookie(MEMBER_COOKIE, { ...opts, maxAge: -1 });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  // ── Advisor OAuth auth ──────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ── Member auth (client portal) ─────────────────────────────────────────────
  memberAuth: router({
    /**
     * Returns the currently authenticated member (from session cookie).
     * Returns null if not logged in — used by the frontend to gate the portal.
     */
    me: publicProcedure.query(({ ctx }) => ctx.member ?? null),

    /**
     * Email + PIN login. Validates credentials, creates a server-side session,
     * and sets an HttpOnly session cookie. Returns the member profile.
     */
    login: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          pin: z.string().min(4).max(12),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const member = await getMemberByEmail(input.email);

        if (!member) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or PIN.",
          });
        }

        if (!member.onboardingComplete || !member.pinHash) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Your account setup is incomplete. Please check your invitation email to set your PIN.",
          });
        }

        const valid = await bcrypt.compare(input.pin, member.pinHash);
        if (!valid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or PIN.",
          });
        }

        // Create server-side session
        const token = nanoid(64);
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
        await createMemberSession({ token, memberId: member.id, expiresAt });

        // Set HttpOnly cookie
        setMemberSessionCookie(ctx.req, ctx.res, token);

        return {
          id: member.id,
          email: member.email,
          name: member.name,
          tier: member.tier,
          crmPersonId: member.crmPersonId,
        };
      }),

    /** Destroys the server-side session and clears the cookie. */
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookieHeader = ctx.req.headers.cookie ?? "";
      const match = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${MEMBER_COOKIE}=`));

      if (match) {
        const token = match.slice(MEMBER_COOKIE.length + 1);
        await deleteMemberSession(token);
      }

      clearMemberSessionCookie(ctx.req, ctx.res);
      return { success: true } as const;
    }),

    /** Dev-only: bypass PIN login when DEV_LOGIN=true */
    devLogin: publicProcedure
      .input(z.object({ email: z.string().email() }).optional())
      .mutation(async ({ input, ctx }) => {
        if (!ENV.devLogin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Dev login not available" });
        }
        const email = input?.email ?? "demo@lanai.com";
        let member = await getMemberByEmail(email);
        if (!member) {
          const db = await getDb();
          if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
          const [created] = await db.insert(members).values({
            name: "Demo Member", email, tier: "platinum", active: true, onboardingComplete: true, pinHash: "",
          }).returning();
          member = created;
        }
        const token = nanoid(64);
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
        await createMemberSession({ token, memberId: member.id, expiresAt });
        setMemberSessionCookie(ctx.req, ctx.res, token);
        return { id: member.id, email: member.email, name: member.name, tier: member.tier };
      }),

    /**
     * Accepts an invitation token and sets the member's PIN.
     * Completes onboarding and creates the first session.
     */
    acceptInvite: publicProcedure
      .input(
        z.object({
          token: z.string().min(1),
          pin: z
            .string()
            .min(6, "PIN must be at least 6 digits")
            .max(12)
            .regex(/^\d+$/, "PIN must contain only digits"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const invitation = await getInvitationByToken(input.token);
        if (!invitation) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This invitation link is invalid or has expired.",
          });
        }

        // Check if a member account already exists for this email
        let member = await getMemberByEmail(invitation.email);

        if (!member) {
          // Create the member account
          const memberId = await createMember({
            email: invitation.email,
            name: invitation.name,
            tier: invitation.tier,
            crmPersonId: invitation.crmPersonId ?? undefined,
            invitedByUserId: invitation.invitedByUserId,
            onboardingComplete: false,
            active: true,
          });
          const created = await (async () => {
            const { getMemberById } = await import("./db");
            return getMemberById(memberId);
          })();
          if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
          member = created;
        }

        // Hash and store PIN
        const pinHash = await bcrypt.hash(input.pin, BCRYPT_ROUNDS);
        await updateMemberPin(member.id, pinHash);

        // Mark invitation as accepted
        await markInvitationAccepted(input.token);

        // Create first session
        const token = nanoid(64);
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
        await createMemberSession({ token, memberId: member.id, expiresAt });
        setMemberSessionCookie(ctx.req, ctx.res, token);

        // Sync member contact to Chatwoot (non-fatal)
        try {
          await syncContactForMember(member.id, member.name, member.email, null);
        } catch (chatwootErr) {
          console.warn("[Chatwoot] Contact sync skipped:", chatwootErr);
        }

        return {
          id: member.id,
          email: member.email,
          name: member.name,
          tier: member.tier,
        };
      }),
  }),

  // ── Member portal data ──────────────────────────────────────────────────────
  memberPortal: router({
    /**
     * Returns the authenticated member's own trips from the CRM,
     * filtered by their linked crmPersonId.
     */
    myTrips: memberProcedure.query(async ({ ctx }) => {
      const { member } = ctx;
      if (!member.crmPersonId) {
        // Member not yet linked to CRM — return empty
        return { trips: [], linked: false };
      }
      const trips = await fetchMemberOpportunities(member.crmPersonId);
      return { trips, linked: true };
    }),

    /**
     * Submits a new travel request on behalf of the member.
     * Creates an opportunity in the CRM linked to the member's person record.
     */
    submitRequest: memberProcedure
      .input(
        z.object({
          destination: z.string().min(1),
          travelDate: z.string().optional(),
          budgetGBP: z.number().positive().optional(),
          notes: z.string().optional(),
          origin: z.string().url(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { member } = ctx;
        const crmToken = process.env.TWENTY_CRM_API_TOKEN;
        const crmUrl = process.env.TWENTY_CRM_URL ?? "http://localhost:3000";

        if (!crmToken) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "CRM not configured.",
          });
        }

        const mutation = `
          mutation CreateOpportunity($data: OpportunityCreateInput!) {
            createOpportunity(data: $data) {
              id name stage
            }
          }
        `;

        const res = await fetch(`${crmUrl}/graphql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${crmToken}`,
          },
          body: JSON.stringify({
            query: mutation,
            variables: {
              data: {
                name: `${member.name} — ${input.destination}`,
                stage: "NEW",
                amount: input.budgetGBP
                  ? { amountMicros: input.budgetGBP * 1_000_000, currencyCode: "GBP" }
                  : undefined,
                closeDate: input.travelDate
                  ? new Date(input.travelDate).toISOString()
                  : undefined,
                pointOfContactId: member.crmPersonId ?? undefined,
              },
            },
          }),
        });

        if (!res.ok) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "CRM request failed." });
        }

        const json = (await res.json()) as {
          data?: { createOpportunity?: { id: string } };
          errors?: { message: string }[];
        };

        if (json.errors?.length) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: json.errors[0].message,
          });
        }

        return { opportunityId: json.data?.createOpportunity?.id };
      }),

    /** Returns the member's own profile (tier, name, email). */
    profile: memberProcedure.query(({ ctx }) => ({
      id: ctx.member.id,
      email: ctx.member.email,
      name: ctx.member.name,
      tier: ctx.member.tier,
      crmPersonId: ctx.member.crmPersonId,
      onboardingComplete: ctx.member.onboardingComplete,
    })),

    /**
     * Platinum-only: list documents from storage for this member.
     * (Stub for document vault — returns metadata; actual files stored in S3.)
     */
    myDocuments: platinumMemberProcedure.query(async ({ ctx }) => {
      // In production: query a documents table filtered by memberId
      // For now returns an empty list — documents are uploaded by advisors
      return { documents: [] as { name: string; type: string; url: string; date: string }[] };
    }),

    /** Member: list their favourite suppliers (joined with supplier detail). */
    favouriteSuppliers: memberProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          id: favouriteSuppliers.id,
          supplierId: favouriteSuppliers.supplierId,
          createdAt: favouriteSuppliers.createdAt,
          name: suppliers.name,
          category: suppliers.category,
          country: suppliers.country,
          city: suppliers.city,
          rating: suppliers.rating,
          preferredStatus: suppliers.preferredStatus,
          logoUrl: suppliers.logoUrl,
        })
        .from(favouriteSuppliers)
        .innerJoin(suppliers, eq(favouriteSuppliers.supplierId, suppliers.id))
        .where(eq(favouriteSuppliers.memberId, ctx.member.id))
        .orderBy(desc(favouriteSuppliers.createdAt));
    }),

    /** Member: add a supplier to favourites. */
    addFavouriteSupplier: memberProcedure
      .input(z.object({ supplierId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return { success: true };
        const existing = await db
          .select({ id: favouriteSuppliers.id })
          .from(favouriteSuppliers)
          .where(and(
            eq(favouriteSuppliers.memberId, ctx.member.id),
            eq(favouriteSuppliers.supplierId, input.supplierId),
          ))
          .limit(1);
        if (existing.length === 0) {
          await db.insert(favouriteSuppliers).values({
            memberId: ctx.member.id,
            supplierId: input.supplierId,
          });
        }
        return { success: true };
      }),

    /** Member: remove a supplier from favourites. */
    removeFavouriteSupplier: memberProcedure
      .input(z.object({ supplierId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return { success: true };
        await db
          .delete(favouriteSuppliers)
          .where(and(
            eq(favouriteSuppliers.memberId, ctx.member.id),
            eq(favouriteSuppliers.supplierId, input.supplierId),
          ));
        return { success: true };
      }),

    /** Member: browse the supplier directory (active suppliers). */
    suppliersDirectory: memberProcedure
      .input(z.object({ category: z.string().optional() }).optional())
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions = [eq(suppliers.isActive, true)];
        if (input?.category) conditions.push(eq(suppliers.category, input.category));
        return db
          .select({
            id: suppliers.id,
            name: suppliers.name,
            category: suppliers.category,
            country: suppliers.country,
            city: suppliers.city,
            rating: suppliers.rating,
            preferredStatus: suppliers.preferredStatus,
            logoUrl: suppliers.logoUrl,
          })
          .from(suppliers)
          .where(and(...conditions))
          .orderBy(suppliers.name);
      }),

    /**
     * Member: aggregated spending history.
     * Returns totals (lifetime, this year, by category) plus recent transactions.
     */
    spendingHistory: memberProcedure
      .input(z.object({ limit: z.number().int().positive().default(20) }).optional())
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return { total: "0", byCategory: [], recent: [], yearTotal: "0" };
        const memberId = ctx.member.id;
        const [totals] = await db
          .select({
            total: sql<string>`coalesce(sum(${memberSpending.amount}), 0)`,
            yearTotal: sql<string>`coalesce(sum(case when extract(year from ${memberSpending.spentAt}) = extract(year from now()) then ${memberSpending.amount} else 0 end), 0)`,
          })
          .from(memberSpending)
          .where(eq(memberSpending.memberId, memberId));
        const byCategory = await db
          .select({
            category: memberSpending.category,
            total: sql<string>`coalesce(sum(${memberSpending.amount}), 0)`,
          })
          .from(memberSpending)
          .where(eq(memberSpending.memberId, memberId))
          .groupBy(memberSpending.category)
          .orderBy(desc(sql`sum(${memberSpending.amount})`));
        const recent = await db
          .select()
          .from(memberSpending)
          .where(eq(memberSpending.memberId, memberId))
          .orderBy(desc(memberSpending.spentAt))
          .limit(input?.limit ?? 20);
        return { total: totals.total, yearTotal: totals.yearTotal, byCategory, recent };
      }),

    /**
     * Member: list proposals shared with them by their advisor.
     * Surfaces status (draft/sent/approved/rejected) and key details so the
     * member can review and respond from the portal.
     */
    myProposals: memberProcedure
      .input(z.object({ status: z.enum(["draft", "sent", "approved", "rejected"]).optional() }).optional())
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions = [eq(proposals.memberId, ctx.member.id)];
        if (input?.status) conditions.push(eq(proposals.status, input.status));
        return db
          .select({
            id: proposals.id,
            title: proposals.title,
            status: proposals.status,
            marginPct: proposals.marginPct,
            totalPrice: proposals.totalPrice,
            sentAt: proposals.sentAt,
            approvedAt: proposals.approvedAt,
            rejectedAt: proposals.rejectedAt,
            createdAt: proposals.createdAt,
          })
          .from(proposals)
          .where(and(...conditions))
          .orderBy(desc(proposals.createdAt));
      }),
  }),

  // ── Advisor: member management ──────────────────────────────────────────────
  members: router({
    /** List all members — any advisor can view. */
    list: protectedProcedure.query(async () => {
      const all = await getAllMembers();
      return all.map((m) => ({
        id: m.id,
        email: m.email,
        name: m.name,
        tier: m.tier,
        crmPersonId: m.crmPersonId,
        onboardingComplete: m.onboardingComplete,
        active: m.active,
        createdAt: m.createdAt,
        lastSignedIn: m.lastSignedIn,
      }));
    }),

    /**
     * Invite a new member by email.
     * Looks up the CRM for a matching person record and pre-links them.
     * Sends an invitation email via the Manus notification system.
     */
    invite: protectedProcedure
      .input(
        z.object({
          email: z.string().email(),
          name: z.string().min(1),
          tier: z.enum(["platinum", "gold", "silver"]).default("gold"),
          crmPersonId: z.string().optional(),
          origin: z.string().url("Must pass window.location.origin"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Auto-link CRM person if not provided
        let crmPersonId = input.crmPersonId ?? null;
        if (!crmPersonId) {
          crmPersonId = await lookupCrmPersonByEmail(input.email);
        }

        const token = nanoid(64);
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

        await createInvitation({
          token,
          email: input.email.toLowerCase(),
          name: input.name,
          tier: input.tier,
          crmPersonId: crmPersonId ?? undefined,
          invitedByUserId: ctx.user.id,
          accepted: false,
          expiresAt,
        });

        const inviteUrl = `${input.origin}/client/onboard?token=${token}`;
        const expiresHours = Math.round(INVITE_TTL_MS / 3_600_000);

        // Send real invitation email via Resend
        let emailId: string | null = null;
        try {
          const result = await sendInvitationEmail({
            toEmail: input.email,
            toName: input.name,
            inviteUrl,
            advisorName: ctx.user.name ?? "Your Lanai Advisor",
            memberTier: input.tier,
            expiresHours,
          });
          emailId = result.id;
        } catch (emailErr) {
          // Email failure is non-fatal — log and fall through so the invite
          // record is still created and the URL is returned to the advisor.
          console.error("[Invite] Email delivery failed:", emailErr);
        }

        // Also notify the owner advisor via the platform notification channel
        try {
          const { notifyOwner } = await import("./_core/notification");
          await notifyOwner({
            title: `Member invitation sent to ${input.email}`,
            content: `Invite URL: ${inviteUrl}\nTier: ${input.tier}\nExpires: ${expiresAt.toISOString()}${emailId ? `\nEmail ID: ${emailId}` : " (email delivery failed — share URL manually)"}`,
          });
        } catch {
          // Non-fatal
        }

        return { token, inviteUrl, expiresAt, emailSent: emailId !== null };
      }),

    /** List pending (unaccepted, non-expired) invitations. */
    pendingInvites: protectedProcedure.query(async () => {
      return getPendingInvitations();
    }),

    /** Update a member's tier, name, CRM link, or active status. */
    update: protectedProcedure
      .input(
        z.object({
          memberId: z.number(),
          name: z.string().min(1).optional(),
          tier: z.enum(["platinum", "gold", "silver"]).optional(),
          crmPersonId: z.string().optional(),
          active: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { memberId, ...data } = input;
        await updateMember(memberId, data);
        return { success: true };
      }),

    /** Get a single member's full record (incl. dateOfBirth, passportExpiry). */
    fetchById: anyAuthProcedure
      .input(z.object({ memberId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const { getMemberById } = await import("./db");
        const m = await getMemberById(input.memberId);
        if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
        return m;
      }),

    /** Update personal/identity fields on a member (advisor or the member themselves). */
    updateIdentity: anyAuthProcedure
      .input(
        z.object({
          memberId: z.number().int().positive(),
          dateOfBirth: z.string().optional(),
          passportExpiry: z.string().optional(),
          nationality: z.string().optional(),
          phone: z.string().optional(),
          dietaryRequirements: z.string().optional(),
          emergencyContactName: z.string().optional(),
          emergencyContactPhone: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { getMemberById } = await import("./db");
        const m = await getMemberById(input.memberId);
        if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
        // A member may only edit their own record; advisors may edit any.
        if (ctx.member && ctx.member.id !== input.memberId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You may only edit your own profile" });
        }
        const { memberId: _id, ...data } = input;
        await updateMember(input.memberId, data);
        return { success: true };
      }),
  }),

  // ── Advisor: role management (senior_advisor / admin only) ──────────────────
  advisors: router({
    /** List all advisor accounts. */
    list: protectedProcedure.query(async () => {
      const all = await getAllAdvisors();
      return all.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        lastSignedIn: u.lastSignedIn,
      }));
    }),

    /** Promote or demote an advisor's role. Admin only. */
    updateRole: adminProcedure
      .input(
        z.object({
          userId: z.number(),
          role: z.enum(["advisor", "senior_advisor", "admin"]),
        })
      )
      .mutation(async ({ input }) => {
        await updateUserRole(input.userId, input.role);
        return { success: true };
      }),
  }),

  // ── Member payments (Stripe) ────────────────────────────────────────────────
  memberPayments: memberPaymentsRouter,

  // ── Travel, Proposals, Bookings, Suppliers, Documents ─────────────────────
  travelRequests: travelRequestsRouter,
  proposals: proposalsRouter,
  itineraries: itinerariesRouter,
  proposalItems: proposalItemsRouter,
  bookings: bookingsRouter,
  suppliers: suppliersRouter,
  supplierContacts: supplierContactsRouter,
  documents: documentsRouter,

  // ── Platform features ──────────────────────────────────────────────
  notifications: notificationsRouter,
  aiInsights: aiInsightsRouter,
  messaging: messagingRouter,
  commissions: commissionRouter,
  audit: auditRouter,
  preferences: preferencesRouter,
  tasks: tasksRouter,
  tags: tagsRouter,
  analytics: analyticsRouter,

  // ── Phase 2: Human Tester Feedback Features ────────────────────────────────────────────────
  memberProfile: memberProfileRouter,
  familyMembers: familyMembersRouter,
  supplierServices: supplierServicesRouter,
  invoicing: invoicingRouter,
  celebrations: router({ ...celebrationsRouter._def.record, ...celebrationsPatchRouter._def.record }),
  nps: router({ ...npsRouter._def.record, ...npsPatchRouter._def.record }),
  communicationHub: communicationHubRouter,
  taskTemplates: taskTemplatesRouter,
  tripTimeline: router({ ...tripTimelineRouter._def.record, ...tripTimelinePatchRouter._def.record }),
  vipAmenities: router({ ...vipAmenitiesRouter._def.record, ...vipAmenitiesPatchRouter._def.record }),
  revenueAnalytics: revenueAnalyticsRouter,
  aiConcierge: router({ ...aiConciergeRouter._def.record, ...aiConciergePatchRouter._def.record }),

  // ── Chatwoot (omnichannel communication layer) ────────────────────────────────────────────
  chatwoot: chatwootRouter,
});

export type AppRouter = typeof appRouter;
