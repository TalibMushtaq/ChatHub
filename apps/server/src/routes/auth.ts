import express from "express";

import signupRouter from "./auth/signup";
import loginRouter from "./auth/login";
import logoutRouter from "./auth/logout";
import meRouter from "./auth/me";
import forgotPasswordRouter from "./auth/forgotPassword";
import recoveryCodesRouter from "./auth/recoveryCodes";

const router = express.Router();

router.use(signupRouter);
router.use(loginRouter);
router.use(logoutRouter);
router.use(meRouter);
router.use(forgotPasswordRouter);
router.use(recoveryCodesRouter);

export default router;
