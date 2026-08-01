/**
 * ApiError — single application error class for the direct-chat module.
 *
 * Replaces ad-hoc AppError/ForbiddenError/NotFoundError proliferation
 * with one typed throwable that carries statusCode and an optional machine-readable code.
 *
 * Why scoped instead of global rename:
 * - AppError is used across 5 room-route files; touching them is out of scope.
 * - A follow-up ticket can consolidate AppError + ApiError later.
 */
export class ApiError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode = statusCode;
    // Machine-readable code lets the frontend branch on error type
    // without fragile string-matching on message text.
    this.code = code;
  }
}
