import express from "express";

import signupRouter from "./auth/signup";
import loginRouter from "./auth/login";
import logoutRouter from "./auth/logout";
import meRouter from "./auth/me";
import checkUsernameRouter from "./auth/checkUsername";
import updateMeRouter from "./auth/updateMe";
import forgotPasswordRouter from "./auth/forgotPassword";
import recoveryCodesRouter from "./auth/recoveryCodes";
import recoveryShowRouter from "./auth/recoveryShow";
import updateAvatarRouter from "./auth/updateAvatar";
import updateStatusRouter from "./auth/updateStatus";
import updatePrivacyRouter from "./auth/updatePrivacy";

const router = express.Router();

router.use(signupRouter);
router.use(loginRouter);
router.use(logoutRouter);
router.use(meRouter);
router.use(checkUsernameRouter);
router.use(updateMeRouter);
router.use(forgotPasswordRouter);
router.use(recoveryCodesRouter);
router.use(recoveryShowRouter);
router.use(updateAvatarRouter);
router.use(updateStatusRouter);
router.use(updatePrivacyRouter);

export default router;
