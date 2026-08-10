import { describe, it, expect, vi, beforeEach } from "vitest";

const randomBytesMock = vi.fn();

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    default: { ...actual, randomBytes: randomBytesMock },
    randomBytes: randomBytesMock,
  };
});

const { generateRecoveryCodes } = await import("../../../src/lib/recoveryCode");

describe("generateRecoveryCodes - codeId collisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should discard a generated code whose codeId was already produced", () => {
    // Each generated code consumes four randomBytes calls (codeId + 3 secret
    // groups). Filling every buffer with the same byte makes the resulting
    // codeId deterministic, so repeating a fill value forces a collision.
    const fillValues = [
      0,
      0,
      0,
      0, // first code  -> codeId derived from byte 0
      0,
      0,
      0,
      0, // duplicate codeId -> discarded
      1,
      1,
      1,
      1, // second accepted code
    ];
    let call = 0;
    randomBytesMock.mockImplementation((size: number) =>
      Buffer.alloc(size, fillValues[call++] ?? 2),
    );

    const codes = generateRecoveryCodes(2);

    expect(codes).toHaveLength(2);
    expect(new Set(codes.map((c) => c.codeId)).size).toBe(2);
    expect(randomBytesMock).toHaveBeenCalledTimes(12);
  });
});
