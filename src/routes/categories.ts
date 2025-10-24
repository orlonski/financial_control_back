import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../server';
import { authenticateToken } from '../middleware/auth';
import { convertDecimalToNumber } from '../utils/decimal';

const router = Router();

// Validation schemas
const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  type: z.enum(['INCOME', 'EXPENSE']),
  color: z.string().optional(),
  icon: z.string().optional()
});

const updateCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  color: z.string().optional(),
  icon: z.string().optional()
});

// Get all categories
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get category by ID
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const category = await prisma.category.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId
      }
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create category
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const data = createCategorySchema.parse(req.body);

    const category = await prisma.category.create({
      data: {
        ...data,
        userId: req.userId
      }
    });

    res.status(201).json(category);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update category
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    const data = updateCategorySchema.parse(req.body);

    const category = await prisma.category.updateMany({
      where: {
        id: req.params.id,
        userId: req.userId
      },
      data
    });

    if (category.count === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const updatedCategory = await prisma.category.findUnique({
      where: { id: req.params.id }
    });

    res.json(updatedCategory);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete category
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const category = await prisma.category.deleteMany({
      where: {
        id: req.params.id,
        userId: req.userId
      }
    });

    if (category.count === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
