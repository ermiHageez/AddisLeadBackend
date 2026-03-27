import prisma from '../utils/prisma.js';

/**
 * Middleware to check if a user's subscription plan is in the allowed list.
 * @param {string[]} allowedPlans - Array of allowed plans, e.g., ['PRO', 'AGENCY']
 */
export const checkSubscription = (allowedPlans) => {
    return async (req, res, next) => {
        try {
            const userId = req.user.id;

            const subscription = await prisma.subscription.findUnique({
                where: { userId }
            });

            if (!subscription) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied. Active subscription required. Allowed plans: ${allowedPlans.join(', ')}`
                });
            }

            if (!allowedPlans.includes(subscription.plan)) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied. Your ${subscription.plan} plan does not include this feature. Please upgrade to ${allowedPlans.join(' or ')}.`
                });
            }

            next();
        } catch (error) {
            console.error('[Subscription Middleware] Error:', error);
            res.status(500).json({ success: false, message: 'Server error checking subscription.' });
        }
    };
};
