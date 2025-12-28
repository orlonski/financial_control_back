import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import * as dotenv from 'dotenv'
import * as path from 'path'

// IMPORTANTE: Carregar .env.test para testes, NUNCA usar banco de produção!
const envPath = path.resolve(__dirname, '..', '.env.test')
dotenv.config({ path: envPath })

// Verificar se está usando banco de teste
const dbUrl = process.env.DATABASE_URL || ''
if (!dbUrl.includes('_test')) {
  console.error('ERRO CRÍTICO: Tentando rodar testes em banco que não é de teste!')
  console.error('DATABASE_URL deve conter "_test" no nome do banco.')
  console.error('Atual:', dbUrl)
  process.exit(1)
}

const prisma = new PrismaClient()

beforeAll(async () => {
  try {
    execSync('npx prisma migrate deploy', { 
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: dbUrl }
    })
  } catch (error) {
    console.warn('Migration failed, continuing with tests')
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

// Limpar banco entre testes (APENAS banco de teste!)
beforeEach(async () => {
  try {
    await prisma.transfer.deleteMany()
    await prisma.transaction.deleteMany()
    await prisma.creditCard.deleteMany()
    await prisma.category.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
  } catch (error) {
    // Ignora erro se tabelas não existirem ainda
  }
})

export const createTestUser = async (email = 'test@test.com', password = '123456') => {
  return await prisma.user.create({
    data: {
      email,
      password,
      name: 'Test User'
    }
  })
}

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

export const createTestCategory = async (userId: string, name = 'Test Category') => {
  return await prisma.category.create({
    data: {
      name,
      type: 'EXPENSE',
      userId
    }
  })
}

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