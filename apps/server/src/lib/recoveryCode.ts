/**
 * Cryptographically secure recovery code generation.
 *
 * Format: RC_{codeId}.{secret}
 * Example: RC_4A7F8C.JQ8K-H4XT-MP2L
 *
 * Security properties:
 * - Node crypto.randomBytes only — never Math.random().
 * - Visually ambiguous characters removed (0, O, I, 1, L).
 * - codeId is public; secret is shown once and never stored in plaintext.
 */

import { randomBytes } from "node:crypto";
import {
  RECOVERY_CODE_PREFIX,
  RECOVERY_CODE_ID_LENGTH,
  RECOVERY_CODE_SECRET_GROUP_LENGTH,
  RECOVERY_CODE_SECRET_GROUPS,
  RECOVERY_CODE_ALPHABET,
} from "../config/recoveryCodes";

const ALPHABET_LENGTH = RECOVERY_CODE_ALPHABET.length;

/**
 * Generate a cryptographically random string of `length` characters drawn
 * uniformly from `RECOVERY_CODE_ALPHABET`.
 *
 * Why reject-and-resample (instead of modulo bias):
 * - `randomBytes` produces uniform bytes [0, 255].
 * - If we used `% ALPHABET_LENGTH`, values near the top of the range would
 *   be slightly more likely when 256 is not divisible by the alphabet size.
 * - Reject-and-resample eliminates this modulo bias entirely.
 */
function generateAlphabetString(length: number): string {
  let result = "";
  while (result.length < length) {
    const buf = randomBytes(length * 2); // oversample to reduce iterations
    for (const byte of buf) {
      if (result.length >= length) break;
      const index = byte % ALPHABET_LENGTH;
      // Only accept bytes that fall within the largest fully-uniform slice.
      // 256 = 8 * 32, so when ALPHABET_LENGTH = 32 this is a perfect fit.
      // For other lengths, this still guarantees uniformity.
      if (byte < 256 - (256 % ALPHABET_LENGTH)) {
        result += RECOVERY_CODE_ALPHABET[index];
      }
    }
  }
  return result;
}

/**
 * A single plaintext recovery code with its decomposed parts.
 *
 * `codeId` is the public lookup key stored in the database.
 * `secret` is the portion the user must provide during redemption.
 * `fullCode` is what the user sees once and copies to their backup.
 */
export interface GeneratedCode {
  codeId: string;
  secret: string;
  fullCode: string;
}

/**
 * Generate one recovery code.
 */
export function generateRecoveryCode(): GeneratedCode {
  const codeId = generateAlphabetString(RECOVERY_CODE_ID_LENGTH);
  const groups: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_SECRET_GROUPS; i++) {
    groups.push(generateAlphabetString(RECOVERY_CODE_SECRET_GROUP_LENGTH));
  }
  const secret = groups.join("-");
  const fullCode = `${RECOVERY_CODE_PREFIX}_${codeId}.${secret}`;
  return { codeId, secret, fullCode };
}

/**
 * Generate `count` independent recovery codes.
 */
export function generateRecoveryCodes(count: number): GeneratedCode[] {
  const codes: GeneratedCode[] = [];
  const seenCodeIds = new Set<string>();

  while (codes.length < count) {
    const code = generateRecoveryCode();
    // Collision resistance: in theory 32^6 ≈ 1B possible codeIds, but
    // regenerate on collision to be absolutely safe.
    if (seenCodeIds.has(code.codeId)) continue;
    seenCodeIds.add(code.codeId);
    codes.push(code);
  }

  return codes;
}

/**
 * Parse a recovery code string into its `codeId` and `secret` parts.
 *
 * Returns `null` if the format does not match the expected pattern.
 * This is a fast client-side guard before hitting the database.
 */
export function parseRecoveryCode(fullCode: string): { codeId: string; secret: string } | null {
  const trimmed = fullCode.trim();
  const alphabet = RECOVERY_CODE_ALPHABET;
  const match = trimmed.match(
    new RegExp(
      `^${RECOVERY_CODE_PREFIX}_([${alphabet}]{${RECOVERY_CODE_ID_LENGTH}})\\.((?:[${alphabet}]{${RECOVERY_CODE_SECRET_GROUP_LENGTH}}-){${RECOVERY_CODE_SECRET_GROUPS - 1}}[${alphabet}]{${RECOVERY_CODE_SECRET_GROUP_LENGTH}})$`,
    ),
  );
  if (!match) return null;
  return { codeId: match[1]!, secret: match[2]! };
}
