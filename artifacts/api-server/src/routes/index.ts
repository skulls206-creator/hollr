import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import storageRouter from "./storage";
import usersRouter from "./users";
import serversRouter from "./servers";
import channelsRouter from "./channels";
import messagesRouter from "./messages";
import dmsRouter from "./dms";
import musicRouter from "./music";
import pushRouter from "./push";
import khurkAppsRouter from "./khurk-apps";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(usersRouter);
router.use(serversRouter);
router.use(channelsRouter);
router.use(messagesRouter);
router.use(dmsRouter);
router.use(musicRouter);
router.use(pushRouter);
router.use(khurkAppsRouter);

export default router;
