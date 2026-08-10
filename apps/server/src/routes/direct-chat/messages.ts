import { Router } from "express";
import requireAuth from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/async-handler";
import { assertDirectChatAccess } from "../../middleware/socketAccess";
import { sendMessage } from "../../services/direct-chat/sendMessage";
import { getMessages } from "../../services/direct-chat/getMessages";
import { editMessage } from "../../services/direct-chat/editMessage";
import { deleteMessage } from "../../services/direct-chat/deleteMessage";
import { createRateLimiter, enforceRateLimit } from "../../lib/rateLimiter";
import { unwrapParsed } from "../../lib/validate";
import type { S3Service } from "../../services/S3Service";
import { getRequiredS3Service } from "../../lib/s3";
import { MessageType } from "@prisma/client";
import {
  sendMessageSchema,
  getMessagesSchema,
  editMessageSchema,
  messageIdParamSchema,
  directChatIdParamSchema,
} from "@repo/validators";

const messageLimiter = createRateLimiter({
  maxAttempts: 120,
  windowMs: 60_000,
  prefix: "dm:msg",
});

const editDeleteLimiter = createRateLimiter({
  maxAttempts: 30,
  windowMs: 60_000,
  prefix: "dm:editdel",
});

const router = Router();

// POST /:directChatId/message
router.post(
  "/:directChatId/message",
  requireAuth,
  asyncHandler(async (req, res) => {
    const senderId = req.user.id;

    const { directChatId } = unwrapParsed(
      directChatIdParamSchema.safeParse(req.params),
      { message: "directChatId missing" },
    );

    // Params are cheap to validate; rate-limit afterwards so we charge
    // the limiter only for structurally valid requests.
    await enforceRateLimit(res, messageLimiter, `msg:${senderId}`);

    const body = unwrapParsed(sendMessageSchema.safeParse(req.body));

    await assertDirectChatAccess(senderId, directChatId);

    const hasAttachments = body.attachmentIds && body.attachmentIds.length > 0;

    // Only initialize S3 when attachments are present — text-only messages
    // work without S3 configuration.
    const s3Service: S3Service | null = hasAttachments
      ? getRequiredS3Service("File uploads require S3 configuration")
      : null;

    const result = await sendMessage(
      directChatId,
      senderId,
      {
        content: body.content,
        messageType: body.messageType as MessageType,
        attachmentIds: body.attachmentIds,
        idempotencyKey: body.idempotencyKey,
      },
      s3Service as S3Service,
    );
    // Emit only after DB commit succeeds: if the transaction rolls back,
    // clients must not see a ghost message.
    req.io
      .to(`directChat:${directChatId}`)
      .emit("inbox:update", { directChatId });
    req.io.to(`directChat:${directChatId}`).emit("message:new", result);
    res.status(201).json({ ok: true, result });
  }),
);

// GET /:directChatId/messages
router.get(
  "/:directChatId/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { directChatId } = unwrapParsed(
      directChatIdParamSchema.safeParse(req.params),
      { status: 404, message: "chat not found" },
    );

    await assertDirectChatAccess(userId, directChatId);

    const query = getMessagesSchema.safeParse(req.query);
    const { cursor, limit, direction } = query.success ? query.data : {};

    const { messages } = await getMessages(directChatId, {
      cursor,
      limit,
      direction,
    });
    res.json({ ok: true, messages });
  }),
);

// PATCH /message/:messageId
router.patch(
  "/message/:messageId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { messageId } = unwrapParsed(
      messageIdParamSchema.safeParse(req.params),
      { status: 404, message: "Message not found" },
    );

    await enforceRateLimit(res, editDeleteLimiter, `edit:${userId}`);

    const body = unwrapParsed(editMessageSchema.safeParse(req.body));

    const updated = await editMessage(userId, messageId, body.content);

    // Emit only after the edit commits so clients never see a stale
    // message body paired with a new editedAt timestamp.
    if (updated.directChatId) {
      req.io.to(`directChat:${updated.directChatId}`).emit("message:edited", {
        messageId: updated.id,
        directChatId: updated.directChatId,
        content: updated.content,
        editedAt: updated.editedAt,
      });
      req.io
        .to(`directChat:${updated.directChatId}`)
        .emit("inbox:update", { directChatId: updated.directChatId });
    }

    res.json({ ok: true, message: updated });
  }),
);

// DELETE /message/:messageId
router.delete(
  "/message/:messageId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { messageId } = unwrapParsed(
      messageIdParamSchema.safeParse(req.params),
      { status: 404, message: "Message not found" },
    );

    await enforceRateLimit(res, editDeleteLimiter, `del:${userId}`);

    const deleted = await deleteMessage(userId, messageId);

    // Emit only after soft-delete commits so the client doesn't render
    // a deletion marker for a message that is still live in the DB.
    if (deleted.directChatId) {
      req.io.to(`directChat:${deleted.directChatId}`).emit("message:deleted", {
        messageId: deleted.id,
        directChatId: deleted.directChatId,
        deletedAt: deleted.deletedAt,
      });
    }

    res.json({ ok: true });
  }),
);

export default router;
