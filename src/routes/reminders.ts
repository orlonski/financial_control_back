import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { prisma } from '../server';
import { convertDecimalToNumber } from '../utils/decimal';
import { parseDateToBrazilTimezone } from '../utils/date';

const router = Router();

// Validation schemas
const createReminderSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  amount: z.number().positive('Amount must be positive'),
  dueDate: z.string().transform(str => parseDateToBrazilTimezone(str)),
  reminderDays: z.number().min(0).max(30).default(3),
  creditCardId: z.string().optional(),
  isRecurring: z.boolean().default(false),
});

const updateReminderSchema = createReminderSchema.partial();

// Get all reminders
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const { status } = req.query;

    const where: any = { userId: req.userId };

    if (status) {
      where.status = status;
    }

    const reminders = await prisma.reminder.findMany({
      where,
      include: {
        creditCard: {
          select: {
            id: true,
            name: true,
            dueDay: true,
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    res.json(convertDecimalToNumber(reminders));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pending reminders (due within X days)
router.get('/pending', authenticateToken, async (req: any, res) => {
  try {
    const { daysAhead = '7' } = req.query;
    const days = parseInt(daysAhead);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + days);
    futureDate.setHours(23, 59, 59, 999);

    // Also check for overdue reminders
    const reminders = await prisma.reminder.findMany({
      where: {
        userId: req.userId,
        status: 'PENDING',
        dueDate: { lte: futureDate },
      },
      include: {
        creditCard: {
          select: {
            id: true,
            name: true,
            dueDay: true,
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Calculate days until due and check if overdue
    const remindersWithStatus = reminders.map(reminder => {
      const dueDate = new Date(reminder.dueDate);
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isOverdue = daysUntilDue < 0;

      return {
        reminderId: reminder.id,
        daysUntilDue,
        isOverdue,
        reminder,
      };
    });

    res.json(convertDecimalToNumber(remindersWithStatus));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get reminder by ID
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const reminder = await prisma.reminder.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
      include: {
        creditCard: {
          select: {
            id: true,
            name: true,
            dueDay: true,
          },
        },
        transaction: true,
      },
    });

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.json(convertDecimalToNumber(reminder));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create reminder
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const data = createReminderSchema.parse(req.body);

    // Verify credit card belongs to user if provided
    if (data.creditCardId) {
      const creditCard = await prisma.creditCard.findFirst({
        where: {
          id: data.creditCardId,
          userId: req.userId,
        },
      });

      if (!creditCard) {
        return res.status(404).json({ error: 'Credit card not found' });
      }
    }

    const reminder = await prisma.reminder.create({
      data: {
        title: data.title,
        description: data.description,
        amount: data.amount,
        dueDate: data.dueDate,
        reminderDays: data.reminderDays,
        isRecurring: data.isRecurring,
        status: 'PENDING',
        userId: req.userId,
        creditCardId: data.creditCardId || null,
      },
      include: {
        creditCard: {
          select: {
            id: true,
            name: true,
            dueDay: true,
          },
        },
      },
    });

    res.status(201).json(convertDecimalToNumber(reminder));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Update reminder
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    const data = updateReminderSchema.parse(req.body);

    const existing = await prisma.reminder.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    // Verify credit card belongs to user if provided
    if (data.creditCardId) {
      const creditCard = await prisma.creditCard.findFirst({
        where: {
          id: data.creditCardId,
          userId: req.userId,
        },
      });

      if (!creditCard) {
        return res.status(404).json({ error: 'Credit card not found' });
      }
    }

    const reminder = await prisma.reminder.update({
      where: { id: req.params.id },
      data: {
        title: data.title,
        description: data.description,
        amount: data.amount,
        dueDate: data.dueDate,
        reminderDays: data.reminderDays,
        isRecurring: data.isRecurring,
        creditCardId: data.creditCardId,
      },
      include: {
        creditCard: {
          select: {
            id: true,
            name: true,
            dueDay: true,
          },
        },
      },
    });

    res.json(convertDecimalToNumber(reminder));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Delete reminder
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const existing = await prisma.reminder.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    await prisma.reminder.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Mark reminder as paid
router.patch('/:id/paid', authenticateToken, async (req: any, res) => {
  try {
    const { transactionId } = req.body;

    const existing = await prisma.reminder.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    // Verify transaction belongs to user if provided
    if (transactionId) {
      const transaction = await prisma.transaction.findFirst({
        where: {
          id: transactionId,
          userId: req.userId,
        },
      });

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
    }

    const reminder = await prisma.reminder.update({
      where: { id: req.params.id },
      data: {
        status: 'PAID',
        transactionId: transactionId || null,
      },
    });

    res.json(convertDecimalToNumber(reminder));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Dismiss reminder
router.patch('/:id/dismiss', authenticateToken, async (req: any, res) => {
  try {
    const existing = await prisma.reminder.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    const reminder = await prisma.reminder.update({
      where: { id: req.params.id },
      data: {
        status: 'DISMISSED',
      },
    });

    res.json(convertDecimalToNumber(reminder));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Get credit card reminders (auto-generated based on credit card due dates)
router.get('/credit-cards/upcoming', authenticateToken, async (req: any, res) => {
  try {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Get all credit cards for the user
    const creditCards = await prisma.creditCard.findMany({
      where: { userId: req.userId },
      include: {
        account: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const upcomingInvoices = [];

    for (const card of creditCards) {
      // Calculate next due date
      let dueDate = new Date(currentYear, currentMonth, card.dueDay);

      // If due date has passed this month, use next month
      if (dueDate < today) {
        dueDate = new Date(currentYear, currentMonth + 1, card.dueDay);
      }

      // Calculate invoice start and end dates based on closing day
      let invoiceStartDate: Date;
      let invoiceEndDate: Date;

      if (card.closingDay >= card.dueDay) {
        // Closing is in the same month as due date
        invoiceStartDate = new Date(dueDate.getFullYear(), dueDate.getMonth() - 1, card.closingDay + 1);
        invoiceEndDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), card.closingDay);
      } else {
        // Closing is in the previous month
        invoiceStartDate = new Date(dueDate.getFullYear(), dueDate.getMonth() - 1, card.closingDay + 1);
        invoiceEndDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), card.closingDay);
      }

      // Get total for current invoice
      const invoiceTotal = await prisma.transaction.aggregate({
        where: {
          creditCardId: card.id,
          userId: req.userId,
          date: {
            gte: invoiceStartDate,
            lte: invoiceEndDate,
          },
        },
        _sum: {
          amount: true,
        },
      });

      const amount = Number(invoiceTotal._sum.amount || 0);
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      upcomingInvoices.push({
        creditCardId: card.id,
        creditCardName: card.name,
        accountName: card.account.name,
        dueDate,
        daysUntilDue,
        amount,
        invoiceStartDate,
        invoiceEndDate,
      });
    }

    // Sort by due date
    upcomingInvoices.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    res.json(upcomingInvoices);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
