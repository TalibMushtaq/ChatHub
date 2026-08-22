import { describe, it, expect } from "vitest";
import { clampPos } from "../components/app/room/utils";

describe("clampPos", () => {
  it("clamps x < 8 to 8", () => {
    expect(clampPos(-10, 100, 300, 120, 1920, 1080).x).toBe(8);
  });

  it("clamps x beyond right edge", () => {
    expect(clampPos(1700, 100, 300, 120, 1920, 1080).x).toBe(1920 - 300 - 8);
  });

  it("clamps y < 8 to 8", () => {
    expect(clampPos(100, -10, 300, 120, 1920, 1080).y).toBe(8);
  });

  it("passes through valid position", () => {
    const r = clampPos(500, 400, 300, 120, 1920, 1080);
    expect(r).toEqual({ x: 500, y: 400 });
  });
});
