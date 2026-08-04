import { Router } from "express";
import requireAuth from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/async-handler";
import { createRateLimiter, setRateLimitHeaders } from "../lib/rateLimiter";
import { presignSchema, attachmentIdParamSchema } from "@repo/validators";
import { S3Service, buildS3ConfigFromEnv } from "../services/S3Service";
import { createPendingAttachment } from "../services/attachment/createPending";
import { getAttachmentWithAccessCheck } from "../services/attachment/getWithAccessCheck";
import { deleteAttachment } from "../services/attachment/deleteAttachment";
import { ApiError } from "../lib/ApiError";

const presignLimiter = createRateLimiter({
  maxAttempts: 30,
  windowMs: 60_000,
  prefix: "attach:presign",
});

const router = Router();

// Lazily initialized S3Service (singleton per process)
let s3ServiceInstance: S3Service | null = null;
function getS3Service(): S3Service {
  if (!s3ServiceInstance) {
    const config = buildS3ConfigFromEnv();
    if (!config) {
      throw new ApiError(
        "S3 storage is not configured. Please set AWS_REGION and AWS_S3_BUCKET_NAME.",
        503,
        "S3_NOT_CONFIGURED",
      );
    }
    s3ServiceInstance = new S3Service(config);
  }
  return s3ServiceInstance;
}

// POST /attachments/presign
router.post(
  "/presign",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const rate = await presignLimiter(`presign:${userId}`);
    setRateLimitHeaders(res, rate);
    if (!rate.allowed) {
      res.status(429).json({ ok: false, error: "Rate limit exceeded" });
      return;
    }

    const parsed = presignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      });
      return;
    }

    const s3Service = getS3Service();
    const { attachment, presignedUrl } = await createPendingAttachment(
      s3Service,
      userId,
      parsed.data.context,
      parsed.data.contextId,
      parsed.data.filename,
      parsed.data.mimeType,
      parsed.data.size,
    );

    res.status(201).json({
      ok: true,
      attachmentId: attachment.id,
      presignedUrl,
      s3Key: attachment.s3Key,
    });
  }),
);

// GET /attachments/:attachmentId
router.get(
  "/:attachmentId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const params = attachmentIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ ok: false, error: "Attachment not found" });
      return;
    }

    const s3Service = getS3Service();
    const result = await getAttachmentWithAccessCheck(
      s3Service,
      params.data.attachmentId,
      userId,
    );

    res.json({
      ok: true,
      downloadUrl: result.downloadUrl,
      ...result.attachment,
    });
  }),
);

// DELETE /attachments/:attachmentId
router.delete(
  "/:attachmentId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const params = attachmentIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ ok: false, error: "Attachment not found" });
      return;
    }

    const s3Service = getS3Service();
    await deleteAttachment(s3Service, params.data.attachmentId, userId);

    res.json({ ok: true });
  }),
);

export default router;
