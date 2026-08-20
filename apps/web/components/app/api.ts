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
  Gender,
  Message,
  DMInboxEntry,
  RoomInboxEntry,
  RoomMember,
  Invitation,
  JoinRequest,
  JoinLink,
  ReadReceipt,
  SearchUser,
  UserStatus,
  FriendRequest,
  BlockedUser,
  UserProfile,
  Channel,
  Category,
  ChannelType,
  RoomDetail,
  RoomBan,
  RoomRole,
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

  async checkUsername(username: string): Promise<boolean> {
    const { data } = await api.get("/auth/check-username", {
      params: { username },
    });
    return data.available as boolean;
  },

  async updateMe(payload: {
    displayName?: string | null;
    bio?: string | null;
    gender?: Gender | null;
    dateOfBirth?: string | null;
  }): Promise<AppUser> {
    const { data } = await api.patch("/auth/me", payload);
    return data.user;
  },

  /** Change the manual status/custom status. Returns the updated subset. */
  async updateStatus(payload: {
    status?: UserStatus;
    customStatus?: string | null;
  }): Promise<Pick<AppUser, "id" | "status" | "customStatus">> {
    const { data } = await api.patch("/auth/me/status", payload);
    return data.user;
  },

  /** Toggle which presence info is shared with others. Returns the subset. */
  async updatePrivacy(payload: {
    showOnlineStatus?: boolean;
    showTypingStatus?: boolean;
  }): Promise<Pick<AppUser, "id" | "showOnlineStatus" | "showTypingStatus">> {
    const { data } = await api.patch("/auth/me/privacy", payload);
    return data.user;
  },

  async logout(): Promise<void> {
    await api.post("/auth/logout");
  },

  // ---------------------------------------------------------------------------
  // Web Push
  // ---------------------------------------------------------------------------

  /** Register (or refresh) the browser's push subscription with the server. */
  async subscribePush(payload: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }): Promise<void> {
    await api.post("/push/subscribe", payload);
  },

  /** Remove the browser's push subscription from the server. */
  async unsubscribePush(endpoint: string): Promise<void> {
    await api.delete("/push/subscribe", { data: { endpoint } });
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
    roomId: string,
    opts: { cursor?: string; channelId?: string } = {},
  ): Promise<{ messages: Message[]; nextCursor: string | null }> {
    const { data } = await api.get(`/room/${roomId}/messages`, {
      params: opts,
    });
    return { messages: data.messages, nextCursor: data.nextCursor ?? null };
  },

  /** Channel-scoped history (preferred form for the Phase 2 sidebar). */
  async getChannelMessages(
    roomId: string,
    channelId: string,
    opts: { cursor?: string } = {},
  ): Promise<{ messages: Message[]; nextCursor: string | null }> {
    const { data } = await api.get(
      `/room/${roomId}/channels/${channelId}/messages`,
      {
        params: opts,
      },
    );
    return { messages: data.messages, nextCursor: data.nextCursor ?? null };
  },

  /** Room detail with the full category → channel structure. */
  async getRoomDetail(roomId: string): Promise<RoomDetail> {
    const { data } = await api.get(`/room/rooms/${roomId}`);
    return data.room;
  },

  async updateRoom(
    roomId: string,
    payload: {
      name?: string;
      description?: string | null;
      avatarKey?: string | null;
    },
  ): Promise<{ id: string; name: string }> {
    const { data } = await api.patch(`/room/rooms/${roomId}`, payload);
    return data.room;
  },

  async deleteRoom(roomId: string): Promise<void> {
    await api.delete(`/room/rooms/${roomId}`);
  },

  /** Remove the current user's own membership (owner blocked server-side). */
  async leaveRoom(roomId: string): Promise<void> {
    await api.post(`/room/rooms/${roomId}/leave`);
  },

  async getRoomMemberNotificationPref(
    roomId: string,
  ): Promise<{ ok: boolean; notificationPref: "ALL" | "MENTIONS" | "MUTED" }> {
    const { data } = await api.get(`/room/rooms/${roomId}/notification-prefs`);
    return data;
  },

  async updateRoomNotificationPref(
    roomId: string,
    notificationPref: "ALL" | "MENTIONS" | "MUTED",
  ): Promise<{ ok: boolean; notificationPref: "ALL" | "MENTIONS" | "MUTED" }> {
    const { data } = await api.patch(
      `/room/rooms/${roomId}/notification-prefs`,
      {
        notificationPref,
      },
    );
    return data;
  },

  async getRoomMembers(roomId: string): Promise<RoomMember[]> {
    const { data } = await api.get(`/room/${roomId}/members`);
    return data.members;
  },

  // ---------------------------------------------------------------------------
  // Member management (Phase 4 §8)
  // ---------------------------------------------------------------------------

  /** Assign/change a member's role (owner-only server-side). */
  async changeMemberRole(
    roomId: string,
    userId: string,
    role: RoomRole,
  ): Promise<RoomMember> {
    const { data } = await api.patch(`/room/${roomId}/members/${userId}/role`, {
      role,
    });
    return data.member;
  },

  /** Kick a member from the room. */
  async kickMember(roomId: string, userId: string): Promise<void> {
    await api.post(`/room/${roomId}/members/${userId}/kick`);
  },

  /** Ban a member (kicks them + records the ban). */
  async banMember(
    roomId: string,
    userId: string,
    reason?: string,
  ): Promise<void> {
    await api.post(`/room/${roomId}/members/${userId}/ban`, {
      reason: reason || null,
    });
  },

  /** Lift a ban (the user must rejoin via invite/link). */
  async unbanMember(roomId: string, userId: string): Promise<void> {
    await api.delete(`/room/${roomId}/members/${userId}/ban`);
  },

  /** List the room's bans. */
  async getRoomBans(roomId: string): Promise<RoomBan[]> {
    const { data } = await api.get(`/room/${roomId}/bans`);
    return data.bans;
  },

  /** Mute a member for `durationMinutes` (1–43200). */
  async muteMember(
    roomId: string,
    userId: string,
    durationMinutes: number,
  ): Promise<RoomMember> {
    const { data } = await api.post(`/room/${roomId}/members/${userId}/mute`, {
      durationMinutes,
    });
    return data.member;
  },

  /** Unmute a member. */
  async unmuteMember(roomId: string, userId: string): Promise<RoomMember> {
    const { data } = await api.delete(`/room/${roomId}/members/${userId}/mute`);
    return data.member;
  },

  /** Set (or clear with null) a member's per-room nickname. */
  async setMemberNickname(
    roomId: string,
    userId: string,
    nickname: string | null,
  ): Promise<RoomMember> {
    const { data } = await api.patch(
      `/room/${roomId}/members/${userId}/nickname`,
      { nickname },
    );
    return data.member;
  },

  async markRoomRead(
    roomId: string,
    lastReadMessageId: string,
  ): Promise<number> {
    const { data } = await api.post(`/room/${roomId}/mark-read`, {
      lastReadMessageId,
    });
    return data.unreadCount;
  },

  /** Per-channel read cursor (Phase 6 §10.1). */
  async markChannelRead(
    roomId: string,
    channelId: string,
    lastReadMessageId: string,
  ): Promise<{ unreadCount: number }> {
    const { data } = await api.post(
      `/room/${roomId}/channels/${channelId}/mark-read`,
      { lastReadMessageId },
    );
    return { unreadCount: data.unreadCount };
  },

  /** The calling user's own read cursor for a channel. */
  async getChannelReadReceipt(
    roomId: string,
    channelId: string,
  ): Promise<ReadReceipt | null> {
    const { data } = await api.get(
      `/room/${roomId}/channels/${channelId}/read-receipt`,
    );
    return data.receipt;
  },

  /** Every member's read cursor for the room. */
  async getRoomReadReceipts(roomId: string): Promise<ReadReceipt[]> {
    const { data } = await api.get(`/room/${roomId}/read-receipts`);
    return data.receipts;
  },

  // ---------------------------------------------------------------------------
  // Channels + categories (Phase 1 backend; UI lands in Phase 2/3)
  // ---------------------------------------------------------------------------

  async getChannels(roomId: string): Promise<Channel[]> {
    const { data } = await api.get(`/room/rooms/${roomId}/channels`);
    return data.channels;
  },

  async createChannel(
    roomId: string,
    payload: {
      name: string;
      type?: ChannelType;
      topic?: string | null;
      categoryId?: string | null;
    },
  ): Promise<Channel> {
    const { data } = await api.post(`/room/rooms/${roomId}/channels`, payload);
    return data.channel;
  },

  async updateChannel(
    roomId: string,
    channelId: string,
    payload: {
      name?: string;
      topic?: string | null;
      categoryId?: string | null;
      position?: number;
    },
  ): Promise<Channel> {
    const { data } = await api.patch(
      `/room/rooms/${roomId}/channels/${channelId}`,
      payload,
    );
    return data.channel;
  },

  async deleteChannel(roomId: string, channelId: string): Promise<void> {
    await api.delete(`/room/rooms/${roomId}/channels/${channelId}`);
  },

  /** Reorder channels (and move them across categories) in one atomic request.
      Each item carries the category it ends up in; null moves it to Uncategorized. */
  async reorderChannels(
    roomId: string,
    items: { id: string; categoryId: string | null }[],
  ): Promise<void> {
    await api.patch(`/room/rooms/${roomId}/channels/reorder`, { items });
  },

  async createCategory(roomId: string, name: string): Promise<Category> {
    const { data } = await api.post(`/room/rooms/${roomId}/categories`, {
      name,
    });
    return data.category;
  },

  async updateCategory(
    roomId: string,
    categoryId: string,
    payload: { name?: string; position?: number },
  ): Promise<Category> {
    const { data } = await api.patch(
      `/room/rooms/${roomId}/categories/${categoryId}`,
      payload,
    );
    return data.category;
  },

  async deleteCategory(roomId: string, categoryId: string): Promise<void> {
    await api.delete(`/room/rooms/${roomId}/categories/${categoryId}`);
  },

  async reorderCategories(roomId: string, orderedIds: string[]): Promise<void> {
    await api.patch(`/room/rooms/${roomId}/categories/reorder`, { orderedIds });
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

  async getJoinRequests(roomId: string): Promise<JoinRequest[]> {
    const { data } = await api.get(`/room/${roomId}/join-requests`);
    return data.requests;
  },

  async respondJoinRequest(
    roomId: string,
    requestId: string,
    action: "APPROVED" | "REJECTED",
  ): Promise<void> {
    await api.patch(`/room/${roomId}/join-requests/${requestId}`, {
      action,
    });
  },

  async createJoinLink(roomId: string): Promise<JoinLink> {
    const { data } = await api.post(`/room/${roomId}/join-links`, {});
    return data.link;
  },

  async myJoinLinks(): Promise<JoinLink[]> {
    const { data } = await api.get("/room/join-links/mine");
    return data.links;
  },

  async deactivateJoinLink(roomId: string, linkId: string): Promise<void> {
    await api.patch(`/room/${roomId}/join-links/${linkId}`, {});
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

  /** Full public profile of another user for the profile card. */
  async getUserProfile(userId: string): Promise<UserProfile> {
    const { data } = await api.get(`/search/users/${userId}`);
    return data.user;
  },

  // ---------------------------------------------------------------------------
  // Friends (requests)
  // ---------------------------------------------------------------------------

  /** Send a friend request to another user. Returns the created request. */
  async sendFriendRequest(userId: string): Promise<FriendRequest> {
    const { data } = await api.post("/friends/requests", { userId });
    return data.request;
  },

  /** Incoming PENDING friend requests (for the inbox system cards). */
  async getFriendRequests(): Promise<Paginated<FriendRequest>> {
    const { data } = await api.get("/friends/requests");
    return { items: data.requests, nextCursor: data.nextCursor };
  },

  /** Accept an incoming friend request. Returns the accepted request. */
  async acceptFriendRequest(requestId: string): Promise<FriendRequest> {
    const { data } = await api.post(`/friends/requests/${requestId}/accept`);
    return data.request;
  },

  /** Decline an incoming friend request. */
  async declineFriendRequest(requestId: string): Promise<void> {
    await api.post(`/friends/requests/${requestId}/decline`);
  },

  /** Withdraw (cancel) a friend request the current user sent. */
  async withdrawFriendRequest(requestId: string): Promise<void> {
    await api.delete(`/friends/requests/${requestId}`);
  },

  // ---------------------------------------------------------------------------
  // Blocks
  // ---------------------------------------------------------------------------

  /** Block a user (idempotent). Returns the blocked user's summary. */
  async blockUser(userId: string): Promise<BlockedUser> {
    const { data } = await api.post(`/users/${userId}/block`);
    return data.blockedUser;
  },

  /** Unblock a user (idempotent). */
  async unblockUser(userId: string): Promise<void> {
    await api.delete(`/users/${userId}/block`);
  },

  /** The current user's blocked-users list. */
  async getBlockedUsers(): Promise<Paginated<BlockedUser>> {
    const { data } = await api.get("/users/blocked");
    return { items: data.blockedUsers, nextCursor: data.nextCursor };
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
  async updateRoomAvatar(roomId: string, avatarKey: string): Promise<void> {
    await api.patch(`/room/${roomId}/avatar`, { avatarKey });
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
    roomId: string,
    channelId: string,
    body: { content?: string; messageType: string; attachmentIds?: string[] },
  ) {
    // Phase 2 pins every room message to an explicit channel; the server still
    // resolves a missing channelId to #general for older clients.
    return emitRoomAck<AckResult & { message?: Message }>("chatroom:message", {
      roomId,
      channelId,
      content: body.content,
      messageType: body.messageType,
      attachmentIds: body.attachmentIds,
      idempotencyKey: crypto.randomUUID(),
    });
  },
  edit(roomId: string, messageId: string, content: string) {
    return emitRoomAck("chatroom:message:edit", {
      roomId,
      messageId,
      content,
    });
  },
  remove(roomId: string, messageId: string) {
    return emitRoomAck("chatroom:message:delete", { roomId, messageId });
  },
};

export { getErrorMessage };
export type { Attachment };
