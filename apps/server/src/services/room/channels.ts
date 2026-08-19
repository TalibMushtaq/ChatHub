import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import {
  channelSummarySelect,
  categorySummarySelect,
} from "../../constants/room";
import { assertRoomPermission } from "./permissions";
import type { ChannelType } from "@prisma/client";

/**
 * Channels service — CRUD + ordering for Room channels.
 *
 * Every mutation first asserts the caller's room permission (MANAGE_CHANNELS)
 * so the backend, never the frontend, is the source of authorization truth.
 */

export async function listChannels(roomId: string) {
  const channels = await prisma.channel.findMany({
    where: { roomId },
    orderBy: [{ categoryId: "asc" }, { position: "asc" }, { id: "asc" }],
    select: channelSummarySelect,
  });
  return channels;
}

export type CreateChannelInput = {
  name: string;
  type?: ChannelType;
  topic?: string | null;
  categoryId?: string | null;
};

export async function createChannel(
  userId: string,
  roomId: string,
  input: CreateChannelInput,
) {
  await assertRoomPermission(userId, roomId, "MANAGE_CHANNELS");

  // A category from another room must never be attachable to this channel.
  if (input.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
      select: { roomId: true },
    });
    if (!category || category.roomId !== roomId) {
      throw new ApiError(
        "Category does not belong to this room",
        400,
        "BAD_REQUEST",
      );
    }
  }

  const maxPosition = await prisma.channel.aggregate({
    where: { roomId },
    _max: { position: true },
  });

  try {
    return await prisma.channel.create({
      data: {
        roomId,
        name: input.name,
        type: input.type ?? "TEXT",
        topic: input.topic ?? null,
        categoryId: input.categoryId ?? null,
        position: (maxPosition._max.position ?? -1) + 1,
      },
      select: channelSummarySelect,
    });
  } catch (err) {
    // Channel names are unique per Room; surface the collision as a 409.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new ApiError(
        "A channel with that name already exists",
        409,
        "DUPLICATE_CHANNEL",
      );
    }
    throw err;
  }
}

export type UpdateChannelInput = {
  name?: string;
  topic?: string | null;
  categoryId?: string | null;
  position?: number;
};

export async function updateChannel(
  userId: string,
  roomId: string,
  channelId: string,
  input: UpdateChannelInput,
) {
  await assertRoomPermission(userId, roomId, "MANAGE_CHANNELS");

  const existing = await prisma.channel.findFirst({
    where: { id: channelId, roomId },
    select: { id: true },
  });
  if (!existing) {
    throw new ApiError("Channel not found", 404, "NOT_FOUND");
  }

  if (input.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: input.categoryId },
      select: { roomId: true },
    });
    if (!category || category.roomId !== roomId) {
      throw new ApiError(
        "Category does not belong to this room",
        400,
        "BAD_REQUEST",
      );
    }
  }

  try {
    return await prisma.channel.update({
      where: { id: channelId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.topic !== undefined ? { topic: input.topic } : {}),
        ...(input.categoryId !== undefined
          ? { categoryId: input.categoryId }
          : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      },
      select: channelSummarySelect,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new ApiError(
        "A channel with that name already exists",
        409,
        "DUPLICATE_CHANNEL",
      );
    }
    throw err;
  }
}

export async function deleteChannel(
  userId: string,
  roomId: string,
  channelId: string,
) {
  await assertRoomPermission(userId, roomId, "MANAGE_CHANNELS");

  const existing = await prisma.channel.findFirst({
    where: { id: channelId, roomId },
    select: { id: true },
  });
  if (!existing) {
    throw new ApiError("Channel not found", 404, "NOT_FOUND");
  }

  // Channel cascade-deletes its messages (Message.channelId onDelete: Cascade).
  await prisma.channel.delete({ where: { id: channelId } });
}

/**
 * Reassign positions (and optionally category) from an ordered list. The list
 * covers every channel in the room in display order; each entry may also carry
 * a new `categoryId` so moving a channel across categories and reordering
 * commit atomically. Every id and category must belong to this room before
 * anything is written.
 */
export async function reorderChannels(
  userId: string,
  roomId: string,
  items: { id: string; categoryId: string | null }[],
) {
  await assertRoomPermission(userId, roomId, "MANAGE_CHANNELS");

  const channels = await prisma.channel.findMany({
    where: { id: { in: items.map((i) => i.id) }, roomId },
    select: { id: true },
  });
  if (channels.length !== items.length) {
    throw new ApiError(
      "One or more channels do not belong to this room",
      400,
      "BAD_REQUEST",
    );
  }

  // Category ids may repeat (several channels in one category) but must all
  // belong to this room; a null means "move to Uncategorized".
  const categoryIds = Array.from(
    new Set(
      items.map((i) => i.categoryId).filter((c): c is string => c !== null),
    ),
  );
  if (categoryIds.length > 0) {
    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds }, roomId },
      select: { id: true },
    });
    if (categories.length !== categoryIds.length) {
      throw new ApiError(
        "One or more categories do not belong to this room",
        400,
        "BAD_REQUEST",
      );
    }
  }

  await prisma.$transaction(
    items.map((item, index) =>
      prisma.channel.update({
        where: { id: item.id },
        data: { position: index, categoryId: item.categoryId },
      }),
    ),
  );
}

/**
 * Room detail: the room record plus its full category → channel structure.
 * Used by GET /rooms/:roomId and the Phase 2 sidebar.
 */
export async function getRoomStructure(roomId: string) {
  const [room, categories, channels] = await Promise.all([
    prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        name: true,
        description: true,
        avatar: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.category.findMany({
      where: { roomId },
      orderBy: { position: "asc" },
      select: categorySummarySelect,
    }),
    prisma.channel.findMany({
      where: { roomId },
      orderBy: { position: "asc" },
      select: channelSummarySelect,
    }),
  ]);

  if (!room) {
    throw new ApiError("Room not found", 404, "NOT_FOUND");
  }

  return {
    ...room,
    categories: categories.map((category) => ({
      ...category,
      channels: channels.filter((c) => c.categoryId === category.id),
    })),
    uncategorized: channels.filter((c) => c.categoryId === null),
  };
}

/** Verify a channel exists in a room; returns it or throws 404. */
export async function assertChannelInRoom(roomId: string, channelId: string) {
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, roomId },
    select: channelSummarySelect,
  });
  if (!channel) {
    throw new ApiError("Channel not found", 404, "NOT_FOUND");
  }
  return channel;
}
