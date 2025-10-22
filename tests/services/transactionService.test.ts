import { TransactionService } from '../../src/services/transactionService'
import { prisma, createTestUser, createTestAccount, createTestCategory, createTestCreditCard } from '../setup'

describe('TransactionService', () => {
  let userId: string
  let accountId: string
  let categoryId: string
  let creditCardId: string
  let transactionService: TransactionService

  beforeEach(async () => {
    const user = await createTestUser()
    userId = user.id
    
    const account = await createTestAccount(userId)
    accountId = account.id
    
    const category = await createTestCategory(userId)
    categoryId = category.id
    
    const creditCard = await createTestCreditCard(userId, accountId)
    creditCardId = creditCard.id
    
    transactionService = new TransactionService()
  })

  describe('calculateInvoiceDate', () => {
    it('should calculate correct invoice date for purchase before closing day', () => {
      const purchaseDate = new Date('2024-01-03') // Dia 3
      const closingDay = 5
      const dueDay = 10
      
      const invoiceDate = transactionService.calculateInvoiceDate(purchaseDate, closingDay, dueDay)
      
      // Compra no dia 3, fecha dia 5, então vai para fatura do mesmo mês
      expect(invoiceDate.getFullYear()).toBe(2024)
      expect(invoiceDate.getMonth()).toBe(0) // Janeiro (0-indexed)
      expect(invoiceDate.getDate()).toBe(dueDay)
    })

    it('should calculate correct invoice date for purchase after closing day', () => {
      const purchaseDate = new Date('2024-01-10') // Dia 10
      const closingDay = 5
      const dueDay = 10
      
      const invoiceDate = transactionService.calculateInvoiceDate(purchaseDate, closingDay, dueDay)
      
      // Compra no dia 10, fecha dia 5, então vai para fatura do próximo mês
      expect(invoiceDate.getFullYear()).toBe(2024)
      expect(invoiceDate.getMonth()).toBe(1) // Fevereiro (0-indexed)
      expect(invoiceDate.getDate()).toBe(dueDay)
    })

    it('should handle month boundary correctly', () => {
      const purchaseDate = new Date('2024-01-31') // Último dia do mês
      const closingDay = 5
      const dueDay = 10
      
      const invoiceDate = transactionService.calculateInvoiceDate(purchaseDate, closingDay, dueDay)
      
      // Compra no dia 31, fecha dia 5, então vai para fatura de fevereiro
      expect(invoiceDate.getFullYear()).toBe(2024)
      expect(invoiceDate.getMonth()).toBe(1) // Fevereiro
      expect(invoiceDate.getDate()).toBe(dueDay)
    })

    it('should handle year boundary correctly', () => {
      const purchaseDate = new Date('2023-12-31') // Último dia do ano
      const closingDay = 5
      const dueDay = 10
      
      const invoiceDate = transactionService.calculateInvoiceDate(purchaseDate, closingDay, dueDay)
      
      // Compra no dia 31/12, fecha dia 5, então vai para fatura de janeiro do próximo ano
      expect(invoiceDate.getFullYear()).toBe(2024)
      expect(invoiceDate.getMonth()).toBe(0) // Janeiro
      expect(invoiceDate.getDate()).toBe(dueDay)
    })
  })

  describe('createInstallmentTransactions', () => {
    it('should create correct number of installment transactions', async () => {
      const transactionData = {
        type: 'EXPENSE' as const,
        amount: 1200,
        date: new Date('2024-01-15'),
        description: 'Installment Purchase',
        accountId,
        categoryId,
        creditCardId,
        totalInstallments: 3,
        userId
      }

      const transactions = await transactionService.createInstallmentTransactions(transactionData)

      expect(transactions).toHaveLength(3)
      
      transactions.forEach((transaction, index) => {
        expect(transaction.amount).toBe(400) // 1200 / 3
        expect(transaction.installmentNumber).toBe(index + 1)
        expect(transaction.totalInstallments).toBe(3)
        expect(transaction.description).toContain(`${index + 1}/3`)
        expect(transaction.accountId).toBe(accountId)
        expect(transaction.categoryId).toBe(categoryId)
        expect(transaction.creditCardId).toBe(creditCardId)
      })
    })

    it('should calculate correct dates for each installment', async () => {
      const transactionData = {
        type: 'EXPENSE' as const,
        amount: 600,
        date: new Date('2024-01-10'), // Dia 10, após fechamento (dia 5)
        description: 'Installment Purchase',
        accountId,
        categoryId,
        creditCardId,
        totalInstallments: 2,
        userId
      }

      const transactions = await transactionService.createInstallmentTransactions(transactionData)

      expect(transactions).toHaveLength(2)
      
      // Primeira parcela: fevereiro (compra após fechamento de janeiro)
      expect(transactions[0].date.getFullYear()).toBe(2024)
      expect(transactions[0].date.getMonth()).toBe(1) // Fevereiro
      expect(transactions[0].date.getDate()).toBe(10) // Dia de vencimento
      
      // Segunda parcela: março
      expect(transactions[1].date.getFullYear()).toBe(2024)
      expect(transactions[1].date.getMonth()).toBe(2) // Março
      expect(transactions[1].date.getDate()).toBe(10) // Dia de vencimento
    })

    it('should handle purchase before closing day correctly', async () => {
      const transactionData = {
        type: 'EXPENSE' as const,
        amount: 400,
        date: new Date('2024-01-03'), // Dia 3, antes do fechamento (dia 5)
        description: 'Early Purchase',
        accountId,
        categoryId,
        creditCardId,
        totalInstallments: 2,
        userId
      }

      const transactions = await transactionService.createInstallmentTransactions(transactionData)

      expect(transactions).toHaveLength(2)
      
      // Primeira parcela: janeiro (compra antes do fechamento)
      expect(transactions[0].date.getFullYear()).toBe(2024)
      expect(transactions[0].date.getMonth()).toBe(0) // Janeiro
      expect(transactions[0].date.getDate()).toBe(10) // Dia de vencimento
      
      // Segunda parcela: fevereiro
      expect(transactions[1].date.getFullYear()).toBe(2024)
      expect(transactions[1].date.getMonth()).toBe(1) // Fevereiro
      expect(transactions[1].date.getDate()).toBe(10) // Dia de vencimento
    })

    it('should round installment amounts correctly', async () => {
      const transactionData = {
        type: 'EXPENSE' as const,
        amount: 1000,
        date: new Date('2024-01-15'),
        description: 'Uneven Installments',
        accountId,
        categoryId,
        creditCardId,
        totalInstallments: 3,
        userId
      }

      const transactions = await transactionService.createInstallmentTransactions(transactionData)

      expect(transactions).toHaveLength(3)
      
      // Primeiras duas parcelas: 333.33 cada
      expect(transactions[0].amount).toBe(333.33)
      expect(transactions[1].amount).toBe(333.33)
      
      // Última parcela: diferença para completar o total
      expect(transactions[2].amount).toBe(333.34)
      
      // Verificar se soma dá o total
      const total = transactions.reduce((sum, t) => sum + t.amount, 0)
      expect(total).toBeCloseTo(1000, 2)
    })
  })

  describe('createTransaction', () => {
    it('should create simple transaction without credit card', async () => {
      const transactionData = {
        type: 'INCOME' as const,
        amount: 1000,
        date: new Date('2024-01-15'),
        description: 'Salary',
        accountId,
        categoryId,
        userId
      }

      const transaction = await transactionService.createTransaction(transactionData)

      expect(transaction).toHaveProperty('id')
      expect(transaction.amount).toBe(1000)
      expect(transaction.description).toBe('Salary')
      expect(transaction.type).toBe('INCOME')
      expect(transaction.accountId).toBe(accountId)
      expect(transaction.categoryId).toBe(categoryId)
      expect(transaction.creditCardId).toBeNull()
    })

    it('should create transaction with credit card and calculate invoice date', async () => {
      const transactionData = {
        type: 'EXPENSE' as const,
        amount: 200,
        date: new Date('2024-01-10'), // Dia 10, após fechamento (dia 5)
        purchaseDate: new Date('2024-01-08'),
        description: 'Credit Card Purchase',
        accountId,
        categoryId,
        creditCardId,
        userId
      }

      const transaction = await transactionService.createTransaction(transactionData)

      expect(transaction).toHaveProperty('id')
      expect(transaction.amount).toBe(200)
      expect(transaction.creditCardId).toBe(creditCardId)
      expect(transaction.purchaseDate).toEqual(new Date('2024-01-08'))
      
      // Data da transação deve ser a data da fatura (fevereiro)
      expect(transaction.date.getFullYear()).toBe(2024)
      expect(transaction.date.getMonth()).toBe(1) // Fevereiro
      expect(transaction.date.getDate()).toBe(10) // Dia de vencimento
    })

    it('should validate account belongs to user', async () => {
      const otherUser = await createTestUser('other@test.com')
      const otherAccount = await createTestAccount(otherUser.id)

      const transactionData = {
        type: 'EXPENSE' as const,
        amount: 100,
        date: new Date('2024-01-15'),
        description: 'Unauthorized',
        accountId: otherAccount.id,
        categoryId,
        userId
      }

      await expect(transactionService.createTransaction(transactionData))
        .rejects.toThrow('Account not found')
    })

    it('should validate category belongs to user', async () => {
      const otherUser = await createTestUser('other@test.com')
      const otherCategory = await createTestCategory(otherUser.id)

      const transactionData = {
        type: 'EXPENSE' as const,
        amount: 100,
        date: new Date('2024-01-15'),
        description: 'Unauthorized',
        accountId,
        categoryId: otherCategory.id,
        userId
      }

      await expect(transactionService.createTransaction(transactionData))
        .rejects.toThrow('Category not found')
    })

    it('should validate credit card belongs to user', async () => {
      const otherUser = await createTestUser('other@test.com')
      const otherAccount = await createTestAccount(otherUser.id)
      const otherCreditCard = await createTestCreditCard(otherUser.id, otherAccount.id)

      const transactionData = {
        type: 'EXPENSE' as const,
        amount: 100,
        date: new Date('2024-01-15'),
        description: 'Unauthorized',
        accountId,
        categoryId,
        creditCardId: otherCreditCard.id,
        userId
      }

      await expect(transactionService.createTransaction(transactionData))
        .rejects.toThrow('Credit card not found')
    })
  })

  describe('getTransactionsByDateRange', () => {
    beforeEach(async () => {
      // Criar transações em diferentes datas
      await prisma.transaction.createMany({
        data: [
          {
            type: 'INCOME',
            amount: 1000,
            date: new Date('2024-01-15'),
            description: 'January Income',
            accountId,
            categoryId,
            userId
          },
          {
            type: 'EXPENSE',
            amount: 200,
            date: new Date('2024-02-15'),
            description: 'February Expense',
            accountId,
            categoryId,
            userId
          },
          {
            type: 'EXPENSE',
            amount: 300,
            date: new Date('2024-03-15'),
            description: 'March Expense',
            accountId,
            categoryId,
            userId
          }
        ]
      })
    })

    it('should return transactions within date range', async () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-02-28')

      const transactions = await transactionService.getTransactionsByDateRange(
        userId,
        startDate,
        endDate
      )

      expect(transactions).toHaveLength(2)
      expect(transactions[0].description).toBe('January Income')
      expect(transactions[1].description).toBe('February Expense')
    })

    it('should return empty array when no transactions in range', async () => {
      const startDate = new Date('2024-04-01')
      const endDate = new Date('2024-04-30')

      const transactions = await transactionService.getTransactionsByDateRange(
        userId,
        startDate,
        endDate
      )

      expect(transactions).toHaveLength(0)
    })
  })

  describe('getTransactionSummary', () => {
    beforeEach(async () => {
      // Criar transações para teste de resumo
      await prisma.transaction.createMany({
        data: [
          {
            type: 'INCOME',
            amount: 1000,
            date: new Date('2024-01-15'),
            description: 'Salary',
            accountId,
            categoryId,
            userId
          },
          {
            type: 'EXPENSE',
            amount: 200,
            date: new Date('2024-01-16'),
            description: 'Expense 1',
            accountId,
            categoryId,
            userId
          },
          {
            type: 'EXPENSE',
            amount: 300,
            date: new Date('2024-01-17'),
            description: 'Expense 2',
            accountId,
            categoryId,
            userId
          }
        ]
      })
    })

    it('should calculate correct summary', async () => {
      const summary = await transactionService.getTransactionSummary(userId)

      expect(summary.totalIncome).toBe(1000)
      expect(summary.totalExpense).toBe(500)
      expect(summary.balance).toBe(500)
      expect(summary.transactionCount).toBe(3)
    })

    it('should calculate summary for date range', async () => {
      const startDate = new Date('2024-01-15')
      const endDate = new Date('2024-01-16')

      const summary = await transactionService.getTransactionSummary(
        userId,
        startDate,
        endDate
      )

      expect(summary.totalIncome).toBe(1000)
      expect(summary.totalExpense).toBe(200)
      expect(summary.balance).toBe(800)
      expect(summary.transactionCount).toBe(2)
    })
  })
})
