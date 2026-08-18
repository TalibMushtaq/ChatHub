import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  updateRoom,
  deleteRoom,
  seedDefaultStructure,
} from "../../../../src/services/room/roomSettings";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("roomSettings service", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  describe("updateRoom", () => {
    it("updates the room for the owner", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "OWNER",
      } as any);
      prismaMock.chatRoom.findUnique.mockResolvedValue({ id: "r1" } as any);
      prismaMock.chatRoom.update.mockResolvedValue({ id: "r1" } as any);

      const result = await updateRoom("u1", "r1", {
        name: "New name",
        description: "New description",
      });

      expect(result.id).toBe("r1");
      expect(prismaMock.chatRoom.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "r1" },
          data: { name: "New name", description: "New description" },
        }),
      );
    });

    it("updates only the avatar when other fields are absent", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "OWNER",
      } as any);
      prismaMock.chatRoom.findUnique.mockResolvedValue({ id: "r1" } as any);
      prismaMock.chatRoom.update.mockResolvedValue({ id: "r1" } as any);

      await updateRoom("u1", "r1", { avatarKey: "avatars/rooms/r1/new.png" });

      expect(prismaMock.chatRoom.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { avatar: "avatars/rooms/r1/new.png" },
        }),
      );
    });

    it("throws 403 for an admin (room edits are owner-only)", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);

      await expect(
        updateRoom("u1", "r1", { name: "Hacked" }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });

    it("throws 404 when the room does not exist", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "OWNER",
      } as any);
      prismaMock.chatRoom.findUnique.mockResolvedValue(null as any);

      await expect(updateRoom("u1", "r1", { name: "X" })).rejects.toMatchObject(
        {
          statusCode: 404,
          code: "NOT_FOUND",
        },
      );
    });
  });

  describe("deleteRoom", () => {
    it("deletes the room for the owner", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "OWNER",
      } as any);
      prismaMock.chatRoom.findUnique.mockResolvedValue({ id: "r1" } as any);

      await deleteRoom("u1", "r1");

      expect(prismaMock.chatRoom.delete).toHaveBeenCalledWith({
        where: { id: "r1" },
      });
    });

    it("throws 403 for a non-owner", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "ADMIN",
      } as any);

      await expect(deleteRoom("u1", "r1")).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
      expect(prismaMock.chatRoom.delete).not.toHaveBeenCalled();
    });

    it("throws 404 when the room does not exist", async () => {
      prismaMock.chatRoomMember.findUnique.mockResolvedValue({
        role: "OWNER",
      } as any);
      prismaMock.chatRoom.findUnique.mockResolvedValue(null as any);

      await expect(deleteRoom("u1", "r1")).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
      expect(prismaMock.chatRoom.delete).not.toHaveBeenCalled();
    });
  });

  describe("seedDefaultStructure", () => {
    it("seeds GENERAL + #general idempotently", async () => {
      prismaMock.category.upsert.mockResolvedValue({
        id: "cat-1",
        roomId: "r1",
        name: "GENERAL",
      } as any);
      prismaMock.channel.upsert.mockResolvedValue({ id: "ch-1" } as any);

      await seedDefaultStructure("r1");

      expect(prismaMock.category.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { roomId_name: { roomId: "r1", name: "GENERAL" } },
          create: { roomId: "r1", name: "GENERAL", position: 0 },
        }),
      );
      expect(prismaMock.channel.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { roomId_name: { roomId: "r1", name: "general" } },
          create: expect.objectContaining({
            categoryId: "cat-1",
            name: "general",
            type: "TEXT",
          }),
        }),
      );
    });
  });
});
