import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { vi } from "vitest";

/**
 * Deeply mocked Prisma client for unit tests.
 *
 * Why vitest-mock-extended:
 * - Automatically mocks every Prisma model method (findUnique, create, etc.)
 *   without manually stubbing each one.
 * - Supports async method mocking via `.mockResolvedValue(...)`.
 * - Type-safe: the mock conforms to `PrismaClient` so TypeScript catches
 *   misspelled method names or wrong argument shapes.
 *
 * Usage:
 *   import { prismaMock } from "../mocks/prisma";
 *   prismaMock.user.findUnique.mockResolvedValue(createUser());
 */
export const prismaMock = mockDeep<PrismaClient>();

/**
 * Reset all Prisma mock state between tests.
 *
 * Call this in `beforeEach` so each test starts with a clean slate and
 * cannot be affected by mock resolutions from previous tests.
 */
export function resetPrismaMock() {
  mockReset(prismaMock);
}

/**
 * Helper to build a mock Prisma transaction that resolves with a given value.
 *
 * Prisma `$transaction` accepts either an array of promises or a callback.
 * This helper creates a callback-style mock that passes the mocked client
 * back into the callback so the transaction behaves like the real Prisma.
 *
 * Usage:
 *   prismaMock.$transaction.mockImplementation(createMockTransaction(prismaMock));
 */
export function createMockTransaction<T>(client: DeepMockProxy<PrismaClient>) {
  return async (
    fn: (tx: DeepMockProxy<PrismaClient>) => Promise<T>,
  ): Promise<T> => {
    return fn(client);
  };
}
