import request from 'supertest'
import express from 'express'
import summaryRoutes from '../../src/routes/summary'
import { prisma, createTestUser, createTestAccount, createTestCategory } from '../setup'

const app = express()
app.use(express.json())
app.use('/api/summary', summaryRoutes)

// Mock do middleware de autenticação
jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.userId = req.headers['user-id'] || 'test-user-id'
    next()
  }
}))

describe('Summary API - GET /api/summary', () => {
  let userId: string
  let accountId: string
  let categoryId: string
  let authToken: string

  beforeEach(async () => {
    const user = await createTestUser()
    userId = user.id

    const account = await createTestAccount(userId)
    accountId = account.id

    const category = await createTestCategory(userId)
    categoryId = category.id

    authToken = 'valid-token'
  })

  describe('Basic functionality', () => {
    it('should return zero values when user has no transactions', async () => {
      const response = await request(app)
        .get('/api/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.totalIncome).toBe(0)
      expect(response.body.totalExpense).toBe(0)
      expect(response.body.balance).toBe(0)
      expect(response.body.transactionCount).toBe(0)
    })

    it('should return correct sum of INCOME transactions', async () => {
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
            type: 'INCOME',
            amount: 500,
            date: new Date('2024-02-15'),
            description: 'Freelance',
            accountId,
            categoryId,
            userId
          }
        ]
      })

      const response = await request(app)
        .get('/api/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.totalIncome).toBe(1500)
      expect(response.body.totalExpense).toBe(0)
      expect(response.body.balance).toBe(1500)
      expect(response.body.transactionCount).toBe(2)
    })

    it('should return correct sum of EXPENSE transactions', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            type: 'EXPENSE',
            amount: 200,
            date: new Date('2024-01-15'),
            description: 'Groceries',
            accountId,
            categoryId,
            userId
          },
          {
            type: 'EXPENSE',
            amount: 300,
            date: new Date('2024-02-15'),
            description: 'Utilities',
            accountId,
            categoryId,
            userId
          }
        ]
      })

      const response = await request(app)
        .get('/api/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.totalIncome).toBe(0)
      expect(response.body.totalExpense).toBe(500)
      expect(response.body.balance).toBe(-500)
      expect(response.body.transactionCount).toBe(2)
    })

    it('should calculate balance correctly with mixed transactions', async () => {
      await prisma.transaction.createMany({
        data: [
          {
            type: 'INCOME',
            amount: 5000,
            date: new Date('2024-01-15'),
            description: 'Salary',
            accountId,
            categoryId,
            userId
          },
          {
            type: 'EXPENSE',
            amount: 1500,
            date: new Date('2024-01-16'),
            description: 'Rent',
            accountId,
            categoryId,
            userId
          },
          {
            type: 'EXPENSE',
            amount: 500,
            date: new Date('2024-01-17'),
            description: 'Food',
            accountId,
            categoryId,
            userId
          },
          {
            type: 'INCOME',
            amount: 200,
            date: new Date('2024-01-18'),
            description: 'Refund',
            accountId,
            categoryId,
            userId
          }
        ]
      })

      const response = await request(app)
        .get('/api/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.totalIncome).toBe(5200)
      expect(response.body.totalExpense).toBe(2000)
      expect(response.body.balance).toBe(3200)
      expect(response.body.transactionCount).toBe(4)
    })
  })

  describe('User isolation', () => {
    it('should only return data for the authenticated user', async () => {
      const otherUser = await createTestUser('other@test.com')
      const otherAccount = await createTestAccount(otherUser.id)
      const otherCategory = await createTestCategory(otherUser.id)

      // Transactions for authenticated user
      await prisma.transaction.createMany({
        data: [
          {
            type: 'INCOME',
            amount: 1000,
            date: new Date('2024-01-15'),
            description: 'User Income',
            accountId,
            categoryId,
            userId
          }
        ]
      })

      // Transactions for other user
      await prisma.transaction.createMany({
        data: [
          {
            type: 'INCOME',
            amount: 9999,
            date: new Date('2024-01-15'),
            description: 'Other User Income',
            accountId: otherAccount.id,
            categoryId: otherCategory.id,
            userId: otherUser.id
          }
        ]
      })

      const response = await request(app)
        .get('/api/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.totalIncome).toBe(1000)
      expect(response.body.transactionCount).toBe(1)
    })
  })

  describe('Filter by accountId', () => {
    it('should filter summary by accountId', async () => {
      const account2 = await createTestAccount(userId, 'Second Account')

      await prisma.transaction.createMany({
        data: [
          {
            type: 'INCOME',
            amount: 1000,
            date: new Date('2024-01-15'),
            description: 'Account 1 Income',
            accountId,
            categoryId,
            userId
          },
          {
            type: 'INCOME',
            amount: 500,
            date: new Date('2024-01-15'),
            description: 'Account 2 Income',
            accountId: account2.id,
            categoryId,
            userId
          }
        ]
      })

      const response = await request(app)
        .get('/api/summary')
        .query({ accountId })
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.totalIncome).toBe(1000)
      expect(response.body.transactionCount).toBe(1)
    })
  })

  describe('Filter by date range', () => {
    beforeEach(async () => {
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
            type: 'INCOME',
            amount: 2000,
            date: new Date('2024-02-15'),
            description: 'February Income',
            accountId,
            categoryId,
            userId
          },
          {
            type: 'EXPENSE',
            amount: 500,
            date: new Date('2024-03-15'),
            description: 'March Expense',
            accountId,
            categoryId,
            userId
          }
        ]
      })
    })

    it('should filter summary by startDate only', async () => {
      const response = await request(app)
        .get('/api/summary')
        .query({ startDate: '2024-02-01' })
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.totalIncome).toBe(2000)
      expect(response.body.totalExpense).toBe(500)
      expect(response.body.transactionCount).toBe(2)
    })

    it('should filter summary by endDate only', async () => {
      const response = await request(app)
        .get('/api/summary')
        .query({ endDate: '2024-01-31' })
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.totalIncome).toBe(1000)
      expect(response.body.totalExpense).toBe(0)
      expect(response.body.transactionCount).toBe(1)
    })

    it('should filter summary by both startDate and endDate', async () => {
      const response = await request(app)
        .get('/api/summary')
        .query({ startDate: '2024-01-01', endDate: '2024-02-28' })
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.totalIncome).toBe(3000)
      expect(response.body.totalExpense).toBe(0)
      expect(response.body.balance).toBe(3000)
      expect(response.body.transactionCount).toBe(2)
    })
  })

  describe('Combined filters', () => {
    it('should filter by accountId and date range together', async () => {
      const account2 = await createTestAccount(userId, 'Second Account')

      await prisma.transaction.createMany({
        data: [
          {
            type: 'INCOME',
            amount: 1000,
            date: new Date('2024-01-15'),
            description: 'Account 1 January',
            accountId,
            categoryId,
            userId
          },
          {
            type: 'INCOME',
            amount: 2000,
            date: new Date('2024-02-15'),
            description: 'Account 1 February',
            accountId,
            categoryId,
            userId
          },
          {
            type: 'INCOME',
            amount: 5000,
            date: new Date('2024-01-15'),
            description: 'Account 2 January',
            accountId: account2.id,
            categoryId,
            userId
          }
        ]
      })

      const response = await request(app)
        .get('/api/summary')
        .query({ accountId, startDate: '2024-02-01', endDate: '2024-02-28' })
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.totalIncome).toBe(2000)
      expect(response.body.transactionCount).toBe(1)
    })
  })

  describe('Response format', () => {
    it('should return numeric values (not strings)', async () => {
      await prisma.transaction.create({
        data: {
          type: 'INCOME',
          amount: 1000.50,
          date: new Date('2024-01-15'),
          description: 'Test',
          accountId,
          categoryId,
          userId
        }
      })

      const response = await request(app)
        .get('/api/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(typeof response.body.totalIncome).toBe('number')
      expect(typeof response.body.totalExpense).toBe('number')
      expect(typeof response.body.balance).toBe('number')
      expect(typeof response.body.transactionCount).toBe('number')
    })
  })
})
