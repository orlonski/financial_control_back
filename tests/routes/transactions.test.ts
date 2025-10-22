import request from 'supertest'
import express from 'express'
import transactionsRoutes from '../src/routes/transactions'
import { prisma, createTestUser, createTestAccount, createTestCategory, createTestCreditCard } from './setup'

const app = express()
app.use(express.json())
app.use('/api/transactions', transactionsRoutes)

// Mock do middleware de autenticação
jest.mock('../src/middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.userId = req.headers['user-id'] || 'test-user-id'
    next()
  }
}))

describe('Transactions API', () => {
  let userId: string
  let accountId: string
  let categoryId: string
  let creditCardId: string
  let authToken: string

  beforeEach(async () => {
    const user = await createTestUser()
    userId = user.id
    
    const account = await createTestAccount(userId)
    accountId = account.id
    
    const category = await createTestCategory(userId)
    categoryId = category.id
    
    const creditCard = await createTestCreditCard(userId, accountId)
    creditCardId = creditCard.id
    
    authToken = 'valid-token'
  })

  describe('POST /api/transactions', () => {
    it('should create a simple transaction', async () => {
      const transactionData = {
        type: 'EXPENSE',
        amount: 100,
        date: '2024-01-15',
        description: 'Test Expense',
        accountId,
        categoryId
      }

      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(transactionData)
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body.amount).toBe(transactionData.amount)
      expect(response.body.description).toBe(transactionData.description)
      expect(response.body.type).toBe(transactionData.type)
    })

    it('should create transaction with credit card', async () => {
      const transactionData = {
        type: 'EXPENSE',
        amount: 200,
        date: '2024-01-15',
        purchaseDate: '2024-01-10',
        description: 'Credit Card Purchase',
        accountId,
        categoryId,
        creditCardId
      }

      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(transactionData)
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body.creditCardId).toBe(creditCardId)
      expect(response.body.purchaseDate).toBeDefined()
    })

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send({})
        .expect(400)

      expect(response.body.error).toBeDefined()
    })

    it('should validate amount is positive', async () => {
      const transactionData = {
        type: 'EXPENSE',
        amount: -100,
        date: '2024-01-15',
        description: 'Test Expense',
        accountId,
        categoryId
      }

      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(transactionData)
        .expect(400)

      expect(response.body.error).toContain('positive')
    })

    it('should validate account belongs to user', async () => {
      const otherUser = await createTestUser('other@test.com')
      const otherAccount = await createTestAccount(otherUser.id)

      const transactionData = {
        type: 'EXPENSE',
        amount: 100,
        date: '2024-01-15',
        description: 'Test Expense',
        accountId: otherAccount.id,
        categoryId
      }

      const response = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(transactionData)
        .expect(404)

      expect(response.body.error).toContain('not found')
    })
  })

  describe('POST /api/transactions/installments', () => {
    it('should create installment transactions', async () => {
      const installmentData = {
        type: 'EXPENSE',
        amount: 1200, // Total amount
        date: '2024-01-15',
        description: 'Installment Purchase',
        accountId,
        categoryId,
        creditCardId,
        totalInstallments: 3
      }

      const response = await request(app)
        .post('/api/transactions/installments')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(installmentData)
        .expect(201)

      expect(response.body).toHaveLength(3)
      
      // Verificar se cada parcela tem o valor correto
      response.body.forEach((transaction: any, index: number) => {
        expect(transaction.amount).toBe(400) // 1200 / 3
        expect(transaction.installmentNumber).toBe(index + 1)
        expect(transaction.totalInstallments).toBe(3)
        expect(transaction.description).toContain(`${index + 1}/3`)
      })

      // Verificar se as datas estão corretas (baseadas na lógica do cartão)
      const creditCard = await prisma.creditCard.findUnique({
        where: { id: creditCardId }
      })
      
      // Cada parcela deve aparecer na fatura correta
      response.body.forEach((transaction: any) => {
        expect(transaction.date).toBeDefined()
        expect(new Date(transaction.date)).toBeInstanceOf(Date)
      })
    })

    it('should validate installment count', async () => {
      const installmentData = {
        type: 'EXPENSE',
        amount: 100,
        date: '2024-01-15',
        description: 'Invalid Installment',
        accountId,
        categoryId,
        creditCardId,
        totalInstallments: 1 // Deve ser pelo menos 2
      }

      const response = await request(app)
        .post('/api/transactions/installments')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(installmentData)
        .expect(400)

      expect(response.body.error).toContain('installments')
    })

    it('should require credit card for installments', async () => {
      const installmentData = {
        type: 'EXPENSE',
        amount: 100,
        date: '2024-01-15',
        description: 'No Credit Card',
        accountId,
        categoryId,
        totalInstallments: 2
      }

      const response = await request(app)
        .post('/api/transactions/installments')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(installmentData)
        .expect(400)

      expect(response.body.error).toContain('credit card')
    })
  })

  describe('GET /api/transactions', () => {
    beforeEach(async () => {
      // Criar algumas transações de teste
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
            description: 'Expense',
            accountId,
            categoryId,
            userId
          }
        ]
      })
    })

    it('should return user transactions', async () => {
      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body).toHaveLength(2)
      expect(response.body[0]).toHaveProperty('id')
      expect(response.body[0]).toHaveProperty('amount')
      expect(response.body[0]).toHaveProperty('description')
    })

    it('should filter transactions by date range', async () => {
      const response = await request(app)
        .get('/api/transactions')
        .query({
          startDate: '2024-01-15',
          endDate: '2024-01-15'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body).toHaveLength(1)
      expect(response.body[0].description).toBe('Salary')
    })

    it('should filter transactions by type', async () => {
      const response = await request(app)
        .get('/api/transactions')
        .query({ type: 'INCOME' })
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body).toHaveLength(1)
      expect(response.body[0].type).toBe('INCOME')
    })
  })

  describe('GET /api/transactions/summary', () => {
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
            description: 'Expense',
            accountId,
            categoryId,
            userId
          },
          {
            type: 'EXPENSE',
            amount: 300,
            date: new Date('2024-01-17'),
            description: 'Another Expense',
            accountId,
            categoryId,
            userId
          }
        ]
      })
    })

    it('should return transaction summary', async () => {
      const response = await request(app)
        .get('/api/transactions/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body).toHaveProperty('totalIncome')
      expect(response.body).toHaveProperty('totalExpense')
      expect(response.body).toHaveProperty('balance')
      expect(response.body.totalIncome).toBe(1000)
      expect(response.body.totalExpense).toBe(500)
      expect(response.body.balance).toBe(500)
    })

    it('should filter summary by date range', async () => {
      const response = await request(app)
        .get('/api/transactions/summary')
        .query({
          startDate: '2024-01-15',
          endDate: '2024-01-16'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.totalIncome).toBe(1000)
      expect(response.body.totalExpense).toBe(200)
      expect(response.body.balance).toBe(800)
    })
  })

  describe('PUT /api/transactions/:id', () => {
    let transactionId: string

    beforeEach(async () => {
      const transaction = await prisma.transaction.create({
        data: {
          type: 'EXPENSE',
          amount: 100,
          date: new Date(),
          description: 'Original Description',
          accountId,
          categoryId,
          userId
        }
      })
      transactionId = transaction.id
    })

    it('should update transaction', async () => {
      const updateData = {
        description: 'Updated Description',
        amount: 150
      }

      const response = await request(app)
        .put(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(updateData)
        .expect(200)

      expect(response.body.description).toBe(updateData.description)
      expect(response.body.amount).toBe(updateData.amount)
    })

    it('should return 404 for non-existent transaction', async () => {
      const updateData = {
        description: 'Updated Description'
      }

      await request(app)
        .put('/api/transactions/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(updateData)
        .expect(404)
    })
  })

  describe('DELETE /api/transactions/:id', () => {
    let transactionId: string

    beforeEach(async () => {
      const transaction = await prisma.transaction.create({
        data: {
          type: 'EXPENSE',
          amount: 100,
          date: new Date(),
          description: 'To Delete',
          accountId,
          categoryId,
          userId
        }
      })
      transactionId = transaction.id
    })

    it('should delete transaction', async () => {
      await request(app)
        .delete(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(204)

      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId }
      })
      expect(transaction).toBeNull()
    })

    it('should return 404 for non-existent transaction', async () => {
      await request(app)
        .delete('/api/transactions/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(404)
    })
  })
})
