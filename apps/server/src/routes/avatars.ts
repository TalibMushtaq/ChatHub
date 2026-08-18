import { Router } from "express";
import type { Request, Response } from "express";
import type { Readable } from "stream";
import { z } from "zod";
import requireAuth from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/async-handler";
import { getRequiredS3Service } from "../lib/s3";
import { createLogger } from "../lib/logger";
import { prisma } from "../../db/prisma";
import { createRateLimiter, enforceRateLimit } from "../lib/rateLimiter";
import { unwrapParsed } from "../lib/validate";
import { avatarPresignSchema } from "@repo/validators";
import { presignAvatarUpload } from "../services/avatar/presignUpload";
import {
  AVATAR_RATE_LIMIT_MAX,
  AVATAR_RATE_LIMIT_WINDOW_MS,
} from "../constants/avatar";

const log = createLogger("avatars");

const presignLimiter = createRateLimiter({
  maxAttempts: AVATAR_RATE_LIMIT_MAX,
  windowMs: AVATAR_RATE_LIMIT_WINDOW_MS,
  prefix: "avatar:presign",
});

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
 * POST /avatars/presign
 *
 * Returns a presigned PUT URL so the client can upload a processed/cropped
 * avatar image straight to S3. Does NOT modify the database — the returned
 * `s3Key` is associated with the user or room via the existing PATCH
 * endpoints (/auth/me/avatar, /room/:roomId/avatar) afterwards.
 *
 * For room avatars the caller must be OWNER or ADMIN of the room, and the
 * S3 key is scoped to that room so members cannot overwrite each other's
 * uploads.
 */
router.post(
  "/presign",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user.id;

    await enforceRateLimit(res, presignLimiter, `presign:${userId}`);

    const parsed = unwrapParsed(avatarPresignSchema.safeParse(req.body));

    if (parsed.context === "room") {
      const membership = await prisma.chatRoomMember.findUnique({
        where: {
          userId_chatRoomId: {
            userId,
            chatRoomId: parsed.contextId!,
          },
        },
        select: { role: true },
      });
      if (!membership) {
        res.status(403).json({ ok: false, error: "Not a member of this room" });
        return;
      }
      if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
        res.status(403).json({
          ok: false,
          error: "Only owners and admins can change the room avatar",
        });
        return;
      }
    }

    const s3Service = getRequiredS3Service();
    const { s3Key, presignedUrl } = await presignAvatarUpload(
      s3Service,
      userId,
      parsed.context,
      parsed.contextId,
      parsed.mimeType,
    );

    log.info("Presigned avatar upload", {
      userId,
      context: parsed.context,
      contextId: parsed.contextId ?? null,
    });

    res.status(201).json({ ok: true, presignedUrl, s3Key });
  }),
);

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
