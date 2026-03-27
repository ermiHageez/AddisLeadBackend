import { Router } from 'express';
import {
    generateAIContent,
    getAIHistory,
    getMarketResearch,
    getLeadAnalysis
} from '../controllers/ai.controller.js';
import { getAiUsage } from '../controllers/subscriptionController.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { checkSubscription } from '../middleware/subscription.middleware.js';
import rateLimit from 'express-rate-limit';

const router = Router();

const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many AI requests, please try again later' },
});

router.use(authenticate);

// Standard Routes
router.post('/generate', aiLimiter, generateAIContent);
router.get('/history', getAIHistory);
router.get('/usage', getAiUsage);

// --- Premium Features ---
// Market Research: Accessible by PRO and AGENCY
router.get('/research', checkSubscription(['PRO', 'AGENCY']), getMarketResearch);

// Advanced Analysis: Accessible by PRO and AGENCY only
// Analyzes Activity Timeline and DB records for a specific lead
router.get('/analysis/:leadId', checkSubscription(['PRO', 'AGENCY']), getLeadAnalysis);

export default router;
