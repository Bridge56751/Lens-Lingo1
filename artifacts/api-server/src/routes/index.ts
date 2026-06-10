import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scanRouter from "./scan";
import vocabularyRouter from "./vocabulary";
import vocabRouter from "./vocab";
import sentencesRouter from "./sentences";
import openaiConversationsRouter from "./openai/conversations";
import openaiTtsRouter from "./openai/tts";
import accountRouter from "./account";
import revenuecatRouter from "./revenuecat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scanRouter);
router.use(vocabularyRouter);
router.use(vocabRouter);
router.use(sentencesRouter);
router.use(openaiConversationsRouter);
router.use(openaiTtsRouter);
router.use(accountRouter);
router.use(revenuecatRouter);

export default router;
