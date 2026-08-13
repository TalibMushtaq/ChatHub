import { describe, expect, it, vi, afterEach } from "vitest";
import {
  cropOutputSize,
  validateAvatarFile,
  AVATAR_MAX_SIZE,
  AVATAR_OUTPUT_SIZE,
} from "./avatarCrop";
import { uploadAvatarBlob, type AvatarPresigner } from "./avatarUpload";

describe("validateAvatarFile", () => {
  it("accepts the allowed image types", () => {
    expect(validateAvatarFile({ type: "image/jpeg", size: 1024 })).toBeNull();
    expect(validateAvatarFile({ type: "image/png", size: 1024 })).toBeNull();
    expect(validateAvatarFile({ type: "image/gif", size: 1024 })).toBeNull();
    expect(validateAvatarFile({ type: "image/webp", size: 1024 })).toBeNull();
  });

  it("rejects SVG (script-bearing) and non-images", () => {
    expect(validateAvatarFile({ type: "image/svg+xml", size: 1024 })).toMatch(
      /only/i,
    );
    expect(validateAvatarFile({ type: "text/html", size: 1024 })).toMatch(
      /only/i,
    );
  });

  it("rejects files larger than 5 MB", () => {
    expect(
      validateAvatarFile({ type: "image/png", size: AVATAR_MAX_SIZE + 1 }),
    ).toMatch(/5 MB/i);
  });

  it("accepts a file exactly at the 5 MB limit", () => {
    expect(
      validateAvatarFile({ type: "image/png", size: AVATAR_MAX_SIZE }),
    ).toBeNull();
  });
});

describe("cropOutputSize", () => {
  it("caps the output at 512px", () => {
    expect(cropOutputSize(2000)).toBe(AVATAR_OUTPUT_SIZE);
  });

  it("keeps small crops at their native resolution (no blurry upscale)", () => {
    expect(cropOutputSize(100)).toBe(100);
  });

  it("clamps to at least 1px", () => {
    expect(cropOutputSize(0)).toBe(1);
  });
});

describe("uploadAvatarBlob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("presigns, PUTs the blob, and returns the s3Key", async () => {
    const presigner = vi.fn<AvatarPresigner>().mockResolvedValue({
      presignedUrl: "https://s3.mock/upload",
      s3Key: "avatars/u1/abc.png",
    });
    const put = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", put);

    const blob = new Blob(["img"], { type: "image/png" });
    const key = await uploadAvatarBlob(presigner, "user", blob);

    expect(key).toBe("avatars/u1/abc.png");
    expect(presigner).toHaveBeenCalledWith(
      "user",
      { name: "avatar", type: "image/png", size: blob.size },
      undefined,
    );
    expect(put).toHaveBeenCalledWith(
      "https://s3.mock/upload",
      expect.objectContaining({
        method: "PUT",
        body: blob,
      }),
    );
  });

  it("passes contextId through for room uploads", async () => {
    const presigner = vi.fn<AvatarPresigner>().mockResolvedValue({
      presignedUrl: "https://s3.mock/upload",
      s3Key: "avatars/rooms/r1/abc.png",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const blob = new Blob(["img"], { type: "image/webp" });
    await uploadAvatarBlob(presigner, "room", blob, {
      contextId: "r1",
      filename: "team.png",
    });

    expect(presigner).toHaveBeenCalledWith(
      "room",
      { name: "team.png", type: "image/webp", size: blob.size },
      "r1",
    );
  });

  it("throws when the S3 PUT fails", async () => {
    const presigner = vi.fn<AvatarPresigner>().mockResolvedValue({
      presignedUrl: "https://s3.mock/upload",
      s3Key: "avatars/u1/abc.png",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    );

    const blob = new Blob(["img"], { type: "image/png" });
    await expect(uploadAvatarBlob(presigner, "user", blob)).rejects.toThrow(
      /403/,
    );
  });
});
