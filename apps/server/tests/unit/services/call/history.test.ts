import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildCallHistoryContent,
  createCallHistoryMessage,
  emitCallHistoryMessage,
} from "../../../../src/services/call/history";
import { prismaMock, resetPrismaMock } from "../../../mocks/prisma";

vi.mock("../../../../src/lib/logger", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("../../../../src/services/idempotency", () => ({
  checkIdempotency: vi.fn(),
  storeIdempotency: vi.fn().mockResolvedValue(undefined),
}));

const idempotency = vi.mocked(
  await import("../../../../src/services/idempotency"),
);

function createMockIo() {
  const emit = vi.fn();
  return { to: vi.fn(() => ({ emit })) } as any;
}

describe("buildCallHistoryContent", () => {
  it("labels missed calls", () => {
    expect(buildCallHistoryContent("VOICE", "MISSED", null)).toBe(
      "Missed voice call",
    );
    expect(buildCallHistoryContent("VIDEO", "MISSED", null)).toBe(
      "Missed video call",
    );
  });

  it("labels declined calls", () => {
    expect(buildCallHistoryContent("VOICE", "DECLINED", null)).toBe(
      "Declined voice call",
    );
  });

  it("labels cancelled calls", () => {
    expect(buildCallHistoryContent("VOICE", "CANCELLED", null)).toBe(
      "Voice call cancelled",
    );
  });

  it("includes duration for completed calls", () => {
    expect(buildCallHistoryContent("VOICE", "COMPLETED", 332)).toBe(
      "Voice call · 5:32",
    );
    expect(buildCallHistoryContent("VOICE", "COMPLETED", 5)).toBe(
      "Voice call · 0:05",
    );
  });

  it("labels a completed call without a duration", () => {
    expect(buildCallHistoryContent("VOICE", "COMPLETED", null)).toBe(
      "Voice call",
    );
  });
});

describe("createCallHistoryMessage", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("creates a DM history message with call metadata", async () => {
    idempotency.checkIdempotency.mockResolvedValue(null);
    prismaMock.callSession.findUnique.mockResolvedValue({
      connectedAt: new Date("2026-08-27T12:00:00.000Z"),
      endedAt: new Date("2026-08-27T12:05:32.000Z"),
    } as any);
    prismaMock.message.create.mockResolvedValue({
      id: "msg1",
      content: "Voice call · 5:32",
      senderId: "system",
      messageType: "SYSTEM",
      directChatId: "dc1",
      chatRoomId: null,
      channelId: null,
      createdAt: new Date(),
      metadata: {},
      isDeleted: false,
    } as any);

    const result = await createCallHistoryMessage({
      sessionId: "sess1",
      callType: "VOICE",
      outcome: "COMPLETED",
      target: { type: "direct", directChatId: "dc1" },
    });

    expect(result?.content).toBe("Voice call · 5:32");
    expect(prismaMock.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          senderId: "system",
          messageType: "SYSTEM",
          directChatId: "dc1",
          metadata: expect.objectContaining({
            kind: "call",
            callSessionId: "sess1",
            outcome: "COMPLETED",
            durationSeconds: 332,
          }),
        }),
      }),
    );
    expect(idempotency.storeIdempotency).toHaveBeenCalledWith(
      "system",
      "call-history:sess1",
      "msg1",
    );
  });

  it("creates a room channel history message", async () => {
    idempotency.checkIdempotency.mockResolvedValue(null);
    prismaMock.callSession.findUnique.mockResolvedValue(null);
    prismaMock.message.create.mockResolvedValue({
      id: "msg2",
      chatRoomId: "r1",
      channelId: "ch1",
    } as any);

    const result = await createCallHistoryMessage({
      sessionId: "sess2",
      callType: "VOICE",
      outcome: "COMPLETED",
      target: { type: "channel", roomId: "r1", channelId: "ch1" },
    });

    expect(result?.chatRoomId).toBe("r1");
    expect(prismaMock.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chatRoomId: "r1",
          channelId: "ch1",
        }),
      }),
    );
  });

  it("returns null when a history message already exists", async () => {
    idempotency.checkIdempotency.mockResolvedValue("existing-msg");

    const result = await createCallHistoryMessage({
      sessionId: "sess1",
      callType: "VOICE",
      outcome: "MISSED",
      target: { type: "direct", directChatId: "dc1" },
    });

    expect(result).toBeNull();
    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });
});

describe("emitCallHistoryMessage", () => {
  it("broadcasts DM messages via message:new and inbox:update", () => {
    const io = createMockIo();
    emitCallHistoryMessage(io, { type: "direct", directChatId: "dc1" }, {
      id: "msg1",
      directChatId: "dc1",
    } as any);

    expect(io.to).toHaveBeenCalledWith("directChat:dc1");
    expect(io.to().emit).toHaveBeenCalledWith(
      "message:new",
      expect.objectContaining({ id: "msg1", attachments: [] }),
    );
    expect(io.to().emit).toHaveBeenCalledWith("inbox:update", {
      directChatId: "dc1",
    });
  });

  it("broadcasts room messages via chatroom:message with roomId rename", () => {
    const io = createMockIo();
    emitCallHistoryMessage(
      io,
      { type: "channel", roomId: "r1", channelId: "ch1" },
      { id: "msg2", chatRoomId: "r1", channelId: "ch1" } as any,
    );

    expect(io.to).toHaveBeenCalledWith("room:r1");
    const emit = io.to().emit;
    expect(emit).toHaveBeenCalledWith(
      "chatroom:message",
      expect.objectContaining({ id: "msg2", roomId: "r1", channelId: "ch1" }),
    );
  });

  it("does nothing when io is absent (service path without a socket)", () => {
    emitCallHistoryMessage(undefined, { type: "direct", directChatId: "dc1" }, {
      id: "msg1",
    } as any);
  });
});
