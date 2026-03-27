import dotenv from "dotenv";

dotenv.config();

import app from './app.js';
import bot from './bot.js';

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 AddisLead Server running on port ${PORT}`);

    // Launch Telegram Bot
    bot.launch()
        .then(() => console.log('🤖 Telegram Lead Capture Bot started successfully.'))
        .catch((err) => console.error('❌ Failed to start Telegram Bot:', err));
});