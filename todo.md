# TODO

## Backlog

### High Priority

- [ ] **Add File send support for DMs**
  - [ ] Update `sendMessageSchema` in `@repo/validators` to accept `messageType`, `fileUrl`, `fileName`, `fileSize`
  - [ ] Update `sendMessage` service to handle `FILE` type (like room chat already does)
  - [ ] Update `messageCreateSelect` to include file fields in response
  - [ ] Test in Postman

- [ ] **Add "mark as read" / unread count**
  - [ ] Add `DirectChatReadReceipt` model to Prisma schema (userId, directChatId, lastReadMessageId, readAt)
  - [ ] Add `ChatRoomReadReceipt` model to Prisma schema (userId, chatRoomId, lastReadMessageId, readAt)
  - [ ] Run `prisma migrate dev`
  - [ ] Create `POST /api/dm/:directChatId/mark-read` endpoint
  - [ ] Create `POST /api/room/:chatRoomId/mark-read` endpoint
  - [ ] Update `GET /api/dm/inbox` to include `unreadCount` per chat
  - [ ] Update `GET /api/room/rooms` to include `unreadCount` per room
  - [ ] Emit socket event when mark-read happens

- [ ] **Add Delete, Update to the room chat**
  - [ ] Add `chatroom:message:edit` socket event handler (5 min window, like DMs)
  - [ ] Add `chatroom:message:delete` socket event handler (30 min window, soft delete, like DMs)
  - [ ] Broadcast edits/deletes to room members

### Medium Priority

- [ ] **Create Backend Endpoint GET /dashboard/overview**
  - [ ] Define what stats to return (total rooms, total DMs, unread messages, recent activity, etc.)
  - [ ] Add route + service
  - [ ] Add tests

- [ ] **Add DM inbox pagination (cursor / infinite scroll)**
  - [ ] `GET /api/dm/inbox` currently returns ALL chats — add `cursor` + `limit` query params

### Low Priority / Polish

- [ ] Add `isEdited` flag to Message schema (instead of just checking `editedAt`)
- [ ] Add `reactions` support to messages
- [ ] Add message search endpoint

## In Progress

> Pick **one** item from High Priority and move it here. Start with *File send support for DMs* — it's the smallest, fastest win.

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
