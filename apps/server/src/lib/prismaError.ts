/**
 * Narrow an unknown thrown value to a Prisma error code (e.g. "P2002").
 *
 * Prisma throws errors carrying a string `code` property. Using this helper
 * lets catch blocks type the error as `unknown` instead of `any` while still
 * reading the code.
 */
export function getPrismaErrorCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}
