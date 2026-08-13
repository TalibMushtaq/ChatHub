import { Router } from "express";
import requireAuth from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/async-handler";
import { getRequiredS3Service } from "../lib/s3";
import { createRateLimiter, enforceRateLimit } from "../lib/rateLimiter";
import { createLogger } from "../lib/logger";
import { z } from "zod";

const log = createLogger("defaults");
const router = Router();

const listLimiter = createRateLimiter({
  maxAttempts: 60,
  windowMs: 60_000,
  prefix: "defaults:list",
});

const sourceSchema = z.enum(["user", "room"]);

/**
 * GET /defaults/avatars?source=user|room
 *
 * Returns a list of available default avatars from S3 with presigned GET URLs.
 *
 * Avatar keys follow the pattern: defaults/{source}/{filename}.png
 * The frontend can use these presigned URLs directly to display and select
 * a default avatar without any uploads.
 *
 * Returns:
 *   { ok: true, avatars: Array<{ key: string; url: string }> }
 */
router.get(
  "/avatars",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    await enforceRateLimit(res, listLimiter, `defaults:list:${userId}`);

    const parsed = sourceSchema.safeParse(req.query.source);
    if (!parsed.success) {
      res
        .status(400)
        .json({ ok: false, error: "source must be 'user' or 'room'" });
      return;
    }

    const source = parsed.data;
    const prefix = `defaults/${source}/`;

    const s3Service = getRequiredS3Service();

    let keys: string[];
    try {
      keys = await s3Service.listObjects(prefix);
    } catch (err) {
      log.error("Failed to list default avatars from S3", {
        source,
        error: err,
      });
      res
        .status(500)
        .json({ ok: false, error: "Failed to list default avatars" });
      return;
    }

    // Filter to only .png files and exclude the prefix directory key itself
    const avatarKeys = keys.filter((k) => k !== prefix && k.endsWith(".png"));

    // Sort for deterministic ordering
    avatarKeys.sort();

    // Generate presigned GET URLs for each avatar
    const avatars = await Promise.all(
      avatarKeys.map(async (key) => {
        const url = await s3Service.generatePresignedGetUrl(
          key,
          // 1 hour TTL — long enough for a registration flow without hammering S3
          3600,
        );
        return { key, url };
      }),
    );

    log.info("Listed default avatars", { source, count: avatars.length });

    res.json({ ok: true, avatars });
  }),
);

export default router;
