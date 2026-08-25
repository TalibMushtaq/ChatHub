import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import {
  getRoomRole,
  roleAtLeast,
  roleHasPermission,
  type RoomPermission,
} from "./permissions";
import { forceLeaveCall } from "./call";
import type { ChatRoomRole } from "@prisma/client";

/**
 * Room member management (Phase 4 §8.3): assign role, kick, ban/unban,
 * mute/unmute, set nickname. Every action re-checks the caller's permission on
 * the backend and refuses to act on the owner or a role senior to the caller.
 */

/** Select shape shared by all member-management responses. */
const memberSelect = {
  id: true,
  userId: true,
  chatRoomId: true,
  role: true,
  joinedAt: true,
  nickname: true,
  mutedUntil: true,
  User: {
    select: { id: true, username: true, displayName: true, avatar: true },
  },
} as const;

/** Map a Prisma row (from memberSelect) to the API's `member` shape. */
function toMember(m: {
  id: string;
  userId: string;
  chatRoomId: string;
  role: ChatRoomRole;
  joinedAt: Date;
  nickname: string | null;
  mutedUntil: Date | null;
  User: {
    id: string;
    username: string;
    displayName: string | null;
    avatar: string | null;
  };
}) {
  return {
    memberId: m.id,
    userId: m.userId,
    role: m.role,
    joinedAt: m.joinedAt,
    nickname: m.nickname,
    mutedUntil: m.mutedUntil,
    user: m.User,
  };
}

/** Assert the caller may perform `permission`, then load the target member. */
async function assertAndLoadMember(
  actorId: string,
  roomId: string,
  targetUserId: string,
  permission: RoomPermission,
) {
  const actorRole = await getRoomRole(actorId, roomId);
  if (!roleHasPermission(actorRole, permission)) {
    throw new ApiError(
      `You need the ${permission} permission to do that`,
      403,
      "FORBIDDEN",
    );
  }
  const target = await prisma.chatRoomMember.findUnique({
    where: { userId_chatRoomId: { userId: targetUserId, chatRoomId: roomId } },
    select: memberSelect,
  });
  if (!target) {
    throw new ApiError("User is not a member of this room", 404, "NOT_FOUND");
  }
  return { actorRole, target };
}

/** Refuse to act on the owner or a role senior to the caller. */
function assertCanActOn(actorRole: ChatRoomRole, targetRole: ChatRoomRole) {
  if (targetRole === "OWNER") {
    throw new ApiError(
      "You cannot change the room owner's membership",
      403,
      "FORBIDDEN",
    );
  }
  if (actorRole === targetRole) {
    throw new ApiError(
      "You cannot manage another member with the same role",
      403,
      "FORBIDDEN",
    );
  }
  if (!roleAtLeast(actorRole, targetRole)) {
    throw new ApiError(
      "You cannot manage a member with a role at or above your own",
      403,
      "FORBIDDEN",
    );
  }
}

/**
 * Change a member's role. Assigning a role requires MANAGE_ROLES (owner only,
 * per the Phase 1 permission map); demoting/promoting to MEMBER/MODERATOR is
 * also permitted to owners (the same permission gates the whole endpoint).
 */
export async function changeMemberRole(
  actorId: string,
  roomId: string,
  targetUserId: string,
  newRole: ChatRoomRole,
) {
  if (actorId === targetUserId) {
    throw new ApiError("You cannot change your own role", 403, "FORBIDDEN");
  }
  const { actorRole, target } = await assertAndLoadMember(
    actorId,
    roomId,
    targetUserId,
    "MANAGE_ROLES",
  );
  // Demoting/promoting an admin is an owner-only privilege.
  if (target.role === "ADMIN" && actorRole !== "OWNER") {
    throw new ApiError(
      "Only the owner can change an admin's role",
      403,
      "FORBIDDEN",
    );
  }
  assertCanActOn(actorRole, target.role);

  const updated = await prisma.chatRoomMember.update({
    where: { id: target.id },
    data: { role: newRole },
    select: memberSelect,
  });
  return toMember(updated);
}

/** Remove a member from the room (kicked). */
export async function kickMember(
  actorId: string,
  roomId: string,
  targetUserId: string,
) {
  if (actorId === targetUserId) {
    throw new ApiError("You cannot kick yourself", 403, "FORBIDDEN");
  }
  const { actorRole, target } = await assertAndLoadMember(
    actorId,
    roomId,
    targetUserId,
    "MANAGE_MEMBERS",
  );
  assertCanActOn(actorRole, target.role);

  await prisma.$transaction([
    prisma.chatRoomMember.deleteMany({
      where: { userId: targetUserId, chatRoomId: roomId },
    }),
    prisma.chatRoomReadReceipt.deleteMany({
      where: { userId: targetUserId, chatRoomId: roomId },
    }),
  ]);

  // Disconnect from any active voice call (best-effort, non-blocking).
  const callInfo = await forceLeaveCall(targetUserId).catch(() => null);

  return { userId: targetUserId, role: target.role, callInfo };
}

/**
 * Ban a member: records a RoomBan (persisting after the membership is removed)
 * and kicks them in one transaction. Re-banning someone already banned is a
 * no-op success so the UI never surfaces a spurious error.
 */
export async function banMember(
  actorId: string,
  roomId: string,
  targetUserId: string,
  reason?: string | null,
) {
  if (actorId === targetUserId) {
    throw new ApiError("You cannot ban yourself", 403, "FORBIDDEN");
  }
  const { actorRole, target } = await assertAndLoadMember(
    actorId,
    roomId,
    targetUserId,
    "MANAGE_MEMBERS",
  );
  assertCanActOn(actorRole, target.role);

  await prisma.$transaction(async (tx) => {
    await tx.roomBan.upsert({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      create: {
        roomId,
        userId: targetUserId,
        bannedById: actorId,
        reason: reason?.trim() || null,
      },
      update: {},
    });
    await tx.chatRoomMember.deleteMany({
      where: { userId: targetUserId, chatRoomId: roomId },
    });
    await tx.chatRoomReadReceipt.deleteMany({
      where: { userId: targetUserId, chatRoomId: roomId },
    });
  });

  // Disconnect from any active voice call (best-effort, non-blocking).
  const callInfo = await forceLeaveCall(targetUserId).catch(() => null);

  return { userId: targetUserId, role: target.role, callInfo };
}

/** Lift a ban. Does not re-add the member — they rejoin via invite/link. */
export async function unbanMember(
  actorId: string,
  roomId: string,
  targetUserId: string,
) {
  await assertCanManageBans(actorId, roomId);
  const deleted = await prisma.roomBan.deleteMany({
    where: { roomId, userId: targetUserId },
  });
  if (deleted.count === 0) {
    throw new ApiError("User is not banned from this room", 404, "NOT_FOUND");
  }
  return { userId: targetUserId };
}

/** Whether a user is currently banned from a room (used by join gates). */
export async function isBanned(
  roomId: string,
  userId: string,
): Promise<boolean> {
  const ban = await prisma.roomBan.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { id: true },
  });
  return !!ban;
}

async function assertCanManageBans(actorId: string, roomId: string) {
  const role = await getRoomRole(actorId, roomId);
  // Ban management shares the member-management permission.
  if (!["OWNER", "ADMIN"].includes(role)) {
    throw new ApiError(
      "You need to manage members to manage bans",
      403,
      "FORBIDDEN",
    );
  }
}

/** List the room's bans (banned user + reason + who banned). */
export async function getRoomBans(roomId: string) {
  const bans = await prisma.roomBan.findMany({
    where: { roomId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reason: true,
      createdAt: true,
      userId: true,
      bannedBy: {
        select: { id: true, username: true, displayName: true, avatar: true },
      },
      User: {
        select: { id: true, username: true, displayName: true, avatar: true },
      },
    },
  });
  return bans.map((b) => ({
    id: b.id,
    userId: b.userId,
    reason: b.reason,
    createdAt: b.createdAt,
    bannedBy: b.bannedBy,
    user: b.User,
  }));
}

/** Mute a member for `durationMinutes`. */
export async function muteMember(
  actorId: string,
  roomId: string,
  targetUserId: string,
  durationMinutes: number,
) {
  if (actorId === targetUserId) {
    throw new ApiError("You cannot mute yourself", 403, "FORBIDDEN");
  }
  const { actorRole, target } = await assertAndLoadMember(
    actorId,
    roomId,
    targetUserId,
    "MANAGE_MEMBERS",
  );
  assertCanActOn(actorRole, target.role);

  const mutedUntil = new Date(Date.now() + durationMinutes * 60_000);
  const updated = await prisma.chatRoomMember.update({
    where: { id: target.id },
    data: { mutedUntil },
    select: memberSelect,
  });
  return toMember(updated);
}

/** Clear a member's mute. */
export async function unmuteMember(
  actorId: string,
  roomId: string,
  targetUserId: string,
) {
  const { actorRole, target } = await assertAndLoadMember(
    actorId,
    roomId,
    targetUserId,
    "MANAGE_MEMBERS",
  );
  assertCanActOn(actorRole, target.role);

  const updated = await prisma.chatRoomMember.update({
    where: { id: target.id },
    data: { mutedUntil: null },
    select: memberSelect,
  });
  return toMember(updated);
}

/**
 * Set (or clear) a per-room nickname. A user may set their own nickname; anyone
 * with MANAGE_MEMBERS may set another member's.
 */
export async function setNickname(
  actorId: string,
  roomId: string,
  targetUserId: string,
  nickname: string | null,
) {
  if (actorId !== targetUserId) {
    const { actorRole, target } = await assertAndLoadMember(
      actorId,
      roomId,
      targetUserId,
      "MANAGE_MEMBERS",
    );
    assertCanActOn(actorRole, target.role);
  }
  const target = await prisma.chatRoomMember.findUnique({
    where: { userId_chatRoomId: { userId: targetUserId, chatRoomId: roomId } },
    select: { id: true },
  });
  if (!target) {
    throw new ApiError("User is not a member of this room", 404, "NOT_FOUND");
  }
  const updated = await prisma.chatRoomMember.update({
    where: { id: target.id },
    data: { nickname: nickname?.trim() || null },
    select: memberSelect,
  });
  return toMember(updated);
}

/** Whether a member is currently muted (mutedUntil in the future). */
export function isMuted(member: { mutedUntil: Date | null }): boolean {
  return !!member.mutedUntil && member.mutedUntil.getTime() > Date.now();
}
