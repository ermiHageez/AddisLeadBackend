import prisma from '../utils/prisma.js';

// GET /api/tasks
export const getTasks = async (req, res) => {
    try {
        const userId = req.user.id;
        const tasks = await prisma.task.findMany({
            where: { userId },
            orderBy: { dueDate: 'asc' },
        });

        res.json({ success: true, data: tasks });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// POST /api/tasks
export const createTask = async (req, res) => {
    try {
        const userId = req.user.id;
        const { title, description, dueDate, relatedLeadName, status } = req.body;

        if (!title || !dueDate) {
            return res.status(400).json({ success: false, message: 'Title and due date are required' });
        }

        const task = await prisma.task.create({
            data: {
                title,
                description: description || null,
                dueDate: new Date(dueDate),
                relatedLeadName: relatedLeadName || null,
                status: status || 'PENDING',
                userId,
            },
        });

        res.status(201).json({ success: true, data: task });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// PATCH /api/tasks/:id
export const updateTask = async (req, res) => {
    try {
        const userId = req.user.id;
        const taskId = req.params.id;
        const { title, description, dueDate, relatedLeadName, status } = req.body;

        const updated = await prisma.task.updateMany({
            where: { id: taskId, userId },
            data: {
                ...(title && { title }),
                ...(description !== undefined && { description }),
                ...(dueDate && { dueDate: new Date(dueDate) }),
                ...(relatedLeadName !== undefined && { relatedLeadName }),
                ...(status && { status }),
            },
        });

        if (updated.count === 0) {
            return res.status(404).json({ success: false, message: 'Task not found or unauthorized' });
        }

        const task = await prisma.task.findUnique({ where: { id: taskId } });
        res.json({ success: true, data: task });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// DELETE /api/tasks/:id
export const deleteTask = async (req, res) => {
    try {
        const userId = req.user.id;
        const taskId = req.params.id;

        const deleted = await prisma.task.deleteMany({
            where: { id: taskId, userId },
        });

        if (deleted.count === 0) {
            return res.status(404).json({ success: false, message: 'Task not found or unauthorized' });
        }

        res.json({ success: true, message: 'Task deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
