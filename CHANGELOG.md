## [2026-08-01] - Harden logout endpoint with proper cookie clearing and logging
**What changed:** Refactored `apps/server/src/routes/auth/logout.ts`: replaced `console.error` with `createLogger`, removed unnecessary `async`, matched `clearCookie` options (`httpOnly`, `secure`, `sameSite`) to the session configuration so browsers actually remove the cookie.
**Why:** Reliability — `clearCookie` without matching options may fail to clear the cookie in strict browsers. Logging provides observability for session destruction failures.
**Impact:** Response body unchanged. Cookies are now reliably cleared on logout.
**Follow-ups:** None.

## [2026-08-01] - Eliminate redundant DB query in GET /me endpoint
**What changed:** Simplified `apps/server/src/routes/auth/me.ts` to return `req.user` directly from the requireAuth middleware instead of re-querying Prisma. Removed redundant user existence check, non-null assertions, session.destroy call, and async handler (no awaits needed).
**Why:** Performance and correctness — the requireAuth middleware already loads the same user fields with a 5-minute session cache. The extra DB query added ~5-10ms latency per call for identical data.
**Impact:** Response body unchanged. Eliminates one Prisma query per /me request. Removes dead code paths.
**Follow-ups:** None.

## [2026-08-01] - Production-hardened session configuration
**What changed:** Rewrote `apps/server/src/middleware/session.ts` to: validate `SESSION_SECRET` at startup (fail-fast), support secret rotation via comma-separated values, explicitly configure Redis store TTL to match cookie maxAge, extract cookie maxAge to a named constant. Added `trust proxy` setting in `apps/server/src/index.ts` for reverse proxy compatibility.
**Why:** Security — prevents silent misconfiguration (missing secret, cookies failing behind proxies), enables zero-downtime secret rotation, and makes TTL explicit for maintainability.
**Impact:** Server will fail to start if `SESSION_SECRET` is not set. Existing single-secret configurations continue to work unchanged. `trust proxy` enables `secure: true` cookies behind load balancers.
**Follow-ups:** None.

## [2026-08-01] - Type-safe requireAuth middleware with session cache improvements
**What changed:** Refactored `apps/server/src/middleware/requireAuth.ts`: removed `any` cast on session cache (now uses `SessionData.userCache` type), replaced `console.log` with `createLogger`, handled `session.destroy()` failures with logging, added explicit return type, unified 401 messages to "Unauthorized". Updated `apps/server/src/types/express.d.ts` to export `AuthUser` and include `displayname`. Updated `apps/server/src/types/session.d.ts` to reference `AuthUser` type directly.
**Why:** Type safety and maintainability — eliminates `any` casts, centralizes the `AuthUser` type for reuse, and ensures session cache stays in sync with the Prisma query.
**Impact:** No behavioral changes. `AuthUser` now includes `displayname`. Session cache type is derived from `AuthUser` instead of being hand-maintained.
**Follow-ups:** None.

## [2026-08-01] - Type-safe Socket.IO authentication middleware
**What changed:** Refactored `apps/server/src/middleware/io.Auth.ts` to use `socket.data.user` (Socket.IO's recommended pattern) instead of mutating `socket.request`. Created `apps/server/src/types/socket.io.d.ts` with declaration merging to strongly type `socket.data`. Updated `create.io.ts`, `roomChat.ts`, and `dm.ts` to read from `socket.data.user`. Removed all `as any` casts. Added server-side error logging with context.
**Why:** Type safety — eliminates runtime risks from untyped `any` casts and follows Socket.IO best practices for per-socket data storage.
**Impact:** All socket handlers now have typed access to `socket.data.user`. No behavioral changes.
**Follow-ups:** None.

## [2026-08-01] - Harden Redis client with fail-fast, graceful shutdown, and lifecycle logging
**What changed:** Rewrote `apps/server/src/lib/redis.ts` to add: fail-fast REDIS_URL validation in production, concurrent connection prevention via cached promise, lifecycle event logging (connect/ready/reconnecting/end/error), bounded reconnect strategy with exponential backoff, 5s connect timeout, and `disconnectRedis()` helper. Updated `apps/server/src/index.ts` to wire SIGINT/SIGTERM to graceful shutdown.
**Why:** Production reliability — prevents silent failures, ensures clean resource cleanup on shutdown, and provides observability without leaking credentials.
**Impact:** `connectRedis()` is now idempotent and safe to call concurrently. `disconnectRedis()` is a new export. Server process will cleanly close HTTP, Redis, and Postgres connections on termination signals.
**Follow-ups:** None.

## [2026-08-01] - Integrate transparent password hash upgrade in login route
**What changed:** Modified `apps/server/src/routes/auth/login.ts` to import `hashPassword` and `passwordNeedsRehash`, and after successful login, fire-and-forget rehashes the password if stored hash parameters are outdated.
**Why:** Completes the security hardening by ensuring existing user hashes are transparently upgraded to current OWASP-aligned parameters on next login.
**Impact:** Login behavior unchanged for users; hashes are upgraded asynchronously in background. No breaking changes.
**Follow-ups:** Monitor logs for "Password hash upgraded" entries to confirm rehashing works in production.

## [2026-08-01] - Pin Argon2id parameters and add rehash check
**What changed:** Added explicit `PASSWORD_HASH_OPTIONS` constant with OWASP-aligned Argon2id parameters, explicit return types to `hashPassword`/`verifyPassword`, and new `passwordNeedsRehash` function in `apps/server/src/lib/password.ts`.
**Why:** Security hardening — pinning hashing parameters prevents silent changes from library updates and enables transparent hash upgrades when parameters are later increased.
**Impact:** Changes the `password.ts` API (new export, explicit options). Existing hashes will be upgraded on next login once the rehash check is integrated into the login route.
**Follow-ups:** Integrate `passwordNeedsRehash` into login route to rehash after successful authentication.