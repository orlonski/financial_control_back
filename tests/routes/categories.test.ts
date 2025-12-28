import request from 'supertest'
import express from 'express'
import { prisma, createTestUser, createTestCategory } from '../setup'

// Mock do server para evitar import circular
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

// Importar categoriesRoutes APÓS os mocks
import categoriesRoutes from '../../src/routes/categories'

const app = express()
app.use(express.json())
app.use('/api/categories', categoriesRoutes)

describe('Categories API', () => {
  let userId: string
  let authToken: string

  beforeEach(async () => {
    const user = await createTestUser()
    userId = user.id
    authToken = 'valid-token'
  })

  describe('GET /api/categories', () => {
    it('should return all user categories', async () => {
      await createTestCategory(userId, 'Category A')
      await createTestCategory(userId, 'Category B')

      const response = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body).toHaveLength(2)
      expect(response.body[0]).toHaveProperty('id')
      expect(response.body[0]).toHaveProperty('name')
      expect(response.body[0]).toHaveProperty('type')
      expect(response.body[0]).toHaveProperty('createdAt')
    })

    it('should return empty array when user has no categories', async () => {
      const response = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body).toHaveLength(0)
    })

    it('should return categories ordered by name', async () => {
      await createTestCategory(userId, 'Zebra')
      await createTestCategory(userId, 'Apple')
      await createTestCategory(userId, 'Mango')

      const response = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body).toHaveLength(3)
      expect(response.body[0].name).toBe('Apple')
      expect(response.body[1].name).toBe('Mango')
      expect(response.body[2].name).toBe('Zebra')
    })

    it('should not return categories from other users', async () => {
      await createTestCategory(userId, 'My Category')

      const otherUser = await createTestUser('other@test.com')
      await createTestCategory(otherUser.id, 'Other User Category')

      const response = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body).toHaveLength(1)
      expect(response.body[0].name).toBe('My Category')
    })
  })

  describe('GET /api/categories/:id', () => {
    it('should return category by id', async () => {
      const category = await createTestCategory(userId, 'Test Category')

      const response = await request(app)
        .get(`/api/categories/${category.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(200)

      expect(response.body.id).toBe(category.id)
      expect(response.body.name).toBe('Test Category')
    })

    it('should return 404 for non-existent category', async () => {
      await request(app)
        .get('/api/categories/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(404)
    })

    it('should not return category from different user', async () => {
      const otherUser = await createTestUser('other@test.com')
      const otherCategory = await createTestCategory(otherUser.id, 'Other Category')

      await request(app)
        .get(`/api/categories/${otherCategory.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(404)
    })
  })

  describe('POST /api/categories', () => {
    it('should create a new category', async () => {
      const categoryData = {
        name: 'New Category',
        type: 'EXPENSE',
        color: '#FF0000',
        icon: 'shopping'
      }

      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(categoryData)
        .expect(201)

      expect(response.body).toHaveProperty('id')
      expect(response.body.name).toBe(categoryData.name)
      expect(response.body.type).toBe(categoryData.type)
      expect(response.body.color).toBe(categoryData.color)
      expect(response.body.icon).toBe(categoryData.icon)

      // Verificar se foi criado no banco
      const category = await prisma.category.findUnique({
        where: { id: response.body.id }
      })
      expect(category).toBeTruthy()
    })

    it('should create category with INCOME type', async () => {
      const categoryData = {
        name: 'Salary',
        type: 'INCOME'
      }

      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(categoryData)
        .expect(201)

      expect(response.body.type).toBe('INCOME')
    })

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send({})
        .expect(400)

      expect(response.body.error).toBeDefined()
    })

    it('should validate category type', async () => {
      const categoryData = {
        name: 'Test Category',
        type: 'INVALID_TYPE'
      }

      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(categoryData)
        .expect(400)

      expect(response.body.error).toBeDefined()
    })
  })

  describe('PUT /api/categories/:id', () => {
    let categoryId: string

    beforeEach(async () => {
      const category = await createTestCategory(userId, 'Original Category')
      categoryId = category.id
    })

    it('should update category successfully', async () => {
      const updateData = {
        name: 'Updated Category',
        type: 'INCOME',
        color: '#00FF00'
      }

      const response = await request(app)
        .put(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(updateData)
        .expect(200)

      expect(response.body.name).toBe(updateData.name)
      expect(response.body.type).toBe(updateData.type)
      expect(response.body.color).toBe(updateData.color)
    })

    it('should return 404 for non-existent category', async () => {
      const updateData = {
        name: 'Updated Category'
      }

      await request(app)
        .put('/api/categories/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(updateData)
        .expect(404)
    })

    it('should not update category from different user', async () => {
      const otherUser = await createTestUser('other@test.com')
      const otherCategory = await createTestCategory(otherUser.id, 'Other Category')

      const updateData = {
        name: 'Hacked Category'
      }

      await request(app)
        .put(`/api/categories/${otherCategory.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .send(updateData)
        .expect(404)
    })
  })

  describe('DELETE /api/categories/:id', () => {
    let categoryId: string

    beforeEach(async () => {
      const category = await createTestCategory(userId, 'To Delete Category')
      categoryId = category.id
    })

    it('should delete category successfully', async () => {
      await request(app)
        .delete(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(204)

      // Verificar se foi deletado
      const category = await prisma.category.findUnique({
        where: { id: categoryId }
      })
      expect(category).toBeNull()
    })

    it('should return 404 for non-existent category', async () => {
      await request(app)
        .delete('/api/categories/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(404)
    })

    it('should not delete category from different user', async () => {
      const otherUser = await createTestUser('other@test.com')
      const otherCategory = await createTestCategory(otherUser.id, 'Other Category')

      await request(app)
        .delete(`/api/categories/${otherCategory.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('user-id', userId)
        .expect(404)

      // Verificar se não foi deletado
      const category = await prisma.category.findUnique({
        where: { id: otherCategory.id }
      })
      expect(category).toBeTruthy()
    })
  })
})
