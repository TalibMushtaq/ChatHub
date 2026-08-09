# TODO

## Backlog

### High Priority

- [ ] **Add "mark as read" / unread count** ✅
  - [x] Add `DirectChatReadReceipt` model to Prisma schema (userId, directChatId, lastReadMessageId, lastReadMessageCreatedAt)
  - [x] Add `ChatRoomReadReceipt` model to Prisma schema (userId, chatRoomId, lastReadMessageId, lastReadMessageCreatedAt)
  - [x] Run `prisma migrate dev` (migration SQL created at `db/migrations/20260809000000_add_read_receipts/`)
  - [x] Create `POST /api/dm/:directChatId/mark-read` endpoint
  - [x] Create `POST /api/room/:chatRoomId/mark-read` endpoint
  - [x] Update `GET /api/dm/inbox` to include `unreadCount` per chat
  - [x] Update `GET /api/room/rooms` to include `unreadCount` per room
  - [x] Emit socket event when mark-read happens (`directChat:read`, `chatroom:read` to `user:{userId}`)
  - [x] Unit tests: 35 tests across 4 files, all passing

### Medium Priority

- [ ] **Create Backend Endpoint GET /dashboard/overview**
  - [ ] Define what stats to return (total rooms, total DMs, unread messages, recent activity, etc.)
  - [ ] Add route + service
  - [ ] Update frontend dashboard components to use real data instead of hardcoded mocks

- [ ] **Add DM inbox pagination (cursor / infinite scroll)**
  - [ ] `GET /api/dm/inbox` currently returns ALL chats — add `cursor` + `limit` query params

- [ ] **Add Room messages HTTP endpoint**
  - [ ] Frontend `RoomMessages` calls `GET /room/:chatRoomId/messages` but no server handler exists
  - [ ] Create endpoint with cursor pagination (similar to DM messages endpoint)

### Low Priority / Polish

- [ ] Add `isEdited` flag to Message schema (instead of just checking `editedAt`)
- [ ] Add `reactions` support to messages
- [ ] Add message search endpoint

## In Progress

> Pick **one** item from High Priority and move it here.

## Completed ✓

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
