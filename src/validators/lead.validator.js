import { z } from 'zod';

export const createLeadSchema = z.object({
    body: z.object({
        name: z.string({ required_error: 'Name is required' }).min(2, 'Name must be at least 2 characters'),
        phone: z.string().optional(),
        platformSource: z.string().optional(),
        status: z.enum(['NEW', 'CONTACTED', 'INTERESTED', 'VIEWING', 'SOLD']).optional(),
        budget: z.number().optional(),
        notes: z.string().optional(),
        propertyId: z.string().optional(),
    }),
});

export const updateLeadSchema = z.object({
    body: z.object({
        name: z.string().min(2).optional(),
        phone: z.string().optional(),
        platformSource: z.string().optional(),
        status: z.enum(['NEW', 'CONTACTED', 'INTERESTED', 'VIEWING', 'SOLD']).optional(),
        budget: z.number().optional(),
        notes: z.string().optional(),
        propertyId: z.string().optional(),
    }),
});
