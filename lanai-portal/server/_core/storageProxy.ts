/**
 * Storage Proxy — generates presigned download URLs for Forge storage objects.
 *
 * Security:
 *  - All requests require an authenticated advisor or member session.
 *  - Member sessions may only presign objects under their own `members/<id>/`
 *    prefix (row-level ownership, P0-11). Advisor sessions may presign any key.
 *  - Path traversal is blocked (no `..` segments allowed).
 *  - The server-side Forge API key is never exposed to the client.
 */
import type { Express } from "express";
import { ENV } from "./env";
import { requireAnyAuth } from "./authMiddleware";

export function registerStorageProxy(app: Express) {
  // ── Auth guard: any authenticated user (advisor or member) ───────────────
  app.use("/manus-storage", requireAnyAuth);

  app.get<{ key: string[] }>("/manus-storage/*key", async (req, res) => {
    const key = req.params.key.join("/");

    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // Block path traversal attempts
    if (key.includes("..") || key.includes("//")) {
      res.status(400).send("Invalid storage key");
      return;
    }

    // Member sessions are scoped to their own storage prefix (P0-11)
    if (req.authType === "member") {
      const ownPrefix = `members/${req.memberId}/`;
      if (!key.startsWith(ownPrefix)) {
        console.warn(
          `[StorageProxy] member ${req.memberId} denied presign for foreign key ${key}`,
        );
        res.status(403).send("Forbidden: storage key outside member scope");
        return;
      }
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
