import { describe, it, expect } from "vitest";

// Permission logic extracted from MemberContextMenu.tsx — tested as pure functions
// since the component itself requires deep Shell context.

const ROLE_ORDER = {
  MEMBER: 0,
  MODERATOR: 1,
  ADMIN: 2,
  OWNER: 3,
} as const;

type RoomRole = keyof typeof ROLE_ORDER;

interface TestMember {
  id: string;
  role: RoomRole;
  isSelf: boolean;
  isMuted: boolean;
}

function computePermissions(
  myRole: RoomRole,
  member: TestMember,
): {
  canManage: boolean;
  canAssignAdmin: boolean;
  showSetNickname: boolean;
  showMuteOptions: boolean;
  showUnmute: boolean;
  showKickBan: boolean;
  showSetModerator: boolean;
  showSetMember: boolean;
  showSetAdmin: boolean;
} {
  const isManager = myRole === "OWNER" || myRole === "ADMIN";
  const myLevel = ROLE_ORDER[myRole];
  const targetLevel = ROLE_ORDER[member.role];
  const canManage =
    isManager &&
    !member.isSelf &&
    member.role !== "OWNER" &&
    myLevel > targetLevel;
  const canAssignAdmin =
    myRole === "OWNER" && !member.isSelf && member.role !== "OWNER";

  return {
    canManage,
    canAssignAdmin,
    showSetNickname: member.isSelf || canManage,
    showMuteOptions: canManage && !member.isMuted,
    showUnmute: canManage && member.isMuted,
    showKickBan: canManage,
    showSetModerator: canManage && member.role !== "MODERATOR",
    showSetMember: canManage && member.role !== "MEMBER",
    showSetAdmin: canAssignAdmin && member.role !== "ADMIN",
  };
}

describe("ROLE_ORDER", () => {
  it("MEMBER < MODERATOR < ADMIN < OWNER", () => {
    expect(ROLE_ORDER.MEMBER).toBeLessThan(ROLE_ORDER.MODERATOR);
    expect(ROLE_ORDER.MODERATOR).toBeLessThan(ROLE_ORDER.ADMIN);
    expect(ROLE_ORDER.ADMIN).toBeLessThan(ROLE_ORDER.OWNER);
  });
});

describe("permission computation", () => {
  it("owner can manage admin", () => {
    const p = computePermissions("OWNER", {
      id: "a",
      role: "ADMIN",
      isSelf: false,
      isMuted: false,
    });
    expect(p.canManage).toBe(true);
    expect(p.showKickBan).toBe(true);
    expect(p.showMuteOptions).toBe(true);
  });

  it("owner can assign admin role", () => {
    const p = computePermissions("OWNER", {
      id: "m",
      role: "MEMBER",
      isSelf: false,
      isMuted: false,
    });
    expect(p.canAssignAdmin).toBe(true);
    expect(p.showSetAdmin).toBe(true);
  });

  it("admin cannot assign admin role", () => {
    const p = computePermissions("ADMIN", {
      id: "m",
      role: "MEMBER",
      isSelf: false,
      isMuted: false,
    });
    expect(p.canAssignAdmin).toBe(false);
    expect(p.showSetAdmin).toBe(false);
  });

  it("admin can manage moderator", () => {
    const p = computePermissions("ADMIN", {
      id: "mod",
      role: "MODERATOR",
      isSelf: false,
      isMuted: false,
    });
    expect(p.canManage).toBe(true);
    expect(p.showKickBan).toBe(true);
  });

  it("moderator cannot manage member (not a manager role)", () => {
    const p = computePermissions("MODERATOR", {
      id: "m",
      role: "MEMBER",
      isSelf: false,
      isMuted: false,
    });
    expect(p.canManage).toBe(false);
    expect(p.showKickBan).toBe(false);
  });

  it("owner can manage moderator", () => {
    const p = computePermissions("OWNER", {
      id: "mod",
      role: "MODERATOR",
      isSelf: false,
      isMuted: false,
    });
    expect(p.canManage).toBe(true);
    expect(p.showKickBan).toBe(true);
    expect(p.showMuteOptions).toBe(true);
  });

  it("member cannot manage anyone", () => {
    const p = computePermissions("MEMBER", {
      id: "m",
      role: "MEMBER",
      isSelf: false,
      isMuted: false,
    });
    expect(p.canManage).toBe(false);
    expect(p.showKickBan).toBe(false);
    expect(p.showMuteOptions).toBe(false);
  });

  it("cannot manage yourself", () => {
    const p = computePermissions("OWNER", {
      id: "self",
      role: "MEMBER",
      isSelf: true,
      isMuted: false,
    });
    expect(p.canManage).toBe(false);
    expect(p.showKickBan).toBe(false);
  });

  it("can always set nickname for self", () => {
    const p = computePermissions("MEMBER", {
      id: "self",
      role: "MEMBER",
      isSelf: true,
      isMuted: false,
    });
    expect(p.showSetNickname).toBe(true);
  });

  it("cannot manage owner even as owner (isSelf check)", () => {
    const p = computePermissions("OWNER", {
      id: "owner",
      role: "OWNER",
      isSelf: true,
      isMuted: false,
    });
    expect(p.canManage).toBe(false);
    expect(p.canAssignAdmin).toBe(false);
  });

  it("admin cannot manage owner", () => {
    const p = computePermissions("ADMIN", {
      id: "o",
      role: "OWNER",
      isSelf: false,
      isMuted: false,
    });
    expect(p.canManage).toBe(false);
  });

  it("muted member shows unmute instead of mute options (owner managing)", () => {
    const p = computePermissions("OWNER", {
      id: "m",
      role: "MEMBER",
      isSelf: false,
      isMuted: true,
    });
    expect(p.showMuteOptions).toBe(false);
    expect(p.showUnmute).toBe(true);
  });

  it("unmuted member shows mute options instead of unmute (owner managing)", () => {
    const p = computePermissions("OWNER", {
      id: "m",
      role: "MEMBER",
      isSelf: false,
      isMuted: false,
    });
    expect(p.showMuteOptions).toBe(true);
    expect(p.showUnmute).toBe(false);
  });

  it("setting member as moderator hides setModerator option", () => {
    const p = computePermissions("OWNER", {
      id: "mod",
      role: "MODERATOR",
      isSelf: false,
      isMuted: false,
    });
    expect(p.showSetModerator).toBe(false);
    expect(p.showSetMember).toBe(true);
  });

  it("setting member as member hides setMember option", () => {
    const p = computePermissions("OWNER", {
      id: "m",
      role: "MEMBER",
      isSelf: false,
      isMuted: false,
    });
    expect(p.showSetMember).toBe(false);
    expect(p.showSetModerator).toBe(true);
  });
});
