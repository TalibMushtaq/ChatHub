import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../../../src/lib/logger";

describe("createLogger - optional argument branches", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should substitute an empty meta placeholder when warn is called without meta", () => {
    createLogger("ctx").warn("no meta here");

    expect(warnSpy.mock.calls[0]![0]).toContain("[WARN]");
    expect(warnSpy.mock.calls[0]![1]).toBe("");
  });

  it("should leave meta untouched when error is called without an error value", () => {
    createLogger("ctx").error("just a message", undefined, { userId: "u1" });

    expect(errorSpy.mock.calls[0]![1]).toEqual({ userId: "u1" });
  });
});
