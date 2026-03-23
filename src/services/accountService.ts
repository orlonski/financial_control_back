import { prisma } from '../server';
import { convertDecimalToNumber } from '../utils/decimal';

export interface AccountWithBalance {
  id: string;
  name: string;
  type: string;
  color: string | null;
  initialBalance: number;
  balance: number;
}

export class AccountService {
  static async getAccountsWithBalances(userId: string): Promise<AccountWithBalance[]> {
    const accounts = await prisma.account.findMany({
      where: { userId },
      orderBy: { name: 'asc' }
    });

    if (accounts.length === 0) {
      return [];
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const accountIds = accounts.map(a => a.id);

    const [incomeResult, expenseResult, transfersFromResult, transfersToResult] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['accountId'],
        where: {
          accountId: { in: accountIds },
          date: { lte: today },
          type: 'INCOME'
        },
        _sum: { amount: true }
      }),
      prisma.transaction.groupBy({
        by: ['accountId'],
        where: {
          accountId: { in: accountIds },
          date: { lte: today },
          type: 'EXPENSE'
        },
        _sum: { amount: true }
      }),
      prisma.transfer.groupBy({
        by: ['fromAccountId'],
        where: {
          fromAccountId: { in: accountIds },
          date: { lte: today }
        },
        _sum: { amount: true }
      }),
      prisma.transfer.groupBy({
        by: ['toAccountId'],
        where: {
          toAccountId: { in: accountIds },
          date: { lte: today }
        },
        _sum: { amount: true }
      })
    ]);

    const incomeMap = new Map(incomeResult.map(i => [i.accountId, Number(i._sum.amount || 0)]));
    const expenseMap = new Map(expenseResult.map(e => [e.accountId, Number(e._sum.amount || 0)]));
    const transfersFromMap = new Map(transfersFromResult.map(t => [t.fromAccountId, Number(t._sum.amount || 0)]));
    const transfersToMap = new Map(transfersToResult.map(t => [t.toAccountId, Number(t._sum.amount || 0)]));

    const accountsWithBalances = accounts.map(account => {
      const income = incomeMap.get(account.id) || 0;
      const expense = expenseMap.get(account.id) || 0;
      const transfersFrom = transfersFromMap.get(account.id) || 0;
      const transfersTo = transfersToMap.get(account.id) || 0;

      const balance = Number(account.initialBalance) + income - expense - transfersFrom + transfersTo;

      return {
        id: account.id,
        name: account.name,
        type: account.type,
        color: account.color,
        initialBalance: Number(account.initialBalance),
        balance
      };
    });

    return convertDecimalToNumber(accountsWithBalances);
  }
}
