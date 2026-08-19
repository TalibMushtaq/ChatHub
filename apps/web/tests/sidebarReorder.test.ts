import { describe, expect, it } from "vitest";
import type { Category, Channel, RoomDetail } from "../components/app/types";
import {
  UNCATEGORIZED_ID,
  channelsByCategory,
  categoryIdOfChannel,
  moveChannel,
  channelContainer,
  applyDragOver,
  channelReorderResult,
  categoryReorderResult,
  channelLink,
  parseConvParam,
} from "../components/app/room/sidebarReorder";

const channel = (id: string, categoryId: string | null): Channel => ({
  id,
  roomId: "r1",
  categoryId,
  name: id,
  topic: null,
  type: "TEXT",
  position: 0,
  createdAt: "",
  updatedAt: "",
});

const category = (id: string, channelIds: string[]): Category => ({
  id,
  roomId: "r1",
  name: id,
  position: 0,
  createdAt: "",
  updatedAt: "",
  channels: channelIds.map((cid) => channel(cid, id)),
});

const detail = (cats: Category[], uncategorized: Channel[]): RoomDetail => ({
  id: "r1",
  name: "Room",
  description: null,
  avatar: null,
  createdBy: "u1",
  createdAt: "",
  updatedAt: "",
  categories: cats,
  uncategorized,
});

describe("channelsByCategory", () => {
  it("maps every channel into its category bucket plus uncategorized", () => {
    const d = detail(
      [category("c1", ["a", "b"]), category("c2", ["c"])],
      [channel("x", null)],
    );
    expect(channelsByCategory(d)).toEqual({
      c1: ["a", "b"],
      c2: ["c"],
      [UNCATEGORIZED_ID]: ["x"],
    });
  });
});

describe("categoryIdOfChannel", () => {
  it("finds a channel's container", () => {
    const d = detail([category("c1", ["a"])], [channel("x", null)]);
    expect(categoryIdOfChannel(d, "a")).toBe("c1");
    expect(categoryIdOfChannel(d, "x")).toBe(UNCATEGORIZED_ID);
    expect(categoryIdOfChannel(d, "nope")).toBeNull();
  });
});

describe("moveChannel", () => {
  it("reorders within the same bucket", () => {
    const next = moveChannel({ c1: ["a", "b", "c"] }, "c1", "c1", "a", "c");
    expect(next).toEqual({ c1: ["b", "c", "a"] });
  });

  it("moves across buckets, inserting before the target", () => {
    const next = moveChannel(
      { c1: ["a", "b"], c2: ["c", "d"] },
      "c1",
      "c2",
      "b",
      "d",
    );
    expect(next).toEqual({ c1: ["a"], c2: ["c", "b", "d"] });
  });

  it("appends to a bucket when no target id matches", () => {
    const next = moveChannel({ c1: ["a"], c2: ["c"] }, "c1", "c2", "a", null);
    expect(next).toEqual({ c1: [], c2: ["c", "a"] });
  });

  it("does not mutate the input", () => {
    const input = { c1: ["a", "b"] };
    moveChannel(input, "c1", "c1", "a", "b");
    expect(input).toEqual({ c1: ["a", "b"] });
  });
});

describe("channelContainer + applyDragOver", () => {
  const containers = {
    c1: ["a", "b", "c"],
    c2: ["d"],
    [UNCATEGORIZED_ID]: [],
  };

  it("locates a channel's container", () => {
    expect(channelContainer(containers, "a")).toBe("c1");
    expect(channelContainer(containers, "d")).toBe("c2");
    expect(channelContainer(containers, "nope")).toBeNull();
  });

  it("reorders within the same container via arrayMove", () => {
    const next = applyDragOver(containers, "a", "c1", "c", "c1");
    expect(next.c1).toEqual(["b", "c", "a"]);
  });

  it("returns the same reference for a no-op", () => {
    const same = applyDragOver(containers, "a", "c1", "a", "c1");
    expect(same).toBe(containers);
  });

  it("moves a channel into another container", () => {
    const next = applyDragOver(containers, "b", "c1", "d", "c2");
    expect(next.c1).toEqual(["a", "c"]);
    expect(next.c2).toEqual(["b", "d"]);
  });
});

describe("channelReorderResult", () => {
  it("emits items in display order and patches the detail", () => {
    const d = detail(
      [category("c1", ["a", "b"]), category("c2", ["c"])],
      [channel("x", null)],
    );
    const containers = {
      c1: ["b", "a"],
      c2: ["c"],
      [UNCATEGORIZED_ID]: ["x"],
    };
    const { items, nextDetail } = channelReorderResult(d, containers);
    expect(items).toEqual([
      { id: "b", categoryId: "c1" },
      { id: "a", categoryId: "c1" },
      { id: "c", categoryId: "c2" },
      { id: "x", categoryId: null },
    ]);
    expect(nextDetail.categories[0]!.channels!.map((c) => c.id)).toEqual([
      "b",
      "a",
    ]);
    expect(nextDetail.uncategorized.map((c) => c.id)).toEqual(["x"]);
  });

  it("reflects a cross-category move in the payload", () => {
    const d = detail([category("c1", ["a", "b"]), category("c2", ["c"])], []);
    const containers = { c1: ["a"], c2: ["b", "c"], [UNCATEGORIZED_ID]: [] };
    const { items } = channelReorderResult(d, containers);
    expect(items).toEqual([
      { id: "a", categoryId: "c1" },
      { id: "b", categoryId: "c2" },
      { id: "c", categoryId: "c2" },
    ]);
  });
});

describe("categoryReorderResult", () => {
  it("reorders categories and drops unknown ids", () => {
    const d = detail([category("c1", []), category("c2", [])], []);
    const { orderedIds, nextDetail } = categoryReorderResult(d, [
      "c2",
      "c1",
      "foreign",
    ]);
    expect(orderedIds).toEqual(["c2", "c1"]);
    expect(nextDetail.categories.map((c) => c.id)).toEqual(["c2", "c1"]);
  });
});

describe("channelLink + parseConvParam", () => {
  it("builds a deep link and round-trips it", () => {
    const link = channelLink("r1", "ch-1");
    expect(link).toBe("/dashboard?conv=room:r1:ch-1");
    expect(parseConvParam("room:r1:ch-1")).toEqual({
      kind: "room",
      id: "r1",
      channelId: "ch-1",
    });
  });

  it("parses dm and room-only forms", () => {
    expect(parseConvParam("dm:dc-1")).toEqual({ kind: "dm", id: "dc-1" });
    expect(parseConvParam("room:r1")).toEqual({ kind: "room", id: "r1" });
  });

  it("rejects malformed params", () => {
    expect(parseConvParam(null)).toBeNull();
    expect(parseConvParam("")).toBeNull();
    expect(parseConvParam("bogus")).toBeNull();
    expect(parseConvParam(":id")).toBeNull();
    expect(parseConvParam("room:")).toBeNull();
  });
});
