import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { audit } from "../../../src/lib/audit";

describe("audit", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should log an audit event with scrubbed context", () => {
    audit("RECOVERY_CODES_CREATED", { userId: "u1" });
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0]![0]).toContain("AUDIT_RECOVERY_CODES_CREATED");
    const meta = infoSpy.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.userId).toBe("u1");
  });

  it("should scrub sensitive fields from context", () => {
    audit("RECOVERY_CODE_REDEEMED", {
      userId: "u1",
      password: "secret",
      hash: "hash",
      secret: "secret",
      newPassword: "newSecret",
      recoveryCode: "RC_123.ABC",
      safeField: "visible",
    });

    const meta = infoSpy.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.password).toBeUndefined();
    expect(meta.hash).toBeUndefined();
    expect(meta.secret).toBeUndefined();
    expect(meta.newPassword).toBeUndefined();
    expect(meta.recoveryCode).toBeUndefined();
    expect(meta.safeField).toBe("visible");
  });

  it("should allow empty context", () => {
    audit("RECOVERY_CODES_REGENERATED");
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0]![0]).toContain("AUDIT_RECOVERY_CODES_REGENERATED");
  });
});
