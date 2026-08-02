/**
 * Recovery-code runtime configuration.
 *
 * All tunables live in one place so they can be adjusted per environment
 * without touching business logic.
 */

// ---------------------------------------------------------------------------
// Count & format
// ---------------------------------------------------------------------------

/** Number of recovery codes generated per batch. */
export const RECOVERY_CODE_COUNT = 10;

/** Prefix shown to the user (e.g. RC_4A7F8C.JQ8K-H4XT-MP2L). */
export const RECOVERY_CODE_PREFIX = "RC";

/** Length of the public lookup identifier (codeId) in characters. */
export const RECOVERY_CODE_ID_LENGTH = 6;

/** Length of each secret group in the code (e.g. 4 → JQ8K). */
export const RECOVERY_CODE_SECRET_GROUP_LENGTH = 4;

/** Number of groups in the secret portion. */
export const RECOVERY_CODE_SECRET_GROUPS = 3;

// ---------------------------------------------------------------------------
// Alphabet
// ---------------------------------------------------------------------------

/**
 * Characters allowed in recovery codes, excluding visually ambiguous ones:
 * 0 (zero) ↔ O (letter)
 * 1 (one)  ↔ I (letter) ↔ L (letter)
 *
 * Why: Users type these codes manually from a printed or screenshot backup.
 * Removing ambiguous characters reduces transcription errors and support load.
 */
export const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// ---------------------------------------------------------------------------
// Argon2id parameters for hashing the secret portion
// ---------------------------------------------------------------------------

/**
 * Argon2id memory cost (in KiB). 64 MB matches the password-hashing config.
 *
 * Why the same params as passwords: recovery codes are high-value single-use
 * tokens. An attacker who breaches the DB should face the same cost to crack
 * a code hash as they would to crack a password hash. Using different (weaker)
 * parameters would create a "weakest link" vulnerability.
 */
export const RECOVERY_ARGON2_MEMORY_COST = 65536;

/**
 * Argon2id time cost (iterations). 3 is the OWASP minimum + 1 margin.
 *
 * Why 3: balances brute-force resistance with latency. A single verification
 * takes ~50-100 ms on modern hardware — acceptable for an infrequent
 * forgot-password flow, but expensive enough to deter online guessing.
 */
export const RECOVERY_ARGON2_TIME_COST = 3;

/**
 * Argon2id parallelism (threads). 4 matches the password-hashing config.
 *
 * Why 4: utilizes multiple CPU cores for defense without starving the event
 * loop. On a 4-core container this is a sweet spot.
 */
export const RECOVERY_ARGON2_PARALLELISM = 4;
