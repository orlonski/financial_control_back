import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../server';
import { authenticateToken } from '../middleware/auth';
import { convertDecimalToNumber } from '../utils/decimal';

const router = Router();

// Validation schemas
const createAccountSchema = z.object({
  name: z.string().min(1, 'Account name is required'),
  type: z.enum(['CHECKING', 'SAVINGS', 'CASH', 'INVESTMENT']),
  initialBalance: z.number().default(0),
  color: z.string().optional()
});

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Account name is required').optional(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CASH', 'INVESTMENT']).optional(),
  initialBalance: z.number().optional(),
  color: z.string().optional()
});

// Get all accounts
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(convertDecimalToNumber(accounts));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get account by ID
router.get('/:id', authenticateToken, async (req: any, res) => {
  try {
    const account = await prisma.account.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId
      }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json(convertDecimalToNumber(account));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create account
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const data = createAccountSchema.parse(req.body);

    const account = await prisma.account.create({
      data: {
        ...data,
        userId: req.userId
      }
    });

    res.status(201).json(account);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update account
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    const data = updateAccountSchema.parse(req.body);

    // First check if account exists and belongs to user
    const existingAccount = await prisma.account.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId
      }
    });

    if (!existingAccount) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Update and return in single query
    const updatedAccount = await prisma.account.update({
      where: { id: req.params.id },
      data
    });

    res.json(convertDecimalToNumber(updatedAccount));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete account
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const account = await prisma.account.deleteMany({
      where: {
        id: req.params.id,
        userId: req.userId
      }
    });

    if (account.count === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get account balance
router.get('/:id/balance', authenticateToken, async (req: any, res) => {
  try {
    const account = await prisma.account.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId
      }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Get current date (end of today)
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // Calculate current balance (only transactions/transfers up to today)
    const transactions = await prisma.transaction.findMany({
      where: {
        accountId: req.params.id,
        date: { lte: today }
      },
      select: { type: true, amount: true }
    });

    const transfersFrom = await prisma.transfer.findMany({
      where: {
        fromAccountId: req.params.id,
        date: { lte: today }
      },
      select: { amount: true }
    });

    const transfersTo = await prisma.transfer.findMany({
      where: {
        toAccountId: req.params.id,
        date: { lte: today }
      },
      select: { amount: true }
    });

    let balance = Number(account.initialBalance);

    // Add transactions
    transactions.forEach(transaction => {
      if (transaction.type === 'INCOME') {
        balance += Number(transaction.amount);
      } else {
        balance -= Number(transaction.amount);
      }
    });

    // Subtract outgoing transfers
    transfersFrom.forEach(transfer => {
      balance -= Number(transfer.amount);
    });

    // Add incoming transfers
    transfersTo.forEach(transfer => {
      balance += Number(transfer.amount);
    });

    res.json(convertDecimalToNumber({ balance }));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all accounts with balances (optionally at a specific date)
router.get('/balances/all', authenticateToken, async (req: any, res) => {
  try {
    const { endDate, accountId } = req.query;

    const accountWhere: any = { userId: req.userId };
    if (accountId) {
      accountWhere.id = accountId;
    }

    const accounts = await prisma.account.findMany({
      where: accountWhere,
      orderBy: { createdAt: 'desc' }
    });

    if (accounts.length === 0) {
      return res.json([]);
    }

    // Use provided end date or current date
    const targetDate = endDate ? new Date(endDate as string) : new Date();
    targetDate.setHours(23, 59, 59, 999);

    // Get all account IDs
    const accountIds = accounts.map(a => a.id);

    // Batch query: Get income transactions grouped by account
    const incomeByAccount = await prisma.transaction.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        date: { lte: targetDate },
        type: 'INCOME'
      },
      _sum: { amount: true }
    });

    // Batch query: Get expense transactions grouped by account
    const expenseByAccount = await prisma.transaction.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        date: { lte: targetDate },
        type: 'EXPENSE'
      },
      _sum: { amount: true }
    });

    // Batch query: Get outgoing transfers grouped by fromAccountId
    const transfersFromByAccount = await prisma.transfer.groupBy({
      by: ['fromAccountId'],
      where: {
        fromAccountId: { in: accountIds },
        date: { lte: targetDate }
      },
      _sum: { amount: true }
    });

    // Batch query: Get incoming transfers grouped by toAccountId
    const transfersToByAccount = await prisma.transfer.groupBy({
      by: ['toAccountId'],
      where: {
        toAccountId: { in: accountIds },
        date: { lte: targetDate }
      },
      _sum: { amount: true }
    });

    // Create maps for quick lookup
    const incomeMap = new Map(incomeByAccount.map(i => [i.accountId, Number(i._sum.amount || 0)]));
    const expenseMap = new Map(expenseByAccount.map(e => [e.accountId, Number(e._sum.amount || 0)]));
    const transfersFromMap = new Map(transfersFromByAccount.map(t => [t.fromAccountId, Number(t._sum.amount || 0)]));
    const transfersToMap = new Map(transfersToByAccount.map(t => [t.toAccountId, Number(t._sum.amount || 0)]));

    // Calculate balances using maps
    const accountsWithBalances = accounts.map(account => {
      const income = incomeMap.get(account.id) || 0;
      const expense = expenseMap.get(account.id) || 0;
      const transfersFrom = transfersFromMap.get(account.id) || 0;
      const transfersTo = transfersToMap.get(account.id) || 0;

      const balance = Number(account.initialBalance) + income - expense - transfersFrom + transfersTo;

      return {
        ...account,
        balance
      };
    });

    res.json(convertDecimalToNumber(accountsWithBalances));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
