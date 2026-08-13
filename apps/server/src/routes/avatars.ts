import { Router } from "express";
import type { Request, Response } from "express";
import type { Readable } from "stream";
import { z } from "zod";
import requireAuth from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/async-handler";
import { getRequiredS3Service } from "../lib/s3";
import { createLogger } from "../lib/logger";

const log = createLogger("avatars");

/**
 * Avatar key validation — mirrors the write-path schemas in
 * updateAvatar.ts / updateRoomAvatar.ts so only allowed keys can be read:
 *   - defaults/{user|room}/{filename}.png (built-in defaults)
 *   - avatars/{userId}/... or avatars/rooms/{roomId}/... (custom uploads)
 */
const avatarKeySchema = z.union([
  z.string().regex(/^defaults\/(user|room)\/[^/]+\.png$/, "Invalid avatar key"),
  z.string().regex(/^avatars\/[^/]+\/.+/, "Invalid avatar key"),
]);

const router = Router();

/**
 * GET /avatars?key=...
 *
 * Streams an avatar image from S3 so the client can use a stable, cacheable
 * URL in <img> tags instead of passing the raw S3 key to the browser.
 *
 * GET requests skip the CSRF check (tiny-csrf only guards state-changing
 * verbs) and the session cookie authenticates same-origin image loads.
 */
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = z
      .object({ key: avatarKeySchema })
      .safeParse({ key: req.query.key });
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid avatar key" });
      return;
    }

    const s3Service = getRequiredS3Service();

    let result;
    try {
      result = await s3Service.getObjectStream(parsed.data.key);
    } catch (err) {
      log.error("Failed to fetch avatar", {
        key: parsed.data.key,
        error: err,
      });
      res.status(404).json({ ok: false, error: "Avatar not found" });
      return;
    }

    // Same-origin default (helmet) would block avatars rendered from the web
    // origin; avatars are public images, so relax CORP. Cache for an hour to
    // avoid hitting S3 on every re-render.
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (result.ContentType) res.setHeader("Content-Type", result.ContentType);
    if (result.ContentLength != null) {
      res.setHeader("Content-Length", String(result.ContentLength));
    }

    const body = result.Body as Readable | undefined;
    if (!body) {
      res.status(404).json({ ok: false, error: "Avatar not found" });
      return;
    }

    body.on("error", () => res.destroy());
    body.pipe(res);
  }),
);

export default router;
