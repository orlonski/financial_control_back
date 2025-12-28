import { Router } from 'express';
import { z } from 'zod';
import { TransactionService } from '../services/transactionService';
import { authenticateToken } from '../middleware/auth';
import { convertDecimalToNumber } from '../utils/decimal';
import { ForbiddenError } from '../errors/forbidden-error';

const router = Router();

// Validation schemas
const createTransactionSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.number().positive('Amount must be positive'),
  date: z.string().transform(str => new Date(str)),
  purchaseDate: z.string().transform(str => new Date(str)).optional(),
  description: z.string().min(1, 'Description is required'),
  notes: z.string().optional(),
  accountId: z.string().min(1, 'Account ID is required'),
  categoryId: z.string().min(1, 'Category ID is required'),
  creditCardId: z.string().optional(),
  installmentNumber: z.number().optional(),
  totalInstallments: z.number().optional(),
  isRecurringCharge: z.boolean().optional()
});

const createInstallmentSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.number().positive('Amount must be positive'),
  date: z.string().transform(str => new Date(str)),
  purchaseDate: z.string().transform(str => new Date(str)).optional(),
  description: z.string().min(1, 'Description is required'),
  notes: z.string().optional(),
  accountId: z.string().min(1, 'Account ID is required'),
  categoryId: z.string().min(1, 'Category ID is required'),
  creditCardId: z.string().optional(),
  totalInstallments: z.number().min(2).max(60, 'Installments must be between 2 and 60'),
  isRecurringCharge: z.boolean().optional()
});

const createRecurringSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.number().positive('Amount must be positive'),
  date: z.string().transform(str => new Date(str)),
  description: z.string().min(1, 'Description is required'),
  notes: z.string().optional(),
  accountId: z.string().min(1, 'Account ID is required'),
  categoryId: z.string().min(1, 'Category ID is required'),
  creditCardId: z.string().optional(),
  interval: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']),
  intervalCount: z.number().min(1).max(30, 'Interval count must be between 1 and 30'),
  endDate: z.string().transform(str => new Date(str)).optional(),
  isRecurringCharge: z.boolean().optional()
});

const updateTransactionSchema = createTransactionSchema.partial();

// Get transaction count
router.get('/count', authenticateToken, async (req: any, res) => {
  try {
    const result = await TransactionService.getTransactionCount(req.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get transactions
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const {
      accountId,
      categoryId,
      creditCardId,
      type,
      startDate,
      endDate,
      limit,
      offset
    } = req.query;

    const filters: any = {};
    
    if (accountId) filters.accountId = accountId;
    if (categoryId) filters.categoryId = categoryId;
    if (creditCardId) filters.creditCardId = creditCardId;
    if (type) filters.type = type;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (limit) filters.limit = parseInt(limit);
    if (offset) filters.offset = parseInt(offset);

    const transactions = await TransactionService.getTransactions(req.userId, filters);

    res.json(convertDecimalToNumber(transactions));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get transaction by ID
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const transaction = await TransactionService.getTransactionById(req.params.id, req.userId);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(convertDecimalToNumber(transaction));
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create single transaction
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const data = createTransactionSchema.parse(req.body);

    const transaction = await TransactionService.createTransaction({
      ...data,
      userId: req.userId
    });

    res.status(201).json(transaction);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Create installment transactions
router.post('/installments', authenticateToken, async (req: any, res) => {
  try {
    const data = createInstallmentSchema.parse(req.body);

    const transactions = await TransactionService.createInstallmentTransactions({
      ...data,
      userId: req.userId
    }, data.totalInstallments);

    res.status(201).json(transactions);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Create recurring transaction
router.post('/recurring', authenticateToken, async (req: any, res) => {
  try {
    const data = createRecurringSchema.parse(req.body);

    const result = await TransactionService.createRecurringTransactions({
      ...data,
      userId: req.userId
    }, data.interval, data.intervalCount, data.endDate);

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Update transaction
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    const data = updateTransactionSchema.parse(req.body);

    const transaction = await TransactionService.updateTransaction(
      req.params.id,
      req.userId,
      data
    );

    res.json(convertDecimalToNumber(transaction));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Delete transaction
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    await TransactionService.deleteTransaction(req.params.id, req.userId);

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Toggle transaction paid status
router.patch('/:id/paid', authenticateToken, async (req: any, res) => {
  try {
    const { paid, paidAt, accountId } = req.body;

    if (typeof paid !== 'boolean') {
      return res.status(400).json({ error: 'Paid field must be a boolean' });
    }

    const transaction = await TransactionService.updateTransactionPaidStatus(
      req.params.id,
      req.userId,
      paid,
      paidAt ? new Date(paidAt) : undefined,
      accountId
    );

    res.json(convertDecimalToNumber(transaction));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || 'Internal server error' });
  }
});

// Get transaction summary
router.get('/summary/period', authenticateToken, async (req: any, res) => {
  try {
    const { startDate, endDate, accountId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const summary = await TransactionService.getTransactionSummary(
      req.userId,
      new Date(startDate),
      new Date(endDate),
      accountId
    );

    res.json(convertDecimalToNumber(summary));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
