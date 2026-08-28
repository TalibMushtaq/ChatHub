// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { useFocusTrap } from "../components/app/useFocusTrap";

// Test harness: a dialog guarded by the hook with a leading/trailing focusable
// sibling so we can assert focus is trapped inside and restored on close.
function TrapDialog({ open }: { open: boolean }) {
  const ref = useFocusTrap<HTMLDivElement>(open);
  return (
    <div>
      <button>before</button>
      {open && (
        <div ref={ref} role="dialog" aria-label="test dialog">
          <button>first</button>
          <button>last</button>
        </div>
      )}
      <button>after</button>
    </div>
  );
}

beforeEach(() => {
  cleanup();
});

describe("useFocusTrap", () => {
  it("moves focus into the dialog when it opens", () => {
    render(<TrapDialog open />);
    const dialog = screen.getByRole("dialog");
    expect(document.activeElement).toBe(dialog);
  });

  it("wraps Tab from the last focusable back to the first", async () => {
    const user = userEvent.setup();
    render(<TrapDialog open />);
    screen.getByRole("button", { name: "last" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();
  });

  it("wraps Shift+Tab from the first focusable to the last", async () => {
    const user = userEvent.setup();
    render(<TrapDialog open />);
    screen.getByRole("button", { name: "first" }).focus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "last" })).toHaveFocus();
  });

  it("restores focus to the previously-focused element when closed", async () => {
    const { rerender } = render(<TrapDialog open={false} />);
    screen.getByRole("button", { name: "before" }).focus();
    rerender(<TrapDialog open />);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    rerender(<TrapDialog open={false} />);
    expect(screen.getByRole("button", { name: "before" })).toHaveFocus();
  });
});