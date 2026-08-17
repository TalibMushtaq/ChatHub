// Pure mapping from a user's relationship to the profile card's action set,
// extracted so the card's buttons are unit-testable without rendering React.
//
// Rule (matches the search-row chips): invalid actions are never rendered as
// disabled buttons — they are either hidden or replaced by a passive label
// ("Friends", "Blocked").

import type { Relationship } from "@repo/validators";

export type FriendControl = "add" | "cancel" | "accept" | "decline";

export interface ProfileActionSet {
  /** Whether the Message button renders (hidden for self and blocked users). */
  showMessage: boolean;
  /** Active friend-request controls; empty means only labels are shown. */
  friendControls: FriendControl[];
  /** Passive labels rendered alongside the controls (e.g. "Friends"). */
  friendLabels: string[];
  /** Block control reflects the current block state (unblock when BLOCKED). */
  blockAction: "block" | "unblock";
  /** True when the card is showing the current user's own profile. */
  self: boolean;
}

export function profileActionSet(
  relationship: Relationship,
  isSelf: boolean,
): ProfileActionSet {
  if (isSelf) {
    return {
      showMessage: false,
      friendControls: [],
      friendLabels: [],
      blockAction: "block",
      self: true,
    };
  }

  switch (relationship) {
    case "NONE":
      return {
        showMessage: true,
        friendControls: ["add"],
        friendLabels: [],
        blockAction: "block",
        self: false,
      };
    case "REQUEST_SENT":
      return {
        showMessage: true,
        friendControls: ["cancel"],
        friendLabels: [],
        blockAction: "block",
        self: false,
      };
    case "REQUEST_RECEIVED":
      return {
        showMessage: true,
        friendControls: ["accept", "decline"],
        friendLabels: [],
        blockAction: "block",
        self: false,
      };
    case "FRIENDS":
      return {
        showMessage: true,
        friendControls: [],
        friendLabels: ["Friends"],
        blockAction: "block",
        self: false,
      };
    case "BLOCKED":
      return {
        showMessage: false,
        friendControls: [],
        friendLabels: ["Blocked"],
        blockAction: "unblock",
        self: false,
      };
  }
}
