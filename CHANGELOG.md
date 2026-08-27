## [2026-08-27] - Phase 16: System Message Rendering (Call History)

**What changed:** Rendered call-history SYSTEM messages in DM and room timelines, fixed live broadcasting, and added room-call history that was previously missing.

Server (`apps/server`):

- **`services/call/history.ts` (new)**: Shared, idempotent call-history message creator. Works for both DM (`directChatId`) and room-channel (`chatRoomId` + `channelId`) targets, computes duration from `connectedAt`/`endedAt`, and emits the right socket events (`message:new` + `inbox:update` for DMs, `chatroom:message` for rooms). Replaces the DM-only local copy in `services/direct-chat/call.ts`.
- **`services/direct-chat/call.ts`**: `declineDmCall`/`cancelDmCall`/`leaveDmCall` now take optional `io` and broadcast the created history message live via the shared module.
- **`routes/direct-chat/call.ts`**: Passes `req.io` into the DM call service functions.
- **`services/room/call.ts`**: `leaveCall` and `forceLeaveCall` now create a COMPLETED history message when the last participant leaves (previously room calls had no history at all). `leaveCall` emits live when given `io`.
- **`routes/room/call.ts`**: Passes `req.io` into `leaveCall`.
- **`services/call/core.ts`**: `timeoutRingingCalls` now creates a MISSED history message for timed-out DM calls (previously missing) and broadcasts it.
- **`constants/direct-chat.ts` + `constants/room.ts`**: `messageWithUserSelect` and `roomMessageWithUserSelect` now include `metadata` and `senderId` so clients can identify and render SYSTEM messages.

Web (`apps/web`):

- **`types.ts`**: Added `metadata?: Record<string, unknown> | null` to `Message`.
- **`messages/CallHistoryMessage.tsx` (new)**: Centered pill renderer for call-history SYSTEM messages. Outcome drives the tint + icon: MISSED (red), DECLINED (amber), CANCELLED (muted), COMPLETED (green). Renders a plain centered status line for unrecognized SYSTEM messages.
- **`messages/MessageList.tsx`**: Routes `messageType === "SYSTEM"` rows to `CallHistoryMessage` instead of `MessageRow`, and excludes them from sender-grouping.
- **`AppShell.tsx`**: `normalize` + `AnyMsg` now carry `metadata` through socket delivery.

Tests: added room-call history assertions, timeout MISSED history assertions, and `lastText` + `callHistoryTint` unit coverage. Server 902 tests, web 174 tests — all passing.

**Why:** Call-history messages existed in the DB (Phase 10) but were invisible: not broadcast live, missing `metadata`/`senderId` in API responses, and rendered as ordinary bubbles from a nonexistent "system" sender. Room calls and timed-out calls never created history at all.

**Impact:** Users now see a styled call-history line in both DM and room timelines ("Missed voice call", "Voice call · 5:32") when a call ends — delivered live via sockets and consistent on refresh. Verification: `npm run check-types`, `npm run lint`, server + web test suites — all clean.

## [2026-08-25] - DM Voice/Video Calling Frontend (Phases 13-15)

**What changed:** Implemented the frontend UI for 1:1 DM voice and video calling, completing Phases 13, 14, and 15 of the DM calling feature, plus bug fixes for error handling and UX.

Web (`apps/web`):

- **CallProvider.tsx**: Added `acceptDmCall()` method that calls `DmCallAPI.accept()` then joins LiveKit via `joinDmCall()`. Added `DuplicateIdentity` disconnect handling — when LiveKit disconnects with reason `DUPLICATE_IDENTITY`, the call state is cleared immediately without attempting reconnection (another device joined with the same user identity).
- **AppShell.tsx**: Added `dmCall:*` socket event handlers (`invited`, `accepted`, `declined`, `cancelled`, `connected`, `ended`, `dismiss`, `error`) to manage incoming call state and lifecycle. The `dmCall:error` handler shows a toast with the server's error reason and clears call UI if the error relates to the active session. Renders `IncomingCallModal` and `CallingOverlay` as persistent overlays above all other UI.
- **IncomingCallModal.tsx**: New component — full-screen overlay for incoming DM calls showing caller avatar, name, call type, and Accept/Decline buttons. Plays a looping ringtone (`/sounds/ringtune.mp3`) while ringing. Auto-dismisses on `dmCall:cancelled` and `dmCall:dismiss` events.
- **CallingOverlay.tsx**: New component — "Calling…" overlay shown to the caller while waiting for the callee to accept. Includes a Cancel button wired to `DmCallAPI.cancel()`.
- **ThreadPanel.tsx**: Added voice (phone) and video (camera) call buttons in the DM thread header with error toasts — if `initiateDmCall` fails, a toast shows "Couldn't start call" with the server error message.
- **FloatingCallWidget.tsx**: Extended to render a floating widget for active DM calls when the user navigates away from the DM thread. Shows partner name, connection status dot, elapsed time, and mute/leave controls (mute toggle + leave call button).

**Why:** Phases 13-15 wire the frontend to the backend DM calling infrastructure (Phases 4-12) and provide the user-facing call initiation, acceptance, and in-call UI. Bug fixes address missing `dmCall:error` handling (callers could get stuck), incomplete DM widget (no controls), silent call failures, and missing audio feedback.

**Impact:** Users can now initiate, accept, decline, and cancel 1:1 voice/video calls from the DM thread header. Incoming calls display a prominent overlay with a ringtone. Active DM calls show a floating widget with mute/leave controls when navigating away from the thread. Server-side errors are surfaced via toasts. Multi-device scenarios are handled via `DuplicateIdentity` disconnect detection. Verification: `pnpm -F web check-types`, `pnpm -F web lint` — both clean.

## [2026-08-25] - Fix Screen Share Visibility + Widget Pinned Mode Reset

**What changed:** Fixed two bugs in the voice channel call UI that prevented screen shares from rendering and caused the floating widget to get stuck in pinned mode.

Web (`apps/web`):

- **ParticipantTile.tsx**: Changed `.find()` in `attachVideo` to prioritize `Track.Source.ScreenShare` over `Track.Source.Camera`. Previously, camera was always found first, so screen share tracks were never attached to the video element.
- **WidgetExpanded.tsx**: Changed `pinnedScreenShare` effect to unconditionally sync with `hasScreenShare`. Previously, it only set `true` when sharing started but never reset to `false` when sharing ended, leaving the widget stuck in pinned mode (which hides non-sharing remote participants).

**Why:** Two independent bugs: (1) `.find()` iterates in publication order and camera is typically published before screen share, so the camera track always won. (2) `useEffect` only guarded the `true` transition, so once pinned mode activated it persisted permanently.

**Impact:** Web only. Screen shares now render in participant tiles and the widget grid returns to normal layout after sharing stops. Verification: `pnpm -F web check-types`, `pnpm -F web lint` — both clean.

## [2026-08-25] - Enable Voice Channel Creation in UI

**What changed:** Removed the `disabled` attribute from the Voice option in the Create Channel modal dropdown, making voice channels selectable.

Web (`apps/web`):

- **CreateChannelModal.tsx**: Voice channel `<option>` changed from `disabled` with "Voice (coming soon)" label to enabled `<option value="VOICE">Voice</option>`. Comment updated to reflect TEXT and VOICE are both fully wired.

**Why:** Phase 7 (voice channels) is fully implemented — LiveKit SFU integration, backend token issuance, room management, and frontend call UI are all complete. The Voice option was disabled as a Phase 3 placeholder.

**Impact:** Web only. Users can now create voice-type channels from the UI. Verification: `pnpm check-types`, `pnpm lint`, `pnpm build` — all clean.

## [2026-08-25] - Phase 7: Edge Cases — Single-Call Constraint, Reconnect, Permission-Kick, Debounce

**What changed:** Completed the remaining Phase 7 edge-case items (§11.7) and added a Phase 10 performance optimization (room-search debounce).

Server (`apps/server`):

- **Single-call constraint** (`services/room/call.ts`): `getJoinToken()` now queries for any active `CallParticipant` (leftAt=null, session endedAt=null) before issuing a token. If the user is already in a _different_ voice channel, the join is rejected with 409 `ALREADY_IN_CALL`. Re-joining the same channel is allowed (idempotent upsert).
- **`forceLeaveCall()`** (`services/room/call.ts`): new exported helper that force-marks a user's `CallParticipant` as left, removes them from the LiveKit room (best-effort), and ends the session if they were the last participant. Called by kick/ban services; no permission check — the caller has already been verified.
- **Kick/Ban force-leave** (`services/room/members.ts`): `kickMember()` and `banMember()` now call `forceLeaveCall()` after removing membership. The return type gains `callInfo: { channelId, sessionId, callEnded } | null` so the route handler can emit `call.participant.left`.
- **Kick/Ban route events** (`routes/room/members.ts`): kick and ban handlers now emit `call.participant.left` with `callEnded` when the target was in a call.

Web (`apps/web`):

- **Reconnect with exponential backoff** (`CallProvider.tsx`): on `RoomEvent.Disconnected`, if the disconnect was _not_ intentional (user didn't click Leave), the client enters a reconnect loop: max 5 attempts, exponential backoff (1s→2s→4s→8s→16s, capped at 30s). Each retry calls `POST /join-token` for a fresh token, creates a new LiveKit `Room`, and connects. On success, resets the counter. On failure after exhausting retries, calls `clearActiveCall()`. Intentional leaves (clicking the Leave button) bypass the reconnect loop entirely.
- **`attemptReconnect` ref pattern**: the reconnect function is stored in a ref to avoid circular dependencies with `joinCall`'s disconnect handler.
- **Room-search debounce** (`ListPanel.tsx`): room list client-side filtering now debounces the query by 300ms (matching the DM search debounce). The `debouncedQ` state updates only after 300ms of no keystroke activity, preventing per-keystroke re-renders of the room list.

Tests:

- 12 new unit tests across `call.test.ts` and `members.test.ts`: single-call constraint (reject different channel, allow same channel, allow when not in call), `forceLeaveCall` (force-leave + LiveKit removal, session end on last participant, no-op when not in call, LiveKit failure handling), kick with call-info return, ban with call-info return, kick/ban resilience when forceLeaveCall throws.

**Why:** Phase 7 §11.7 — edge cases for voice calls: single-call constraint prevents users from being in multiple calls simultaneously, reconnect with backoff handles transient network failures, force-leave on kick/ban ensures disconnected users don't remain in calls, and room-search debounce improves sidebar rendering performance.

**Impact:** Server + web. `getJoinToken` now rejects 409 for cross-channel joins (breaking change for clients that relied on client-side-only constraint — the previous client-side check is now reinforced server-side). `kickMember`/`banMember` return types changed (additive `callInfo` field). Frontend reconnect adds no new API surface. Verification: `pnpm test` (server 820 / web 166), `pnpm check-types`, `pnpm lint` (0 warnings), `pnpm build` — all clean.

**Follow-ups:** Manual browser E2E testing of reconnect (requires LiveKit running). Frontend reconnect logic is best-effort; the LiveKit SDK's built-in reconnection handles brief network blips, and this application-level retry handles full disconnects after SDK retry failure.

## [2026-08-25] - Phase 10: Performance — Profiling + MemberSidebar Memoization

**What changed:** Completed the Phase 10 §14 virtualization gating item and optimized the `MemberSidebar` re-render behavior.

**Profiling analysis (code-level):**

- **MessageList**: Already cursor-bounded (50-100 messages per page). No virtualization needed.
- **DM List**: Typically 10-100 items. No virtualization needed.
- **Room List**: Typically 5-50 items. No virtualization needed.
- **MemberSidebar**: Could have 100-500+ members in large rooms. Re-renders entirely on every `presence` change from `useShell()`. **Fixed via React.memo**, not virtualization.

Web (`apps/web`):

- **`MemberSidebar.tsx`**: extracted member rows into a `React.memo`-wrapped `MemberRow` component. Memoized the `groups` computation (`useMemo` on `[members]`). Memoized `members` fallback (`useMemo` on `[roomMembers, roomId]`). Memoized `openMenu` callback (`useCallback`). This prevents the entire member list from re-rendering when presence changes — only the specific member row whose presence changed re-renders.

**Why:** Phase 10 §14 — the spec gates virtualization on Chrome DevTools profiling evidence. Code-level analysis showed that all lists are bounded by pagination or typical data sizes, with no virtualization needed. The `MemberSidebar` was the only list with a re-render problem, which was a `React.memo` issue, not a virtualization issue.

**Impact:** Web only. `MemberSidebar` is the only changed component. No API or schema changes. Verification: `pnpm test` (server 820 / web 166), `pnpm check-types`, `pnpm lint` (0 warnings), `pnpm build` — all clean.

## [2026-08-24] - Phase 12: Testing + Regression Audit

**What changed:** Comprehensive test coverage pass across the entire codebase. Backend: MODERATOR role permission coverage in `permissions.test.ts`, route-level tests for categories (`categories.test.ts`), channels (`channels.test.ts`), notification preferences (`notificationPrefs.test.ts`), room invitations (`joinroominvite.test.ts`), join links (`joinroomlink.test.ts`), and join requests (`joinroomreq.test.ts`). Service edge-case coverage for call lifecycle (`getActiveCallsForRoom`, `leaveCall` remaining/already-left/no-session, `reapStaleParticipants` no-stale/LiveKit-not-found/empty-session/partial-staleness/session-survives, `endAllActiveSessions` no-active). Route coverage for `call.started`/`call.ended` socket emissions and `GET /calls/active`. Frontend: test infrastructure with `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, and vitest setup with `next/navigation`/`next/link` mocks. Component tests for `MessageComposer`, `RoomShell`, `CreateChannelModal`, `CreateCategoryModal`, `CallErrorBoundary`, `ReconnectBanner`, `MemberContextMenu` (permission logic), and call widget pure functions (`WidgetMinimized`, `WidgetExpanded`, `callStoreExtended`). Validators: full Zod schema test suite for all 8 validator modules (room, roomChat, direct-chat, user, attachment, friends, avatar, push) with 372 tests covering valid inputs, required fields, invalid types, boundary conditions, enums, cross-field refinements, and `.strict()` rejection. E2E: Playwright infrastructure with `test:e2e` script, room flow and voice calling scenario specs.

**Why:** Phase 12 of the Rooms-to-Community architecture spec (§16) — testing + regression audit to validate all phases 1-11 work correctly. Fills critical coverage gaps: route-level socket emissions, call service edge cases, MODERATOR permissions, frontend component rendering, and shared validator schemas.

**Impact:** 140+ new test cases across backend (112 files, 808 tests), frontend (20 files, 166 tests), and validators (8 files, 372 tests). New dependencies: `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` (web), `vitest` (validators), `@playwright/test` (web). Server coverage remains ≥90%. Web coverage collected (advisory, no threshold). E2E tests require PostgreSQL + LiveKit running. No production code changes. Verification: `pnpm test` (server 808 / web 166 / validators 372), `pnpm check-types`, `pnpm lint` (0 warnings), `pnpm build` — all clean.

**Follow-ups:** Manual browser testing recommended for voice/video/screen-share flows. E2E tests require PostgreSQL + LiveKit running locally (`pnpm test:e2e`). CI integration for E2E tests recommended as a follow-up. Frontend coverage thresholds can be added incrementally once baseline is established.

## [2026-08-24] - Add route unit tests for room join/notification endpoints

**What changed:** Created 4 new test files under `apps/server/tests/unit/routes/room/`: `notificationPrefs.test.ts` (4 tests), `joinroominvite.test.ts` (7 tests), `joinroomlink.test.ts` (8 tests), `joinroomreq.test.ts` (8 tests). Tests cover all CRUD operations for notification preferences, room invitations, join links, and join requests — including success paths, validation errors, authorization checks, and edge cases (self-invite, already member, already reviewed).

**Why:** Route handlers previously had no unit test coverage. These tests follow the established pattern from `call.test.ts` and use `vitest-mock-extended` via `resetPrismaMock` for prisma mocking, with express + supertest for HTTP testing.

**Impact:** 27 new passing tests across 4 files. No production code changes. Test infrastructure only.

**Follow-ups:** None.

## [2026-08-22] - Phase 11: Accessibility (WCAG 2.1 AA)

**What changed:** Comprehensive accessibility pass across the entire frontend. `Modals.tsx`: added `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` (linked to title heading) on every modal frame — both normal and fullscreen variants. `DeviceSettingsModal.tsx`: same dialog ARIA attributes added. `Toasts.tsx`: wrapped toast container in `role="status" aria-live="polite"` so screen readers announce notifications. Form accessibility: added `id`/`htmlFor` pairing, `aria-describedby` for error messages, and `aria-invalid` on fields with validation errors across 11 modal forms (`CreateChannelModal`, `EditChannelModal`, `CreateCategoryModal`, `EditCategoryModal`, `DeviceSettingsModal`, `MemberModals` kick/ban + nickname, `RoomSettingsModal`, and inline modals in `Modals.tsx` — NewDm, NewRoom, Status, Recovery). `AppShell.tsx`: added skip-to-content link for keyboard navigation, changed thread column from `<aside>` to `<main id="main-content">` for correct landmark semantics. `FloatingCallWidget.tsx`: added `focus-visible:ring-2 ring-accent` so the draggable widget shows a visible focus indicator. `Toasts.tsx`: fixed success toast contrast — changed `bg-success text-white` to `bg-success text-bg` (dark text on light green passes WCAG AA). `AuthCard.tsx`: added `role="status" aria-live="polite"` on username availability messages (checking/available/taken/invalid). `ChannelItem.tsx`: corrected `aria-current="true"` to `aria-current="page"`.

**Why:** Phase 11 of the Rooms-to-Community architecture spec (§15) — make the application fully usable without a mouse. Addresses WCAG 2.1 AA compliance gaps: missing dialog roles, unlabeled form fields, absent live regions, missing skip links, incorrect landmarks, poor contrast, and focus indicator gaps.

**Impact:** Frontend-only changes across 10 files: `Modals.tsx`, `DeviceSettingsModal.tsx`, `Toasts.tsx`, `CreateChannelModal.tsx`, `EditChannelModal.tsx`, `CreateCategoryModal.tsx`, `EditCategoryModal.tsx`, `MemberModals.tsx`, `RoomSettingsModal.tsx`, `AppShell.tsx`, `FloatingCallWidget.tsx`, `ChannelItem.tsx`, `AuthCard.tsx`. No backend changes. No breaking changes — all ARIA attributes are additive. Verification: `pnpm test` (server 748 / web 78), `check-types`, `lint` (0 warnings), `build` — all clean.

**Follow-ups:** Manual screen reader testing (VoiceOver/NVDA) recommended. Windows High Contrast Mode (`forced-colors`) testing not yet performed. Live region for sidebar mention/unread count changes deferred — current toast announcements cover the primary use case.

## [2026-08-21] - Phase 7: Voice Channels + Calls (LiveKit SFU)

**What changed:** Full voice-channel calling infrastructure using LiveKit SFU for WebRTC transport. Backend: `CallSession`/`CallParticipant` Prisma models, `participantLimit` on Channel, LiveKit SDK singleton (`lib/livekit.ts`), call APIs (`join-token`, `leave`, `GET active`, `PATCH moderator`), stale participant reaper on startup + periodic. Frontend: Zustand `useCallStore` (isolated from ShellCtx), `useDeviceManager` hook (enumerate/select/persist mic+cam+speaker), `PreJoinPreview` modal, `CallView` (adaptive grid + LiveKit connection), `ParticipantTile` (video/avatar/speaking ring/mute indicators), `CallControlsBar` (mute/deafen/camera/screen-share/settings/leave), `DeviceSettingsModal`, `VoiceChannelSidebar`. Socket events: `call.started`, `call.ended`, `call.participant.joined/left/kicked/muted`. Integration: `RoomShell` renders `CallView` for VOICE channels, `ChannelItem` shows pre-join preview, `AppShell` wires call socket events to update call store. Tests: 20 new backend tests for token issuance, permission checks, participant limit, session reuse, leave, moderator mute/disconnect, stale reaping.

**Why:** Phase 7 of the Rooms-to-Community architecture spec (§11) — live voice channels with real-time audio/video/screen-share.

**Impact:** Server: new Prisma migration (`20260821000000_add_call_models`), new deps `livekit-server-sdk` (server) + `@livekit/components-react` + `livekit-client` + `zustand` + `lucide-react` (web). New env vars: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_WS_URL` (also added to `turbo.json` globalEnv). No existing behavior changed — voice channels were placeholder until now. Verification: `pnpm test` (server 741 / 104 files, web 78), `check-types`, `lint` (0 warnings), `build` — all clean.

**Follow-ups:** Requires PostgreSQL migration applied + LiveKit server running locally (Docker). Manual E2E testing with two users needed (audio, camera, screen-share, moderator actions, reconnect). Edge cases partially wired: single-call constraint + screen-share native-stop reconcile are handled in `CallView`; stale reaper implemented server-side. Phase 8 (floating call widget) builds on this.

## [2026-08-20] - Phase 6 follow-up: socket event types + mention toast channel name

**What changed:** Tightened `socket-events.ts` — `channel:created`/`channel:updated` payloads now declare `type` as the proper `"TEXT" | "VOICE" | "ANNOUNCEMENT" | "FORUM"` union instead of `string`. The `mention:new` payload and toast now carry `channelName` so the notification reads `#general` instead of `#a1b2c3d4`.

**Why:** Observations from the Phase 6 audit.

**Impact:** Server-only type tightening + one extra column (`name`) added to an existing channel query in `roomChat.ts` (zero additional round-trip). Backward-compatible — `channelName` is additive to the socket payload. Verification: `pnpm test` (server 721, web 78), `check-types`, `lint` (0 warnings), `build` — all clean.

**Follow-ups:** None.

## [2026-08-20] - Phase 6 follow-up: mention extraction fix + service test coverage

**What changed:** Fixed a boundary bug in `extractMentionedUsernames` (the regex matched `@` after any non-word char, but the parse used `m.trim().slice(1)`, so a boundary like `/` leaked into the username — `/@ghost` became `@ghost`). The parser now reads the capture group instead. Added unit tests for the three new Phase 6 services (`markChannelRead`, `channelUnread`, `mentions`) and for the notification-pref recipient filtering in `pushNewMessage` (MUTED excluded, MENTIONS only when mentioned) — the previous PR left those files at 0-43% coverage, which failed the 90% branch threshold.

**Why:** CI failed on the coverage gate after the Phase 6 feature landed; the extraction fix is a correctness issue surfaced while writing the tests.

**Impact:** Server-only. Branch coverage back above the 90% threshold (90.59%). Verification: `pnpm test` (server 721 / 102 files), `check-types`, `lint` (0 warnings), `build` — all clean.

**Follow-ups:** None.

## [2026-08-20] - Rooms → Community: notifications + unread + realtime (Phase 6)

**What changed:** Implemented the Phase 6 notifications/unread/realtime layer (§10): per-channel read cursors with server-computed unread/mention counts, @-mention extraction with a dedicated mention event, room-level notification preferences (All / Mentions / Muted) that gate both the sidebar indicators and push delivery, and realtime mirroring of channel/category/room CRUD so every member's sidebar stays live without refetching.

Server (`apps/server` + `packages/validators`):

- **Schema** (`db/schema.prisma`): new `ChannelReadReceipt` (`@@unique([userId, roomId, channelId])`, `lastReadMessageId`, `lastReadMessageCreatedAt`) and `MessageMention` (`@@unique([messageId, userId])`) models with relations back to `Channel`/`Message`/`User`. Migration `20260820000001_add_channel_read_receipts_mentions` backfills one receipt per user/room/channel from the coarsest existing `ChatRoomReadReceipt` cursor (idempotent).
- **New services** (`services/room/markChannelRead.ts`, `channelUnread.ts`, `mentions.ts`): per-channel cursor upsert (`getChannelUnreadState` reads the cursor before counting so the `gt` filter stays scalar), `getRoomsChannelUnreads` (aggregate grouped unread/mention counts via `$queryRaw` `= ANY(${roomIds})`), `extractMentionedUsernames` (regex `(^|[^\w@])@([a-zA-Z0-9_]{3,20})`), `createMessageMentions`.
- **Routes** (`routes/room/room.ts`): `POST /:roomId/channels/:channelId/mark-read` and `GET /:roomId/channels/:channelId/read-receipt` (rate-limited via the existing `createRateLimiter`/`setRateLimitHeaders` pattern); `GET /room/rooms` now returns `channelUnreads` per room. `services/message/mutations.ts` `MessageScopeField` and `markRead.ts` receiptModel union extended with the channel variants.
- **Mentions + push** (`routes/room/roomChat.ts`, `services/push/push.ts`): message send detects mentions, persists `MessageMention`, emits `mention:new` per recipient, and passes `mentionedUserIds` to `pushNewMessage`, which now filters recipients by `notificationPref` (MUTED excluded entirely; MENTIONS only when the user is mentioned).
- **Socket events** (`types/socket-events.ts`): added `channel:read`, `channel:readReceipt`, `mention:new`, `channel:created/updated/deleted/reordered`, `category:created/updated/deleted/reordered`, `room:updated`; emitted from the channel/category/room routes after each committed mutation.

Web (`apps/web`):

- `types.ts`: `ChannelUnreadState` (`unreadCount`/`mentionCount`); `RoomInboxEntry.channelUnreads`. `state.ts`/`AppShell.tsx`: `channelUnreads` replaces the Phase-2 boolean dot map (ref-synced `setChannelUnreadsBoth`), plus `roomNotificationPrefs` (roomId → ALL/MENTIONS/MUTED) seeded from the room detail/membership and updated via the channel menu; `markRead()` now calls the per-channel endpoint for the active channel only, clearing just that channel's state.
- Realtime handlers: `channel:read` (cross-tab cursor sync), `mention:new` (flips the channel to Mentioned + toast), and the full `channel:*`/`category:*`/`room:updated` set (pure, module-level updaters; no refetch).
- `room/ChannelItem.tsx` + `helpers.ts`: `channelUnreadStatus()` derives mentioned/unread/muted/read — mentioned renders a red `@N` badge, unread a dot, muted dims the row and suppresses both; `ListPanel.tsx` shows a red `@N` room badge when any channel has mentions. `room/ChannelContextMenu.tsx`: "Notification Settings" is now an inline All/Mentions/Muted selector (optimistic, reconciles via `updateRoomNotificationPref`, same prefs as `RoomSettingsModal`).

**Why:** Roadmap Phase 6 — per-channel unread/mention indicators and live sidebar updates are the notification backbone; the per-channel cursor replaces the room-wide cursor so reading one channel no longer clears another's unread state, and the room-level pref gives members explicit control over what alerts them.

**Impact:** DB (additive migration + backfill), server API surface (additive per-channel endpoints + unread fields + new socket events), web client (unread model reworked from boolean to counts). Room-wide read-receipts are untouched and still emitted; `chatroom:message` already carried `channelId`, so no new message event was needed. Verification: `pnpm test` (server 697 / 99 files incl. new services + route tests; web 78 / 8 files), `check-types`, `lint` (0 warnings), `build` — all clean. Run `prisma migrate dev` to apply `20260820000001_add_channel_read_receipts_mentions`.

**Follow-ups:** `mention:new` toast content truncates the sender's message (could render a mini preview later); unread counts are reset on channel open but the cursor sync is best-effort (reconciled on the next `getRooms`). Per-room prefs gate push delivery now; a global per-channel override set is a possible extension point but intentionally out of scope.

**What changed:** Implemented the Phase 4 roles + members layer (§8): a new `MODERATOR` role, a full member-management API (assign role, kick, ban/unban, timed mute, per-room nickname), live member events over the existing socket layer, and a member-management UI (member context menu, ban list, nickname/member-action modals). Banned users are blocked from re-entering via join links and invitations. The permission vocabulary also gained the voice permissions Phase 7 will consume.

Server (`apps/server` + `packages/validators`):

- **Schema** (`db/schema.prisma`): `ChatRoomRole` gains `MODERATOR` (inserted between ADMIN and MEMBER, non-destructive); `ChatRoomMember` gains `nickname String?` + `mutedUntil DateTime?`; new `RoomBan` model (`@@unique([roomId, userId])`, `bannedById`, `reason`) so bans persist after the membership is removed. Migration `20260819000000_add_roles_members` (additive, no backfill).
- **Permissions** (`services/room/permissions.ts`): role hierarchy becomes MEMBER < MODERATOR < ADMIN < OWNER; MODERATOR gets `VIEW_CHANNEL`/`SEND_MESSAGES`/`MANAGE_MESSAGES` plus the voice perms (`CONNECT_VOICE`, `SPEAK_VOICE`, `VIDEO_VOICE`, `SCREENSHARE_VOICE`, `MOVE_MEMBERS_VOICE`); ADMIN/OWNER also gain those voice perms and `MENTION_EVERYONE`.
- **New service** `services/room/members.ts`: `changeMemberRole` (owner-only via `MANAGE_ROLES`), `kickMember` (removes membership + read receipt, `MANAGE_MEMBERS`), `banMember` (RoomBan upsert + kick in one transaction, idempotent re-ban), `unbanMember`, `muteMember`/`unmuteMember` (`MANAGE_MEMBERS`, sets `mutedUntil`), `setNickname` (self or `MANAGE_MEMBERS`), `isMuted`, `getRoomBans`. All hierarchy checks refuse to act on the OWNER or a role at/above the caller's.
- **Routes** `routes/room/members.ts` (mounted in `room.ts`): `PATCH /:roomId/members/:userId/role`, `POST /:roomId/members/:userId/kick`, `POST|DELETE /:roomId/members/:userId/ban`, `POST|DELETE /:roomId/members/:userId/mute`, `PATCH /:roomId/members/:userId/nickname`, `GET /:roomId/bans`. Bodies validated with the new `changeMemberRoleSchema`/`banMemberSchema`/`muteMemberSchema`/`setNicknameSchema` (400 on invalid input); `memberUserIdParamSchema` added.
- **Member list** (`getMembers.ts`): now returns `nickname` + `mutedUntil`.
- **Ban gates**: `POST /room/join/:token` and invitation-accept both reject a banned user (403) inside the transaction.
- **Socket events** (`types/socket-events.ts` + emitters): `chatroom:member:added` (join-link join), `chatroom:member:removed` (`reason: left|kicked|banned` — wired into `leave`, `kick`, `ban`), `chatroom:member:roleChanged`, `chatroom:member:muted`/`unmuted`, `chatroom:member:nicknameChanged`.

Web (`apps/web`):

- `types.ts`: `RoomRole` gains `"MODERATOR"`; `RoomMember` gains `nickname`/`mutedUntil`; new `RoomBan` type; `ModalName` gains `memberAction`/`banList`/`nickname`.
- `api.ts`: `changeMemberRole`, `kickMember`, `banMember`, `unbanMember`, `getRoomBans`, `muteMember`, `unmuteMember`, `setMemberNickname`.
- `state.ts` + `AppShell.tsx`: context gains `roomBans` + the member-action methods and `refreshRoomBans`; socket handlers for all `chatroom:member:*` events update the member list live (reuse the `setRoomMembersBoth`/ref pattern); optimistic role/mute/nickname patches.
- `room/MemberSidebar.tsx`: adds the `MODERATOR` group, a 🔇 muted indicator, per-room nickname display, and a per-member "⋯" button + right-click that opens the new member context menu.
- `room/MemberContextMenu.tsx` (new): permission-gated member actions — View Profile, Set Nickname, Set as Admin/Moderator/Member (owner-only for admin), Mute presets (10min/1h/1d/1w)/Unmute, Kick/Ban; only OWNER/ADMIN (strictly senior to the target, never the owner) get management actions.
- `room/MemberModals.tsx` (new): `MemberActionModal` (kick/ban confirm + optional reason), `BanListModal` (review + unban), `NicknameModal` (set/clear). Registered in `Modals.tsx`.
- `room/RoomHeaderMenu.tsx`: adds "Banned Users" to the admin menu. `styles.ts` adds `chipModerator`.

**Why:** Roadmap Phase 4 — communities need role-based moderation (a Moderator tier between Admin and Member) and the ability to assign roles, kick, ban, mute, and nickname members, all enforced on the backend with live sidebar updates, before Room Settings and voice channels land.

**Impact:** DB (additive migration: new enum value, two nullable columns, new `RoomBan` table), server API surface (additive member endpoints + member socket events), web client. Existing OWNER/ADMIN/MEMBER behavior is preserved; `GET /:roomId/members` returns two extra nullable fields. Verification: `pnpm test` (server 697 / 99 files incl. new members service + route + validator tests; web 78 / 8 files), `check-types`, `lint` (0 warnings), `build` — all clean. Run `prisma migrate dev` to apply `20260819000000_add_roles_members`.

**Follow-ups:** `MOVE_MEMBERS_VOICE` and the voice permissions are defined but only exercised in Phase 7 (calls). Message moderation (delete others' messages as `MANAGE_MESSAGES`) isn't surfaced in the UI yet — the permission exists and the existing message edit/delete is currently sender-scoped, so that's a Phase 9/12 concern. Custom roles with per-permission overrides remain out of scope (the permission map is the extension point).

## [2026-08-19] - Rooms → Community: channel/category management (Phase 3)

**What changed:** Implemented the Phase 3 channel & category management layer on top of the Phase 1/2 foundation: full channel CRUD (create/rename/edit/move/delete) with client + server validation and duplicate prevention, category rename/delete (delete moves channels to "Uncategorized"), drag-and-drop reorder for categories and channels (with keyboard + touch support and optimistic rollback), channel/category context menus, confirmation for destructive actions, and shareable per-channel deep links.

Server (`apps/server` + `packages/validators`):

- **Reorder endpoint extended for cross-category moves** — `channelReorderSchema` (new) replaces `reorderSchema` on `PATCH /rooms/:roomId/channels/reorder`; the payload is now `{ items: [{ id, categoryId }] }` so a drag that moves a channel into another category commits atomically (position + categoryId) in one transaction. `reorderChannels` (`services/room/channels.ts`) validates every id and non-null category belongs to the room before writing. `reorderCategories` keeps the old `orderedIds` contract.
- **Tests** (`tests/unit/services/room/channels.test.ts`): reorder tests updated to the item payload; added foreign-category rejection + cross-category position/category assignment coverage (20 tests in the file).

Web (`apps/web`):

- **New deps** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` — accessible drag-and-drop (PointerSensor for mouse/touch, KeyboardSensor for keyboard, closestCenter collision).
- **`room/sidebarReorder.ts`** (new): pure, unit-tested helpers — `channelsByCategory`/`channelContainer`/`applyDragOver`/`moveChannel` (arrayMove semantics), `channelReorderResult`/`categoryReorderResult` (build the API payload + locally-patched room detail), `channelLink`/`parseConvParam` (deep links). 16 tests in `tests/sidebarReorder.test.ts`.
- **`room/RoomSidebar.tsx`**: owns the `DndContext`; category headers sort via a `SortableContext`, each category's channel list is its own `SortableContext` with a droppable container (drop into empty categories). Reorder state lives in a local `dragContainers` snapshot seeded at drag start; on drop the arrangement is patched optimistically via the new `patchRoomDetail` shell function and reconciled with the server, with a refetch rollback on failure.
- **`room/CategorySection.tsx`**: sortable category header (grip handle for admins), droppable channel-list area, category context menu trigger (right-click + "⋯"), and per-container channel rendering from the DnD state.
- **`room/ChannelItem.tsx`**: row now also carries a drag handle (admins) and a "⋯" menu button; right-click opens the context menu. Menu is portal-rendered with viewport-clamped fixed coordinates so it isn't clipped by the sidebar's scroll container.
- **`room/ChannelContextMenu.tsx` + `room/CategoryContextMenu.tsx` + `room/MenuList.tsx`** (new): §7.3 menus — admins get Edit Channel / Notification Settings / Copy Channel Link / Delete Channel; members get Notification Settings / Copy Channel Link. Categories get Rename / Create Channel / Delete. Destructive actions go through the existing confirm modal.
- **`room/EditChannelModal.tsx` + `room/EditCategoryModal.tsx`** (new): rename + topic + category move (the keyboard/mobile path for moving a channel), with client-side name validation mirroring the server and inline duplicate detection. Registered as `editChannel`/`editCategory` modals in `Modals.tsx`.
- **`room/CreateChannelModal.tsx`**: drops ANNOUNCEMENT/FORUM (server only accepts TEXT/VOICE), disables VOICE with a "coming soon" tooltip (§7.1), adds client-side name validation + duplicate pre-check.
- **`Modals.tsx`**: registers both edit modals; `ConfirmModal` now awaits an async `onYes` so delete/category-delete shows a busy state until the request settles.
- **`AppShell.tsx`**: `parseConvParam` extended to `room:<roomId>:<channelId>` (shared helper), `openConvFromLink` passes the channel through, and room open validates the requested channel against the fetched structure (falls back to `#general`/first when stale). `patchRoomDetail` added to the shell for optimistic tree edits.
- **`api.ts`**: `reorderChannels(roomId, items)` matches the new payload.

**Why:** Roadmap Phase 3 — authorized users need to manage the category/channel tree (create, rename, move, delete) with production-grade validation, confirmation, and accessible drag-and-drop, plus shareable channel links, before roles/members and voice channels land.

**Impact:** `apps/web` (large: new room management components + dnd wiring in the sidebar; `reorderChannels` signature change is web-only, the endpoint was unused before) and `apps/server` (reorder endpoint contract change + validator; additive for category reorder). Deep links gained an optional `:channelId` segment; existing `?conv=room:<id>` links still work. Verification: `pnpm test` (server 665 / 97 files incl. updated channel tests; web 78 / 8 files incl. the new 16-test `sidebarReorder.test.ts`), `check-types`, `lint` (0 warnings), `build` — all clean.

**Follow-ups:** Real-time channel/category events (Phase 6) will make reorder/create/edit propagate to other members automatically — today they're reflected per-client after the action's local patch/refresh. Drag-and-drop is dnd-kit KeyboardSensor-based; the settings-side channel editor (Phase 5) will offer a redundant, non-drag alternative for moving channels.

## [2026-08-19] - Rooms → Community: room shell, channels UI, per-channel timelines (Phase 2)

**What changed:** Built the Phase 2 room front-end on top of the Phase 1 category/channel model: a full room shell (sidebar with category→channel tree, channel timeline + composer, members sidebar), per-channel message timelines with cursor pagination, a client-side unread heuristic, and functional Create Channel / Create Category modals. A new `POST /rooms/:roomId/leave` endpoint removes the caller's membership.

Server (`apps/server`):

- **New service** `services/room/leaveRoom.ts` (`leaveRoom`): deletes the caller's `ChatRoomMember` + `ChatRoomReadReceipt` in one transaction; rejects OWNER (transfer/delete is Phase 5) and non-members with 403 via `getRoomRole`.
- **Route** `routes/room/room.ts`: `POST /rooms/:roomId/leave`; emits `chatroom:left` to `user:{userId}` after leaving.
- **Tests** `tests/unit/services/room/leaveRoom.test.ts`: 3 tests (member leave, owner blocked, non-member blocked).

Web (`apps/web`):

- `components/app/messages/` (new): `MessageRow.tsx` (+ `AttachmentCard`) and `MessageComposer.tsx` extracted verbatim from the old `ThreadPanel` so DM and channel timelines share one renderer; `MessageList.tsx` adds day dividers/sender grouping, upward cursor pagination (`onLoadOlder`/`hasMore`/`loadingOlder`), scroll-restore (captures `scrollHeight`/`scrollTop` before a fetch, re-applies the delta on completion) and an `empty` slot. Composer now resets on channel switch and its `onSendVoice` accepts an optional caption.
- `components/app/room/` (new): `RoomShell.tsx` (renders in the thread column for `active.kind === "room"`; grid `RoomSidebar | channel | MemberSidebar`, mobile drawer + scrim, skeleton/error/empty states, per-room reset via `key`), `RoomSidebar.tsx` (+ skeleton), `RoomHeaderMenu.tsx` (OWNER/ADMIN management menu vs member menu; Create Channel/Category, Leave Room with confirm, Invite People; role falls back to `active.myRole`), `CategorySection.tsx` (+ uncategorized, collapse/expand persisted in `RoomShell`, per-category "+" for admins), `ChannelItem.tsx` (`#`/`🔊` glyphs via new `HashIcon`/`SpeakerIcon`, active/unread states), `ChannelHeader.tsx` (name/topic, room-scoped typing indicator, member count badge, notifications entry), `MemberSidebar.tsx` (role-grouped members, presence dots, mobile bottom-sheet), `CreateChannelModal.tsx` + `CreateCategoryModal.tsx` (functional, refresh the cached room detail), `useRoomDetail.ts` (cached `GET /room/rooms/:roomId` loader).
- `state.ts`: `ActiveConv.channelId`; `channelKey(roomId, channelId)` timeline key; `ShellCtx` gains `channelUnread`, `roomDetails`, `openChannel`, `leaveRoom`, `refreshRoomDetail`, `loadOlderMessages`.
- `api.ts`: `ChatAPI.leaveRoom`, and `RoomSocket.send` now takes an explicit `channelId`.
- `AppShell.tsx`: rooms open at a default channel (`#general` else first) via an async `openConv` path that caches the detail; `timelineKey()` keys timelines per channel; `openChannel` switches/loads the active channel; `loadOlderMessages` pages before the oldest loaded message (per-channel cursor/has-more refs); `leaveRoom` updates client state directly (the `chatroom:left` echo from `chatroom:leave` is indistinguishable from the membership-removal emit, so no socket listener is added); `onNew` routes by `msg.channelId` (append only if that timeline is loaded, set `channelUnread` for non-active channels, `markReadNow` only for the active channel); `onEdited`/`onDeleted` patch every loaded `room:{id}:` timeline since edit/delete payloads carry no `channelId`; message send/voice/removeLocal are channel-aware; thread column renders `<RoomShell />` for rooms.
- `types.ts`: `ModalName` gains `createChannel`/`createCategory`; new `HashIcon`/`SpeakerIcon`/`ChevronIcon` in `icons.tsx`.
- `Modals.tsx`: registers both create modals (createChannel payload `{ roomId, categoryId? }`).

**Why:** Roadmap Phase 2 — the community architecture needs a functional channel-based room UI (sidebar, per-channel timelines, unread heuristic, membership leave) before role/member management and voice channels land in later phases.

**Impact:** `apps/web` (large: new room components + AppShell wiring; existing `ThreadPanel` now DM-only) and `apps/server` (additive leave endpoint). Unread counts are a client-side heuristic this phase — server-synced per-channel cursors land in Phase 6. Voice channels render as plain rows (participant presence is Phase 7). Room-level `markRoomRead` still drives room read receipts; per-channel read cursors are out of scope. Verification: `pnpm test` (664 tests / 97 files, incl. the 3 new leaveRoom tests), `pnpm check-types`, `pnpm lint` (0 warnings), `pnpm build` — all clean.

**Follow-ups:** Phase 3/5 role & member management and channel tree live updates (channel created/deleted/reordered are currently reflected only after the create modals' manual refresh); per-channel typing; DM infinite scroll (only room channels page this phase).

## [2026-08-18] - Rooms → Community: categories, channels, and roomId normalization (Phase 1)

**What changed:** Laid the data-model + API foundation for the "Rooms to Community" roadmap (see `Rooms to Community — Improved Implementation Prompt.md`, Phase 1 / §5.1–5.6, DB-safety §17). Rooms now contain a `Category → Channel` tree, existing rooms were migrated into a `GENERAL → #general` structure, all room API/socket/web payloads were normalized from `chatRoomId` to `roomId`, and a role-based permission layer now guards room mutations.

Server (`apps/server` + `packages/validators`):

- **Schema** (`db/schema.prisma`): new `ChannelType` enum (TEXT/VOICE/ANNOUNCEMENT/FORUM), `Category` (`@@unique([roomId, name])`), `Channel` (categoryId nullable `onDelete: SetNull`, `@@unique([roomId, name])`), and `Message.channelId` (nullable, `onDelete: Cascade`, `@@index([channelId, createdAt])`). Migration `20260818174929_add_categories_channels` backfills every room with a `GENERAL` category + `#general` channel (guarded `WHERE NOT EXISTS`, so it is idempotent/resumable) and pins existing messages to it. `scripts/verify-channel-backfill.ts` re-verifies/repairs the invariant (`FIX=true`).
- **Validators** (`packages/validators/src/room.ts`, `roomChat.ts`): added `roomAvatarKeySchema`, `updateRoomSchema`, `createCategorySchema`, `updateCategorySchema`, `channelNameSchema` + `normalizeChannelName` (lowercase-hyphen, 2–32 `[a-z0-9-]`), `channelTypeSchema`, `createChannelSchema`, `updateChannelSchema`, `reorderSchema`, `roomIdParamSchema`, `categoryIdParamSchema`, `channelIdParamSchema`. `chatRoomMessageSchema` now requires `roomId` with an optional `channelId`.
- **Permissions** (`services/room/permissions.ts`, new): `RoomPermission` vocabulary mapped to roles — OWNER (all incl. `MANAGE_ROOM`/`MANAGE_ROLES`), ADMIN (channels/categories/members/messages), MEMBER (view/send) per spec §5.6. `assertRoomPermission`, `assertRoleAtLeast`, `getRoomRole`.
- **Services**: `channels.ts`, `categories.ts` (delete moves channels to Uncategorized, never destroys them), `roomSettings.ts` (`updateRoom`/`deleteRoom` owner-only, `seedDefaultStructure` idempotent) — all new; `getMessages.ts` gained an optional `channelId` filter; `markRead.ts`/`getMembers.ts`/`editMessage.ts`/`deleteMessage.ts` param names normalized.
- **Routes** (`routes/room/room.ts` + new `categories.ts`, `channels.ts`): mounts category/channel CRUD + reorder endpoints, seeds `GENERAL → #general` on `POST /rooms`, adds `GET/PATCH/DELETE /rooms/:roomId` and `GET /:roomId/channels/:channelId/messages`, normalizes every path param to `:roomId`.
- **Socket** (`routes/room/roomChat.ts`, `types/socket-events.ts`): all `chatroom:*` payloads use `roomId`; messages carry `channelId` (a missing one resolves to the room's `#general` via `resolveDefaultChannelId` so the pre-Phase-2 UI keeps working), channel ownership is verified before send, and emits use the shared `toRoomMessagePayload`.

Web (`apps/web`):

- `components/app/types.ts`, `api.ts`, `AppShell.tsx`, `ThreadPanel.tsx`: `Message` type and all room API/socket calls normalized to `roomId`; added channel/category types, `getRoomDetail`/`getChannelMessages`/`updateRoom`/`deleteRoom` and channel/category CRUD + reorder stubs in `api.ts`.

**Why:** Roadmap Phase 1 — the community architecture needs categories/channels as first-class models with safe one-time migration of existing data, and a single `roomId` naming convention before multi-channel UI lands in Phase 2.

**Impact:** DB (additive migration + idempotent backfill), server API surface (`:chatRoomId` → `:roomId` is a breaking rename for existing room API/socket callers), web client. Tests: 661 across 96 files (server), coverage ≥90% on all metrics; server/web typecheck and lint clean; web build clean.

**Follow-ups:** Phase 2 sidebar UI + explicit `channelId` sends from the client; ANNOUNCEMENT/FORUM channel types are accepted by the enum but not yet wired; `RESET_S3`/`FIX`/`RESET_S3_PRODUCTION` added to `turbo.json` `globalEnv` to silence env-var lint warnings.

## [2026-08-17] - Fix voice presign float duration rejection

**What changed:** Fixed a 400 `Invalid input: expected int, received number` on `POST /api/attachments/presign` for voice uploads. `apps/web/components/app/VoiceRecorder.tsx` computed `durationSeconds` as a raw float (`ms / 1000`), which the Zod `presignSchema` (`.int()` on `durationSeconds`) correctly rejects. The recorder now rounds to a whole second at `onstop` (and stores raw `durationMs` so the sub-second "too short" guard still works after rounding). Server-side, `apps/server/src/services/attachment/createPending.ts` now normalizes a float duration with `Math.round` before persisting to the `Int` column, so a non-web client can't store a fractional value; new unit test covers the float branch.

**Why:** Bug fix — the voice recorder's real recordings (always fractional seconds) failed presign validation before upload.

**Impact:** `apps/web` (VoiceRecorder) + `apps/server` (createPending) + one test. Verified live against `localhost:3100`: the reported float payload reproduces the exact Zod error, the rounded payload passes, the 300s cap is still enforced, and non-voice presigns still reject voice-only metadata. Server tests: 582 across 92 files; web lint and typecheck clean.

**Follow-ups:** None.

## [2026-08-17] - Composer controls reorder

**What changed:** In `apps/web/components/app/ThreadPanel.tsx`, the message composer row now reads `[attach] [emoji] [text input] [mic] [send]` — the file-attach and emoji buttons moved to the left of the text input instead of the right. Mic/send remain right-aligned, and the attach/emoji/send buttons still hide while a voice recording is active.

**Why:** Requested UI change — attachment and emoji controls are more discoverable on the leading edge of the composer.

**Impact:** `apps/web` only, layout-only (pure DOM-order change in the existing flex row; the emoji popover still positions from `emojiBtnRef`, so no logic changes). No API, schema, or test changes; web lint and typecheck clean.

**Follow-ups:** None.

## [2026-08-17] - Voice Messages (Rooms + DMs)

**What changed:** Added end-to-end voice messages, usable in both rooms and DMs, plugged into the existing attachment/message pipeline rather than a parallel system.

Server (`apps/server`):

- **Schema** (`db/schema.prisma`): `Attachment` gains `waveformPeaks Json?` (precomputed amplitude samples, 0..1, so playback renders a waveform without decoding audio). Migration `20260817000000_add_attachment_waveform_peaks` adds the column. Reuses the existing `MessageType.VOICE` enum and `Attachment.duration` (seconds) column.
- **Upload** (`routes/attachments.ts` + `services/attachment/createPending.ts`): the existing `POST /attachments/presign` voice context now persists `durationSeconds` + `waveformPeaks` alongside the S3 record, with a server-side 5-minute cap enforced at presign and again in `verifyForMessage` at attach time (defense in depth).
- **Validators** (`packages/validators/src/attachment.ts`): `ALLOWED_VOICE_MIME_TYPES` gains `audio/mp4` (Safari's MediaRecorder fallback); `presignSchema` accepts optional `durationSeconds` (1–300) + `waveformPeaks` (≤96 samples), required only for the `voice` context and forbidden on non-voice presigns.
- **Payloads**: `attachmentSummarySelect` now carries `duration` + `waveformPeaks`, so every message payload (history, send response, socket broadcast) includes playback metadata. Fixed a latent bug in `constants/direct-chat.ts` where `messageWithAttachmentsSelect` omitted `messageType` — DM send responses and `message:new` broadcasts now carry it (required for the client to detect VOICE in DMs). `getWithAccessCheck` returns the same fields. Inbox/room list last-message stubs (`getInbox.ts`, `routes/room/room.ts`) include the first attachment's duration for list previews.
- **Types**: `types/socket-events.ts` `AttachmentPayload` matches the new select shape.

Web (`apps/web`):

- **Recording** (`components/app/VoiceRecorder.tsx`, new): tap-to-toggle mic capture (start → stop → review) with MediaRecorder (`audio/webm;codecs=opus` via `pickAudioMime()`, falling back to `audio/mp4` on Safari), live AnalyserNode waveform + timer, 5-minute auto-stop with a last-10s countdown, inline error states for mic-permission denial / unsupported browsers, and cancel vs. send controls. Tapping the mic again stops the capture; touch scrolling never conflicts because there's no press-and-hold gesture.
- **Upload** (`app/lib/attachments.ts`): `uploadVoiceAttachment()` presigns under the `voice` context, uploads the blob straight to S3, and sends duration + waveform peaks for persistence; `computeWaveformPeaks()` downsamples the analyser buffer.
- **Send** (`AppShell.tsx` + `state.ts`): `sendVoiceMessage(blob, durationSeconds, waveformPeaks, caption?)` mirrors the text-send optimistic flow — a pending VOICE bubble renders immediately, then the message goes through the same DM REST or room-socket path with `messageType: "VOICE"` and one attachment (optional text caption rides along).
- **Composer** (`ThreadPanel.tsx`): mic button in the compose bar (record/stop states, `aria-label`/`aria-pressed`); the recording bar replaces the attach/emoji/send cluster while capturing, and a pending voice bubble shows "🎤 Voice message…" until the upload lands.
- **Playback** (`components/app/voicePlayback.ts`, new): a module-level singleton `Audio` element is the only player in the app, so starting one voice message automatically pauses any other (subscribed via `useSyncExternalStore`). `VoiceMessagePlayer.tsx` (new) renders the compact bubble — play/pause, scrubbable waveform (click + arrow-key seek, `role="slider"`), elapsed/total labels, loading and error+retry states. `AttachmentCard` routes VOICE attachments to the player (regular audio still uses native controls).
- **Preview** (`components/app/helpers.ts`): `fmtDuration()` (mm:ss) and `lastText()` moved here; conversation lists now show "🎤 Voice message (0:12)" instead of "Voice message".
- **Tests**: web `tests/attachments.test.ts` covers `fmtDuration`, `computeWaveformPeaks`, `pickAudioMime` (incl. Safari fallback), and `lastText` voice previews; server presign route + `createPendingAttachment` tests cover voice validation/persistence.

**Why:** Feature request — users wanted async voice messages in every conversation type. The server already had the `VOICE` enum, voice S3 prefix, and a `duration` column; the work extends the existing presigned-upload + attachment-message pipeline instead of building a second system, and persists waveform peaks so playback needs no audio decoding.

**Impact:** Server + web + validators + Prisma. New JSONB column (nullable, no backfill needed), one additive MIME type, and additive payload fields (`duration`, `waveformPeaks`, DM `messageType`) — existing text/image/file flows are unchanged. Server tests: 581 across 92 files; web tests: 62 across 7 files; both typechecks and the production web build pass. Run `prisma migrate dev` to apply the new migration.

**Follow-ups:** Press-and-hold recording with slide-to-cancel (WhatsApp-style) was intentionally not built — tap-to-toggle avoids scroll-gesture conflicts on mobile; it can be layered on later. Waveform peaks are client-supplied metadata (shape-validated, not regenerated server-side); if that ever becomes a trust concern, a server-side decode step could replace them.

## [2026-08-17] - User Profile Card + Full-Screen Avatar Viewer

**What changed:** Added a user profile card and a full-screen avatar viewer, both reusable from any surface that renders a user (chat message rows, DM thread header, DM/search/room-member/friend-request/blocked lists, New DM/Invite results).

Server (`apps/server`):

- `routes/searchUser.ts` — `GET /api/search/users/:id` now returns the full public profile for the profile card: `bio`, `gender`, `dateOfBirth`, `createdAt`, plus `relationship` (via the existing `getRelationship` service) and `friendRequestId` (the id of any PENDING request between the two users, from new service `services/friends/getPendingRequestId.ts`). `status`/`customStatus` are deliberately excluded — the live socket presence map is the authoritative, privacy-gated source for the online indicator.
- `routes/friends.ts` — new `DELETE /api/friends/requests/:requestId` lets the sender withdraw their own PENDING request (new service `services/friends/withdrawFriendRequest.ts`, deletes the row, scoped to `senderId` + `PENDING`; 404/409 on not-found or already-handled). The recipient is told via the existing `friend-request:declined` event contract so their client flips REQUEST_RECEIVED → NONE and drops the inbox card.

Web (`apps/web`):

- `components/app/types.ts` — new `UserProfile` type; `ModalName` gains `"userProfile"` and `"avatarViewer"`.
- `components/app/api.ts` — `ChatAPI.getUserProfile(userId)` and `ChatAPI.withdrawFriendRequest(requestId)`.
- `components/app/Modals.tsx` — modal system upgrades: Escape closes the top modal, background scroll is locked while any modal is open, focus is trapped per frame and returned to the trigger when the stack empties, and `ModalFrame` gained a full-screen layout variant (dark backdrop, no card chrome) so the avatar viewer can stack on top of the profile card without closing it. New `UserProfileModal` (lazy profile fetch with loading/error+retry states, clickable avatar → viewer, presence dot from the shell's live presence map, bio/gender/join-date fields with empty states, and relationship-driven actions) and new `AvatarViewer` (full-screen centered `object-contain` image with `onError` fallback to the initials placeholder). The profile card's action set is derived by pure helper `components/app/profileActions.ts`.
- `components/app/useUserActions.ts` + `components/app/UserLinks.tsx` — shared `openProfile`/`openAvatar` entry points and `AvatarLink`/`NameLink` components implementing the click hierarchy: avatar click always opens the viewer (with `stopPropagation` so it never bubbles to a parent handler), name click opens the card. `plain`/`stop` props keep the targets valid when nested inside a conversation-row button.
- `components/app/AppShell.tsx` + `state.ts` — `withdrawFriendRequest` added to the shell context (removes the inbox card, consistent with the other friend actions).
- Wired surfaces: `ThreadPanel` (DM header avatar/name, room message-row sender avatar/name), `ListPanel` (DM rows, friend-request cards, search rows — avatar/name now separate click targets while the rest of the row keeps start-a-DM), and `Modals` (room members, New DM/Invite results, blocked list).

**Why:** Feature request — there was no way to view another user's profile or inspect an avatar up close; the only "profile" modal was the self-edit form. The card reuses the existing modal stack, avatar component, relationship enum, presence map, and styling rather than introducing parallel systems.

**Impact:** Server + web + tests. Backend profile lookup returns five new fields; new DELETE endpoint. No schema changes. Existing conversation/row click behavior is preserved except search rows' avatar/name, which now open the viewer/card per the new hierarchy (the rest of the row still starts a DM). Modal system gains Escape-to-close, focus trap/return, and scroll-lock for ALL modals. Server tests: 574 across 93 files (new withdraw route/service + extended profile lookup tests); web tests: 51 across 7 files (new `profileActions` mapping tests); both typechecks and lints clean.

**Follow-ups:** The `friend-request:declined` event is reused for withdrawals — if socket semantics ever need to distinguish "declined" from "withdrawn", add a dedicated `friend-request:withdrawn` event. The profile card's relationship state is local to the card; it re-derives on reopen.

**What changed:** Added a friend request + blocking system on top of the existing DirectChat/Message architecture.

Server (`apps/server`):

- **Schema** (`db/schema.prisma`): new `FriendRequestStatus` enum (`PENDING`/`ACCEPTED`/`DECLINED`) and three models — `FriendRequest` (sender/recipient/`pairKey`/status), symmetric `Friendship` (`userAId < userBId` normalized at insert), `UserBlock` (blocker/blocked). Migration `20260816175101_add_friends_models` additionally creates a partial unique index `FriendRequest_pending_pair_unique ON "FriendRequest"("pairKey") WHERE status = 'PENDING'` (Prisma's DSL can't express partial indexes) so at most one PENDING request can exist per pair **in either direction**.
- **Services** (`src/services/friends/`): `isBlocked` (both directions, the single reusable check), `getRelationship`/`getRelationships` (single- vs batch- `NONE|REQUEST_SENT|REQUEST_RECEIVED|FRIENDS|BLOCKED` derivation, block > friends > sent > received), `sendFriendRequest` (transactional guards: self-request, target exists, block, already friends, duplicate; `pairKey` + partial index close the mutual-request race → P2002 → 409), `acceptFriendRequest` (PENDING→ACCEPTED + `Friendship` create in one transaction, block re-checked inside, P2002 race treated as idempotent), `declineFriendRequest` (scoped to `recipientId`+`PENDING`, concurrent-accept → 409), `blockUser` (deletes pending requests both ways + upserts block, idempotent, no restore on unblock), `unblockUser` (idempotent), `getPendingRequests`/`getBlockedUsers` (cursor pagination mirroring `getInbox`). `src/lib/friendPairKey.ts` exports the normalized pair key.
- **Routes** (`src/routes/friends.ts` mounted at `/api/friends`, `src/routes/users.ts` at `/api/users`): `POST/GET /friends/requests`, `POST /friends/requests/:id/accept|decline`, `GET /users/blocked`, `POST/DELETE /users/:userId/block`. Sender/recipient/blocker ids come from the session, never the body. Send is rate-limited (`friends:send`, 20/min). All mutations emit typed socket events (`friend-request:new` to the recipient, `accepted`/`declined` to the original sender, `blocked` to the blocked user) via new `src/sockets/friends.ts` emit helpers and trigger fire-and-forget Web Push via new `pushFriendRequestEvent` (`src/services/push/push.ts`) + `buildFriendRequestPushPayload` (`payload.ts`, tag `chathubby:friend-request:<requestId>`). Socket event types added to `src/types/socket-events.ts`.
- **Search** (`src/routes/searchUser.ts`): `/search/users/search` now annotates every result with `relationship` via the batch `getRelationships` query (4 `IN` queries, no N+1).

Validators (`packages/validators/src/friends.ts`): `sendFriendRequestSchema`, `friendRequestIdParamSchema`, `blockUserIdParamSchema`, `getFriendRequestsQuerySchema`, `getBlockedUsersQuerySchema`, plus shared `RELATIONSHIP_VALUES`/`Relationship` and `FRIEND_REQUEST_STATUSES`/`FriendRequestStatus` types exported from `src/index.ts`.

Web (`apps/web`):

- `components/app/types.ts` — `SearchUser` gains `relationship`; new `FriendUser`/`FriendRequest`/`BlockedUser` types.
- `components/app/api.ts` — `sendFriendRequest`, `getFriendRequests`, `acceptFriendRequest`, `declineFriendRequest`, `blockUser`, `unblockUser`, `getBlockedUsers`.
- `components/app/AppShell.tsx` — friend-request socket handlers + service-worker `chathubby:incoming-friend-request` handling feed one `applyFriendRequestEvent` (deduped, updates inbox cards + search chips); actions `refreshFriendRequests`, `sendFriendRequest`, `accept/declineFriendRequest`, `block/unblockUser`, `refreshBlockedUsers`, `updateRelationship`. `state.ts` exposes these + `friendRequests`/`blockedUsers`.
- `components/app/ListPanel.tsx` — DM list renders incoming friend-request system cards (Accept/Decline/Block); search results get relationship-aware actions (Add friend / Sent / Accept / Message / Blocked).
- `components/app/Modals.tsx` — Privacy modal gains a Blocked Users section with Unblock.
- `components/app/incomingNotifications.ts` — `handleIncomingFriendRequestNotification` (deduped by request id, sound for new/accepted, in-page fallback when hidden); `sw.js` handles friend-request pushes (namespaced dedup, always shows, posts friend event to clients); `app/lib/initialLoad.ts` + test now load friend requests with the initial lists.

**Why:** Feature request — the app had no way to establish one-to-one relationships between users; friends and blocks give users control over who can connect with them, and they sit cleanly beside DMs without touching the existing message pipeline.

**Impact:** Server + web + validators + Prisma. New DB tables (`FriendRequest`, `Friendship`, `UserBlock`), enum, migration with a partial unique index, REST endpoints, socket events, and push kind. Existing DM handling, message flows, and read receipts are untouched. Push payload `data.kind` gained `"friend-request"` (old service workers ignore it). New tests: 11 friends service files, 2 route files (friends, users, search-relationship), 2 push files (payload + event) — server tests now 566 across 91 files; web tests 45 across 5 files; both typechecks and lints clean.

**Follow-ups:** None.

**What changed:** Removed the separate "Account" entry from the profile dropdown (avatar menu in `apps/web/components/app/AppShell.tsx`) and the standalone `AccountModal`, folding its actions (theme toggle and sign out) into `ProfileModal` in `apps/web/components/app/Modals.tsx`. The merged modal now renders the profile editor (avatar, display name, bio, gender, DOB) with an account section below (switch light/dark, sign out). Dropped `"account"` from the `ModalName` union (`types.ts`), its switch case, and the "My Account" row in `SettingsMenu` (`ListPanel.tsx`), which is replaced by a single "Profile" row whose subtitle now reads "Your public info & account".

**Why:** Requested UX change — "My Account" duplicated what the profile modal already covered (avatar, name, email) and sat in the same dropdown as Profile; merging gives one entry and one modal for identity + account settings.

**Impact:** `apps/web` only. No API, schema, or test changes; web typecheck and lint clean.

**Follow-ups:** None.

## [2026-08-16] - Move Settings Entry to Profile Menu

**What changed:** Removed the "Settings" nav item from the desktop sidebar rail (`apps/web/components/app/AppShell.tsx`) and added a "Settings" button to the profile dropdown (opened by clicking the avatar at the bottom of the rail) that switches to the existing `settings` tab, which continues to render `SettingsMenu` in the list column. The mobile bottom-nav Settings button is unchanged so mobile users (who have no profile avatar) keep access to settings.

**Why:** Requested UX change — the settings entry belongs with the user's profile controls rather than cluttering the primary navigation.

**Impact:** `apps/web` only. No behavior change to the settings tab or its modals; web typecheck and lint clean.

**Follow-ups:** None.

## [2026-08-16] - Unify Incoming Message Notification & Sound Pipeline

**What changed:** Consolidated the two independent incoming-message flows (socket-driven sounds in `useNotificationSound.ts`/`AppShell.tsx` + Web Push/in-page notifications in `notifications.ts`) into one decision point. New `apps/web/components/app/incomingNotifications.ts` exports `handleIncomingMessageNotification({ source: "socket" | "push", kind, conversationId, messageId, senderId, senderName, roomName, messageType, content })`: it rejects self-sent messages, dedupes by `messageId` via a shared module-level `seenIds` set (bounded 200), plays the DM/group sound, then decides on the desktop notification. `AppShell.tsx` `onNew` now calls the handler for `!mine` socket messages (both `message:new` and `chatroom:message`) and its service-worker message listener feeds `chathubby:incoming-message` posts through with `source: "push"`; it also registers the current user id via `setNotificationUserId`. `notifications.ts` lost `notifyIncomingMessage`/`notifiedIds` (display + dedupe absorbed by the pipeline) and gained `notificationPrefEnabled()`. `useNotificationSound.ts` moved its engine (audio elements, pref, per-message guard) to module scope with `playNotificationSound`/`isNotificationSoundEnabled`/`setNotificationSoundEnabled`; the `useNotificationSound` hook is kept as the settings modal's reactive surface. `sw.js` push handler now posts `chathubby:incoming-message` to every window client that is NOT viewing the pushed conversation (still OS-notification-suppression logic unchanged; no Audio in the worker). `apps/server/src/services/push/payload.ts` `buildPushPayload` now requires and forwards `senderId` and carries `senderName`, `roomName`, `messageType`, `content` in `data` (title/body/tag presentation unchanged); `push.ts` passes `senderId`. Payload test updated.

**Why:** Two parallel notification flows let the socket and push channels replay the same message independently; the refactor makes socket and service-worker events feed one handler so a `messageId` produces at most one custom sound per browser client while preserving every existing notification/sound behavior (active-conversation suppression, hidden-tab fallback, closed-app push).

**Impact:** `apps/web` (`incomingNotifications.ts` new; `AppShell.tsx`, `notifications.ts`, `useNotificationSound.ts`, `sw.js` modified) and `apps/server` (`payload.ts`, `push.ts` modified). Push payload `data` gains four fields — new server requires matching `sw.js`/client code, but old service workers ignore them. No schema, route, or settings changes; settings stay independent (`chathubby:notificationSounds`, `chathubby:desktopNotifications`). Server tests 499 passing, web tests 44 passing, both typechecks and lints clean.

**Follow-ups:** None.

## [2026-08-16] - Fix Desktop Notifications Toggle Showing Disabled

**What changed:** Fixed the "Desktop notifications" toggle in the settings modal rendering permanently disabled with the "needs a secure connection" note even when the browser fully supports Web Push. The notification singleton only emitted state _changes_; AppShell initializes it at app load, so by the time the user opened Settings → Notifications the init had already completed and the modal never received a snapshot — it kept the hook's initial `{ supported: false, prefEnabled: false }`. `ensureNotificationsInitialized()` in `apps/web/components/app/notifications.ts` now re-emits current state for late callers, and `useNotifications.ts` refreshes its state immediately on mount (and again when init settles).

**Why:** The push subscription flow was correct but unreachable — the switch couldn't be clicked to request the notification permission.

**Impact:** `apps/web` only. No server, schema, or test changes; web typecheck, lint, and 44 tests still pass.

**Follow-ups:** None.

## [2026-08-16] - Desktop Push Notifications (Web Push + Service Worker)

**What changed:** Added browser/OS push notifications for incoming DMs and room messages, backed by Web Push (VAPID) so they work even when no ChatHubby tab is open.

Server: new `PushSubscription` model in `apps/server/db/schema.prisma` (endpoint unique, `userId` FK cascade, migration `20260816000000_add_push_subscriptions`). New `apps/server/src/lib/webPush.ts` (VAPID config — `isWebPushConfigured`, `getVapidPublicKey`; keys read from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`, app runs without them configured). New `apps/server/src/services/push/payload.ts` (pure builder: DM title = sender displayName/username, room title = `<sender> in #<roomName>`, `[Photo]`/`[Video]`/`[Audio]`/`[Voice message]`/`[File]`/`[Attachment]` bodies for non-text, 140-char truncation, tag `chathubby:<messageId>`) and `apps/server/src/services/push/push.ts` (`pushNewMessage` fire-and-forget after message save + socket emit, skips SYSTEM messages and the sender, prunes subscriptions on 404/410; `upsertPushSubscription`/`deletePushSubscription` scoped to the caller). New `apps/server/src/routes/push.ts` (POST/DELETE `/api/push/subscribe`, `requireAuth`, rate-limited) mounted in `src/index.ts`. Push is wired into the DM send route and the `roomChat` socket handler; socket auth now also selects `displayName` for room titles. New validators `pushSubscribeSchema`/`pushUnsubscribeSchema` in `packages/validators/src/push.ts`.

Web: new service worker `apps/web/public/sw.js` (recent-notification dedup, suppresses OS notifications when a visible ChatHubby tab is already viewing that conversation via `chathubby:set-active` messages, and `notificationclick` focuses the window or opens `/dashboard?conv=<kind>:<id>`). New `apps/web/components/app/notifications.ts` module (secure-context check, idempotent init, `subscribeForPush`/`unsubscribeFromPush`, in-app `Notification` fallback only when the tab is hidden and no push subscription is active, message-id dedup) plus `useNotifications.ts` hook. `AppShell.tsx` parses `?conv=` in `onUser` (clearing the URL), listens for SW navigation messages, and calls `notifyIncomingMessage` for incoming `!mine` messages. `NotificationsModal` gained a "Desktop notifications" toggle (`Toggle` now supports `disabled`). `ChatAPI.subscribePush`/`unsubscribePush` added. `turbo.json` globalEnv extended with the VAPID variables; `.env`/`.env.example` document `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

**Why:** Feature request — the app had no way to notify users when they were away from the browser, so messages could be missed entirely outside an open tab. Web Push is the standard no-active-tab delivery mechanism; the service worker lets notifications render natively and dedupe correctly.

**Impact:** Server + web + validators + Prisma. New DB table (unique `endpoint`), migration, env vars, REST endpoints, and a static `sw.js` (now excluded from ESLint via `apps/web/eslint.config.js`). Notifications require a secure context (HTTPS or `localhost`) and are device-local (the toggle is per-browser). No existing message flow changes: push is fire-and-forget and never blocks or throws; sending still only depends on the DB + socket path. New tests: server `tests/unit/services/push/payload.test.ts` (5), `tests/unit/services/push/push.test.ts` (7), `tests/unit/routes/push.test.ts` (5). Server tests now 499 across 76 files; web tests 44 across 5 files; both typechecks and lints clean.

**Follow-ups:** None.

## [2026-08-16] - Incoming Message Notification Sounds

**What changed:** Added client-side notification sounds for incoming messages. New pure client hook `apps/web/components/app/useNotificationSound.ts` centralizes playback: it lazily builds one `Audio` element per conversation kind (`dm_sound.mp3` for DMs, `group_sound.mp3` for rooms — the old `room's_sound.mp3` was renamed), dedupes by message id via a `Set` in a ref, restarts playback for rapid bursts, and swallows `audio.play()` rejections so autoplay-policy blocks never break message processing. An on/off preference is persisted in `localStorage` under `chathubby:notificationSounds` and read through the same hook. `AppShell.tsx` calls `playNotificationSound(msg.id, kind)` in the `onNew` socket handler only for `!mine` messages (both `message:new` and `chatroom:message`). A new "Notifications" settings row (`ListPanel.tsx` SettingsMenu) opens a new `NotificationsModal` (`Modals.tsx`) with a single "Message sounds" toggle; `"notifications"` was added to the `ModalName` union in `types.ts`, and a `BellIcon` was added to `icons.tsx`. Sounds only fire on genuinely new socket-delivered messages — history loads (`loadMessages`), conversation switches, own sends, and re-renders never trigger them.

**Why:** Feature request — the app had no audible feedback for incoming messages, making it easy to miss new chats/rooms in a background tab.

**Impact:** `apps/web` only. Renamed `apps/web/public/sounds/room's_sound.mp3` → `group_sound.mp3` (no code referenced it before). No server, socket, schema, or message-flow changes; `onNew`'s existing `markReadNow()`/bump behavior is untouched. Sound preference is device-local (localStorage), so it does not sync across browsers.

**Follow-ups:** None.

## [2026-08-16] - Color-Coded Manual Status Indicators

**What changed:** Manual statuses now have distinct colors shown consistently wherever a user's presence/status indicator is rendered. New pure module `apps/web/components/app/statusTones.ts` is the single source of truth: `STATUS_OPTIONS` (value + label + tone), `STATUS_TONES`, `STATUS_LABELS`, `TONE_BG` (literal Tailwind classes per tone so they survive purging), and `presenceTone(presence)`. Tone precedence: offline always wins (muted gray), then the manual status (AVAILABLE → success/green, BUSY → danger/red, DND → danger/red, AWAY → warn/amber, INVISIBLE → muted/gray), then raw presence (online → green, idle → amber). `AppAvatar` now takes a full `PresenceInfo` (not just a presence string), always renders a dot when presence data exists (gray when offline/invisible) using `presenceTone` + `TONE_BG`; the dot color derives from the app's `--color-*` tokens so it follows light/dark themes. Call sites updated: `AppShell.tsx` rail avatar, `ListPanel.tsx` DM rows, `ThreadPanel.tsx` header (which also shows the status label in the sub line, e.g. "Do not disturb" instead of "online"), `ProfileModal` and `AccountModal` self avatars. `StatusModal` shows a colored dot beside each option with the checkmark kept separate to indicate selection (dots use `TONE_BG`, checkmark stays accent-colored). New `apps/web/tests/statusTones.test.ts` (7 tests) covers tone precedence incl. DND-not-green and offline-ignores-status.

**Why:** The presence dot was green for every online user, so a manual DND/Busy status was invisible at a glance. Mapping each status to a stable color (via the existing design tokens, not hardcoded hex) lets users read availability instantly and keeps the manual status separate from the automatic presence internally while the indicator shows status first.

**Impact:** `apps/web` only — new `statusTones.ts` + `statusTones.test.ts`; edits to `AppAvatar.tsx`, `Modals.tsx`, `AppShell.tsx`, `ListPanel.tsx`, `ThreadPanel.tsx`. No server, socket, or schema changes; the manual status and presence remain separate server-side values. Offline/hidden users now show a gray dot instead of no dot. Web tests now 44 (was 37).

**Follow-ups:** None.

## [2026-08-16] - Presence, Manual Status, and Privacy Controls

**What changed:** Added live presence (online/idle/offline), a manual user status (Available/Busy/Do not disturb/Away/Invisible) with optional custom status, and two privacy toggles (show online status, show typing status) across the server and web app.

Server: `apps/server/db/schema.prisma` User model gained `status` (default `AVAILABLE`), `customStatus`, `showOnlineStatus`, `showTypingStatus` (migration `20260815190257_add_presence_status_and_privacy`). New `apps/server/src/services/presence.ts` manages transient presence in Redis (Set `presence:connections:{userId}` + blob `presence:status:{userId}` with a 10-minute TTL refreshed per heartbeat; 5-minute idle threshold). New `apps/server/src/sockets/presence.ts` gates broadcasts (`presence:changed` with real payload to the user's own `user:{userId}` room, filtered payload to everyone else), emits a snapshot to freshly-connected sockets, sweeps idle users every 60s, and exposes `updateUserStatus` shared by both update paths. New REST routes `apps/server/src/routes/auth/updateStatus.ts` (PATCH `/auth/me/status`) and `updatePrivacy.ts` (PATCH `/auth/me/privacy`); typing indicators are dropped server-side in `src/sockets/direct-chat.ts` and `src/routes/room/roomChat.ts` when `showTypingStatus` is false. New validators `updateStatusSchema`/`updatePrivacySchema` and `USER_STATUSES` in `packages/validators/src/user.ts`. Socket auth (`io.Auth.ts`), `requireAuth`, `updateMe`, `me`, and `create.io.ts` selects/wiring extended; `express.d.ts`/`socket.io.d.ts` AuthUser types updated.

Web: `AppUser` in `apps/web/components/app/types.ts` extended with the four fields plus new `UserStatus`, `PresenceState`, `PresenceInfo` types. `ChatAPI.updateStatus`/`updatePrivacy` added to `api.ts`. `ShellCtx` gained a `presence` map; `AppShell.tsx` subscribes to `presence:changed` (via new pure `mergePresence` helper in `helpers.ts`), runs a 30s `presence:heartbeat` that pauses while the tab is hidden, and adds a Status entry to the profile menu. New `StatusModal` (status radio list + custom status input) and `PrivacyModal` (two toggle switches) in `Modals.tsx`; SettingsMenu gained a Privacy entry (`ListPanel.tsx`). `AppAvatar` overlays a presence dot (green online / amber idle) and DM list rows plus the thread header show it; the thread header shows "online"/"idle" for DM contacts; the client typing emitter gates on `showTypingStatus`.

**Why:** Users could not express availability or hide their activity; there was no way to tell who was online before starting a chat. Presence is derived from socket heartbeat activity so it stays privacy-safe (idle is server-computed, no client state to spoof), while manual status is a separate persistent profile field that never conflates with liveness.

**Impact:** Server + web + validators + Prisma. New DB columns, migration, Redis keys; new socket events `presence:heartbeat`/`presence:setStatus` (client→server) and `presence:changed` (server→client); new REST endpoints. Existing endpoints never leak presence fields in other users' payloads (enforced by `tests/unit/leakAudit.test.ts`). Server tests now 482 across 73 files; web tests 37 across 4 files; both typechecks and web lint clean.

**Follow-ups:** Redis-backed presence is per-instance — a horizontally-scaled server fleet would need the presence keys shared/namespaced. Heartbeat interval (30s) and idle threshold (5m) are tunable constants in `services/presence.ts` / `AppShell.tsx`.

## [2026-08-15] - Scope Message Action Button Reveal to Its Own Bubble

**What changed:** In `apps/web/components/app/ThreadPanel.tsx`, the per-message three-dot action button was moved from a flex sibling of the message column into its own bubble's DOM (absolutely positioned 5px to the left, vertically centered, keeping the previous visual gap and position) and its hover reveal now uses a named Tailwind group (`group/msg` on the bubble + `group-hover/msg:opacity-100` / `group-hover/msg:pointer-events-auto` on the button) instead of the plain `group-hover:` variant. The plain `group` class was removed from `msg-row`. The button click stops propagation so the bubble's mobile tap-to-reveal handler is unaffected, and the wrapper is `pointer-events-none` on touch while the button is hidden so taps in the gutter still don't reach the bubble.

**Why:** The dashboard root in `apps/web/components/app/AppShell.tsx` carries the plain `group` class (line 1039, needed for `group-data-[thread-open]` mobile navigation). Tailwind's `group-hover:` matches _any_ `.group` ancestor, so hovering anywhere in the dashboard hovered that root group and revealed every message's action button simultaneously. Named groups scope the variant to the specific bubble, making each message reveal its button only when the cursor is directly over that bubble (the button is a DOM child of the bubble, so hovering it stays within the bubble's hover scope and the button remains clickable without flicker).

**Impact:** `apps/web` only — `ThreadPanel.tsx` MessageRow restructure; no change to layout, message positioning, menu anchoring/direction, or the mobile `tapReveal` flow. Server, API, and tests unaffected.

**Follow-ups:** None.

## [2026-08-15] - Add Emoji Picker to the Message Composer

**What changed:** Added an emoji picker to the `@repo/web` composer (`apps/web/components/app/ThreadPanel.tsx`) using Emoji Mart. New `apps/web/components/app/EmojiPicker.tsx` lazily imports `emoji-mart` + `@emoji-mart/data` on first open, mounts the `<emoji-picker>` custom element, and themes it from ChatHubby's existing design tokens (`--color-surface`, `--color-fg`, `--color-accent-solid`, `--color-surface-2`, `--color-border-strong` in `globals.css`) via an OKLCH→sRGB triplet conversion (`oklchToRgbTriplet`, extracted to pure `emojiTheme.ts` so it's unit-testable). A new `insertEmojiAtCursor` utility inserts the selected emoji at the textarea's current caret, replaces any selection, repositions the caret after the emoji, and refocuses the input. Added a feather-style `SmileyIcon` to `icons.tsx` and an emoji trigger button (42px circle, `c-btn` styles) between the attach and send buttons. Desktop renders the picker as a viewport-clamped fixed popover (measured via `useLayoutEffect`, flips above/below and clamps horizontally); mobile renders it as a bottom sheet sized with `55dvh` so it stays above the on-screen keyboard, with a scrim that closes on tap. Picker closes on selection, outside click, and Escape; it resets when switching conversations. Skin tone and recents persist via emoji-mart's own localStorage store (`emoji-mart.skin` / `emoji-mart.frequently`), matching the app's existing `theme` localStorage pattern. Dependencies added to `@repo/web` only: `emoji-mart@^5.6.0`, `@emoji-mart/data@^1.2.1`. No `@emoji-mart/react` (peer deps only allow React ≤18; this app is on React 19, so a ~60-line wrapper replaces it). Emojis are ordinary Unicode in message content — no API, schema, validator, or socket changes. Added `apps/web/components/app/emojiInsert.test.ts` (8 tests: caret/mid-text/selection/ZWJ+skin-tone insertion, refocus, `oklchToRgbTriplet` math).

**Why:** Users had no way to insert emoji while composing; they had to paste them from elsewhere. Emoji are plain 4-byte UTF-8, which the existing PostgreSQL TEXT column, zod `.string().trim().max()` validators, and JSON socket payloads already handle end-to-end, so the feature is purely client-side.

**Impact:** `apps/web` only. New files `EmojiPicker.tsx`, `emojiTheme.ts`, `insertEmojiAtCursor.ts`, `emojiInsert.test.ts`; edits to `ThreadPanel.tsx`, `icons.tsx`, `package.json`. No server, DB, or message-delivery changes. Picker JS/data is code-split and only loaded on first open. Web tests now 32 (was 24); server 435 unchanged.

**Follow-ups:** Recents/skin tones are per-browser (not synced across devices), matching the app's existing `theme` pref. Picker not localized (no i18n in the app).

## [2026-08-15] - Fix Vite ConfigLoader Native ESM Warning

**What changed:** Renamed `apps/server/vitest.config.ts` to `apps/server/vitest.config.mts` and replaced `__dirname` with `import.meta.dirname` in its alias resolution. The server package has no `"type": "module"`, so its `vitest.config.ts` was being loaded as CommonJS while using ESM syntax (`import`/`export default`), triggering Vite's `configLoader: 'native'` warning about ESM syntax in a CommonJS-loaded file. The `.mts` extension forces ESM loading regardless of package type, and Vitest discovers `vitest.config.mts` automatically. That surfaced the second incompatibility — `__dirname` is CJS-only, so it now uses `import.meta.dirname`. No config content changed otherwise.

**Why:** Silence the Vite warning about `configLoader: 'native'` (the future default) before it becomes an error, without changing the server package's module system. Adding `"type": "module"` to `apps/server/package.json` was avoided because it would change how the tsc-built `dist` output is interpreted at runtime.

**Impact:** `apps/server` only — config file rename, no behavior change. `apps/web/vitest.config.ts` is unaffected (its package already has `"type": "module"`).

**Follow-ups:** None.

## [2026-08-15] - Fix Photo Attachments Not Rendering in Real-Time Chat

**What changed:** In `apps/server/src/services/direct-chat/sendMessage.ts` and `apps/server/src/routes/room/roomChat.ts`, the message creation transaction now re-fetches the message with `tx.message.findUnique({ select: messageWithAttachmentsSelect })` after linking attachments via `transitionAttachmentsToAttached`. Previously the transaction returned the object from `message.create()`, which had `attachments: []` because the attachment rows weren't linked yet. The re-fetch ensures the socket broadcast (`message:new` / `chatroom:message`) and the REST/ack response carry the populated attachment array so the frontend renders `AttachmentCard` immediately. Added a new test in `apps/server/tests/unit/sockets/roomChatAttachments.test.ts` that executes the real transaction callback and asserts the broadcast carries populated attachments. Updated existing DM send tests (`sendMessage.test.ts`, `sendMessageAttachments.test.ts`, `sendMessageIdempotency.test.ts`) to mock `message.findUnique`.

**Why:** When sending a message with a photo attachment, only the caption text rendered — the photo never appeared until a page refresh. The server created the `Message` row before linking `Attachment` rows, then returned the pre-link object. The real-time broadcast carried `attachments: []`, so the frontend skipped rendering `AttachmentCard`.

**Impact:** Real-time message send (DM REST + room socket) now returns messages with populated `attachments`. No API contract change — the `messageWithAttachmentsSelect` shape was always intended to include attachments. Page refresh behavior is unchanged (it already worked).

**Follow-ups:** None.

**What changed:** Added `apps/server/scripts/reset-s3.ts`, a standalone operator utility exposed as `pnpm reset:s3` in `apps/server/package.json`. It lists objects only under the application-owned prefixes (`attachments/room/`, `attachments/dm/`, `attachments/voice/`, `attachments/thumbnails/`, `avatars/`) via the existing `S3Service.listObjects()` (pagination handled by `ListObjectsV2`), then deletes them in batches of up to 1000 with `DeleteObjectsCommand` through the existing `S3Service`/`buildS3ConfigFromEnv()` config (bucket from `AWS_S3_BUCKET_NAME`). Requires `RESET_S3=true` (plus `RESET_S3_PRODUCTION=true` when `NODE_ENV=production`), prints the environment/bucket/prefixes, requires an explicit "yes" prompt before deleting, supports `--dry-run` (zero deletes), reports found/deleted/failed counts, and exits non-zero on any failure. The `defaults/` prefix is immutable: `isProtectedKey()` refuses `defaults` and any `defaults/...` key, and `findProtectedKeys()` aborts loudly if a protected key ever appears in the deletion candidate list. The utility functions (`APP_PREFIXES`, `PROTECTED_PREFIX`, `isProtectedKey`, `collectApplicationKeys`, `findProtectedKeys`, `chunkKeys`) are exported for tests; added `apps/server/tests/unit/scripts/reset-s3.test.ts` covering the defaults guard, prefix coverage, discovery/dedup, and batch chunking. Added `scripts` to `apps/server/tsconfig.json` so `check-types` covers the script.

**Why:** There was no way to wipe application-generated S3 data (attachments/avatars) without either leaving orphaned objects or risking the permanent `defaults/` seed assets.

**Impact:** `apps/server` only — new script, new `reset:s3` npm script, tsconfig include change, new unit tests, CHANGELOG entry. No changes to upload/deletion behavior, the S3 runtime services, the database schema, or the `defaults/` assets. Manual utility only; requires env-flag + confirmation, and never deletes the bucket itself.

**Follow-ups:** None.

## [2026-08-15] - Fix Thread Scrolling and Wrapping for Very Long Messages

**What changed:** Added `min-h-0` to the thread column (`AppShell.tsx`) and the messages scroll container (`ThreadPanel.tsx`) so tall messages scroll inside the thread instead of expanding it past the viewport. Added a `.break-anywhere` utility in `globals.css` and replaced the two invalid `overflow-wrap-anywhere` classes on message bubbles so unbroken 30k-char strings wrap instead of overflowing.

**Why:** After raising the message limit to 30k, messages taller than the visible screen broke the chat UI because the thread column and message list weren't shrink-locked, and the wrap utility used on bubbles was not a real class.

**Impact:** The message list scrolls normally even for messages taller than the viewport; long unbroken strings stay within the bubble width.

**Follow-ups:** None.

## [2026-08-14] - Raise Message Character Limit to 30k for DMs and Rooms

**What changed:** Raised `MAX_MESSAGE_LENGTH` from 5000 to 30000 in `packages/validators/src/direct-chat.ts` and `apps/server/src/constants/direct-chat.ts`, and `MAX_ROOM_MESSAGE_LENGTH` from 2000 to 30000 in `packages/validators/src/roomChat.ts`. Updated the "too long" rejection tests in `apps/server/tests/unit/validators/direct-chat.test.ts` and `roomChat.test.ts` to use 30001 characters.

**Why:** Users needed to send longer messages in both DMs and rooms.

**Impact:** The zod send/edit schemas for both DM (`sendMessageSchema`, `editMessageSchema`) and room (`chatRoomMessageSchema`, `chatRoomEditMessageSchema`) now accept up to 30000 characters. No DB change needed — `Message.content` is unconstrained `String?` (Postgres TEXT). No client-side composer cap existed.

**Follow-ups:** None.

## [2026-08-14] - Remove `menu-btn` Class and Flatten `...` Button Classes

**What changed:** In `apps/web/components/app/ThreadPanel.tsx` (`MessageRow`), removed the unused `menu-btn` class from the three-dot button (only `.landing .menu-btn` styles exist, scoped to the marketing page) and flattened the button `className` so `opacity-0`/`opacity-100`, `pointer-events-none`/`pointer-events-auto`, and `group-hover:*` appear as explicit literal strings rather than inside a nested ternary.

**Why:** The `menu-btn` class is dead in the app shell and the nested-ternary class construction is the only complex Tailwind class expression in the file, the most likely spot for Tailwind's scanner to miss a utility.

**Impact:** Only `apps/web/components/app/ThreadPanel.tsx` and `CHANGELOG.md` changed. Behavior unchanged: desktop hides the button at rest and reveals it on row hover; touch reveals it on bubble tap. No layout shift.

**Follow-ups:** If the button is still visible at rest, inspect computed `opacity`/`pointer-events` and whether `.group-hover:opacity-100` is generated before considering a React-driven hover fallback.

## [2026-08-14] - Refine Chat Message `...` Button Spacing and Reveal

**What changed:** In `apps/web/components/app/ThreadPanel.tsx` (`MessageRow`), tightened the own-message `...` button to sit ~5px from the message bubble (via `-mr-[4px]` on the per-message wrapper) and made the button hidden by default. Hover-capable inputs reveal it through `group-hover:opacity-100` with a 150ms opacity transition; touch devices get a tap fallback driven by a `(hover: hover)` media-query check, toggling the button on bubble tap and hiding it on tapping elsewhere or tapping the bubble again. The button keeps its layout space while invisible via `opacity`/`pointer-events` instead of `display: none`.

**Why:** The button sat ~9px from the bubble and was always visible on every input type; on touch, hover never fires, so the reveal now uses a tap-to-toggle fallback instead of relying on hover alone.

**Impact:** Only `apps/web/components/app/ThreadPanel.tsx` and `CHANGELOG.md` changed. Timestamp, read ticks, bubble styling, and the Edit/Delete actions are unchanged.

**Follow-ups:** None.

## [2026-08-14] - Fix Chat Message `...` Menu Positioning

**What changed:** In `apps/web/components/app/ThreadPanel.tsx` (`MessageRow`), moved the own-message `...` button to the left of the message bubble, wrapped the button and Edit/Delete menu in a per-message `relative` container, anchored the menu absolutely to it (vertically centered, opening to the left with an 8px gap, and flipping to the right when the other side of the `.msgs` scroll container has more horizontal room), and added a `document` `mousedown` listener so clicking outside the wrapper closes the menu and only one message menu stays open.

**Why:** The menu was positioned at `left: 12px` relative to the full-width message row, so it rendered detached at the far-left of the chat viewport instead of beside the `...` button, and a menu could stay open when clicking elsewhere.

**Impact:** Only `apps/web/components/app/ThreadPanel.tsx` and `CHANGELOG.md` changed. Own-message layout is now `[...][bubble]`; received-message layout and the Edit/Delete actions are unchanged.

**Follow-ups:** None.

## [2026-08-14] - Fix Room Avatar in Room Info Modal

**What changed:** `apps/web/components/app/Modals.tsx` now passes `src={info.avatar}` to the `AppAvatar` in `RoomInfoModal`, matching how the room avatar is rendered in the room list and thread header.

**Why:** The room info modal rendered `<AppAvatar name={info.name} size={52} square />` without a `src`, so it always fell back to the "CH" initials block even after the room avatar was updated elsewhere.

**Impact:** The room info modal now shows the room's actual avatar. No layout or styling changes.

**Follow-ups:** None.

## [2026-08-14] - Use Logo Asset in Dashboard Empty States

**What changed:** Replaced the `AppAvatar` "CH" initials placeholder with the `chathubby-v2.webp` logo asset in `apps/web/components/app/ThreadPanel.tsx` (empty conversation state), `apps/web/components/app/AppShell.tsx` (load-error and initial-loading states), and `apps/web/components/app/ListPanel.tsx` (empty list state).

**Why:** The dashboard rendered `AppAvatar` without a `src`, so it fell back to the "CH" initials block. Pointing it at the shared logo asset keeps branding consistent with the sidebar rail logo.

**Impact:** All ChatHubby-branded dashboard placeholders now render the same logo image. No layout, spacing, or sizing changes.

**Follow-ups:** None.

## [2026-08-14] - Cache-Bust App Icon Filename

**What changed:** Renamed `apps/web/public/chathubby.webp` to `chathubby-v2.webp` and updated the reference in `apps/web/app/layout.tsx` (metadata `icon`/`shortcut`/`apple`), `apps/web/components/app/AppShell.tsx`, `apps/web/components/landing/LandingNavbar.tsx`, `apps/web/components/landing/LandingFooter.tsx`, and `apps/web/app/auth/page.tsx`.

**Why:** The dashboard was still showing the old icon because browsers cache tab favicons by URL independently of HTTP cache headers; the served `/chathubby.webp` was already in sync (304), so only a new URL forces a fresh fetch.

**Impact:** New favicon/logo URL served everywhere the old one was. Only asset filename and references changed; image content is unchanged.

**Follow-ups:** None.

## [2026-08-14] - Rewrite README to Reflect Current API, Socket, and Setup

**What changed:** Replaced the stale `README.md` with an accurate one: corrected the architecture tree (added `packages/ui`, web on port 3000, server on port 3100), fixed the Quick Start (the previous `pnpm db:migrate`/`pnpm db:generate` scripts do not exist — now uses `pnpm --filter @repo/server prisma migrate dev` / `prisma generate`), mirrored the real `.env.example` variables (dropped the non-existent `PORT`, added `CSRF_SECRET` and the `NEXT_PUBLIC_*`/`API_URL` web vars), documented S3 env requirements, and rewrote the REST endpoint table (auth, DMs, rooms, attachments, avatars, defaults, search, health — all under `/api`) and the Socket.IO event tables (client→server and server→client) to match the actual route/socket handlers. Also refreshed the Tech Stack, Security Features (added CSRF and recovery-code notes), and Database Schema model list.

**Why:** The README had drifted far from the codebase — it documented removed routes (`/signup`, `/:roomId/invitations`, etc.), wrong ports and setup commands, a socket event list from an earlier prototype, and an incomplete package/architecture listing.

**Impact:** Documentation only. No code, dependencies, or behavior changed. README now matches `apps/server/src/routes/**`, `apps/server/src/sockets/**`, `types/socket-events.ts`, `.env.example`, and the package layout.

**Follow-ups:** None.

## [2026-08-14] - Fix Onboarding Avatar Save

**What changed:** `apps/web/app/auth/AuthCard.tsx` now calls `ChatAPI.updateMyAvatar(suAvatarKey)` (which sends `PATCH /auth/me/avatar`) instead of `postCsrf("/auth/me/avatar", …)` (which sent `POST`). The server only exposes `PATCH /auth/me/avatar`, so the previous POST was silently failing (request caught and ignored) and the avatar selected during signup never persisted.

**Why:** The onboarding avatar picker was wired to the wrong HTTP method, so newly created accounts lost the avatar they chose before reaching the dashboard.

**Impact:** `apps/web` only. New signups that select an avatar now keep it. Existing accounts are unchanged.

**Follow-ups:** None.

## [2026-08-14] - Optional Profile Fields, Immutable Username, and Live Onboarding Availability

**What changed:** Added optional `displayName`, `bio`, `gender`, and `dateOfBirth` profile fields to the `User` model (`apps/server/db/schema.prisma`), renamed the existing `displayname` column to `displayName`, and created the `Gender` enum plus a migration that preserves existing display-name data. The shared `userZod` validators in `packages/validators/src/user.ts` now validate the new fields: `bio` is capped at 160 characters, `gender` is restricted to `MALE`/`FEMALE`/`NON_BINARY`/`OTHER`/`PREFER_NOT_TO_SAY`, and `dateOfBirth` rejects future dates. `userZod.signup` no longer requires `displayName`, keeping signup minimal. `userZod.updateMe` is now `strict()` and no longer accepts `username`; the new `PATCH /auth/me` route (`apps/server/src/routes/auth/updateMe.ts`) explicitly rejects any request containing a `username` field and supports partial profile updates plus password changes. The `AuthUser` snapshot and `requireAuth` select now include the new fields. A new unauthenticated, rate-limited `GET /auth/check-username` endpoint (`apps/server/src/routes/auth/checkUsername.ts`) provides live availability feedback during onboarding. On the client, `AuthCard.tsx` was split into an "account details" step (email + password) and a "choose username" step with a 400 ms debounced availability check, clear status states, and a disabled create-account button until the username is available; stale API responses are ignored via a sequence token. The read-only `ProfileModal` in `apps/web/components/app/Modals.tsx` was converted into an editable profile form where users can change their avatar (reusing the existing `AvatarSelector`), edit display name, bio, gender, and date of birth, with partial saves allowed; the username is shown read-only. `AppUser` and `ChatAPI` (`apps/web/components/app/types.ts`, `components/app/api.ts`) were extended with the new fields and API helpers.

**Why:** Signup needed to stay fast and minimal while letting users complete their profile later from Settings → Profile. Usernames also needed to be permanently fixed after signup to prevent handle-squatting and identity confusion.

**Impact:** Database schema change (migration `20260814000000_add_profile_fields_and_rename_display_name` must be applied via `prisma migrate deploy`). API response shapes now use `displayName` instead of `displayname` and include `bio`, `gender`, and `dateOfBirth`. Existing clients relying on the old `displayname` field or the single-page signup form will need updates. Server tests increased from 384 to 419; web tests remain at 24.

**Follow-ups:** Verify the debounced username check end-to-end in a browser with high-latency connections; consider adding client-side profile-form tests once the web Vitest environment supports DOM rendering.

## [2026-08-13] - Center Modals on Screen

**What changed:** `apps/web/components/app/Modals.tsx` now positions the modal stack in the center of the viewport (`items-center justify-center`) instead of anchoring dialogs to the bottom middle (`items-end`). The modal card also uses full `rounded-[24px]` corners rather than top-only rounding, since it no longer sits flush against the bottom edge.
**Why:** Settings and account menus were opening as bottom-sheet style dialogs on desktop, but the user expected them to appear centered on screen like typical desktop modals.
**Impact:** `apps/web` only. All modal flows (new DM/room, room info, invites, join requests, profile, account, recovery codes, confirmations) now render centered. Mobile behavior also centers the modal instead of using a bottom sheet.
**Follow-ups:** None.

## [2026-08-13] - Custom Avatar Uploads (Presigned S3 + Square Cropper)

**What changed:** Users can now upload their own user/room avatars instead of only picking defaults. New `POST /api/avatars/presign` (`apps/server/src/routes/avatars.ts`, `services/avatar/presignUpload.ts`, `constants/avatar.ts`) issues a 5-minute presigned PUT URL scoped to `avatars/{userId}/{uuid}.{ext}` (user) or `avatars/rooms/{roomId}/{uuid}.{ext}` (room); room presigns require OWNER/ADMIN, the route is rate-limited to 10/min/user, MIME is restricted to JPEG/PNG/GIF/WebP (no SVG), size is capped at 5 MB, and the S3 extension is derived from the validated MIME type — the endpoint never touches the database. The new `avatarPresignSchema`/`avatarMimeTypeSchema` in `packages/validators/src/avatar.ts` back the route. `PATCH /auth/me/avatar` and `PATCH /room/:chatRoomId/avatar` now best-effort delete the replaced `avatars/...` key from S3 (defaults are shared and never deleted); an S3 delete failure is logged after the response so it can never fail the DB update. Client-side, `AvatarSelector` gained an "Upload your own" flow: `AvatarCropper` (`components/app/AvatarCropper.tsx`, backed by `react-easy-crop`) provides an Instagram/Discord-style square crop with drag-to-pan, wheel/slider zoom, a live crop preview, and exports the selection at max 512×512 via `app/lib/avatarCrop.ts` (native resolution kept for small sources, transparent PNG/WebP preserved, GIF/unsupported encodings fall back to PNG). `app/lib/avatarUpload.ts` + `ChatAPI.presignAvatar` (with client-side type/size validation) upload the processed blob via presigned PUT and return the key, which flows through the existing `updateMyAvatar`/`updateRoomAvatar` save paths. Room uploads are wired in `RoomInfoModal` (`contextId={roomId}`); the signup picker and account modal upload as the authenticated user; the new-room modal keeps defaults only (no room id exists pre-creation).
**Why:** The avatar fields stored S3 keys and the proxy/render pipeline accepted `avatars/*` keys, but nothing let users actually upload a custom image — the picker only offered the pre-seeded defaults.
**Impact:** `apps/server` (new presign route + constants + service, best-effort cleanup in the two PATCH avatar routes, `avatars.ts` GET route unchanged), `apps/web` (new `react-easy-crop` dependency, `AvatarCropper.tsx`, `avatarCrop.ts`, `avatarUpload.ts`, `AvatarSelector.tsx` upload UI, `ChatAPI.presignAvatar`, `Modals.tsx` room wiring), `packages/validators` (`avatar.ts`). No DB/schema changes; presign requires S3 env vars (already required for defaults/attachments). Server tests: 401 (17 new). Web tests: 24 (10 new). Typecheck, lint, prettier, and `next build` all pass.
**Follow-ups:** Consider a second "reset to default/remove avatar" affordance and animated-GIF first-frame capture confirmation once uploads are exercised in a browser.

## [2026-08-13] - Fix Avatar Updates (Apply Pending Migration, Render Room Avatars)

**What changed:** Room and user avatar updates now work end-to-end. The `ChatRoom.avatar` column was declared in `db/schema.prisma` but its migration (`20260812000000_add_avatar_to_chatroom`) had never been applied, so `PATCH /room/:chatRoomId/avatar` failed with `PrismaClientKnownRequestError: column ChatRoom.avatar does not exist` — applied via `prisma migrate deploy`. The `GET /room/rooms` select/response now includes the room `avatar`, the client `RoomInboxEntry`/`ActiveConv` types carry it, and the room list rows plus thread header render it (`ListPanel.tsx`, `ThreadPanel.tsx`). Avatar saves now refresh state immediately instead of requiring a reload: `AccountModal` calls the new shell `refreshUser()` after `updateMyAvatar` (the server already busts `session.userCache`), and the room avatar picker calls `refreshLists()` after `updateRoomAvatar`.
**Why:** A schema/database drift meant the room-avatar write path hit a missing column, and even after that, nothing surfaced the saved avatars (rooms were never rendered with a `src`) and user-avatar changes only appeared after a manual reload.
**Impact:** `apps/server` (rooms endpoint shape gains `avatar`) and `apps/web` (rendering + immediate refresh). No DB reset — only the one pending migration was applied. Server tests (384) and web tests (14), typecheck, lint, and prettier all pass.
**Follow-ups:** Consider also showing room avatars in `ThreadPanel` composer placeholder/headers if a room-upload flow is added.

## [2026-08-13] - Use ChatHubby WebP in Landing Navbar & Footer Logos

**What changed:** The landing-page topbar (`LandingNavbar.tsx`) and footer (`LandingFooter.tsx`) logos now render `/chathubby.webp` (rounded, 34px) instead of the inline-SVG mascot.
**Why:** Follow-up to the icon change — the landing navbar had been left with the old mascot.
**Impact:** `apps/web` only. Feature illustrations (Hero/Personality/CTA mascot expressions) intentionally stay as animated SVGs. Typecheck, lint, prettier pass; landing page emits the WebP in both header and footer.

## [2026-08-13] - Use ChatHubby WebP as App Icon & Favicon

**What changed:** The brand mascot image `apps/web/public/chathubby.webp` is now the site icon everywhere. Root `metadata.icons` (`layout.tsx`) points `icon`, `shortcut`, and `apple` (iOS touch) at `/chathubby.webp`, and the default `app/favicon.ico` was removed so it can't shadow the WebP in `<link>` order. The app-shell rail logo (`AppShell.tsx`) and the auth-page header logo (`app/auth/page.tsx`) now render the WebP instead of the inline-SVG mascot / initials avatar.
**Why:** `/logo.svg` referenced by metadata never existed, and the product's icon should be the actual mascot art.
**Impact:** `apps/web` only. Landing-page `Mascot` illustrations (animated expressions) are intentionally left as inline SVGs. Verified: all pages emit `<link rel="icon|shortcut icon|apple-touch-icon" href="/chathubby.webp">`, the WebP serves as `image/webp`, and typecheck/lint/prettier/tests pass.

## [2026-08-13] - Fix Avatar Display (Key → URL Proxy)

**What changed:** Avatars stored as S3 keys (e.g. `defaults/user/3.png`) were being passed straight to `<img src>`, producing broken relative URLs and rendering the name fallback instead of the picture. Added a server proxy `GET /api/avatars?key=...` (`apps/server/src/routes/avatars.ts`) that validates the key (only `defaults/*` and `avatars/*` patterns), streams the S3 object via a new `S3Service.getObjectStream()`, sets `Cache-Control: public, max-age=3600`, and relaxes CORP to `cross-origin` (helmet's `same-origin` default would block the cross-port image load). The client helper `avatarUrl()` in `helpers.ts` turns keys into those proxy URLs, and `AppAvatar` applies it centrally so every avatar (rail user, DM/room list rows, thread header, message rows, modals) resolves without per-site changes; full URLs (defaults picker presigned links) pass through untouched.
**Why:** The stored `User.avatar`/`ChatRoom.avatar` values are S3 object keys, not browser-loadable URLs, so nothing could display them.
**Impact:** `apps/server` (new route + service method) and `apps/web` (`AppAvatar`, `helpers.ts`). Requires a server restart to pick up the new route. All checks green (typecheck, lint, prettier, 384 server + 14 web tests).

## [2026-08-13] - Typing Indicators & Read Receipts (DMs + Rooms)

**What changed:** Real-time typing indicators and per-message read status now work across both direct chats and rooms, replacing the placeholder demo. Server: new `directChatTypingSchema`/`chatRoomTypingSchema` validators; `directChat:typing` (`apps/server/src/sockets/direct-chat.ts`) and `chatroom:typing` (`apps/server/src/routes/room/roomChat.ts`) socket handlers broadcast `{ userId, username, id, isTyping }` to everyone except the sender, throttled to one start per 1.5s per conversation per socket via a new `socket.data.typingThrottle` map. Read receipts: the shared `markConversationRead` (`apps/server/src/services/message/markRead.ts`) now also returns `lastReadMessageCreatedAt`; the DM/room mark-read routes broadcast `directChat:readReceipt`/`chatroom:readReceipt` to the conversation room with the cursor, and new read-only `GET /dm/:directChatId/read-receipt` and `GET /room/:chatRoomId/read-receipts` endpoints expose the current cursors. Client (`apps/web/components/app`): `AppShell.tsx` owns optimistic sends (temp bubble → swap on success / mark failed on error, dismissable), keeps per-conversation read cursors and active typers, and listens for the new socket events; `ThreadPanel.tsx` debounces typing emits (start on first key, keepalive every 2s, stop after 2.5s idle) and renders a "typing…" header indicator; `MessageRow` shows WhatsApp-style ticks — pending ellipsis, single check = sent, double check (accent) = read / read by all, muted double check = read by some (room tooltip shows count), red "Not sent" pill for failures — computed by the new pure `readStatusOf` in `helpers.ts` (room messages count as read only when every other member's cursor has passed them). New `DoubleCheckIcon`, `ReadReceipt`/`TypingUser` types, and `ChatAPI.getDmReadReceipt`/`getRoomReadReceipts` fetchers. Tests: typing schema/validator, socket (throttle, broadcast exclusion, access denial), read-receipt endpoint, and frontend `readStatusOf` unit tests.
**Why:** The chat app shipped with a static demo of typing/read UI but no real event flow, so senders never saw delivery state and members couldn't tell who was typing or had read a message.
**Impact:** All apps. Server adds two socket events and two read-only endpoints; `mark-read` responses gain a `lastReadMessageCreatedAt` field (mock-dependent tests updated). Client gets optimistic messaging with a real send/received/read lifecycle and live typing indicators. Server tests (384) and web tests (14), typecheck, lint, and build all pass.
**Follow-ups:** Verify typing/read flows end-to-end in a browser across two sessions; consider persisting typing state across reconnect and showing read-by names in room tooltips once member avatars are resolved for receipts.

## [2026-08-13] - Backend Security & Recovery-Code Hardening

**What changed:** Recovery codes are no longer returned in any HTTP response body. `signup`, `forgot-password`, and `recovery-codes` (regenerate) now call `issueRecoveryToken` in the new `apps/server/src/services/recoveryShow.ts`, which stores the plaintext codes in Redis under `recovery-codes:{token}` (256-bit random token, 10-minute TTL) and return only `{ ok, recoveryToken }`. A new rate-limited `POST /auth/recovery-codes/show` route (`apps/server/src/routes/auth/recoveryShow.ts`, mounted in `routes/auth.ts`) exchanges the token exactly once via atomic `GETDEL` (`consumeRecoveryToken`) and replies with `Cache-Control: no-store`; the client fetches codes through it (`AuthCard.tsx` signup/forgot, `api.ts` `showRecoveryCodes`/`regenerateRecoveryCodes`). CSRF: `middleware/session.ts` now requires a dedicated `CSRF_SECRET` env var (min 32 chars, added to `.env.example`) instead of zero-padding `SESSION_SECRET`, which produced a weak secret. Socket hardening: `ensureRoomAccess` in `roomChat.ts` accepts a `bypassCache` option and the room message edit/delete handlers pass it, so a user removed from a room can no longer mutate messages during the 60s membership-cache window. Pagination: the room and direct-chat `GET .../messages` routes now return the previously discarded `nextCursor` (server `room.ts`, `direct-chat/messages.ts`; client `api.ts` `getDmMessages`/`getRoomMessages`, `AppShell.tsx`). S3: `S3Service` exposes public `getClient()`/`getBucket()` getters and `s3HealthCheck.ts`/`health.ts` use them instead of reaching into private fields. Demo-account panel removed from `AuthCard.tsx` along with the `NEXT_PUBLIC_DEMO_*` vars in `.env.example`, and the dead `newUserId` signup state is deleted (avatars are saved via `/auth/me/avatar`). Repo hygiene: `pnpm.overrides` moved from root `package.json` to `pnpm-workspace.yaml` (pnpm 10 ignores the root field), the stray `roomChatEditDelete.test.ts.orig` is deleted, and `app.html` is removed.
**Why:** Plaintext recovery codes in API responses are a security liability — a proxy or access-log could capture them, and codes shown once to the user were still retrievable via API afterward. The CSRF secret derivation was weak and could silently collide when `SESSION_SECRET` was rotated. The 60s membership cache let removed users keep editing/deleting messages. `nextCursor` was computed on every page and thrown away, so message pagination could never work. Private-field access via `s3Service["client"]` broke S3 encapsulation. The demo-credentials panel shipped a `NEXT_PUBLIC_`-backed login backdoor. `app.html` was a stray root dump (see audit).
**Impact:** All apps. Auth flows now exchange a single-use token for the codes; signup/forgot/regenerate response shapes changed and the client was updated in the same change. Socket edit/delete events pay one extra DB membership query each. Message endpoints gain a `nextCursor` field. Servers now refuse to start without a `CSRF_SECRET` set. Server tests (355) and web tests (6), typecheck, lint, and build all pass.
**Follow-ups:** Rotate `CSRF_SECRET` in production; the old zero-padded derivation is no longer accepted. Consider sweeping `apps/web/.next` build caches that still embed the removed demo constants.

## [2026-08-12] - Add Settings Nav Item to Desktop Rail

**What changed:** `apps/web/components/app/AppShell.tsx` desktop rail now includes a Settings nav item (GearIcon, after Search), calling `setTab("settings")` like the mobile bottom nav already did. The rail previously listed only Chat / Rooms / Search, so the Settings tab — which opens `SettingsMenu` in `ListPanel.tsx` (My Account, Profile, Recovery codes, invitations, etc.) — was reachable exclusively from the mobile bottom nav and appeared "missing" on desktop.
**Why:** Feature parity regression — mobile surfaced a whole settings surface that desktop had no entry point for.
**Impact:** `apps/web` only. Desktop `/dashboard` rail now opens the Settings tab and its menu identically to mobile; no layout changes elsewhere.
**Follow-ups:** None.

## [2026-08-12] - Fix Double Focus Ring on Search Bars

**What changed:** Search bars render a single focus treatment now. The root cause was a global rule in `apps/web/app/globals.css`: `:focus-visible` applied a green 3px `box-shadow` ring and `border-radius: 8px` to **every** focused element, while each search container already drew its own ring via `focus-within` (`styles.ts` `searchBox`) — so a focused `<input>` received a nested green ring inside the wrapper's ring. The global rule now excludes form fields (`:focus-visible:not(input):not(textarea):not(select)`), keeping the ring on buttons/links for keyboard focus; inputs keep `outline: none` and rely on their own treatment (wrapper `focus-within` border+ring, or the field's own `focus:border-accent-solid` + `focus:shadow`). Also deduplicated `apps/web/components/app/ListPanel.tsx`: its hand-inlined copy of the search classes (including a dead `searchbox` class name) now uses the shared `searchBox`/`searchInput` strings from `styles.ts`, as `Modals.tsx` already did — so all three search bars ship from one definition.
**Why:** Every search field (ListPanel, New-DM modal, Invite modal) rendered a doubled border/focus ring — wrapper ring plus the input's own generic `:focus-visible` ring — on focus, and the generic rule forced `border-radius: 8px` over the field's `rounded-xl`.
**Impact:** `apps/web` only, no behavior change to search logic. Single clean rounded border on unfocused, single accent border + ring on focus, for every search bar. Buttons/links retain the global keyboard focus ring; list/a11y unaffected. The `:focus-visible` exclusion also fixes the same double-ring on auth/room fields (`fieldInput` and the message-composer textarea).
**Follow-ups:** None.

## [2026-08-12] - Global CSRF Interceptor on Shared API Client

**What changed:** `apps/web/app/lib/api.ts` now registers an axios request interceptor on the shared `api` instance: every non-GET request (`POST`/`PUT`/`PATCH`/`DELETE`) first fetches a fresh token via `GET /csrf-token` and attaches it to the body as `_csrf` (spread into JSON bodies, `FormData.append` for multipart). Because tiny-csrf clears its token cookie after each successful state-changing request and runs globally in `apps/server/src/index.ts`, a fresh fetch per mutation is required; the token fetch itself is a GET and skips the interceptor, so there is no recursion. `apps/web/app/lib/csrf.ts` shrinks to a thin typed `postCsrf` wrapper (the previously exported `getCsrfToken` is gone — nothing else used it, and the interceptor owns fetching now); `apps/web/components/app/api.ts` `regenerateRecoveryCodes` returns to a plain `api.post`, dropping the per-call `postCsrf` import.
**Why:** Every mutating messenger call (`sendDirectMessage`, `mark-read`, edits/deletes, invites, join-links, join-requests, attachment presign, logout, recovery regeneration) was POSTing/PATCHing/DELETEing without `_csrf`, so tiny-csrf rejected each one and the generic error handler returned `500 {"ok":false,"error":"Server error"}`. Per-call `postCsrf` wiring was the prior workaround for recovery codes only; the interceptor fixes the whole surface in one place.
**Impact:** `apps/web` only; server unchanged. All state-changing requests through `app/lib/api.ts` now carry a valid CSRF token, so the messenger's REST mutations and auth mutations work end-to-end. Adds one extra `GET /csrf-token` per mutation (required by tiny-csrf's cookie-clearing behavior).
**Follow-ups:** Socket message sends (`chatroom:message*`) carry an acks callback rather than an HTTP body, so they remain unaffected by CSRF; verify with a browser session that DM sends and mark-read now succeed.

## [2026-08-12] - Stop Truncating Recovery Codes, Add Per-Code Copy Button

**What changed:** Recovery-code rendering no longer truncates. In `apps/web/app/auth/AuthCard.tsx` (post-login/signup/reset screen) and `apps/web/components/app/Modals.tsx` (`RecoveryModal` regeneration), each code was a clipped chip in a `grid-cols-2` layout with the Tailwind `truncate` class (`overflow-hidden; text-overflow: ellipsis; white-space: nowrap`) — a 24-char code like `RC_6D586N.G4YB-2JG6-Y3M4` lost its final 4-char group. Both grid containers are now `flex flex-col` stacks with each code on its own full-width row, `truncate` removed, and `whitespace-nowrap` preserved so the code line is fully legible for screenshots. Each code row gains a copy button (new `CopyIcon` in `apps/web/components/app/icons.tsx`) that writes the code to the clipboard and swaps to a check-mark feedback for 1.5s (`CheckIcon`); the row keeps `select-all` and a centered `CopyIcon`/`CheckIcon` so clipboard-blocked contexts still allow manual Ctrl+C.
**Why:** Users reported the recovery-code UI hid the last 4 digits (ellipsis truncation in the 2-column grid) and could not reliably copy/screenshot the codes they must save or risk losing password-reset access entirely. The single-line-per-code layout also ends the run-together concatenation that `select-all` copying of the old 2×5 grid produced.
**Impact:** `apps/web` only; no change to code generation, storage, or validation. Recovery code flow screens render full-width legible codes with a working copy action.
**Follow-ups:** None.

## [2026-08-12] - Fix Double /api Prefix on CSRF Token Request

**What changed:** `apps/web/app/lib/csrf.ts` now fetches `/csrf-token` instead of `/api/csrf-token`. The axios instance in `apps/web/app/lib/api.ts` already sets `baseURL` to `.../api`, so the old path resolved to `http://localhost:3100/api/api/csrf-token` and returned HTTP 404, breaking every auth mutation (`AuthCard.tsx` login/signup/forgot/join all go through `postCsrf`).
**Why:** The request path double-prefixed the API mount, so the client hit a route the server never registers (server route is `GET /api/csrf-token` in `apps/server/src/index.ts`). All other client calls (`/auth/me`, `/dm/...`, `/room/...`) already use the baseURL-relative form — this was the single outlier.
**Impact:** `apps/web` only. The CSRF handshake now reaches the token endpoint; auth submits work again.
**Follow-ups:** None.

## [2026-08-12] - Remove Scoped CSS in Favor of Inline Tailwind Tokens

**What changed:** Deleted the messenger design system `apps/web/app/app.css` and the auth stylesheet `apps/web/app/auth/auth.css`, and replaced every usage with inline Tailwind utilities backed by the design tokens in `apps/web/app/globals.css` (moved the `.avatar`/`.font-body` utilities and the `pop`/`rise`/`fade`/`shimmer`/`auth-fade` keyframes there during Phase 1). Converted `components/app/{AppShell,ListPanel,ThreadPanel,Modals,Toasts}.tsx`, `components/app/AppAvatar.tsx`, `app/auth/AuthCard.tsx`, `app/auth/ThemeToggle.tsx`, and `app/auth/page.tsx` to inline utilities; `app/icons.tsx` was refactored to a shared `base()`/`SVGProps` helper (old `app.css` sized icons via scoped `.icon svg` rules) and a new `components/app/styles.ts` holds the shared class strings (`btn`, `btnPrimary`, `input`, `chip*`, `rowItem`, `searchBox`, …). Dropped the `"../app.css"` import from `app/dashboard/page.tsx`. `landing.css` is untouched (landing still uses it).
**Why:** The scoped `.app`/`.auth` stylesheets duplicated the token system and pinned the shell/auth UI to legacy class names, making the tailwind-in-globals approach (Phase 1) ineffective for the messenger. Inline utilities with `color-mix`/`oklch` references keep dark-mode flipping automatic via `html[data-theme="dark"]`.
**Impact:** `/dashboard` shell and `/auth` page render identically without their stylesheets; `globals.css` shrinks `app.css` (1362 lines) + `auth.css` (573 lines) to a token/utility source. Mobile `<760px` thread drawer uses a `group` + `data-thread-open` attribute variant instead of `.shell`/`.thread` CSS. Typecheck, lint, and build pass.
**Follow-ups:** `landing.css` remains the last scoped stylesheet — the landing components are the remaining conversion target; consider deleting `app/page.module.css` (unused Next.js scaffold file).

## [2026-08-12] - Port New Auth Design to React, Fix Broken CSRF

**What changed:** Rebuilt `apps/web/app/auth/` to the new centered-card design: new scoped stylesheet `app/auth/auth.css`, thin server shell in `auth/page.tsx` (topbar logo + `ThemeToggle`, footer, `MascotDefs`), and `AuthCard.tsx` rewritten as five screens — login (email-or-username), signup, recovery codes, forgot password, and join-a-room via join-link token — wired to the real API. New client helper `apps/web/app/lib/csrf.ts` (`getCsrfToken`/`postCsrf`) fetches `GET /api/csrf-token` and echoes `_csrf` in each mutation body (tiny-csrf v1.1.6 only validates the body field). Server fix in `apps/server/src/index.ts`: `cookieParser(csrfSecret)` (secret now exported from `middleware/session.ts`) so tiny-csrf's `signed: true` cookie no longer makes `res.cookie` throw — previously every POST (login/signup/etc.) returned 500. Removed all `avery`/`password123` demo references; demo panel is now env-driven (`NEXT_PUBLIC_DEMO_USERNAME`/`NEXT_PUBLIC_DEMO_PASSWORD`, empty in `.env`/`.env.example`) and hidden until both are set. Supports `?mode=login|signup` and `?join=TOKEN`.
**Why:** The auth flow could not submit at all (CSRF 500), the previous page was a single login/signup card with no recovery/forgot/join screens, and the demo-account credentials were hardcoded copy rather than configurable.
**Impact:** `apps/web` auth page UI and auth submit path; server adds one cookie-parser secret. Existing sessions and GET endpoints unaffected. Login/signup/forgot/join now require a valid CSRF handshake (the token endpoint is excluded from CSRF checks).
**Follow-ups:** The messenger's DM/REST POSTs (`components/app/api.ts`) also hit the CSRF gap — a global axios `_csrf` interceptor would fix those too; out of scope here. Confirm the demo account (if any) exists before setting `NEXT_PUBLIC_DEMO_*`.

**What changed:** `apps/web/components/landing/LandingNavbar.tsx` is now session-aware: it probes `/auth/me` on mount and shows "Open app" (`/dashboard`) when signed in, otherwise "Log in" (`/auth?mode=login`), "Sign up" (`/auth?mode=signup`), and "Get the app" (`/auth`) — desktop and mobile nav. `HeroSection.tsx` and `CTABand.tsx` drop the "sign in with avery / password123" copy, and their CTAs now point at the auth tabs. `apps/web/app/auth/AuthCard.tsx` replaces the email-only login field with a single "Email or username" input that sends the matching branch of `userZod.login` (`HandelLogin`), and adds a demo-credentials panel on the login tab with a "Use demo credentials" button that prefills `avery` / `password123` and submits.
**Why:** Landing CTAs silently dropped already-authenticated visitors straight into the `/dashboard` messenger (leftover demo session) and there were no explicit sign in/sign up buttons; the demo login also couldn't be used from the form because it only accepted an email while the demo account logs in by username.
**Impact:** `apps/web` only, no API changes (login already accepts email or username). Landing navbar makes an extra `/auth/me` request per load; failures are treated as signed out.
**Follow-ups:** Confirm the `avery` demo account exists in the target database (previously only referenced as copy).

**What changed:** Extracted the initial-load sequence out of `AppShell.tsx` into a pure async function `loadInitialState` in `apps/web/app/lib/initialLoad.ts` (`InitialLoadApi` fetchers + `InitialLoadCallbacks`). `AppShell`'s mount effect now calls it with ref/state callbacks wrapped in a `cancelled` guard via a generic `live` helper. Added vitest to `@repo/web` (devDependency, `test` script `vitest run`, `vitest.config.ts` with node environment). New test file `apps/web/app/lib/initialLoad.test.ts` with 6 tests covering: happy path (user + both lists + done), 401 → `onUnauthorized` (no shell state touched), non-401 auth error → `onLoadError` with server message, non-axios error → fallback message, and inbox/rooms failure → user still surfaced with `onListError` + `onDone`.
**Why:** The splash-hang fix needs regression coverage proving a list failure can never leave the shell stuck on "Loading your conversations…", and the logic had to be separated from React to be unit-testable without a DOM/test renderer.
**Impact:** `apps/web` only. New test infra (`vitest.config.ts`, vitest dep, `pnpm test` now runs in web too). No behavior change — `AppShell`'s load path behaves identically.
**Follow-ups:** None.

## [2026-08-12] - Fix Dashboard Stuck on "Loading Your Conversations" Splash

**What changed:** `AppShell.tsx` no longer gates the shell render on a single `Promise.all([getMe, getDmInbox, getRooms])`. The initial-load effect now resolves `/auth/me` first and flips `user` (exiting the splash) before loading the DM inbox and rooms; if those list requests fail, the shell renders with empty lists plus an error toast instead of hanging. A 401 from `/auth/me` redirects the client to `/auth`, and any other failure sets a new `loadError` state that renders a "Retry" splash (with `window.location.reload`) rather than an infinite spinner. Added `loadError` state and `isAxiosError` import.
**Why:** Clicking any landing CTA ("Get the app" / "Start conversation") forwarded to `/dashboard`, which got stuck on "Loading your conversations…" indefinitely whenever `/dm/inbox` or `/room/rooms` failed (or auth check errored) — the `Promise.all` rejected and `user` was never set.
**Impact:** `components/app/AppShell.tsx` only. The splash no longer spins forever on list/Auth API failures; users are sent to `/auth` on expired sessions. Empty inbox/rooms lists on transient errors are preferred over a dead screen.
**Follow-ups:** None.

## [2026-08-12] - Port app.html Messenger Shell to the Next.js Dashboard

**What changed:** Replaced the old stats `/dashboard` with the full messenger shell from `app.html`, wired to the real backend. New server endpoints: `GET /room/:chatRoomId/messages` (cursor pagination via `apps/server/src/services/room/getMessages.ts` + `roomMessageWithUserSelect`) and `GET /room/:chatRoomId/members` (`apps/server/src/services/room/getMembers.ts`, ordered by role then `joinedAt`), both gated by `assertRoomAccess`, with 6 new unit tests. New client: `app/app.css` (`.app`-scoped design system with oklch tokens + dark theme), `components/app/{types,helpers,api,state,icons,AppAvatar,AppShell,ListPanel,ThreadPanel,Modals,Toasts}`. `AppShell` owns conversation state, socket listeners (`message:new/edited/deleted`, `chatroom:message*`, `inbox:update`, `directChat:read`, `chatroom:read`, rejoin on reconnect), and mark-read; DMs use REST (`POST /dm/:id/message`, `PATCH/DELETE /dm/message/:id`), rooms use socket acks (`chatroom:message*` with `{ payload, callback }`); `uploadAttachments` drives the composer. All modals (new DM, new room, room info, invite, join requests, join links, received/sent invites, my links, profile, account, recovery codes, confirm) call real endpoints. `dashboard/layout.tsx` keeps the server-side auth redirect but drops `DashboardSidebar`; `dashboard/page.tsx` renders `AppShell`. Deleted old `dashboard/{components,dm,room}`, `components/{dmComponent,roomComponent,shared,search}`.
**Why:** The `/dashboard` pages were unrelated placeholder stats and separate DM/room pages that didn't match the `app.html` product design and didn't implement live messaging or the room management flows.
**Impact:** `/dashboard` is now a single full-screen messenger shell (DM + rooms, live socket updates, attachments, unread badges, all room management modals). Old DM/room routes (`/dashboard/dm/*`, `/dashboard/room/*`) are removed; `/auth` redirects land on the shell. Typecheck, lint, web build, and all 355 server tests pass.
**Follow-ups:** Room list only live-updates for the active room (no global room `inbox:update`); join-link invite page (`GET /room/join/:token`) is not ported — links are created/seen in-room. No optimistic message send (relies on socket broadcast/ack + dedupe). `data-theme`/`.light` class coupling remains from the landing redesign.

## [2026-08-12] - Redesign Marketing Landing Page

**What changed:** Rebuilt the landing page (`apps/web/app/page.tsx`) to match the new brand design: green mascot (Nunito + Quicksand via `next/font/google`), theme toggle wired to a unified `data-theme` attribute (FOUC-safe inline script in `layout.tsx`, `useTheme` updated), animated hero chat, five feature demos (real-time, reactions, presence, attachments, read receipts) started via `IntersectionObserver` and cancelled under `prefers-reduced-motion`, positioning/personality/CTA/footer sections. New files: `app/landing.css` (scoped design system), `components/landing/{Mascot,LandingNavbar,HeroSection,PositioningSection,FeaturesSection,demos,PersonalitySection,CTABand,LandingFooter,icons}`. Deleted the old Tailwind landing components (`Hero`, `Navbar`, `Features`, `Stats`, `PreviewWindow`, `CTA`, `Footer`, `BackgroundBlobs`).
**Why:** The previous landing page was an unrelated Discord-style pitch ("Where your community lives") that didn't match the product's private/real-time/personal positioning or the new green brand identity.
**Impact:** `/` is now statically prerendered with the new design; dashboard and auth pages unchanged (landing CSS is scoped under `.landing`). Theme now persists via `data-theme` on `<html>`; the `.light` class still toggles alongside it for Tailwind `--color-*` overrides.
**Follow-ups:** Launchpad/auth prototype pages from the design (auth.html, index.html) were not ported — the real `/auth` flow is used instead.

## [2026-08-11] - Comprehensive Frontend Technical Specification

**What changed:** Created `CHATHUBBY_FRONTEND_SPEC.md` — a complete reverse-engineered frontend specification covering all 34 REST endpoints, all 17 socket events, all Zod validation schemas, all entity models, authentication flow, authorization matrix, pagination contracts, attachment upload flow, error codes, required frontend screens, core user flows, state management requirements, and integration hazards.
**Why:** The frontend agent (Open Design or similar) needs a single authoritative document to build the entire ChatHubby frontend without inspecting backend source code. This spec was generated by reading every route, service, middleware, validator, test, and socket handler in the codebase.
**Impact:** No code changes. New documentation file only. Covers known gaps (no room messages REST endpoint, no typing indicators, no profile update endpoint) and warns about integration hazards (CSRF, cookie SameSite, socket payload wrapper pattern, soft-deleted messages, recovery codes shown once).
**Follow-ups:** Use this spec as input to the frontend design/generation agent. The `todo.md` gaps (room messages HTTP endpoint, DM inbox pagination for DMSidebar) are documented in the spec as known limitations.

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
