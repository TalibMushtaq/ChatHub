import { describe, it, expect, vi, beforeEach } from "vitest";
import argon2 from "argon2";
import { RecoveryCodeService } from "../../../src/services/RecoveryCodeService";
import { PasswordService } from "../../../src/services/PasswordService";
import {
  prismaMock,
  resetPrismaMock,
  createMockTransaction,
} from "../../mocks/prisma";
import { createRecoveryCodeRow } from "../../factories/room";

describe("RecoveryCodeService", () => {
  const hashOptions = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  };
  const dummyHash = "dummy";

  let passwordService: PasswordService;
  let service: RecoveryCodeService;

  beforeEach(() => {
    resetPrismaMock();
    passwordService = new PasswordService(hashOptions, dummyHash);
    service = new RecoveryCodeService(prismaMock, passwordService);
    vi.clearAllMocks();
  });

  describe("generate", () => {
    it("should create recovery codes and persist hashes", async () => {
      prismaMock.recoveryCode.createMany.mockResolvedValue({ count: 10 });
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(prismaMock),
      );

      const codes = await service.generate("user-1");

      expect(codes).toHaveLength(10);
      expect(prismaMock.recoveryCode.createMany).toHaveBeenCalledOnce();
      const data = prismaMock.recoveryCode.createMany.mock.calls[0]![0].data;
      expect(data).toHaveLength(10);
      expect(data[0]).toHaveProperty("userId", "user-1");
      expect(data[0]).toHaveProperty("codeId");
      expect(data[0]).toHaveProperty("hash");
    });
  });

  describe("verify", () => {
    it("should return valid=true for a matching code", async () => {
      const row = createRecoveryCodeRow({
        userId: "u1",
        codeId: "ABC123",
        used: false,
      });
      prismaMock.recoveryCode.findUnique.mockResolvedValue(row);
      vi.spyOn(passwordService, "verify").mockResolvedValue(true);

      const result = await service.verify("u1", "ABC123", "secret");

      expect(result.valid).toBe(true);
      expect(result.code).toEqual(row);
    });

    it("should return valid=false when code does not exist", async () => {
      prismaMock.recoveryCode.findUnique.mockResolvedValue(null);

      const result = await service.verify("u1", "ABC123", "secret");

      expect(result.valid).toBe(false);
      expect(result.code).toBeNull();
    });

    it("should return valid=false when hash verification fails", async () => {
      const row = createRecoveryCodeRow({
        userId: "u1",
        codeId: "ABC123",
        used: false,
      });
      prismaMock.recoveryCode.findUnique.mockResolvedValue(row);
      vi.spyOn(passwordService, "verify").mockResolvedValue(false);

      const result = await service.verify("u1", "ABC123", "wrong");

      expect(result.valid).toBe(false);
      expect(result.code).toEqual(row);
    });
  });

  describe("redeem", () => {
    it("should redeem a valid code and rotate the set", async () => {
      const row = createRecoveryCodeRow({
        userId: "u1",
        codeId: "ABC123",
        used: false,
      });
      prismaMock.recoveryCode.findUnique.mockResolvedValue(row);
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(prismaMock),
      );
      prismaMock.recoveryCode.updateMany.mockResolvedValue({ count: 1 });
      vi.spyOn(passwordService, "verify").mockResolvedValue(true);
      vi.spyOn(passwordService, "hash").mockResolvedValue("new-hash");

      const newCodes = await service.redeem(
        "u1",
        "ABC123",
        "secret",
        "NewPassword1!",
      );

      expect(newCodes).toHaveLength(10);
      // Inside the transaction: updateMany, user.update, deleteMany, createMany
      expect(prismaMock.recoveryCode.updateMany).toHaveBeenCalledOnce();
      expect(prismaMock.user.update).toHaveBeenCalledOnce();
      expect(prismaMock.recoveryCode.deleteMany).toHaveBeenCalledOnce();
      expect(prismaMock.recoveryCode.createMany).toHaveBeenCalledOnce();
    });

    it("should throw when code is invalid", async () => {
      prismaMock.recoveryCode.findUnique.mockResolvedValue(null);

      await expect(
        service.redeem("u1", "ABC123", "secret", "pass"),
      ).rejects.toThrow("Invalid or already used recovery code");
    });

    it("should throw when code is already used", async () => {
      const row = createRecoveryCodeRow({
        userId: "u1",
        codeId: "ABC123",
        used: true,
      });
      prismaMock.recoveryCode.findUnique.mockResolvedValue(row);
      vi.spyOn(passwordService, "verify").mockResolvedValue(true);

      await expect(
        service.redeem("u1", "ABC123", "secret", "pass"),
      ).rejects.toThrow("Invalid or already used recovery code");
    });

    it("should throw when updateMany returns 0 (race condition)", async () => {
      const row = createRecoveryCodeRow({
        userId: "u1",
        codeId: "ABC123",
        used: false,
      });
      prismaMock.recoveryCode.findUnique.mockResolvedValue(row);
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(prismaMock),
      );
      prismaMock.recoveryCode.updateMany.mockResolvedValue({ count: 0 });
      vi.spyOn(passwordService, "verify").mockResolvedValue(true);

      await expect(
        service.redeem("u1", "ABC123", "secret", "pass"),
      ).rejects.toThrow("Recovery code already redeemed");
    });
  });

  describe("regenerate", () => {
    it("should delete all old codes and generate new ones", async () => {
      prismaMock.recoveryCode.deleteMany.mockResolvedValue({ count: 10 });
      prismaMock.recoveryCode.createMany.mockResolvedValue({ count: 10 });
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(prismaMock),
      );
      vi.spyOn(passwordService, "hash").mockResolvedValue("hash");

      const codes = await service.regenerate("u1");

      expect(codes).toHaveLength(10);
      expect(prismaMock.recoveryCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
      });
      expect(prismaMock.recoveryCode.createMany).toHaveBeenCalledOnce();
    });
  });

  describe("rotate", () => {
    it("should be an alias for regenerate", async () => {
      prismaMock.recoveryCode.deleteMany.mockResolvedValue({ count: 10 });
      prismaMock.recoveryCode.createMany.mockResolvedValue({ count: 10 });
      prismaMock.$transaction.mockImplementation(
        createMockTransaction(prismaMock),
      );
      vi.spyOn(passwordService, "hash").mockResolvedValue("hash");

      const codes = await service.rotate("u1");

      expect(codes).toHaveLength(10);
      expect(prismaMock.recoveryCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1" },
      });
    });
  });
});
