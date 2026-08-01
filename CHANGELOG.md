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