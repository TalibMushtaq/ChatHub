// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { mockOn, mockOff, getDisconnected, setDisconnected } = vi.hoisted(() => {
  let disconnected = true;
  return {
    mockOn: vi.fn(),
    mockOff: vi.fn(),
    getDisconnected: () => disconnected,
    setDisconnected: (v: boolean) => {
      disconnected = v;
    },
  };
});

vi.mock("../app/lib/socket", () => ({
  socket: {
    get disconnected() {
      return getDisconnected();
    },
    on: (...args: unknown[]) => mockOn(...args),
    off: (...args: unknown[]) => mockOff(...args),
  },
}));

import { ReconnectBanner } from "../components/app/ReconnectBanner";

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  setDisconnected(true);
});

describe("ReconnectBanner", () => {
  it("shows reconnecting message when disconnected on mount", () => {
    render(<ReconnectBanner />);
    expect(screen.getByText("Reconnecting to server…")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("hides when socket is connected", () => {
    setDisconnected(false);
    render(<ReconnectBanner />);
    expect(
      screen.queryByText("Reconnecting to server…"),
    ).not.toBeInTheDocument();
  });

  it("registers connect and disconnect listeners", () => {
    render(<ReconnectBanner />);
    expect(mockOn).toHaveBeenCalledWith("connect", expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith("disconnect", expect.any(Function));
  });

  it("cleans up listeners on unmount", () => {
    const { unmount } = render(<ReconnectBanner />);
    unmount();
    expect(mockOff).toHaveBeenCalledWith("connect", expect.any(Function));
    expect(mockOff).toHaveBeenCalledWith("disconnect", expect.any(Function));
  });
});
