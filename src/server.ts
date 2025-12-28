// Configurar timezone do Brasil ANTES de qualquer outra coisa
process.env.TZ = 'America/Sao_Paulo';

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Import routes
import authRoutes from './routes/auth';
import accountRoutes from './routes/accounts';
import categoryRoutes from './routes/categories';
import creditCardRoutes from './routes/creditCards';
import transactionRoutes from './routes/transactions';
import transferRoutes from './routes/transfers';
import reportRoutes from './routes/reports';
import recurringRoutes from './routes/recurring';
import budgetRoutes from './routes/budgets';
import goalRoutes from './routes/goals';
import reminderRoutes from './routes/reminders';
import userRoutes from './routes/users';
import summaryRoutes from './routes/summary';
import statsRoutes from './routes/stats';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/credit-cards', creditCardRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/stats', statsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Version
app.get('/api/version', (req, res) => {
  const packageJson = require('../package.json');
  res.json({ version: packageJson.version });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

export { prisma };
