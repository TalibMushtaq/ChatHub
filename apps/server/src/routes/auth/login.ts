import { Request, Response } from "express";
import express from "express";
import { verifyPassword } from "../../lib/password";
import { prisma } from "../../../db/prisma";
import { userZod } from "@repo/validators";
import { createRateLimiter } from "../../lib/rateLimiter";

const router = express.Router();
const loginRateLimiter = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });

router.post("/login", async (req: Request, res: Response) => {
  const clientIp = req.ip ?? "unknown";
  if (loginRateLimiter(clientIp)) {
    return res.status(429).json({ ok: false, error: "Too many attempts" });
  }
  if (req.session.userId) {
    return res.status(200).json({
      ok: true,
      message: "Already logged in",
      userId: req.session.userId,
    });
  }

  try {
    const parseResult = userZod.login.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        ok: false,
        error: "invalid input",
        details: parseResult.error.issues,
      });
    }

    const data = parseResult.data;
    const password = parseResult.data.password;
    let user = null;
    let ok = null;

    if ("email" in data) {
      const email = data.email.toLowerCase();
      user = await prisma.user.findUnique({
        where: { email: email },
      });
    } else {
      user = await prisma.user.findUnique({
        where: { username: data.username.toLowerCase() },
      });
    }

    if (!user)
      return res.status(401).json({ ok: false, error: "Invalid credentials " });

    if (!user.passwordHash) {
      return res.status(401).json({
        ok: false,
        error:
          "This account uses Passport login. Password login is not available.",
      });
    }
    ok = await verifyPassword(user.passwordHash, password);

    if (!ok)
      return res
        .status(401)
        .json({ ok: false, error: "Invalid credentials Password" });
    req.session.userId = user.id;
    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayname: user.displayname,
      },
    });
  } catch (err: any) {
    console.log(err, "login end Point");
    return res.status(500).json({ ok: false, error: "server error" });
  }
});

export default router;
