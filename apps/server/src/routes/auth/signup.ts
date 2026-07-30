import { Request, Response } from "express";
import express from "express";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../../db/prisma";
import { userZod } from "@repo/validators";
import crypto from "node:crypto";
import { createRateLimiter } from "../../lib/rateLimiter";

const router = express.Router();
const signupRateLimiter = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });

router.post("/signup", async (req: Request, res: Response) => {
  const clientIp = req.ip ?? "unknown";
  if (signupRateLimiter(clientIp)) {
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
    const parseResult = userZod.signup.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        ok: false,
        error: "invalid input",
        details: parseResult.error.issues,
      });
    }

    const email = parseResult.data.email.trim().toLowerCase();
    const username = parseResult.data.username.trim().toLowerCase();
    const password = parseResult.data.password;
    const displayname = parseResult.data.displayname;

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true },
    });

    if (existingUser) {
      return res.status(409).json({
        ok: false,
        error: "Email or username already exists",
      });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email,
        username,
        displayname,
        passwordHash,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        displayname: true,
        username: true,
        createdAt: true,
      },
    });

    req.session.userId = user.id;

    return res.status(201).json({ ok: true, user });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
