import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPendingAttachment } from "../../../../src/services/attachment/createPending";
import { createMockS3Service, resetMockS3Service } from "../../../mocks/s3";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

describe("createPendingAttachment", () => {
  const s3Service = createMockS3Service();

  beforeEach(() => {
    resetPrismaMock();
    resetMockS3Service(s3Service);
    vi.clearAllMocks();
  });

  it("should create attachment for room context", async () => {
    prismaMock.attachment.create.mockResolvedValue({
      id: "att-1",
      s3Key: "attachments/room/r1/uuid.jpg",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      size: 1024,
      status: "PENDING",
      createdAt: new Date(),
    } as any);

    const result = await createPendingAttachment(
      s3Service,
      "u1",
      "room",
      "r1",
      "photo.jpg",
      "image/jpeg",
      1024,
    );

    expect(result.attachment.s3Key).toContain("attachments/room/r1/");
    expect(prismaMock.attachment.create).toHaveBeenCalledOnce();
  });

  it("should create attachment for voice context with duration and waveform", async () => {
    prismaMock.attachment.create.mockResolvedValue({
      id: "att-1",
      s3Key: "attachments/voice/dc1/uuid.webm",
      filename: "voice.webm",
      mimeType: "audio/webm",
      size: 1024,
      duration: 12,
      waveformPeaks: [0.1, 0.5, 0.9],
      status: "PENDING",
      createdAt: new Date(),
    } as any);

    const result = await createPendingAttachment(
      s3Service,
      "u1",
      "voice",
      "dc1",
      "voice.webm",
      "audio/webm",
      1024,
      { durationSeconds: 12, waveformPeaks: [0.1, 0.5, 0.9] },
    );

    expect(result.attachment.s3Key).toContain("attachments/voice/dc1/");
    // Playback metadata must be persisted alongside the S3 record so the
    // player renders a waveform without decoding the blob.
    expect(prismaMock.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          duration: 12,
          waveformPeaks: [0.1, 0.5, 0.9],
        }),
      }),
    );
  });

  it("should round a float duration to a whole second for storage", async () => {
    prismaMock.attachment.create.mockResolvedValue({
      id: "att-1",
      s3Key: "attachments/voice/dc1/uuid.webm",
      filename: "voice.webm",
      mimeType: "audio/webm",
      size: 1024,
      duration: 12,
      status: "PENDING",
      createdAt: new Date(),
    } as any);

    await createPendingAttachment(
      s3Service,
      "u1",
      "voice",
      "dc1",
      "voice.webm",
      "audio/webm",
      1024,
      { durationSeconds: 12.47 },
    );

    // The Int column must never receive a float, even from a non-web client.
    expect(prismaMock.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ duration: 12 }),
      }),
    );
  });

  it("should reject a voice attachment without a duration", async () => {
    await expect(
      createPendingAttachment(
        s3Service,
        "u1",
        "voice",
        "dc1",
        "voice.webm",
        "audio/webm",
        1024,
      ),
    ).rejects.toThrow("require a duration");
  });

  it("should reject a voice attachment longer than the cap", async () => {
    await expect(
      createPendingAttachment(
        s3Service,
        "u1",
        "voice",
        "dc1",
        "voice.webm",
        "audio/webm",
        1024,
        { durationSeconds: 301 },
      ),
    ).rejects.toThrow("cannot exceed");
  });

  it("should reject unsupported MIME type", async () => {
    await expect(
      createPendingAttachment(
        s3Service,
        "u1",
        "dm",
        "dc1",
        "evil.exe",
        "application/x-msdownload",
        1024,
      ),
    ).rejects.toThrow("Unsupported MIME type");
  });
});
