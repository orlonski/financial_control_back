import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { prisma } from '../server';
import { convertDecimalToNumber } from '../utils/decimal';

const router = Router();

// Validation schemas
const createBudgetSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  month: z.number().min(1).max(12),
  year: z.number().min(2020).max(2100),
  categoryId: z.string().min(1, 'Category ID is required'),
});

const updateBudgetSchema = z.object({
  amount: z.number().positive('Amount must be positive').optional(),
});

// Get all budgets for a month/year with spent calculation
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    // Get all budgets for the period
    const budgets = await prisma.budget.findMany({
      where: {
        userId: req.userId,
        month: monthNum,
        year: yearNum,
      },
      include: {
        category: true,
      },
    });

    // Calculate start and end dates for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    // Get spent amounts for each category
    const budgetsWithSpent = await Promise.all(
      budgets.map(async (budget) => {
        const transactions = await prisma.transaction.aggregate({
          where: {
            userId: req.userId,
            categoryId: budget.categoryId,
            type: 'EXPENSE',
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
          _sum: {
            amount: true,
          },
        });

        const spent = Number(transactions._sum.amount || 0);
        const amount = Number(budget.amount);
        const remaining = amount - spent;
        const percentage = amount > 0 ? (spent / amount) * 100 : 0;

        let status: 'ok' | 'warning' | 'exceeded' = 'ok';
        if (percentage >= 100) {
          status = 'exceeded';
        } else if (percentage >= 80) {
          status = 'warning';
        }

        return {
          ...budget,
          amount,
          spent,
          remaining,
          percentage,
          status,
        };
      })
    );

    res.json(convertDecimalToNumber(budgetsWithSpent));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get budget by ID
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const budget = await prisma.budget.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
      include: {
        category: true,
      },
    });

    if (!budget) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    res.json(convertDecimalToNumber(budget));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create budget
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const data = createBudgetSchema.parse(req.body);

    // Check if budget already exists for this category/month/year
    const existing = await prisma.budget.findUnique({
      where: {
        userId_categoryId_month_year: {
          userId: req.userId,
          categoryId: data.categoryId,
          month: data.month,
          year: data.year,
        },
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'Budget already exists for this category in this period' });
    }

    // Verify category belongs to user and is EXPENSE type
    const category = await prisma.category.findFirst({
      where: {
        id: data.categoryId,
        userId: req.userId,
      },
    });

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (category.type !== 'EXPENSE') {
      return res.status(400).json({ error: 'Budget can only be created for expense categories' });
    }

    const budget = await prisma.budget.create({
      data: {
        amount: data.amount,
        month: data.month,
        year: data.year,
        userId: req.userId,
        categoryId: data.categoryId,
      },
      include: {
        category: true,
      },
    });

    res.status(201).json(convertDecimalToNumber(budget));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Update budget
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    const data = updateBudgetSchema.parse(req.body);

    const existing = await prisma.budget.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    const budget = await prisma.budget.update({
      where: { id: req.params.id },
      data: {
        amount: data.amount,
      },
      include: {
        category: true,
      },
    });

    res.json(convertDecimalToNumber(budget));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Delete budget
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const existing = await prisma.budget.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    await prisma.budget.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Get budget history for a category
router.get('/history/:categoryId', authenticateToken, async (req: any, res) => {
  try {
    const { months = '6' } = req.query;
    const monthsCount = parseInt(months);

    const today = new Date();
    const history = [];

    for (let i = 0; i < monthsCount; i++) {
      const targetDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const month = targetDate.getMonth() + 1;
      const year = targetDate.getFullYear();

      // Get budget for this month
      const budget = await prisma.budget.findUnique({
        where: {
          userId_categoryId_month_year: {
            userId: req.userId,
            categoryId: req.params.categoryId,
            month,
            year,
          },
        },
      });

      // Get spent amount for this month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      const transactions = await prisma.transaction.aggregate({
        where: {
          userId: req.userId,
          categoryId: req.params.categoryId,
          type: 'EXPENSE',
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        _sum: {
          amount: true,
        },
      });

      const budgeted = Number(budget?.amount || 0);
      const spent = Number(transactions._sum.amount || 0);

      history.push({
        month,
        year,
        budgeted,
        spent,
        difference: budgeted - spent,
      });
    }

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Copy budgets from previous month
router.post('/copy-previous', authenticateToken, async (req: any, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    // Calculate previous month
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }

    // Get budgets from previous month
    const previousBudgets = await prisma.budget.findMany({
      where: {
        userId: req.userId,
        month: prevMonth,
        year: prevYear,
      },
    });

    if (previousBudgets.length === 0) {
      return res.status(404).json({ error: 'No budgets found in previous month' });
    }

    // Create budgets for current month (skip if already exists)
    const createdBudgets = [];
    for (const prevBudget of previousBudgets) {
      const existing = await prisma.budget.findUnique({
        where: {
          userId_categoryId_month_year: {
            userId: req.userId,
            categoryId: prevBudget.categoryId,
            month,
            year,
          },
        },
      });

      if (!existing) {
        const newBudget = await prisma.budget.create({
          data: {
            amount: prevBudget.amount,
            month,
            year,
            userId: req.userId,
            categoryId: prevBudget.categoryId,
          },
          include: {
            category: true,
          },
        });
        createdBudgets.push(newBudget);
      }
    }

    res.status(201).json(convertDecimalToNumber(createdBudgets));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

export default router;
