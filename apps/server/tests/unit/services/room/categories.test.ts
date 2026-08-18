import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} from "../../../../src/services/room/categories";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import { createCategory as factoryCategory } from "../../../factories/room";

describe("room categories service", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  describe("createCategory", () => {
    it("creates a category at the end of the room", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.category.aggregate.mockResolvedValue({
        _max: { position: 0 },
      } as any);
      const created = factoryCategory({ id: "cat-1" });
      prismaMock.category.create.mockResolvedValue(created as any);

      const result = await createCategory("u1", "r1", { name: "GAMES" });

      expect(result.id).toBe("cat-1");
      expect(prismaMock.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            roomId: "r1",
            name: "GAMES",
            position: 1,
          }),
        }),
      );
    });

    it("throws 403 for a member without MANAGE_CATEGORIES", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);

      await expect(
        createCategory("u1", "r1", { name: "GAMES" }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });

    it("maps a duplicate-name race to a 409", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.category.aggregate.mockResolvedValue({
        _max: { position: null },
      } as any);
      prismaMock.category.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "1",
        }),
      );

      await expect(
        createCategory("u1", "r1", { name: "GENERAL" }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "DUPLICATE_CATEGORY",
      });
    });

    it("rethrows unexpected Prisma errors", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.category.aggregate.mockResolvedValue({
        _max: { position: null },
      } as any);
      prismaMock.category.create.mockRejectedValue(new Error("boom"));

      await expect(
        createCategory("u1", "r1", { name: "GAMES" }),
      ).rejects.toThrow("boom");
    });
  });

  describe("updateCategory", () => {
    it("accepts a rename", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "OWNER",
      } as any);
      prismaMock.category.findFirst.mockResolvedValue({ id: "cat-1" } as any);
      prismaMock.category.update.mockResolvedValue(factoryCategory() as any);

      await updateCategory("u1", "r1", "cat-1", { name: "GAMES" });

      expect(prismaMock.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "cat-1" },
          data: { name: "GAMES" },
        }),
      );
    });

    it("accepts a position-only update", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "OWNER",
      } as any);
      prismaMock.category.findFirst.mockResolvedValue({ id: "cat-1" } as any);
      prismaMock.category.update.mockResolvedValue(factoryCategory() as any);

      await updateCategory("u1", "r1", "cat-1", { position: 2 });

      expect(prismaMock.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "cat-1" },
          data: { position: 2 },
        }),
      );
    });

    it("throws 404 when the category is not in the room", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "OWNER",
      } as any);
      prismaMock.category.findFirst.mockResolvedValue(null as any);

      await expect(
        updateCategory("u1", "r1", "cat-missing", { name: "GAMES" }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });

    it("maps a duplicate-name race to a 409", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.category.findFirst.mockResolvedValue({ id: "cat-1" } as any);
      prismaMock.category.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "1",
        }),
      );

      await expect(
        updateCategory("u1", "r1", "cat-1", { name: "GENERAL" }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "DUPLICATE_CATEGORY",
      });
    });

    it("rethrows unexpected Prisma errors", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.category.findFirst.mockResolvedValue({ id: "cat-1" } as any);
      prismaMock.category.update.mockRejectedValue(new Error("boom"));

      await expect(
        updateCategory("u1", "r1", "cat-1", { name: "GAMES" }),
      ).rejects.toThrow("boom");
    });
  });

  describe("deleteCategory", () => {
    it("moves channels to uncategorized and deletes the category in one transaction", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.category.findFirst.mockResolvedValue({ id: "cat-1" } as any);
      prismaMock.channel.updateMany.mockImplementation((args) => args as any);
      prismaMock.category.delete.mockImplementation((args) => args as any);
      prismaMock.$transaction.mockImplementation((ops: any[]) =>
        Promise.all(ops),
      );

      await deleteCategory("u1", "r1", "cat-1");

      expect(prismaMock.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({
          where: { categoryId: "cat-1" },
          data: { categoryId: null },
        }),
        expect.objectContaining({ where: { id: "cat-1" } }),
      ]);
      expect(prismaMock.channel.updateMany).toHaveBeenCalledWith({
        where: { categoryId: "cat-1" },
        data: { categoryId: null },
      });
      expect(prismaMock.category.delete).toHaveBeenCalledWith({
        where: { id: "cat-1" },
      });
    });

    it("throws 404 when the category is not in the room", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.category.findFirst.mockResolvedValue(null as any);

      await expect(
        deleteCategory("u1", "r1", "cat-missing"),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });
  });

  describe("reorderCategories", () => {
    it("reassigns positions from the ordered id list", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.category.findMany.mockResolvedValue([
        { id: "a" },
        { id: "b" },
      ] as any);
      prismaMock.category.update.mockImplementation((args) => args as any);
      prismaMock.$transaction.mockImplementation((ops: any[]) =>
        Promise.all(ops),
      );

      await reorderCategories("u1", "r1", ["a", "b"]);

      expect(prismaMock.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({ data: { position: 0 } }),
        expect.objectContaining({ data: { position: 1 } }),
      ]);
    });

    it("throws 400 when an id does not belong to the room", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.category.findMany.mockResolvedValue([{ id: "a" }] as any);

      await expect(
        reorderCategories("u1", "r1", ["a", "b"]),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "BAD_REQUEST",
      });
    });
  });
});
