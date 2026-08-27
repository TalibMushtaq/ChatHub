# TODO

## Backlog

### High Priority

- [ ] **DM Voice & Video Calling** (see `plan.md` for full architecture)
  - [x] **Phase 1: Database migration** — CallSession fields (callType, status, outcome, connectedAt, directChatId), CHECK constraint, partial unique indexes, Message.metadata, backfill existing rows
  - [x] **Phase 2: Shared call core** — `services/call/core.ts` (createOrReuseSession, upsertParticipant, markParticipantLeft, endSessionIfEmpty with FOR UPDATE, generateCallToken, reapStaleParticipants, endAllActiveSessions)
  - [x] **Phase 3: Update room call service** — Refactor `services/room/call.ts` to use shared core, populate new fields (callType, status, outcome, connectedAt)
  - [x] **Phase 4: DM call service** — `services/direct-chat/call.ts` (initiateDmCall, acceptDmCall, declineDmCall, cancelDmCall, joinDmCall, leaveDmCall, getActiveDmCall, handleLiveKitConnected, handleLiveKitDisconnected)
  - [x] **Phase 5: Socket event types** — Add `dmCall:*` events to `types/socket-events.ts` (invited, accepted, declined, cancelled, connected, ended, participant.joined/left, livekitConnected/disconnected, dismiss)
  - [x] **Phase 6: DM call routes** — `routes/direct-chat/call.ts` (7 endpoints: initiate, accept, decline, cancel, join, leave, getActive — all with auth + DM access checks)
  - [x] **Phase 7: Mount routes** — Mount call router in `routes/direct-chat/index.ts`
  - [x] **Phase 8: DM call socket handlers** — `sockets/direct-chat.ts` (livekitConnected/disconnected handlers with Redis tracking)
  - [x] **Phase 9: Server timeout task** — `index.ts` setInterval every 10s for `timeoutRingingCalls` (RINGING > 60s → MISSED)
  - [x] **Phase 10: System message creation** — Idempotent call-history via `checkIdempotency("system", "call-history:{sessionId}")`
  - [x] **Phase 11: Frontend API client** — Add DM call methods to `CallAPI` (initiateDm, acceptDm, declineDm, cancelDm, joinDmToken, leaveDm, getActiveDmCall)
  - [x] **Phase 12: Frontend call store** — Replace scattered IDs with `activeCall: ActiveCall | null` discriminated union, add transition guards
  - [x] **Phase 13: Frontend CallProvider** — Add initiateDmCall, joinDmCall, acceptDmCall, livekitConnected emission after RoomEvent.Connected, DuplicateIdentity disconnect handling
  - [x] **Phase 14: Frontend AppShell** — Add `dmCall:*` socket event handlers, incoming call state management, widget CallTarget support
  - [x] **Phase 15: DM call UI** — ThreadPanel voice/video call buttons, IncomingCallModal component, widget CallTarget prop support
  - [ ] **Phase 16: System message rendering** — MessageRow.tsx SYSTEM type + CallHistoryMessage component

### Testing & QA (DM Voice/Video Calling)

- [ ] **Backend tests** — DM call service + routes (`tests/unit/services/direct-chat/call.test.ts`, `tests/unit/routes/direct-chat/call.test.ts`)
- [ ] **Socket tests** — DM call events (`tests/unit/sockets/dmCall.test.ts`)
- [ ] **Frontend tests** — Call store, IncomingCallModal
- [ ] **Regression tests** — Existing room calls still work
- [ ] **E2E tests** — Two-browser DM call (`e2e/dm-call.spec.ts`)

### Medium Priority

- [ ] **Create Backend Endpoint GET /dashboard/overview**
  - [ ] Define what stats to return (total rooms, total DMs, unread messages, recent activity, etc.)
  - [ ] Add route + service
  - [ ] Update frontend dashboard components to use real data instead of hardcoded mocks

### Low Priority / Polish

- [ ] Add `isEdited` flag to Message schema (instead of just checking `editedAt`)
- [ ] Add `reactions` support to messages
- [ ] Add message search endpoint

## In Progress

> Pick **one** item from High Priority and move it here.

## Completed ✓

- [x] **Add DM inbox pagination** — `GET /api/dm/inbox` accepts `cursor` + `limit` query params and returns `nextCursor`
- [x] **Add Room messages HTTP endpoint** — `GET /api/room/:chatRoomId/messages` with cursor pagination (same contract as DM messages, gated by room membership)
- [x] Friend Request + Blocking system (FriendRequest/Friendship/UserBlock models + enum, `/api/friends/requests` CRUD + accept/decline, `/api/users/:userId/block` + `/api/users/blocked`, socket events `friend-request:new/accepted/declined/blocked`, Web Push kind `friend-request`, search `relationship` field, web inbox cards + search actions + blocked list in Privacy, 566 server tests + 45 web tests)
- [x] Add proper setError in signup form
- [x] Auth middleware: session check + fetch user from DB + attach `req.user`
- [x] Prisma DM schema: `DirectChat` + `Message` with unique pair handling
- [x] `POST /api/dm/start-dm/:userId` (create/find DM chat)
- [x] `POST /api/dm/:directChatId/message` (send message)
- [x] `GET /api/dm/:directChatId/messages` (fetch messages with cursor pagination)
- [x] Tested all 3 DM endpoints successfully in Postman
- [x] add inbox endpoint: `GET /api/dm/my-chats` (list all DM chats)
- [x] add edit for chat sent, time 5 min
- [x] add Socket.io realtime for DMs (emit on REST send)
- [x] add Delete api to delete sent message (30 min window, soft delete)
- [x] add Socket.io system for ChatRoom messages (socket-first)
- [x] Store user snapshot in session
- [x] `POST /auth/forgot-password` (recovery code based password reset)
- [x] File send support for **Room Chat** (socket handler already supports `messageType: FILE`)
- [x] File send support for **DMs** (sendMessageSchema accepts messageType + attachmentIds, DMInput has file picker with presigned upload flow)
- [x] Add Delete, Update to the room chat (chatroom:message:edit/delete socket events, 5min/30min windows, frontend wired via callbacks)
- [x] **Add "mark as read" / unread count** ✅
  - [x] Add `DirectChatReadReceipt` model to Prisma schema (userId, directChatId, lastReadMessageId, lastReadMessageCreatedAt)
  - [x] Add `ChatRoomReadReceipt` model to Prisma schema (userId, chatRoomId, lastReadMessageId, lastReadMessageCreatedAt)
  - [x] Run `prisma migrate dev` (migration SQL created at `db/migrations/20260809000000_add_read_receipts/`)
  - [x] Create `POST /api/dm/:directChatId/mark-read` endpoint
  - [x] Create `POST /api/room/:chatRoomId/mark-read` endpoint
  - [x] Update `GET /api/dm/inbox` to include `unreadCount` per chat
  - [x] Update `GET /api/room/rooms` to include `unreadCount` per room
  - [x] Emit socket event when mark-read happens (`directChat:read`, `chatroom:read` to `user:{userId}`)
  - [x] Unit tests: 35 tests across 4 files, all passing
