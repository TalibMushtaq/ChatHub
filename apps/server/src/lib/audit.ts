/**
 * Structured audit logging for security-sensitive events.
 *
 * Why a separate module instead of inline logger calls:
 * - Guarantees consistent field names across all audit events.
 * - Makes it easy to ship audit logs to a separate SIEM pipeline later.
 * - Prevents accidental leakage of secrets (codes, passwords, hashes) because
 *   the helper scrubs sensitive fields before logging.
 */

import { createLogger } from "./logger";

const log = createLogger("audit");

export type AuditEvent =
  | "RECOVERY_CODES_CREATED"
  | "RECOVERY_CODES_REGENERATED"
  | "RECOVERY_CODE_REDEEMED"
  | "RECOVERY_CODE_FAILED"
  | "PASSWORD_RESET_VIA_RECOVERY_CODE";

interface AuditContext {
  userId?: string;
  ip?: string;
  requestId?: string;
  codeId?: string;
  reason?: string;
  [key: string]: unknown;
}

/**
 * Emit a structured audit event.
 *
 * Security rules enforced here:
 * - `password`, `recoveryCode`, `hash`, and `secret` keys are silently
 *   dropped from the context before logging.
 * - The event name is prefixed with `AUDIT_` for easy log filtering.
 */
export function audit(event: AuditEvent, context: AuditContext = {}): void {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (
      key === "password" ||
      key === "recoveryCode" ||
      key === "hash" ||
      key === "secret" ||
      key === "newPassword"
    ) {
      continue;
    }
    scrubbed[key] = value;
  }

  log.info(`AUDIT_${event}`, scrubbed);
}
