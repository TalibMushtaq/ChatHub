/**
 * POST /auth/recovery-codes
 *
 * Regenerate recovery codes for the authenticated user.
 *
 * Requirements:
 * - User must be authenticated.
 * - Current password must be provided and verified.
 * - All previous recovery codes are hard-deleted.
 * - A fresh batch of 10 codes is generated, persisted (hashes only), and
 *   returned plaintext once.
 *
 * Security properties:
 * - No GET endpoint exists to retrieve codes — they are shown once only.
 * - Password verification prevents an attacker who hijacks a session from
 *   generating new codes without also knowing the password.
 * - Hard-delete ensures old codes cannot be recovered even if the DB is
 *   compromised after this operation.
 */

import { Router } from "express";
import { prisma } from "../../../db/prisma";
import requireAuth from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/async-handler";
import { createLogger } from "../../lib/logger";
import { regenerateRecoveryCodesSchema } from "@repo/validators";
import { RecoveryCodeService } from "../../services/RecoveryCodeService";
import { PasswordService } from "../../services/PasswordService";
import { PASSWORD_HASH_OPTIONS } from "../../lib/password";
import { issueRecoveryToken } from "../../services/recoveryShow";

const log = createLogger("recoveryCodes");
const router = Router();

const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const passwordService = new PasswordService(PASSWORD_HASH_OPTIONS, DUMMY_HASH);
const recoveryService = new RecoveryCodeService(prisma, passwordService);

router.post(
  "/recovery-codes",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // --- Validate body ---
    const parsed = regenerateRecoveryCodesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    const { currentPassword } = parsed.data;

    // --- Fetch user's password hash ---
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user || !user.passwordHash) {
      // Consistent error regardless of whether the user lacks a password
      // (OAuth-only account) or something else is wrong.
      return res.status(403).json({
        ok: false,
        error: "Unable to regenerate recovery codes",
      });
    }

    // --- Verify current password ---
    const isValid = await passwordService.verify(
      user.passwordHash,
      currentPassword,
    );
    if (!isValid) {
      return res.status(403).json({
        ok: false,
        error: "Unable to regenerate recovery codes",
      });
    }

    // --- Regenerate codes ---
    const newCodes = await recoveryService.regenerate(userId);

    log.info("Recovery codes regenerated", { userId });

    // Fresh codes are returned as a one-time token so they never appear in
    // the response body where a proxy or logger could capture them.
    const recoveryToken = await issueRecoveryToken(newCodes);

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      ok: true,
      recoveryToken,
    });
  }),
);

export default router;
