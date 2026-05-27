import { Router } from 'express';
import { connectTikTok, getTikTokStatus, disconnectTikTok, getRecentVideos, toggleMonitorVideo, getVideoComments, getTikTokUsage, getTikTokStats } from '../controllers/tiktok.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.post('/connect', connectTikTok);
router.get('/me', getTikTokStatus);
router.post('/disconnect', disconnectTikTok);
router.get('/videos', getRecentVideos);
router.post('/monitor', toggleMonitorVideo);
router.get('/comments', getVideoComments);
router.get('/usage', getTikTokUsage);
router.get('/stats', getTikTokStats);

export default router;
