"use client";

// Typed client for the real backend REST + socket APIs.
//
// Server responses use the `{ ok: true, ... }` envelope; failures are thrown
// as Errors with a user-presentable message via getErrorMessage so callers can
// `try/catch` and toast the result uniformly.

import { api } from "../../app/lib/api";
import { socket } from "../../app/lib/socket";
import { getErrorMessage } from "../../app/lib/errors";
import { uploadAttachments } from "../../app/lib/attachments";
import type {
  Attachment,
  AppUser,
  Message,
  DMInboxEntry,
  RoomInboxEntry,
  RoomMember,
  Invitation,
  JoinRequest,
  JoinLink,
  ReadReceipt,
  SearchUser,
} from "./types";

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export const ChatAPI = {
  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  async getMe(): Promise<AppUser> {
    const { data } = await api.get("/auth/me");
    return data.user;
  },

  async logout(): Promise<void> {
    await api.post("/auth/logout");
  },

  async regenerateRecoveryCodes(currentPassword: string): Promise<string[]> {
    // The server never returns codes in a response body — it issues a
    // one-time token that must be exchanged via POST /auth/recovery-codes/show.
    // The shared `api` interceptor (lib/api.ts) attaches a fresh _csrf token
    // to every non-GET request.
    const { data } = await api.post("/auth/recovery-codes", {
      currentPassword,
    });
    const show = await api.post("/auth/recovery-codes/show", {
      token: data.recoveryToken,
    });
    return show.data.recoveryCodes;
  },

  /** Exchange a one-time token for the recovery codes (single-use). */
  async showRecoveryCodes(token: string): Promise<string[]> {
    const { data } = await api.post("/auth/recovery-codes/show", { token });
    return data.recoveryCodes;
  },

  // ---------------------------------------------------------------------------
  // Direct chats (REST)
  // ---------------------------------------------------------------------------

  async getDmInbox(): Promise<Paginated<DMInboxEntry>> {
    const { data } = await api.get("/dm/inbox");
    return { items: data.inbox, nextCursor: data.nextCursor };
  },

  async startDm(userId: string): Promise<{ id: string; created: boolean }> {
    const { data } = await api.post(`/dm/start-dm/${userId}`);
    return { id: data.chat.id, created: data.created };
  },

  async getDmMessages(
    directChatId: string,
    opts: { cursor?: string } = {},
  ): Promise<{ messages: Message[]; nextCursor: string | null }> {
    const { data } = await api.get(`/dm/${directChatId}/messages`, {
      params: opts,
    });
    return { messages: data.messages, nextCursor: data.nextCursor ?? null };
  },

  async sendDmMessage(
    directChatId: string,
    body: {
      content?: string;
      messageType: string;
      attachmentIds?: string[];
    },
  ): Promise<Message> {
    const { data } = await api.post(`/dm/${directChatId}/message`, {
      ...body,
      idempotencyKey: crypto.randomUUID(),
    });
    return data.result;
  },

  async editDmMessage(messageId: string, content: string): Promise<Message> {
    const { data } = await api.patch(`/dm/message/${messageId}`, { content });
    return data.message;
  },

  async deleteDmMessage(messageId: string): Promise<void> {
    await api.delete(`/dm/message/${messageId}`);
  },

  async markDmRead(
    directChatId: string,
    lastReadMessageId: string,
  ): Promise<number> {
    const { data } = await api.post(`/dm/${directChatId}/mark-read`, {
      lastReadMessageId,
    });
    return data.unreadCount;
  },

  /** The other participant's read cursor, or null if they haven't read yet. */
  async getDmReadReceipt(directChatId: string): Promise<ReadReceipt | null> {
    const { data } = await api.get(`/dm/${directChatId}/read-receipt`);
    return data.receipt;
  },

  // ---------------------------------------------------------------------------
  // Rooms (REST list/read, socket for messaging)
  // ---------------------------------------------------------------------------

  async getRooms(): Promise<Paginated<RoomInboxEntry>> {
    const { data } = await api.get("/room/rooms");
    return { items: data.rooms, nextCursor: data.nextCursor };
  },

  async createRoom(name: string, description?: string, avatarKey?: string) {
    const { data } = await api.post("/room/rooms", {
      name,
      description: description || null,
      ...(avatarKey ? { avatarKey } : {}),
    });
    return data.room as { id: string; name: string };
  },

  async getRoomMessages(
    chatRoomId: string,
    opts: { cursor?: string } = {},
  ): Promise<{ messages: Message[]; nextCursor: string | null }> {
    const { data } = await api.get(`/room/${chatRoomId}/messages`, {
      params: opts,
    });
    return { messages: data.messages, nextCursor: data.nextCursor ?? null };
  },

  async getRoomMembers(chatRoomId: string): Promise<RoomMember[]> {
    const { data } = await api.get(`/room/${chatRoomId}/members`);
    return data.members;
  },

  async markRoomRead(
    chatRoomId: string,
    lastReadMessageId: string,
  ): Promise<number> {
    const { data } = await api.post(`/room/${chatRoomId}/mark-read`, {
      lastReadMessageId,
    });
    return data.unreadCount;
  },

  /** Every member's read cursor for the room. */
  async getRoomReadReceipts(chatRoomId: string): Promise<ReadReceipt[]> {
    const { data } = await api.get(`/room/${chatRoomId}/read-receipts`);
    return data.receipts;
  },

  async inviteToRoom(roomId: string, targetUserId: string): Promise<void> {
    await api.post(`/room/${roomId}/invitations`, { targetUserId });
  },

  async invitationsReceived(): Promise<Invitation[]> {
    const { data } = await api.get("/room/invitation/received");
    return data.invitations;
  },

  async invitationsSent(): Promise<Invitation[]> {
    const { data } = await api.get("/room/invitation/sent");
    return data.invitations;
  },

  async respondInvitation(
    invitationId: string,
    status: "ACCEPTED" | "REJECTED",
  ): Promise<void> {
    await api.patch(`/room/invitations/${invitationId}`, { status });
  },

  async getJoinRequests(chatRoomId: string): Promise<JoinRequest[]> {
    const { data } = await api.get(`/room/${chatRoomId}/join-requests`);
    return data.requests;
  },

  async respondJoinRequest(
    chatRoomId: string,
    requestId: string,
    action: "APPROVED" | "REJECTED",
  ): Promise<void> {
    await api.patch(`/room/${chatRoomId}/join-requests/${requestId}`, {
      action,
    });
  },

  async createJoinLink(chatRoomId: string): Promise<JoinLink> {
    const { data } = await api.post(`/room/${chatRoomId}/join-links`, {});
    return data.link;
  },

  async myJoinLinks(): Promise<JoinLink[]> {
    const { data } = await api.get("/room/join-links/mine");
    return data.links;
  },

  async deactivateJoinLink(chatRoomId: string, linkId: string): Promise<void> {
    await api.patch(`/room/${chatRoomId}/join-links/${linkId}`, {});
  },

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  async searchUsers(query: string): Promise<SearchUser[]> {
    const { data } = await api.get("/search/users/search", {
      params: { query, limit: 20 },
    });
    return data.users;
  },

  // ---------------------------------------------------------------------------
  // Attachments
  // ---------------------------------------------------------------------------

  async upload(
    context: "dm" | "room",
    contextId: string,
    files: FileList,
  ): Promise<{ attachmentIds: string[]; messageType: string }> {
    return uploadAttachments(context, contextId, files);
  },

  /** Resolve a short-lived download URL for an attachment. */
  async getAttachmentUrl(attachmentId: string): Promise<string> {
    const { data } = await api.get(`/attachments/${attachmentId}`);
    return data.downloadUrl;
  },

  // ---------------------------------------------------------------------------
  // Default avatars
  // ---------------------------------------------------------------------------

  /** Fetch available default avatars for 'user' or 'room' from S3. */
  async getDefaultAvatars(
    source: "user" | "room",
  ): Promise<{ key: string; url: string }[]> {
    const { data } = await api.get(`/defaults/avatars?source=${source}`);
    return data.avatars;
  },

  /**
   * Request a presigned PUT URL for an avatar upload.
   *
   * Never modifies the database — the returned `s3Key` is associated with
   * the user or room by the subsequent updateMyAvatar/updateRoomAvatar call.
   */
  async presignAvatar(
    context: "user" | "room",
    file: { name: string; type: string; size: number },
    contextId?: string,
  ): Promise<{ presignedUrl: string; s3Key: string }> {
    const { data } = await api.post("/avatars/presign", {
      context,
      ...(contextId ? { contextId } : {}),
      filename: file.name,
      mimeType: file.type,
      size: file.size,
    });
    return { presignedUrl: data.presignedUrl, s3Key: data.s3Key };
  },

  /** Update the authenticated user's avatar to a default or custom S3 key. */
  async updateMyAvatar(avatarKey: string): Promise<void> {
    await api.patch("/auth/me/avatar", { avatarKey });
  },

  /** Update a room's avatar (OWNER/ADMIN only). */
  async updateRoomAvatar(chatRoomId: string, avatarKey: string): Promise<void> {
    await api.patch(`/room/${chatRoomId}/avatar`, { avatarKey });
  },
};

// ---------------------------------------------------------------------------
// Socket helpers (typed emit + ack for room messaging)
// ---------------------------------------------------------------------------

export interface AckResult {
  ok: boolean;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

/** Send a room-socket event and await Socket.IO's native ack callback. */
export function emitRoomAck<T extends AckResult>(
  event: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res: T) => {
      if (res?.ok) resolve(res);
      else reject(new Error(res?.error || "Request failed"));
    });
  });
}

/** Promise-wrapped room operations used by the composer. */
export const RoomSocket = {
  send(
    chatRoomId: string,
    body: { content?: string; messageType: string; attachmentIds?: string[] },
  ) {
    return emitRoomAck<AckResult & { message?: Message }>("chatroom:message", {
      chatRoomId,
      content: body.content,
      messageType: body.messageType,
      attachmentIds: body.attachmentIds,
      idempotencyKey: crypto.randomUUID(),
    });
  },
  edit(chatRoomId: string, messageId: string, content: string) {
    return emitRoomAck("chatroom:message:edit", {
      chatRoomId,
      messageId,
      content,
    });
  },
  remove(chatRoomId: string, messageId: string) {
    return emitRoomAck("chatroom:message:delete", { chatRoomId, messageId });
  },
};

export { getErrorMessage };
export type { Attachment };
