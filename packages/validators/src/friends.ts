import { z } from "zod";

// FriendRequest.status values. Kept as a shared TS union (mirroring the
// FriendRequestStatus Prisma enum) so the API, socket payloads, and web client
// all agree on the allowed states without depending on @prisma/client.
export const FRIEND_REQUEST_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
] as const;
export type FriendRequestStatus = (typeof FRIEND_REQUEST_STATUSES)[number];

// Relationship between the current user and another user, as derived server-side
// from FriendRequest/Friendship/UserBlock rows. Single source of truth shared
// by the API responses, socket payloads, and the web client's UI types.
export const RELATIONSHIP_VALUES = [
  "NONE",
  "REQUEST_SENT",
  "REQUEST_RECEIVED",
  "FRIENDS",
  "BLOCKED",
] as const;
export type Relationship = (typeof RELATIONSHIP_VALUES)[number];

// Body of POST /api/friends/requests: the target user only. The sender is the
// authenticated session user, never a body field. `.strict()` rejects any
// unknown field (including a sneaky recipientId).
export const sendFriendRequestSchema = z
  .object({
    userId: z.string().min(1),
    _csrf: z.string().optional(),
  })
  .strict();

// Params for accept/decline: the request id (cuid) of the FriendRequest row.
export const friendRequestIdParamSchema = z.object({
  requestId: z.string().min(1),
});

// Params for block/unblock: the id of the user to block/unblock.
export const blockUserIdParamSchema = z.object({
  userId: z.string().min(1),
});

// Query params for the friend-requests inbox. `z.coerce` converts the string
// query values (Express always sends strings) to the expected types.
export const getFriendRequestsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// Query params for the blocked-users list.
export const getBlockedUsersQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
