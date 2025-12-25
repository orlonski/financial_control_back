import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../server';
import { authenticateToken } from '../middleware/auth';
import { convertDecimalToNumber } from '../utils/decimal';
import { TransactionService } from '../services/transactionService';
import { Prisma } from '@prisma/client';

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

    if (creditCards.length === 0) {
      return res.json([]);
    }

    // Get all credit card IDs
    const cardIds = creditCards.map(card => card.id);

    // Build invoice due dates map for recurring charges calculation
    const today = new Date();
    const invoiceDueDates = new Map<string, Date>();
    creditCards.forEach(card => {
      invoiceDueDates.set(
        card.id,
        TransactionService.calculateCurrentInvoiceDueDate(today, card.closingDay, card.dueDay)
      );
    });

    // Single batch query: Get all unpaid non-recurring transactions grouped by credit card
    const nonRecurringUsage = await prisma.transaction.groupBy({
      by: ['creditCardId'],
      where: {
        creditCardId: { in: cardIds },
        paid: false,
        type: 'EXPENSE',
        isRecurringCharge: false
      },
      _sum: {
        amount: true
      }
    });

    // Create a map for quick lookup
    const nonRecurringMap = new Map<string, Prisma.Decimal>();
    nonRecurringUsage.forEach(item => {
      if (item.creditCardId) {
        nonRecurringMap.set(item.creditCardId, item._sum.amount || new Prisma.Decimal(0));
      }
    });

    // For recurring charges, we need to query by each card's invoice date
    // But we can batch this more efficiently by grouping cards with similar dates
    // For now, we'll do a single query for all recurring charges and filter in memory
    const recurringTransactions = await prisma.transaction.findMany({
      where: {
        creditCardId: { in: cardIds },
        paid: false,
        type: 'EXPENSE',
        isRecurringCharge: true
      },
      select: {
        creditCardId: true,
        amount: true,
        date: true
      }
    });

    // Calculate recurring usage per card (only if within current invoice)
    const recurringMap = new Map<string, Prisma.Decimal>();
    recurringTransactions.forEach(tx => {
      if (tx.creditCardId) {
        const invoiceDueDate = invoiceDueDates.get(tx.creditCardId);
        if (invoiceDueDate && tx.date <= invoiceDueDate) {
          const current = recurringMap.get(tx.creditCardId) || new Prisma.Decimal(0);
          recurringMap.set(tx.creditCardId, current.add(tx.amount));
        }
      }
    });

    // Combine results
    const cardsWithUsage = creditCards.map(card => {
      const nonRecurring = nonRecurringMap.get(card.id) || new Prisma.Decimal(0);
      const recurring = recurringMap.get(card.id) || new Prisma.Decimal(0);
      return {
        ...card,
        usedAmount: nonRecurring.add(recurring)
      };
    });

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

    // First check if card exists and belongs to user
    const existingCard = await prisma.creditCard.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId
      }
    });

    if (!existingCard) {
      return res.status(404).json({ error: 'Credit card not found' });
    }

    // Update and return in single query
    const updatedCreditCard = await prisma.creditCard.update({
      where: { id: req.params.id },
      data,
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
