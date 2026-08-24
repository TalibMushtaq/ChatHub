import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import channelsRouter from "../../../../src/routes/room/channels";
import { resetPrismaMock } from "../../../mocks/prisma";

vi.mock("../../../../src/middleware/requireAuth", () => ({
  default: (req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  },
}));

vi.mock("../../../../src/middleware/socketAccess", () => ({
  assertRoomAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../src/services/room/channels", () => ({
  listChannels: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  reorderChannels: vi.fn(),
}));

import {
  listChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  reorderChannels,
} from "../../../../src/services/room/channels";

const emitSpy = vi.fn();
const ioSpy = {
  to: vi.fn(() => ({ emit: emitSpy })),
};

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: Response, next: NextFunction) => {
    req.io = ioSpy;
    next();
  });
  app.use("/room", channelsRouter);
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    const status = err.statusCode || err.status || 500;
    res.status(status).json({
      ok: false,
      error: err.message || "Server error",
      ...(err.code && { code: err.code }),
    });
  });
  return app;
}

describe("room channels routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    ioSpy.to.mockClear();
    emitSpy.mockClear();
  });

  it("GET returns the channels list", async () => {
    const channels = [
      { id: "ch1", name: "general" },
      { id: "ch2", name: "random" },
    ];
    (listChannels as any).mockResolvedValue(channels);

    const res = await supertest(createTestApp()).get("/room/rooms/r1/channels");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, channels });
    expect(listChannels).toHaveBeenCalledWith("r1");
  });

  it("POST creates a channel and emits channel:created", async () => {
    const channel = { id: "ch1", name: "general", position: 0 };
    (createChannel as any).mockResolvedValue(channel);

    const res = await supertest(createTestApp())
      .post("/room/rooms/r1/channels")
      .send({ name: "general" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: true, channel });
    expect(createChannel).toHaveBeenCalledWith("user-1", "r1", {
      name: "general",
      type: "TEXT",
    });
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
    expect(emitSpy).toHaveBeenCalledWith("channel:created", {
      roomId: "r1",
      channel,
    });
  });

  it("PATCH updates a channel and emits channel:updated", async () => {
    const channel = { id: "ch1", name: "renamed", position: 0 };
    (updateChannel as any).mockResolvedValue(channel);

    const res = await supertest(createTestApp())
      .patch("/room/rooms/r1/channels/ch1")
      .send({ name: "renamed" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, channel });
    expect(updateChannel).toHaveBeenCalledWith("user-1", "r1", "ch1", {
      name: "renamed",
    });
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
    expect(emitSpy).toHaveBeenCalledWith("channel:updated", {
      roomId: "r1",
      channel,
    });
  });

  it("DELETE removes a channel and emits channel:deleted", async () => {
    (deleteChannel as any).mockResolvedValue(undefined);

    const res = await supertest(createTestApp()).delete(
      "/room/rooms/r1/channels/ch1",
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(deleteChannel).toHaveBeenCalledWith("user-1", "r1", "ch1");
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
    expect(emitSpy).toHaveBeenCalledWith("channel:deleted", {
      roomId: "r1",
      channelId: "ch1",
    });
  });

  it("PATCH reorder emits channel:reordered", async () => {
    (reorderChannels as any).mockResolvedValue(undefined);
    const items = [
      { id: "ch2", categoryId: null },
      { id: "ch1", categoryId: "cat1" },
    ];

    const res = await supertest(createTestApp())
      .patch("/room/rooms/r1/channels/reorder")
      .send({ items });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(reorderChannels).toHaveBeenCalledWith("user-1", "r1", items);
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
    expect(emitSpy).toHaveBeenCalledWith("channel:reordered", {
      roomId: "r1",
      items,
    });
  });
});
