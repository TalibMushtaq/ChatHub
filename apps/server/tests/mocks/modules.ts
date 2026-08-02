import { vi } from "vitest";

/**
 * Centralized module mocking for external dependencies.
 *
 * Vitest's `vi.mock` is hoisted to the top of the file, so declaring mocks
 * here and importing them in test files keeps the top-level mock close to
 * the test logic and avoids duplication.
 *
 * Why a dedicated file:
 * - Single source of truth for how `redis`, `argon2`, etc. are mocked.
 * - Easy to change mock behavior globally (e.g., make Redis fail open vs. fail closed).
 */

// ---------------------------------------------------------------------------
// Redis
// ---------------------------------------------------------------------------

export const redisMock = {
  eval: vi.fn(),
  isOpen: false,
  on: vi.fn(),
  connect: vi.fn(),
  quit: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock("../../src/lib/redis", () => ({
  redis: redisMock,
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Argon2
// ---------------------------------------------------------------------------

export const argon2Mock = {
  hash: vi.fn(),
  verify: vi.fn(),
  needsRehash: vi.fn(),
  argon2id: 2,
};

vi.mock("argon2", () => ({
  default: argon2Mock,
  hash: argon2Mock.hash,
  verify: argon2Mock.verify,
  needsRehash: argon2Mock.needsRehash,
  argon2id: argon2Mock.argon2id,
}));
