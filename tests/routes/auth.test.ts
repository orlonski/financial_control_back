import request from 'supertest'
import express from 'express'
import authRoutes from '../src/routes/auth'
import { prisma, createTestUser } from './setup'

const app = express()
app.use(express.json())
app.use('/api/auth', authRoutes)

describe('Auth API', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'newuser@test.com',
        password: '123456',
        name: 'New User'
      }

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201)

      expect(response.body).toHaveProperty('token')
      expect(response.body).toHaveProperty('user')
      expect(response.body.user.email).toBe(userData.email)
      expect(response.body.user.name).toBe(userData.name)
      expect(response.body.user).not.toHaveProperty('password')

      // Verificar se usuário foi criado no banco
      const user = await prisma.user.findUnique({
        where: { email: userData.email }
      })
      expect(user).toBeTruthy()
      expect(user?.email).toBe(userData.email)
    })

    it('should not register user with existing email', async () => {
      await createTestUser('existing@test.com')

      const userData = {
        email: 'existing@test.com',
        password: '123456',
        name: 'Existing User'
      }

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400)

      expect(response.body.error).toContain('already exists')
    })

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({})
        .expect(400)

      expect(response.body.error).toBeDefined()
    })

    it('should validate email format', async () => {
      const userData = {
        email: 'invalid-email',
        password: '123456',
        name: 'Test User'
      }

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400)

      expect(response.body.error).toContain('email')
    })

    it('should validate password length', async () => {
      const userData = {
        email: 'test@test.com',
        password: '123',
        name: 'Test User'
      }

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400)

      expect(response.body.error).toContain('password')
    })
  })

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await createTestUser('login@test.com', '123456')
    })

    it('should login with valid credentials', async () => {
      const loginData = {
        email: 'login@test.com',
        password: '123456'
      }

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200)

      expect(response.body).toHaveProperty('token')
      expect(response.body).toHaveProperty('user')
      expect(response.body.user.email).toBe(loginData.email)
      expect(response.body.user).not.toHaveProperty('password')
    })

    it('should not login with invalid email', async () => {
      const loginData = {
        email: 'nonexistent@test.com',
        password: '123456'
      }

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401)

      expect(response.body.error).toContain('Invalid credentials')
    })

    it('should not login with invalid password', async () => {
      const loginData = {
        email: 'login@test.com',
        password: 'wrongpassword'
      }

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401)

      expect(response.body.error).toContain('Invalid credentials')
    })

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400)

      expect(response.body.error).toBeDefined()
    })
  })

  describe('GET /api/auth/me', () => {
    let token: string
    let userId: string

    beforeEach(async () => {
      const user = await createTestUser('me@test.com')
      userId = user.id
      
      // Simular token JWT (em produção seria gerado pelo bcrypt)
      token = 'valid-token'
    })

    it('should return user data with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(response.body).toHaveProperty('id')
      expect(response.body).toHaveProperty('email')
      expect(response.body).toHaveProperty('name')
      expect(response.body).not.toHaveProperty('password')
    })

    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401)

      expect(response.body.error).toContain('token')
    })

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401)

      expect(response.body.error).toContain('token')
    })
  })
})
