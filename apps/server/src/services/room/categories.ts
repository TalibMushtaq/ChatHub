import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { ApiError } from "../../lib/ApiError";
import { categorySummarySelect } from "../../constants/room";
import { assertRoomPermission } from "./permissions";

/**
 * Categories service — CRUD + ordering for Room categories.
 *
 * Deleting a category must NOT destroy its channels (spec §5.2): the channels
 * move to "Uncategorized" (categoryId → null) instead.
 */

export type CreateCategoryInput = {
  name: string;
};

export async function createCategory(
  userId: string,
  roomId: string,
  input: CreateCategoryInput,
) {
  await assertRoomPermission(userId, roomId, "MANAGE_CATEGORIES");

  const maxPosition = await prisma.category.aggregate({
    where: { roomId },
    _max: { position: true },
  });

  try {
    return await prisma.category.create({
      data: {
        roomId,
        name: input.name,
        position: (maxPosition._max.position ?? -1) + 1,
      },
      select: categorySummarySelect,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new ApiError(
        "A category with that name already exists",
        409,
        "DUPLICATE_CATEGORY",
      );
    }
    throw err;
  }
}

export type UpdateCategoryInput = {
  name?: string;
  position?: number;
};

export async function updateCategory(
  userId: string,
  roomId: string,
  categoryId: string,
  input: UpdateCategoryInput,
) {
  await assertRoomPermission(userId, roomId, "MANAGE_CATEGORIES");

  const existing = await prisma.category.findFirst({
    where: { id: categoryId, roomId },
    select: { id: true },
  });
  if (!existing) {
    throw new ApiError("Category not found", 404, "NOT_FOUND");
  }

  try {
    return await prisma.category.update({
      where: { id: categoryId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      },
      select: categorySummarySelect,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new ApiError(
        "A category with that name already exists",
        409,
        "DUPLICATE_CATEGORY",
      );
    }
    throw err;
  }
}

/**
 * Delete a category, moving its channels to "Uncategorized" first. The update
 * and delete run in one transaction so a crash can't orphan channels against
 * a missing category.
 */
export async function deleteCategory(
  userId: string,
  roomId: string,
  categoryId: string,
) {
  await assertRoomPermission(userId, roomId, "MANAGE_CATEGORIES");

  const existing = await prisma.category.findFirst({
    where: { id: categoryId, roomId },
    select: { id: true },
  });
  if (!existing) {
    throw new ApiError("Category not found", 404, "NOT_FOUND");
  }

  await prisma.$transaction([
    prisma.channel.updateMany({
      where: { categoryId },
      data: { categoryId: null },
    }),
    prisma.category.delete({ where: { id: categoryId } }),
  ]);
}

export async function reorderCategories(
  userId: string,
  roomId: string,
  orderedIds: string[],
) {
  await assertRoomPermission(userId, roomId, "MANAGE_CATEGORIES");

  const categories = await prisma.category.findMany({
    where: { id: { in: orderedIds }, roomId },
    select: { id: true },
  });
  if (categories.length !== orderedIds.length) {
    throw new ApiError(
      "One or more categories do not belong to this room",
      400,
      "BAD_REQUEST",
    );
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.category.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );
}
