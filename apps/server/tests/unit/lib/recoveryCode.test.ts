import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  generateRecoveryCode,
  generateRecoveryCodes,
  parseRecoveryCode,
} from "../../../src/lib/recoveryCode";

describe("recoveryCode utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a code with correct format", () => {
    const code = generateRecoveryCode();
    expect(code.fullCode).toMatch(/^RC_[A-Z2-9]{6}\.[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(code.codeId).toHaveLength(6);
    expect(code.secret).toHaveLength(14); // 4-4-4 + 2 hyphens
    expect(code.secret.split("-")).toHaveLength(3);
  });

  it("should generate exactly the requested number of unique codes", () => {
    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    const ids = new Set(codes.map((c) => c.codeId));
    expect(ids.size).toBe(10);
  });

  it("should handle collision by regenerating", () => {
    // Force randomBytes to return the same byte repeatedly, causing collisions
    // until the while-loop guard catches it.
    let callCount = 0;
    vi.spyOn(crypto, "randomBytes").mockImplementation((size: number) => {
      callCount++;
      // First call returns all zeros (index 0 -> 'A')
      // After a few calls we mix in an accepted value
      if (callCount <= 2) {
        return Buffer.alloc(size, 0) as ReturnType<typeof crypto.randomBytes>;
      }
      // Return bytes that are all accepted (e.g., 0 which maps to 0, < 256 - 256%32 = 224)
      return Buffer.alloc(size, 0) as ReturnType<typeof crypto.randomBytes>;
    });

    const codes = generateRecoveryCodes(5);
    expect(codes.length).toBe(5);
    // All codeIds should still be unique despite the collision path being exercised
    const ids = new Set(codes.map((c) => c.codeId));
    expect(ids.size).toBe(5);
  });

  it("should parse a valid recovery code", () => {
    const code = generateRecoveryCode();
    const parsed = parseRecoveryCode(code.fullCode);
    expect(parsed).not.toBeNull();
    expect(parsed!.codeId).toBe(code.codeId);
    expect(parsed!.secret).toBe(code.secret);
  });

  it("should return null for malformed codes", () => {
    expect(parseRecoveryCode("INVALID")).toBeNull();
    expect(parseRecoveryCode("RC_123.ABC-123")).toBeNull();
    expect(parseRecoveryCode("RC_12345O.ABCD-EFGH-IJKL")).toBeNull();
    expect(parseRecoveryCode("RC_123456.abcd-efgh-ijkl")).toBeNull();
    expect(parseRecoveryCode("RC_123456.ABCD-EFGH")).toBeNull();
  });

  it("should reject codes with wrong prefix", () => {
    expect(parseRecoveryCode("XX_123456.ABCD-EFGH-IJKL")).toBeNull();
  });

  it("should reject codes with extra segments", () => {
    expect(parseRecoveryCode("RC_123456.ABCD-EFGH-IJKL-MNOP")).toBeNull();
  });

  it("should trim whitespace before parsing", () => {
    const code = generateRecoveryCode();
    const parsed = parseRecoveryCode(`  ${code.fullCode}  `);
    expect(parsed).not.toBeNull();
    expect(parsed!.codeId).toBe(code.codeId);
  });
});
