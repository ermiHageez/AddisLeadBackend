import prisma from '../utils/prisma.js';

/**
 * Ensures daily reset of AI usage for a subscription
 */
const ensureDailyReset = async (subscription, userId) => {
    if (!subscription || !subscription.aiUsageResetDate) return subscription;

    const now = new Date();
    const resetDate = new Date(subscription.aiUsageResetDate);
    const isSameDay = now.getFullYear() === resetDate.getFullYear() &&
        now.getMonth() === resetDate.getMonth() &&
        now.getDate() === resetDate.getDate();

    if (!isSameDay) {
        return await prisma.subscription.update({
            where: { userId },
            data: {
                aiUsageToday: 0,
                aiUsageResetDate: now
            }
        });
    }
    return subscription;
};

// GET /api/subscription
export const getCurrentSubscription = async (req, res) => {
    try {
        const userId = req.user.id;

        // Verify user exists
        const userExists = await prisma.user.findUnique({ where: { id: userId } });
        if (!userExists) {
            return res.status(401).json({ success: false, message: 'User no longer exists. Please log in again.' });
        }

        let subscription = await prisma.subscription.findUnique({
            where: { userId }
        });

        // Ensure accurate daily usage for profile view
        subscription = await ensureDailyReset(subscription, userId);

        // Initialize trial if none exists (for existing users)
        if (!subscription) {
            subscription = await prisma.subscription.create({
                data: {
                    userId,
                    plan: 'TRIAL',
                    status: 'ACTIVE',
                    startsAt: new Date(),
                    expiresAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000), // 4 weeks
                    aiUsageToday: 0,
                    aiUsageResetDate: new Date()
                }
            });
        }

        res.json({ success: true, data: subscription });
    } catch (err) {
        console.error('Error fetching subscription:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/subscription/upgrade
export const upgradeSubscription = async (req, res) => {
    try {
        const { plan } = req.body;
        const validPlans = ['TRIAL', 'BASIC', 'PRO', 'AGENCY'];

        if (!validPlans.includes(plan)) {
            return res.status(400).json({ success: false, message: 'Invalid plan' });
        }

        const userId = req.user.id;
        // Verify user exists
        const userExists = await prisma.user.findUnique({ where: { id: userId } });
        if (!userExists) {
            return res.status(401).json({ success: false, message: 'User no longer exists. Please log in again.' });
        }

        // For simplicity, all paid plans are 30 days
        const duration = 30 * 24 * 60 * 60 * 1000;
        const expiresAt = plan === 'TRIAL'
            ? new Date(Date.now() + 28 * 24 * 60 * 60 * 1000)
            : new Date(Date.now() + duration);

        const subscription = await prisma.subscription.upsert({
            where: { userId: req.user.id },
            update: {
                plan,
                status: 'ACTIVE',
                expiresAt,
                updatedAt: new Date()
            },
            create: {
                userId: req.user.id,
                plan,
                status: 'ACTIVE',
                startsAt: new Date(),
                expiresAt,
                aiUsageToday: 0,
                aiUsageResetDate: new Date()
            }
        });

        res.json({ success: true, data: subscription });
    } catch (err) {
        console.error('Error upgrading subscription:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/ai/usage
export const getAiUsage = async (req, res) => {
    try {
        const userId = req.user.id;

        // Verify user exists
        const userExists = await prisma.user.findUnique({ where: { id: userId } });
        if (!userExists) {
            return res.status(401).json({ success: false, message: 'User no longer exists. Please log in again.' });
        }

        const [leadsCount, subscriptionData] = await Promise.all([
            prisma.lead.count({ where: { userId } }),
            prisma.subscription.findUnique({ where: { userId } })
        ]);

        let subscription = subscriptionData;

        // Daily Reset Check for accurate display
        subscription = await ensureDailyReset(subscription, userId);

        const aiLimits = {
            TRIAL: 5,
            BASIC: 50,
            PRO: 999999,
            AGENCY: 999999
        };

        const leadLimits = {
            TRIAL: 20,
            BASIC: 999999,
            PRO: 999999,
            AGENCY: 999999
        };

        if (!subscription) {
            return res.json({
                success: true,
                data: { usage: 0, limit: 5, plan: 'TRIAL', leads: leadsCount, leadLimit: 20 }
            });
        }

        res.json({
            success: true,
            data: {
                usage: subscription.aiUsageToday,
                limit: aiLimits[subscription.plan] || 5,
                plan: subscription.plan,
                leads: leadsCount,
                leadLimit: leadLimits[subscription.plan] || 20
            }
        });
    } catch (err) {
        console.error('Error fetching AI usage:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
