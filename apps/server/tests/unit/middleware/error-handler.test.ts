import { describe, it, expect, vi, beforeEach } from "vitest";
import { errorHandler } from "../../../src/middleware/error-handler";
import { ApiError } from "../../../src/lib/ApiError";
import { AppError, ForbiddenError } from "../../../src/lib/AppError";
import { Prisma } from "@prisma/client";
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from "../../helpers/express";

describe("errorHandler", () => {
  let res: ReturnType<typeof createMockResponse>;
  const req = createMockRequest();
  const next = createMockNext();

  beforeEach(() => {
    res = createMockResponse();
    vi.clearAllMocks();
  });

  it("should handle ApiError with statusCode and code", () => {
    const err = new ApiError("Bad request", 400, "BAD_REQUEST");
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "Bad request",
      code: "BAD_REQUEST",
    });
  });

  it("should handle ApiError without code", () => {
    const err = new ApiError("Not found", 404);
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "Not found",
    });
  });

  it("should handle AppError with its statusCode", () => {
    const err = new AppError("Invitation already processed", 409);
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "Invitation already processed",
    });
  });

  it("should handle AppError subclasses", () => {
    const err = new ForbiddenError();
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "Not authorized",
    });
  });

  it("should delegate to next when headers are already sent", () => {
    const sentRes = createMockResponse();
    (sentRes as unknown as { headersSent: boolean }).headersSent = true;
    const err = new Error("Late failure");

    errorHandler(err, req, sentRes, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(sentRes.json).not.toHaveBeenCalled();
  });

  it("should map Prisma P2002 to 409 Conflict", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "1",
    });
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "Conflict" });
  });

  it("should map Prisma P2025 to 404 Not Found", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "1",
    });
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "Resource not found",
    });
  });

  it("should return 500 for unhandled errors and log them", () => {
    const err = new Error("Unexpected");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: "Server error" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
