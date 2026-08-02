import { vi } from "vitest";
import type { Socket } from "socket.io";

/**
 * Build a mocked Socket.IO Socket for middleware tests.
 *
 * Socket.IO middleware receives `socket` and `next`. This helper creates
 * a typed mock with the fields our auth/access middlewares touch.
 */
export function createMockSocket(partial?: Partial<Socket>): Socket {
  const socket = {
    id: "socket-1",
    data: {
      user: undefined as { id: string; username: string } | undefined,
      rooms: new Set<string>(),
    },
    request: {
      session: {} as any,
    },
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    ...partial,
  } as unknown as Socket;

  return socket;
}
