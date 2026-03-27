import { Router } from 'express';
import { prisma } from '../server';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Get system statistics
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const totalUsers = await prisma.user.count();

    const lastUser = await prisma.user.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    });

    res.json({
      totalUsers,
      lastUserCreatedAt: lastUser?.createdAt || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get transaction count per user
router.get('/transactions-per-user', authenticateToken, async (req: any, res) => {
  try {
    const transactionsPerUser = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        _count: {
          select: {
            transactions: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    const result = transactionsPerUser.map(user => ({
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      transactionCount: user._count.transactions
    }));

    const totalTransactions = result.reduce((sum, user) => sum + user.transactionCount, 0);

    res.json({
      users: result,
      totalUsers: result.length,
      totalTransactions
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
