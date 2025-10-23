import { PrismaClient } from '@prisma/client';

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
  userId: string;
}

export class TransactionService {
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
    
    const invoiceYear = purchaseDay <= closingDay 
      ? purchaseDate.getFullYear() 
      : purchaseDate.getFullYear() + (invoiceMonth > 11 ? 1 : 0);
    
    const finalMonth = invoiceMonth > 11 ? 0 : invoiceMonth;
    const finalYear = invoiceMonth > 11 ? invoiceYear + 1 : invoiceYear;
    
    return new Date(finalYear, finalMonth, dueDay);
  }

  /**
   * Create a single transaction
   */
  static async createTransaction(data: CreateTransactionData) {
    let transactionDate = data.date;
    let purchaseDate = data.purchaseDate;

    // If it's a credit card transaction, calculate the invoice due date
    if (data.creditCardId) {
      const creditCard = await prisma.creditCard.findUnique({
        where: { id: data.creditCardId }
      });

      if (!creditCard) {
        throw new Error('Credit card not found');
      }

      // Use purchase date or transaction date as purchase date
      const actualPurchaseDate = purchaseDate || data.date;
      
      // Calculate when this transaction should appear (invoice due date)
      transactionDate = this.calculateInvoiceDueDate(
        actualPurchaseDate,
        creditCard.closingDay,
        creditCard.dueDay
      );

      purchaseDate = actualPurchaseDate;
    }

    return await prisma.transaction.create({
      data: {
        type: data.type,
        amount: data.amount,
        date: transactionDate,
        purchaseDate: purchaseDate,
        description: data.description,
        notes: data.notes,
        accountId: data.accountId,
        categoryId: data.categoryId,
        creditCardId: data.creditCardId || undefined,
        installmentNumber: data.installmentNumber,
        totalInstallments: data.totalInstallments,
        recurrenceId: data.recurrenceId,
        userId: data.userId
      }
    });
  }

  /**
   * Create installment transactions for credit card purchases
   */
  static async createInstallmentTransactions(
    data: Omit<CreateTransactionData, 'installmentNumber' | 'totalInstallments'>,
    totalInstallments: number
  ) {
    if (!data.creditCardId) {
      throw new Error('Credit card ID is required for installments');
    }

    const creditCard = await prisma.creditCard.findUnique({
      where: { id: data.creditCardId }
    });

    if (!creditCard) {
      throw new Error('Credit card not found');
    }

    const purchaseDate = data.purchaseDate || data.date;
    const installmentAmount = data.amount / totalInstallments;
    const transactions = [];

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
      const originalMonth = purchaseDate.getMonth();
      const originalYear = purchaseDate.getFullYear();

      // Calculate new month and year
      const totalMonths = originalMonth + monthsToAdd;
      const newYear = originalYear + Math.floor(totalMonths / 12);
      const newMonth = totalMonths % 12;

      const installmentDate = new Date(purchaseDate);
      installmentDate.setFullYear(newYear);
      installmentDate.setMonth(newMonth);

      const invoiceDueDate = this.calculateInvoiceDueDate(
        installmentDate,
        creditCard.closingDay,
        creditCard.dueDay
      );

      const transaction = await prisma.transaction.create({
        data: {
          type: data.type,
          amount: installmentAmount,
          date: invoiceDueDate,
          purchaseDate: installmentDate,
          description: `${data.description} - Parcela ${i}/${totalInstallments}`,
          notes: data.notes,
          accountId: data.accountId,
          categoryId: data.categoryId,
          creditCardId: data.creditCardId,
          installmentNumber: i,
          totalInstallments: totalInstallments,
          recurrenceId: recurrence.id,
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
      orderBy: { date: 'desc' },
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
    endDate: Date
  ) {
    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate
        }
      },
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
   */
  static async deleteTransaction(transactionId: string, userId: string) {
    const transaction = await prisma.transaction.deleteMany({
      where: {
        id: transactionId,
        userId
      }
    });

    if (transaction.count === 0) {
      throw new Error('Transaction not found');
    }

    return true;
  }
}
