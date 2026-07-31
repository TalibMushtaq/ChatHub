/**
 * Standard application error with an HTTP status code.
 *
 * Why: Replaces ad-hoc `throw new Error("NOT_FOUND")` + switch/catch patterns
 * with a single class that carries both the message and the status code.
 * Handlers can simply `catch (err) { if (err instanceof AppError) ... }`.
 */
export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Authorization error (HTTP 403 Forbidden).
 *
 * Why: Distinguishes authorization failures from other application errors.
 * Authorization middleware can catch this and return a consistent 403 response
 * without relying on string comparisons or generic Error objects.
 */
export class ForbiddenError extends AppError {
  constructor(message = "Not authorized") {
    super(message, 403);
  }
}

/**
 * Not-found error (HTTP 404).
 *
 * Why: Distinguishes missing resources from authorization failures and
 * other errors. Used when a looked-up entity doesn't exist.
 */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}
