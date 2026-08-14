import { describe, expect, it } from "vitest";
import {
  APP_PREFIXES,
  PROTECTED_PREFIX,
  isProtectedKey,
  findProtectedKeys,
  collectApplicationKeys,
  chunkKeys,
} from "../../../scripts/reset-s3";

describe("isProtectedKey", () => {
  it("refuses the bare defaults key", () => {
    expect(isProtectedKey("defaults")).toBe(true);
  });

  it("refuses every nested defaults object", () => {
    expect(isProtectedKey("defaults/user/1.png")).toBe(true);
    expect(isProtectedKey("defaults/room/2.png")).toBe(true);
    expect(isProtectedKey("defaults/anything/deep/nested")).toBe(true);
  });

  it("accepts application-owned keys", () => {
    expect(isProtectedKey("avatars/user-1/x.jpg")).toBe(false);
    expect(isProtectedKey("attachments/room/r/a.png")).toBe(false);
    expect(isProtectedKey("attachments/thumbnails/t.png")).toBe(false);
  });

  it("does not match keys that merely contain the word defaults", () => {
    expect(isProtectedKey("attachments/defaults/x.png")).toBe(false);
    expect(isProtectedKey("defaults2/x.png")).toBe(false);
  });
});

describe("APP_PREFIXES / PROTECTED_PREFIX", () => {
  it("mirrors the runtime upload prefixes and never overlaps defaults/", () => {
    expect(APP_PREFIXES).toEqual([
      "attachments/room/",
      "attachments/dm/",
      "attachments/voice/",
      "attachments/thumbnails/",
      "avatars/",
    ]);
    for (const prefix of APP_PREFIXES) {
      expect(isProtectedKey(prefix)).toBe(false);
    }
  });

  it("uses the protected defaults prefix that the seed assets live under", () => {
    expect(PROTECTED_PREFIX).toBe("defaults");
  });
});

describe("findProtectedKeys", () => {
  it("returns only protected keys so main() can abort loudly", () => {
    const keys = [
      "avatars/a.png",
      "defaults/user/1.png",
      "attachments/room/x/y.png",
      "defaults/room/2.png",
    ];
    expect(findProtectedKeys(keys)).toEqual([
      "defaults/user/1.png",
      "defaults/room/2.png",
    ]);
  });

  it("returns empty when no protected keys are present", () => {
    expect(findProtectedKeys(["avatars/a.png"])).toEqual([]);
  });
});

describe("collectApplicationKeys", () => {
  it("lists every application prefix and returns the discovered keys", async () => {
    const calls: string[] = [];
    const listObjects = async (prefix: string) => {
      calls.push(prefix);
      if (prefix === "avatars/") {
        return ["avatars/u1/a.png", "avatars/u2/b.png"];
      }
      if (prefix === "attachments/room/") {
        return ["attachments/room/r1/a.png"];
      }
      return [];
    };

    const keys = await collectApplicationKeys(listObjects);

    expect(calls).toEqual([...APP_PREFIXES]);
    expect(keys).toEqual([
      "attachments/room/r1/a.png",
      "avatars/u1/a.png",
      "avatars/u2/b.png",
    ]);
  });

  it("deduplicates a key returned by multiple prefixes", async () => {
    const keys = await collectApplicationKeys(async () => ["avatars/u1/a.png"]);
    expect(keys).toEqual(["avatars/u1/a.png"]);
  });

  it("handles an already-empty application-data area", async () => {
    const keys = await collectApplicationKeys(async () => []);
    expect(keys).toEqual([]);
  });
});

describe("chunkKeys", () => {
  it("splits keys into max-size batches", () => {
    const keys = Array.from({ length: 2500 }, (_, i) => `k${i}`);
    expect(chunkKeys(keys, 1000).map((c) => c.length)).toEqual([1000, 1000, 500]);
  });

  it("returns no batches for an empty list", () => {
    expect(chunkKeys([], 1000)).toEqual([]);
  });
});
