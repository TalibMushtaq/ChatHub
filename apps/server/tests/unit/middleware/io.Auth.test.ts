import { describe, it, expect, vi, beforeEach } from "vitest";
import socketAuth from "../../../src/middleware/io.Auth";
import { prismaMock, resetPrismaMock } from "../../mocks/prisma";
import { createMockSocket } from "../../helpers/socket";

describe("socketAuth", () => {
  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
  });

  it("should reject when session has no userId", () => {
    const socket = createMockSocket();
    const next = vi.fn();

    socketAuth(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0]![0].message).toBe("Unauthorized");
  });

  it("should reject when user does not exist in DB", async () => {
    const socket = createMockSocket();
    socket.request.session = { userId: "u1" } as any;
    prismaMock.user.findUnique.mockResolvedValue(null);
    const next = vi.fn();

    socketAuth(socket, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0]![0].message).toBe("Unauthorized");
  });

  it("should attach user to socket.data and call next on success", async () => {
    const user = { id: "u1", username: "alice" };
    const socket = createMockSocket();
    socket.request.session = { userId: "u1" } as any;
    prismaMock.user.findUnique.mockResolvedValue(user as any);
    const next = vi.fn();

    socketAuth(socket, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(socket.data.user).toEqual(user);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it("should call next with generic error on DB failure", async () => {
    const socket = createMockSocket();
    socket.request.session = { userId: "u1" } as any;
    prismaMock.user.findUnique.mockRejectedValue(new Error("DB down"));
    const next = vi.fn();

    socketAuth(socket, next);
    await new Promise((r) => setTimeout(r, 10));

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0]![0].message).toBe("Authentication failed");
  });
});
