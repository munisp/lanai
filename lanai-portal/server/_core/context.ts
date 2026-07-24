import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Member, User } from "../../drizzle/schema";
import { getMemberById, getMemberSessionByToken, updateMemberLastSignedIn } from "../db";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /** Authenticated advisor (Keycloak OAuth). Null for unauthenticated or member requests. */
  user: User | null;
  /** Authenticated member (client portal). Null for unauthenticated or advisor requests. */
  member: Member | null;
};

const MEMBER_COOKIE = "lanai_member_session";

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let member: Member | null = null;

  // 1. Try advisor OAuth authentication
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    user = null;
  }

  // 2. Try member session cookie (only if not an advisor request)
  if (!user) {
    try {
      const cookieHeader = opts.req.headers.cookie ?? "";
      const match = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${MEMBER_COOKIE}=`));

      if (match) {
        const token = match.slice(MEMBER_COOKIE.length + 1);
        const session = await getMemberSessionByToken(token);
        if (session) {
          const m = await getMemberById(session.memberId);
          if (m && m.active) {
            member = m;
            // Fire-and-forget last-seen update
            updateMemberLastSignedIn(m.id).catch(() => {});
          }
        }
      }
    } catch {
      member = null;
    }
  }

  return { req: opts.req, res: opts.res, user, member };
}
