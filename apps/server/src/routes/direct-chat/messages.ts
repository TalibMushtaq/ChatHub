import { Router } from "express";
import requireAuth from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/async-handler";
import { assertDirectChatAccess } from "../../middleware/socketAccess";
import { sendMessage } from "../../services/direct-chat/sendMessage";
import { getMessages } from "../../services/direct-chat/getMessages";
import { editMessage } from "../../services/direct-chat/editMessage";
import { deleteMessage } from "../../services/direct-chat/deleteMessage";
import { createRateLimiter, setRateLimitHeaders } from "../../lib/rateLimiter";
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

    const params = directChatIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ ok: false, error: "directChatId missing" });
      return;
    }
    const directChatId = params.data.directChatId;

    // Params are cheap to validate; rate-limit afterwards so we charge
    // the limiter only for structurally valid requests.
    const rate = await messageLimiter(`msg:${senderId}`);
    setRateLimitHeaders(res, rate);
    if (!rate.allowed) {
      res.status(429).json({ ok: false, error: "Rate limit exceeded" });
      return;
    }

    const body = sendMessageSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        ok: false,
        error: body.error.issues[0]?.message ?? "Invalid input",
      });
      return;
    }

    await assertDirectChatAccess(senderId, directChatId);

    const result = await sendMessage(directChatId, senderId, body.data.content);
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

    const params = directChatIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ ok: false, error: "chat not found" });
      return;
    }
    const directChatId = params.data.directChatId;

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

    const params = messageIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ ok: false, error: "Message not found" });
      return;
    }
    const messageId = params.data.messageId;

    const rate = await editDeleteLimiter(`edit:${userId}`);
    setRateLimitHeaders(res, rate);
    if (!rate.allowed) {
      res.status(429).json({ ok: false, error: "Rate limit exceeded" });
      return;
    }

    const body = editMessageSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        ok: false,
        error: body.error.issues[0]?.message ?? "Invalid input",
      });
      return;
    }

    const updated = await editMessage(userId, messageId, body.data.content);

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

    const params = messageIdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(404).json({ ok: false, error: "Message not found" });
      return;
    }
    const messageId = params.data.messageId;

    const rate = await editDeleteLimiter(`del:${userId}`);
    setRateLimitHeaders(res, rate);
    if (!rate.allowed) {
      res.status(429).json({ ok: false, error: "Rate limit exceeded" });
      return;
    }

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
