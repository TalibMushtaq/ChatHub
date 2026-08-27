import { Router } from "express";
import chatsRouter from "./chats";
import messagesRouter from "./messages";
import callRouter from "./call";

const router = Router();

router.use(chatsRouter);
router.use(messagesRouter);
router.use(callRouter);

export default router;
