import "./lib/env";
import express from "express";
import { connectRedis, disconnectRedis } from "./lib/redis";
import { prisma } from "../db/prisma";
import http from "http";
import { createIO } from "./create.io";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { getAllowedOrigins } from "./lib/cors";
import {
  sessionMiddleware,
  csrfProtection,
  getCsrfToken,
} from "./middleware/session";
import authRoutes from "./routes/auth";
import dmRoutes from "./routes/direct-chat";
import room from "./routes/room/room";
import searchUser from "./routes/searchUser";
import attachmentRoutes from "./routes/attachments";
import { errorHandler } from "./middleware/error-handler";

const app = express();

// Trust the first proxy (nginx, load balancer, etc.) so that
// req.protocol and req.secure reflect the original X-Forwarded-* headers.
// Without this, secure cookies won't work behind a reverse proxy.
app.set("trust proxy", 1);

const httpServer = http.createServer(app);
const io = createIO(httpServer);
app.use(helmet());
app.use(express.json({ limit: "100kb" }));

app.use(
  cors({
    origin: getAllowedOrigins(),
    credentials: true,
  }),
);

app.use(sessionMiddleware);
io.use((socket, next) => {
  sessionMiddleware(socket.request as any, {} as any, (err: any) => {
    if (err) {
      return next(err);
    }
    next();
  });
});

// cookie-parser after express-session (session parses its own cookies)
app.use(cookieParser());

// CSRF token endpoint — runs before csrfProtection so it's excluded
app.get("/api/csrf-token", (req, res) => {
  const token = getCsrfToken(req, res);
  res.json({ csrfToken: token });
});

app.use(csrfProtection);

app.use((req, _res, next) => {
  req.io = io;
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/dm", dmRoutes);
app.use("/api/room", room);
app.use("/api/attachments", attachmentRoutes);
app.use("/api/search", searchUser);
// Error handler must be mounted after all routes so it can catch
// exceptions thrown by any preceding middleware or route handler.
app.use(errorHandler);

async function main() {
  await connectRedis();
  const sat2 = await prisma.$queryRaw`SELECT 1`;
  if (sat2) {
    console.log("postgres/prisma db connected");
  }
  app.get("/", (req, res) => {
    res.send("Chathub server running");
  });
  const Port = Number(3100);
  httpServer.listen(Port, () => {
    console.log(`web socket server running on ${Port}`);
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n${signal} received, shutting down gracefully...`);

  // Stop accepting new connections.
  httpServer.close(async () => {
    console.log("HTTP server closed");

    // Disconnect from Redis.
    await disconnectRedis();

    // Disconnect from PostgreSQL.
    await prisma.$disconnect();

    console.log("Shutdown complete");
    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown hangs.
  setTimeout(() => {
    console.error("Shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  console.error("server failed to start : ", err);
  process.exit(1);
});
