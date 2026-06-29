import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  adminProcedure,
  memberProcedure,
  platinumMemberProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  seniorAdvisorProcedure,
} from "./_core/trpc";
import { sendInvitationEmail } from "./email";
import { memberPaymentsRouter } from "./stripeRouter";
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
  markInvitationAccepted,
  updateMember,
  updateMemberPin,
  updateUserRole,
} from "./db";

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
});

export type AppRouter = typeof appRouter;
