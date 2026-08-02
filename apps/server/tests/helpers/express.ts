import { vi, type MockedFunction } from "vitest";
import type { Request, Response, NextFunction } from "express";
import type { Session, SessionData } from "express-session";
import type { AuthUser } from "../../src/types/express";

/**
 * Build a mocked Express Request for middleware/route unit tests.
 *
 * Why a helper instead of manual objects:
 * - Guarantees that every mock request has the same baseline shape
 *   (session, user, io, params, query, body).
 * - Reduces boilerplate in 30+ middleware tests.
 *
 * Usage:
 *   const req = createMockRequest({ session: { userId: "u1" }, user: createAuthUser() });
 */
export function createMockRequest(partial?: Partial<Request>): Request {
  const { session: partialSession, ...restPartial } = partial ?? {};

  const sessionData: Partial<Session & Partial<SessionData>> = {
    id: "sess-id",
    cookie: {
      originalMaxAge: 1000 * 60 * 60 * 24 * 7,
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    },
    regenerate: vi.fn((cb) => cb?.(null as any) ?? undefined) as any,
    destroy: vi.fn((cb) => cb?.(null as any) ?? undefined) as any,
    reload: vi.fn((cb) => cb?.(null as any) ?? undefined) as any,
    save: vi.fn((cb) => cb?.(null as any) ?? undefined) as any,
    touch: vi.fn() as any,
    resetMaxAge: vi.fn() as any,
    ...partialSession,
  };

  const req = {
    session: sessionData as Session & Partial<SessionData>,
    user: undefined as AuthUser | undefined,
    io: { to: vi.fn(() => ({ emit: vi.fn() })) } as any,
    ip: "127.0.0.1",
    params: {},
    query: {},
    body: {},
    headers: {},
    get: vi.fn(),
    header: vi.fn(),
    ...restPartial,
  } as unknown as Request;

  return req;
}

/**
 * Build a mocked Express Response with chainable methods.
 *
 * All JSON/ send/ status methods are spies so tests can assert:
 *   expect(res.status).toHaveBeenCalledWith(401);
 *   expect(res.json).toHaveBeenCalledWith({ ok: false, error: "Unauthorized" });
 */
export function createMockResponse(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  } as unknown as Response;

  return res;
}

/**
 * Build a mocked NextFunction.
 *
 * Usage:
 *   const next = createMockNext();
 *   expect(next).toHaveBeenCalledWith(expect.any(Error));
 */
export function createMockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}
