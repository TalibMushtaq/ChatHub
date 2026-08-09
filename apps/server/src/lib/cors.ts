/**
 * Allowed browser origins for CORS (HTTP API and Socket.IO).
 *
 * Configured via the comma-separated CORS_ORIGINS env var. In production the
 * variable is required, so a deployment can never silently fall back to the
 * development localhost origins. A wildcard is rejected because every
 * endpoint is cookie-authenticated and `credentials: true` with `*` would
 * expose authenticated responses to any site.
 */
const DEV_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

export function getAllowedOrigins(): string[] {
  const configured = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (configured.includes("*")) {
    throw new Error(
      "CORS_ORIGINS must not contain '*': credentialed requests require explicit origins.",
    );
  }

  if (configured.length > 0) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "CORS_ORIGINS environment variable is required in production " +
        "(comma-separated list of allowed browser origins).",
    );
  }

  return DEV_ORIGINS;
}
