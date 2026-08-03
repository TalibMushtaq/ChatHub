/**
 * Unit tests for the recovery code system.
 *
 * Uses Node.js built-in test runner (node:test) available in Node 18+.
 * No external test framework required.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  generateRecoveryCode,
  generateRecoveryCodes,
  parseRecoveryCode,
} from "../lib/recoveryCode";
import { RecoveryCodeService } from "./RecoveryCodeService";
import { PasswordService } from "./PasswordService";

// ---------------------------------------------------------------------------
// Mock PasswordService
// ---------------------------------------------------------------------------

function createMockPasswordService() {
  const hashes = new Map<string, string>();
  let hashCounter = 0;

  return {
    hashOptions: { type: 2, memoryCost: 65536, timeCost: 3, parallelism: 4 },
    async hash(secret: string): Promise<string> {
      const h = `mock-hash-${++hashCounter}-${secret}`;
      hashes.set(h, secret);
      return h;
    },
    async verify(hash: string, secret: string): Promise<boolean> {
      return hashes.get(hash) === secret;
    },
    needsRehash(): boolean {
      return false;
    },
    getDummyHash(): string {
      return "mock-dummy-hash";
    },
  } as PasswordService;
}

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

function createMockPrisma() {
  type CodeRow = {
    id: string;
    userId: string;
    codeId: string;
    hash: string;
    used: boolean;
    createdAt: Date;
    usedAt: Date | null;
  };

  const codes: CodeRow[] = [];
  let idCounter = 0;

  const prisma = {
    recoveryCode: {
      async findUnique({
        where,
      }: {
        where: { userId_codeId: { userId: string; codeId: string } };
      }) {
        return (
          codes.find(
            (c) =>
              c.userId === where.userId_codeId.userId &&
              c.codeId === where.userId_codeId.codeId,
          ) ?? null
        );
      },
      async createMany({
        data,
      }: {
        data: Array<{ userId: string; codeId: string; hash: string }>;
      }) {
        for (const d of data) {
          codes.push({
            id: `code-${++idCounter}`,
            userId: d.userId,
            codeId: d.codeId,
            hash: d.hash,
            used: false,
            createdAt: new Date(),
            usedAt: null,
          });
        }
        return { count: data.length };
      },
      async updateMany({
        where,
        data,
      }: {
        where: { id: string; used: boolean };
        data: { used: boolean; usedAt: Date };
      }) {
        const code = codes.find(
          (c) => c.id === where.id && c.used === where.used,
        );
        if (!code) return { count: 0 };
        code.used = data.used;
        code.usedAt = data.usedAt;
        return { count: 1 };
      },
      async deleteMany({ where }: { where: { userId?: string; id?: string } }) {
        let removed = 0;
        for (let i = codes.length - 1; i >= 0; i--) {
          const c = codes[i];
          if (where.userId && c.userId === where.userId) {
            codes.splice(i, 1);
            removed++;
          }
        }
        return { count: removed };
      },
    },
    user: {
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: { passwordHash: string };
      }) {
        return { id: where.id, passwordHash: data.passwordHash };
      },
    },
    $transaction: async <T>(
      fn: (tx: typeof prisma) => Promise<T>,
    ): Promise<T> => {
      return fn(prisma);
    },
    _codes: codes,
  };

  return prisma as unknown as NonNullable<typeof prisma> & {
    _codes: CodeRow[];
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("recoveryCode generation", () => {
  it("generates a code with the correct format", () => {
    const code = generateRecoveryCode();
    assert.match(
      code.fullCode,
      /^RC_[A-Z0-9]{6}\.[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
    );
    assert.strictEqual(code.codeId.length, 6);
    assert.strictEqual(code.secret.length, 14); // 4-4-4 = 12 chars + 2 hyphens
    assert.strictEqual(code.secret.split("-").length, 3);
  });

  it("generates 10 unique codes", () => {
    const codes = generateRecoveryCodes(10);
    assert.strictEqual(codes.length, 10);
    const ids = new Set(codes.map((c) => c.codeId));
    assert.strictEqual(ids.size, 10, "All codeIds must be unique");
  });

  it("parses a valid recovery code", () => {
    const code = generateRecoveryCode();
    const parsed = parseRecoveryCode(code.fullCode);
    assert.ok(parsed);
    assert.strictEqual(parsed!.codeId, code.codeId);
    assert.strictEqual(parsed!.secret, code.secret);
  });

  it("rejects malformed recovery codes", () => {
    assert.strictEqual(parseRecoveryCode("INVALID"), null);
    assert.strictEqual(parseRecoveryCode("RC_123.ABC-123"), null);
    // 'O' is excluded from the alphabet (ambiguous with 0)
    assert.strictEqual(parseRecoveryCode("RC_12345O.ABCD-EFGH-IJKL"), null);
    // lowercase is rejected
    assert.strictEqual(parseRecoveryCode("RC_123456.abcd-efgh-ijkl"), null);
    // wrong group count
    assert.strictEqual(parseRecoveryCode("RC_123456.ABCD-EFGH"), null);
  });
});

describe("RecoveryCodeService", () => {
  it("generates and stores recovery codes", async () => {
    const prisma = createMockPrisma();
    const passwordService = createMockPasswordService();
    const service = new RecoveryCodeService(prisma as any, passwordService);

    const codes = await service.generate("user-1");
    assert.strictEqual(codes.length, 10);
    assert.strictEqual(prisma._codes.length, 10);
    assert.ok(prisma._codes.every((c) => c.userId === "user-1"));
    assert.ok(prisma._codes.every((c) => !c.used));
  });

  it("verifies a valid recovery code", async () => {
    const prisma = createMockPrisma();
    const passwordService = createMockPasswordService();
    const service = new RecoveryCodeService(prisma as any, passwordService);

    const codes = await service.generate("user-1");
    const first = codes[0];
    const stored = prisma._codes.find((c) => c.codeId === first.codeId)!;

    const result = await service.verify("user-1", first.codeId, first.secret);
    assert.strictEqual(result.valid, true);
    assert.ok(result.code);
  });

  it("rejects an invalid recovery code secret", async () => {
    const prisma = createMockPrisma();
    const passwordService = createMockPasswordService();
    const service = new RecoveryCodeService(prisma as any, passwordService);

    const codes = await service.generate("user-1");
    const first = codes[0];

    const result = await service.verify("user-1", first.codeId, "WRONG-SECRET");
    assert.strictEqual(result.valid, false);
  });

  it("redeems a recovery code and rotates the set", async () => {
    const prisma = createMockPrisma();
    const passwordService = createMockPasswordService();
    const service = new RecoveryCodeService(prisma as any, passwordService);

    const codes = await service.generate("user-1");
    const first = codes[0];

    const newCodes = await service.redeem(
      "user-1",
      first.codeId,
      first.secret,
      "NewPassword123!",
    );
    assert.strictEqual(newCodes.length, 10);
    assert.notStrictEqual(newCodes[0].codeId, first.codeId);

    // Old set should be deleted; only the new 10 remain.
    assert.strictEqual(prisma._codes.length, 10);
    assert.ok(prisma._codes.every((c) => !c.used));
  });

  it("marks the redeemed code as used", async () => {
    const prisma = createMockPrisma();
    const passwordService = createMockPasswordService();
    const service = new RecoveryCodeService(prisma as any, passwordService);

    const codes = await service.generate("user-1");
    const first = codes[0];

    await service.redeem(
      "user-1",
      first.codeId,
      first.secret,
      "NewPassword123!",
    );

    // After rotation, old codes are deleted; new codes are unused.
    assert.ok(prisma._codes.every((c) => !c.used));
  });

  it("rejects a reused (already used) recovery code", async () => {
    const prisma = createMockPrisma();
    const passwordService = createMockPasswordService();
    const service = new RecoveryCodeService(prisma as any, passwordService);

    const codes = await service.generate("user-1");
    const first = codes[0];

    // First redemption succeeds.
    await service.redeem(
      "user-1",
      first.codeId,
      first.secret,
      "NewPassword123!",
    );

    // Second attempt with the same plaintext code must fail because the
    // old code was deleted during rotation.
    await assert.rejects(
      async () =>
        service.redeem(
          "user-1",
          first.codeId,
          first.secret,
          "AnotherPassword123!",
        ),
      /Invalid or already used recovery code/,
    );
  });

  it("prevents concurrent redemption via atomic updateMany", async () => {
    const prisma = createMockPrisma();
    const passwordService = createMockPasswordService();
    const service = new RecoveryCodeService(prisma as any, passwordService);

    const codes = await service.generate("user-1");
    const first = codes[0];

    // Manually mark the code as used (simulating another request winning the race).
    const stored = prisma._codes.find((c) => c.codeId === first.codeId)!;
    stored.used = true;

    await assert.rejects(
      async () =>
        service.redeem("user-1", first.codeId, first.secret, "NewPassword123!"),
      /Invalid or already used recovery code/,
    );
  });

  it("regenerates codes (deletes old, creates new)", async () => {
    const prisma = createMockPrisma();
    const passwordService = createMockPasswordService();
    const service = new RecoveryCodeService(prisma as any, passwordService);

    const firstSet = await service.generate("user-1");
    assert.strictEqual(prisma._codes.length, 10);

    const secondSet = await service.regenerate("user-1");
    assert.strictEqual(secondSet.length, 10);
    assert.strictEqual(prisma._codes.length, 10);

    const firstIds = new Set(firstSet.map((c) => c.codeId));
    const secondIds = new Set(secondSet.map((c) => c.codeId));
    assert.strictEqual(
      [...firstIds].filter((id) => secondIds.has(id)).length,
      0,
      "Regeneration should produce entirely new codeIds",
    );
  });
});
