import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger } from "../../../src/lib/logger";

describe("createLogger", () => {
  const spies = {
    debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should log info with context and message", () => {
    const log = createLogger("testCtx");
    log.info("hello");
    expect(spies.info).toHaveBeenCalledOnce();
    expect(spies.info.mock.calls[0]![0]).toContain("[INFO]");
    expect(spies.info.mock.calls[0]![0]).toContain("[testCtx]");
    expect(spies.info.mock.calls[0]![0]).toContain("hello");
  });

  it("should include meta object when provided", () => {
    const log = createLogger("testCtx");
    log.warn("watch out", { userId: "u1" });
    expect(spies.warn).toHaveBeenCalledOnce();
    expect(spies.warn.mock.calls[0]![1]).toEqual({ userId: "u1" });
  });

  it("should attach stack and name for Error in error logger", () => {
    const log = createLogger("testCtx");
    const err = new Error("boom");
    log.error("something broke", err);
    expect(spies.error).toHaveBeenCalledOnce();
    const meta = spies.error.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.stack).toBeDefined();
    expect(meta.name).toBe("Error");
  });

  it("should store raw value for non-Error error parameter", () => {
    const log = createLogger("testCtx");
    log.error("weird", "not an error");
    const meta = spies.error.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.raw).toBe("not an error");
  });

  it("should not crash when meta is omitted", () => {
    const log = createLogger("testCtx");
    log.debug("debug msg");
    expect(spies.debug).toHaveBeenCalledOnce();
    expect(spies.debug.mock.calls[0]![1]).toBe("");
  });
});
