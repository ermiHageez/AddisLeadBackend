import { Router } from 'express';
import { getProperties, createProperty, getPropertyById, updateProperty, deleteProperty } from '../controllers/property.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/', getProperties);
router.post('/', createProperty);
router.get('/:id', getPropertyById);
router.patch('/:id', updateProperty);
router.delete('/:id', deleteProperty);

export default router;
