import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { prisma } from '../server';
import { convertDecimalToNumber } from '../utils/decimal';
import { parseDateToBrazilTimezone } from '../utils/date';

const router = Router();

// Validation schemas
const createRecurringSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required'),
  interval: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']),
  intervalCount: z.number().min(1).max(30, 'Interval count must be between 1 and 30'),
  startDate: z.string().transform(str => parseDateToBrazilTimezone(str)),
  endDate: z.string().transform(str => parseDateToBrazilTimezone(str)).optional(),
  accountId: z.string().min(1, 'Account ID is required'),
  categoryId: z.string().min(1, 'Category ID is required'),
  creditCardId: z.string().optional(),
});

const updateRecurringSchema = createRecurringSchema.partial();

// Helper function to calculate next due date
function calculateNextDueDate(
  startDate: Date,
  interval: string,
  intervalCount: number,
  lastDate?: Date
): Date {
  const baseDate = lastDate || startDate;
  const nextDate = new Date(baseDate);

  switch (interval) {
    case 'DAY':
      nextDate.setDate(nextDate.getDate() + intervalCount);
      break;
    case 'WEEK':
      nextDate.setDate(nextDate.getDate() + (intervalCount * 7));
      break;
    case 'MONTH':
      nextDate.setMonth(nextDate.getMonth() + intervalCount);
      break;
    case 'YEAR':
      nextDate.setFullYear(nextDate.getFullYear() + intervalCount);
      break;
  }

  return nextDate;
}

// Get all recurring transactions
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const { includeInactive } = req.query;

    const where: any = { userId: req.userId };

    if (!includeInactive || includeInactive === 'false') {
      where.isActive = true;
    }

    const recurrences = await prisma.recurrence.findMany({
      where,
      orderBy: { nextDueDate: 'asc' },
    });

    res.json(convertDecimalToNumber(recurrences));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recurring transaction by ID
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const recurrence = await prisma.recurrence.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!recurrence) {
      return res.status(404).json({ error: 'Recurring transaction not found' });
    }

    res.json(convertDecimalToNumber(recurrence));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Número de meses para gerar transações futuras
const MONTHS_TO_GENERATE = 12;

// Create recurring transaction
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const data = createRecurringSchema.parse(req.body);

    // Calcular a última data de geração (12 meses à frente ou endDate, o que vier primeiro)
    const maxFutureDate = new Date();
    maxFutureDate.setMonth(maxFutureDate.getMonth() + MONTHS_TO_GENERATE);

    const effectiveEndDate = data.endDate && data.endDate < maxFutureDate
      ? data.endDate
      : maxFutureDate;

    // Gerar todas as datas de transação
    const transactionDates: Date[] = [];
    let currentDate = new Date(data.startDate);

    while (currentDate <= effectiveEndDate) {
      transactionDates.push(new Date(currentDate));
      currentDate = calculateNextDueDate(data.startDate, data.interval, data.intervalCount, currentDate);
    }

    // Próxima data após a última gerada (para continuar gerando no futuro)
    const nextDueDate = currentDate;

    // Criar recorrência e transações em uma transação do banco
    const result = await prisma.$transaction(async (tx) => {
      // Criar a recorrência
      const recurrence = await tx.recurrence.create({
        data: {
          type: data.type,
          interval: data.interval,
          intervalCount: data.intervalCount,
          startDate: data.startDate,
          endDate: data.endDate,
          nextDueDate,
          description: data.description,
          amount: data.amount,
          isActive: true,
          accountId: data.accountId,
          categoryId: data.categoryId,
          creditCardId: data.creditCardId || null,
          userId: req.userId,
        },
      });

      // Criar transações para os próximos 12 meses
      const transactions = await Promise.all(
        transactionDates.map((date) =>
          tx.transaction.create({
            data: {
              type: data.type,
              amount: data.amount,
              date,
              description: data.description,
              accountId: data.accountId,
              categoryId: data.categoryId,
              creditCardId: data.creditCardId || null,
              recurrenceId: recurrence.id,
              userId: req.userId,
              paid: false,
              isRecurringCharge: true, // Marca como recorrente (limite só da fatura atual)
            },
          })
        )
      );

      return { recurrence, transactions };
    });

    res.status(201).json({
      ...convertDecimalToNumber(result.recurrence),
      generatedTransactions: result.transactions.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Update recurring transaction
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    const data = updateRecurringSchema.parse(req.body);

    const existing = await prisma.recurrence.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Recurring transaction not found' });
    }

    const updateData: any = {};

    if (data.type) updateData.type = data.type;
    if (data.interval) updateData.interval = data.interval;
    if (data.intervalCount) updateData.intervalCount = data.intervalCount;
    if (data.startDate) updateData.startDate = data.startDate;
    if (data.endDate !== undefined) updateData.endDate = data.endDate;
    if (data.description) updateData.description = data.description;
    if (data.amount) updateData.amount = data.amount;
    if (data.accountId) updateData.accountId = data.accountId;
    if (data.categoryId) updateData.categoryId = data.categoryId;
    if (data.creditCardId !== undefined) updateData.creditCardId = data.creditCardId || null;

    // Recalculate next due date if interval changed
    if (data.interval || data.intervalCount || data.startDate) {
      updateData.nextDueDate = calculateNextDueDate(
        data.startDate || existing.startDate,
        data.interval || existing.interval,
        data.intervalCount || existing.intervalCount
      );
    }

    const recurrence = await prisma.recurrence.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json(convertDecimalToNumber(recurrence));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Delete recurring transaction
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const existing = await prisma.recurrence.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Recurring transaction not found' });
    }

    await prisma.recurrence.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Pause recurring transaction
router.patch('/:id/pause', authenticateToken, async (req: any, res) => {
  try {
    const existing = await prisma.recurrence.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Recurring transaction not found' });
    }

    const recurrence = await prisma.recurrence.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json(convertDecimalToNumber(recurrence));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Resume recurring transaction
router.patch('/:id/resume', authenticateToken, async (req: any, res) => {
  try {
    const existing = await prisma.recurrence.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Recurring transaction not found' });
    }

    // Recalculate next due date from today
    const today = new Date();
    let nextDueDate = existing.nextDueDate || existing.startDate;

    while (nextDueDate < today) {
      nextDueDate = calculateNextDueDate(
        existing.startDate,
        existing.interval,
        existing.intervalCount,
        nextDueDate
      );
    }

    const recurrence = await prisma.recurrence.update({
      where: { id: req.params.id },
      data: {
        isActive: true,
        nextDueDate,
      },
    });

    res.json(convertDecimalToNumber(recurrence));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Generate/extend recurring transactions up to 12 months ahead
router.post('/generate', authenticateToken, async (req: any, res) => {
  try {
    // Data limite: 12 meses à frente
    const maxFutureDate = new Date();
    maxFutureDate.setMonth(maxFutureDate.getMonth() + MONTHS_TO_GENERATE);

    // Buscar todas as recorrências ativas que precisam de extensão
    const activeRecurrences = await prisma.recurrence.findMany({
      where: {
        userId: req.userId,
        isActive: true,
        nextDueDate: { lte: maxFutureDate },
        OR: [
          { endDate: null },
          { endDate: { gte: new Date() } },
        ],
      },
    });

    const generatedTransactions = [];

    for (const recurrence of activeRecurrences) {
      if (!recurrence.amount || !recurrence.accountId || !recurrence.categoryId) {
        continue;
      }

      // Calcular data efetiva de fim
      const effectiveEndDate = recurrence.endDate && recurrence.endDate < maxFutureDate
        ? recurrence.endDate
        : maxFutureDate;

      // Gerar transações do nextDueDate até effectiveEndDate
      const transactionDates: Date[] = [];
      let currentDate = recurrence.nextDueDate ? new Date(recurrence.nextDueDate) : new Date(recurrence.startDate);

      while (currentDate <= effectiveEndDate) {
        transactionDates.push(new Date(currentDate));
        currentDate = calculateNextDueDate(
          recurrence.startDate,
          recurrence.interval,
          recurrence.intervalCount,
          currentDate
        );
      }

      // Criar transações
      const transactionType = recurrence.type === 'INCOME' ? 'INCOME' : 'EXPENSE';

      for (const date of transactionDates) {
        // Verificar se já existe transação para essa data
        const existingTransaction = await prisma.transaction.findFirst({
          where: {
            recurrenceId: recurrence.id,
            date: {
              gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
              lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
            },
          },
        });

        if (!existingTransaction) {
          const transaction = await prisma.transaction.create({
            data: {
              type: transactionType,
              amount: recurrence.amount,
              date,
              description: recurrence.description || 'Transação recorrente',
              accountId: recurrence.accountId,
              categoryId: recurrence.categoryId,
              creditCardId: recurrence.creditCardId,
              recurrenceId: recurrence.id,
              userId: req.userId,
              paid: false,
              isRecurringCharge: true,
            },
          });

          generatedTransactions.push(transaction);
        }
      }

      // Atualizar nextDueDate para a próxima data após maxFutureDate
      await prisma.recurrence.update({
        where: { id: recurrence.id },
        data: { nextDueDate: currentDate },
      });
    }

    res.json({
      generated: generatedTransactions.length,
      transactions: convertDecimalToNumber(generatedTransactions),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Get transactions generated by a recurring
router.get('/:id/transactions', authenticateToken, async (req: any, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: {
        recurrenceId: req.params.id,
        userId: req.userId,
      },
      orderBy: { date: 'desc' },
      include: {
        account: true,
        category: true,
        creditCard: true,
      },
    });

    res.json(convertDecimalToNumber(transactions));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
