import { Router } from 'express';
import { TransactionService } from '../services/transactionService';
import { authenticateToken } from '../middleware/auth';
import { convertDecimalToNumber } from '../utils/decimal';

const router = Router();

// GET /api/summary - Get financial summary
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const { accountId, startDate, endDate } = req.query;

    const filters: {
      accountId?: string;
      startDate?: Date;
      endDate?: Date;
    } = {};

    if (accountId) {
      filters.accountId = accountId;
    }

    if (startDate) {
      filters.startDate = new Date(startDate);
    }

    if (endDate) {
      filters.endDate = new Date(endDate);
    }

    const summary = await TransactionService.getFinancialSummary(
      req.userId,
      filters
    );

    res.json(convertDecimalToNumber(summary));
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
