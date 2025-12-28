import { PrismaClient } from '@prisma/client';
import { ForbiddenError } from '../errors/forbidden-error';

const prisma = new PrismaClient();

export interface CreateTransactionData {
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  date: Date;
  purchaseDate?: Date;
  description: string;
  notes?: string;
  accountId: string;
  categoryId: string;
  creditCardId?: string;
  installmentNumber?: number;
  totalInstallments?: number;
  recurrenceId?: string;
  isRecurringCharge?: boolean;
  userId: string;
}

export class TransactionService {
  /**
   * Normalize date to ensure it has consistent time (03:00:00 UTC)
   * This avoids timezone issues when working with dates
   */
  static normalizeDate(date: Date): Date {
    const normalized = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      3, 0, 0, 0
    ));
    return normalized;
  }

  /**
   * Calculate the invoice due date for a credit card transaction
   * @param purchaseDate - Date when the purchase was made
   * @param closingDay - Day when the invoice closes (1-31)
   * @param dueDay - Day when the invoice is due (1-31)
   * @returns Date when the transaction should appear (invoice due date)
   */
  static calculateInvoiceDueDate(
    purchaseDate: Date,
    closingDay: number,
    dueDay: number
  ): Date {
    const purchaseDay = purchaseDate.getDate();

    // If purchase day <= closing day, it goes to current month's invoice
    // If purchase day > closing day, it goes to next month's invoice
    const invoiceMonth = purchaseDay <= closingDay
      ? purchaseDate.getMonth()
      : purchaseDate.getMonth() + 1;

    const invoiceYear = purchaseDate.getFullYear();

    // Handle month overflow (12 -> 0, year++)
    const finalMonth = invoiceMonth > 11 ? 0 : invoiceMonth;
    const finalYear = invoiceMonth > 11 ? invoiceYear + 1 : invoiceYear;

    return new Date(finalYear, finalMonth, dueDay);
  }

  /**
   * Calculate the current invoice due date for a credit card
   * This determines which invoice is currently "open" based on today's date
   * @param today - Current date
   * @param closingDay - Day when the invoice closes (1-31)
   * @param dueDay - Day when the invoice is due (1-31)
   * @returns Date of the current invoice's due date
   */
  static calculateCurrentInvoiceDueDate(
    today: Date,
    closingDay: number,
    dueDay: number
  ): Date {
    const todayDay = today.getDate();
    let invoiceMonth = today.getMonth();
    let invoiceYear = today.getFullYear();

    // If today > closing day, the current invoice is for next month
    if (todayDay > closingDay) {
      invoiceMonth += 1;
      if (invoiceMonth > 11) {
        invoiceMonth = 0;
        invoiceYear += 1;
      }
    }

    return new Date(invoiceYear, invoiceMonth, dueDay);
  }

  /**
   * Check if a date is today (comparing only year, month, day)
   */
  static isToday(date: Date): boolean {
    const today = new Date();
    return (
      date.getUTCFullYear() === today.getFullYear() &&
      date.getUTCMonth() === today.getMonth() &&
      date.getUTCDate() === today.getDate()
    );
  }

  /**
   * Create a single transaction
   */
  static async createTransaction(data: CreateTransactionData) {
    // Normalize dates to avoid timezone issues
    let transactionDate = this.normalizeDate(data.date);
    let purchaseDate = data.purchaseDate ? this.normalizeDate(data.purchaseDate) : undefined;

    // If it's a credit card transaction, calculate the invoice due date
    if (data.creditCardId) {
      const creditCard = await prisma.creditCard.findUnique({
        where: { id: data.creditCardId }
      });

      if (!creditCard) {
        throw new Error('Credit card not found');
      }

      // Use purchase date or transaction date as purchase date
      const actualPurchaseDate = purchaseDate || transactionDate;

      // Calculate when this transaction should appear (invoice due date)
      transactionDate = this.calculateInvoiceDueDate(
        actualPurchaseDate,
        creditCard.closingDay,
        creditCard.dueDay
      );

      // Normalize the calculated invoice due date
      transactionDate = this.normalizeDate(transactionDate);

      purchaseDate = actualPurchaseDate;
    }

    // Auto-mark as paid: EXPENSE without credit card and date is today
    const shouldAutoPay = !data.creditCardId &&
                          data.type === 'EXPENSE' &&
                          this.isToday(transactionDate);

    return await prisma.transaction.create({
      data: {
        type: data.type,
        amount: data.amount,
        date: transactionDate,
        purchaseDate: purchaseDate,
        description: data.description,
        notes: data.notes,
        paid: shouldAutoPay,
        paidAt: shouldAutoPay ? new Date() : null,
        accountId: data.accountId,
        categoryId: data.categoryId,
        creditCardId: data.creditCardId || undefined,
        installmentNumber: data.installmentNumber,
        totalInstallments: data.totalInstallments,
        recurrenceId: data.recurrenceId,
        isRecurringCharge: data.isRecurringCharge || false,
        userId: data.userId
      }
    });
  }

  /**
   * Create installment transactions for credit card purchases or recurring transactions
   */
  static async createInstallmentTransactions(
    data: Omit<CreateTransactionData, 'installmentNumber' | 'totalInstallments'>,
    totalInstallments: number
  ) {
    // Normalize the purchase date to avoid timezone issues
    const purchaseDate = this.normalizeDate(data.purchaseDate || data.date);
    // Keep the amount as is (don't divide) - user enters the amount per installment
    const installmentAmount = data.amount;
    const transactions = [];

    // Get credit card if provided
    let creditCard = null;
    if (data.creditCardId) {
      creditCard = await prisma.creditCard.findUnique({
        where: { id: data.creditCardId }
      });

      if (!creditCard) {
        throw new Error('Credit card not found');
      }
    }

    // Create recurrence record
    const recurrence = await prisma.recurrence.create({
      data: {
        type: 'INSTALLMENT',
        interval: 'MONTH',
        intervalCount: 1,
        startDate: purchaseDate,
        totalInstallments: totalInstallments
      }
    });

    // Create each installment
    for (let i = 1; i <= totalInstallments; i++) {
      // Calculate installment date by adding months properly
      const monthsToAdd = i - 1;

      // Extract date components in UTC to avoid timezone issues
      const originalDay = purchaseDate.getUTCDate();
      const originalMonth = purchaseDate.getUTCMonth();
      const originalYear = purchaseDate.getUTCFullYear();

      // Calculate new month and year
      const totalMonths = originalMonth + monthsToAdd;
      const newYear = originalYear + Math.floor(totalMonths / 12);
      const newMonth = totalMonths % 12;

      // Create date properly: Year, Month (0-based), Day
      // This way we preserve the original day (01, 15, 31, etc)
      const installmentDate = new Date(Date.UTC(newYear, newMonth, originalDay, 3, 0, 0, 0));

      // Calculate transaction date based on whether it's a credit card or not
      let transactionDate = installmentDate;
      let transactionPurchaseDate = installmentDate;

      if (creditCard) {
        // For credit card: calculate invoice due date
        transactionDate = this.calculateInvoiceDueDate(
          installmentDate,
          creditCard.closingDay,
          creditCard.dueDay
        );
        // Normalize the calculated invoice due date
        transactionDate = this.normalizeDate(transactionDate);
        transactionPurchaseDate = installmentDate;
      }

      // Build description: add "Parcela X/Y" only if credit card is present
      const description = creditCard
        ? `${data.description} ${i}/${totalInstallments}`
        : data.description;

      const transaction = await prisma.transaction.create({
        data: {
          type: data.type,
          amount: installmentAmount,
          date: transactionDate,
          purchaseDate: creditCard ? transactionPurchaseDate : null,
          description: description,
          notes: data.notes,
          accountId: data.accountId,
          categoryId: data.categoryId,
          creditCardId: data.creditCardId || null,
          installmentNumber: i,
          totalInstallments: totalInstallments,
          recurrenceId: recurrence.id,
          isRecurringCharge: data.isRecurringCharge || false,
          userId: data.userId
        }
      });

      transactions.push(transaction);
    }

    return transactions;
  }

  /**
   * Create recurring transactions
   */
  static async createRecurringTransactions(
    data: Omit<CreateTransactionData, 'recurrenceId'>,
    interval: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR',
    intervalCount: number,
    endDate?: Date
  ) {
    const recurrence = await prisma.recurrence.create({
      data: {
        type: 'RECURRING',
        interval,
        intervalCount,
        startDate: data.date,
        endDate
      }
    });

    // Create the first transaction
    const transaction = await this.createTransaction({
      ...data,
      recurrenceId: recurrence.id
    });

    return { transaction, recurrence };
  }

  /**
   * Get a single transaction by ID
   * @throws ForbiddenError if transaction exists but belongs to another user
   */
  static async getTransactionById(transactionId: string, userId: string) {
    const transaction = await prisma.transaction.findUnique({
      where: {
        id: transactionId
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
            type: true,
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
      }
    });

    if (!transaction) {
      return null;
    }

    if (transaction.userId !== userId) {
      throw new ForbiddenError('Transaction does not belong to user');
    }

    return transaction;
  }

  /**
   * Get transactions with filters
   */
  static async getTransactions(
    userId: string,
    filters: {
      accountId?: string;
      categoryId?: string;
      creditCardId?: string;
      type?: 'INCOME' | 'EXPENSE';
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const where: any = {
      userId,
      ...(filters.accountId && { accountId: filters.accountId }),
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(filters.creditCardId && { creditCardId: filters.creditCardId }),
      ...(filters.type && { type: filters.type }),
      ...(filters.startDate && filters.endDate && {
        date: {
          gte: filters.startDate,
          lte: filters.endDate
        }
      })
    };

    const transactions = await prisma.transaction.findMany({
      where,
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
            type: true,
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
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 100,
      skip: filters.offset || 0
    });

    return transactions;
  }

  /**
   * Get transaction summary (income vs expense)
   */
  static async getTransactionSummary(
    userId: string,
    startDate: Date,
    endDate: Date,
    accountId?: string
  ) {
    const where: any = {
      userId,
      date: {
        gte: startDate,
        lte: endDate
      }
    };

    if (accountId) {
      where.accountId = accountId;
    }

    const transactions = await prisma.transaction.findMany({
      where,
      select: {
        type: true,
        amount: true
      }
    });

    const summary = transactions.reduce(
      (acc, transaction) => {
        if (transaction.type === 'INCOME') {
          acc.totalIncome += Number(transaction.amount);
        } else {
          acc.totalExpense += Number(transaction.amount);
        }
        return acc;
      },
      { totalIncome: 0, totalExpense: 0, balance: 0 }
    );

    summary.balance = summary.totalIncome - summary.totalExpense;

    return summary;
  }

  /**
   * Update transaction
   */
  static async updateTransaction(
    transactionId: string,
    userId: string,
    data: Partial<CreateTransactionData>
  ) {
    // Verify transaction belongs to user
    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        id: transactionId,
        userId
      }
    });

    if (!existingTransaction) {
      throw new Error('Transaction not found');
    }

    // If updating credit card or date, recalculate invoice due date
    if (data.creditCardId || data.date || data.purchaseDate) {
      const creditCard = await prisma.creditCard.findUnique({
        where: { id: data.creditCardId || existingTransaction.creditCardId! }
      });

      if (creditCard) {
        const purchaseDate = data.purchaseDate || existingTransaction.purchaseDate || data.date || existingTransaction.date;
        data.date = this.calculateInvoiceDueDate(
          purchaseDate,
          creditCard.closingDay,
          creditCard.dueDay
        );
      }
    }

    return await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Delete transaction
   * Returns: { success: true } on success
   * Throws: Error with message 'NOT_FOUND' if transaction doesn't exist
   * Throws: Error with message 'FORBIDDEN' if transaction belongs to another user
   */
  static async deleteTransaction(transactionId: string, userId: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { userId: true }
    });

    if (!transaction) {
      throw new Error('NOT_FOUND');
    }

    if (transaction.userId !== userId) {
      throw new Error('FORBIDDEN');
    }

    await prisma.transaction.delete({
      where: { id: transactionId }
    });

    return { success: true };
  }

  /**
   * Get transaction count for a user
   */
  static async getTransactionCount(userId: string) {
    const count = await prisma.transaction.count({
      where: { userId }
    });

    const lastTransaction = await prisma.transaction.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
      select: { date: true }
    });

    return {
      count,
      lastTransaction: lastTransaction?.date || null
    };
  }

  /**
   * Update transaction paid status
   */
  static async updateTransactionPaidStatus(
    transactionId: string,
    userId: string,
    paid: boolean,
    paidAt?: Date,
    accountId?: string
  ) {
    // Verify transaction belongs to user
    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        id: transactionId,
        userId
      }
    });

    if (!existingTransaction) {
      throw new Error('Transaction not found');
    }

    // If accountId is provided, verify it belongs to user
    if (accountId) {
      const account = await prisma.account.findFirst({
        where: {
          id: accountId,
          userId
        }
      });

      if (!account) {
        throw new Error('Account not found');
      }
    }

    // Build update data
    const updateData: {
      paid: boolean;
      paidAt: Date | null;
      date?: Date;
      accountId?: string;
    } = {
      paid,
      paidAt: paid ? (paidAt || new Date()) : null
    };

    // If marking as paid with a date, update the transaction date
    if (paid && paidAt) {
      updateData.date = paidAt;
    }

    // Only update accountId if provided
    if (accountId) {
      updateData.accountId = accountId;
    }

    const transaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: updateData,
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
            type: true,
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
      }
    });

    return transaction;
  }
}
