# ChatHubby

A modern real-time chat application built with Next.js, Socket.io, and Prisma.

## Features

- User authentication with Argon2id password hashing
- Real-time messaging with Socket.io (chat rooms + direct messages)
- Room management (create, join requests, invitations, shareable links)
- Responsive web interface with Tailwind CSS
- Monorepo architecture with Turborepo
- Type-safe development with TypeScript + Zod validation

## Architecture

```
ChatHubby/
├── apps/
│   ├── web/                  # Next.js frontend (Port 3000)
│   └── server/               # Express.js + Socket.io server
├── packages/
│   ├── validators/           # Shared Zod schemas
│   ├── eslint-config/        # ESLint configurations
│   └── typescript-config/    # TypeScript configurations
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your database URL, Redis URL, session secret

# Run migrations and generate Prisma client
pnpm db:migrate
pnpm db:generate

# Start development
pnpm dev
```

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/chathub"

# Redis (used for sessions and rate limiting)
REDIS_URL="redis://localhost:6379"

# Session
SESSION_SECRET="your-secret-key"

# Server
PORT=3002

# Comma-separated browser origins allowed to call the API and Socket.IO.
# Required in production; defaults to the local dev origins otherwise.
CORS_ORIGINS="http://localhost:5173,http://localhost:3000"
```

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4
- **Backend**: Express.js, Socket.io, Prisma, PostgreSQL
- **Auth**: Argon2id (argon2id), express-session with Redis store
- **Validation**: Zod (shared schemas in `@repo/validators`)
- **Rate Limiting**: Redis-backed with atomic Lua scripts
- **Build**: Turborepo, PNPM workspaces

## API

### REST Endpoints

| Method | Endpoint                     | Description                 |
| ------ | ---------------------------- | --------------------------- |
| POST   | `/signup`                    | Create account              |
| POST   | `/login`                     | Authenticate                |
| GET    | `/me`                        | Get current user            |
| POST   | `/rooms`                     | Create chat room            |
| GET    | `/rooms`                     | List user's rooms           |
| POST   | `/:roomId/invitations`       | Invite user to room         |
| POST   | `/:roomId/join-request`      | Request to join room        |
| PATCH  | `/:roomId/join-requests/:id` | Approve/reject join request |
| POST   | `/:roomId/join-links`        | Create shareable link       |
| POST   | `/join/:token`               | Join via link               |
| GET    | `/inbox`                     | List direct messages        |

### Socket Events

| Event              | Direction        | Description    |
| ------------------ | ---------------- | -------------- |
| `chatroom:join`    | Client -> Server | Join a room    |
| `chatroom:joined`  | Server -> Client | Confirm join   |
| `chatroom:message` | Client -> Server | Send message   |
| `chatroom:message` | Server -> Client | New message    |
| `chatroom:leave`   | Client -> Server | Leave room     |
| `chatroom:error`   | Server -> Client | Error response |

## Security Features

- **Session fixation prevention**: Session regenerated on login/signup
- **Timing attack resistance**: Constant-time password verification with dummy hash
- **Rate limiting**: Redis-backed, IP+identifier keys, atomic Lua scripts
- **Input validation**: Zod schemas for all request bodies
- **Authorization**: Typed `ForbiddenError` for consistent 403 responses
- **Token hashing**: Join link tokens hashed with SHA-256 before storage
- **Race condition prevention**: Atomic operations for join links, invitations, requests
- **No information leakage**: Uniform error messages for auth failures

## Database Schema

Key models: `User`, `ChatRoom`, `ChatRoomMember`, `Message`, `DirectChat`, `RoomInvitation`, `RoomJoinRequest`, `RoomJoinLink`

See `apps/server/db/schema.prisma` for the full schema.

## Development

```bash
# Type check
pnpm check-types

# Lint
pnpm lint

# Build
pnpm build
```

## License

MIT
