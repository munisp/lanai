/**
 * Express authentication middleware for proxy routes.
 *
 * These guards protect raw Express routes (Chatwoot proxy, CRM proxy, storage
 * proxy) that sit outside the tRPC layer and therefore bypass the tRPC
 * procedure-level auth middleware.
 */
import type { Request, Response, NextFunction } from "express";
import { sdk } from "./sdk";
import { getMemberSessionByToken, getMemberById } from "../db";

const MEMBER_COOKIE = "lanai_member_session";

/**
 * Require an authenticated advisor (Manus OAuth session).
 * Returns 401 if the caller is not a signed-in advisor.
 */
export async function requireAdvisorAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await sdk.authenticateRequest(req);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized: advisor session required" });
  }
}

/**
 * Require an authenticated advisor OR member.
 * Returns 401 if the caller has no valid session of either type.
 */
export async function requireAnyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // 1. Try advisor OAuth
  try {
    await sdk.authenticateRequest(req);
    return next();
  } catch {
    // not an advisor — try member session
  }

  // 2. Try member session cookie
  try {
    const cookieHeader = req.headers.cookie ?? "";
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
          return next();
        }
      }
    }
  } catch {
    // fall through
  }

  res.status(401).json({ error: "Unauthorized: valid session required" });
}
