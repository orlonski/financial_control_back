import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'

// Carregar variáveis de ambiente
dotenv.config()

// Mock do Prisma para testes
const prisma = new PrismaClient()

// Setup global para testes
beforeAll(async () => {
  // Executar migrações do banco de teste
  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' })
  } catch (error) {
    console.warn('Migration failed, continuing with tests')
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

// Limpar banco entre testes
beforeEach(async () => {
  // Deletar dados em ordem reversa das dependências
  try {
    await prisma.transfer.deleteMany()
    await prisma.transaction.deleteMany()
    await prisma.creditCard.deleteMany()
    await prisma.category.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
  } catch (error) {
    // Ignora erro se banco não estiver disponível (para testes que não precisam de banco)
  }
})

// Helper para criar usuário de teste
export const createTestUser = async (email = 'test@test.com', password = '123456') => {
  return await prisma.user.create({
    data: {
      email,
      password: password, // Em produção seria hash
      name: 'Test User'
    }
  })
}

// Helper para criar conta de teste
export const createTestAccount = async (userId: string, name = 'Test Account') => {
  return await prisma.account.create({
    data: {
      name,
      type: 'CHECKING',
      initialBalance: 1000,
      userId
    }
  })
}

// Helper para criar categoria de teste
export const createTestCategory = async (userId: string, name = 'Test Category') => {
  return await prisma.category.create({
    data: {
      name,
      type: 'EXPENSE',
      userId
    }
  })
}

// Helper para criar cartão de teste
export const createTestCreditCard = async (userId: string, accountId: string, name = 'Test Card') => {
  return await prisma.creditCard.create({
    data: {
      name,
      closingDay: 5,
      dueDay: 10,
      limit: 5000,
      accountId,
      userId
    }
  })
}

export { prisma }
