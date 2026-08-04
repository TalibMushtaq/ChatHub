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
