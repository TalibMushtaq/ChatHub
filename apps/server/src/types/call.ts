import type { CallType, CallStatus, CallOutcome } from "@prisma/client";

export type { CallType, CallStatus, CallOutcome };

export type CallTarget =
  | { type: "channel"; roomId: string; channelId: string }
  | { type: "direct"; directChatId: string };

/**
 * LiveKit room name convention: one call per voice channel or per DM session.
 */
export function getLiveKitRoomName(
  target: CallTarget,
  sessionId: string,
): string {
  if (target.type === "channel") return `channel:${target.channelId}`;
  return `dm-call:${sessionId}`;
}

/**
 * Socket broadcast room name based on the call target.
 */
export function getBroadcastRoom(target: CallTarget): string {
  if (target.type === "channel") return `room:${target.roomId}`;
  return `directChat:${target.directChatId}`;
}

/** Default participant limit for voice channels. */
export const DEFAULT_PARTICIPANT_LIMIT = 25;
