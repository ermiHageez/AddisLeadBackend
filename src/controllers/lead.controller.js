import prisma from '../utils/prisma.js';

// GET /api/leads
export const getLeads = async (req, res) => {
    try {
        const { status, source, search } = req.query;
        const userId = req.user.id;

        const where = {
            userId,
            ...(status && { status }),
            ...(source && { platformSource: source }),
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } },
                ],
            }),
        };

        const leads = await prisma.lead.findMany({
            where,
            include: { property: { select: { id: true, title: true, location: true } } },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ success: true, data: leads });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/leads
export const createLead = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, phone, message, source, platformSource, propertyInterest, status, budget, notes, propertyId } = req.body;

        if (!name) return res.status(400).json({ success: false, message: 'Lead name is required' });

        // Basic Ethiopian phone validation if phone is provided
        if (phone) {
            const ethPhoneRegex = /^\+251[79]\d{8}$/;
            const altEthPhoneRegex = /^0[79]\d{8}$/;
            if (!ethPhoneRegex.test(phone) && !altEthPhoneRegex.test(phone)) {
                return res.status(400).json({ success: false, message: 'Invalid Ethiopian phone format. Use +251... or 09.../07...' });
            }
        }

        const lead = await prisma.lead.create({
            data: {
                name,
                phone: phone || null,
                message: message || null,
                source: source || platformSource || 'Manual',
                platformSource: platformSource || source || 'Manual',
                propertyInterest: propertyInterest || null,
                status: status || 'NEW',
                budget: budget ? parseFloat(budget) : null,
                userId,
                propertyId: propertyId || null,
                notes: notes ? {
                    create: {
                        text: notes
                    }
                } : undefined
            },
            include: {
                notes: true
            }
        });

        res.status(201).json({ success: true, data: lead });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/leads/:id
export const getLeadById = async (req, res) => {
    try {
        const lead = await prisma.lead.findFirst({
            where: { id: req.params.id, userId: req.user.id },
            include: {
                property: true,
                notes: { orderBy: { createdAt: 'desc' } },
                reminders: { orderBy: { dueAt: 'asc' } }
            },
        });

        if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
        res.json({ success: true, data: lead });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PATCH /api/leads/:id
export const updateLead = async (req, res) => {
    try {
        const { name, phone, message, source, platformSource, propertyInterest, status, budget, notes, propertyId } = req.body;

        // Basic Ethiopian phone validation if phone is provided
        if (phone) {
            const ethPhoneRegex = /^\+251[79]\d{8}$/;
            const altEthPhoneRegex = /^0[79]\d{8}$/;
            if (!ethPhoneRegex.test(phone) && !altEthPhoneRegex.test(phone)) {
                return res.status(400).json({ success: false, message: 'Invalid Ethiopian phone format. Use +251... or 09.../07...' });
            }
        }

        const lead = await prisma.lead.updateMany({
            where: { id: req.params.id, userId: req.user.id },
            data: {
                ...(name && { name }),
                ...(phone && { phone }),
                ...(message && { message }),
                ...(source && { source }),
                ...(platformSource && { platformSource }),
                ...(propertyInterest && { propertyInterest }),
                ...(status && { status }),
                ...(budget !== undefined && { budget: budget ? parseFloat(budget) : null }),
                ...(propertyId !== undefined && { propertyId }),
            },
        });

        if (lead.count === 0)
            return res.status(404).json({ success: false, message: 'Lead not found or unauthorized' });

        const updated = await prisma.lead.findUnique({ where: { id: req.params.id } });
        res.json({ success: true, data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// DELETE /api/leads/:id
export const deleteLead = async (req, res) => {
    try {
        const deleted = await prisma.lead.deleteMany({
            where: { id: req.params.id, userId: req.user.id },
        });

        if (deleted.count === 0)
            return res.status(404).json({ success: false, message: 'Lead not found or unauthorized' });

        res.json({ success: true, message: 'Lead deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PUT /api/leads/:id/status
export const updateLeadStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['NEW', 'CONTACTED', 'INTERESTED', 'VIEWING', 'SOLD'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const lead = await prisma.lead.updateMany({
            where: { id: req.params.id, userId: req.user.id },
            data: { status },
        });

        if (lead.count === 0)
            return res.status(404).json({ success: false, message: 'Lead not found or unauthorized' });

        res.json({ success: true, message: 'Status updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/leads/:id/notes
export const addLeadNote = async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ success: false, message: 'Note text is required' });

        // Verify lead ownership
        const lead = await prisma.lead.findFirst({
            where: { id: req.params.id, userId: req.user.id }
        });
        if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

        const note = await prisma.note.create({
            data: {
                text,
                leadId: req.params.id
            }
        });

        res.status(201).json({ success: true, data: note });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/leads/:id/reminders
export const addLeadReminder = async (req, res) => {
    try {
        const { title, dueAt } = req.body;
        if (!dueAt) return res.status(400).json({ success: false, message: 'Due date is required' });

        // Verify lead ownership
        const lead = await prisma.lead.findFirst({
            where: { id: req.params.id, userId: req.user.id }
        });
        if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

        const reminder = await prisma.reminder.create({
            data: {
                title: title || 'Follow up',
                dueAt: new Date(dueAt),
                leadId: req.params.id
            }
        });

        res.status(201).json({ success: true, data: reminder });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
