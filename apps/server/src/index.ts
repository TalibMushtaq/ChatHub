import "./lib/env";
import express from "express";
import { connectRedis, disconnectRedis } from "./lib/redis";
import { prisma } from "../db/prisma";
import type { Request, Response } from "express";
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
  csrfSecret,
} from "./middleware/session";
import authRoutes from "./routes/auth";
import dmRoutes from "./routes/direct-chat";
import room from "./routes/room/room";
import searchUser from "./routes/searchUser";
import friendsRoutes from "./routes/friends";
import userBlockRoutes from "./routes/users";
import attachmentRoutes from "./routes/attachments";
import defaultsRouter from "./routes/defaults";
import avatarRoutes from "./routes/avatars";
import pushRoutes from "./routes/push";
import healthRoute from "./routes/health";
import { errorHandler } from "./middleware/error-handler";
import { createLogger } from "./lib/logger";
import { testS3Connection } from "./lib/s3HealthCheck";

const log = createLogger("server");

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
  sessionMiddleware(
    socket.request as unknown as Request,
    {} as unknown as Response,
    (err?: unknown) => {
      if (err) {
        return next(err as Error);
      }
      next();
    },
  );
});

// cookie-parser after express-session (session parses its own cookies).
// The CSRF secret doubles as the signing secret so tiny-csrf's `signed: true`
// cookie (and Express res.cookie signed writes) resolve instead of throwing.
app.use(cookieParser(csrfSecret));

// csrfProtection must run BEFORE the token route: tiny-csrf defines
// req.csrfToken() when it sees the excluded URL, and the route needs it.
app.use(csrfProtection);

// CSRF token endpoint — excluded from token checks, but requires the
// middleware above to have set req.csrfToken.
app.get("/api/csrf-token", (req, res) => {
  const token = getCsrfToken(req);
  res.json({ csrfToken: token });
});

app.use((req, _res, next) => {
  req.io = io;
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/dm", dmRoutes);
app.use("/api/room", room);
app.use("/api/attachments", attachmentRoutes);
app.use("/api/defaults", defaultsRouter);
app.use("/api/avatars", avatarRoutes);
app.use("/api/search", searchUser);
app.use("/api/friends", friendsRoutes);
app.use("/api/users", userBlockRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/health", healthRoute);
// Error handler must be mounted after all routes so it can catch
// exceptions thrown by any preceding middleware or route handler.
app.use(errorHandler);

async function main() {
  await connectRedis();
  const sat2 = await prisma.$queryRaw`SELECT 1`;
  if (sat2) {
    log.info("postgres/prisma db connected");
    // Run a lightweight S3 connectivity test at startup
    await testS3Connection();
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
