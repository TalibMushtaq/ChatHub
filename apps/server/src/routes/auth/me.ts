import type { Request, Response } from "express";
import express from "express";
import requireAuth from "../../middleware/requireAuth";

const router = express.Router();

/**
 * GET /me
 *
 * Returns the authenticated user's profile.
 *
 * The requireAuth middleware already:
 *  1. Validates the session
 *  2. Loads the user from DB (or cache) with the exact fields below
 *  3. Attaches the user to req.user
 *
 * Therefore no additional database query is needed here.
 *
 * AuthUser fields: id, email, username, displayName, avatar, bio, gender,
 * dateOfBirth, status, customStatus, showOnlineStatus, showTypingStatus,
 * createdAt
 */
router.get("/me", requireAuth, (req: Request, res: Response) => {
  // requireAuth guarantees req.user is defined (returns 401 otherwise).
  res.json({ ok: true, user: req.user });
});

export default router;
