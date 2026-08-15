import type { Server, Socket } from "socket.io";
import { prisma } from "../../db/prisma";
import {
  PRESENCE_INVISIBLE,
  PRESENCE_IDLE_THRESHOLD_MS,
  type PresenceKind,
  type PresenceState,
  getPresence,
  getAllUserIdsWithConnections,
  setUserStatus as persistUserStatus,
  setIdle,
  trackConnection,
} from "../services/presence";
import { createLogger } from "../lib/logger";
import { updateStatusSchema } from "@repo/validators";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../types/socket-events";

const log = createLogger("presenceSocket");

// How often the idle sweep runs. Keep this well below the idle threshold so a
// user is flagged within a minute of their heartbeat stopping.
const PRESENCE_SWEEP_INTERVAL_MS = 60_000;

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export interface PublicPresence {
  userId: string;
  presence: PresenceKind;
  status: string | null;
  customStatus: string | null;
}

// ---------------------------------------------------------------------------
// Gating helpers
// ---------------------------------------------------------------------------

/**
 * The presence payload the owner's own sessions always receive — real values,
 * never filtered. Only used for the `user:{userId}` room.
 */
export function toOwnPresencePayload(
  userId: string,
  state: PresenceState,
): PublicPresence {
  return {
    userId,
    presence: state.presence,
    status: state.status,
    customStatus: state.customStatus,
  };
}

/**
 * The presence payload everyone else may see, or null when the user hides
 * their online status entirely.
 *
 * - showOnlineStatus=false -> nothing at all (fully hidden).
 * - INVISIBLE -> appear "offline" with no status/custom status (leaking the
 *   chosen status would defeat the purpose of Invisible mode).
 * - otherwise -> the real presence + status.
 */
export function publicPresencePayload(
  userId: string,
  state: PresenceState,
): PublicPresence | null {
  if (!state.showOnlineStatus) return null;

  if (state.status === PRESENCE_INVISIBLE) {
    return { userId, presence: "offline", status: null, customStatus: null };
  }

  return {
    userId,
    presence: state.presence,
    status: state.status,
    customStatus: state.customStatus,
  };
}

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

/**
 * Broadcast a user's current presence: real payload to the user's own
 * sessions, gated payload to everyone else (so Invisible users still see their
 * own real presence while others see "offline").
 */
export async function broadcastPresenceChanged(
  io: TypedServer,
  userId: string,
): Promise<void> {
  const state = await getPresence(userId);
  if (!state) return;

  const ownRoom = `user:${userId}`;
  io.to(ownRoom).emit("presence:changed", toOwnPresencePayload(userId, state));

  const gated = publicPresencePayload(userId, state);
  if (gated) {
    io.except(ownRoom).emit("presence:changed", gated);
  }
}

/**
 * Push a one-time "offline" payload to everyone except the user when they turn
 * off online-status sharing, so clients clear any cached online dot instead of
 * showing stale presence until the next reload. The user's own sessions are
 * unaffected (their privacy choice does not change what they see).
 */
export function broadcastPresenceHidden(io: TypedServer, userId: string): void {
  io.except(`user:${userId}`).emit("presence:changed", {
    userId,
    presence: "offline",
    status: null,
    customStatus: null,
  });
}

/**
 * Send a freshly connected socket the gated presence of every currently
 * present user, so a reload doesn't leave the UI with blank dots until the
 * next presence change. The connecting user's own presence is skipped — it is
 * broadcast to their `user:` room by the connect handler.
 */
export async function emitPresenceSnapshot(
  io: TypedServer,
  socket: TypedSocket,
): Promise<void> {
  const myId = socket.data.user.id;
  const userIds = await getAllUserIdsWithConnections();

  for (const userId of userIds) {
    if (userId === myId) continue;
    const state = await getPresence(userId);
    if (!state) continue;
    const gated = publicPresencePayload(userId, state);
    if (gated) socket.emit("presence:changed", gated);
  }
}

// ---------------------------------------------------------------------------
// Shared persistence
// ---------------------------------------------------------------------------

/**
 * Persist a manual status change and sync it into the presence blob. Shared by
 * the REST route (PATCH /auth/me/status) and the presence:setStatus socket
 * handler so both paths behave identically.
 */
export async function updateUserStatus(
  userId: string,
  data: { status?: string; customStatus?: string | null },
): Promise<{ id: string; status: string; customStatus: string | null }> {
  // Normalize an empty custom status to null so "cleared" is stored the same
  // as "never set", matching how updateMe treats cleared optional text fields.
  const customStatus =
    data.customStatus === undefined
      ? undefined
      : (data.customStatus ?? "").trim() || null;

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.status !== undefined && { status: data.status }),
      ...(customStatus !== undefined && { customStatus }),
    },
    select: { id: true, status: true, customStatus: true },
  });

  await persistUserStatus(userId, user.status, user.customStatus);
  return user;
}

// ---------------------------------------------------------------------------
// Socket registration
// ---------------------------------------------------------------------------

/**
 * Register presence socket handlers:
 * - presence:heartbeat — tab liveness signal; also flips an idle user back to
 *   online (trackConnection rewrites presence) and extends key TTLs.
 * - presence:setStatus — live status change from the client.
 */
export function registerPresence(io: TypedServer, socket: TypedSocket): void {
  const { user } = socket.data;

  socket.on("presence:heartbeat", async () => {
    try {
      await trackConnection(user.id, socket.id, {
        status: user.status,
        customStatus: user.customStatus,
        showOnlineStatus: user.showOnlineStatus,
        showTypingStatus: user.showTypingStatus,
      });
      await broadcastPresenceChanged(io, user.id);
    } catch (err: unknown) {
      log.error("presence:heartbeat failed", err, { userId: user.id });
    }
  });

  socket.on("presence:setStatus", async (payload: unknown) => {
    const parsed = updateStatusSchema.safeParse(payload);
    if (!parsed.success) return;
    const { status, customStatus } = parsed.data;
    if (status === undefined && customStatus === undefined) return;

    try {
      const updated = await updateUserStatus(user.id, { status, customStatus });
      // Keep socket.data fresh so the typing gate and future heartbeats read
      // the new values without waiting for a reconnect.
      socket.data.user.status = updated.status;
      socket.data.user.customStatus = updated.customStatus;
      await broadcastPresenceChanged(io, user.id);
    } catch (err: unknown) {
      log.error("presence:setStatus failed", err, { userId: user.id });
    }
  });
}

// ---------------------------------------------------------------------------
// Idle sweep
// ---------------------------------------------------------------------------

/**
 * Periodically mark users idle when their last heartbeat is older than the
 * idle threshold. Only users with a live connection set are considered, so
 * fully-disconnected users are handled by removeConnection instead.
 */
export async function sweepIdleUsers(io: TypedServer): Promise<void> {
  const userIds = await getAllUserIdsWithConnections();
  const now = Date.now();

  for (const userId of userIds) {
    const state = await getPresence(userId);
    if (!state || state.presence === "offline") continue;
    if (now - state.lastActiveAt >= PRESENCE_IDLE_THRESHOLD_MS) {
      const updated = await setIdle(userId);
      if (updated) {
        await broadcastPresenceChanged(io, userId);
      }
    }
  }
}

/**
 * Start the idle sweep interval. `unref()` keeps the interval from holding the
 * process open in tests or after shutdown.
 */
export function startPresenceSweeper(io: TypedServer): NodeJS.Timeout {
  const timer = setInterval(() => {
    void sweepIdleUsers(io).catch((err: unknown) => {
      log.error("presence idle sweep failed", err);
    });
  }, PRESENCE_SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}
