import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an async Express route handler so rejected promises are forwarded
 * to the centralized error handler via `next(err)`.
 *
 * This removes repetitive try/catch blocks from every route.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    // Use Promise.resolve().then(...) instead of Promise.resolve(fn(...))
    // so that synchronous throws inside fn are also forwarded to next(err).
    Promise.resolve().then(() => fn(req, res, next)).catch(next);
  };
}
