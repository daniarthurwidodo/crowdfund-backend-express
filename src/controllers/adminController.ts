import { Request, Response } from 'express';
import Joi from 'joi';
import { paymentReconciliationJob } from '../jobs/paymentReconciliationJob';
import { jobScheduler } from '../jobs/scheduler';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger('AdminController');

const runReconciliationSchema = Joi.object({
  type: Joi.string().valid('full', 'incremental').required(),
  hoursBack: Joi.number().integer().min(1).max(168).optional(), // Max 1 week
});

const runJobSchema = Joi.object({
  jobName: Joi.string()
    .valid(
      'incremental-reconciliation',
      'full-reconciliation',
      'expired-payments',
      'weekly-report'
    )
    .required(),
});

const reconcilePaymentsSchema = Joi.object({
  paymentIds: Joi.array()
    .items(Joi.string().length(26).required())
    .min(1)
    .max(100)
    .required(),
});

/**
 * @swagger
 * /api/admin/reconciliation/run:
 *   post:
 *     summary: Run payment reconciliation
 *     description: Manually trigger payment reconciliation (full or incremental)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [full, incremental]
 *                 description: Type of reconciliation to run
 *               hoursBack:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 168
 *                 description: Hours back to check (for incremental only)
 *     responses:
 *       200:
 *         description: Reconciliation completed successfully
 *       400:
 *         description: Invalid request parameters
 *       403:
 *         description: Admin access required
 */
export const runReconciliation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { error, value } = runReconciliationSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.details[0].message });
      return;
    }

    logger.info('Admin triggered reconciliation', {
      type: value.type,
      hoursBack: value.hoursBack,
      adminId: req.user?.id,
    });

    let result;
    if (value.type === 'full') {
      result = await paymentReconciliationJob.runFullReconciliation();
    } else {
      result = await paymentReconciliationJob.runIncrementalReconciliation(
        value.hoursBack || 4
      );
    }

    res.json({
      message: 'Reconciliation completed successfully',
      result,
    });
  } catch (error: any) {
    logger.error(
      { err: error, userId: req.user?.id },
      'Error running reconciliation'
    );

    if (error.message === 'Reconciliation job is already running') {
      res.status(409).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};

/**
 * @swagger
 * /api/admin/reconciliation/payments:
 *   post:
 *     summary: Reconcile specific payments
 *     description: Manually reconcile status for specific payment IDs
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentIds
 *             properties:
 *               paymentIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 maxItems: 100
 *                 description: Array of payment IDs to reconcile
 *     responses:
 *       200:
 *         description: Payments reconciled successfully
 */
export const reconcilePayments = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { error, value } = reconcilePaymentsSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.details[0].message });
      return;
    }

    logger.info('Admin triggered payment reconciliation', {
      paymentCount: value.paymentIds.length,
      adminId: req.user?.id,
    });

    const result = await paymentReconciliationJob.reconcilePayments(
      value.paymentIds
    );

    res.json({
      message: 'Payments reconciled successfully',
      result,
    });
  } catch (error: any) {
    logger.error(
      { err: error, userId: req.user?.id },
      'Error reconciling payments'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * @swagger
 * /api/admin/reconciliation/expired:
 *   post:
 *     summary: Handle expired payments
 *     description: Manually trigger expired payment handling
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Expired payments handled successfully
 */
export const handleExpiredPayments = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    logger.info('Admin triggered expired payment handling', {
      adminId: req.user?.id,
    });

    const result = await paymentReconciliationJob.handleExpiredPayments();

    res.json({
      message: 'Expired payments handled successfully',
      result,
    });
  } catch (error: any) {
    logger.error(
      { err: error, userId: req.user?.id },
      'Error handling expired payments'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * @swagger
 * /api/admin/reconciliation/report:
 *   get:
 *     summary: Get reconciliation report
 *     description: Generate reconciliation report for specified period
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 30
 *           default: 7
 *         description: Number of days to include in report
 *     responses:
 *       200:
 *         description: Reconciliation report generated successfully
 */
export const getReconciliationReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 7, 30);

    logger.info('Admin requested reconciliation report', {
      days,
      adminId: req.user?.id,
    });

    const report =
      await paymentReconciliationJob.generateReconciliationReport(days);

    res.json({
      message: 'Reconciliation report generated successfully',
      report,
      period: {
        days,
        fromDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        toDate: new Date(),
      },
    });
  } catch (error: any) {
    logger.error(
      { err: error, userId: req.user?.id },
      'Error generating reconciliation report'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * @swagger
 * /api/admin/jobs/status:
 *   get:
 *     summary: Get job scheduler status
 *     description: Get status of all scheduled jobs and reconciliation service
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job status retrieved successfully
 */
export const getJobStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const status = jobScheduler.getStatus();

    res.json({
      message: 'Job status retrieved successfully',
      status,
    });
  } catch (error: any) {
    logger.error(
      { err: error, userId: req.user?.id },
      'Error getting job status'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * @swagger
 * /api/admin/jobs/run:
 *   post:
 *     summary: Run scheduled job manually
 *     description: Manually execute a scheduled job
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jobName
 *             properties:
 *               jobName:
 *                 type: string
 *                 enum: [incremental-reconciliation, full-reconciliation, expired-payments, weekly-report]
 *                 description: Name of the job to run
 *     responses:
 *       200:
 *         description: Job executed successfully
 */
export const runJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = runJobSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.details[0].message });
      return;
    }

    logger.info('Admin manually triggered job', {
      jobName: value.jobName,
      adminId: req.user?.id,
    });

    await jobScheduler.runJobNow(value.jobName);

    res.json({
      message: `Job '${value.jobName}' executed successfully`,
    });
  } catch (error: any) {
    logger.error(
      { err: error, userId: req.user?.id, jobName: req.body.jobName },
      'Error running job'
    );

    if (error.message.includes('already running')) {
      res.status(409).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};

/**
 * @swagger
 * /api/admin/jobs/start:
 *   post:
 *     summary: Start job scheduler
 *     description: Start the job scheduler and all scheduled jobs
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job scheduler started successfully
 */
export const startJobScheduler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    logger.info('Admin starting job scheduler', { adminId: req.user?.id });

    jobScheduler.start();

    res.json({
      message: 'Job scheduler started successfully',
    });
  } catch (error: any) {
    logger.error(
      { err: error, userId: req.user?.id },
      'Error starting job scheduler'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * @swagger
 * /api/admin/jobs/stop:
 *   post:
 *     summary: Stop job scheduler
 *     description: Stop the job scheduler and all scheduled jobs
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job scheduler stopped successfully
 */
export const stopJobScheduler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    logger.info('Admin stopping job scheduler', { adminId: req.user?.id });

    jobScheduler.stop();

    res.json({
      message: 'Job scheduler stopped successfully',
    });
  } catch (error: any) {
    logger.error(
      { err: error, userId: req.user?.id },
      'Error stopping job scheduler'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};
