// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const shellCtx = {
  user: { id: "u1", username: "testuser" },
  tab: "room" as const,
  active: null as null | {
    kind: "room";
    id: string;
    channelId?: string;
    myRole?: string;
  },
  dmList: [],
  roomList: [],
  dmUnread: 0,
  roomUnread: 0,
  msgs: {},
  roomMembers: {} as Record<string, unknown[]>,
  readReceipts: {},
  typing: {} as Record<string, unknown[]>,
  channelUnreads: {},
  roomNotificationPrefs: {},
  roomDetails: {},
  roomBans: {},
  presence: {},
  q: "",
  results: [],
  listLoading: false,
  mStack: [],
  toasts: [],
  friendRequests: [],
  blockedUsers: [],
  setRoomNotificationPrefs: vi.fn(),
  setTab: vi.fn(),
  setQ: vi.fn(),
  search: vi.fn(),
  openConv: vi.fn(),
  closeConv: vi.fn(),
  openChannel: vi.fn(),
  openModal: vi.fn(),
  leaveRoom: vi.fn(),
  changeMemberRole: vi.fn(),
  kickMember: vi.fn(),
  banMember: vi.fn(),
  unbanMember: vi.fn(),
  muteMember: vi.fn(),
  unmuteMember: vi.fn(),
  setMemberNickname: vi.fn(),
  refreshRoomBans: vi.fn(),
  refreshRoomDetail: vi.fn(),
  patchRoomDetail: vi.fn(),
  loadOlderMessages: vi.fn(),
  loadOlderDmMessages: vi.fn(),
  navigateBack: vi.fn(),
  refreshLists: vi.fn(),
  refreshUser: vi.fn(),
  popModal: vi.fn(),
  clearModals: vi.fn(),
  toast: vi.fn(),
  dismissToast: vi.fn(),
  sendMessage: vi.fn(),
  sendVoiceMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  removeLocalMessage: vi.fn(),
  markRead: vi.fn(),
  inviteRows: vi.fn(),
  joinRequests: vi.fn(),
  joinLinks: vi.fn(),
  createLink: vi.fn(),
  deactivateLink: vi.fn(),
  roomInfo: vi.fn(),
  refreshFriendRequests: vi.fn(),
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  declineFriendRequest: vi.fn(),
  withdrawFriendRequest: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  refreshBlockedUsers: vi.fn(),
  updateRelationship: vi.fn(),
};

vi.mock("../components/app/state", () => ({
  useShell: () => shellCtx,
  ShellContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
  },
}));

const mockUseRoomDetail = vi.fn().mockReturnValue({
  detail: undefined,
  loading: false,
  error: null,
  refresh: vi.fn(),
});

vi.mock("../components/app/room/useRoomDetail", () => ({
  useRoomDetail: (...args: unknown[]) => mockUseRoomDetail(...args),
}));

vi.mock("../components/app/callStore", () => ({
  useCallStore: () => ({
    isPreviewOpen: false,
    activeChannelId: null,
  }),
}));

vi.mock("../components/app/room/RoomSidebar", () => ({
  RoomSidebar: () =>
    React.createElement("div", { "data-testid": "room-sidebar" }),
  RoomSidebarSkeleton: () =>
    React.createElement("div", { "data-testid": "room-sidebar-skeleton" }),
}));

vi.mock("../components/app/room/ChannelHeader", () => ({
  ChannelHeader: () =>
    React.createElement("div", { "data-testid": "channel-header" }),
}));

vi.mock("../components/app/room/ChannelMessageArea", () => ({
  ChannelMessageArea: () =>
    React.createElement("div", { "data-testid": "channel-message-area" }),
}));

vi.mock("../components/app/room/MemberSidebar", () => ({
  MemberSidebar: () => null,
}));

vi.mock("../components/app/room/PreJoinPreview", () => ({
  default: () => null,
}));

vi.mock("../components/app/room/CallErrorBoundary", () => ({
  CallErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

const RoomShell = (await import("../components/app/room/RoomShell")).default;

describe("RoomShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shellCtx.active = null;
    shellCtx.roomMembers = {};
    shellCtx.typing = {};
    mockUseRoomDetail.mockReturnValue({
      detail: undefined,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
  });

  it("returns null when no room is active", () => {
    const { container } = render(React.createElement(RoomShell));
    expect(container.innerHTML).toBe("");
  });

  it("shows loading skeleton when loading and no detail", () => {
    shellCtx.active = { kind: "room", id: "r1" };
    mockUseRoomDetail.mockReturnValue({
      detail: undefined,
      loading: true,
      error: null,
      refresh: vi.fn(),
    });
    render(React.createElement(RoomShell));
    expect(screen.getByTestId("room-sidebar-skeleton")).toBeInTheDocument();
  });

  it("shows error state with retry button", () => {
    shellCtx.active = { kind: "room", id: "r1" };
    const refresh = vi.fn();
    mockUseRoomDetail.mockReturnValue({
      detail: undefined,
      loading: false,
      error: "Failed to load room",
      refresh,
    });
    render(React.createElement(RoomShell));
    expect(screen.getByText("Failed to load room")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows 'No channels yet' empty state when no channels", () => {
    shellCtx.active = { kind: "room", id: "r1", myRole: "MEMBER" };
    mockUseRoomDetail.mockReturnValue({
      detail: {
        id: "r1",
        name: "Test Room",
        description: null,
        avatar: null,
        createdBy: "u1",
        createdAt: "",
        updatedAt: "",
        categories: [],
        uncategorized: [],
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    render(React.createElement(RoomShell));
    expect(screen.getByText("No channels yet")).toBeInTheDocument();
  });

  it("renders channel content when channel is found", () => {
    shellCtx.active = { kind: "room", id: "r1", channelId: "ch-1" };
    mockUseRoomDetail.mockReturnValue({
      detail: {
        id: "r1",
        name: "Test Room",
        description: null,
        avatar: null,
        createdBy: "u1",
        createdAt: "",
        updatedAt: "",
        categories: [],
        uncategorized: [
          {
            id: "ch-1",
            roomId: "r1",
            categoryId: null,
            name: "general",
            topic: null,
            type: "TEXT",
            position: 0,
            createdAt: "",
            updatedAt: "",
          },
        ],
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    render(React.createElement(RoomShell));
    expect(screen.getByTestId("channel-header")).toBeInTheDocument();
    expect(screen.getByTestId("channel-message-area")).toBeInTheDocument();
  });
});
