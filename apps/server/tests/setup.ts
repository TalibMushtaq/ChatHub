import { vi } from "vitest";
import { prismaMock } from "./mocks/prisma";

/**
 * Global test setup — runs before each test file.
 *
 * Why here instead of per-file vi.mock calls:
 * - Centralizes external dependency mocking (Prisma, Redis, Argon2, etc.)
 *   so every test file gets a clean mock automatically.
 * - Prevents accidental real network or database calls in unit tests.
 * - Guarantees deterministic behavior regardless of environment variables.
 */

// ---------------------------------------------------------------------------
// Mock Prisma Client
// ---------------------------------------------------------------------------

vi.mock("../db/prisma", () => ({
  prisma: prismaMock,
}));

// ---------------------------------------------------------------------------
// Mock @prisma/client so tests don't require `prisma generate`
// ---------------------------------------------------------------------------

vi.mock("@prisma/client", () => ({
  PrismaClient: class MockPrismaClient {},
  Prisma: {
    PrismaClientKnownRequestError: class MockPrismaClientKnownRequestError extends Error {
      code: string;
      clientVersion: string;
      constructor(
        message: string,
        { code, clientVersion }: { code: string; clientVersion: string },
      ) {
        super(message);
        this.code = code;
        this.clientVersion = clientVersion;
      }
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock Redis
// ---------------------------------------------------------------------------

vi.mock("../src/lib/redis", () => ({
  redis: {
    eval: vi.fn(),
    isOpen: false,
    on: vi.fn(),
    connect: vi.fn(),
    quit: vi.fn(),
    disconnect: vi.fn(),
  },
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock Argon2
// ---------------------------------------------------------------------------

vi.mock("argon2", () => ({
  default: {
    hash: vi.fn(),
    verify: vi.fn(),
    needsRehash: vi.fn(),
    argon2id: 2,
  },
  hash: vi.fn(),
  verify: vi.fn(),
  needsRehash: vi.fn(),
  argon2id: 2,
}));
