/**
 * RecoveryCodeService — core business logic for recovery code lifecycle.
 *
 * Design principles:
 * - Dependency injection: Prisma client and PasswordService are constructor args,
 *   enabling unit tests with mock/stub dependencies.
 * - No plaintext persistence: only Argon2id hashes and public codeIds touch the DB.
 * - Atomic redemption: Prisma `$transaction` with conditional `updateMany` prevents
 *   concurrent requests from redeeming the same code twice.
 * - Single-responsibility: routes call these methods; routes do not write Prisma
 *   queries or Argon2 calls directly.
 */

import type { PrismaClient } from "@prisma/client";
import { PasswordService } from "./PasswordService";
import {
  generateRecoveryCodes,
  parseRecoveryCode,
  type GeneratedCode,
} from "../lib/recoveryCode";
import { audit } from "../lib/audit";
import {
  RECOVERY_CODE_COUNT,
  RECOVERY_ARGON2_MEMORY_COST,
  RECOVERY_ARGON2_TIME_COST,
  RECOVERY_ARGON2_PARALLELISM,
} from "../config/recoveryCodes";

export interface RecoveryCodeRow {
  id: string;
  userId: string;
  codeId: string;
  hash: string;
  used: boolean;
  createdAt: Date;
  usedAt: Date | null;
}

export class RecoveryCodeService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Generate a fresh batch of recovery codes for a user.
   *
   * Hashes are persisted; plaintext codes are returned once and never stored.
   */
  async generate(userId: string): Promise<GeneratedCode[]> {
    const codes = generateRecoveryCodes(RECOVERY_CODE_COUNT);

    const hashOptions = {
      type: this.passwordService.hashOptions.type,
      memoryCost: RECOVERY_ARGON2_MEMORY_COST,
      timeCost: RECOVERY_ARGON2_TIME_COST,
      parallelism: RECOVERY_ARGON2_PARALLELISM,
    };

    const rows = await Promise.all(
      codes.map(async (code) => ({
        userId,
        codeId: code.codeId,
        hash: await this.passwordService.hash(code.secret),
      })),
    );

    await this.prisma.recoveryCode.createMany({ data: rows });

    audit("RECOVERY_CODES_CREATED", { userId });

    return codes;
  }

  /**
   * Verify a recovery code without side effects (does not mark used).
   *
   * Looks up the code by `(userId, codeId)` and verifies the Argon2id hash.
   * Returns the matching DB row so callers can inspect `used` status.
   */
  async verify(
    userId: string,
    codeId: string,
    secret: string,
  ): Promise<{ valid: boolean; code: RecoveryCodeRow | null }> {
    const code = await this.prisma.recoveryCode.findUnique({
      where: { userId_codeId: { userId, codeId } },
    });

    if (!code) {
      return { valid: false, code: null };
    }

    const isValid = await this.passwordService.verify(code.hash, secret);
    return { valid: isValid, code };
  }

  /**
   * Redeem a recovery code to reset a password.
   *
   * All writes happen inside a single Prisma transaction:
   * 1. Atomically mark the code used (conditional updateMany).
   * 2. Update the user's password.
   * 3. Delete all remaining recovery codes for the user.
   * 4. Insert a brand-new batch of recovery codes.
   *
   * Returns the new plaintext recovery codes.
   *
   * Race-condition safety:
   * Step 1 uses `updateMany` with `where: { id: code.id, used: false }`.
   * PostgreSQL row-level locks guarantee that only one concurrent transaction
   * can flip `used` from false → true. The second transaction receives a
   * count of 0 and aborts with an error.
   */
  async redeem(
    userId: string,
    codeId: string,
    secret: string,
    newPassword: string,
  ): Promise<GeneratedCode[]> {
    // Verify the code before entering the transaction so we don't waste
    // a DB transaction on an invalid code.
    const { valid, code } = await this.verify(userId, codeId, secret);
    if (!valid || !code || code.used) {
      audit("RECOVERY_CODE_FAILED", {
        userId,
        codeId,
        reason: "invalid_or_used",
      });
      throw new Error("Invalid or already used recovery code");
    }

    const newPasswordHash = await this.passwordService.hash(newPassword);
    const newCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);

    await this.prisma.$transaction(async (tx) => {
      // --- Atomic redemption ---
      const updateResult = await tx.recoveryCode.updateMany({
        where: { id: code.id, used: false },
        data: { used: true, usedAt: new Date() },
      });

      if (updateResult.count === 0) {
        // Another request won the race and already redeemed this code.
        throw new Error("Recovery code already redeemed");
      }

      // --- Update password ---
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });

      // --- Delete all remaining recovery codes ---
      await tx.recoveryCode.deleteMany({ where: { userId } });

      // --- Insert fresh codes ---
      const rows = await Promise.all(
        newCodes.map(async (c) => ({
          userId,
          codeId: c.codeId,
          hash: await this.passwordService.hash(c.secret),
        })),
      );
      await tx.recoveryCode.createMany({ data: rows });
    });

    audit("RECOVERY_CODE_REDEEMED", { userId, codeId });
    audit("PASSWORD_RESET_VIA_RECOVERY_CODE", { userId });
    audit("RECOVERY_CODES_CREATED", { userId });

    return newCodes;
  }

  /**
   * Regenerate (rotate) all recovery codes for a user.
   *
   * Hard-deletes previous codes and generates a fresh batch.
   * Used when the user explicitly requests new codes via POST /auth/recovery-codes.
   */
  async regenerate(userId: string): Promise<GeneratedCode[]> {
    // Hard-delete all existing codes.
    await this.prisma.recoveryCode.deleteMany({ where: { userId } });

    const newCodes = await this.generate(userId);

    audit("RECOVERY_CODES_REGENERATED", { userId });

    return newCodes;
  }

  /** Alias for `regenerate`. */
  rotate(userId: string): Promise<GeneratedCode[]> {
    return this.regenerate(userId);
  }
}
