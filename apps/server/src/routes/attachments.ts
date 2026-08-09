import { Router } from "express";
import requireAuth from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/async-handler";
import { createRateLimiter, enforceRateLimit } from "../lib/rateLimiter";
import { unwrapParsed } from "../lib/validate";
import { presignSchema, attachmentIdParamSchema } from "@repo/validators";
import { getRequiredS3Service } from "../lib/s3";
import { createPendingAttachment } from "../services/attachment/createPending";
import { getAttachmentWithAccessCheck } from "../services/attachment/getWithAccessCheck";
import { deleteAttachment } from "../services/attachment/deleteAttachment";
import { assertUploadContextAccess } from "../services/attachment/assertContextAccess";

const presignLimiter = createRateLimiter({
  maxAttempts: 30,
  windowMs: 60_000,
  prefix: "attach:presign",
});

const router = Router();

// POST /attachments/presign
router.post(
  "/presign",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    await enforceRateLimit(res, presignLimiter, `presign:${userId}`);

    const parsed = unwrapParsed(presignSchema.safeParse(req.body));

    await assertUploadContextAccess(userId, parsed.context, parsed.contextId);

    const s3Service = getRequiredS3Service();
    const { attachment, presignedUrl } = await createPendingAttachment(
      s3Service,
      userId,
      parsed.context,
      parsed.contextId,
      parsed.filename,
      parsed.mimeType,
      parsed.size,
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

    const { attachmentId } = unwrapParsed(
      attachmentIdParamSchema.safeParse(req.params),
      { status: 404, message: "Attachment not found" },
    );

    const s3Service = getRequiredS3Service();
    const result = await getAttachmentWithAccessCheck(
      s3Service,
      attachmentId,
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

    const { attachmentId } = unwrapParsed(
      attachmentIdParamSchema.safeParse(req.params),
      { status: 404, message: "Attachment not found" },
    );

    const s3Service = getRequiredS3Service();
    await deleteAttachment(s3Service, attachmentId, userId);

    res.json({ ok: true });
  }),
);

export default router;
