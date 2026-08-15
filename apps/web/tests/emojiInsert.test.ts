/// <reference types="vitest/config" />
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertEmojiAtCursor } from "../components/app/insertEmojiAtCursor";
import { cssVarRgb, cssVarResolved } from "../components/app/emojiTheme";

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
  const originalCreateElement = document.createElement.bind(document);

  function rgbToHex(r: number, g: number, b: number): string {
    return (
      "#" +
      [r, g, b]
        .map((v) =>
          Math.max(0, Math.min(255, Math.round(v)))
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  }

  function normalizeColor(value: string): string {
    const m = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return rgbToHex(+m[1]!, +m[2]!, +m[3]!);
    if (value.startsWith("oklch")) return "#e5e3de";
    return "#000000";
  }

  function makeFakeCanvas() {
    let stored = "#000000";
    return {
      getContext: () => ({
        get fillStyle() {
          return stored;
        },
        set fillStyle(v: string) {
          stored = normalizeColor(v);
        },
      }),
    };
  }

  beforeEach(() => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () =>
        ({
          color: "rgb(255, 200, 150)",
        }) as unknown as CSSStyleDeclaration,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes rgb() through canvas to hex triplet", () => {
    const fake = makeFakeCanvas();
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") return fake as unknown as HTMLCanvasElement;
      return originalCreateElement(tag);
    });
    expect(cssVarRgb("--color-surface")).toBe("255, 200, 150");
  });

  it("normalizes rgba() through canvas, dropping alpha", () => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () =>
        ({
          color: "rgba(40, 50, 60, 0.5)",
        }) as unknown as CSSStyleDeclaration,
    );
    const fake = makeFakeCanvas();
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") return fake as unknown as HTMLCanvasElement;
      return originalCreateElement(tag);
    });
    expect(cssVarRgb("--color-border-strong")).toBe("40, 50, 60");
  });

  it("returns hex color string from cssVarResolved", () => {
    const fake = makeFakeCanvas();
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") return fake as unknown as HTMLCanvasElement;
      return originalCreateElement(tag);
    });
    expect(cssVarResolved("--color-border-strong")).toBe("#ffc896");
  });

  it("falls back to 0, 0, 0 when canvas context is unavailable", () => {
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas")
        return { getContext: () => null } as unknown as HTMLCanvasElement;
      return originalCreateElement(tag);
    });
    expect(cssVarRgb("--color-bogus")).toBe("0, 0, 0");
  });

  it("normalizes oklch() through canvas to hex", () => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () =>
        ({
          color: "oklch(0.9 0.01 92)",
        }) as unknown as CSSStyleDeclaration,
    );
    const fake = makeFakeCanvas();
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "canvas") return fake as unknown as HTMLCanvasElement;
      return originalCreateElement(tag);
    });
    const result = cssVarRgb("--color-surface");
    expect(result).toMatch(/^\d+, \d+, \d+$/);
    expect(result).not.toBe("0, 0, 0");
  });
});
