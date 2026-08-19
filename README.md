# ChatHubby

A modern real-time chat application built with Next.js, Socket.IO, Express, and Prisma.

## Features

- User authentication with Argon2id password hashing and session cookies
- Real-time messaging over Socket.IO (chat rooms + direct messages) with typing indicators and read receipts
- Room management (create, join requests, invitations, shareable links with usage limits/expiry)
- Profile customization (optional bio, gender, date of birth) and custom avatar uploads via S3 presigned URLs
- File attachments with presigned S3 uploads and per-message authorization
- Password recovery via single-use recovery codes
- Redis-backed rate limiting with atomic Lua scripts
- Responsive web interface with Tailwind CSS 4 and a dark/light theme
- Monorepo architecture with Turborepo and pnpm workspaces
- Type-safe development with TypeScript + shared Zod validation

## Architecture

```
ChatHubby/
├── apps/
│   ├── web/                  # Next.js 16 frontend (Port 3000)
│   └── server/               # Express 5 + Socket.IO API (Port 3100)
├── packages/
│   ├── ui/                   # Shared React components
│   ├── validators/           # Shared Zod schemas
│   ├── eslint-config/        # ESLint configurations
│   └── typescript-config/    # TypeScript configurations
└── apps/server/db/           # Prisma schema and migrations
```

The API and Socket.IO server run on the same HTTP server (port 3100); the web app talks to it over `/api` and `socket.io`.

## Quick Start

```bash
# Install dependencies (Node.js >= 20.9.0, pnpm 10)
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your database URL, Redis URL, session/CSRF secrets

# Run migrations and generate the Prisma client
pnpm --filter @repo/server prisma migrate dev
pnpm --filter @repo/server prisma generate

# Start development (web on :3000, server on :3100)
pnpm dev
```

## Environment Variables

```env
# Server
DATABASE_URL="postgresql://username:password@localhost:5432/chathub"
REDIS_URL="redis://localhost:6379"
SESSION_SECRET="change-me-in-production"
# CSRF signing secret — must be at least 32 characters and distinct from SESSION_SECRET.
CSRF_SECRET="change-me-to-a-random-32-plus-character-string"
NODE_ENV="development"
# Comma-separated list of browser origins allowed to call the API and Socket.IO.
# Required in production; defaults to the local dev origins otherwise.
CORS_ORIGINS="http://localhost:5173,http://localhost:3000"

# Web (Next.js)
NEXT_PUBLIC_API_URL="http://localhost:3100/api"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3100"
API_URL="http://localhost:3100/api"
```

S3 (for attachments and custom avatar uploads) is configured via `AWS_REGION`, `AWS_S3_BUCKET_NAME`, and the standard AWS credential environment variables. Text-only messaging works without S3; uploads return a clear 503 when it is not configured.

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, socket.io-client
- **Backend**: Express 5, Socket.IO, Prisma, PostgreSQL, Redis, AWS SDK v3 (S3)
- **Auth**: Argon2id, express-session with a Redis store (connect-redis), CSRF protection (tiny-csrf)
- **Validation**: Zod (shared schemas in `@repo/validators`)
- **Rate Limiting**: Redis-backed with atomic Lua scripts
- **Build**: Turborepo, pnpm workspaces
- **Tests**: Vitest (server + web), supertest

## API

All endpoints are prefixed with `/api`. Session-authenticated routes return `401` when signed out.

### Auth

| Method | Endpoint                             | Description                                             |
| ------ | ------------------------------------ | ------------------------------------------------------- |
| POST   | `/api/auth/signup`                   | Create account (returns a one-time recovery-code token) |
| POST   | `/api/auth/login`                    | Login with email or username + password                 |
| POST   | `/api/auth/logout`                   | Destroy the session                                     |
| GET    | `/api/auth/me`                       | Get the current user                                    |
| GET    | `/api/auth/check-username?username=` | Username availability (public, rate-limited)            |
| PATCH  | `/api/auth/me`                       | Update profile fields or change password                |
| PATCH  | `/api/auth/me/avatar`                | Set user avatar (default or uploaded key)               |
| POST   | `/api/auth/forgot-password`          | Reset password using a recovery code                    |
| POST   | `/api/auth/recovery-codes`           | Regenerate recovery codes                               |
| POST   | `/api/auth/recovery-codes/show`      | Reveal codes from a one-time token                      |
| GET    | `/api/csrf-token`                    | CSRF token (public, exempt from CSRF checks)            |

### Direct Messages

| Method | Endpoint                             | Description                          |
| ------ | ------------------------------------ | ------------------------------------ |
| POST   | `/api/dm/start-dm/:userId`           | Get-or-create a direct chat          |
| GET    | `/api/dm/inbox`                      | List direct chats (cursor paginated) |
| GET    | `/api/dm/:directChatId/messages`     | Message history (cursor paginated)   |
| POST   | `/api/dm/:directChatId/message`      | Send a message                       |
| PATCH  | `/api/dm/message/:messageId`         | Edit a message                       |
| DELETE | `/api/dm/message/:messageId`         | Soft-delete a message                |
| POST   | `/api/dm/:directChatId/mark-read`    | Mark conversation as read            |
| GET    | `/api/dm/:directChatId/read-receipt` | Peer's read cursor                   |

### Rooms

| Method | Endpoint                                     | Description                             |
| ------ | -------------------------------------------- | --------------------------------------- |
| POST   | `/api/room/rooms`                            | Create a chat room                      |
| GET    | `/api/room/rooms`                            | List user's rooms (cursor paginated)    |
| GET    | `/api/room/:chatRoomId/messages`             | Room message history (cursor paginated) |
| GET    | `/api/room/:chatRoomId/members`              | List room members                       |
| PATCH  | `/api/room/:roomId/members/:userId/role`     | Assign a member's role (OWNER)          |
| POST   | `/api/room/:roomId/members/:userId/kick`     | Remove a member (OWNER/ADMIN)           |
| POST   | `/api/room/:roomId/members/:userId/ban`      | Ban a member (OWNER/ADMIN)              |
| DELETE | `/api/room/:roomId/members/:userId/ban`      | Lift a ban                              |
| POST   | `/api/room/:roomId/members/:userId/mute`     | Timed mute (1–43200 min)                |
| DELETE | `/api/room/:roomId/members/:userId/mute`     | Unmute                                  |
| PATCH  | `/api/room/:roomId/members/:userId/nickname` | Set/clear per-room nickname             |
| GET    | `/api/room/:roomId/bans`                     | List room bans                          |
| POST   | `/api/room/:chatRoomId/mark-read`            | Mark room as read                       |
| GET    | `/api/room/:chatRoomId/read-receipts`        | All members' read cursors               |
| PATCH  | `/api/room/:chatRoomId/avatar`               | Set room avatar (OWNER/ADMIN)           |
| POST   | `/api/room/:roomId/invitations`              | Invite a user (OWNER/ADMIN)             |
| GET    | `/api/room/invitation/sent`                  | Invitations I sent                      |
| GET    | `/api/room/invitation/received`              | Invitations I received                  |
| PATCH  | `/api/room/invitations/:invitationId`        | Accept or reject an invitation          |
| POST   | `/api/room/:roomId/join-request`             | Request to join a room                  |
| GET    | `/api/room/:roomId/join-requests`            | List join requests (OWNER/ADMIN)        |
| PATCH  | `/api/room/:roomId/join-requests/:requestId` | Approve/reject a join request           |
| POST   | `/api/room/:roomId/join-links`               | Create a shareable link (OWNER/ADMIN)   |
| PATCH  | `/api/room/:roomId/join-links/:linkId`       | Deactivate a join link                  |
| GET    | `/api/room/join-links/mine`                  | My join links                           |
| GET    | `/api/room/join/:token`                      | Preview a join link                     |
| POST   | `/api/room/join/:token`                      | Join a room via link                    |

### Attachments, Avatars & Misc

| Method | Endpoint                                  | Description                              |
| ------ | ----------------------------------------- | ---------------------------------------- |
| POST   | `/api/attachments/presign`                | Presigned PUT URL for a file upload      |
| GET    | `/api/attachments/:attachmentId`          | Download URL for an attachment           |
| DELETE | `/api/attachments/:attachmentId`          | Delete an attachment                     |
| POST   | `/api/avatars/presign`                    | Presigned PUT URL for a user/room avatar |
| GET    | `/api/avatars?key=`                       | Stream an avatar image                   |
| GET    | `/api/defaults/avatars?source=user\|room` | List default avatars                     |
| GET    | `/api/search/users/search?query=`         | Search users by username prefix          |
| GET    | `/api/search/users/:id`                   | Get a user profile                       |
| GET    | `/api/health`                             | Server and S3 health                     |

## Socket Events

All events are namespaced under the root `/socket.io` connection and require an authenticated session.

### Client → Server

| Event                     | Payload                              | Description                           |
| ------------------------- | ------------------------------------ | ------------------------------------- |
| `chatroom:join`           | `{ chatRoomId }`                     | Join a room                           |
| `chatroom:leave`          | `{ chatRoomId }`                     | Leave a room                          |
| `chatroom:typing`         | `{ chatRoomId, isTyping }`           | Typing indicator                      |
| `chatroom:message`        | `{ payload, ack }`                   | Send a room message (acks the result) |
| `chatroom:message:edit`   | `{ chatRoomId, messageId, content }` | Edit a room message                   |
| `chatroom:message:delete` | `{ chatRoomId, messageId }`          | Delete a room message                 |
| `directChat:join`         | `{ directChatId }`                   | Join a direct chat                    |
| `directChat:leave`        | `{ directChatId }`                   | Leave a direct chat                   |
| `directChat:typing`       | `{ directChatId, isTyping }`         | Typing indicator                      |

### Server → Client

| Event                                                                       | Description                                    |
| --------------------------------------------------------------------------- | ---------------------------------------------- |
| `chatroom:joined` / `chatroom:left`                                         | Room join/leave confirmation                   |
| `chatroom:error`                                                            | `{ code, message }` error response             |
| `chatroom:message` / `chatroom:message:edited` / `chatroom:message:deleted` | Room message lifecycle                         |
| `chatroom:typing`                                                           | `{ userId, username, chatRoomId, isTyping }`   |
| `chatroom:read` / `chatroom:readReceipt`                                    | Unread count and per-user read cursor          |
| `directChat:joined` / `directChat:left`                                     | Direct chat join/leave confirmation            |
| `directChat:error`                                                          | `{ code, message }` error response             |
| `directChat:typing`                                                         | `{ userId, username, directChatId, isTyping }` |
| `directChat:read` / `directChat:readReceipt`                                | Unread count and per-user read cursor          |
| `message:new` / `message:edited` / `message:deleted`                        | Direct message lifecycle                       |
| `inbox:update`                                                              | `{ directChatId }` — DM inbox changed          |

## Security Features

- **CSRF protection**: tiny-csrf with a dedicated 32+ character `CSRF_SECRET`; the web client fetches a token and attaches it to every state-changing request
- **Session fixation prevention**: Session regenerated on login/signup
- **Timing attack resistance**: Constant-time password verification with a dummy Argon2 hash for unknown accounts
- **Rate limiting**: Redis-backed, IP + identifier keys, atomic Lua scripts
- **Input validation**: Zod schemas for every request body and query
- **Authorization**: Typed `ApiError` codes (403, 404) and OWNER/ADMIN gating for room management
- **Token hashing**: Join link tokens hashed with SHA-256 before storage
- **Recovery codes**: Stored as hashes, revealed exactly once via a single-use token (never in response bodies)
- **Race condition prevention**: Prisma transactions and conditional `updateMany` for join links, invitations, and requests
- **No information leakage**: Uniform error responses for auth failures

## Database Schema

Key models: `User`, `Session`, `ChatRoom`, `ChatRoomMember`, `RoomBan`, `Message`, `Attachment`, `DirectChat`, `RoomInvitation`, `RoomJoinRequest`, `RoomJoinLink`, `RecoveryCode`, `DirectChatReadReceipt`, `ChatRoomReadReceipt`

See `apps/server/db/schema.prisma` for the full schema.

## Development

```bash
# Type check
pnpm check-types

# Lint
pnpm lint

# Test
pnpm test

# Format
pnpm format

# Build
pnpm build
```

## License

MIT
