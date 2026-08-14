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
