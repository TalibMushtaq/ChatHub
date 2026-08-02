/**
 * PasswordService — thin DI wrapper around Argon2id operations.
 *
 * Why a class instead of direct imports:
 * - Allows swapping the hashing implementation in tests (mock, bcrypt, etc.).
 * - Keeps route handlers free of direct `argon2` imports for better isolation.
 * - Mirrors the RecoveryCodeService pattern for consistency.
 */

import argon2, { type HashOptions } from "argon2";

export class PasswordService {
  constructor(
    readonly hashOptions: HashOptions,
    private readonly dummyHash: string,
  ) {}

  async hash(password: string): Promise<string> {
    // Explicitly exclude `raw: true` from the options type so TypeScript
    // resolves to the string-returning overload instead of Buffer.
    const opts: HashOptions & { raw?: false } = {
      ...this.hashOptions,
      raw: false,
    };
    return argon2.hash(password, opts);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, {
      memoryCost: this.hashOptions.memoryCost,
      timeCost: this.hashOptions.timeCost,
      parallelism: this.hashOptions.parallelism,
    });
  }

  /** Return a dummy hash for constant-time failure paths. */
  getDummyHash(): string {
    return this.dummyHash;
  }
}
