# Rooms → Community & Channel Architecture

## Production-Grade Phased Implementation Prompt (Expanded Edition)

You are working on an existing web application that currently has **Rooms**, but Rooms behave essentially like renamed WhatsApp groups: one room contains one continuous chat.

The goal is to evolve Rooms into a **Discord-inspired community/workspace system** — including **voice channels, video calls, screen sharing, and a floating call-control widget** — while keeping the product simpler and more focused than Discord.

The implementation must be **incremental, production-grade, responsive, accessible, visually polished, and backward-compatible**.

Do NOT attempt to rebuild the entire system in one phase.

---

# 0. CONTEXT & OBJECTIVE

## 0.1 Current state

- A Room = one flat chat stream (messages belong directly to a Room).
- No channels, no categories, no roles beyond basic membership.
- No voice/video capability.

## 0.2 Target state

- A Room = a community/workspace containing **categories → channels → messages**.
- Channels can be **TEXT** or **VOICE** (voice channels support live audio, video, and screen sharing).
- When a user is in a call, a **floating call widget** follows them across the entire app, providing Discord-style controls (mute, deafen, camera, screen share, participants, disconnect) without forcing them to stay on the channel screen.
- DMs remain completely separate from Rooms.

## 0.3 Success definition

The final result should feel like a **production-quality community/workspace platform with Discord-style channels and calling**, not a WhatsApp group with a sidebar added to it, and not a video-conferencing app bolted onto a chat app.

---

# 1. CORE PRODUCT CONCEPT

Change the mental model from:

```text
Room
 ├── Members
 └── Messages
```

to:

```text
Room / Community
 ├── Members
 ├── Roles
 ├── Categories
 │    └── Channels (TEXT | VOICE)
 │         ├── Messages        (text channels)
 │         └── Call Sessions   (voice channels)
 └── Settings
```

The intended hierarchy is:

```text
User
│
├── Direct Messages
│
└── Rooms
     │
     ├── Room A
     │    ├── Category
     │    │    ├── #text-channel
     │    │    └── #text-channel
     │    │
     │    └── Category
     │         ├── #text-channel
     │         └── 🔊 voice-channel
     │
     └── Room B
          └── ...
```

Key rules:

- A **Channel** is where conversations happen (text) or where calls happen (voice).
- A **Category** groups related channels.
- **DMs remain completely separate** from Rooms.
- Voice channels have **no persistent message history**; they show participants and call state instead.

---

# 2. IMPORTANT IMPLEMENTATION RULES

Before changing code:

1. Inspect the existing repository.
2. Identify the existing Room, member, message, user, notification, and permission systems.
3. Identify the current frontend routing and layout architecture.
4. Identify the current backend/API architecture.
5. Identify the current database schema.
6. Identify existing reusable UI components.
7. Identify existing authentication/session handling.
8. Identify existing real-time messaging infrastructure (WebSocket/SSE).
9. Identify whether any media/WebRTC capability already exists.
10. Do NOT replace working infrastructure unnecessarily.
11. Reuse existing patterns wherever possible.
12. Do NOT introduce a second state-management or styling system without a concrete reason.
13. Do NOT break existing DMs.
14. Do NOT delete existing Room data.
15. Do NOT perform destructive database migrations.
16. Every phase must leave the application in a runnable state.

Before implementation, produce a concise architecture assessment describing:

- Existing Room implementation
- Existing message implementation
- Existing membership implementation
- Existing authentication
- Existing real-time implementation
- Existing UI structure
- Existing database structure
- Existing notification system
- What can be reused
- What needs to change
- Potential migration risks

Then begin Phase 1.

---

# 3. DESIGN DIRECTION

The UI should be inspired by the usability patterns of Discord, Slack, and modern community applications, but it must NOT be a visual clone of Discord.

Use the application's existing visual identity where possible.

The new Rooms experience should feel:

- Modern
- Dense but readable
- Professional
- Fast
- Polished
- Responsive
- Consistent
- Keyboard-friendly
- Accessible

Avoid:

- Excessive gradients
- Excessive rounded cards
- Giant empty areas
- Generic dashboard aesthetics
- Unnecessary animations
- Visually noisy interfaces
- Excessive borders
- Excessive shadows
- Discord's exact visual styling

Prioritize hierarchy, spacing, typography, interaction feedback, and information density.

---

# 4. GLOBAL FRONTEND QUALITY BAR

The frontend must be production polished.

Every feature must include:

- Loading states
- Skeleton states where appropriate
- Empty states
- Error states
- Disabled states
- Hover states
- Focus states
- Active states
- Mobile behavior
- Keyboard navigation where appropriate
- Optimistic UI where appropriate
- Confirmation dialogs for destructive actions
- Toast/notification feedback where appropriate

Do not leave placeholder UI such as:

```text
TODO
Coming soon
Test button
Lorem ipsum
```

unless explicitly required.

Additional rules:

- Avoid layout shifts.
- Avoid unnecessary network requests.
- Avoid flashing incorrect UI during loading.
- Avoid rendering massive member/message lists without virtualization or pagination where necessary.
- Never render the floating call widget (Phase 8) in a way that blocks primary navigation or traps focus.

---

# 5. PHASE 1 — ARCHITECTURE + DATA MODEL

Do not redesign the entire UI yet. First establish the foundation.

## 5.1 Room model

Expand the Room model to support:

```text
Room
- id
- name
- description
- icon
- ownerId
- createdAt
- updatedAt
```

Preserve all existing Room fields that are still useful. Do not remove existing data.

## 5.2 Category model

Create:

```text
Category
- id
- roomId
- name
- position
- createdAt
- updatedAt
```

Requirements:

- Categories belong to exactly one Room.
- Categories have ordering.
- Categories can be renamed, reordered, and deleted.
- Deleting a category must NOT silently delete its channels.

Recommended behavior when deleting a category:

```text
Confirm deletion
↓
Move contained channels to "Uncategorized"
```

rather than deleting channels.

## 5.3 Channel model

Create:

```text
Channel
- id
- roomId
- categoryId nullable
- name
- description/topic
- type            (TEXT | VOICE | ANNOUNCEMENT | FORUM)
- position
- createdAt
- updatedAt
```

Implement **TEXT** in Phase 1–3 and **VOICE** in Phase 7. Design the model so ANNOUNCEMENT and FORUM can be added later without schema churn.

Channel name validation:

- lowercase normalization where appropriate
- spaces handled consistently (e.g. converted to hyphens)
- reasonable length limit (e.g. 2–32 characters)
- duplicate names prevented within the same Room/category scope

## 5.4 Message migration

Existing Room messages currently belong directly to a Room. Introduce:

```text
Message
 └── channelId
```

Migration strategy:

```text
Existing Room
      ↓
Create default category
      ↓
Create #general
      ↓
Move existing messages
      ↓
Messages now belong to #general
```

Every existing Room automatically receives:

```text
GENERAL
└── #general
```

Requirements:

- Existing messages must remain accessible. Do NOT delete existing messages.
- The migration must be **idempotent** — running it twice must not create duplicate categories/channels.
- The migration must be resumable/verifiable on large datasets.

## 5.5 API/backend foundation

Create clean APIs:

### Rooms

```text
GET    /rooms
GET    /rooms/:roomId
PATCH  /rooms/:roomId
DELETE /rooms/:roomId
```

### Categories

```text
POST   /rooms/:roomId/categories
PATCH  /rooms/:roomId/categories/:categoryId
DELETE /rooms/:roomId/categories/:categoryId
PATCH  /rooms/:roomId/categories/reorder
```

### Channels

```text
POST   /rooms/:roomId/channels
GET    /rooms/:roomId/channels
PATCH  /rooms/:roomId/channels/:channelId
DELETE /rooms/:roomId/channels/:channelId
PATCH  /rooms/:roomId/channels/reorder
```

### Messages

Update existing message APIs so messages are scoped to `roomId + channelId` where appropriate. Do not duplicate message logic.

## 5.6 Authorization

At minimum:

**Room Owner** can: edit Room, delete Room, manage members, manage roles, manage categories, manage channels.

**Admin** can: manage members, manage categories, manage channels, moderate messages.

**Member** can: view accessible channels, send messages, read messages, join voice channels.

Do not implement an unnecessarily complex permission engine yet. Create an authorization abstraction so granular permissions can be added later.

## 5.7 Phase 1 completion criteria

- Existing Rooms still work.
- Existing messages are preserved and appear in `#general`.
- Every Room has `#general`.
- Channels and categories are persisted.
- API authorization works.
- No existing DM functionality is broken.
- Database migration is safe and repeatable.
- Backend tests exist for the migration and core CRUD operations.

---

# 6. PHASE 2 — NEW ROOM FRONTEND SHELL

Now redesign the Room frontend.

The main Room layout:

```text
┌─────────────────────────────────────────────────────────────┐
│ Room Header                                                  │
├──────────────┬──────────────────────────────┬───────────────┤
│ Room         │                              │ Members       │
│ Sidebar      │       Channel Content        │ Sidebar       │
│ (Categories  │                              │ (collapsible) │
│  + Channels) │                              │               │
└──────────────┴──────────────────────────────┴───────────────┘
```

## 6.1 Room sidebar

Header contains: Room icon, Room name, dropdown/settings button.

Menu for authorized users:

```text
Room Settings
Invite People
Manage Members
Manage Roles
Create Category
Create Channel
Leave Room
```

Menu for normal members:

```text
Notifications
Invite People
Leave Room
```

## 6.2 Categories

Render categories like:

```text
INFORMATION
  # announcements
  # rules

DISCUSSION
  # general
  # random

VOICE LOUNGE
  🔊 Hangout
  🔊 Focus Room
```

Each category should collapse/expand, show channels, allow management for authorized users, and support reordering later. Do not make categories visually dominant — the channel list is the primary navigation element.

## 6.3 Channel appearance

- Text channels use a consistent `#` icon; voice channels use a speaker icon.
- Active channel has an obvious but restrained selected state.
- Unread channels show an unread indicator, stronger text weight, and optionally an unread count.
- Mentioned channels have a stronger notification state.
- Voice channels show the **current participant count and avatar stack** beneath the channel name when a call is active (e.g. `🔊 Hangout — 3` with small avatars).

## 6.4 Channel header

Displays channel name + topic, and provides notification controls, search, member sidebar toggle, and more actions. The header must remain visible while scrolling messages.

## 6.5 Message area

- Infinite scroll or cursor pagination
- Message grouping where appropriate
- Timestamp, avatar, username, content
- Reactions if the existing app supports them
- Edited indicator, deleted state
- Reply support if already implemented
- Context menu

Avoid putting every message inside a large card. Use message rows with strong vertical rhythm.

## 6.6 Message composer

- Anchored at the bottom
- Multiline support, Enter to submit, Shift+Enter for newline
- Disabled state while unavailable
- Handles sending failures and preserves typed text
- Attachment controls if the existing application supports them

Do not introduce a heavy rich-text editor unless required.

## 6.7 Mobile layout

Do not simply shrink the desktop layout. On mobile:

```text
Room list → Room sidebar (drawer) → Channel (full screen)
```

- Use drawers/sheets for navigation.
- Member list becomes a drawer.
- Composer must respect mobile keyboard behavior.

## 6.8 Phase 2 completion criteria

The new Room UI must support: Room navigation, category navigation, channel navigation, channel switching, message history, sending messages, responsive desktop and mobile layouts, loading/error/empty states, existing authentication, and existing real-time messaging.

---

# 7. PHASE 3 — CHANNEL & CATEGORY MANAGEMENT

## 7.1 Channel management

Authorized users can: create, rename, edit description, delete, and move channels.

Channel creation modal:

```text
Create Channel

Channel type
(•) Text    ( ) Voice

Channel name
[ general-development ]

Description
[ Optional description ]

Category
[ Development ▼ ]

             Cancel   Create Channel
```

(The Voice option becomes selectable in Phase 7; until then it may be visible but disabled with a tooltip, or hidden — pick one and be consistent.)

Requirements: client validation, server validation, permission validation, duplicate prevention, loading state, error handling, success feedback.

## 7.2 Category management

Implement: create, rename, delete, collapse, reorder.

Use drag-and-drop only where it genuinely improves usability. If implemented:

- a keyboard alternative must exist
- touch interaction must work
- optimistic updates must roll back on failure

## 7.3 Channel context menu

For authorized users:

```text
Edit Channel
Notification Settings
Copy Channel Link
Delete Channel
```

For members:

```text
Notification Settings
Copy Channel Link
```

Destructive actions require confirmation.

---

# 8. PHASE 4 — ROLES + MEMBERS

## 8.1 Role system

Default roles: `Owner`, `Admin`, `Moderator`, `Member`.

Roles have: name, color, position, permissions.

Suggested initial permissions:

```text
VIEW_CHANNEL
SEND_MESSAGES
MANAGE_MESSAGES
MANAGE_CHANNELS
MANAGE_CATEGORIES
MANAGE_MEMBERS
MANAGE_ROLES
MANAGE_ROOM
MENTION_EVERYONE
CONNECT_VOICE        (join voice channels)
SPEAK_VOICE          (unmute/talk in voice channels)
VIDEO_VOICE          (share camera)
SCREENSHARE_VOICE    (share screen)
MOVE_MEMBERS_VOICE   (disconnect/move others in voice)
```

Use permission checks on the backend. Frontend permission checks only control UI visibility. Never rely on frontend authorization.

## 8.2 Member list

```text
MEMBERS — 42

OWNER
  Talib

ADMIN
  User A

MODERATOR
  User B
  User C

MEMBERS
  User D
  User E
  User F
```

Display avatar, username, presence (if available), and role indicator. Clicking a member opens the existing profile card system — do not create a second incompatible profile system.

## 8.3 Member management

Authorized users can: view profile, assign role, remove role, mute, kick, ban.

Only implement actions the existing moderation model can safely support. Add confirmation for destructive actions.

---

# 9. PHASE 5 — ROOM SETTINGS

Create a polished Room Settings interface:

```text
Room Settings

Overview
Profile
Channels
Roles
Members
Notifications
Moderation
Danger Zone
```

Use a settings layout rather than separate pages for every tiny option.

## 9.1 Overview

Owner/admin can change Room name, description, and icon, with preview.

## 9.2 Notifications

Support: `All messages`, `Only mentions`, `Muted`. Persist preferences per user and per Room/channel where appropriate.

## 9.3 Danger Zone

Clearly separate destructive actions: `Leave Room`, `Delete Room`. Delete Room requires explicit confirmation — for owner deletion, require typing the Room name.

---

# 10. PHASE 6 — NOTIFICATIONS + UNREAD STATE + REALTIME

## 10.1 Unread state

Integrate the existing notification system. Track `lastReadMessageId` or an equivalent efficient cursor.

Per channel: `Unread`, `Mentioned`, `Read`, `Muted`.

The sidebar communicates unread state without becoming visually noisy. When switching to a channel: mark appropriate messages as read, update unread indicators, synchronize state with the server. Do not mark a channel read merely because it was rendered in the background.

## 10.2 Real-time updates

Use the existing real-time infrastructure. Events should include:

```text
message.created / message.updated / message.deleted

channel.created / channel.updated / channel.deleted / channel.reordered

category.created / category.updated / category.deleted / category.reordered

member.joined / member.left / member.updated

room.updated
```

Do not introduce polling if the application already has WebSockets/SSE.

(Voice/call signaling events are defined in Phase 7.)

---

# 11. PHASE 7 — VOICE CHANNELS + CALLS (VOICE / VIDEO / SCREEN SHARE)

Introduce live calling inside voice channels. This phase builds the **call infrastructure**; Phase 8 builds the **floating widget UI** on top of it.

## 11.1 Voice channel behavior

- Clicking a voice channel joins the call (after a confirmation/preview step if the user prefers — provide a "preview before joining" option in settings).
- A voice channel shows **live participants** in the sidebar (avatar stack + count) even to users who have not joined.
- Voice channels enforce `CONNECT_VOICE` permission on the backend.
- Voice channels have a configurable participant limit (default e.g. 25) with a sensible error state when full.

## 11.2 Media architecture

Choose one approach and document the decision:

1. **Managed SFU/SDK** (e.g. LiveKit, Daily, Agora, Twilio) — recommended if the team wants production reliability fast.
2. **Self-hosted SFU** (e.g. mediasoup, Janus, ion-sfu) — only if the team has media-server expertise.
3. **Pure mesh WebRTC** — acceptable only for very small calls (≤ 4 participants); do not use mesh as the long-term plan.

Requirements regardless of approach:

- Short-lived join tokens issued by the backend after permission checks. Never expose static media-server credentials to the client.
- TURN/STUN configuration for NAT traversal.
- Graceful degradation: if video/screen share fails, audio must keep working.
- Device enumeration and selection (microphone, camera, speaker) with persisted preferences.
- Echo cancellation, noise suppression, and auto gain control enabled by default where the browser supports them.

## 11.3 Call session model

```text
CallSession
- id
- channelId
- startedAt
- endedAt nullable

CallParticipant
- sessionId
- userId
- joinedAt
- leftAt nullable
- isMuted
- isDeafened
- isCameraOn
- isScreenSharing
- connectionState
```

Do not persist media streams — only session/participant metadata needed for presence, moderation, and the sidebar participant count.

## 11.4 Call features

Every participant can:

- Mute / unmute microphone
- Deafen / undeafen (mutes mic + all incoming audio)
- Enable / disable camera
- Start / stop screen sharing (screen, window, or browser tab — using `getDisplayMedia`)
- See other participants' video tiles and screen shares
- See speaking indicators (active-speaker highlight driven by audio levels)
- Leave the call

Moderators with `MOVE_MEMBERS_VOICE` can additionally:

- Server-mute a participant
- Disconnect a participant from the call

Screen share requirements:

- Show a clear "You are sharing your screen" indicator (privacy-critical).
- Only one screen share per participant; multiple participants may share simultaneously if the SFU supports it — otherwise queue or restrict with a clear message.
- When someone starts sharing, their share becomes the focused tile for viewers (with an option to switch focus).
- Screen share stops automatically when the browser's native "Stop sharing" is used — the UI must reconcile this state.

## 11.5 Call signaling events

Extend the real-time layer with:

```text
call.started / call.ended

call.participant.joined / call.participant.left

call.participant.updated        (mute/deafen/camera/screenshare state)

call.participant.speaking       (throttled/debounced)

call.screen_share.started / call.screen_share.stopped
```

Voice-channel sidebar presence must update in real time from these events.

## 11.6 Full call view (in-channel)

When the user is viewing the voice channel itself, show the full call interface:

```text
┌──────────────────────────────────────────────┐
│ 🔊 Hangout                        4 in call  │
├──────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │ video/  │ │ video/  │ │ screen  │        │
│  │ avatar  │ │ avatar  │ │ share   │        │
│  └─────────┘ └─────────┘ └─────────┘        │
│  ┌─────────┐                                 │
│  │ avatar  │                                 │
│  └─────────┘                                 │
├──────────────────────────────────────────────┤
│  🎤  🎧  📷  🖥  ⚙  📞(leave)                │
└──────────────────────────────────────────────┘
```

- Grid layout that adapts to participant count (1 → large tile; many → responsive grid with pagination or active-speaker priority).
- Each tile: video or avatar fallback, name, mute/deafen icons, speaking ring, screen-share badge.
- Screen share renders as a focusable tile; clicking it enlarges it.

## 11.7 Edge cases

- Joining a second voice channel (same Room or different Room) moves the user — never allow two simultaneous calls; confirm before switching.
- Losing network mid-call: attempt reconnection with backoff, show reconnecting state, and only tear down after a timeout.
- Browser tab closed / refreshed: participant leaves gracefully; stale participants are reaped server-side after a timeout.
- Permissions changed mid-call (e.g. `SPEAK_VOICE` revoked): enforce server-side and update the UI immediately.
- Device unplugged mid-call: fall back to another device or mute gracefully with a clear notice.

## 11.8 Phase 7 completion criteria

- Users can join/leave voice channels with audio.
- Camera and screen share work end-to-end between two real users.
- Sidebar shows live voice presence in real time.
- All call mutations are permission-checked on the backend.
- Calls survive navigation away from the channel (the call itself must not end when the user opens another channel — this is what Phase 8's widget exposes).

---

# 12. PHASE 8 — FLOATING CALL WIDGET (DISCORD-STYLE)

This is the centerpiece of the calling experience: a **persistent, floating call-control widget** that stays with the user everywhere in the app while they are in a call — exactly like Discord's floating voice/video panel.

## 12.1 Core behavior

- The widget appears as soon as the user joins a voice channel and remains visible **across all navigation** — switching channels, opening DMs, changing Rooms, browsing settings — until the user leaves the call.
- It is rendered at the **app shell level** (outside the routed page content), so route changes never unmount it and the call is never interrupted.
- The widget is **draggable** on desktop: the user can grab it by a dedicated drag handle (or its header) and reposition it anywhere on screen. Its position persists for the session (and optionally in local storage).
- It must be **constrained to the viewport** — it can never be dragged fully off-screen; on window resize it re-clamps into view.
- It must never cover critical fixed UI (e.g. it should not permanently obscure the message composer); provide a sensible default position (e.g. bottom-right, above the composer with margin) and collision-aware snapping.

## 12.2 Widget states

The widget has three states:

### 1. Minimized (default while navigating)

A compact pill/bar showing:

```text
┌─────────────────────────────────────────────┐
│ 🟢 Hangout · Room A        0:12:43          │
│ 🎤  🎧  📷  🖥  ⤢  📞                        │
└─────────────────────────────────────────────┘
```

Contents:

- Connection indicator (green = connected, yellow = reconnecting, red = failed)
- Voice channel name + Room name (clicking navigates back to the voice channel)
- Call duration timer
- Icon buttons: **mute/unmute mic, deafen/undeafen, camera on/off, screen share start/stop, expand, disconnect**
- Small avatar stack of participants (up to ~4, then `+N`)

### 2. Expanded

A larger floating panel (still draggable) showing the full call in miniature:

```text
┌───────────────────────────────────────┐
│ 🔊 Hangout · Room A          ⤡  ✕?   │  ← drag handle header
├───────────────────────────────────────┤
│ ┌───────────┐ ┌───────────┐          │
│ │ video /   │ │ screen    │          │
│ │ avatar    │ │ share     │          │
│ └───────────┘ └───────────┘          │
│ ┌───────────┐ ┌───────────┐          │
│ │ avatar    │ │ avatar    │          │
│ └───────────┘ └───────────┘          │
├───────────────────────────────────────┤
│ 🎤   🎧   📷   🖥   ⚙   📞           │
└───────────────────────────────────────┘
```

- Adaptive tile grid (same component family as the in-channel call view, reused — do not build a second tile implementation).
- Each tile shows speaking indicator, mute/deafen icons, name on hover.
- Footer controls: mic, deafen, camera, screen share, device settings, disconnect.
- `✕` here means **collapse to minimized**, never leave the call — only the red 📞 button leaves, and it needs no confirmation (Discord parity) but must be visually distinct to avoid misclicks.

### 3. Screen-share focus / PiP mode

When someone (including the current user) is screen sharing and the user navigates away from the voice channel:

- The widget automatically offers a **picture-in-picture style tile** of the focused screen share inside the expanded widget.
- The user can pin/switch between the screen share and camera tiles.
- If the browser supports the Document Picture-in-Picture API, optionally offer "Pop out" to a native always-on-top window; this is progressive enhancement, not a requirement.

## 12.3 Controls specification (Discord parity)

| Control           | Behavior                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| 🎤 Mute           | Toggles mic. Icon shows slash state. Shortcut: `Ctrl/Cmd + Shift + M`.                          |
| 🎧 Deafen         | Toggles deafen; also mutes mic. Icon shows slash state.                                         |
| 📷 Camera         | Toggles video. Shows permission error state if denied.                                          |
| 🖥 Screen share    | Opens picker (screen/window/tab) when starting; red/active state while sharing; stops on click. |
| ⚙ Settings        | Opens device picker (mic/camera/speaker) + voice settings.                                      |
| ⤢ Expand/collapse | Switches widget size.                                                                           |
| 📞 Disconnect     | Leaves the call; widget disappears with a short exit animation.                                 |

- Every toggle must be **optimistic** but reconcile with server/SFU state.
- Every control must reflect **real media state**, not just local UI state (e.g. if the browser revokes mic access, the widget must show muted).
- All buttons need tooltips, `aria-pressed`/`aria-label`, and visible focus rings.

## 12.4 Status & feedback

- **Speaking indicator**: the widget border or the active speaker's tile glows subtly when someone speaks; the current user's mic activity shows on their own tile.
- **Reconnecting**: show `Reconnecting…` with a spinner; keep controls visible but disabled except disconnect.
- **Screen sharing self-indicator**: persistent "You're sharing your screen — Stop" affordance, because users forget.
- **Muted-while-talking hint**: if audio input is detected while muted, show a brief "You're muted" nudge (optional but recommended).

## 12.5 Interaction with the rest of the app

- Clicking the channel name in the widget navigates to `/rooms/:roomId/channels/:channelId` for that voice channel.
- When the user is already viewing the voice channel, the widget may collapse into the channel's own control bar (avoid duplicate controls) — or remain as the minimized pill; pick one behavior and keep it consistent.
- The widget coexists with DMs: being in a Room call must not block DM usage.
- Incoming DM notifications still appear while the widget is visible; the widget must not swallow clicks outside its bounds.

## 12.6 Mobile behavior

On mobile the widget is **not freely draggable**. Instead:

- It docks as a compact bar above the bottom navigation/composer (respecting safe-area insets).
- Tapping it expands into a **bottom sheet** with the full tile grid and controls.
- Swiping down dismisses the sheet back to the bar.
- It must respect the on-screen keyboard (hide/dock above it) and orientation changes.

## 12.7 Accessibility

- Fully keyboard operable: focusable drag handle with arrow-key repositioning, all controls reachable by Tab.
- Screen reader announces: call joined/left, participant joined/left, mute/deafen/camera/screen-share state changes (via a polite live region).
- Shortcuts: `Ctrl/Cmd + Shift + M` (mute), `Ctrl/Cmd + Shift + D` (deafen) — document them in the tooltip and settings.
- Respect reduced-motion: disable widget entry/exit animations when `prefers-reduced-motion` is set.

## 12.8 Performance

- The widget must not cause rerenders of the underlying page; isolate it with its own state subscription (e.g. a dedicated call store slice).
- Pause/decimate remote video rendering in the minimized state (audio continues); resume full rendering when expanded.
- Limit tile video resolution/framerate in the widget vs. the full call view.
- Throttle speaking-indicator updates (e.g. 100–200 ms).

## 12.9 Phase 8 completion criteria

- A user can join a call, navigate anywhere in the app (including DMs and other Rooms), and continue the call with full control from the widget.
- The widget is draggable, clamped to the viewport, and remembers its position.
- Minimized, expanded, and screen-share focus states all work on desktop and mobile.
- Leaving the call from the widget tears down media cleanly and removes the widget.
- No duplicate control surfaces when viewing the voice channel directly.
- E2E test: User A joins a voice channel, navigates to DMs, User B joins and speaks — A hears B and sees speaking indication in the widget.

---

# 13. PHASE 9 — POLISH + UX

Audit the entire Room experience.

## 13.1 Interaction polish

Add appropriate: hover feedback, active states, focus rings, keyboard shortcuts, context menus, tooltips, confirmation dialogs, toast notifications, skeleton loading, empty states.

Animations should be subtle. Use transitions primarily for drawer opening, menu opening, sidebar changes, hover/focus, modal transitions, and the call widget expand/collapse. Do not animate every message.

## 13.2 Empty states

No channels:

```text
No channels yet

Create your first channel to start organizing
conversations in this Room.

[ Create Channel ]
```

Empty channel:

```text
Welcome to #general

This is the beginning of this channel.

Start the conversation.
```

Empty voice channel:

```text
🔊 Hangout

No one's here yet. Join to start the call.

[ Join Voice Channel ]
```

No members: use an appropriate invitation CTA.

## 13.3 Error states

Handle: failed message send, failed channel/category creation, permission denied, network disconnect, Room unavailable, deleted channel, deleted Room, **mic/camera permission denied, screen-share cancelled, call join failed, media device unavailable**.

Do not expose raw backend errors to users. Log useful technical details separately.

## 13.4 Offline/reconnect behavior

If real-time connectivity is lost, show a subtle `Reconnecting…` indicator. Do not block the entire application. When connection returns: resynchronize channel state, reconcile unread counts and messages, avoid duplicate messages, and reconcile call/widget state.

---

# 14. PHASE 10 — PERFORMANCE

Requirements:

- Avoid unnecessary React/component rerenders.
- Do not fetch all Room messages at once; use cursor pagination/infinite scrolling.
- Virtualize very large member lists if necessary.
- Lazy-load heavy UI (including the media stack — do not load WebRTC/SFU SDK code until a user first joins a call).
- Avoid repeatedly fetching the entire Room structure; cache stable Room/channel metadata.
- Use optimistic updates for reorder operations where safe.
- Debounce search inputs.
- Avoid unnecessary WebSocket subscriptions.
- Keep the floating call widget isolated from page rerenders (see 12.8).

Measure before optimizing. Do not add complexity without evidence.

---

# 15. PHASE 11 — ACCESSIBILITY

- Keyboard navigable channel list
- Visible focus states
- Proper buttons instead of clickable divs
- ARIA labels where necessary
- Dialog focus management; Escape closes dialogs/drawers
- Screen-reader-friendly channel names
- Accessible drag/drop alternative (including the call widget repositioning)
- Sufficient contrast
- Reduced-motion support
- Call widget keyboard shortcuts and live-region announcements (see 12.7)

The application should remain usable without a mouse.

---

# 16. PHASE 12 — TESTING

## Backend

Test: Room authorization, category CRUD, channel CRUD, channel/category ordering, message migration, permission enforcement, member management, duplicate channel prevention, deleted channel behavior, **voice join token issuance, voice permission enforcement (CONNECT/SPEAK/VIDEO/SCREENSHARE), call session lifecycle, stale participant reaping**.

## Frontend

Test: Room loading, channel switching, message loading/sending, channel/category creation, permission-based UI, mobile navigation, error states, empty states, **call widget rendering in all three states, widget drag/clamp behavior, widget persistence across route changes, control toggle state sync**.

## End-to-end

At minimum:

```text
Create Room
↓
Create Category
↓
Create Channel
↓
Open Channel
↓
Send Message
↓
Second user receives message
↓
Create another channel
↓
Switch channels
↓
Message history remains correct
```

And for calling:

```text
Create Voice Channel
↓
User A joins
↓
User B joins
↓
A and B hear each other
↓
A enables camera → B sees video
↓
A starts screen share → B sees share
↓
A navigates to DMs → floating widget remains, call continues
↓
A mutes from the widget → B sees A muted
↓
A disconnects from the widget → widget disappears, sidebar presence updates
```

---

# 17. DATABASE SAFETY

Before any migration:

1. Inspect current schema.
2. Create migration.
3. Verify migration on a copy/test database.
4. Ensure existing Rooms remain intact.
5. Ensure existing messages remain intact.
6. Ensure migration is idempotent where possible.
7. Do not drop production data.
8. Document rollback considerations.

---

# 18. FRONTEND ARCHITECTURE

Keep the frontend modular. Prefer a structure conceptually similar to:

```text
rooms/
├── components/
│   ├── RoomLayout
│   ├── RoomSidebar
│   ├── RoomHeader
│   ├── CategorySection
│   ├── ChannelItem
│   ├── ChannelHeader
│   ├── ChannelMessageList
│   ├── MessageComposer
│   ├── MemberSidebar
│   ├── RoomSettings
│   └── ...
│
├── calls/
│   ├── components/
│   │   ├── CallView            (full in-channel call UI)
│   │   ├── CallTile            (shared video/avatar tile)
│   │   ├── FloatingCallWidget  (draggable persistent widget)
│   │   ├── CallControls        (shared control bar)
│   │   └── DeviceSettings
│   ├── hooks/
│   │   ├── useCallSession
│   │   ├── useMediaDevices
│   │   ├── useScreenShare
│   │   └── useCallParticipants
│   └── store/                  (isolated call state slice)
│
├── hooks/
│   ├── useRoom
│   ├── useChannels
│   ├── useMessages
│   ├── useRoomMembers
│   └── ...
│
├── api/
│   ├── rooms
│   ├── categories
│   ├── channels
│   └── messages
│
└── types/
    └── ...
```

Adapt this to the project's actual architecture instead of blindly creating this exact structure. Avoid giant components — a Room page should not become a 1,500-line component, and the call widget should not become one either.

---

# 19. ROUTING

Prefer channel-specific URLs:

```text
/rooms/:roomId/channels/:channelId
```

This provides deep linking, browser history, refresh persistence, shareable channel links, and better navigation. If the application already uses a different routing convention, adapt it consistently.

Note: voice channel URLs are shareable too — opening one deep-links to the channel view (with a join prompt), but joining a call must always be an explicit user action, never automatic on page load.

---

# 20. SECURITY

Do not trust: Room ID, Channel ID, Role ID, or permission checks from the frontend.

Every mutation must validate:

```text
authenticated user
+
Room membership
+
role/permission
+
resource ownership where applicable
```

Protect against:

- unauthorized channel access
- unauthorized message posting
- unauthorized channel deletion
- privilege escalation
- accessing private channels
- manipulating another Room's resources
- **joining voice channels without CONNECT_VOICE**
- **eavesdropping: media join tokens must be short-lived, scoped to one channel session, and revoked on leave/kick**
- **screen-share privacy: always show the sharing indicator; never auto-start camera or screen share**

---

# 21. FINAL UI TARGET

Desktop:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Room Name ▼                                  Search   Members  ⋯     │
├─────────────────────┬────────────────────────────────┬───────────────┤
│ ROOM                │ # general                      │ MEMBERS       │
│                     │ General discussion             │               │
│ ─────────────────   │────────────────────────────────│ OWNER         │
│ INFORMATION         │                                │   Talib       │
│ # announcements     │ User                           │               │
│ # rules             │ Message content                │ ADMINS        │
│                     │                                │   User        │
│ COMMUNITY           │ User                           │               │
│ # general           │ Another message                │ MEMBERS       │
│ # random            │                                │   User        │
│                     │                                │   User        │
│ VOICE LOUNGE        │                                │               │
│ 🔊 Hangout   ● 3    │                                │               │
│ 🔊 Focus Room       │                                │               │
│                     │────────────────────────────────│               │
│                     │ Message #general...            │               │
└─────────────────────┴────────────────────────────────┴───────────────┘

                                    ┌──────────────────────────────┐
                                    │ 🟢 Hangout · Room A   12:43  │  ← floating
                                    │ 🎤  🎧  📷  🖥  ⤢  📞        │    call widget
                                    └──────────────────────────────┘    (draggable)
```

Mobile:

```text
┌─────────────────────────────┐
│ ☰   # general          ⋯   │
├─────────────────────────────┤
│                             │
│ Messages                    │
│                             │
│                             │
├─────────────────────────────┤
│ 🟢 Hangout  🎤 🎧 📞   12:43│  ← docked call bar
├─────────────────────────────┤
│ Message #general...      ➤ │
└─────────────────────────────┘
```

---

# 22. PRODUCT PRINCIPLES

1. **Rooms are communities, not group chats.**
2. **Channels are the primary conversation unit.**
3. **Categories organize channels.**
4. **DMs remain separate.**
5. **Permissions belong primarily on the backend.**
6. **The UI should be dense enough to be useful but not cluttered.**
7. **Mobile gets a dedicated interaction model.**
8. **Existing functionality must not regress.**
9. **Production polish is part of implementation, not a final cosmetic pass.**
10. **Do not blindly copy Discord.** Use Discord's information architecture as inspiration, but make the interface consistent with the application's existing design language.
11. **Calls follow the user.** Being in a call must never trap the user on one screen — the floating widget is a first-class feature, not an afterthought.
12. **Privacy is non-negotiable.** Camera and screen share are always explicit, always indicated, and always stoppable in one click.

---

# 23. EXECUTION ORDER

Implement exactly in this order:

```text
Phase 1   Architecture + database + migration
        ↓
Phase 2   Room frontend shell
        ↓
Phase 3   Channel/category management
        ↓
Phase 4   Roles + members
        ↓
Phase 5   Room settings
        ↓
Phase 6   Unread + notifications + realtime
        ↓
Phase 7   Voice channels + calls (voice/video/screen share)
        ↓
Phase 8   Floating call widget
        ↓
Phase 9   UX polish
        ↓
Phase 10  Performance
        ↓
Phase 11  Accessibility
        ↓
Phase 12  Testing + regression audit
```

After completing each phase:

1. Run the relevant tests.
2. Run type checking.
3. Run linting.
4. Build the application.
5. Inspect the UI manually.
6. Fix regressions before moving forward.
7. Summarize what changed.
8. Identify any technical debt introduced.
9. Do not start the next phase until the current phase is stable.

---

# IMPORTANT

Do not treat this as a simple UI redesign.

This is an architectural evolution of the Room system — from flat group chats into a community platform with structured channels **and persistent, follow-you-anywhere voice/video/screen-share calling**. The final result should feel like a production-quality community/workspace platform, not a WhatsApp group with a sidebar, and not a chat app with a video call duct-taped to it.
