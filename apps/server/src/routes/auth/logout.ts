import type { Request, Response } from "express";
import express from "express";
import { createLogger } from "../../lib/logger";

const log = createLogger("logout");

const router = express.Router();

router.post("/logout", (req: Request, res: Response) => {
  if (!req.session) {
    res.json({ ok: true });
    return;
  }

  req.session.destroy((err) => {
    if (err) {
      log.error("Failed to destroy session", err);
      res.status(500).json({ ok: false, error: "Failed to logout" });
      return;
    }

    // Clear the cookie with the same options used when setting it.
    // The browser requires matching path, httpOnly, secure, and sameSite
    // to actually remove the cookie.
    res.clearCookie("chathubby.sid", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    res.json({ ok: true });
  });
});

export default router;
