import { redis } from "../lib/redis";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// How long a tab can go without a heartbeat before the idle sweep flips the
// user's presence to "idle". The client pauses heartbeats when its tab is
// hidden, so switching away for this long surfaces as idle.
export const PRESENCE_IDLE_THRESHOLD_MS = 5 * 60_000;

// Safety-net TTL for both keys. It is deliberately larger than the idle
// threshold so the sweep can mark a user idle before Redis expires the keys;
// if the sweep is down, the TTL still cleans up zombie connections.
export const PRESENCE_TTL_S = 10 * 60;

// The manual status that forces the public presence to "offline".
export const PRESENCE_INVISIBLE = "INVISIBLE";

const CONNECTIONS_PREFIX = "presence:connections:";

export type PresenceKind = "online" | "idle" | "offline";

export interface UserPresenceProfile {
  status: string;
  customStatus: string | null;
  showOnlineStatus: boolean;
  showTypingStatus: boolean;
}

export interface PresenceState extends UserPresenceProfile {
  presence: PresenceKind;
  lastActiveAt: number;
}

export interface PrivacyFlags {
  showOnlineStatus: boolean;
  showTypingStatus: boolean;
}

// ---------------------------------------------------------------------------
// Key helpers — no raw string literals outside this module
// ---------------------------------------------------------------------------

function connectionKey(userId: string): string {
  return `${CONNECTIONS_PREFIX}${userId}`;
}

function statusKey(userId: string): string {
  return `presence:status:${userId}`;
}

// ---------------------------------------------------------------------------
// Internal read/write helpers
// ---------------------------------------------------------------------------

async function readState(userId: string): Promise<PresenceState | null> {
  const raw = await redis.get(statusKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PresenceState;
  } catch {
    // A corrupt blob (e.g. from a manual tinker) is treated as absent so the
    // next write recreates it instead of crashing presence logic.
    return null;
  }
}

async function writeState(
  userId: string,
  state: PresenceState,
): Promise<void> {
  await redis.set(statusKey(userId), JSON.stringify(state), { EX: PRESENCE_TTL_S });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a socket as an active connection for a user (connect and heartbeat).
 *
 * SADD is idempotent, so a heartbeat can safely call this again: the set keeps
 * one entry per socket and the blob is refreshed (presence -> online, new
 * lastActiveAt, renewed TTL). An existing blob keeps its privacy flags and
 * manual status — `profile` is only a fallback for the first-ever write, so a
 * freshly flipped privacy setting is never clobbered by a stale connect-time
 * snapshot.
 */
export async function trackConnection(
  userId: string,
  socketId: string,
  profile: UserPresenceProfile,
): Promise<PresenceState> {
  await redis.sAdd(connectionKey(userId), socketId);
  await redis.expire(connectionKey(userId), PRESENCE_TTL_S);

  const existing = await readState(userId);
  const now = Date.now();
  const state: PresenceState = existing
    ? { ...existing, presence: "online", lastActiveAt: now }
    : { ...profile, presence: "online", lastActiveAt: now };

  await writeState(userId, state);
  return state;
}

/**
 * Remove a socket from a user's connection set.
 *
 * Returns true when this was the user's last connection (they are fully
 * offline), false if other tabs remain. When fully offline the connection key
 * is deleted and the blob is kept with presence "offline" so the following
 * presence broadcast still has the user's status/customStatus to carry.
 */
export async function removeConnection(
  userId: string,
  socketId: string,
): Promise<boolean> {
  await redis.sRem(connectionKey(userId), socketId);
  const remaining = await redis.sMembers(connectionKey(userId));

  if (remaining.length > 0) return false;

  await redis.del(connectionKey(userId));
  const state = await readState(userId);
  if (state) {
    state.presence = "offline";
    await writeState(userId, state);
  }
  return true;
}

/**
 * Flip a user's presence to "idle" (called by the idle sweep). No-op for
 * users already offline or idle.
 */
export async function setIdle(
  userId: string,
): Promise<PresenceState | null> {
  const state = await readState(userId);
  if (!state || state.presence === "offline") return null;
  if (state.presence === "idle") return state;

  state.presence = "idle";
  await writeState(userId, state);
  return state;
}

export async function getPresence(
  userId: string,
): Promise<PresenceState | null> {
  return readState(userId);
}

/**
 * All user ids that currently have an active connection set — used by the
 * idle sweep and by the connect-time snapshot to answer "who is present?".
 */
export async function getAllUserIdsWithConnections(): Promise<string[]> {
  const keys = await redis.keys(`${CONNECTIONS_PREFIX}*`);
  return keys.map((key) => key.slice(CONNECTIONS_PREFIX.length));
}

/**
 * Persist the user's manual status change into the presence blob so the next
 * presence broadcast carries the updated status/customStatus. No-op while the
 * user is offline (no blob) — the values live in Postgres and land in a fresh
 * blob on their next connection.
 */
export async function setUserStatus(
  userId: string,
  status: string,
  customStatus: string | null,
): Promise<PresenceState | null> {
  const state = await readState(userId);
  if (!state) return null;

  state.status = status;
  state.customStatus = customStatus;
  await writeState(userId, state);
  return state;
}

/**
 * Update the privacy flags cached in the blob after a privacy change so the
 * broadcast gate reads fresh values without hitting Postgres per event.
 */
export async function syncPrivacyFlags(
  userId: string,
  flags: PrivacyFlags,
): Promise<PresenceState | null> {
  const state = await readState(userId);
  if (!state) return null;

  state.showOnlineStatus = flags.showOnlineStatus;
  state.showTypingStatus = flags.showTypingStatus;
  await writeState(userId, state);
  return state;
}
