import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import prisma from '../utils/prisma.js';

dotenv.config();

const SYSTEM_PROMPT = `
You are AddisLead AI — a powerful, intelligent CRM Assistant designed to help businesses grow faster.

Your mission: Help users manage leads, communicate professionally, analyze performance, and close more deals through smart automation and insights.

CORE CAPABILITIES:
1. 'Caption': Create catchy, professional social media posts and messages (TikTok, Telegram, LinkedIn, etc.).
2. 'Reply': Write warm, persuasive, and professional replies to client messages and inquiries.
3. 'Video Idea': Suggest creative, viral video concepts and scripts for TikTok/Instagram.
4. 'Meeting Summary': Generate clear, concise summaries of meetings with action points.
5. 'Follow-up': Draft effective follow-up emails or messages to move deals forward.
6. 'Client Segmentation': Suggest how to group clients based on behavior, interest, or stage.
7. 'Pipeline Analysis': Analyze lead pipeline and give practical recommendations.
8. 'Lead Heat Score + Closing Strategy': Evaluate a lead's readiness (1-100) and suggest the best way to close.
9. 'General Smart Reply': Handle any other CRM-related request intelligently.

RULES:
- Be professional, helpful, and action-oriented.
- Adapt tone based on context: friendly for small businesses, more formal for corporate clients.
- Keep responses concise and ready to copy-paste.
- When context is provided (leads, notes, reminders, user profile, business type), use it to personalize your answers.
- Support English as primary language. If the user writes in Amharic, respond in Amharic.
- Always aim for maximum usefulness and clarity.

You are not limited to real estate — you can help any business manage their customer relationships effectively.
`;

/**
 * Robustly parse JSON from AI response
 * @param {string} text 
 * @returns {Object|null}
 */
const parseAIJson = (text) => {
    try {
        const cleanJsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJsonStr);
    } catch (e) {
        // Try simple regex extraction
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (e2) {
                console.error("Failed to parse AI JSON even with regex:", e2);
                return null;
            }
        }
        return null;
    }
};

/**
 * Enhanced AI content generator
 * @param {string} actionType - E.g., 'Caption', 'Reply', 'Lead Analysis', etc.
 * @param {string} prompt - The user's core request
 * @param {Object} context - Optional context data (leads, properties, notes, etc.)
 * @returns {Promise<string>}
 */
export const generateContent = async (actionType, prompt, context = {}) => {
    try {
        if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY.includes('your_gemini')) {
            throw new Error("Invalid or missing GOOGLE_API_KEY in .env");
        }

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        
        // Dynamically build the full prompt with context injection
        let fullPrompt = `${SYSTEM_PROMPT}\n\n`;
        fullPrompt += `ACTION TYPE: ${actionType}\n`;
        
        if (Object.keys(context).length > 0) {
            fullPrompt += `CONTEXT:\n${JSON.stringify(context, null, 2)}\n\n`;
        }
        
        fullPrompt += `USER REQUEST: ${prompt}`;

        // List of models to try in order of preference
        const modelsToTry = ["gemini-1.5-flash-latest", "gemini-2.0-flash", "gemini-1.5-pro-latest"];
        let lastError = null;

        for (const modelName of modelsToTry) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(fullPrompt);
                const response = await result.response;
                return response.text();
            } catch (err) {
                lastError = err;
                const isQuotaError = err.message?.includes('429') || err.message?.includes('quota');
                const isNotFoundError = err.message?.includes('404') || err.message?.includes('not found');

                if (isQuotaError || isNotFoundError) {
                    console.warn(`Model ${modelName} failed (${isQuotaError ? 'Quota' : 'Not Found'}). Trying next...`);
                    continue; 
                }
                throw err; 
            }
        }

        throw lastError || new Error("All AI models failed to generate content.");

    } catch (error) {
        console.error("Gemini AI Error Detail:", error);
        if (error.message?.includes('429')) {
            throw new Error("AI Quota exceeded. Please try again or upgrade your plan.");
        }
        throw new Error(error.message || "Failed to generate AI content.");
    }
};

/**
 * Generate analysis for a specific lead
 */
export const generateLeadAnalysis = async (leadId, userId) => {
    const lead = await prisma.lead.findUnique({
        where: { id: leadId, userId },
        include: {
            notes: { orderBy: { createdAt: 'desc' } },
            reminders: { orderBy: { createdAt: 'desc' }, take: 5 }
        }
    });

    if (!lead) throw new Error('Lead not found');

    const prompt = `Analyze this CRM lead and return a JSON object with: 
    - leadHeatScore (1-100)
    - closingStrategy (short tip)
    - activitySummary (human-readable summary)`;

    const context = {
        leadName: lead.name,
        status: lead.status,
        source: lead.platformSource,
        interest: lead.propertyInterest, // Keeping the field name but value will be general
        recentNotes: lead.notes.map(n => n.text),
        reminders: lead.reminders.map(r => r.title)
    };

    const aiResponse = await generateContent('Lead Analysis', prompt, context);
    const parsed = parseAIJson(aiResponse);

    return parsed || {
        leadHeatScore: 50,
        closingStrategy: "Reach out to the client to understand their needs better.",
        activitySummary: "Manual review recommended. AI summary failed."
    };
};

/**
 * Analyze lead pipeline and performance
 */
export const generatePipelineAnalysis = async (userId) => {
    const recentLeads = await prisma.lead.findMany({
        where: { userId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        take: 50,
        select: { status: true, platformSource: true, budget: true, propertyInterest: true }
    });

    const prompt = `Provide a "What's Hot" summary for this business's lead pipeline. 
    Highlight trends, top sources, and an encouraging closing tip. Keep it max 150 words.`;
    
    return await generateContent('Pipeline Analysis', prompt, { leadData: recentLeads });
};

/**
 * Draft a professional follow-up message
 */
export const generateFollowUp = async (leadId, userId) => {
    const lead = await prisma.lead.findUnique({
        where: { id: leadId, userId },
        include: { notes: { take: 3, orderBy: { createdAt: 'desc' } } }
    });

    if (!lead) throw new Error('Lead not found');

    const prompt = `Draft a warm and persuasive follow-up message to move this deal forward. Include a clear call to action.`;
    const context = {
        recipient: lead.name,
        lastInteractions: lead.notes.map(n => n.text),
        interest: lead.propertyInterest
    };

    return await generateContent('Follow-up', prompt, context);
};

/**
 * Generate a meeting summary with action points
 */
export const generateMeetingSummary = async (leadId, userId) => {
    const lead = await prisma.lead.findUnique({
        where: { id: leadId, userId },
        include: { notes: { take: 5, orderBy: { createdAt: 'desc' } } }
    });

    if (!lead) throw new Error('Lead not found');

    const prompt = `Based on the latest notes, generate a professional meeting summary with clear action items.`;
    const context = {
        leadName: lead.name,
        notes: lead.notes.map(n => n.text)
    };

    return await generateContent('Meeting Summary', prompt, context);
};

/**
 * Suggest client segmentation strategy
 */
export const generateClientSegmentation = async (userId) => {
    const leads = await prisma.lead.findMany({
        where: { userId },
        take: 100,
        select: { status: true, propertyInterest: true, platformSource: true }
    });

    const prompt = `Based on these leads, suggest 3-5 smart segmentation categories to help this user target their audience better.`;
    
    return await generateContent('Client Segmentation', prompt, { leads });
};