import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../server';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Get monthly statement (day by day with accumulated balance)
router.get('/monthly-statement', authenticateToken, async (req: any, res) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }

    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);

    // Get all transactions for the month
    const transactions = await prisma.transaction.findMany({
      where: {
        userId: req.userId,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true
          }
        },
        creditCard: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { date: 'asc' }
    });

    // Get all transfers for the month
    const transfers = await prisma.transfer.findMany({
      where: {
        userId: req.userId,
        date: {
          gte: startDate,
          lte: endDate
        }
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
      },
      orderBy: { date: 'asc' }
    });

    // Get initial balances for all accounts
    const accounts = await prisma.account.findMany({
      where: { userId: req.userId }
    });

    const initialBalances: { [key: string]: number } = {};
    
    for (const account of accounts) {
      // Calculate balance before the month
      const transactionsBefore = await prisma.transaction.findMany({
        where: {
          accountId: account.id,
          date: { lt: startDate }
        },
        select: { type: true, amount: true }
      });

      const transfersFromBefore = await prisma.transfer.findMany({
        where: {
          fromAccountId: account.id,
          date: { lt: startDate }
        },
        select: { amount: true }
      });

      const transfersToBefore = await prisma.transfer.findMany({
        where: {
          toAccountId: account.id,
          date: { lt: startDate }
        },
        select: { amount: true }
      });

      let balance = Number(account.initialBalance);

      transactionsBefore.forEach(transaction => {
        if (transaction.type === 'INCOME') {
          balance += Number(transaction.amount);
        } else {
          balance -= Number(transaction.amount);
        }
      });

      transfersFromBefore.forEach(transfer => {
        balance -= Number(transfer.amount);
      });

      transfersToBefore.forEach(transfer => {
        balance += Number(transfer.amount);
      });

      initialBalances[account.id] = balance;
    }

    // Group transactions by day
    const dailyTransactions: { [key: string]: any[] } = {};
    const dailyTransfers: { [key: string]: any[] } = {};

    transactions.forEach(transaction => {
      const day = transaction.date.toISOString().split('T')[0];
      if (!dailyTransactions[day]) {
        dailyTransactions[day] = [];
      }
      dailyTransactions[day].push(transaction);
    });

    transfers.forEach(transfer => {
      const day = transfer.date.toISOString().split('T')[0];
      if (!dailyTransfers[day]) {
        dailyTransfers[day] = [];
      }
      dailyTransfers[day].push(transfer);
    });

    // Calculate daily balances
    const dailyBalances: any[] = [];
    const currentBalances = { ...initialBalances };

    // Generate all days in the month
    const daysInMonth = endDate.getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(parseInt(year), parseInt(month) - 1, day);
      const dayString = currentDate.toISOString().split('T')[0];

      const dayTransactions = dailyTransactions[dayString] || [];
      const dayTransfers = dailyTransfers[dayString] || [];

      // Process transactions
      dayTransactions.forEach(transaction => {
        if (transaction.type === 'INCOME') {
          currentBalances[transaction.accountId] += Number(transaction.amount);
        } else {
          currentBalances[transaction.accountId] -= Number(transaction.amount);
        }
      });

      // Process transfers
      dayTransfers.forEach(transfer => {
        currentBalances[transfer.fromAccountId] -= Number(transfer.amount);
        currentBalances[transfer.toAccountId] += Number(transfer.amount);
      });

      // Calculate total balance
      const totalBalance = Object.values(currentBalances).reduce((sum, balance) => sum + balance, 0);

      dailyBalances.push({
        date: dayString,
        day: day,
        transactions: dayTransactions,
        transfers: dayTransfers,
        balances: { ...currentBalances },
        totalBalance
      });
    }

    res.json({
      month: parseInt(month),
      year: parseInt(year),
      dailyBalances,
      accounts: accounts.map(account => ({
        id: account.id,
        name: account.name,
        type: account.type,
        color: account.color
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get expenses by category
router.get('/by-category', authenticateToken, async (req: any, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        userId: req.userId,
        type: 'EXPENSE',
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true
          }
        }
      }
    });

    // Group by category
    const categoryTotals: { [key: string]: any } = {};

    transactions.forEach(transaction => {
      const categoryId = transaction.categoryId;
      if (!categoryTotals[categoryId]) {
        categoryTotals[categoryId] = {
          category: transaction.category,
          total: 0,
          count: 0,
          transactions: []
        };
      }
      categoryTotals[categoryId].total += Number(transaction.amount);
      categoryTotals[categoryId].count += 1;
      categoryTotals[categoryId].transactions.push(transaction);
    });

    const result = Object.values(categoryTotals).sort((a: any, b: any) => b.total - a.total);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get cash flow (income vs expense over time)
router.get('/cashflow', authenticateToken, async (req: any, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        userId: req.userId,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      },
      select: {
        type: true,
        amount: true,
        date: true
      },
      orderBy: { date: 'asc' }
    });

    // Group by period
    const groupedData: { [key: string]: { income: number; expense: number; balance: number } } = {};

    transactions.forEach(transaction => {
      let periodKey: string;
      
      if (groupBy === 'day') {
        periodKey = transaction.date.toISOString().split('T')[0];
      } else if (groupBy === 'week') {
        const weekStart = new Date(transaction.date);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        periodKey = weekStart.toISOString().split('T')[0];
      } else if (groupBy === 'month') {
        periodKey = `${transaction.date.getFullYear()}-${String(transaction.date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        periodKey = transaction.date.getFullYear().toString();
      }

      if (!groupedData[periodKey]) {
        groupedData[periodKey] = { income: 0, expense: 0, balance: 0 };
      }

      if (transaction.type === 'INCOME') {
        groupedData[periodKey].income += Number(transaction.amount);
      } else {
        groupedData[periodKey].expense += Number(transaction.amount);
      }
    });

    // Calculate cumulative balance
    const result = Object.entries(groupedData)
      .map(([period, data]) => ({
        period,
        income: data.income,
        expense: data.expense,
        balance: data.income - data.expense,
        cumulativeBalance: 0
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    // Calculate cumulative balance
    let cumulativeBalance = 0;
    result.forEach(item => {
      cumulativeBalance += item.balance;
      item.cumulativeBalance = cumulativeBalance;
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
