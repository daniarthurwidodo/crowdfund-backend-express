import cron from 'node-cron';
import { paymentReconciliationJob } from './paymentReconciliationJob';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger('JobScheduler');

export class JobScheduler {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private isInitialized = false;

  /**
   * Initialize all scheduled jobs
   */
  initialize(): void {
    if (this.isInitialized) {
      logger.warn('Job scheduler already initialized');
      return;
    }

    try {
      // Schedule incremental reconciliation every 30 minutes
      const incrementalTask = cron.schedule(
        '*/30 * * * *',
        async () => {
          try {
            logger.info('Starting scheduled incremental reconciliation');
            await paymentReconciliationJob.runIncrementalReconciliation(2); // Check last 2 hours
          } catch (error: any) {
            logger.error({ err: error }, 'Incremental reconciliation failed');
          }
        },
        {
          scheduled: false,
          name: 'incremental-reconciliation',
        }
      );

      this.tasks.set('incremental-reconciliation', incrementalTask);

      // Schedule full reconciliation daily at 2 AM
      const fullTask = cron.schedule(
        '0 2 * * *',
        async () => {
          try {
            logger.info('Starting scheduled full reconciliation');
            await paymentReconciliationJob.runFullReconciliation();
          } catch (error: any) {
            logger.error({ err: error }, 'Full reconciliation failed');
          }
        },
        {
          scheduled: false,
          name: 'full-reconciliation',
        }
      );

      this.tasks.set('full-reconciliation', fullTask);

      // Schedule expired payment handling every hour
      const expiredTask = cron.schedule(
        '0 * * * *',
        async () => {
          try {
            logger.info('Starting scheduled expired payment check');
            await paymentReconciliationJob.handleExpiredPayments();
          } catch (error: any) {
            logger.error({ err: error }, 'Expired payment check failed');
          }
        },
        {
          scheduled: false,
          name: 'expired-payments',
        }
      );

      this.tasks.set('expired-payments', expiredTask);

      // Schedule reconciliation report generation weekly (Mondays at 8 AM)
      const reportTask = cron.schedule(
        '0 8 * * 1',
        async () => {
          try {
            logger.info('Generating weekly reconciliation report');
            const report =
              await paymentReconciliationJob.generateReconciliationReport(7);

            // Log report summary
            logger.info('Weekly reconciliation report', {
              totalPayments: report.summary.totalPayments,
              statusBreakdown: report.summary.byStatus,
              methodBreakdown: report.summary.byMethod,
              longPendingCount: report.issues.longPendingPayments.length,
              failedCount: report.issues.failedPayments.length,
              expiredCount: report.issues.expiredPayments.length,
            });

            // In a production system, you might want to:
            // - Send the report via email
            // - Store it in a database
            // - Upload to a monitoring system
            // - Generate alerts for critical issues
          } catch (error: any) {
            logger.error({ err: error }, 'Weekly report generation failed');
          }
        },
        {
          scheduled: false,
          name: 'weekly-report',
        }
      );

      this.tasks.set('weekly-report', reportTask);

      this.isInitialized = true;
      logger.info('Job scheduler initialized with tasks', {
        taskCount: this.tasks.size,
        tasks: Array.from(this.tasks.keys()),
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Failed to initialize job scheduler');
      throw error;
    }
  }

  /**
   * Start all scheduled jobs
   */
  start(): void {
    if (!this.isInitialized) {
      throw new Error(
        'Job scheduler not initialized. Call initialize() first.'
      );
    }

    for (const [name, task] of this.tasks) {
      try {
        task.start();
        logger.info(`Started scheduled job: ${name}`);
      } catch (error: any) {
        logger.error(
          { err: error, taskName: name },
          'Failed to start scheduled job'
        );
      }
    }

    logger.info('All scheduled jobs started');
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    for (const [name, task] of this.tasks) {
      try {
        task.stop();
        logger.info(`Stopped scheduled job: ${name}`);
      } catch (error: any) {
        logger.error(
          { err: error, taskName: name },
          'Failed to stop scheduled job'
        );
      }
    }

    logger.info('All scheduled jobs stopped');
  }

  /**
   * Start specific job
   */
  startJob(name: string): void {
    const task = this.tasks.get(name);
    if (!task) {
      throw new Error(`Job not found: ${name}`);
    }

    task.start();
    logger.info(`Started job: ${name}`);
  }

  /**
   * Stop specific job
   */
  stopJob(name: string): void {
    const task = this.tasks.get(name);
    if (!task) {
      throw new Error(`Job not found: ${name}`);
    }

    task.stop();
    logger.info(`Stopped job: ${name}`);
  }

  /**
   * Run job immediately (for testing/manual execution)
   */
  async runJobNow(name: string): Promise<void> {
    logger.info(`Manually executing job: ${name}`);

    switch (name) {
      case 'incremental-reconciliation':
        return paymentReconciliationJob.runIncrementalReconciliation();
      case 'full-reconciliation':
        return paymentReconciliationJob.runFullReconciliation();
      case 'expired-payments':
        const result = await paymentReconciliationJob.handleExpiredPayments();
        logger.info('Expired payments handled', result);
        return;
      case 'weekly-report':
        const report =
          await paymentReconciliationJob.generateReconciliationReport(7);
        logger.info('Report generated', report);
        return;
      default:
        throw new Error(`Unknown job: ${name}`);
    }
  }

  /**
   * Get status of all jobs
   */
  getStatus(): {
    initialized: boolean;
    jobs: Array<{
      name: string;
      running: boolean;
      nextRun?: Date;
    }>;
    reconciliationStatus: {
      isRunning: boolean;
      lastRunTime: Date | null;
    };
  } {
    const jobs = Array.from(this.tasks.entries()).map(([name, task]) => ({
      name,
      running: task.getStatus() === 'scheduled',
      // Note: node-cron doesn't expose next run time, you might need a different library for that
    }));

    return {
      initialized: this.isInitialized,
      jobs,
      reconciliationStatus: paymentReconciliationJob.getStatus(),
    };
  }

  /**
   * Destroy scheduler and cleanup
   */
  destroy(): void {
    this.stop();
    this.tasks.clear();
    this.isInitialized = false;
    logger.info('Job scheduler destroyed');
  }
}

export const jobScheduler = new JobScheduler();
