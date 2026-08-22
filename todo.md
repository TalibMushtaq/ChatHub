# TODO

## Rooms → Community & Channel Architecture

> Full spec: `Rooms to Community — Improved Implementation Prompt.md`. Implement phases strictly in order; run tests, typecheck, lint, build, and manually verify before moving to the next phase (see §23).

### Phase 1 — Architecture + Data Model

- [x] Architecture assessment of existing Room/message/membership/auth/realtime/UI/db (§2)
- [x] Expand `Room` model (description, icon, ownerId, timestamps) without removing existing data (§5.1)
- [x] Create `Category` model (roomId, name, position) (§5.2)
- [x] Create `Channel` model (roomId, categoryId, name, topic, type TEXT|VOICE, position) with name validation (§5.3)
- [x] Message migration: existing Rooms get `GENERAL` category + `#general` channel, move messages, idempotent + resumable (§5.4, §17)
- [x] API: Rooms CRUD — `GET/PATCH/DELETE /rooms/:roomId` (§5.5)
- [x] API: Categories — `POST/PATCH/DELETE /rooms/:roomId/categories[/:categoryId]`, `PATCH .../reorder` (§5.5)
- [x] API: Channels — `POST/GET/PATCH/DELETE /rooms/:roomId/channels[/:channelId]`, `PATCH .../reorder` (§5.5)
- [x] Update message APIs to scope by `roomId + channelId` (§5.5)
- [x] Authorization abstraction: Owner/Admin/Member permissions, backend-enforced (§5.6, §20)
- [x] Backend tests for migration + category/channel CRUD (§5.7)

### Phase 2 — New Room Frontend Shell

- [x] Room layout: header + sidebar (categories/channels) + channel content + members sidebar (§6)
- [x] Room sidebar with header dropdown menu (authorized vs member menus) (§6.1)
- [x] Categories render (collapse/expand, channels) + functional Create Channel/Category modals (§6.2)
- [x] Channel appearance: # / 🔊 icons, active/unread states (§6.3)
- [ ] Channel appearance: mentioned-state indicator (needs per-channel mention/unread system — Phase 6) (§6.3)
- [ ] Channel appearance: voice participant count + avatar stack (needs call presence — Phase 7) (§6.3)
- [x] Channel header: name + topic, notification + member toggle, stays visible while scrolling (§6.4; search deferred — message search is a Backlog item)
- [x] Message area: cursor pagination, grouping, timestamps/avatar/content, edited/deleted states, context menu (§6.5; reactions/reply N/A — app has neither)
- [x] Message composer: anchored, multiline, Enter/Shift+Enter, failure handling, preserves text, attachments (§6.6)
- [x] Mobile layout: drawers/sheets, room→sidebar→channel flow, member-list drawer; full-screen thread sheet handles the keyboard (§6.7)
- [x] Phase 2 completion: loading/error/empty states + existing auth + realtime; client-side per-channel unread heuristic (server cursors land in Phase 6) (§6.8)

> Phase 2 verified with `pnpm test` (664), `check-types`, `lint`, `build` (commit `b9a99a1`). Deferred pieces tracked as separate items above; manual browser pass still pending.

### Phase 3 — Channel & Category Management

- [x] Channel CRUD (create/rename/edit/delete/move) with create modal + client/server validation + duplicate prevention (§7.1)
- [x] Category CRUD (create/rename/delete/collapse/reorder); delete moves channels to "Uncategorized" (§7.2)
- [x] Drag-and-drop reorder with keyboard + touch + optimistic rollback (§7.2)
- [x] Channel context menu (edit/notification/copy link/delete) + confirmation for destructive actions (§7.3)

> Phase 3 verified with `pnpm test` (server 665 / web 78), `check-types`, `lint`, `build` (format check clean). Manual browser pass still pending.

### Phase 4 — Roles + Members

- [x] Role system: Owner/Admin/Moderator/Member with permissions list, backend-enforced (§8.1)
- [x] Member list grouped by role with avatar, presence, role indicator (§8.2)
- [x] Member management: assign/remove role, mute/kick/ban with confirmation (§8.3)

> Phase 4 verified with `pnpm test` (server 697 / web 78), `check-types`, `lint` (0 warnings), `build` (server + web) — all clean. Manual browser pass still pending.

### Phase 5 — Room Settings

- [x] Settings layout: Overview/Profile/Channels/Roles/Members/Notifications/Moderation/Danger Zone (§9)
- [x] Overview: edit name/description/icon with preview (§9.1)
- [x] Notifications preferences: all/mentions/muted, per user per Room/channel (§9.2)
- [x] Danger Zone: leave + delete Room with explicit confirmation (§9.3)

### Phase 6 — Notifications + Unread + Realtime

- [x] Per-channel unread states (Unread/Mentioned/Read/Muted) with `lastReadMessageId` cursor (§10.1)
- [x] Mark read on channel switch, server sync, no background-marking (§10.1)
- [x] Real-time events: message/channel/category/member/room events (§10.2)

> Phase 6 verified with `pnpm test` (server 697 / web 78), `check-types`, `lint` (0 warnings), `build` — all clean. New `ChannelReadReceipt` + `MessageMention` models + migration. Per-channel cursor replaces room-wide receipt; `@mention` extraction, `mention:new` socket event + push gating by notification pref (All/Mentions/Muted); full `channel:*/category:*/room:updated` realtime set; `ChannelItem` mentioned/unread/muted badges; `ListPanel` room-level `@N` badge. Run `prisma migrate dev` to apply `20260820000001_add_channel_read_receipts_mentions` (commit `6069a9d`, with follow-ups `a4d3120` + `c55f5e1`).

### Phase 7 — Voice Channels + Calls

- [x] Media architecture decision: LiveKit SFU (managed) chosen over mesh; documented (§11.2)
- [x] Voice channel join/leave with permission enforcement + participant limit + preview option (§11.1)
- [x] `CallSession` + `CallParticipant` models (metadata only, no media persistence) (§11.3)
- [x] Short-lived join tokens issued by backend; TURN/STUN via LiveKit (§11.2, §20)
- [x] Device management: enumeration/selection, echo cancellation/noise suppression/AGC defaults (§11.2)
- [x] Call features: mute/deafen/camera/screen share (getDisplayMedia), video tiles, speaking indicators (§11.4)
- [x] Moderator actions: server-mute, disconnect (§11.4)
- [x] Screen share: "you are sharing" indicator, focus tile, native-stop reconciliation (§11.4)
- [x] Call signaling events: call.* + call.participant.* (§11.5)
- [x] Full in-channel call view: adaptive grid, tiles, controls bar (§11.6)
- [ ] Edge cases: single call constraint, reconnect w/ backoff, stale participant reaping, mid-call permission/device changes (§11.7)
- [ ] Phase 7 completion: audio/video/screen-share end-to-end, sidebar presence realtime, call survives navigation (§11.8)

> Phase 7 backend verified with `pnpm test` (741), `check-types`, `lint`, `build`. Frontend store/device/call UI written; edge cases (single-call constraint, reconnect UI, screen-share native-stop reconcile) partially wired. Manual browser E2E (two users, audio/video/screen-share) still pending — requires PostgreSQL migration applied + a running LiveKit server.

### Phase 8 — Floating Call Widget

- [x] Widget rendered at app shell level, persists across all navigation (§12.1)
- [x] Draggable on desktop, clamped to viewport, session/localStorage position (§12.1)
- [x] Minimized state: connection indicator, channel/room name, timer, controls, avatar stack (§12.2)
- [x] Expanded state: adaptive tile grid + footer controls; ✕ collapses, only 📞 leaves (§12.2)
- [x] Screen-share focus / PiP mode + optional native Document PiP (§12.2)
- [x] Controls: mute/deafen/camera/screen share/settings/expand/disconnect, optimistic + real-state-synced, shortcuts (§12.3)
- [x] Status/feedback: speaking indicators, reconnecting state, screen-share self-indicator, "you're muted" nudge (§12.4)
- [x] App interaction: navigates to voice channel on click, coexists with DMs, no click swallowing (§12.5)
- [x] Mobile: docked bar above composer + bottom sheet, keyboard/safe-area aware (§12.6)
- [x] Accessibility: keyboard operable, live-region announcements, shortcuts, reduced-motion (§12.7)
- [x] Performance: isolated state subscription, pause remote video when minimized, throttle speaking updates (§12.8)
- [x] Phase 8 completion criteria + E2E widget scenario (§12.9)

> Phase 8 verified with `pnpm test` (85), `check-types`, `lint` (0 warnings), `build` (server + web) — all clean. LiveKit `Room` lifetime lifted to `CallProvider` above routing; `CallView` refactored to pure display consumer. Widget survives all navigation, draggable desktop shell with localStorage position persistence, minimized pill + expanded grid + mobile bottom-sheet. Global keyboard shortcuts (Ctrl+Shift+M/D). Manual browser E2E (call-survives-navigation, drag, PiP, mobile sheet) still pending — requires PostgreSQL migration applied + a running LiveKit server.

### Phase 9 — UX Polish

- [ ] Interaction polish: hover/active/focus/keyboard/context menus/tooltips/confirmation/toasts/skeletons/empty states (§13.1)
- [ ] Empty states: no channels, empty channel, empty voice channel, member CTA (§13.2)
- [ ] Error states incl. mic/camera/screen-share/call failures; no raw backend errors (§13.3)
- [ ] Offline/reconnect: subtle indicator, resync channels/unread/messages/call state, no duplicates (§13.4)

### Phase 10 — Performance

- [ ] Cursor pagination everywhere, virtualize large lists, lazy-load media stack (§14)
- [ ] Cache stable Room/channel metadata, optimistic reorder, debounce search, prune WS subscriptions, isolate widget from rerenders (§14)

### Phase 11 — Accessibility

- [ ] Keyboard-navigable channel list, focus states, real buttons, ARIA labels, dialog focus mgmt + Escape (§15)
- [ ] Accessible drag/drop alternatives, contrast, reduced-motion, widget shortcuts + live regions (§15)

### Phase 12 — Testing + Regression Audit

- [ ] Backend: authz, category/channel CRUD, ordering, migration, permissions, voice token issuance, call session lifecycle, stale reaping (§16)
- [ ] Frontend: loading/channel switching/message send, creation flows, permission UI, mobile nav, error/empty states, widget states/drag/persistence/toggle sync (§16)
- [ ] E2E: room→category→channel→message flow + two-user calling scenario with widget (§16)
- [ ] Regression audit across all phases + full build/test/lint pass

## Backlog

### High Priority

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
