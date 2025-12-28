import request from 'supertest'
import express from 'express'
import accountsRoutes from '../../src/routes/accounts'
import { prisma, createTestUser, createTestAccount } from '../setup'

const app = express()
app.use(express.json())
app.use('/api/accounts', accountsRoutes)

// Mock do middleware de autenticação
jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.userId = req.headers['user-id'] || 'test-user-id'
    next()
  }
}))

describe('Accounts API', () => {
  let userId: string
  let authToken: string

  beforeEach(async () => {
    const user = await createTestUser()
    userId = user.id
    authToken = 'valid-token'
  })

  describe('GET /api/accounts', () => {
    it('should return all user accounts', async () => {
      await createTestAccount(userId, 'Account 1')
      await createTestAccount(userId, 'Account 2')

      const response = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body).toHaveLength(2)
      expect(response.body[0]).toHaveProperty('id')
      expect(response.body[0]).toHaveProperty('name')
      expect(response.body[0]).toHaveProperty('type')
      expect(response.body[0]).toHaveProperty('initialBalance')
    })

    it('should return empty array when user has no accounts', async () => {
      const response = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body).toHaveLength(0)
    })
  })

  describe('GET /api/accounts/with-balances', () => {
    it('should return accounts with calculated balances', async () => {
      const account = await createTestAccount(userId, 'Test Account')

      // Criar algumas transações para calcular saldo
      await prisma.transaction.createMany({
        data: [
          {
            type: 'INCOME',
            amount: 1000,
            date: new Date(),
            description: 'Salary',
            accountId: account.id,
            categoryId: 'test-category',
            userId
          },
          {
            type: 'EXPENSE',
            amount: 200,
            date: new Date(),
            description: 'Expense',
            accountId: account.id,
            categoryId: 'test-category',
            userId
          }
        ]
      })

      const response = await request(app)
        .get('/api/accounts/with-balances')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body).toHaveLength(1)
      expect(response.body[0]).toHaveProperty('balance')
      expect(response.body[0].balance).toBe(1000 + 1000 - 200) // initialBalance + income - expense
    })
  })

  describe('POST /api/accounts', () => {
    it('should create a new account', async () => {
      const accountData = {
        name: 'New Account',
        type: 'SAVINGS',
        initialBalance: 500,
        color: '#FF0000'
      }

      const response = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(accountData)
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body.name).toBe(accountData.name)
      expect(response.body.type).toBe(accountData.type)
      expect(response.body.initialBalance).toBe(accountData.initialBalance)
      expect(response.body.color).toBe(accountData.color)

      // Verificar se foi criado no banco
      const account = await prisma.account.findUnique({
        where: { id: response.body.id }
      })
      expect(account).toBeTruthy()
    })

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send({})
        .expect(400)

      expect(response.body.error).toBeDefined()
    })

    it('should validate account type', async () => {
      const accountData = {
        name: 'Test Account',
        type: 'INVALID_TYPE',
        initialBalance: 0
      }

      const response = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(accountData)
        .expect(400)

      expect(response.body.error).toContain('type')
    })

    it('should validate initial balance', async () => {
      const accountData = {
        name: 'Test Account',
        type: 'CHECKING',
        initialBalance: -100
      }

      const response = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(accountData)
        .expect(400)

      expect(response.body.error).toContain('balance')
    })
  })

  describe('PUT /api/accounts/:id', () => {
    let accountId: string

    beforeEach(async () => {
      const account = await createTestAccount(userId, 'Original Account')
      accountId = account.id
    })

    it('should update account successfully', async () => {
      const updateData = {
        name: 'Updated Account',
        type: 'INVESTMENT',
        initialBalance: 2000
      }

      const response = await request(app)
        .put(`/api/accounts/${accountId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(updateData)
        .expect(200)

      expect(response.body.name).toBe(updateData.name)
      expect(response.body.type).toBe(updateData.type)
      expect(response.body.initialBalance).toBe(updateData.initialBalance)
    })

    it('should return 404 for non-existent account', async () => {
      const updateData = {
        name: 'Updated Account'
      }

      await request(app)
        .put('/api/accounts/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(updateData)
        .expect(404)
    })

    it('should not update account from different user', async () => {
      const otherUser = await createTestUser('other@test.com')
      const otherAccount = await createTestAccount(otherUser.id, 'Other Account')

      const updateData = {
        name: 'Hacked Account'
      }

      await request(app)
        .put(`/api/accounts/${otherAccount.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(updateData)
        .expect(404)
    })
  })

  describe('DELETE /api/accounts/:id', () => {
    let accountId: string

    beforeEach(async () => {
      const account = await createTestAccount(userId, 'To Delete Account')
      accountId = account.id
    })

    it('should delete account successfully', async () => {
      await request(app)
        .delete(`/api/accounts/${accountId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(204)

      // Verificar se foi deletado
      const account = await prisma.account.findUnique({
        where: { id: accountId }
      })
      expect(account).toBeNull()
    })

    it('should return 404 for non-existent account', async () => {
      await request(app)
        .delete('/api/accounts/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(404)
    })

    it('should not delete account from different user', async () => {
      const otherUser = await createTestUser('other@test.com')
      const otherAccount = await createTestAccount(otherUser.id, 'Other Account')

      await request(app)
        .delete(`/api/accounts/${otherAccount.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(404)

      // Verificar se não foi deletado
      const account = await prisma.account.findUnique({
        where: { id: otherAccount.id }
      })
      expect(account).toBeTruthy()
    })
  })
})
