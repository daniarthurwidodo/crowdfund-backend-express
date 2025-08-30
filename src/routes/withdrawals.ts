import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin, requireFundraiserOrAdmin } from '../middleware/roleAuth';
import {
  checkEligibility,
  createWithdraw,
  getMyWithdrawals,
  getWithdrawById,
  cancelWithdraw,
  getProjectStats,
  getPendingWithdrawals,
  approveWithdraw,
  processWithdraw,
  handleXenditWebhook
} from '../controllers/withdrawController';

const router = Router();

// Public webhook endpoint (no auth required)
router.post('/webhook/xendit', handleXenditWebhook);

// Protected routes - require authentication
router.use(authenticateToken);

// User routes
router.get('/eligibility/:projectId', checkEligibility);
router.post('/', createWithdraw);
router.get('/my', getMyWithdrawals);
router.get('/project/:projectId/stats', getProjectStats);
router.get('/:id', getWithdrawById);
router.post('/:id/cancel', cancelWithdraw);

// Admin routes
router.get('/admin/pending', requireAdmin, getPendingWithdrawals);
router.post('/:id/approve', requireAdmin, approveWithdraw);
router.post('/:id/process', requireAdmin, processWithdraw);

export default router;