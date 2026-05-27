import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scanRouter from "./scan";
import vocabularyRouter from "./vocabulary";
import openaiConversationsRouter from "./openai/conversations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scanRouter);
router.use(vocabularyRouter);
router.use(openaiConversationsRouter);

export default router;
