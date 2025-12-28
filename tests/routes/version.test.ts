import request from 'supertest'
import express from 'express'

// Criar app isolado para este teste (não precisa de banco)
const app = express()
app.use(express.json())

// Version endpoint
app.get('/api/version', (req, res) => {
  const packageJson = require('../../package.json')
  res.json({ version: packageJson.version })
})

describe('Version API', () => {
  describe('GET /api/version', () => {
    it('should return the version from package.json', async () => {
      const packageJson = require('../../package.json')

      const response = await request(app)
        .get('/api/version')
        .expect(200)

      expect(response.body).toHaveProperty('version')
      expect(response.body.version).toBe(packageJson.version)
    })

    it('should return version in correct format', async () => {
      const response = await request(app)
        .get('/api/version')
        .expect(200)

      expect(typeof response.body.version).toBe('string')
      expect(response.body.version).toMatch(/^\d+\.\d+\.\d+$/)
    })
  })
})
