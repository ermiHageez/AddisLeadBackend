import prisma from '../utils/prisma.js';

/**
 * Helper to send messages to a Telegram chat using our bot
 * @param {string} text - Message content
 */
export const sendToTelegram = async (text) => {
    try {
        const token = process.env.TELEGRAM_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        if (!token || !chatId) {
            console.warn('[Telegram] Skipping notification: TELEGRAM_TOKEN or TELEGRAM_CHAT_ID not configured.');
            return;
        }

        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML'
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('[Telegram] Failed to send message:', errorData);
        }
    } catch (err) {
        console.error('[Telegram] Error in sendToTelegram:', err);
    }
};

// POST /api/webhook/telegram
export const handleTelegramWebhook = async (req, res) => {
    try {
        const { message } = req.body;

        // Detailed logging of the incoming payload for debugging
        console.log('[Webhook] Received Telegram payload:', JSON.stringify(req.body, null, 2));

        if (message && message.chat && message.text) {
            const firstName = message.from?.first_name || message.chat.first_name || 'Telegram User';
            const lastName = message.from?.last_name || message.chat.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim();
            const text = message.text;
            const chatId = message.chat.id;
            const username = message.from?.username ? `@${message.from.username}` : 'No username';

            // 1. Smart Phone Number Extraction (Ethiopian format)
            // Matches +251 9... or +251 7... or 09... or 07... (allowing spaces/dashes)
            const ethPhoneRegex = /(\+251\s?[79]\d{8})|(0[79]\d{8})/;
            const phoneMatch = text.match(ethPhoneRegex);
            const extractedPhone = phoneMatch ? phoneMatch[0].replace(/\s/g, '') : null;

            // 2. Enhanced Property Interest Detection
            const propertyKeywords = [
                'bole', 'cmc', 'ayat', 'apartment', 'villa', 'condo', 'price', 'house',
                'studio', 'bet', 'ground', 'commercial', 'floor', 'rent', 'sell', 'buy',
                'summit', 'legetafo', 'kazanchis', 'piassa', 'lebu', 'haile garment'
            ];

            const lowerText = text.toLowerCase();
            let propertyInterest = null;
            let matchedKeywords = [];

            for (const keyword of propertyKeywords) {
                if (lowerText.includes(keyword)) {
                    matchedKeywords.push(keyword.charAt(0).toUpperCase() + keyword.slice(1));
                }
            }

            if (matchedKeywords.length > 0) {
                propertyInterest = matchedKeywords.join(', ');
            }

            // 3. Find a default agent to assign this lead to
            const defaultUser = await prisma.user.findFirst({
                where: { role: 'AGENT' },
                orderBy: { createdAt: 'asc' }
            });

            if (!defaultUser) {
                console.error('[Webhook] CRITICAL: No AGENT found in database to assign Telegram lead.');
                return res.status(200).send('OK');
            }

            // 4. Create Lead record with parsed data
            const lead = await prisma.lead.create({
                data: {
                    name: fullName,
                    phone: extractedPhone,
                    message: text,
                    propertyInterest: propertyInterest || 'General Inquiry',
                    source: 'Telegram',
                    platformSource: `Telegram (${username})`,
                    status: 'NEW',
                    userId: defaultUser.id,
                },
            });

            console.log(`[Webhook] SUCCESS: Captured Telegram Lead | ID: ${lead.id} | Name: ${fullName} | Phone: ${extractedPhone || 'None'}`);

            // 5. Send Notification back to the agent (optional but helpful)
            const notificationMsg = `🚀 <b>New Lead Captured!</b>\n\n` +
                `<b>Name:</b> ${fullName}\n` +
                `<b>Phone:</b> ${extractedPhone || 'Not provided'}\n` +
                `<b>Source:</b> Telegram (${username})\n` +
                `<b>Interest:</b> ${propertyInterest || 'General Inquiry'}\n` +
                `<b>Message:</b> ${text}`;

            await sendToTelegram(notificationMsg);
        }

        res.status(200).send('OK');
    } catch (err) {
        console.error('[Webhook] ERROR handling Telegram webhook:', err);
        res.status(200).send('OK');
    }
};

// POST /api/webhook/tiktok
export const handleTikTokWebhook = async (req, res) => {
    try {
        const payload = req.body;
        console.log('[Webhook] Received TikTok payload:', JSON.stringify(payload, null, 2));

        // 1. TikTok Challenge Verification
        // TikTok sends a GET or POST with a challenge parameter to verify the webhook URL
        if (payload.challenge) {
            console.log('[Webhook] TikTok challenge detected. Responding with:', payload.challenge);
            return res.status(200).send(payload.challenge);
        }

        // 2. Parse Lead Data
        // Official TikTok Lead Gen webhooks usually contain a list of changes or a lead_id
        // We'll handle both direct lead data and lead_id references if present.

        let leadData = null;

        // Case A: Direct lead data in payload (Common in some configurations)
        if (payload.full_name || payload.phone_number || payload.email) {
            leadData = {
                name: payload.full_name || 'TikTok Lead',
                phone: payload.phone_number || null,
                email: payload.email || null,
                adId: payload.ad_id || 'Unknown Ad',
                adName: payload.ad_name || 'TikTok Ad',
                message: payload.message || `Lead from TikTok Ad: ${payload.ad_name || 'Unknown'}`
            };
        }
        // Case B: TikTok "Lead Generation" webhook format (often inside an array)
        else if (Array.isArray(payload) && payload[0]?.lead_id) {
            const item = payload[0];
            leadData = {
                name: 'TikTok Lead',
                phone: item.phone_number || null,
                adId: item.ad_id || 'Unknown Ad',
                message: `Lead ID: ${item.lead_id} captured from TikTok.`
            };
        }
        // Case C: Standard "changes" format (similar to Facebook/Instagram)
        else if (payload.content?.lead_id) {
            leadData = {
                name: 'TikTok Lead',
                phone: payload.content.phone_number || null,
                adId: payload.content.ad_id || 'Unknown Ad',
                message: `Lead ID: ${payload.content.lead_id} from TikTok.`
            };
        }

        if (leadData) {
            // 3. Find default agent
            const defaultUser = await prisma.user.findFirst({
                where: { role: 'AGENT' },
                orderBy: { createdAt: 'asc' }
            });

            if (!defaultUser) {
                console.error('[Webhook] CRITICAL: No AGENT found to assign TikTok lead.');
                return res.status(200).send('OK');
            }

            // 4. Create Lead
            const lead = await prisma.lead.create({
                data: {
                    name: leadData.name,
                    phone: leadData.phone,
                    message: leadData.message,
                    propertyInterest: `TikTok Ad: ${leadData.adName || leadData.adId}`,
                    source: 'TikTok',
                    platformSource: 'TikTok Ads',
                    status: 'NEW',
                    userId: defaultUser.id,
                },
            });

            console.log(`[Webhook] SUCCESS: Captured TikTok Lead | ID: ${lead.id} | Name: ${leadData.name}`);

            // 5. Notify agent via Telegram
            const notificationMsg = `🎵 <b>New TikTok Lead!</b>\n\n` +
                `<b>Name:</b> ${leadData.name}\n` +
                `<b>Phone:</b> ${leadData.phone || 'Not provided'}\n` +
                `<b>Ad ID:</b> ${leadData.adId}\n` +
                `<b>Source:</b> TikTok Ads\n` +
                `<b>Details:</b> ${leadData.message}`;

            await sendToTelegram(notificationMsg);
        } else {
            console.warn('[Webhook] TikTok payload received but no lead data extracted.');
        }

        res.status(200).send('OK');
    } catch (err) {
        console.error('[Webhook] ERROR handling TikTok webhook:', err);
        res.status(200).send('OK'); // Always return 200 to TikTok to avoid retries
    }
};

// GET /api/tiktok/poll
export const pollTikTokLeads = async (req, res) => {
    try {
        // Placeholder manual polling endpoint that could fetch from TikTok APIs
        res.json({ success: true, message: 'TikTok polling successful. No new leads found (placeholder).' });
    } catch (err) {
        console.error('Error polling TikTok leads:', err);
        res.status(500).json({ success: false, message: 'Server error during polling' });
    }
};
