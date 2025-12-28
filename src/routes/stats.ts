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

export default router;
