import prisma from '../utils/prisma.js';
import { generateContent, generateMarketResearch, generateLeadAnalysis } from '../services/ai.service.js';

// POST /api/ai/generate
export const generateAIContent = async (req, res) => {
    try {
        const userId = req.user.id;
        const { prompt, actionType, propertyId } = req.body;

        if (!prompt) return res.status(400).json({ success: false, message: 'Prompt is required' });
        if (!actionType) return res.status(400).json({ success: false, message: 'actionType is required (Caption or Reply)' });

        // Verify user exists (prevents P2003 if token is from a deleted user/reset DB)
        const userExists = await prisma.user.findUnique({ where: { id: userId } });
        if (!userExists) {
            return res.status(401).json({ success: false, message: 'User no longer exists. Please log in again.' });
        }

        // 1. Get/Initialize Subscription
        let subscription = await prisma.subscription.findUnique({ where: { userId } });
        if (!subscription) {
            subscription = await prisma.subscription.create({
                data: {
                    userId,
                    plan: 'TRIAL',
                    status: 'ACTIVE',
                    expiresAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
                    aiUsageToday: 0,
                    aiUsageResetDate: new Date()
                }
            });
        }

        // 2. Daily Reset Check
        const now = new Date();
        const resetDate = new Date(subscription.aiUsageResetDate);
        const isSameDay = now.getFullYear() === resetDate.getFullYear() &&
            now.getMonth() === resetDate.getMonth() &&
            now.getDate() === resetDate.getDate();

        if (!isSameDay) {
            subscription = await prisma.subscription.update({
                where: { userId },
                data: {
                    aiUsageToday: 0,
                    aiUsageResetDate: now
                }
            });
        }

        // 3. Check Limits
        const aiLimits = { TRIAL: 5, BASIC: 50, PRO: 999999, AGENCY: 999999 };
        const limit = aiLimits[subscription.plan] || 5;

        if (subscription.aiUsageToday >= limit) {
            return res.status(403).json({
                success: false,
                message: `Daily AI limit reached for ${subscription.plan} plan. Please upgrade for more.`,
                limitReached: true
            });
        }

        // 4. Secondary Hourly Spam Check (Optional, but good for security)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const hourlyCount = await prisma.aIRecord.count({
            where: { userId, createdAt: { gte: oneHourAgo } },
        });

        if (hourlyCount >= 10) { // Increased from 3 to 10 for better UX while still preventing spam
            return res.status(429).json({
                success: false,
                message: 'You are sending prompts too quickly. Please wait a moment.'
            });
        }

        // Build a context-aware prompt if a propertyId is provided
        let enrichedPrompt = prompt;
        if (propertyId) {
            const property = await prisma.property.findFirst({
                where: { id: propertyId, userId },
            });
            if (property) {
                enrichedPrompt = `Property: ${property.title} in ${property.location || 'Addis Ababa'}. Price: ${property.price ? `${property.price} ETB` : 'not specified'}. Type: ${property.propertyType || 'Residential'}.\n\nUser request: ${prompt}`;
            }
        }

        // Call real Gemini AI service
        const aiResponse = await generateContent(enrichedPrompt, actionType);

        // Save the record for history
        const aiRecord = await prisma.aIRecord.create({
            data: {
                prompt: enrichedPrompt,
                response: aiResponse,
                actionType,
                userId,
            },
        });

        // Increment AI Usage Counter
        await prisma.subscription.update({
            where: { userId },
            data: {
                aiUsageToday: { increment: 1 }
            }
        });

        res.status(201).json({ success: true, data: { response: aiResponse, id: aiRecord.id } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
};

// GET /api/ai/history
export const getAIHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const records = await prisma.aIRecord.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        res.json({ success: true, data: records });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/ai/research (PRO and AGENCY only)
export const getMarketResearch = async (req, res) => {
    try {
        const userId = req.user.id;
        const aiResponse = await generateMarketResearch(userId);

        // Save the record for history
        await prisma.aIRecord.create({
            data: {
                prompt: "Generate Market Research",
                response: aiResponse,
                actionType: "Market Research",
                userId,
            },
        });

        // Increment AI Usage Counter
        await prisma.subscription.update({
            where: { userId },
            data: { aiUsageToday: { increment: 1 } }
        });

        res.json({ success: true, data: { research: aiResponse } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to generate market research.' });
    }
};


// GET /api/ai/analysis/:leadId (AGENCY only)
export const getLeadAnalysis = async (req, res) => {
    try {
        const { leadId } = req.params;
        const userId = req.user.id;

        const analysisData = await generateLeadAnalysis(leadId, userId);
        const formattedResponse = `Heat Score: ${analysisData.leadHeatScore}/100\n\nClosing Strategy:\n${analysisData.closingStrategy}\n\nActivity Summary:\n${analysisData.activitySummary}`;

        // Save the record for history
        await prisma.aIRecord.create({
            data: {
                prompt: `Analyze Lead ID: ${leadId}`,
                response: formattedResponse,
                actionType: "Lead Analysis",
                userId,
            },
        });

        // Increment AI Usage Counter
        await prisma.subscription.update({
            where: { userId },
            data: { aiUsageToday: { increment: 1 } }
        });

        res.json({ success: true, data: analysisData });
    } catch (err) {
        console.error(err);
        if (err.message === 'Lead not found') {
            return res.status(404).json({ success: false, message: 'Lead not found' });
        }
        res.status(500).json({ success: false, message: 'Failed to generate lead analysis.' });
    }
};
