import { Router } from "express";
import chatsRouter from "./chats";
import messagesRouter from "./messages";

const router = Router();

router.use(chatsRouter);
router.use(messagesRouter);

export default router;
