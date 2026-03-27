import { Router } from 'express';
import { getDashboardStats, getInsights, getDashboardLeads } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/stats', getDashboardStats);
router.get('/insights', getInsights);
router.get('/leads', getDashboardLeads);

export default router;
