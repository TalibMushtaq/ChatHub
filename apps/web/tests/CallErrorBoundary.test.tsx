// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { CallErrorBoundary } from "../components/app/room/CallErrorBoundary";

function GoodChild() {
  return <div>safe child</div>;
}

beforeEach(() => {
  cleanup();
});

describe("CallErrorBoundary", () => {
  it("renders children normally when no error", () => {
    render(
      <CallErrorBoundary>
        <GoodChild />
      </CallErrorBoundary>,
    );
    expect(screen.getByText("safe child")).toBeInTheDocument();
  });

  it("catches error and shows fallback UI", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function ThrowOnce(): React.ReactNode {
      throw new Error("boom");
    }
    render(
      <CallErrorBoundary>
        <ThrowOnce />
      </CallErrorBoundary>,
    );
    expect(
      screen.getByText(/Something went wrong with the voice channel/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Try rejoining or refreshing/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Try Again/ }),
    ).toBeInTheDocument();
    spy.mockRestore();
  });

  it('"Try Again" button resets error state and renders children', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    let shouldThrow = true;
    function ToggleableChild() {
      if (shouldThrow) throw new Error("boom");
      return <div>recovered</div>;
    }

    render(
      <CallErrorBoundary>
        <ToggleableChild />
      </CallErrorBoundary>,
    );

    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: /Try Again/ }));

    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
    expect(screen.getByText("recovered")).toBeInTheDocument();
    spy.mockRestore();
  });
});
