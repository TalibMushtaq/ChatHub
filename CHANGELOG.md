## [2026-08-11] - DM Inbox Cursor Pagination

**What changed:** `GET /api/dm/inbox` now accepts `cursor` + `limit` query params and returns `nextCursor`. `getInbox` in `apps/server/src/services/direct-chat/getInbox.ts` now takes `{ cursor?, limit? }`, uses `take: limit + 1` with `cursor: { id }` / `skip: 1` to detect and advance pages, and returns `{ inbox, nextCursor }` instead of a bare array. Added `getInboxQuerySchema` (`cursor` string, `limit` int 1–50) to `packages/validators/src/direct-chat.ts` and exported it. `DMChatTopbar.tsx` now follows `nextCursor` through subsequent pages until it finds the open chat's `otherUser`. Added 3 unit tests for pagination in `getInbox.test.ts`.
**Why:** The inbox returned ALL chats in one response, which grows unboundedly as users accumulate DMs. Cursor pagination bounds the payload and enables future infinite-scroll UI.
**Impact:** Response shape for `GET /api/dm/inbox` is `{ ok, inbox, nextCursor }` (backward-compatible addition — existing clients still read `.inbox`). Default page size is 50, and the validator caps `limit` at 50. Note: `DMSidebar.tsx` is unchanged and now renders only the first page until it's updated for infinite scroll (see todo.md).
**Follow-ups:** Update `DMSidebar.tsx` for infinite scroll; default `limit` may need lowering once the client paginates.

**What changed:**

- **Prisma schema:** Added `DirectChatReadReceipt` and `ChatRoomReadReceipt` models with nullable `lastReadMessageId` FK (`onDelete: SetNull`), unique constraints on `(userId, chatId)`, and indexes on `userId` and `chatId`. Added reverse relations on `User`, `DirectChat`, `ChatRoom`, and `Message`.
- **Migration:** Created `20260809000000_add_read_receipts` with DDL for both tables, unique indexes, and foreign keys.
- **Validators:** Added `chatRoomIdParamSchema` and shared `markReadSchema` (`{ lastReadMessageId: string }`) in `packages/validators/src/room.ts`, exported from `index.ts`.
- **Services:** Created `services/direct-chat/markRead.ts` (`markDirectChatRead`) and `services/room/markRead.ts` (`markRoomRead`). Both validate message existence and ownership, compare incoming cursor against existing receipt, only advance forward (never backward), and return `{ lastReadMessageId, unreadCount }` — all inside a single Prisma transaction.
- **Unread count in inbox:** Updated `services/direct-chat/getInbox.ts` to batch-compute unread counts via a single raw SQL query using `LEFT JOIN` on `DirectChatReadReceipt`. A null cursor counts all messages from other users as unread.
- **Unread count in rooms:** Updated `GET /rooms` in `routes/room/room.ts` with the same batch-query pattern for `ChatRoomReadReceipt`.
- **Routes:** Added `POST /api/dm/:directChatId/mark-read` (rate-limited, validates params/body, asserts access, calls service, emits socket event). Added `POST /api/room/:chatRoomId/mark-read` with identical pattern.
- **Socket events:** Added `directChat:read` and `chatroom:read` to `ServerToClientEvents` in `types/socket-events.ts`. Added `emitDirectChatRead` and `emitChatRoomRead` helpers in `sockets/direct-chat.ts`. Both emit to `user:{userId}` only (multi-tab sync, not broadcast to room members).
- **Tests:** Added 35 unit tests across 4 test files: `markDirectChatRead` service (8 tests), `markRoomRead` service (8 tests), `getInbox` with unreadCount (6 tests, updated existing), and both mark-read routes (13 tests). Covers cursor advancement, backward-cursor rejection, message validation, ownership checks, unread count computation, and route-level request/response behavior. All 272 tests pass.

**Why:**
Users had no visibility into which messages were unread. The inbox and room list had no unread badges. Without a read receipt system, there was no way to distinguish read from unread messages or compute per-conversation unread counts efficiently.

**Impact:**

- `GET /api/dm/inbox` now returns `unreadCount` per chat (backward-compatible addition).
- `GET /api/room/rooms` now returns `unreadCount` per room (backward-compatible addition).
- Two new POST endpoints for marking conversations as read.
- Two new socket events for real-time unread badge synchronization across tabs/devices.
- Database: two new tables with proper indexes for efficient unread queries.
- No breaking changes — all additions are additive.

**Follow-ups:**

- Run `prisma migrate dev` against a live database to apply the migration.
- Frontend needs to consume `unreadCount` from inbox/rooms responses and listen for `directChat:read` / `chatroom:read` socket events to update badges in real time.
- Consider adding integration tests against a real database once the migration is applied.

---

## [2026-08-06] - Add Room Chat Edit/Delete

**What changed:**

- **Backend services:** Added `services/room/editMessage.ts` and `services/room/deleteMessage.ts` — mirrors the DM edit/delete pattern with 5-minute edit window and 30-minute delete window.
- **Socket handlers:** Added `chatroom:message:edit` and `chatroom:message:delete` events in `routes/room/roomChat.ts` with full authorization, time-window, and idempotency checks.
- **Validators:** Added `chatRoomEditMessageSchema` and `chatRoomDeleteMessageSchema` in `packages/validators/src/roomChat.ts`.
- **Frontend `MessageBubble`:** Added `onSubmitEdit` callback prop so room messages can use socket emit instead of hardcoded DM REST endpoint. Edit button now correctly hidden after 5 minutes (was 30 minutes).
- **Frontend `RoomMessages`:** Wired `chatroom:message:edited` and `chatroom:message:deleted` socket listeners, passes `onDelete` and `onSubmitEdit` callbacks to `MessageBubble`.
- **Bug fix:** Fixed `"Alreadt deleted"` typo in `services/direct-chat/deleteMessage.ts`.
- **Tests:** Added 10 tests covering edit/delete success, authorization, time windows, and invalid payloads.

**Why:**
Room chat had no edit/delete support — messages were immutable after sending. This brings feature parity with DM chat, which already supported edit (5 min) and delete (30 min).

**Impact:**

- Room members can now edit their messages within 5 minutes and soft-delete within 30 minutes.
- The Edit button is only shown within the 5-minute window, matching server-side validation (was incorrectly shown for 30 minutes).
- No breaking changes — all new socket events are additive.

**Follow-ups:**

- Consider adding a confirmation dialog before deleting a message.

---

## [2026-08-06] - Make S3 Optional for Text-Only Messages

**What changed:**

- `getS3Service()` in `routes/direct-chat/messages.ts` and `routes/room/roomChat.ts` now returns `S3Service | null` instead of throwing 503 when S3 env vars are missing.
- S3 is only initialized when `attachmentIds` is present and non-empty. Text-only messages bypass S3 entirely.
- When attachments are requested but S3 is not configured, a clear 503 error ("File uploads require S3 configuration") is returned.
- `routes/attachments.ts` presign endpoint unchanged — still throws 503 when S3 is missing (correct behavior since uploads cannot work without it).
- `services/direct-chat/sendMessage.ts` unchanged — already guards S3 usage behind `attachmentIds` check.

**Why:**
The previous implementation called `getS3Service()` unconditionally for every message send, even text-only messages. This caused a 503 error when `AWS_REGION` or `AWS_S3_BUCKET_NAME` were not set, making the entire chat system unusable without S3 configuration.

**Impact:**

- Text-only messages (DM and room chat) now work without S3 configuration.
- File uploads still require S3 — the error message is clearer and more specific.
- No frontend changes needed; the presign endpoint correctly rejects uploads when S3 is unavailable.

**Follow-ups:**

- Consider adding a health-check endpoint or startup warning when S3 is not configured, so operators know file uploads are disabled.

---

## [2026-08-04] - S3-Backed Attachment Architecture Refactor

**What changed:**

- **Database:**
  - Expanded `MessageType` enum to `TEXT | IMAGE | VIDEO | AUDIO | VOICE | FILE | SYSTEM`.
  - Added `Attachment` model with `id`, `messageId`, `uploaderId`, `s3Key`, `filename`, `mimeType`, `size`, `width`, `height`, `duration`, `thumbnailKey`, `status`, `createdAt`.
  - Added `AttachmentStatus` enum (`PENDING`, `ATTACHED`).
  - Removed legacy `fileUrl`, `fileName`, `fileSize` columns from `Message`.
  - Production-safe two-step migration: created `Attachment` table + backfilled existing file messages → dropped legacy columns.

- **Backend Services:**
  - `S3Service` (class-based DI): presigned PUT/GET URL generation, S3 object verification (`headObject`), object deletion.
  - `AttachmentService` (pure async functions): `createPendingAttachment`, `verifyAttachmentsForMessage`, `transitionAttachmentsToAttached`, `getAttachmentWithAccessCheck`, `deleteAttachment`.
  - `IdempotencyService`: Redis-backed idempotency keys with 24h TTL (`idempotency:{userId}:{clientKey}`).
  - Updated `sendMessage` (DM) and `registerRoomChat` (room) with transactional attachment linking, S3 object verification, and idempotency support.

- **API Routes:**
  - `POST /api/attachments/presign` — creates `PENDING` attachment, returns presigned PUT URL.
  - `GET /api/attachments/:id` — authorization check + short-lived presigned GET URL.
  - `DELETE /api/attachments/:id` — ownership/admin check, S3 delete then DB delete with failure recovery.

- **Validators (`@repo/validators`):**
  - New `attachment.ts`: `presignSchema`, `attachmentIdParamSchema`, `messageAttachmentSchema` with message-type/attachment-count validation rules.
  - Updated `sendMessageSchema` (DM) and `chatRoomMessageSchema` (room) to accept `messageType`, `attachmentIds`, `idempotencyKey`.

- **Frontend:**
  - `AttachmentRenderer` component: renders `IMAGE` (`<img>`), `VIDEO` (`<video controls>`), `AUDIO`/`VOICE` (`<audio controls>`), `FILE` (download link).
  - `MessageBubble` shared component: reusable between DM and room chat, supports text + attachments + edit/delete menu.
  - Updated `DMMessages` / `DMInput` with file picker, presign upload flow, and attachment sending.
  - New room chat frontend: `RoomMessages`, `RoomInput`, `RoomChatClient`, `RoomChatPage` at `/dashboard/room/[roomId]`.

- **Tests:**
  - Added `tests/mocks/s3.ts` for `S3Service` mocking.
  - Updated global `tests/setup.ts` to mock AWS SDK v3 (`S3Client`, `GetObjectCommand`, `PutObjectCommand`, etc.).
  - New test suites: `S3Service.test.ts`, `attachments.test.ts` (presign/download/delete routes), `sendMessageAttachments.test.ts`, `roomChatAttachments.test.ts`, `verifyForMessage.test.ts`, `getWithAccessCheck.test.ts`, `deleteAttachment.test.ts`, `createPending.test.ts`, `idempotency.test.ts`.
  - Updated all existing affected tests to use new schema (removed legacy `fileUrl/fileName/fileSize` references).
  - Coverage maintained above 90% threshold (Statements 96.67%, Branches 90.33%, Functions 100%, Lines 96.89%).

**Why:**
The previous architecture stored file metadata directly on `Message` rows (`fileUrl`, `fileName`, `fileSize`). This was inflexible, didn't support multiple attachments per message, had no ownership validation, and exposed permanent S3 URLs. The new architecture separates attachments into a dedicated table, supports multiple attachments per message, validates ownership via S3 headObject checks, uses short-lived presigned URLs, and prevents duplicate messages via idempotency keys.

**Impact:**

- All messages now support 0..N attachments with strict type validation.
- File uploads go directly from client → S3; backend only handles metadata and authorization.
- Orphaned uploads are tracked as `PENDING` and can be cleaned up asynchronously.
- No permanent S3 URLs exist anywhere in the codebase.
- Both DM and room chat support the full attachment lifecycle.

**Follow-ups:**

- Configure real AWS credentials and S3 bucket for production.
- Add background worker to clean up `PENDING` attachments older than a configurable TTL.
- Implement async thumbnail generation pipeline (schema already supports `thumbnailKey`).
- Add multipart upload support for files >5GB when needed.

---

## [2026-08-03] - Production-Grade GitHub Actions CI Pipeline

**What changed:**

- Added `.github/workflows/ci.yml` with a matrix-based CI pipeline that runs on every push and pull request to `main`/`master`.
- Added `.github/workflows/codeql.yml` for automated security vulnerability scanning (weekly, on PRs, and on pushes to default branch).
- Added `.github/dependabot.yml` to automate weekly dependency updates for npm/pnpm and GitHub Actions with grouped pull requests.
- Added `format:check` and `typecheck` convenience scripts to the root `package.json` so the CI commands match the requested interface.
- Added `prisma.schema` configuration to `apps/server/package.json` so `prisma generate` resolves the schema at `db/schema.prisma` without extra flags.
- Added `.editorconfig` to enforce consistent whitespace, line endings, and charset across editors.
- Added `.gitattributes` to normalize line endings to LF for all source files.
- Updated `.gitignore` to exclude `.pnpm-debug.log*` and `*.tsbuildinfo`.

**Why:**
The project previously had no automated CI, which meant formatting, lint, type-check, test, and build regressions could be merged unnoticed. This change introduces a fast, deterministic, and production-ready GitHub Actions pipeline that validates every change before it reaches the default branch.

**Impact:**

- All pushes and pull requests are now gated by the `CI` status check.
- Coverage reports are uploaded as artifacts after every run.
- Dependabot will open grouped update PRs weekly, reducing manual toil.
- CodeQL provides continuous security auditing for the TypeScript/JavaScript codebase.

**Follow-ups:**

- Monitor first few CI runs to confirm pnpm store caching and Turbo task execution times are optimal.
- If unit tests are added to `apps/web` or other packages, the existing `turbo run test` pipeline will pick them up automatically.
