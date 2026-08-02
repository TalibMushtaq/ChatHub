import { describe, it, expect } from "vitest";
import { ApiError } from "../../../src/lib/ApiError";

describe("ApiError", () => {
  it("should store message, statusCode, and optional code", () => {
    const err = new ApiError("Not found", 404, "NOT_FOUND");
    expect(err.message).toBe("Not found");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("should be an instance of Error", () => {
    const err = new ApiError("Bad request", 400);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("Error");
  });

  it("should allow undefined code", () => {
    const err = new ApiError("Internal error", 500);
    expect(err.code).toBeUndefined();
  });

  it("should capture stack trace", () => {
    const err = new ApiError("Oops", 500);
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain("ApiError");
  });
});
