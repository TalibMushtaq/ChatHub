// src/routes/health.ts
import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler";
import { getOptionalS3Service } from "../lib/s3";
import { createLogger } from "../lib/logger";
import { HeadBucketCommand } from "@aws-sdk/client-s3";

const log = createLogger("health");
const router = Router();

/**
 * GET /api/health
 * Returns basic server health and optionally tests S3 connectivity.
 * If S3 is configured, it performs a HeadBucket call to ensure the bucket is reachable.
 */
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const s3Service = getOptionalS3Service();
    let s3Status = "disabled";
    if (s3Service) {
      try {
        // Perform a lightweight bucket health check.
        await s3Service
          .getClient()
          .send(new HeadBucketCommand({ Bucket: s3Service.getBucket() }));
        s3Status = "ok";
        log.info("S3 connection test succeeded");
      } catch (err: unknown) {
        s3Status = "error";
        log.error("S3 connection test failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    res.json({ ok: true, s3: s3Status });
  }),
);

export default router;
