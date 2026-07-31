/**
 * Simple structured logger abstraction.
 *
 * Why: Replaces raw console.error calls with structured, context-aware logging.
 * In production, this can be swapped for pino/winston without changing call sites.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

function formatMessage(level: LogLevel, context: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] [${context}] ${message}`;
}

export function createLogger(context: string) {
  return {
    debug(message: string, meta?: Record<string, unknown>) {
      console.debug(formatMessage("debug", context, message), meta ?? "");
    },
    info(message: string, meta?: Record<string, unknown>) {
      console.info(formatMessage("info", context, message), meta ?? "");
    },
    warn(message: string, meta?: Record<string, unknown>) {
      console.warn(formatMessage("warn", context, message), meta ?? "");
    },
    error(message: string, error?: unknown, meta?: Record<string, unknown>) {
      const errorMeta: Record<string, unknown> = { ...meta };
      if (error instanceof Error) {
        errorMeta.stack = error.stack;
        errorMeta.name = error.name;
      } else if (error !== undefined) {
        errorMeta.raw = error;
      }
      console.error(formatMessage("error", context, message), errorMeta);
    },
  };
}
