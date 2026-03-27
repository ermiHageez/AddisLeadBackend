import express from 'express';
import { handleTelegramWebhook, handleTikTokWebhook, pollTikTokLeads } from '../controllers/webhookController.js';

const router = express.Router();

// Telegram Webhook
// POST /api/webhook/telegram
router.post('/telegram', handleTelegramWebhook);

// TikTok Webhook (Placeholder)
// POST /api/webhook/tiktok
router.post('/tiktok', handleTikTokWebhook);

// TikTok Manual Polling (Placeholder)
// GET /api/webhook/tiktok/poll
router.get('/tiktok/poll', pollTikTokLeads);

export default router;
