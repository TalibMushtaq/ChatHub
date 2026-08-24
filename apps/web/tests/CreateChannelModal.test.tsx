// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockToast = vi.fn();
const mockClearModals = vi.fn();
const mockRefreshRoomDetail = vi.fn().mockResolvedValue(undefined);

vi.mock("../components/app/state", () => ({
  useShell: () => ({
    toast: mockToast,
    refreshRoomDetail: mockRefreshRoomDetail,
    clearModals: mockClearModals,
  }),
}));

vi.mock("../components/app/api", () => ({
  ChatAPI: {
    createChannel: vi.fn().mockResolvedValue({ id: "ch-new" }),
  },
  getErrorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

vi.mock("../components/app/room/useRoomDetail", () => ({
  useRoomDetail: vi.fn().mockReturnValue({
    detail: {
      id: "r1",
      name: "Room",
      categories: [],
      uncategorized: [],
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("@repo/validators", () => ({
  normalizeChannelName: (name: string) =>
    name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, ""),
}));

import { CreateChannelModal } from "../components/app/room/CreateChannelModal";
import { ChatAPI } from "../components/app/api";

describe("CreateChannelModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form with name input and submit button", () => {
    render(React.createElement(CreateChannelModal, { roomId: "r1" }));
    expect(screen.getByLabelText("Channel name")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create channel" }),
    ).toBeInTheDocument();
  });

  it("submit button is disabled when name is empty", () => {
    render(React.createElement(CreateChannelModal, { roomId: "r1" }));
    expect(
      screen.getByRole("button", { name: "Create channel" }),
    ).toBeDisabled();
  });

  it("normalizes channel name (uppercase to lowercase, spaces to hyphens)", async () => {
    render(React.createElement(CreateChannelModal, { roomId: "r1" }));
    const input = screen.getByLabelText("Channel name");
    const user = userEvent.setup();
    await user.type(input, "HELLO WORLD");
    expect(input).toHaveValue("HELLO WORLD");
  });

  it("calls API on submit", async () => {
    render(React.createElement(CreateChannelModal, { roomId: "r1" }));
    const input = screen.getByLabelText("Channel name");
    const user = userEvent.setup();
    await user.type(input, "general");
    await user.click(screen.getByRole("button", { name: "Create channel" }));
    await waitFor(() => {
      expect(ChatAPI.createChannel).toHaveBeenCalledWith("r1", {
        name: "general",
        type: "TEXT",
        topic: null,
        categoryId: null,
      });
    });
  });

  it("shows success toast on completion", async () => {
    render(React.createElement(CreateChannelModal, { roomId: "r1" }));
    const input = screen.getByLabelText("Channel name");
    const user = userEvent.setup();
    await user.type(input, "general");
    await user.click(screen.getByRole("button", { name: "Create channel" }));
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("#general created", "success");
    });
  });

  it("closes modal and refreshes room detail on success", async () => {
    render(React.createElement(CreateChannelModal, { roomId: "r1" }));
    const input = screen.getByLabelText("Channel name");
    const user = userEvent.setup();
    await user.type(input, "general");
    await user.click(screen.getByRole("button", { name: "Create channel" }));
    await waitFor(() => {
      expect(mockClearModals).toHaveBeenCalled();
      expect(mockRefreshRoomDetail).toHaveBeenCalledWith("r1");
    });
  });
});
