# Agent Guidelines for Financial Control Backend

## Project Overview
Personal finance management API built with Node.js, TypeScript, Express, and Prisma ORM. Uses PostgreSQL database.

## Environment Setup
```bash
cp .env.example .env  # Configure DATABASE_URL and other vars
npm install
```

## Build & Test Commands

### Development
```bash
npm run dev          # Start dev server with hot reload (tsx watch)
npm run build        # TypeScript compile to dist/
```

### Testing
```bash
npm test             # Run all tests
npm run test:watch  # Watch mode for tests
npm run test:coverage # Coverage report
npm run test:ci     # CI mode (no watch, with coverage)
```

**Running a single test file:**
```bash
npx jest tests/routes/transactions.test.ts
npx jest --testPathPattern="transactions"
```

**Running a single test:**
```bash
npx jest --testNamePattern="should create transaction"
```

### Database
```bash
npm run prisma:generate   # Generate Prisma client
npm run prisma:migrate   # Create migration (dev only)
npm run prisma:deploy    # Deploy migrations (production)
npm run prisma:studio    # Open Prisma Studio UI
```

## Code Style

### File Naming
- Routes/Services: `kebab-case.ts` (e.g., `transaction-service.ts`, `credit-cards.ts`)
- Classes: `PascalCase` (e.g., `TransactionService`)
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`

### TypeScript Conventions
- **Always use explicit types** - never use `any` without strong justification
- **Strict mode enabled** - handle null/undefined explicitly
- **Use interfaces** for request/response types
- **Use Prisma generated types** for database models

```typescript
// Good
interface CreateTransactionData {
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  date: Date;
}

// Avoid
const data: any = req.body;
```

### Import Order
1. Node built-ins (`express`, `fs`, etc.)
2. Third-party packages (`zod`, `jsonwebtoken`, etc.)
3. Prisma client (`@prisma/client`)
4. Internal imports (routes, services, utils)
5. Relative imports (`../`, `./`)

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { TransactionService } from '../services/transactionService';
import { authenticateToken } from '../middleware/auth';
```

### Error Handling

**Use Zod for validation:**
```typescript
const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  amount: z.number().positive('Amount must be positive'),
}).refine(data => data.start < data.end, {
  message: 'Start date must be before end date',
});
```

**Handle Zod errors:**
```typescript
try {
  const data = schema.parse(req.body);
} catch (error) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors[0].message });
  }
  throw error;
}
```

**Use custom error classes:**
```typescript
import { ForbiddenError } from '../errors/forbidden-error';

if (resource.userId !== userId) {
  throw new ForbiddenError('Resource does not belong to user');
}
```

**Always wrap multiple database operations in transactions:**
```typescript
await prisma.$transaction(async (tx) => {
  const updated = await tx.goal.update({ ... });
  await tx.auditLog.create({ ... });
  return updated;
});
```

## Project Patterns

### Route Structure
```typescript
const router = Router();

// Validation schemas (at top)
const createSchema = z.object({ ... });

// GET handlers
router.get('/', authenticateToken, async (req, res) => { ... });

// GET by ID
router.get('/:id', authenticateToken, async (req, res) => { ... });

// POST handlers
router.post('/', authenticateToken, async (req, res) => { ... });

// PUT handlers
router.put('/:id', authenticateToken, async (req, res) => { ... });

// DELETE handlers
router.delete('/:id', authenticateToken, async (req, res) => { ... });

export default router;
```

### Ownership Validation
**Always verify resources belong to the authenticated user:**
```typescript
// In routes - use findFirst with userId
const account = await prisma.account.findFirst({
  where: { id, userId: req.userId }
});

// In services - throw ForbiddenError
if (transaction.userId !== userId) {
  throw new ForbiddenError('Transaction does not belong to user');
}
```

### Date Handling
- **Timezone:** Set to `America/Sao_Paulo` (Brazil)
- **Use UTC internally:** Store dates in UTC
- **Normalize dates:** Use utility functions for consistent time (03:00:00)
- **Validate dates:** Use Zod `.refine()` for date strings

```typescript
// Validate date string
const dateSchema = z.string().refine(
  (str) => !isNaN(new Date(str).getTime()),
  { message: 'Invalid date format' }
).transform((str) => new Date(str));
```

### Decimal Handling
Prisma returns `Decimal` type. Convert for JSON:
```typescript
import { convertDecimalToNumber } from '../utils/decimal';

const result = await prisma.transaction.findMany(...);
res.json(convertDecimalToNumber(result));
```

## API Response Patterns

**Success (201 Created):**
```typescript
res.status(201).json(createdResource);
```

**Success (200 OK):**
```typescript
res.json(result);
```

**No Content (204):**
```typescript
res.status(204).send();
```

**Error (400):**
```typescript
res.status(400).json({ error: 'Validation failed', details: error.errors });
```

**Error (404):**
```typescript
res.status(404).json({ error: 'Resource not found' });
```

**Error (500):**
```typescript
res.status(500).json({ error: 'Internal server error' });
```

## Prisma Guidelines

- Always run `prisma generate` after schema changes
- Use `@@index` for frequently queried fields
- Use `@@unique` for natural keys
- Prefer `findFirst` with `userId` for user-scoped queries
- Use `select` to limit returned fields when possible

## Security Checklist
- [ ] Validate all input with Zod schemas
- [ ] Check resource ownership before modifications
- [ ] Never expose internal errors to clients
- [ ] Hash passwords with bcrypt (already configured in auth)
- [ ] Use JWT authentication middleware
