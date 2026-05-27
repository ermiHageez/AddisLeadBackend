import dotenv from "dotenv";

dotenv.config();

import app from './app.js';
import bot from './bot.js';

const PORT = process.env.PORT || 5000;

/**
 * Robust Bot Startup
 * Retries connection if Telegram server is unreachable (ETIMEDOUT)
 * To fix connection issues:
 * 1. Check internet connectivity
 * 2. Verify TELEGRAM_TOKEN in backend/.env
 * 3. If in a restricted region, use a VPN or custom proxy.
 */
const startBotWithRetry = async (retries = 3, delay = 5000) => {
    try {
        await bot.launch();
        console.log('🤖 Telegram Lead Capture Bot started successfully.');
    } catch (err) {
        console.log(`⚠️ Telegram Bot connection failed: ${err.code || err.message}`);
        
        if (retries > 0) {
            console.log(`🔄 Retrying bot launch in ${delay/1000}s... (${retries} attempts left)`);
            setTimeout(() => startBotWithRetry(retries - 1, delay), delay);
        } else {
            console.error('❌ Final Effort: Telegram Bot failed to start after multiple attempts.');
            console.log('💡 TIP: Check your Internet/VPN. The backend is running fine without the bot.');
        }
    }
};

app.listen(PORT, () => {
    console.log(`🚀 AddisLead Server running on port ${PORT}`);

    // Launch Telegram Bot (Optional & Non-blocking)
    if (process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_TOKEN !== 'your_bot_token_here') {
        startBotWithRetry();
    } else {
        console.log('ℹ️ Telegram Bot skipped: Valid TELEGRAM_TOKEN not provided.');
    }
});