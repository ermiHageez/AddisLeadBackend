import { Telegraf, Markup } from 'telegraf';
import prisma from './utils/prisma.js';
import dotenv from 'dotenv';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// ────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────

/**
 * Build a display name from Telegram user fields.
 */
const buildName = (from) => {
    const parts = [from.first_name, from.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Unknown';
};

/**
 * In-memory cooldown map so we don't spam the DB or reply
 * to the same user in a group multiple times within 1 hour.
 * Key: `${agentId}_${telegramId}` → timestamp of last capture
 */
const capturedRecently = new Map();
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

const isRecentlyCaptured = (agentId, telegramId) => {
    const key = `${agentId}_${telegramId}`;
    const last = capturedRecently.get(key);
    if (last && Date.now() - last < COOLDOWN_MS) return true;
    return false;
};

const markCaptured = (agentId, telegramId) => {
    capturedRecently.set(`${agentId}_${telegramId}`, Date.now());
};

/**
 * Upsert a lead from a Telegram user into the database.
 * If the lead already exists for this agent (by telegramId), skip creation.
 */
const captureLeadFromTelegram = async (from, agentId, source, interestNote) => {
    const telegramId = from.id.toString();

    // Skip bots
    if (from.is_bot) return null;

    // Cooldown check
    if (isRecentlyCaptured(agentId, telegramId)) return null;

    const name = buildName(from);
    const username = from.username ? `@${from.username}` : null;

    try {
        // Check if lead already exists for this agent
        const existing = await prisma.lead.findFirst({
            where: {
                userId: agentId,
                telegramId: telegramId,
            },
        });

        if (existing) {
            // Lead exists — don't recreate, just mark cooldown
            markCaptured(agentId, telegramId);
            return existing;
        }

        // Create new lead
        const lead = await prisma.lead.create({
            data: {
                name,
                phone: null,
                telegramId,
                message: interestNote || `Captured from ${source}`,
                propertyInterest: null,
                source: 'Telegram',
                platformSource: username ? `${source} (${username})` : source,
                status: 'NEW',
                userId: agentId,
            },
        });

        markCaptured(agentId, telegramId);
        console.log(`[Bot] ✅ Captured lead: ${name} (tg: ${telegramId}) → Agent: ${agentId} | Source: ${source}`);
        return lead;
    } catch (err) {
        console.error(`[Bot] ❌ Failed to capture lead ${telegramId}:`, err.message);
        return null;
    }
};

// ────────────────────────────────────────────────────────
// 1. CHANNEL / GROUP SETUP COMMAND
// ────────────────────────────────────────────────────────
bot.command('setup_channel', async (ctx) => {
    try {
        const chatId = ctx.chat.id.toString();
        const chatType = ctx.chat.type;

        if (chatType !== 'channel' && chatType !== 'group' && chatType !== 'supergroup') {
            return ctx.reply('⚠️ Please run this command in your professional Telegram Channel or Group.');
        }

        const args = ctx.message.text.split(' ');
        if (args.length < 2) {
            return ctx.reply('Usage: /setup_channel <your_addislead_email>');
        }

        const email = args[1].toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return ctx.reply(`❌ Agent with email "${email}" not found. Please register on AddisLead first.`);
        }

        await prisma.telegramChannel.upsert({
            where: { chatId },
            update: {
                channelUsername: ctx.chat.username || null,
                userId: user.id,
            },
            create: {
                chatId,
                channelUsername: ctx.chat.username || null,
                userId: user.id,
            },
        });

        console.log(`[Bot] 🔗 Channel ${chatId} linked to agent ${email}`);
        ctx.reply('✅ Success! This channel/group is now linked to your AddisLead dashboard.\n\nAll user interactions will be automatically captured as leads.');
    } catch (err) {
        console.error('[Bot] Setup Error:', err);
        ctx.reply('❌ Error setting up channel. Make sure I am an Admin.');
    }
});

// ────────────────────────────────────────────────────────
// 2. AUTO-ATTACH "I'M INTERESTED" BUTTON TO CHANNEL POSTS
// ────────────────────────────────────────────────────────
bot.on('channel_post', async (ctx) => {
    try {
        const chatId = ctx.chat.id.toString();
        const channel = await prisma.telegramChannel.findUnique({ where: { chatId } });
        if (!channel) return;

        const botUsername = ctx.botInfo.username;
        const msgId = ctx.channelPost.message_id;
        const startParam = `interest_${chatId}_${msgId}`;
        const url = `https://t.me/${botUsername}?start=${startParam}`;

        await ctx.editMessageReplyMarkup({
            inline_keyboard: [
                [{ text: '📩 I\'m Interested / ለመግዛት እፈልጋለሁ', url }],
            ],
        });

        console.log(`[Bot] 📎 Attached inquiry button to post ${msgId} in channel ${chatId}`);
    } catch (err) {
        // Some post types can't be edited — that's okay
        if (!err.message?.includes('message can\'t be edited')) {
            console.error('[Bot] Button Attachment Error:', err.message);
        }
    }
});

// ────────────────────────────────────────────────────────
// 3. PASSIVE LEAD CAPTURE FROM GROUP MESSAGES
// ────────────────────────────────────────────────────────
bot.on('message', async (ctx, next) => {
    try {
        const chatType = ctx.chat.type;

        // Only capture from groups/supergroups linked to an agent
        if (chatType !== 'group' && chatType !== 'supergroup') return next();

        const chatId = ctx.chat.id.toString();
        const channel = await prisma.telegramChannel.findUnique({ where: { chatId } });
        if (!channel) return next();

        const from = ctx.from;
        if (!from || from.is_bot) return next();

        const telegramId = from.id.toString();

        // Only capture + reply if this is a NEW user (not recently captured)
        if (!isRecentlyCaptured(channel.userId, telegramId)) {
            const lead = await captureLeadFromTelegram(
                from,
                channel.userId,
                `Group: ${ctx.chat.title || chatId}`,
                ctx.message?.text ? `Group message: "${ctx.message.text.slice(0, 200)}"` : 'Joined group conversation'
            );

            // Reply to the user once telling them about the app
            if (lead) {
                try {
                    await ctx.reply(
                        `👋 Welcome, ${buildName(from)}!\n\n` +
                        `📱 Download the *AddisLead* app to browse properties, get AI-powered insights, and connect directly with agents.\n\n` +
                        `🔗 Get it here: addislead.com/download`,
                        { parse_mode: 'Markdown', reply_to_message_id: ctx.message?.message_id }
                    );
                } catch (replyErr) {
                    // Silently fail if we can't reply (permissions, etc.)
                    console.error('[Bot] Could not send welcome reply:', replyErr.message);
                }
            }
        }
    } catch (err) {
        console.error('[Bot] Group message capture error:', err.message);
    }

    return next();
});

// ────────────────────────────────────────────────────────
// 4. CAPTURE NEW MEMBERS JOINING A GROUP
// ────────────────────────────────────────────────────────
bot.on('new_chat_members', async (ctx) => {
    try {
        const chatId = ctx.chat.id.toString();
        const channel = await prisma.telegramChannel.findUnique({ where: { chatId } });
        if (!channel) return;

        const newMembers = ctx.message.new_chat_members || [];

        for (const member of newMembers) {
            if (member.is_bot) continue;

            const lead = await captureLeadFromTelegram(
                member,
                channel.userId,
                `Joined Group: ${ctx.chat.title || chatId}`,
                'New member joined the group'
            );

            if (lead) {
                try {
                    await ctx.reply(
                        `👋 Welcome ${buildName(member)}!\n\n` +
                        `📱 Download the *AddisLead* app to explore properties and connect with agents!\n\n` +
                        `🔗 addislead.com/download`,
                        { parse_mode: 'Markdown' }
                    );
                } catch (replyErr) {
                    console.error('[Bot] Could not send join welcome:', replyErr.message);
                }
            }
        }
    } catch (err) {
        console.error('[Bot] New member capture error:', err.message);
    }
});

// ────────────────────────────────────────────────────────
// 5. INTEREST FLOW (Private Chat via Deep Link)
// ────────────────────────────────────────────────────────

const userSessions = new Map();

bot.start(async (ctx) => {
    const startPayload = ctx.startPayload;
    const telegramId = ctx.from.id.toString();

    if (startPayload && startPayload.startsWith('interest_')) {
        const parts = startPayload.split('_');
        const channelChatId = parts[1];
        const msgId = parts[2];

        userSessions.set(telegramId, {
            step: 'ASK_NAME',
            channelChatId,
            msgId,
            telegramUsername: ctx.from.username || null,
        });

        return ctx.reply('👋 Welcome! We\'re excited you\'re interested.\n\nWhat is your full Name? / ስምዎ ማነው?');
    }

    // Direct /start without payload — capture user info + welcome
    const from = ctx.from;

    // Try to find any linked channel for context, fallback to first user
    let agentId = null;
    const anyChannel = await prisma.telegramChannel.findFirst();
    if (anyChannel) {
        agentId = anyChannel.userId;
    } else {
        // No channel linked yet — fallback to the first registered user
        const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
        if (firstUser) agentId = firstUser.id;
    }

    if (agentId) {
        await captureLeadFromTelegram(from, agentId, 'Bot DM', 'Started bot directly');
    }

    ctx.reply(
        '👋 Welcome to AddisLead Bot!\n\n' +
        '📱 Download the AddisLead app to browse properties, get AI insights, and manage your leads.\n\n' +
        '🔗 addislead.com/download\n\n' +
        'If you are an agent, add me to your channel/group and run /setup_channel your@email.com to start capturing leads.'
    );
});

bot.on('text', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const session = userSessions.get(telegramId);

    // Only handle interest flow in private chats
    if (ctx.chat.type !== 'private') return;

    if (session && session.step === 'ASK_NAME') {
        session.name = ctx.message.text;
        session.step = 'ASK_PHONE';
        userSessions.set(telegramId, session);

        return ctx.reply(
            `Thanks, ${session.name}! Please share your phone number to proceed. / ስልክ ቁጥርዎን ያጋሩ።`,
            Markup.keyboard([
                [Markup.button.contactRequest('📱 Share Phone Number / ስልክ ቁጥር ያጋሩ')],
            ]).oneTime().resize()
        );
    }
});

bot.on('contact', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const session = userSessions.get(telegramId);

    if (session && session.step === 'ASK_PHONE') {
        const phone = ctx.message.contact.phone_number;
        const name = session.name;

        try {
            const channel = await prisma.telegramChannel.findUnique({
                where: { chatId: session.channelChatId },
                include: { user: true },
            });

            if (!channel) {
                return ctx.reply('Sorry, something went wrong with the channel link. Please contact the agent directly.');
            }

            const agentId = channel.userId;
            const propertyInterest = `From Telegram Post (ID: ${session.msgId})`;

            // Duplicate detection by phone or telegramId
            let lead = await prisma.lead.findFirst({
                where: {
                    userId: agentId,
                    OR: [{ phone }, { telegramId }],
                },
            });

            if (lead) {
                // Update existing lead with new interest
                const updatedNote = `${lead.message}\n[${new Date().toLocaleDateString()}] New interest in: ${propertyInterest}`;
                lead = await prisma.lead.update({
                    where: { id: lead.id },
                    data: {
                        name, // Update name in case they gave a better one
                        phone, // Ensure phone is saved
                        message: updatedNote,
                        propertyInterest: `${lead.propertyInterest || ''}, ${propertyInterest}`.slice(0, 190),
                        status: 'NEW',
                        updatedAt: new Date(),
                    },
                });
                console.log(`[Bot] 🔄 Merged lead for ${phone} | Lead ID: ${lead.id}`);
            } else {
                lead = await prisma.lead.create({
                    data: {
                        name,
                        phone,
                        telegramId,
                        message: `First inquiry: ${propertyInterest}`,
                        propertyInterest,
                        source: 'Telegram',
                        platformSource: session.telegramUsername ? `Bot (@${session.telegramUsername})` : 'Bot (DM)',
                        status: 'NEW',
                        userId: agentId,
                    },
                });
                console.log(`[Bot] ✅ Captured NEW lead: ${name} (${phone})`);
            }

            userSessions.delete(telegramId);

            await ctx.reply(
                '✅ Thank you! Your interest has been recorded. An agent will call you soon.\n\nእናመሰግናለን! ደላላው በቅርቡ ይደውልልዎታል።\n\n📱 Download AddisLead: addislead.com/download',
                Markup.removeKeyboard()
            );
        } catch (syncErr) {
            console.error('[Bot] Sync Error:', syncErr);
            ctx.reply('Sorry, I couldn\'t sync your data right now. Please try again later.');
        }
    }
});

// ────────────────────────────────────────────────────────
// GLOBAL ERROR HANDLER
// ────────────────────────────────────────────────────────
bot.catch((err, ctx) => {
    console.error(`[Bot] ⚠️ Global Error [${ctx.updateType}]:`, err.message);
});

// ────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ────────────────────────────────────────────────────────
const gracefulShutdown = (signal) => {
    console.log(`[Bot] Received ${signal}. Shutting down gracefully...`);
    bot.stop(signal);
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default bot;
