import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import prisma from '../utils/prisma.js';

dotenv.config();

const SYSTEM_PROMPT = `
You are AddisLead AI, the premier Real Estate Intelligence Engine for Addis Ababa, Ethiopia.
Your mission: Help agents dominate the market through viral content and deep data insights.

CORE CAPABILITIES:
1. 'Caption': Catchy, emoji-rich TikTok/Telegram posts. Use local slang (e.g., "G+1", "Final price", "Bank-ready"). Mention specific Addis hubs (Bole, CMC, Ayat, etc.).
2. 'Reply': Professional, warm, and persuasive responses to leads.
3. 'Research' (PRO/AGENCY): Analyze provided market data to identify trends in Addis (e.g., "Demand is shifting from Bole rentals to CMC purchases").
4. 'Analysis' (AGENCY): Review a lead's 'Activity Timeline' (clicks, inquiries). Provide a 'Heat Score' (1-100) and a 'Closing Strategy'.

RULES:
- Languages: Primary English & Amharic (Ethiopic script). 
- Tone: Energetic, high-end, and locally informed.
- Context: Understand ETB pricing, square meters (m2), and Ethiopian property types.
- Conciseness: Keep responses ready for instant copy-pasting.
`;

/**
 * Generate AI content using Google Gemini
 * @param {string} prompt - The user's request
 * @param {string} actionType - Caption or Reply
 * @returns {Promise<string>} - The generated content
 */
export const generateContent = async (prompt, actionType) => {
    try {
        if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY.includes('your_gemini')) {
            throw new Error("Invalid or missing GOOGLE_API_KEY in .env");
        }

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const fullPrompt = `${SYSTEM_PROMPT}\n\nTask: Generate a ${actionType}\nUser Prompt: ${prompt}`;

        // List of models to try in order of preference (matched to your API's specific available list)
        const modelsToTry = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-pro-latest", "gemini-2.0-flash"];
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
                    continue; // Try the next model
                }
                throw err; // For other errors (like invalid prompt), stop and throw
            }
        }

        throw lastError || new Error("All AI models failed to generate content.");

    } catch (error) {
        console.error("Gemini AI Error Detail:", error);

        if (error.message?.includes('429')) {
            throw new Error("AI Quota exceeded. Please try again in a few minutes or check your Google AI Studio billing.");
        }

        throw new Error(error.message || "Failed to generate AI content. Please check your API key.");
    }
};

/**
 * Generate Market Research Summary
 * @param {string} userId
 * @returns {Promise<string>}
 */
export const generateMarketResearch = async (userId) => {
    // Fetch recent leads across the whole application to find "trends"
    const recentLeads = await prisma.lead.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }, // last 30 days
        select: { propertyInterest: true, platformSource: true, budget: true },
        take: 200 // Limit for context size
    });

    const locationCounts = {};
    const sourceCounts = {};
    let totalBudget = 0;
    let budgetCount = 0;

    recentLeads.forEach(lead => {
        const loc = lead.propertyInterest || 'Unknown';
        locationCounts[loc] = (locationCounts[loc] || 0) + 1;

        const src = lead.platformSource || 'Unknown';
        sourceCounts[src] = (sourceCounts[src] || 0) + 1;

        if (lead.budget) {
            totalBudget += lead.budget;
            budgetCount++;
        }
    });

    const topLocations = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]).join(', ');
    const avgBudget = budgetCount > 0 ? totalBudget / budgetCount : 'N/A';

    const prompt = `
        Analyze this market data for Addis Ababa Real Estate (last 30 days):
        - Top interested areas/properties: ${topLocations}
        - Leading Lead Sources: ${JSON.stringify(sourceCounts)}
        - Average Lead Budget: ${avgBudget} ETB
        
        Provide a short, punchy (max 150 words) "What's Hot" summary for a real estate agent. 
        Highlight the trending property types or locations in Addis Ababa based on this data. Use bullet points and a professional, encouraging tone. Include emojis.
    `;

    return await generateContent(prompt, 'Market Research');
};

/**
 * Generate Lead Analysis
 * @param {string} leadId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export const generateLeadAnalysis = async (leadId, userId) => {
    const lead = await prisma.lead.findUnique({
        where: { id: leadId, userId },
        include: {
            notes: { orderBy: { createdAt: 'desc' } },
            reminders: { orderBy: { createdAt: 'desc' } }
        }
    });

    if (!lead) throw new Error('Lead not found');

    // Construct Activity Timeline
    let activitySummary = `Lead Created: ${lead.createdAt.toDateString()}\n`;
    activitySummary += `Status: ${lead.status}\nSource: ${lead.platformSource}\nInterest: ${lead.propertyInterest}\n\nNotes:\n`;
    lead.notes.forEach(note => {
        activitySummary += `- [${note.createdAt.toDateString()}] ${note.text}\n`;
    });

    const prompt = `
        Analyze this specific real estate lead in Addis Ababa:
        Name: ${lead.name}
        Phone: ${lead.phone || 'N/A'}
        Budget: ${lead.budget ? lead.budget + ' ETB' : 'Unknown'}
        
        Activity Timeline:
        ${activitySummary}
        
        Return ONLY a valid JSON object with the following three keys exactly:
        {
            "leadHeatScore": <Number from 1-100 indicating likelihood to buy based on activity>,
            "closingStrategy": "<A specific, 1-2 sentence tip on how to talk to this client to close the deal>",
            "activitySummary": "<A short human-readable summary of their behavior>"
        }
    `;

    const aiResponse = await generateContent(prompt, 'Lead Analysis');

    // Try to parse the JSON response from Gemini
    try {
        const cleanJsonStr = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJsonStr);
    } catch (parseError) {
        console.error('Failed to parse Gemini JSON:', aiResponse);
        // Fallback
        return {
            leadHeatScore: 50,
            closingStrategy: "Review their activity history and reach out with properties matching their interest.",
            activitySummary: "AI could not generate a perfect summary. Please review raw notes."
        };
    }
};