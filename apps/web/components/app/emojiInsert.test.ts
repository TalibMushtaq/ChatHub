/// <reference types="vitest/config" />
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertEmojiAtCursor } from "./insertEmojiAtCursor";
import { cssVarRgb, cssVarResolved } from "./emojiTheme";

// Minimal stand-in for a textarea: enough surface for the insertion helper
// (selection range + focus) without pulling in a DOM environment.
function fakeTextarea(value: string, caret: number) {
  const ta = {
    value,
    selectionStart: caret,
    selectionEnd: caret,
    setSelectionRange: vi.fn(),
    focus: vi.fn(),
  };
  return { ta, change: vi.fn() };
}

describe("insertEmojiAtCursor", () => {
  beforeEach(() => {
    // The helper defers caret repositioning to the next frame; run it inline
    // so the post-insertion caret is asserted synchronously.
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      cb();
      return 0;
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("inserts at the caret and reports the new value", () => {
    const { ta, change } = fakeTextarea("Hello ", 6);
    insertEmojiAtCursor(ta, "👋", "Hello ", change);
    expect(change).toHaveBeenCalledWith("Hello 👋");
  });

  it("inserts mid-text, not just at the end", () => {
    const { ta, change } = fakeTextarea("How are you?", 5);
    insertEmojiAtCursor(ta, "😄", "How are you?", change);
    expect(change).toHaveBeenCalledWith("How a😄re you?");
  });

  it("replaces the current selection", () => {
    const ta = {
      value: "Hello world",
      selectionStart: 6,
      selectionEnd: 11,
      setSelectionRange: vi.fn(),
      focus: vi.fn(),
    };
    const { change } = fakeTextarea("", 0);
    insertEmojiAtCursor(ta, "🎉", "Hello world", change);
    expect(change).toHaveBeenCalledWith("Hello 🎉");
  });

  it("leaves the caret immediately after the inserted emoji and refocuses", () => {
    const { ta, change } = fakeTextarea("Hi 👋 there", 5);
    insertEmojiAtCursor(ta, "🙂", "Hi 👋 there", change);
    expect(ta.setSelectionRange).toHaveBeenCalledWith(7, 7);
    expect(ta.focus).toHaveBeenCalled();
  });

  it("handles multi-codepoint (ZWJ / skin-tone) emoji as one glyph", () => {
    const family = "👨‍👩‍👧";
    const { ta, change } = fakeTextarea("Meet ", 5);
    insertEmojiAtCursor(ta, family, "Meet ", change);
    expect(change).toHaveBeenCalledWith("Meet 👨‍👩‍👧");
    expect(ta.setSelectionRange).toHaveBeenCalledWith(
      5 + family.length,
      5 + family.length,
    );
  });
});

describe("cssVarRgb & cssVarResolved (jsdom)", () => {
  it("parses rgb() from getComputedStyle into bare r, g, b triplet", () => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () =>
        ({
          color: "rgb(255, 200, 150)",
        }) as unknown as CSSStyleDeclaration,
    );
    expect(cssVarRgb("--color-surface")).toBe("255, 200, 150");
  });

  it("parses rgba() from getComputedStyle, dropping alpha", () => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () =>
        ({
          color: "rgba(40, 50, 60, 0.5)",
        }) as unknown as CSSStyleDeclaration,
    );
    expect(cssVarRgb("--color-border-strong")).toBe("40, 50, 60");
  });

  it("returns resolved color string from cssVarResolved", () => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () =>
        ({
          color: "rgb(100, 120, 140)",
        }) as unknown as CSSStyleDeclaration,
    );
    expect(cssVarResolved("--color-border-strong")).toBe("rgb(100, 120, 140)");
  });

  it("falls back to 0, 0, 0 when getComputedStyle returns unparseable value", () => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () =>
        ({
          color: "invalid",
        }) as unknown as CSSStyleDeclaration,
    );
    expect(cssVarRgb("--color-bogus")).toBe("0, 0, 0");
  });
});
