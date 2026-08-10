import session from "express-session";
import { RedisStore } from "connect-redis";
import { redis } from "../lib/redis";
import { doubleCsrf } from "csrf-csrf";

// ---------------------------------------------------------------------------
// Validate required env vars at startup (fail-fast).
// ---------------------------------------------------------------------------

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET environment variable is required. " +
      "Set it to a strong random string (e.g., openssl rand -hex 32).",
  );
}

// Support secret rotation: comma-separated secrets.
// express-session uses the first secret for signing and tries all for
// verification, enabling zero-downtime secret rotation.
const secrets = SESSION_SECRET.split(",")
  .map((s) => s.trim())
  .filter((s): s is string => s.length > 0);

if (secrets.length === 0) {
  throw new Error("SESSION_SECRET must contain at least one non-empty secret");
}

// After validation, secrets is guaranteed non-empty.
const sessionSecrets = secrets as [string, ...string[]];

// ---------------------------------------------------------------------------
// Cookie & session defaults
// ---------------------------------------------------------------------------

const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// ---------------------------------------------------------------------------
// Session middleware
// ---------------------------------------------------------------------------

export const sessionMiddleware = session({
  name: "chathubby.sid",
  store: new RedisStore({
    client: redis,
    // Explicit TTL: align with cookie maxAge so Redis cleans up
    // sessions at the same time the browser expires the cookie.
    ttl: COOKIE_MAX_AGE_MS / 1000,
  }),
  // When an array is provided, the first secret signs new cookies
  // and all secrets are tried for verification — supports rotation.
  secret: sessionSecrets.length > 1 ? sessionSecrets : sessionSecrets[0],
  resave: false,
  // Don't create a session until something is stored in it.
  // Prevents anonymous sessions from consuming Redis memory.
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // In production, cookies are only sent over HTTPS.
    // In development, allow HTTP for local testing.
    secure: process.env.NODE_ENV === "production",
    // "lax" allows cookies on top-level navigations (GET) from external
    // links while blocking cross-site POST requests (CSRF protection).
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
  },
});

// ---------------------------------------------------------------------------
// CSRF protection (Double Submit Cookie Pattern via csrf-csrf)
// ---------------------------------------------------------------------------

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => secrets,
  getSessionIdentifier: (req) => req.session.id,
  cookieName: "x-csrf-token",
  cookieOptions: {
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  },
  getCsrfTokenFromRequest: (req) =>
    req.headers["x-csrf-token"] as string | undefined,
});

export { generateCsrfToken, doubleCsrfProtection };
