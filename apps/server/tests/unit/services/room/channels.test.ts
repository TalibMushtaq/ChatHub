import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import {
  listChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  reorderChannels,
  getRoomStructure,
  assertChannelInRoom,
} from "../../../../src/services/room/channels";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";
import {
  createChannel as factoryChannel,
  createCategory,
} from "../../../factories/room";

describe("room channels service", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  describe("listChannels", () => {
    it("lists channels ordered by category then position", async () => {
      prismaMock.channel.findMany.mockResolvedValue([factoryChannel()] as any);

      const result = await listChannels("r1");

      expect(result).toHaveLength(1);
      expect(prismaMock.channel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { roomId: "r1" },
          orderBy: [{ categoryId: "asc" }, { position: "asc" }, { id: "asc" }],
        }),
      );
    });
  });

  describe("createChannel", () => {
    it("creates a channel at the end of the room", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.channel.aggregate.mockResolvedValue({
        _max: { position: 2 },
      } as any);
      const created = factoryChannel({ id: "ch-1" });
      prismaMock.channel.create.mockResolvedValue(created as any);

      const result = await createChannel("u1", "r1", { name: "general" });

      expect(result.id).toBe("ch-1");
      expect(prismaMock.channel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            roomId: "r1",
            name: "general",
            position: 3,
          }),
        }),
      );
    });

    it("rejects a category from another room", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.category.findUnique.mockResolvedValue({
        roomId: "other-room",
      } as any);

      await expect(
        createChannel("u1", "r1", { name: "music", categoryId: "cat-1" }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "BAD_REQUEST",
      });
      expect(prismaMock.channel.create).not.toHaveBeenCalled();
    });

    it("throws 403 for a plain member", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "MEMBER",
      } as any);

      await expect(
        createChannel("u1", "r1", { name: "general" }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });

    it("maps a duplicate-name race to a 409", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.channel.aggregate.mockResolvedValue({
        _max: { position: null },
      } as any);
      prismaMock.channel.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "1",
        }),
      );

      await expect(
        createChannel("u1", "r1", { name: "general" }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "DUPLICATE_CHANNEL",
      });
    });

    it("rethrows unexpected Prisma errors", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.channel.aggregate.mockResolvedValue({
        _max: { position: null },
      } as any);
      prismaMock.channel.create.mockRejectedValue(new Error("boom"));

      await expect(
        createChannel("u1", "r1", { name: "music" }),
      ).rejects.toThrow("boom");
    });
  });

  describe("updateChannel", () => {
    it("updates the channel and its topic", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "OWNER",
      } as any);
      prismaMock.channel.findFirst.mockResolvedValue({ id: "ch-1" } as any);
      prismaMock.channel.update.mockResolvedValue(factoryChannel() as any);

      await updateChannel("u1", "r1", "ch-1", {
        topic: "Updated topic",
      });

      expect(prismaMock.channel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ch-1" },
          data: { topic: "Updated topic" },
        }),
      );
    });

    it("throws 404 when the channel is not in the room", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "OWNER",
      } as any);
      prismaMock.channel.findFirst.mockResolvedValue(null as any);

      await expect(
        updateChannel("u1", "r1", "ch-missing", { name: "general" }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });

    it("maps a duplicate-name race to a 409", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.channel.findFirst.mockResolvedValue({ id: "ch-1" } as any);
      prismaMock.channel.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "1",
        }),
      );

      await expect(
        updateChannel("u1", "r1", "ch-1", { name: "general" }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "DUPLICATE_CHANNEL",
      });
    });

    it("rejects a category from another room on update", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.channel.findFirst.mockResolvedValue({ id: "ch-1" } as any);
      prismaMock.category.findUnique.mockResolvedValue({
        roomId: "other-room",
      } as any);

      await expect(
        updateChannel("u1", "r1", "ch-1", { categoryId: "cat-1" }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "BAD_REQUEST",
      });
      expect(prismaMock.channel.update).not.toHaveBeenCalled();
    });

    it("rethrows unexpected Prisma errors", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.channel.findFirst.mockResolvedValue({ id: "ch-1" } as any);
      prismaMock.channel.update.mockRejectedValue(new Error("boom"));

      await expect(
        updateChannel("u1", "r1", "ch-1", { name: "music" }),
      ).rejects.toThrow("boom");
    });
  });

  describe("deleteChannel", () => {
    it("deletes a channel that belongs to the room", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.channel.findFirst.mockResolvedValue({ id: "ch-1" } as any);

      await deleteChannel("u1", "r1", "ch-1");

      expect(prismaMock.channel.delete).toHaveBeenCalledWith({
        where: { id: "ch-1" },
      });
    });

    it("throws 404 for a channel in another room", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.channel.findFirst.mockResolvedValue(null as any);

      await expect(deleteChannel("u1", "r1", "ch-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });
  });

  describe("reorderChannels", () => {
    it("reassigns positions and categories from the ordered item list", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.channel.findMany.mockResolvedValue([
        { id: "a" },
        { id: "b" },
      ] as any);
      prismaMock.category.findMany.mockResolvedValue([{ id: "cat-1" }] as any);
      prismaMock.channel.update.mockImplementation((args) => args as any);
      prismaMock.$transaction.mockImplementation((ops: any[]) =>
        Promise.all(ops),
      );

      await reorderChannels("u1", "r1", [
        { id: "a", categoryId: "cat-1" },
        { id: "b", categoryId: null },
      ]);

      expect(prismaMock.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({
          data: { position: 0, categoryId: "cat-1" },
        }),
        expect.objectContaining({
          data: { position: 1, categoryId: null },
        }),
      ]);
    });

    it("throws 400 when a channel id does not belong to the room", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.channel.findMany.mockResolvedValue([{ id: "a" }] as any);

      await expect(
        reorderChannels("u1", "r1", [
          { id: "a", categoryId: null },
          { id: "b", categoryId: null },
        ]),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "BAD_REQUEST",
      });
    });

    it("throws 400 when a category does not belong to the room", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);
      prismaMock.channel.findMany.mockResolvedValue([{ id: "a" }] as any);
      // The category lives in a different room, so the room-scoped lookup
      // returns nothing and the length guard rejects the request.
      prismaMock.category.findMany.mockResolvedValue([] as any);

      await expect(
        reorderChannels("u1", "r1", [{ id: "a", categoryId: "cat-1" }]),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "BAD_REQUEST",
      });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("getRoomStructure", () => {
    it("groups channels under their category and exposes uncategorized", async () => {
      const category = createCategory({ id: "cat-1" });
      prismaMock.chatRoom.findUnique.mockResolvedValue({
        id: "r1",
        name: "Room",
      } as any);
      prismaMock.category.findMany.mockResolvedValue([category] as any);
      prismaMock.channel.findMany.mockResolvedValue([
        factoryChannel({ id: "ch-1", categoryId: "cat-1" }),
        factoryChannel({ id: "ch-2", categoryId: null }),
      ] as any);

      const result = await getRoomStructure("r1");

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0]!.channels).toHaveLength(1);
      expect(result.uncategorized).toHaveLength(1);
    });

    it("throws 404 when the room does not exist", async () => {
      prismaMock.chatRoom.findUnique.mockResolvedValue(null as any);

      await expect(getRoomStructure("r1")).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });
  });

  describe("assertChannelInRoom", () => {
    it("returns the channel when found", async () => {
      prismaMock.channel.findFirst.mockResolvedValue(factoryChannel() as any);

      await expect(assertChannelInRoom("r1", "ch-1")).resolves.toBeDefined();
    });

    it("throws 404 when the channel is in another room", async () => {
      prismaMock.channel.findFirst.mockResolvedValue(null as any);

      await expect(assertChannelInRoom("r1", "ch-1")).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });
  });
});
