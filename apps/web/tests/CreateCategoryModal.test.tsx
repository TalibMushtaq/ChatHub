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
    createCategory: vi.fn().mockResolvedValue({ id: "cat-new" }),
  },
  getErrorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

import { CreateCategoryModal } from "../components/app/room/CreateCategoryModal";
import { ChatAPI } from "../components/app/api";

describe("CreateCategoryModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form with name input", () => {
    render(React.createElement(CreateCategoryModal, { roomId: "r1" }));
    expect(screen.getByLabelText("Category name")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create category" }),
    ).toBeInTheDocument();
  });

  it("submit button is disabled when name is empty", () => {
    render(React.createElement(CreateCategoryModal, { roomId: "r1" }));
    expect(
      screen.getByRole("button", { name: "Create category" }),
    ).toBeDisabled();
  });

  it("calls API on submit", async () => {
    render(React.createElement(CreateCategoryModal, { roomId: "r1" }));
    const input = screen.getByLabelText("Category name");
    const user = userEvent.setup();
    await user.type(input, "Development");
    await user.click(screen.getByRole("button", { name: "Create category" }));
    await waitFor(() => {
      expect(ChatAPI.createCategory).toHaveBeenCalledWith("r1", "Development");
    });
  });

  it("shows success toast on completion", async () => {
    render(React.createElement(CreateCategoryModal, { roomId: "r1" }));
    const input = screen.getByLabelText("Category name");
    const user = userEvent.setup();
    await user.type(input, "General");
    await user.click(screen.getByRole("button", { name: "Create category" }));
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        'Category "General" created',
        "success",
      );
    });
  });

  it("closes modal and refreshes room detail on success", async () => {
    render(React.createElement(CreateCategoryModal, { roomId: "r1" }));
    const input = screen.getByLabelText("Category name");
    const user = userEvent.setup();
    await user.type(input, "General");
    await user.click(screen.getByRole("button", { name: "Create category" }));
    await waitFor(() => {
      expect(mockClearModals).toHaveBeenCalled();
      expect(mockRefreshRoomDetail).toHaveBeenCalledWith("r1");
    });
  });

  it("shows error toast on API failure", async () => {
    (ChatAPI.createCategory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Server error"),
    );
    render(React.createElement(CreateCategoryModal, { roomId: "r1" }));
    const input = screen.getByLabelText("Category name");
    const user = userEvent.setup();
    await user.type(input, "General");
    await user.click(screen.getByRole("button", { name: "Create category" }));
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("Server error", "error");
    });
  });
});
