import { ApiError } from "./ApiError";

/**
 * Structural shape of a Zod `safeParse` result.
 *
 * Typed structurally so the server doesn't need a direct zod dependency —
 * all schemas live in @repo/validators.
 */
export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: { message?: string }[] } };

/** First validation issue message, or `fallback` when the error carries none. */
export function firstIssueMessage(
  error: { issues: { message?: string }[] },
  fallback = "Invalid input",
): string {
  return error.issues[0]?.message ?? fallback;
}

/**
 * Returns the parsed data or throws an ApiError so the centralized error
 * handler produces the response.
 *
 * Defaults to `400` with the first validation issue as the message; params
 * validation usually overrides both (e.g. 404 "Message not found") so an
 * invalid id is indistinguishable from a missing resource.
 */
export function unwrapParsed<T>(
  result: ParseResult<T>,
  options: { status?: number; message?: string; fallback?: string } = {},
): T {
  if (result.success) return result.data;

  const { status = 400, message, fallback } = options;
  throw new ApiError(
    message ?? firstIssueMessage(result.error, fallback),
    status,
  );
}
