import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL ?? "ws://localhost:7880";

// ponytail: singleton room service client, created once at import time.
// LiveKit Cloud or local Docker — same interface, just different env vars.
let _roomClient: RoomServiceClient | null = null;

export function getLiveKitRoomClient(): RoomServiceClient {
  if (!_roomClient) {
    _roomClient = new RoomServiceClient(
      LIVEKIT_WS_URL,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
    );
  }
  return _roomClient;
}

/**
 * Generate a short-lived LiveKit access token for a user to join a room.
 * Identity is deterministic (`user:<userId>`) — never trust client-supplied identities.
 * Token expires in 24 hours; the frontend should re-request if the call lasts longer.
 */
export async function generateJoinToken(
  userId: string,
  roomName: string,
  options?: { ttl?: number },
): Promise<string> {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: `user:${userId}`,
    ttl: options?.ttl ?? 86400, // 24h default
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return at.toJwt();
}

export { LIVEKIT_WS_URL, LIVEKIT_API_KEY };
