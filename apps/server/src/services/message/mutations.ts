import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";

/**
 * Field that scopes a message to its conversation: a chat room, a direct chat,
 * or a room channel. All contexts share the `Message` table, so the only
 * difference between the mutations is which scope column is read back.
 */
export type MessageScopeField = "chatRoomId" | "directChatId" | "channelId";

/** The scope column plus the fields each mutation reads back. */
type Scoped<F extends MessageScopeField> = { [K in F]: string | null };

export type EditedMessage<F extends MessageScopeField> = Scoped<F> & {
  id: string;
  content: string | null;
  editedAt: Date | null;
};

export type DeletedMessage<F extends MessageScopeField> = Scoped<F> & {
  id: string;
  deletedAt: Date | null;
  /** Attachment ids that must be purged (S3 + DB) once the delete commits. */
  attachments: { id: string }[];
};

/**
 * Literal content stored in place of a deleted message's original text.
 * The original text is permanently gone; the row survives as a history marker.
 */
export const DELETED_MESSAGE_CONTENT = "deleted";

/**
 * Edit a message within the edit window.
 *
 * Authorization checks:
 * - Message must exist and not be soft-deleted
 * - Only the original sender may edit
 * - Edits are rejected after `editWindowMs`
 *
 * Returns the updated message with id, content, editedAt and the scope field.
 */
export async function editMessageInScope<F extends MessageScopeField>(
  userId: string,
  messageId: string,
  content: string,
  {
    scopeField,
    scopeId,
    editWindowMs,
  }: { scopeField: F; scopeId?: string; editWindowMs: number },
): Promise<EditedMessage<F>> {
  await assertMutable(userId, messageId, {
    scopeField,
    scopeId,
    windowMs: editWindowMs,
    kind: "edit",
  });

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    select: {
      id: true,
      content: true,
      editedAt: true,
      [scopeField]: true,
    } as Prisma.MessageSelect,
  });

  return updated as unknown as EditedMessage<F>;
}

/**
 * Soft-delete a message within the delete window.
 *
 * Authorization checks:
 * - Message must exist
 * - Only the original sender may delete
 * - Already-deleted messages are rejected with 400
 * - Deletes are rejected after `deleteWindowMs`
 *
 * Returns the deleted message stub with id, deletedAt and the scope field.
 */
export async function deleteMessageInScope<F extends MessageScopeField>(
  userId: string,
  messageId: string,
  {
    scopeField,
    scopeId,
    deleteWindowMs,
  }: { scopeField: F; scopeId?: string; deleteWindowMs: number },
): Promise<DeletedMessage<F>> {
  await assertMutable(userId, messageId, {
    scopeField,
    scopeId,
    windowMs: deleteWindowMs,
    kind: "delete",
  });

  // Permanently replace the original text with a placeholder and soft-delete
  // the row so the "deleted" marker (history) survives. The UI relies on
  // isDeleted / deletedAt to render the marker and never shows the placeholder.
  const deleted = await prisma.message.update({
    where: { id: messageId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      content: DELETED_MESSAGE_CONTENT,
    },
    select: {
      id: true,
      deletedAt: true,
      [scopeField]: true,
      attachments: { select: { id: true } },
    } as Prisma.MessageSelect,
  });

  return deleted as unknown as DeletedMessage<F>;
}

/**
 * Edit and delete report the same failure modes with slightly different
 * wording and codes, so the responses live in one table per mutation kind.
 */
const MUTATION_ERRORS = {
  edit: {
    notFound: "message not found or already deleted",
    forbidden: "not allowed",
    windowExpired: "Edit window expired",
    windowExpiredCode: "EDIT_WINDOW_EXPIRED",
    /** A soft-deleted message is indistinguishable from a missing one. */
    deletedIsNotFound: true,
  },
  delete: {
    notFound: "Message not found",
    forbidden: "Not allowed",
    windowExpired: "Delete window expired",
    windowExpiredCode: "DELETE_WINDOW_EXPIRED",
    deletedIsNotFound: false,
  },
} as const;

/** Shared ownership / lifecycle guard for message mutations. */
async function assertMutable(
  userId: string,
  messageId: string,
  {
    scopeField,
    scopeId,
    windowMs,
    kind,
  }: {
    scopeField: MessageScopeField;
    scopeId?: string;
    windowMs: number;
    kind: keyof typeof MUTATION_ERRORS;
  },
): Promise<void> {
  const errors = MUTATION_ERRORS[kind];

  const msg = scopeId
    ? await prisma.message.findFirst({
        where: { id: messageId, [scopeField]: scopeId },
        select: {
          id: true,
          senderId: true,
          isDeleted: true,
          createdAt: true,
        },
      })
    : await prisma.message.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          senderId: true,
          isDeleted: true,
          createdAt: true,
        },
      });

  if (!msg || (errors.deletedIsNotFound && msg.isDeleted)) {
    throw new ApiError(errors.notFound, 404, "MESSAGE_NOT_FOUND");
  }

  if (msg.senderId !== userId) {
    throw new ApiError(errors.forbidden, 403, "FORBIDDEN");
  }

  if (msg.isDeleted) {
    throw new ApiError("Already deleted", 400, "ALREADY_DELETED");
  }

  if (Date.now() - new Date(msg.createdAt).getTime() > windowMs) {
    throw new ApiError(errors.windowExpired, 403, errors.windowExpiredCode);
  }
}
