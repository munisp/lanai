/**
 * Storage Proxy: generates presigned download URLs for Forge storage objects.
 *
 * Security:
 *  - All requests require an authenticated advisor or member session.
 *  - Path traversal is blocked (no `..` segments allowed).
 *  - Members may only download storage objects they own (storage_objects registry).
 *  - The server-side Forge API key is never exposed to the client.
 */
import type { Express } from "express";
import { ENV } from "./env";
import { requireAnyAuth, type AuthedRequest } from "./authMiddleware";
import { getStorageObjectOwner } from "../db";

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

    // Ownership check: a member may only download storage objects they own.
    // Advisors pass through (advisor row-level isolation is separate work).
    // Unregistered keys are denied for members so a guessed key yields nothing.
    const member = (req as AuthedRequest).member;
    if (member) {
      const owner = await getStorageObjectOwner(key);
      if (owner !== member.id) {
        res.status(403).send("Forbidden: you do not have access to this file");
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
