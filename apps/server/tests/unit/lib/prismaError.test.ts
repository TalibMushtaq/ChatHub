import { describe, it, expect } from "vitest";
import { getPrismaErrorCode } from "../../../src/lib/prismaError";

describe("getPrismaErrorCode", () => {
  it("extracts the code from a Prisma-like error object", () => {
    expect(getPrismaErrorCode({ code: "P2002" })).toBe("P2002");
  });

  it("returns undefined for non-object values", () => {
    expect(getPrismaErrorCode("P2002")).toBeUndefined();
    expect(getPrismaErrorCode(123)).toBeUndefined();
    expect(getPrismaErrorCode(null)).toBeUndefined();
    expect(getPrismaErrorCode(undefined)).toBeUndefined();
  });

  it("returns undefined when the code property is not a string", () => {
    expect(getPrismaErrorCode({ code: 123 })).toBeUndefined();
    expect(getPrismaErrorCode({ code: null })).toBeUndefined();
  });
});
