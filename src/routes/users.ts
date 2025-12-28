import { Router } from 'express';
import { prisma } from '../server';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// List all users
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
