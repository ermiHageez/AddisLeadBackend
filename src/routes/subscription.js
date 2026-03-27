import { Router } from "express";
import { getCurrentSubscription, upgradeSubscription, getAiUsage } from "../controllers/subscriptionController.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", authenticate, getCurrentSubscription);
router.post("/upgrade", authenticate, upgradeSubscription);

export default router;
