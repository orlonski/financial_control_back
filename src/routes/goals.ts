import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { prisma } from '../server';
import { convertDecimalToNumber } from '../utils/decimal';

const router = Router();

// Validation schemas
const createGoalSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  targetAmount: z.number().positive('Target amount must be positive'),
  deadline: z.string().transform(str => new Date(str)),
  accountId: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

const updateGoalSchema = createGoalSchema.partial();

const createContributionSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  date: z.string().transform(str => new Date(str)),
  notes: z.string().optional(),
});

// Helper function to calculate goal progress
function calculateProgress(currentAmount: number, targetAmount: number, deadline: Date) {
  const percentage = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
  const remaining = Math.max(0, targetAmount - currentAmount);

  const today = new Date();
  const deadlineDate = new Date(deadline);
  const daysLeft = Math.max(0, Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  // Calculate months left (approximate)
  const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30));
  const monthlyNeeded = remaining / monthsLeft;

  // Check if on track (has enough time to reach goal at current pace)
  const isOnTrack = percentage >= 100 || (remaining <= 0) || (monthlyNeeded * monthsLeft >= remaining);

  return {
    percentage: Math.min(100, percentage),
    remaining,
    daysLeft,
    monthlyNeeded,
    isOnTrack,
  };
}

// Get all goals
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const { status } = req.query;

    const where: any = { userId: req.userId };

    if (status) {
      where.status = status;
    }

    const goals = await prisma.goal.findMany({
      where,
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: { deadline: 'asc' },
    });

    // Add progress to each goal
    const goalsWithProgress = goals.map(goal => ({
      ...goal,
      progress: calculateProgress(
        Number(goal.currentAmount),
        Number(goal.targetAmount),
        goal.deadline
      ),
    }));

    res.json(convertDecimalToNumber(goalsWithProgress));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get goal by ID with progress
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const goal = await prisma.goal.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        contributions: {
          orderBy: { date: 'desc' },
          take: 5,
        },
      },
    });

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const progress = calculateProgress(
      Number(goal.currentAmount),
      Number(goal.targetAmount),
      goal.deadline
    );

    res.json(convertDecimalToNumber({ ...goal, progress }));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create goal
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const data = createGoalSchema.parse(req.body);

    // Verify account belongs to user if provided
    if (data.accountId) {
      const account = await prisma.account.findFirst({
        where: {
          id: data.accountId,
          userId: req.userId,
        },
      });

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }
    }

    const goal = await prisma.goal.create({
      data: {
        name: data.name,
        targetAmount: data.targetAmount,
        currentAmount: 0,
        deadline: data.deadline,
        color: data.color,
        icon: data.icon,
        status: 'ACTIVE',
        userId: req.userId,
        accountId: data.accountId || null,
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    const progress = calculateProgress(0, Number(goal.targetAmount), goal.deadline);

    res.status(201).json(convertDecimalToNumber({ ...goal, progress }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Update goal
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    const data = updateGoalSchema.parse(req.body);

    const existing = await prisma.goal.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    // Verify account belongs to user if provided
    if (data.accountId) {
      const account = await prisma.account.findFirst({
        where: {
          id: data.accountId,
          userId: req.userId,
        },
      });

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }
    }

    const goal = await prisma.goal.update({
      where: { id: req.params.id },
      data: {
        name: data.name,
        targetAmount: data.targetAmount,
        deadline: data.deadline,
        color: data.color,
        icon: data.icon,
        accountId: data.accountId,
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    const progress = calculateProgress(
      Number(goal.currentAmount),
      Number(goal.targetAmount),
      goal.deadline
    );

    res.json(convertDecimalToNumber({ ...goal, progress }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Delete goal
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const existing = await prisma.goal.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    await prisma.goal.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Add contribution to goal
router.post('/:id/contributions', authenticateToken, async (req: any, res) => {
  try {
    const data = createContributionSchema.parse(req.body);

    const goal = await prisma.goal.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    if (goal.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Cannot add contribution to inactive goal' });
    }

    // Create contribution and update goal amount in a transaction
    const [contribution, updatedGoal] = await prisma.$transaction([
      prisma.goalContribution.create({
        data: {
          amount: data.amount,
          date: data.date,
          notes: data.notes,
          goalId: req.params.id,
        },
      }),
      prisma.goal.update({
        where: { id: req.params.id },
        data: {
          currentAmount: {
            increment: data.amount,
          },
        },
      }),
    ]);

    // Check if goal is now completed
    const newCurrentAmount = Number(updatedGoal.currentAmount);
    const targetAmount = Number(updatedGoal.targetAmount);

    if (newCurrentAmount >= targetAmount && updatedGoal.status === 'ACTIVE') {
      await prisma.goal.update({
        where: { id: req.params.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    }

    res.status(201).json(convertDecimalToNumber(contribution));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Get all contributions for a goal
router.get('/:id/contributions', authenticateToken, async (req: any, res) => {
  try {
    const goal = await prisma.goal.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const contributions = await prisma.goalContribution.findMany({
      where: {
        goalId: req.params.id,
      },
      orderBy: { date: 'desc' },
    });

    res.json(convertDecimalToNumber(contributions));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark goal as completed
router.patch('/:id/complete', authenticateToken, async (req: any, res) => {
  try {
    const existing = await prisma.goal.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const goal = await prisma.goal.update({
      where: { id: req.params.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    res.json(convertDecimalToNumber(goal));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Cancel goal
router.patch('/:id/cancel', authenticateToken, async (req: any, res) => {
  try {
    const existing = await prisma.goal.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const goal = await prisma.goal.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELLED',
      },
    });

    res.json(convertDecimalToNumber(goal));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

export default router;
