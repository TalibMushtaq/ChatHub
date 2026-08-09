import { describe, it, expect, afterEach } from "vitest";
import { getAllowedOrigins } from "../../../src/lib/cors";

const originalOrigins = process.env.CORS_ORIGINS;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.CORS_ORIGINS = originalOrigins;
  process.env.NODE_ENV = originalNodeEnv;
});

describe("getAllowedOrigins", () => {
  it("parses and trims a comma-separated list", () => {
    process.env.CORS_ORIGINS = "https://a.example , https://b.example";

    expect(getAllowedOrigins()).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("rejects a wildcard origin", () => {
    process.env.CORS_ORIGINS = "*";

    expect(() => getAllowedOrigins()).toThrow(/must not contain/);
  });

  it("falls back to local dev origins outside production", () => {
    delete process.env.CORS_ORIGINS;
    process.env.NODE_ENV = "development";

    expect(getAllowedOrigins()).toEqual([
      "http://localhost:5173",
      "http://localhost:3000",
    ]);
  });

  it("requires explicit configuration in production", () => {
    delete process.env.CORS_ORIGINS;
    process.env.NODE_ENV = "production";

    expect(() => getAllowedOrigins()).toThrow(/required in production/);
  });
});
