import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { Permify } from "./infrastructure";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

const UNAUTHED_ERR_MSG = "You must be signed in to access this resource.";
const NOT_ADMIN_ERR_MSG = "You do not have permission to perform this action.";

/**
 * The only authorization bypass is explicit test mode with no configured live
 * Permify endpoint. Production and staging always fail closed on a denied or
 * unavailable policy decision.
 */
async function requirePermifyPermission(
  subject: string,
  action: string,
  resource: string,
): Promise<void> {
  if (process.env.NODE_ENV === "test" && !process.env.PERMIFY_GRPC_ADDRESS) {
    return;
  }
  try {
    const allowed = await Permify.check(subject, action, resource);
    if (!allowed) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Permission denied" });
    }
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Authorization service denied the request",
    });
  }
}

// ─── Advisor auth middleware ──────────────────────────────────────────────────

const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  await requirePermifyPermission(`user:${ctx.user.id}`, "manage", "platform:lanai");
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Any authenticated advisor (advisor | senior_advisor | admin). */
export const protectedProcedure = t.procedure.use(requireUser);

/** senior_advisor or admin only — both local role and Permify platform relation are required. */
export const seniorAdvisorProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (!["senior_advisor", "admin"].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    await requirePermifyPermission(`user:${ctx.user.id}`, "manage", "platform:lanai");
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

/** Admin-only — requires the local administrator role and Permify administer relation. */
export const adminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    await requirePermifyPermission(`user:${ctx.user.id}`, "administer", "platform:lanai");
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// ─── Member auth middleware ───────────────────────────────────────────────────

const requireMember = t.middleware(async ({ ctx, next }) => {
  if (!ctx.member) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  // The session identifies the member; Permify additionally proves that this
  // member owns the matching member_record before any member procedure runs.
  await requirePermifyPermission(
    `member:${ctx.member.id}`,
    "view",
    `member_record:${ctx.member.id}`,
  );
  return next({ ctx: { ...ctx, member: ctx.member } });
});

/** Any authenticated member with an explicit ownership relationship. */
export const memberProcedure = t.procedure.use(requireMember);

/** Platinum-tier member only — authorization plus the commercial tier guard. */
export const platinumMemberProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.member) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    await requirePermifyPermission(
      `member:${ctx.member.id}`,
      "view",
      `member_record:${ctx.member.id}`,
    );
    if (ctx.member.tier !== "platinum") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This feature requires a Platinum membership.",
      });
    }
    return next({ ctx: { ...ctx, member: ctx.member } });
  }),
);
