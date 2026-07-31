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
