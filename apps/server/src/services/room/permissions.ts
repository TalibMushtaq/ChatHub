import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import type { ChatRoomRole } from "@prisma/client";

/**
 * Room permission names — the authorization vocabulary for the Rooms feature.
 *
 * Phase 1 keeps this deliberately small (spec §5.6): roles map to a fixed set
 * of permissions. The map below is the single source of truth so granular
 * per-channel permissions can later override it without touching call sites.
 */
export type RoomPermission =
  | "VIEW_CHANNEL"
  | "SEND_MESSAGES"
  | "MANAGE_MESSAGES"
  | "MANAGE_CHANNELS"
  | "MANAGE_CATEGORIES"
  | "MANAGE_MEMBERS"
  | "MANAGE_ROLES"
  | "MANAGE_ROOM";

/** Membership role that grants room-level administration (owner or admin). */
export const ROOM_MANAGER_ROLES: readonly ChatRoomRole[] = ["OWNER", "ADMIN"];

/** Role ordering used by assertRoleAtLeast: higher index = more authority. */
const ROLE_ORDER: Record<ChatRoomRole, number> = {
  MEMBER: 0,
  ADMIN: 1,
  OWNER: 2,
};

const ROLE_PERMISSIONS: Record<ChatRoomRole, readonly RoomPermission[]> = {
  OWNER: [
    "VIEW_CHANNEL",
    "SEND_MESSAGES",
    "MANAGE_MESSAGES",
    "MANAGE_CHANNELS",
    "MANAGE_CATEGORIES",
    "MANAGE_MEMBERS",
    "MANAGE_ROLES",
    "MANAGE_ROOM",
  ],
  ADMIN: [
    "VIEW_CHANNEL",
    "SEND_MESSAGES",
    "MANAGE_MESSAGES",
    "MANAGE_CHANNELS",
    "MANAGE_CATEGORIES",
    "MANAGE_MEMBERS",
  ],
  MEMBER: ["VIEW_CHANNEL", "SEND_MESSAGES"],
};

export function roleHasPermission(
  role: ChatRoomRole,
  permission: RoomPermission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Whether `role` is at least as senior as `minRole` (MEMBER < ADMIN < OWNER). */
export function roleAtLeast(
  role: ChatRoomRole,
  minRole: ChatRoomRole,
): boolean {
  return ROLE_ORDER[role] >= ROLE_ORDER[minRole];
}

/**
 * Fetch the caller's role in a room, throwing 403 for non-members.
 *
 * This doubles as the membership check so callers never need a separate
 * assertRoomAccess before their permission check.
 */
export async function getRoomRole(
  userId: string,
  roomId: string,
): Promise<ChatRoomRole> {
  const membership = await prisma.chatRoomMember.findUnique({
    where: { userId_chatRoomId: { userId, chatRoomId: roomId } },
    select: { role: true },
  });
  if (!membership) {
    throw new ApiError("Not a member of this room", 403, "FORBIDDEN");
  }
  return membership.role;
}

/**
 * Assert the caller may perform `permission` in the room, else throw 403.
 * All room mutations gate through this — never trust the frontend.
 */
export async function assertRoomPermission(
  userId: string,
  roomId: string,
  permission: RoomPermission,
): Promise<void> {
  const role = await getRoomRole(userId, roomId);
  if (!roleHasPermission(role, permission)) {
    throw new ApiError(
      `You need the ${permission} permission to do that`,
      403,
      "FORBIDDEN",
    );
  }
}

/** Assert the caller's role is at least `minRole` (e.g. OWNER for room delete). */
export async function assertRoleAtLeast(
  userId: string,
  roomId: string,
  minRole: ChatRoomRole,
): Promise<ChatRoomRole> {
  const role = await getRoomRole(userId, roomId);
  if (!roleAtLeast(role, minRole)) {
    throw new ApiError(
      "You do not have permission to do that",
      403,
      "FORBIDDEN",
    );
  }
  return role;
}
