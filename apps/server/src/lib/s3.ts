import { S3Service, buildS3ConfigFromEnv } from "../services/S3Service";
import { ApiError } from "./ApiError";

/**
 * Process-wide lazily initialized S3Service.
 *
 * Routes and socket handlers share one instance so credentials and the
 * underlying SDK client are resolved once per process.
 */
let s3ServiceInstance: S3Service | null = null;

/**
 * Returns the shared S3Service, or null when S3 env vars are missing —
 * callers decide whether that is acceptable (text-only messages) or an
 * error (file uploads).
 */
export function getOptionalS3Service(): S3Service | null {
  if (!s3ServiceInstance) {
    const config = buildS3ConfigFromEnv();
    if (!config) return null;
    s3ServiceInstance = new S3Service(config);
  }
  return s3ServiceInstance;
}

/** Returns the shared S3Service or throws a 503 when S3 is not configured. */
export function getRequiredS3Service(
  message = "S3 storage is not configured. Please set AWS_REGION and AWS_S3_BUCKET_NAME.",
): S3Service {
  const service = getOptionalS3Service();
  if (!service) {
    throw new ApiError(message, 503, "S3_NOT_CONFIGURED");
  }
  return service;
}
