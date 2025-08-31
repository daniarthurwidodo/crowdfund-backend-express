import { Op } from 'sequelize';
import { Payment } from '../models';
import { PaymentStatus } from '../types';
import { enhancedPaymentService } from '../services/enhancedPaymentService';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger('PaymentReconciliationJob');

export interface ReconciliationResult {
  totalChecked: number;
  totalUpdated: number;
  statusUpdates: {
    [key in PaymentStatus]?: number;
  };
  errors: string[];
  executionTime: number;
}

export class PaymentReconciliationJob {
  private isRunning = false;
  private lastRunTime: Date | null = null;

  /**
   * Run full reconciliation for all pending payments
   */
  async runFullReconciliation(): Promise<ReconciliationResult> {
    if (this.isRunning) {
      throw new Error('Reconciliation job is already running');
    }

    const startTime = Date.now();
    this.isRunning = true;

    try {
      logger.info('Starting full payment reconciliation');

      // Get all payments that might need status updates
      const pendingPayments = await Payment.findAll({
        where: {
          status: {
            [Op.in]: [PaymentStatus.PENDING, PaymentStatus.FAILED],
          },
          createdAt: {
            // Only check payments from last 30 days to avoid unnecessary API calls
            [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        attributes: ['id', 'status', 'externalId', 'xenditId', 'createdAt'],
        order: [['createdAt', 'DESC']],
      });

      logger.info(`Found ${pendingPayments.length} payments to reconcile`);

      const result = await this.reconcilePayments(
        pendingPayments.map(p => p.id)
      );

      this.lastRunTime = new Date();
      logger.info('Full reconciliation completed', {
        totalChecked: result.totalChecked,
        totalUpdated: result.totalUpdated,
        executionTime: result.executionTime,
      });

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run incremental reconciliation for recent payments
   */
  async runIncrementalReconciliation(
    hoursBack: number = 4
  ): Promise<ReconciliationResult> {
    if (this.isRunning) {
      throw new Error('Reconciliation job is already running');
    }

    const startTime = Date.now();
    this.isRunning = true;

    try {
      logger.info(
        `Starting incremental reconciliation for last ${hoursBack} hours`
      );

      const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

      // Get payments that might have status changes
      const recentPayments = await Payment.findAll({
        where: {
          [Op.or]: [
            // Pending payments created recently
            {
              status: PaymentStatus.PENDING,
              createdAt: { [Op.gte]: cutoffTime },
            },
            // Payments updated recently but still not final status
            {
              status: {
                [Op.in]: [PaymentStatus.PENDING, PaymentStatus.FAILED],
              },
              updatedAt: { [Op.gte]: cutoffTime },
            },
            // Payments that might have expired
            {
              status: PaymentStatus.PENDING,
              expiredAt: {
                [Op.lte]: new Date(),
                [Op.gte]: cutoffTime,
              },
            },
          ],
        },
        attributes: ['id', 'status', 'externalId', 'xenditId', 'expiredAt'],
        order: [['createdAt', 'DESC']],
      });

      logger.info(
        `Found ${recentPayments.length} recent payments to reconcile`
      );

      const result = await this.reconcilePayments(
        recentPayments.map(p => p.id)
      );

      this.lastRunTime = new Date();
      logger.info('Incremental reconciliation completed', {
        hoursBack,
        totalChecked: result.totalChecked,
        totalUpdated: result.totalUpdated,
        executionTime: result.executionTime,
      });

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Reconcile specific payments by IDs
   */
  async reconcilePayments(paymentIds: string[]): Promise<ReconciliationResult> {
    const startTime = Date.now();
    const statusUpdates: { [key in PaymentStatus]?: number } = {};
    let totalUpdated = 0;
    const errors: string[] = [];

    // Get current statuses before update
    const paymentsBefore = await Payment.findAll({
      where: { id: { [Op.in]: paymentIds } },
      attributes: ['id', 'status'],
    });

    const statusesBefore = new Map(paymentsBefore.map(p => [p.id, p.status]));

    // Use bulk status check from enhanced payment service
    const bulkResult = await enhancedPaymentService.bulkStatusCheck(paymentIds);
    errors.push(...bulkResult.errors);

    // Get statuses after update to count changes
    const paymentsAfter = await Payment.findAll({
      where: { id: { [Op.in]: paymentIds } },
      attributes: ['id', 'status'],
    });

    // Count status changes
    for (const payment of paymentsAfter) {
      const oldStatus = statusesBefore.get(payment.id);
      const newStatus = payment.status;

      if (oldStatus && oldStatus !== newStatus) {
        totalUpdated++;
        statusUpdates[newStatus] = (statusUpdates[newStatus] || 0) + 1;

        logger.info('Payment status reconciled', {
          paymentId: payment.id,
          oldStatus,
          newStatus,
        });
      }
    }

    const executionTime = Date.now() - startTime;

    return {
      totalChecked: paymentIds.length,
      totalUpdated,
      statusUpdates,
      errors,
      executionTime,
    };
  }

  /**
   * Handle expired payments
   */
  async handleExpiredPayments(): Promise<{
    expiredCount: number;
    errors: string[];
  }> {
    logger.info('Checking for expired payments');

    const errors: string[] = [];
    let expiredCount = 0;

    try {
      // Find payments that are still pending but past their expiry date
      const expiredPayments = await Payment.findAll({
        where: {
          status: PaymentStatus.PENDING,
          expiredAt: { [Op.lte]: new Date() },
        },
        attributes: ['id', 'externalId', 'expiredAt'],
      });

      logger.info(`Found ${expiredPayments.length} expired payments`);

      for (const payment of expiredPayments) {
        try {
          await payment.update({ status: PaymentStatus.EXPIRED });
          expiredCount++;

          logger.info('Payment marked as expired', {
            paymentId: payment.id,
            externalId: payment.externalId,
            expiredAt: payment.expiredAt,
          });
        } catch (error: any) {
          const errorMsg = `Failed to expire payment ${payment.id}: ${error.message}`;
          errors.push(errorMsg);
          logger.error(errorMsg);
        }
      }
    } catch (error: any) {
      const errorMsg = `Failed to query expired payments: ${error.message}`;
      errors.push(errorMsg);
      logger.error(errorMsg);
    }

    return { expiredCount, errors };
  }

  /**
   * Generate reconciliation report
   */
  async generateReconciliationReport(days: number = 7): Promise<{
    summary: {
      totalPayments: number;
      byStatus: { [key in PaymentStatus]?: number };
      byMethod: { [key: string]: number };
    };
    issues: {
      longPendingPayments: Array<{
        id: string;
        externalId: string;
        daysPending: number;
      }>;
      failedPayments: Array<{
        id: string;
        externalId: string;
        failureCode?: string;
      }>;
      expiredPayments: Array<{
        id: string;
        externalId: string;
        expiredAt: Date;
      }>;
    };
  }> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get payment summary
    const payments = await Payment.findAll({
      where: {
        createdAt: { [Op.gte]: cutoffDate },
      },
      attributes: [
        'id',
        'status',
        'method',
        'externalId',
        'createdAt',
        'expiredAt',
        'failureCode',
      ],
    });

    // Calculate summary statistics
    const summary = {
      totalPayments: payments.length,
      byStatus: {} as { [key in PaymentStatus]?: number },
      byMethod: {} as { [key: string]: number },
    };

    for (const payment of payments) {
      // Count by status
      summary.byStatus[payment.status] =
        (summary.byStatus[payment.status] || 0) + 1;

      // Count by method
      summary.byMethod[payment.method] =
        (summary.byMethod[payment.method] || 0) + 1;
    }

    // Identify issues
    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const issues = {
      longPendingPayments: payments
        .filter(p => p.status === PaymentStatus.PENDING)
        .map(p => ({
          id: p.id,
          externalId: p.externalId,
          daysPending: Math.floor(
            (now.getTime() - p.createdAt.getTime()) / oneDayMs
          ),
        }))
        .filter(p => p.daysPending > 1)
        .sort((a, b) => b.daysPending - a.daysPending),

      failedPayments: payments
        .filter(p => p.status === PaymentStatus.FAILED)
        .map(p => ({
          id: p.id,
          externalId: p.externalId,
          failureCode: p.failureCode,
        })),

      expiredPayments: payments
        .filter(p => p.status === PaymentStatus.EXPIRED)
        .map(p => ({
          id: p.id,
          externalId: p.externalId,
          expiredAt: p.expiredAt!,
        }))
        .sort((a, b) => b.expiredAt.getTime() - a.expiredAt.getTime()),
    };

    logger.info('Reconciliation report generated', {
      days,
      totalPayments: summary.totalPayments,
      issuesFound:
        issues.longPendingPayments.length +
        issues.failedPayments.length +
        issues.expiredPayments.length,
    });

    return { summary, issues };
  }

  /**
   * Get job status
   */
  getStatus(): {
    isRunning: boolean;
    lastRunTime: Date | null;
  } {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
    };
  }
}

export const paymentReconciliationJob = new PaymentReconciliationJob();
