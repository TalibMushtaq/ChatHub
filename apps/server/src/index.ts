import "./lib/env";
import express from "express";
import { connectRedis } from "./lib/redis";
import { prisma } from "../db/prisma";
import http from "http";
import { createIO } from "./create.io";
import cors from "cors";
import { sessionMiddleware } from "./middleware/session";
import authRoutes from "./routes/auth";
import dmRoutes from "./routes/dm";
import room from "./routes/room/room";
import searchUser from "./routes/searchUser";

const app = express();
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
app.use("/api/search", searchUser);

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

main().catch((err) => {
  console.error("server failed to start : ", err);
  process.exit(1);
});
