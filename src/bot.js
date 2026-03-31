import { Telegraf, Markup } from 'telegraf';
import prisma from './utils/prisma.js';
import dotenv from 'dotenv';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// ────────────────────────────────────────────────────────
// HELPERS & SESSION
// ────────────────────────────────────────────────────────

const userSessions = new Map();

/**
 * Lead Sync Helper - Acts like an internal API call
 * Ensures lead is created or updated based on telegramId or phone.
 */
const syncLeadToBackend = async (data) => {
    const { telegramId, name, phone, agentId, propertyInterest, source } = data;

    try {
        // 1. Detect existing lead by phone or telegramId for the same agent
        let existingLead = await prisma.lead.findFirst({
            where: {
                userId: agentId,
                OR: [
                    { telegramId: telegramId },
                    { phone: phone }
                ]
            }
        });

        if (existingLead) {
            // Update existing lead
            const updatedNote = `${existingLead.message}\n[${new Date().toLocaleDateString()}] New interest in: ${propertyInterest}`;
            return await prisma.lead.update({
                where: { id: existingLead.id },
                data: {
                    name: name || existingLead.name,
                    phone: phone || existingLead.phone,
                    message: updatedNote,
                    propertyInterest: `${existingLead.propertyInterest || ''}, ${propertyInterest}`.slice(0, 190),
                    status: 'NEW',
                    updatedAt: new Date()
                }
            });
        }

        // 2. Create new lead if not found
        return await prisma.lead.create({
            data: {
                name: name || 'Unknown',
                phone: phone || null,
                telegramId: telegramId,
                message: `First inquiry: ${propertyInterest}`,
                propertyInterest: propertyInterest,
                source: 'Telegram',
                platformSource: source || 'Telegram Bot',
                status: 'NEW',
                userId: agentId,
            }
        });
    } catch (err) {
        console.error('[Bot Sync] ❌ Failed to sync lead:', err.message);
        throw err;
    }
};

const buildName = (from) => {
    const parts = [from.first_name, from.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Unknown';
};

// ────────────────────────────────────────────────────────
// 1. CHANNEL / GROUP SETUP
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
            update: { userId: user.id },
            create: {
                chatId,
                userId: user.id,
                channelUsername: ctx.chat.username || null
            },
        });

        ctx.reply('✅ Success! This channel/group is now linked to your AddisLead dashboard.');
    } catch (err) {
        console.error('[Bot] Setup Error:', err);
        ctx.reply('❌ Error setting up channel.');
    }
});

// ────────────────────────────────────────────────────────
// 2. INTERACTION FLOW (Conversational) - Private Chat
// ────────────────────────────────────────────────────────

bot.start(async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const telegramId = ctx.from.id.toString();
    const startPayload = ctx.startPayload;

    // Default agent lookup (fallback to first agent if no link found)
    let agentId = null;
    let contextNote = 'Started bot directly';
    let channelId = null;
    let msgId = null;

    if (startPayload && startPayload.startsWith('interest_')) {
        const parts = startPayload.split('_');
        channelId = parts[1];
        msgId = parts[2];
        const channel = await prisma.telegramChannel.findUnique({ where: { chatId: channelId } });
        if (channel) agentId = channel.userId;
        contextNote = `From Post ID: ${msgId} in ${channelId}`;
    }

    if (!agentId) {
        const firstAgent = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
        if (firstAgent) agentId = firstAgent.id;
    }

    if (!agentId) {
        return ctx.reply("System maintenance: No agents found. Please try again later.");
    }

    // Initialize session for interrogation
    userSessions.set(telegramId, {
        step: 'ASK_NAME',
        agentId,
        telegramId,
        telegramUsername: ctx.from.username || null,
        propertyInterest: contextNote,
        msgId
    });

    ctx.reply(
        `👋 Welcome to AddisLead! Let's get you connected.\n👋 ሰላም! ወደ AddisLead በደህና መጡ።\n\nWhat is your full Name? / ሙሉ ስምዎን ይንገሩን?`,
        Markup.removeKeyboard()
    );
});

bot.on('text', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const session = userSessions.get(telegramId);

    if (!session || ctx.chat.type !== 'private') return;

    if (session.step === 'ASK_NAME') {
        session.name = ctx.message.text.trim();
        session.step = 'ASK_PHONE';
        userSessions.set(telegramId, session);

        return ctx.reply(
            `Thanks, ${session.name}! Now, please share your phone number so the agent can contact you quickly. / እናመሰግናለን! የወኪል ወኪሉ በፍጥነት እንዲያገኝዎት እባክዎ ስልክ ቁጥርዎን ያጋሩ።`,
            Markup.keyboard([
                [Markup.button.contactRequest('📱 Share Phone Number / ስልክ ቁጥር ያጋሩ')],
            ]).oneTime().resize()
        );
    }

    if (session.step === 'ASK_INFO') {
        session.additionalInfo = ctx.message.text.trim();
        session.propertyInterest += ` | Extra info: ${session.additionalInfo}`;
        
        // Finalize Lead Capture
        try {
            await syncLeadToBackend({
                telegramId: session.telegramId,
                name: session.name,
                phone: session.phone,
                agentId: session.agentId,
                propertyInterest: session.propertyInterest,
                source: session.telegramUsername ? `Bot (@${session.telegramUsername})` : 'Bot DM'
            });

            userSessions.delete(telegramId);

            return ctx.reply(
                `✅ Thank you, ${session.name}! Your details have been received. An agent will call you soon.\n✅ እናመሰግናለን! መረጃዎ ደርሶናል፣ ወኪል በቅርቡ ይደውልልዎታል።\n\n📱 Download AddisLead: addislead.com/download`,
                Markup.removeKeyboard()
            );
        } catch (err) {
            ctx.reply('⚠️ Sorry, I had trouble saving your info. Please try again.');
        }
    }
});

bot.on('contact', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const session = userSessions.get(telegramId);

    if (!session || session.step !== 'ASK_PHONE') return;

    session.phone = ctx.message.contact.phone_number;
    session.step = 'ASK_INFO';
    userSessions.set(telegramId, session);

    return ctx.reply(
        `Great! Got your number. Any other specific requirements or info you'd like to add? / በጣም ጥሩ! ማንኛቸውም ተጨማሪ መስፈርቶች ወይም መረጃ ካለዎት እባክዎን ይንገሩን?`,
        Markup.inlineKeyboard([
            [{ text: '⏩ Skip / ዝለል', callback_data: 'skip_info' }]
        ])
    );
});

bot.on('callback_query', async (ctx) => {
    if (ctx.callbackQuery.data === 'skip_info') {
        const telegramId = ctx.from.id.toString();
        const session = userSessions.get(telegramId);

        if (!session || session.step !== 'ASK_INFO') return;

        try {
            await syncLeadToBackend({
                telegramId: session.telegramId,
                name: session.name,
                phone: session.phone,
                agentId: session.agentId,
                propertyInterest: session.propertyInterest,
                source: session.telegramUsername ? `Bot (@${session.telegramUsername})` : 'Bot DM'
            });

            await ctx.answerCbQuery('Recorded!');
            await ctx.editMessageText(
                `✅ Thank you, ${session.name}! Your details have been received. An agent will call you soon.\n✅ እናመሰግናለን! መረጃዎ ደርሶናል፣ ወኪል በቅርቡ ይደውልልዎታል።\n\n📱 Download AddisLead: addislead.com/download`
            );
            userSessions.delete(telegramId);
        } catch (err) {
            await ctx.reply('⚠️ Error saving information.');
        }
    }
});

// ────────────────────────────────────────────────────────
// 3. PASSIVE CAPTURE (Groups/Channels)
// ────────────────────────────────────────────────────────

bot.on('channel_post', async (ctx) => {
    try {
        const chatId = ctx.chat.id.toString();
        const channel = await prisma.telegramChannel.findUnique({ where: { chatId } });
        if (!channel) return;

        const startParam = `interest_${chatId}_${ctx.channelPost.message_id}`;
        const url = `https://t.me/${ctx.botInfo.username}?start=${startParam}`;

        await ctx.editMessageReplyMarkup({
            inline_keyboard: [[{ text: '📩 I\'m Interested / ለመግዛት እፈልጋለሁ', url }]],
        });
    } catch (err) {}
});

// Passive capture on group messages - keeping simple for now
bot.on('message', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();
    
    // Check if group is linked - if so, we can capture passively
    const chatId = ctx.chat.id.toString();
    const channel = await prisma.telegramChannel.findUnique({ where: { chatId } });
    if (!channel) return next();

    // Skip if bot or recently captured (to avoid spam)
    const from = ctx.from;
    if (!from || from.is_bot) return next();

    // We can do a basic silent capture here if we want, or just let the "I'm Interested" button do the heavy lifting.
    // For now, let's keep it minimal and focus on the conversational flow in DM.
    return next();
});

bot.catch((err, ctx) => console.error(`[Bot Error] ${ctx.updateType}:`, err.message));

export default bot;
