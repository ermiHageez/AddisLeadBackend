import { Router } from 'express';
import {
    getLeads,
    createLead,
    getLeadById,
    updateLead,
    deleteLead,
    updateLeadStatus,
    addLeadNote,
    addLeadReminder
} from '../controllers/lead.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createLeadSchema, updateLeadSchema } from '../validators/lead.validator.js';

const router = Router();

router.use(authenticate);

router.get('/', getLeads);
router.post('/', validate(createLeadSchema), createLead);
router.get('/:id', getLeadById);
router.patch('/:id', validate(updateLeadSchema), updateLead);
router.delete('/:id', deleteLead);

// CRM Endpoints
router.put('/:id/status', updateLeadStatus);
router.post('/:id/notes', addLeadNote);
router.post('/:id/reminders', addLeadReminder);

export default router;
