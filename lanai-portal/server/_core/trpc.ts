import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { Permify } from "./infrastructure";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// ─── Advisor auth middleware ──────────────────────────────────────────────────

const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  try {
    const allowed = await Permify.check(
      `user:${ctx.user.id}`,
      "manage",
      "platform:lanai",
    );
    if (!allowed)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Platform permission denied",
      });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Authorization service denied the request",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Any authenticated advisor (advisor | senior_advisor | admin). */
export const protectedProcedure = t.procedure.use(requireUser);

/** senior_advisor or admin only — for member management, settings, role promotion. */
export const seniorAdvisorProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (!["senior_advisor", "admin"].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

/** admin only — for role promotion and system-level operations. */
export const adminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// ─── Member auth middleware ───────────────────────────────────────────────────

const requireMember = t.middleware(async ({ ctx, next }) => {
  if (!ctx.member) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, member: ctx.member } });
});

/** Any authenticated member (client-portal user). */
export const memberProcedure = t.procedure.use(requireMember);

/** Platinum-tier member only — document vault, priority messaging. */
export const platinumMemberProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.member) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.member.tier !== "platinum") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This feature requires a Platinum membership.",
      });
    }
    return next({ ctx: { ...ctx, member: ctx.member } });
  }),
);
