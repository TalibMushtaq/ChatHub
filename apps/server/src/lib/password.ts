import argon2, { type HashOptions } from "argon2";

/**
 * Argon2id parameters aligned with OWASP recommendations.
 *
 * Pinned explicitly — never rely on library defaults for security-critical
 * parameters. When you change these, existing hashes will be upgraded
 * transparently via the needsRehash check on next login.
 *
 * Memory:  64 MB  (OWASP minimum: 19 MB)
 * Time:    3 iterations (OWASP minimum: 2)
 * Parallelism: 4 threads
 */
export const PASSWORD_HASH_OPTIONS: HashOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, PASSWORD_HASH_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// Check if a stored hash was created with older parameters and needs
// to be rehashed with the current PASSWORD_HASH_OPTIONS. Call this
// after a successful login to transparently upgrade security.
export async function passwordNeedsRehash(hash: string): Promise<boolean> {
  // needsRehash only checks numeric parameters, not the hash type.
  return argon2.needsRehash(hash, {
    memoryCost: PASSWORD_HASH_OPTIONS.memoryCost,
    timeCost: PASSWORD_HASH_OPTIONS.timeCost,
    parallelism: PASSWORD_HASH_OPTIONS.parallelism,
  });
}
