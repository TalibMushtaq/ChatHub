import { Router } from "express";
import type { Gender } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import requireAuth from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/async-handler";
import { createLogger } from "../../lib/logger";
import { userZod } from "@repo/validators";
import { PasswordService } from "../../services/PasswordService";
import { PASSWORD_HASH_OPTIONS, hashPassword } from "../../lib/password";

const router = Router();
const log = createLogger("updateMe");

const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const passwordService = new PasswordService(PASSWORD_HASH_OPTIONS, DUMMY_HASH);

// Username is immutable after signup; reject it explicitly even though the
// validator no longer accepts it, so a misbehaving client gets a clear error.
function rejectUsername(body: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(body, "username");
}

// Convert empty strings for optional text fields to null so the database stays
// clean and the UI treats "cleared" the same as "never set".
function emptyToNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value.trim() || null;
}

/**
 * PATCH /me
 *
 * Update the authenticated user's profile. Supports partial updates:
 * displayName, bio, gender, dateOfBirth. Also supports password changes when
 * both currentPassword and newPassword are supplied.
 *
 * Security:
 * - Username changes are explicitly rejected.
 * - Current password is verified before allowing a password change.
 * - Session cache is busted after any update so /auth/me returns fresh data.
 */
router.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (rejectUsername(req.body)) {
      return res
        .status(400)
        .json({ ok: false, error: "Username cannot be changed" });
    }

    const parsed = userZod.updateMe.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    const userId = req.user.id;
    const data = parsed.data;

    const wantsPasswordChange =
      data.currentPassword !== undefined && data.newPassword !== undefined;

    const updateData: {
      displayName?: string | null;
      bio?: string | null;
      gender?: Gender | null;
      dateOfBirth?: Date | null;
      passwordHash?: string;
    } = {};

    if (Object.prototype.hasOwnProperty.call(data, "displayName")) {
      updateData.displayName = emptyToNull(data.displayName);
    }
    if (Object.prototype.hasOwnProperty.call(data, "bio")) {
      updateData.bio = emptyToNull(data.bio);
    }
    if (Object.prototype.hasOwnProperty.call(data, "gender")) {
      // Zod already restricted the value to the Prisma Gender enum, so the cast
      // is safe and lets Prisma accept the enum type instead of a plain string.
      updateData.gender = (data.gender as Gender | null) ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(data, "dateOfBirth")) {
      updateData.dateOfBirth = data.dateOfBirth ?? null;
    }

    if (wantsPasswordChange) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });

      const passwordHash = user?.passwordHash ?? DUMMY_HASH;
      const isValid = await passwordService.verify(
        passwordHash,
        data.currentPassword!,
      );

      if (!isValid || !user?.passwordHash) {
        return res
          .status(403)
          .json({ ok: false, error: "Current password is incorrect" });
      }

      updateData.passwordHash = await hashPassword(data.newPassword!);
    }

    const hasUpdates = Object.keys(updateData).length > 0;

    const user = hasUpdates
      ? await prisma.user.update({
          where: { id: userId },
          data: updateData,
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            avatar: true,
            bio: true,
            gender: true,
            dateOfBirth: true,
            createdAt: true,
          },
        })
      : req.user;

    // Bust the session cache so subsequent requests see the new profile data.
    if (req.session.userCache) {
      req.session.userCache.cachedAt = 0;
    }

    log.info("User profile updated", {
      userId,
      fields: Object.keys(updateData),
    });

    res.json({ ok: true, user });
  }),
);

export default router;
