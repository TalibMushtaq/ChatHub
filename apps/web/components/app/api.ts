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
    const { data } = await api.post("/auth/recovery-codes", {
      currentPassword,
    });
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
  ): Promise<Message[]> {
    const { data } = await api.get(`/dm/${directChatId}/messages`, {
      params: opts,
    });
    return data.messages;
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

  // ---------------------------------------------------------------------------
  // Rooms (REST list/read, socket for messaging)
  // ---------------------------------------------------------------------------

  async getRooms(): Promise<Paginated<RoomInboxEntry>> {
    const { data } = await api.get("/room/rooms");
    return { items: data.rooms, nextCursor: data.nextCursor };
  },

  async createRoom(name: string, description?: string) {
    const { data } = await api.post("/room/rooms", {
      name,
      description: description || null,
    });
    return data.room as { id: string; name: string };
  },

  async getRoomMessages(
    chatRoomId: string,
    opts: { cursor?: string } = {},
  ): Promise<Message[]> {
    const { data } = await api.get(`/room/${chatRoomId}/messages`, {
      params: opts,
    });
    return data.messages;
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

/** Send a `{ payload, callback }` room-socket event and await the ack. */
export function emitRoomAck<T extends AckResult>(
  event: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, {
      payload,
      callback: (res: T) => {
        if (res?.ok) resolve(res);
        else reject(new Error(res?.error || "Request failed"));
      },
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
