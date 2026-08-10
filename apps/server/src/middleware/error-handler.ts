import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ApiError } from "../lib/ApiError";
import { AppError } from "../lib/AppError";
import { createLogger } from "../lib/logger";

const log = createLogger("errorHandler");

/**
 * Centralized Express error handler.
 *
 * Translates:
 * - ApiError / AppError → JSON response with statusCode and optional code
 * - Prisma P2002 → 409 Conflict
 * - Prisma P2025 → 404 Not Found
 * - Everything else → 500 Server error (logged)
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Responses already sent (e.g. streaming) must be delegated to Express'
  // default handler, which closes the connection instead of writing twice.
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      ok: false,
      error: err.message,
      ...(err.code && { code: err.code }),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ ok: false, error: err.message });
    return;
  }

  // Prisma throws structured error codes; mapping them here prevents
  // generic 500 responses for predictable failure modes (unique-violation,
  // record-not-found) that the client can handle meaningfully.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({ ok: false, error: "Conflict" });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ ok: false, error: "Resource not found" });
      return;
    }
  }

  log.error("Unhandled error", err, {
    method: req.method,
    path: req.originalUrl ?? req.url,
  });
  res.status(500).json({ ok: false, error: "Server error" });
}
