import "./lib/env";
import express from "express";
import { connectRedis, disconnectRedis } from "./lib/redis";
import { prisma } from "../db/prisma";
import http from "http";
import { createIO } from "./create.io";
import cors from "cors";
import { sessionMiddleware } from "./middleware/session";
import authRoutes from "./routes/auth";
import dmRoutes from "./routes/direct-chat";
import room from "./routes/room/room";
import searchUser from "./routes/searchUser";
import attachmentRoutes from "./routes/attachments";
import { errorHandler } from "./middleware/error-handler";
import { createLogger } from "./lib/logger";

const log = createLogger("server");

const app = express();

// Trust the first proxy (nginx, load balancer, etc.) so that
// req.protocol and req.secure reflect the original X-Forwarded-* headers.
// Without this, secure cookies won't work behind a reverse proxy.
app.set("trust proxy", 1);

const httpServer = http.createServer(app);
const io = createIO(httpServer);
app.use(express.json());

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
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
    log.info("postgres/prisma db connected");
  }
  app.get("/", (req, res) => {
    res.send("Chathub server running");
  });
  const Port = Number(3100);
  httpServer.listen(Port, () => {
    log.info(`web socket server running on ${Port}`);
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log.info(`${signal} received, shutting down gracefully...`);

  // Stop accepting new connections. Failures while releasing resources are
  // logged and produce a non-zero exit code instead of an unhandled rejection.
  httpServer.close(async (closeErr) => {
    let exitCode = 0;

    if (closeErr) {
      log.error("HTTP server close failed", closeErr);
      exitCode = 1;
    } else {
      log.info("HTTP server closed");
    }

    try {
      await disconnectRedis();
    } catch (err) {
      log.error("Redis disconnect failed during shutdown", err);
      exitCode = 1;
    }

    try {
      await prisma.$disconnect();
    } catch (err) {
      log.error("Prisma disconnect failed during shutdown", err);
      exitCode = 1;
    }

    log.info("Shutdown complete");
    process.exit(exitCode);
  });

  // Force exit after 10 seconds if graceful shutdown hangs.
  setTimeout(() => {
    log.error("Shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  log.error("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (err) => {
  log.error("Uncaught exception, shutting down", err);
  void shutdown("uncaughtException");
});

main().catch((err) => {
  log.error("server failed to start", err);
  process.exit(1);
});
