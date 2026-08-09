import { describe, it, expect, vi, beforeEach } from "vitest";
import { errorHandler } from "../../../src/middleware/error-handler";
import { Prisma } from "@prisma/client";
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from "../../helpers/express";

describe("errorHandler - unmapped Prisma codes", () => {
  const req = createMockRequest();
  const next = createMockNext();
  let res: ReturnType<typeof createMockResponse>;

  beforeEach(() => {
    res = createMockResponse();
    vi.clearAllMocks();
  });

  it("should fall through to 500 for Prisma codes without a mapping", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Prisma.PrismaClientKnownRequestError(
      "Foreign key constraint failed",
      { code: "P2003", clientVersion: "1" },
    );

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "Server error" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
