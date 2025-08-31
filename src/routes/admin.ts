import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleAuth';
import {
  runReconciliation,
  reconcilePayments,
  handleExpiredPayments,
  getReconciliationReport,
  getJobStatus,
  runJob,
  startJobScheduler,
  stopJobScheduler,
} from '../controllers/adminController';

const router = Router();

// Apply authentication and admin role requirement to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Payment reconciliation routes
router.post('/reconciliation/run', runReconciliation);
router.post('/reconciliation/payments', reconcilePayments);
router.post('/reconciliation/expired', handleExpiredPayments);
router.get('/reconciliation/report', getReconciliationReport);

// Job management routes
router.get('/jobs/status', getJobStatus);
router.post('/jobs/run', runJob);
router.post('/jobs/start', startJobScheduler);
router.post('/jobs/stop', stopJobScheduler);

export default router;
