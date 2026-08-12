import type { Socket } from "socket.io";
import { ApiError } from "./ApiError";
import { firstIssueMessage, type ParseResult } from "./validate";

export interface AckResponse {
  ok: boolean;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

export type AckCallback = (response: AckResponse) => void;

/** Structural shape of a validator schema, so this module needs no zod import. */
interface AckSchema<T> {
  safeParse(input: unknown): ParseResult<T>;
}

/**
 * Registers a socket event that follows Socket.IO's native ack convention:
 * `socket.emit(event, payload, callback)`.
 *
 * Keeps the per-event handlers down to their actual business logic.
 */
export function onAck<T>(
  socket: Socket,
  event: string,
  schema: AckSchema<T>,
  handler: (data: T, ack: AckCallback) => Promise<void>,
): void {
  socket.on(event, async (payload, callback) => {
    if (typeof callback !== "function") {
      socket.emit("chatroom:error", {
        code: "INVALID_CALLBACK",
        message: "callback must be a function",
      });
      return;
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      callback({
        ok: false,
        error: firstIssueMessage(parsed.error, "Invalid payload"),
      });
      return;
    }

    try {
      await handler(parsed.data, callback);
    } catch (err: unknown) {
      // Preserve ApiError codes so the client can branch on them; anything
      // else is an unexpected failure and reported generically.
      if (err instanceof ApiError) {
        callback({ ok: false, error: err.message, code: err.code });
      } else {
        callback({ ok: false, error: "Server error" });
      }
    }
  });
}
