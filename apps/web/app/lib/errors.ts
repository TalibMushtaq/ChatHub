import { isAxiosError } from "axios";

/**
 * Extracts a user-presentable message from an unknown error.
 *
 * Server responses use `{ ok: false, error }`, but some endpoints and
 * third-party services use `message`, so both are checked before falling
 * back to a caller-supplied default.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    return err.response?.data?.error || err.response?.data?.message || fallback;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}
