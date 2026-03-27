import prisma from '../utils/prisma.js';

// GET /api/properties
export const getProperties = async (req, res) => {
    try {
        const userId = req.user.id;
        const { type, search } = req.query;

        const where = {
            userId,
            ...(type && { propertyType: type }),
            ...(search && {
                OR: [
                    { title: { contains: search, mode: 'insensitive' } },
                    { location: { contains: search, mode: 'insensitive' } },
                ],
            }),
        };

        const properties = await prisma.property.findMany({
            where,
            include: { _count: { select: { leads: true } } },
            orderBy: { createdAt: 'desc' },
        });

        res.json({ success: true, data: properties });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/properties
export const createProperty = async (req, res) => {
    try {
        const userId = req.user.id;
        const { title, description, price, location, propertyType } = req.body;

        if (!title) return res.status(400).json({ success: false, message: 'Property title is required' });

        const property = await prisma.property.create({
            data: {
                title,
                description,
                price: price ? parseFloat(price) : null,
                location,
                propertyType,
                userId,
            },
        });

        res.status(201).json({ success: true, data: property });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// GET /api/properties/:id
export const getPropertyById = async (req, res) => {
    try {
        const property = await prisma.property.findFirst({
            where: { id: req.params.id, userId: req.user.id },
            include: { leads: { select: { id: true, name: true, status: true, phone: true } } },
        });

        if (!property) return res.status(404).json({ success: false, message: 'Property not found' });
        res.json({ success: true, data: property });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PATCH /api/properties/:id
export const updateProperty = async (req, res) => {
    try {
        const { title, description, price, location, propertyType } = req.body;

        const result = await prisma.property.updateMany({
            where: { id: req.params.id, userId: req.user.id },
            data: {
                ...(title && { title }),
                ...(description !== undefined && { description }),
                ...(price !== undefined && { price: price ? parseFloat(price) : null }),
                ...(location && { location }),
                ...(propertyType && { propertyType }),
            },
        });

        if (result.count === 0)
            return res.status(404).json({ success: false, message: 'Property not found or unauthorized' });

        const updated = await prisma.property.findUnique({ where: { id: req.params.id } });
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// DELETE /api/properties/:id
export const deleteProperty = async (req, res) => {
    try {
        const deleted = await prisma.property.deleteMany({
            where: { id: req.params.id, userId: req.user.id },
        });

        if (deleted.count === 0)
            return res.status(404).json({ success: false, message: 'Property not found or unauthorized' });

        res.json({ success: true, message: 'Property deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
