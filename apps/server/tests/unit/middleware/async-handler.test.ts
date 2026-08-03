import { describe, it, expect, vi } from "vitest";
import { asyncHandler } from "../../../src/middleware/async-handler";
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from "../../helpers/express";

describe("asyncHandler", () => {
  it("should resolve async handlers and not call next on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const wrapped = asyncHandler(fn);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    wrapped(req, res, next);

    await new Promise((r) => setTimeout(r, 0));
    expect(fn).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it("should forward rejected promises to next with the error", async () => {
    const err = new Error("boom");
    const fn = vi.fn().mockRejectedValue(err);
    const wrapped = asyncHandler(fn);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    wrapped(req, res, next);

    await new Promise((r) => setTimeout(r, 0));
    expect(next).toHaveBeenCalledWith(err);
  });

  it("should forward thrown errors to next", async () => {
    const err = new Error("thrown");
    const fn = vi.fn().mockImplementation(() => {
      throw err;
    });
    const wrapped = asyncHandler(fn);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    wrapped(req, res, next);

    await new Promise((r) => setTimeout(r, 0));
    expect(next).toHaveBeenCalledWith(err);
  });
});
