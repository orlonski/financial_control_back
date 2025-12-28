import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../server';
import { authenticateToken } from '../middleware/auth';
import { convertDecimalToNumber } from '../utils/decimal';
import { parseDateToBrazilTimezone } from '../utils/date';

const router = Router();

// Validation schemas
const createTransferSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  date: z.string().transform(str => parseDateToBrazilTimezone(str)),
  description: z.string().optional(),
  fromAccountId: z.string().min(1, 'From account ID is required'),
  toAccountId: z.string().min(1, 'To account ID is required')
}).refine(data => data.fromAccountId !== data.toAccountId, {
  message: 'From account and to account must be different',
  path: ['toAccountId']
});

const updateTransferSchema = z.object({
  amount: z.number().positive('Amount must be positive').optional(),
  date: z.string().transform(str => parseDateToBrazilTimezone(str)).optional(),
  description: z.string().optional(),
  fromAccountId: z.string().min(1, 'From account ID is required').optional(),
  toAccountId: z.string().min(1, 'To account ID is required').optional()
}).refine(data => !data.fromAccountId || !data.toAccountId || data.fromAccountId !== data.toAccountId, {
  message: 'From account and to account must be different',
  path: ['toAccountId']
});

// Get all transfers
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const transfers = await prisma.transfer.findMany({
      where: { userId: req.userId },
      include: {
        fromAccount: {
          select: {
            id: true,
            name: true,
            type: true
          }
        },
        toAccount: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    res.json(convertDecimalToNumber(transfers));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get transfer by ID
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const transfer = await prisma.transfer.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId
      },
      include: {
        fromAccount: {
          select: {
            id: true,
            name: true,
            type: true
          }
        },
        toAccount: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      }
    });

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    res.json(convertDecimalToNumber(transfer));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create transfer
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const data = createTransferSchema.parse(req.body);

    // Verify both accounts belong to user
    const accounts = await prisma.account.findMany({
      where: {
        id: { in: [data.fromAccountId, data.toAccountId] },
        userId: req.userId
      }
    });

    if (accounts.length !== 2) {
      return res.status(404).json({ error: 'One or both accounts not found' });
    }

    const transfer = await prisma.transfer.create({
      data: {
        ...data,
        userId: req.userId
      },
      include: {
        fromAccount: {
          select: {
            id: true,
            name: true,
            type: true
          }
        },
        toAccount: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      }
    });

    res.status(201).json(transfer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update transfer
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    const data = updateTransferSchema.parse(req.body);

    // First check if transfer exists and belongs to user
    const existingTransfer = await prisma.transfer.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId
      }
    });

    if (!existingTransfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    // If updating accounts, verify they belong to user
    if (data.fromAccountId || data.toAccountId) {
      const accountIds = [
        data.fromAccountId,
        data.toAccountId
      ].filter((id): id is string => Boolean(id));

      const accounts = await prisma.account.findMany({
        where: {
          id: { in: accountIds },
          userId: req.userId
        }
      });

      if (accounts.length !== accountIds.length) {
        return res.status(404).json({ error: 'One or more accounts not found' });
      }
    }

    // Update and return in single query
    const updatedTransfer = await prisma.transfer.update({
      where: { id: req.params.id },
      data,
      include: {
        fromAccount: {
          select: {
            id: true,
            name: true,
            type: true
          }
        },
        toAccount: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      }
    });

    res.json(convertDecimalToNumber(updatedTransfer));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete transfer
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const transfer = await prisma.transfer.deleteMany({
      where: {
        id: req.params.id,
        userId: req.userId
      }
    });

    if (transfer.count === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
