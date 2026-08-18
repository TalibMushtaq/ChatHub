import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import { assertRoleAtLeast } from "./permissions";
import {
  DEFAULT_CATEGORY_NAME,
  DEFAULT_CHANNEL_NAME,
} from "../../constants/room";

/**
 * Room settings service — profile edits and destruction.
 *
 * Room profile changes and deletion are OWNER-only (spec §5.6); admins manage
 * members/channels but not the room itself.
 */

export type UpdateRoomInput = {
  name?: string;
  description?: string | null;
  avatarKey?: string | null;
};

export async function updateRoom(
  userId: string,
  roomId: string,
  input: UpdateRoomInput,
) {
  await assertRoleAtLeast(userId, roomId, "OWNER");

  const existing = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { id: true },
  });
  if (!existing) {
    throw new ApiError("Room not found", 404, "NOT_FOUND");
  }

  return prisma.chatRoom.update({
    where: { id: roomId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.avatarKey !== undefined ? { avatar: input.avatarKey } : {}),
    },
    select: {
      id: true,
      name: true,
      description: true,
      avatar: true,
      createdBy: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Delete a Room. OWNER-only. Categories, channels, messages, memberships and
 * invites all cascade away with the ChatRoom row.
 */
export async function deleteRoom(userId: string, roomId: string) {
  await assertRoleAtLeast(userId, roomId, "OWNER");

  const existing = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    select: { id: true },
  });
  if (!existing) {
    throw new ApiError("Room not found", 404, "NOT_FOUND");
  }

  await prisma.chatRoom.delete({ where: { id: roomId } });
}

/**
 * Seed the default GENERAL → #general structure into a freshly created Room
 * (and re-seed idempotently if called twice). Used by POST /rooms.
 */
export async function seedDefaultStructure(roomId: string) {
  const category = await prisma.category.upsert({
    where: { roomId_name: { roomId, name: DEFAULT_CATEGORY_NAME } },
    create: { roomId, name: DEFAULT_CATEGORY_NAME, position: 0 },
    update: {},
  });
  await prisma.channel.upsert({
    where: { roomId_name: { roomId, name: DEFAULT_CHANNEL_NAME } },
    create: {
      roomId,
      categoryId: category.id,
      name: DEFAULT_CHANNEL_NAME,
      type: "TEXT",
      position: 0,
    },
    update: {},
  });
}
