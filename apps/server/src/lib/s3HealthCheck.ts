// src/lib/s3HealthCheck.ts
import { getOptionalS3Service } from "./s3";
import { createLogger } from "./logger";
import { HeadBucketCommand } from "@aws-sdk/client-s3";

const log = createLogger("s3HealthCheck");

/**
 * Performs a lightweight S3 bucket health check (`HeadBucket`).
 * Logs the outcome. Returns `true` if the bucket responded, `false` otherwise.
 */
export async function testS3Connection(): Promise<boolean> {
  const s3Service = getOptionalS3Service();
  if (!s3Service) {
    log.info("S3 not configured – health check skipped");
    return false;
  }
  try {
    await s3Service
      .getClient()
      .send(new HeadBucketCommand({ Bucket: s3Service.getBucket() }));
    log.info("S3 connection test succeeded (startup)");
    return true;
  } catch (err: unknown) {
    log.error("S3 connection test failed (startup)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
