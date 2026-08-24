import { describe, it, expect } from "vitest";
import {
  avatarPresignSchema,
  avatarMimeTypeSchema,
  AVATAR_MAX_SIZE,
  AVATAR_ALLOWED_MIME_TYPES,
} from "../src/avatar";

// ---------------------------------------------------------------------------
// avatarMimeTypeSchema
// ---------------------------------------------------------------------------
describe("avatarMimeTypeSchema", () => {
  it("accepts image/jpeg", () => {
    const result = avatarMimeTypeSchema.safeParse("image/jpeg");
    expect(result.success).toBe(true);
  });

  it("accepts image/png", () => {
    const result = avatarMimeTypeSchema.safeParse("image/png");
    expect(result.success).toBe(true);
  });

  it("accepts image/gif", () => {
    const result = avatarMimeTypeSchema.safeParse("image/gif");
    expect(result.success).toBe(true);
  });

  it("accepts image/webp", () => {
    const result = avatarMimeTypeSchema.safeParse("image/webp");
    expect(result.success).toBe(true);
  });

  it("rejects image/svg+xml", () => {
    const result = avatarMimeTypeSchema.safeParse("image/svg+xml");
    expect(result.success).toBe(false);
  });

  it("rejects application/pdf", () => {
    const result = avatarMimeTypeSchema.safeParse("application/pdf");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// avatarPresignSchema
// ---------------------------------------------------------------------------
describe("avatarPresignSchema", () => {
  it("accepts valid user context", () => {
    const result = avatarPresignSchema.safeParse({
      context: "user",
      filename: "avatar.jpg",
      mimeType: "image/jpeg",
      size: 1024,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid room context with contextId", () => {
    const result = avatarPresignSchema.safeParse({
      context: "room",
      contextId: "room1",
      filename: "avatar.png",
      mimeType: "image/png",
      size: 2048,
    });
    expect(result.success).toBe(true);
  });

  it("rejects room context without contextId", () => {
    const result = avatarPresignSchema.safeParse({
      context: "room",
      filename: "avatar.png",
      mimeType: "image/png",
      size: 2048,
    });
    expect(result.success).toBe(false);
  });

  it("accepts user context without contextId", () => {
    const result = avatarPresignSchema.safeParse({
      context: "user",
      filename: "avatar.jpg",
      mimeType: "image/jpeg",
      size: 1024,
    });
    expect(result.success).toBe(true);
  });

  it("rejects size over AVATAR_MAX_SIZE", () => {
    const result = avatarPresignSchema.safeParse({
      context: "user",
      filename: "avatar.jpg",
      mimeType: "image/jpeg",
      size: AVATAR_MAX_SIZE + 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts size at AVATAR_MAX_SIZE", () => {
    const result = avatarPresignSchema.safeParse({
      context: "user",
      filename: "avatar.jpg",
      mimeType: "image/jpeg",
      size: AVATAR_MAX_SIZE,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero size", () => {
    const result = avatarPresignSchema.safeParse({
      context: "user",
      filename: "avatar.jpg",
      mimeType: "image/jpeg",
      size: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative size", () => {
    const result = avatarPresignSchema.safeParse({
      context: "user",
      filename: "avatar.jpg",
      mimeType: "image/jpeg",
      size: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer size", () => {
    const result = avatarPresignSchema.safeParse({
      context: "user",
      filename: "avatar.jpg",
      mimeType: "image/jpeg",
      size: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing filename", () => {
    const result = avatarPresignSchema.safeParse({
      context: "user",
      mimeType: "image/jpeg",
      size: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty filename", () => {
    const result = avatarPresignSchema.safeParse({
      context: "user",
      filename: "",
      mimeType: "image/jpeg",
      size: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid mime type", () => {
    const result = avatarPresignSchema.safeParse({
      context: "user",
      filename: "avatar.jpg",
      mimeType: "image/svg+xml",
      size: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing context", () => {
    const result = avatarPresignSchema.safeParse({
      filename: "avatar.jpg",
      mimeType: "image/jpeg",
      size: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid context", () => {
    const result = avatarPresignSchema.safeParse({
      context: "invalid",
      filename: "avatar.jpg",
      mimeType: "image/jpeg",
      size: 1024,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe("AVATAR_ALLOWED_MIME_TYPES", () => {
  it("does not include SVG", () => {
    expect(AVATAR_ALLOWED_MIME_TYPES).not.toContain("image/svg+xml");
  });

  it("includes jpeg, png, gif, webp", () => {
    expect(AVATAR_ALLOWED_MIME_TYPES).toContain("image/jpeg");
    expect(AVATAR_ALLOWED_MIME_TYPES).toContain("image/png");
    expect(AVATAR_ALLOWED_MIME_TYPES).toContain("image/gif");
    expect(AVATAR_ALLOWED_MIME_TYPES).toContain("image/webp");
  });
});
