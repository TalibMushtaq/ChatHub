import { describe, expect, it } from "vitest";
import { profileActionSet } from "../components/app/profileActions";

describe("profileActionSet", () => {
  it("shows only informational controls for your own profile", () => {
    expect(profileActionSet("NONE", true)).toEqual({
      showMessage: false,
      friendControls: [],
      friendLabels: [],
      blockAction: "block",
      self: true,
    });
  });

  it("shows Message + Add friend + Block for no relationship", () => {
    expect(profileActionSet("NONE", false)).toEqual({
      showMessage: true,
      friendControls: ["add"],
      friendLabels: [],
      blockAction: "block",
      self: false,
    });
  });

  it("shows Cancel for a pending request I sent", () => {
    expect(profileActionSet("REQUEST_SENT", false)).toEqual({
      showMessage: true,
      friendControls: ["cancel"],
      friendLabels: [],
      blockAction: "block",
      self: false,
    });
  });

  it("shows Accept + Decline for a request I received", () => {
    expect(profileActionSet("REQUEST_RECEIVED", false)).toEqual({
      showMessage: true,
      friendControls: ["accept", "decline"],
      friendLabels: [],
      blockAction: "block",
      self: false,
    });
  });

  it("shows a passive Friends label instead of a dead button", () => {
    expect(profileActionSet("FRIENDS", false)).toEqual({
      showMessage: true,
      friendControls: [],
      friendLabels: ["Friends"],
      blockAction: "block",
      self: false,
    });
  });

  it("hides Message for blocked users and swaps Block for Unblock", () => {
    expect(profileActionSet("BLOCKED", false)).toEqual({
      showMessage: false,
      friendControls: [],
      friendLabels: ["Blocked"],
      blockAction: "unblock",
      self: false,
    });
  });
});
