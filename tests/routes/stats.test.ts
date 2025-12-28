import request from 'supertest'
import express from 'express'

// Mock do Prisma antes de qualquer import
const mockPrisma = {
  user: {
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn()
  }
}

jest.mock('../../src/server', () => ({
  prisma: mockPrisma
}))

// Mock do middleware de autenticação
const mockAuthMiddleware = jest.fn((req: any, res: any, next: any) => {
  req.userId = req.headers['user-id'] || 'test-user-id'
  next()
})

jest.mock('../../src/middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => mockAuthMiddleware(req, res, next)
}))

import statsRoutes from '../../src/routes/stats'

const app = express()
app.use(express.json())
app.use('/api/stats', statsRoutes)

describe('Stats API', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Reset auth mock para estado padrão (autenticado)
    mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
      req.userId = req.headers['user-id'] || 'test-user-id'
      next()
    })
  })

  describe('GET /api/stats', () => {
    describe('Cenários de sucesso', () => {
      it('should return stats with users', async () => {
        mockPrisma.user.count.mockResolvedValue(3)
        mockPrisma.user.findFirst.mockResolvedValue({
          createdAt: new Date('2024-01-15T10:30:00Z')
        })

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-token')
          .set('user-id', 'test-user-id')
          .expect(200)

        expect(response.body.totalUsers).toBe(3)
        expect(response.body.lastUserCreatedAt).toBeDefined()
        expect(new Date(response.body.lastUserCreatedAt)).toBeInstanceOf(Date)
        expect(mockPrisma.user.count).toHaveBeenCalledTimes(1)
        expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true }
        })
      })

      it('should return zero users and null date when no users exist', async () => {
        mockPrisma.user.count.mockResolvedValue(0)
        mockPrisma.user.findFirst.mockResolvedValue(null)

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-token')
          .set('user-id', 'test-user-id')
          .expect(200)

        expect(response.body.totalUsers).toBe(0)
        expect(response.body.lastUserCreatedAt).toBeNull()
      })

      it('should return the most recent user creation date', async () => {
        const recentDate = new Date('2024-03-20T15:45:00Z')
        mockPrisma.user.count.mockResolvedValue(5)
        mockPrisma.user.findFirst.mockResolvedValue({
          createdAt: recentDate
        })

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-token')
          .set('user-id', 'test-user-id')
          .expect(200)

        expect(response.body.totalUsers).toBe(5)
        expect(new Date(response.body.lastUserCreatedAt).getTime())
          .toBe(recentDate.getTime())
      })

      it('should return correct stats with single user', async () => {
        const userDate = new Date('2024-02-10T08:00:00Z')
        mockPrisma.user.count.mockResolvedValue(1)
        mockPrisma.user.findFirst.mockResolvedValue({
          createdAt: userDate
        })

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-token')
          .set('user-id', 'test-user-id')
          .expect(200)

        expect(response.body.totalUsers).toBe(1)
        expect(new Date(response.body.lastUserCreatedAt).getTime())
          .toBe(userDate.getTime())
      })
    })

    describe('Cenários de autenticação (401/403)', () => {
      it('should return 401 when no token is provided', async () => {
        mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
          res.status(401).json({ error: 'Access token required' })
        })

        const response = await request(app)
          .get('/api/stats')
          .expect(401)

        expect(response.body.error).toBe('Access token required')
      })

      it('should return 403 when token is invalid', async () => {
        mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
          res.status(403).json({ error: 'Invalid token' })
        })

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer invalid-token')
          .expect(403)

        expect(response.body.error).toBe('Invalid token')
      })

      it('should return 401 when user from token does not exist', async () => {
        mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
          res.status(401).json({ error: 'Invalid token' })
        })

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-but-user-deleted')
          .expect(401)

        expect(response.body.error).toBe('Invalid token')
      })

      it('should return 401 with expired token', async () => {
        mockAuthMiddleware.mockImplementation((req: any, res: any, next: any) => {
          res.status(401).json({ error: 'Token expired' })
        })

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer expired-token')
          .expect(401)

        expect(response.body.error).toBe('Token expired')
      })
    })

    describe('Cenários de erro (500)', () => {
      it('should return 500 when database error occurs on count', async () => {
        mockPrisma.user.count.mockRejectedValue(new Error('Database connection failed'))

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-token')
          .set('user-id', 'test-user-id')
          .expect(500)

        expect(response.body.error).toBe('Internal server error')
      })

      it('should return 500 when database error occurs on findFirst', async () => {
        mockPrisma.user.count.mockResolvedValue(5)
        mockPrisma.user.findFirst.mockRejectedValue(new Error('Query timeout'))

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-token')
          .set('user-id', 'test-user-id')
          .expect(500)

        expect(response.body.error).toBe('Internal server error')
      })

      it('should return 500 when database connection is lost', async () => {
        mockPrisma.user.count.mockRejectedValue(new Error('ECONNREFUSED'))

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-token')
          .set('user-id', 'test-user-id')
          .expect(500)

        expect(response.body.error).toBe('Internal server error')
      })

      it('should not expose internal error details', async () => {
        mockPrisma.user.count.mockRejectedValue(new Error('Sensitive database info'))

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-token')
          .set('user-id', 'test-user-id')
          .expect(500)

        expect(response.body.error).toBe('Internal server error')
        expect(response.body.error).not.toContain('Sensitive')
        expect(JSON.stringify(response.body)).not.toContain('database')
      })
    })

    describe('Edge cases', () => {
      it('should handle large number of users', async () => {
        mockPrisma.user.count.mockResolvedValue(1000000)
        mockPrisma.user.findFirst.mockResolvedValue({
          createdAt: new Date()
        })

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-token')
          .set('user-id', 'test-user-id')
          .expect(200)

        expect(response.body.totalUsers).toBe(1000000)
        expect(response.body.lastUserCreatedAt).toBeDefined()
      })

      it('should return valid JSON structure', async () => {
        mockPrisma.user.count.mockResolvedValue(1)
        mockPrisma.user.findFirst.mockResolvedValue({
          createdAt: new Date()
        })

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-token')
          .set('user-id', 'test-user-id')
          .expect(200)

        expect(response.body).toHaveProperty('totalUsers')
        expect(response.body).toHaveProperty('lastUserCreatedAt')
        expect(typeof response.body.totalUsers).toBe('number')
        expect(Object.keys(response.body)).toHaveLength(2)
      })

      it('should return ISO date format for lastUserCreatedAt', async () => {
        const testDate = new Date('2024-06-15T12:30:45.123Z')
        mockPrisma.user.count.mockResolvedValue(1)
        mockPrisma.user.findFirst.mockResolvedValue({
          createdAt: testDate
        })

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-token')
          .set('user-id', 'test-user-id')
          .expect(200)

        const dateString = response.body.lastUserCreatedAt
        expect(new Date(dateString).toISOString()).toBeDefined()
        expect(isNaN(new Date(dateString).getTime())).toBe(false)
      })

      it('should not include sensitive user data in response', async () => {
        mockPrisma.user.count.mockResolvedValue(1)
        mockPrisma.user.findFirst.mockResolvedValue({
          createdAt: new Date()
        })

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-token')
          .set('user-id', 'test-user-id')
          .expect(200)

        expect(response.body).not.toHaveProperty('email')
        expect(response.body).not.toHaveProperty('password')
        expect(response.body).not.toHaveProperty('name')
        expect(response.body).not.toHaveProperty('users')
        expect(response.body).not.toHaveProperty('id')
      })

      it('should handle count returning zero with findFirst returning null', async () => {
        mockPrisma.user.count.mockResolvedValue(0)
        mockPrisma.user.findFirst.mockResolvedValue(null)

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-token')
          .set('user-id', 'test-user-id')
          .expect(200)

        expect(response.body).toEqual({
          totalUsers: 0,
          lastUserCreatedAt: null
        })
      })

      it('should return content-type application/json', async () => {
        mockPrisma.user.count.mockResolvedValue(1)
        mockPrisma.user.findFirst.mockResolvedValue({
          createdAt: new Date()
        })

        const response = await request(app)
          .get('/api/stats')
          .set('Authorization', 'Bearer valid-token')
          .set('user-id', 'test-user-id')
          .expect(200)

        expect(response.headers['content-type']).toMatch(/application\/json/)
      })
    })
  })
})
