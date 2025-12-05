# 💬 ChatHub

A modern real-time chat application built with Next.js, Socket.io, and Prisma. ChatHub provides a seamless messaging experience with a clean, responsive interface and robust backend architecture.

## ✨ Features

- 🔒 User authentication and authorization
- 💬 Real-time messaging with Socket.io
- 📱 Responsive web interface
- 🗄️ PostgreSQL database with Prisma ORM
- 🎨 Modern UI components with Tailwind CSS
- 📦 Monorepo architecture with Turborepo
- 🔧 Type-safe development with TypeScript

## 🏗️ Architecture

This project uses a monorepo structure powered by Turborepo and PNPM workspaces:

### Applications

- **`apps/web`** - Next.js frontend application (Port 3000)
- **`apps/ws-server`** - WebSocket server for real-time communication
- **`apps/http-server`** - Express.js HTTP API server

### Packages

- **`packages/database`** - Prisma database client and schema
- **`packages/ui`** - Shared React UI components
- **`packages/cache`** - Caching utilities
- **`packages/eslint-config`** - Shared ESLint configurations
- **`packages/typescript-config`** - Shared TypeScript configurations
- **`packages/tailwind-config`** - Shared Tailwind CSS configuration

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PNPM 9.0.0+
- PostgreSQL database

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd ChatHub
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your database URL and other configurations
   ```

4. **Set up the database**

   ```bash
   pnpm db:migrate
   pnpm db:generate
   ```

5. **Start development servers**
   ```bash
   pnpm dev
   ```

This will start all applications in development mode:

- Web app: http://localhost:3000
- WebSocket server: Configured port
- HTTP server: Configured port

## 📋 Available Scripts

- `pnpm dev` - Start all applications in development mode
- `pnpm build` - Build all applications for production
- `pnpm lint` - Run ESLint across all packages
- `pnpm format` - Format code with Prettier
- `pnpm check-types` - Type check all packages
- `pnpm db:migrate` - Run database migrations
- `pnpm db:generate` - Generate Prisma client

## 🗄️ Database Schema

The application uses PostgreSQL with Prisma ORM. Key models include:

- **User**: User accounts with authentication
  - `id`, `email`, `username`, `passwordHash`
  - `avatar`, `createdAt`, `updatedAt`

## 🛠️ Tech Stack

### Frontend

- **Next.js 16** - React framework with App Router
- **React 19** - UI library
- **Tailwind CSS 4** - Utility-first CSS framework
- **TypeScript** - Type safety

### Backend

- **Express.js** - HTTP server framework
- **Socket.io** - Real-time communication
- **Prisma** - Database ORM
- **PostgreSQL** - Database

### Development Tools

- **Turborepo** - Monorepo build system
- **PNPM** - Fast, efficient package manager
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **TypeScript** - Static type checking

## 📁 Project Structure

```
ChatHub/
├── apps/
│   ├── web/                 # Next.js frontend
│   ├── ws-server/           # Socket.io WebSocket server
│   └── http-server/         # Express.js HTTP API
├── packages/
│   ├── database/            # Prisma schema and client
│   ├── ui/                  # Shared React components
│   ├── cache/               # Caching utilities
│   ├── eslint-config/       # ESLint configurations
│   ├── typescript-config/   # TypeScript configurations
│   └── tailwind-config/     # Tailwind CSS configuration
├── package.json             # Root package.json
├── turbo.json              # Turborepo configuration
└── pnpm-workspace.yaml     # PNPM workspace configuration
```

## 🔧 Development

### Working with Individual Apps

You can develop specific applications using Turborepo filters:

```bash
# Develop only the web app
pnpm turbo dev --filter=web

# Build only the HTTP server
pnpm turbo build --filter=http-server

# Lint only the UI package
pnpm turbo lint --filter=@repo/ui
```

### Database Operations

```bash
# Generate Prisma client after schema changes
pnpm turbo db:generate

# Create and apply new migration
pnpm turbo db:migrate

# Reset database (development only)
pnpm turbo db:reset
```

### Code Quality

The project enforces code quality through:

- **ESLint** for consistent code style
- **TypeScript** for type safety
- **Prettier** for code formatting

Run quality checks:

```bash
# Check types across all packages
pnpm check-types

# Lint all code
pnpm lint

# Format all code
pnpm format
```

## 🌍 Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/chathub"

# Next.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key"

# WebSocket Server
WS_PORT=3001

# HTTP Server
HTTP_PORT=3002
```

## 🚢 Deployment

### Building for Production

```bash
# Build all applications
pnpm build

# Build specific application
pnpm turbo build --filter=web
```

### Docker Support

_(Add Docker configuration if needed)_

```bash
# Build Docker image
docker build -t chathub .

# Run container
docker run -p 3000:3000 chathub
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm turbo test --filter=@repo/ui

# Run tests in watch mode
pnpm test:watch
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Contribution Guidelines

- Follow the existing code style
- Write tests for new features
- Update documentation as needed
- Ensure all CI checks pass

## 📝 API Documentation

### REST API Endpoints

_(Add API documentation once implemented)_

- `GET /api/users` - Get user list
- `POST /api/auth/login` - User authentication
- `POST /api/messages` - Send message

### WebSocket Events

_(Add WebSocket event documentation once implemented)_

- `connection` - User connects
- `message` - Send/receive messages
- `disconnect` - User disconnects

## 🔧 Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Verify PostgreSQL is running
   - Check DATABASE_URL in .env file
   - Run migrations: `pnpm db:migrate`

2. **Port Already in Use**
   - Check for running processes on ports 3000, 3001, 3002
   - Kill processes or change ports in configuration

3. **TypeScript Errors**
   - Run `pnpm check-types` to see detailed errors
   - Ensure all packages are built: `pnpm build`

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Next.js team for the amazing React framework
- Socket.io team for real-time communication tools
- Prisma team for the excellent ORM
- Vercel for Turborepo and deployment platform

## 🔗 Useful Links

- [Turborepo Documentation](https://turborepo.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Socket.io Documentation](https://socket.io/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
