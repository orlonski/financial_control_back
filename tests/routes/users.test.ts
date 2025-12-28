import request from 'supertest'
import express from 'express'
import { prisma, createTestUser } from '../setup'

// Mock do server para evitar dependência circular
jest.mock('../../src/server', () => ({
  prisma: require('../setup').prisma
}))

// Mock do middleware de autenticação
jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.userId = req.headers['user-id'] || 'test-user-id'
    next()
  }
}))

import usersRoutes from '../../src/routes/users'

const app = express()
app.use(express.json())
app.use('/api/users', usersRoutes)

describe('Users API', () => {
  let userId: string
  let authToken: string

  beforeEach(async () => {
    const user = await createTestUser()
    userId = user.id
    authToken = 'valid-token'
  })

  describe('GET /api/users', () => {
    it('should return all users', async () => {
      await createTestUser('user2@test.com')
      await createTestUser('user3@test.com')

      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.users).toHaveLength(3)
      expect(response.body.users[0]).toHaveProperty('id')
      expect(response.body.users[0]).toHaveProperty('name')
      expect(response.body.users[0]).toHaveProperty('email')
      expect(response.body.users[0]).toHaveProperty('createdAt')
      expect(response.body.users[0]).toHaveProperty('updatedAt')
      expect(response.body.users[0]).not.toHaveProperty('password')
    })

    it('should return empty array when no users exist', async () => {
      await prisma.user.deleteMany()

      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.users).toHaveLength(0)
    })

    it('should return users ordered by createdAt desc', async () => {
      await createTestUser('user2@test.com')

      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.users[0].email).toBe('user2@test.com')
      expect(response.body.users[1].email).toBe('test@test.com')
    })
  })

  describe('GET /api/users/:id', () => {
    it('should return a user by ID', async () => {
      const response = await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.user).toHaveProperty('id', userId)
      expect(response.body.user).toHaveProperty('name')
      expect(response.body.user).toHaveProperty('email')
      expect(response.body.user).toHaveProperty('createdAt')
      expect(response.body.user).toHaveProperty('updatedAt')
      expect(response.body.user).not.toHaveProperty('password')
    })

    it('should return 404 when user not found', async () => {
      const nonExistentId = 'non-existent-id'

      const response = await request(app)
        .get(`/api/users/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(404)

      expect(response.body.error).toBe('User not found')
    })
  })
})
