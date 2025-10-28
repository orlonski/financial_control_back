import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../server';
import { authenticateToken } from '../middleware/auth';
import { convertDecimalToNumber } from '../utils/decimal';

const router = Router();

// Validation schemas
const createCreditCardSchema = z.object({
  name: z.string().min(1, 'Credit card name is required'),
  closingDay: z.number().min(1).max(31, 'Closing day must be between 1 and 31'),
  dueDay: z.number().min(1).max(31, 'Due day must be between 1 and 31'),
  limit: z.number().optional(),
  accountId: z.string().min(1, 'Account ID is required')
});

const updateCreditCardSchema = z.object({
  name: z.string().min(1, 'Credit card name is required').optional(),
  closingDay: z.number().min(1).max(31, 'Closing day must be between 1 and 31').optional(),
  dueDay: z.number().min(1).max(31, 'Due day must be between 1 and 31').optional(),
  limit: z.number().optional(),
  accountId: z.string().min(1, 'Account ID is required').optional()
});

// Get all credit cards
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const creditCards = await prisma.creditCard.findMany({
      where: { userId: req.userId },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate used amount for each card (sum of unpaid transactions)
    const cardsWithUsage = await Promise.all(
      creditCards.map(async (card) => {
        const unpaidTransactions = await prisma.transaction.aggregate({
          where: {
            creditCardId: card.id,
            paid: false,
            type: 'EXPENSE'
          },
          _sum: {
            amount: true
          }
        });

        return {
          ...card,
          usedAmount: unpaidTransactions._sum.amount || 0
        };
      })
    );

    res.json(convertDecimalToNumber(cardsWithUsage));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get credit card by ID
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const creditCard = await prisma.creditCard.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      }
    });

    if (!creditCard) {
      return res.status(404).json({ error: 'Credit card not found' });
    }

    res.json(convertDecimalToNumber(creditCard));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create credit card
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const data = createCreditCardSchema.parse(req.body);

    // Verify account belongs to user
    const account = await prisma.account.findFirst({
      where: {
        id: data.accountId,
        userId: req.userId
      }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const creditCard = await prisma.creditCard.create({
      data: {
        ...data,
        userId: req.userId
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      }
    });

    res.status(201).json(creditCard);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update credit card
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    const data = updateCreditCardSchema.parse(req.body);

    // If accountId is being updated, verify it belongs to user
    if (data.accountId) {
      const account = await prisma.account.findFirst({
        where: {
          id: data.accountId,
          userId: req.userId
        }
      });

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }
    }

    const creditCard = await prisma.creditCard.updateMany({
      where: {
        id: req.params.id,
        userId: req.userId
      },
      data
    });

    if (creditCard.count === 0) {
      return res.status(404).json({ error: 'Credit card not found' });
    }

    const updatedCreditCard = await prisma.creditCard.findUnique({
      where: { id: req.params.id },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      }
    });

    res.json(convertDecimalToNumber(updatedCreditCard));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete credit card
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const creditCard = await prisma.creditCard.deleteMany({
      where: {
        id: req.params.id,
        userId: req.userId
      }
    });

    if (creditCard.count === 0) {
      return res.status(404).json({ error: 'Credit card not found' });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
