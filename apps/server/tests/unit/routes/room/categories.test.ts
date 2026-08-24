import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";
import express, { Request, Response, NextFunction } from "express";
import categoriesRouter from "../../../../src/routes/room/categories";
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

vi.mock("../../../../src/services/room/categories", () => ({
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  reorderCategories: vi.fn(),
}));

import {
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} from "../../../../src/services/room/categories";

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
  app.use("/room", categoriesRouter);
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

describe("room categories routes", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    ioSpy.to.mockClear();
    emitSpy.mockClear();
  });

  it("POST creates a category and emits category:created", async () => {
    const cat = { id: "cat1", name: "General", position: 0 };
    (createCategory as any).mockResolvedValue(cat);

    const res = await supertest(createTestApp())
      .post("/room/rooms/r1/categories")
      .send({ name: "General" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: true, category: cat });
    expect(createCategory).toHaveBeenCalledWith("user-1", "r1", {
      name: "General",
    });
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
    expect(emitSpy).toHaveBeenCalledWith("category:created", {
      roomId: "r1",
      category: cat,
    });
  });

  it("PATCH updates a category and emits category:updated", async () => {
    const cat = { id: "cat1", name: "Renamed", position: 0 };
    (updateCategory as any).mockResolvedValue(cat);

    const res = await supertest(createTestApp())
      .patch("/room/rooms/r1/categories/cat1")
      .send({ name: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, category: cat });
    expect(updateCategory).toHaveBeenCalledWith("user-1", "r1", "cat1", {
      name: "Renamed",
    });
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
    expect(emitSpy).toHaveBeenCalledWith("category:updated", {
      roomId: "r1",
      category: cat,
    });
  });

  it("DELETE removes a category and emits category:deleted", async () => {
    (deleteCategory as any).mockResolvedValue(undefined);

    const res = await supertest(createTestApp()).delete(
      "/room/rooms/r1/categories/cat1",
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(deleteCategory).toHaveBeenCalledWith("user-1", "r1", "cat1");
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
    expect(emitSpy).toHaveBeenCalledWith("category:deleted", {
      roomId: "r1",
      categoryId: "cat1",
    });
  });

  it("PATCH reorder emits category:reordered", async () => {
    (reorderCategories as any).mockResolvedValue(undefined);
    const orderedIds = ["cat2", "cat1"];

    const res = await supertest(createTestApp())
      .patch("/room/rooms/r1/categories/reorder")
      .send({ orderedIds });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(reorderCategories).toHaveBeenCalledWith("user-1", "r1", orderedIds);
    expect(ioSpy.to).toHaveBeenCalledWith("room:r1");
    expect(emitSpy).toHaveBeenCalledWith("category:reordered", {
      roomId: "r1",
      orderedIds,
    });
  });
});
