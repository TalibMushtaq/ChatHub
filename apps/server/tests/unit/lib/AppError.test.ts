import { describe, it, expect } from "vitest";
import {
  AppError,
  ForbiddenError,
  NotFoundError,
} from "../../../src/lib/AppError";

describe("AppError", () => {
  it("should carry a message and status code", () => {
    const err = new AppError("Something went wrong", 500);
    expect(err.message).toBe("Something went wrong");
    expect(err.statusCode).toBe(500);
  });

  it("should be an instance of Error", () => {
    const err = new AppError("Fail", 400);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("ForbiddenError", () => {
  it("should default to 403 with a generic message", () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("Not authorized");
  });

  it("should accept a custom message", () => {
    const err = new ForbiddenError("Admins only");
    expect(err.message).toBe("Admins only");
  });

  it("should be an instance of AppError", () => {
    const err = new ForbiddenError();
    expect(err).toBeInstanceOf(AppError);
  });
});

describe("NotFoundError", () => {
  it("should default to 404 with a generic message", () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Resource not found");
  });

  it("should accept a custom message", () => {
    const err = new NotFoundError("User not found");
    expect(err.message).toBe("User not found");
  });

  it("should be an instance of AppError", () => {
    const err = new NotFoundError();
    expect(err).toBeInstanceOf(AppError);
  });
});
