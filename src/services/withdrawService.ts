import { Op, Transaction } from 'sequelize';
import { Project, Donation, Payment, Withdraw } from '../models';
import {
  WithdrawStatus,
  WithdrawMethod,
  WithdrawInstance,
  WithdrawRequest,
  WithdrawApproval,
  PaymentStatus,
  ProjectStatus,
  XenditDisbursementRequest,
  XenditDisbursementResponse,
} from '../types';
import { xendit, XENDIT_CONFIG } from '../config/xendit';
import { generateULID } from '../utils/ulid';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger('WithdrawService');

interface WithdrawEligibility {
  eligible: boolean;
  reason?: string;
  availableAmount: number;
  totalRaised: number;
  pendingWithdrawals: number;
}

export class WithdrawService {
  /**
   * Check withdrawal eligibility for a project
   */
  async checkWithdrawEligibility(
    projectId: string,
    userId: string
  ): Promise<WithdrawEligibility> {
    try {
      const project = await Project.findByPk(projectId, {
        include: [
          {
            model: Donation,
            as: 'donations',
            where: { paymentStatus: PaymentStatus.PAID },
            required: false,
            attributes: [],
          },
        ],
        attributes: {
          include: [
            [
              Project.sequelize!.fn(
                'SUM',
                Project.sequelize!.col('donations.amount')
              ),
              'totalRaised',
            ],
          ],
        },
        group: ['Project.id'],
      });

      if (!project) {
        return {
          eligible: false,
          reason: 'Project not found',
          availableAmount: 0,
          totalRaised: 0,
          pendingWithdrawals: 0,
        };
      }

      // Check if user is the project owner
      if (project.fundraiserId !== userId) {
        return {
          eligible: false,
          reason: 'Only project owner can request withdrawals',
          availableAmount: 0,
          totalRaised: 0,
          pendingWithdrawals: 0,
        };
      }

      // Check project status
      if (
        project.status !== ProjectStatus.ACTIVE &&
        project.status !== ProjectStatus.COMPLETED
      ) {
        return {
          eligible: false,
          reason: 'Project must be active or completed to request withdrawals',
          availableAmount: 0,
          totalRaised: 0,
          pendingWithdrawals: 0,
        };
      }

      const totalRaised =
        Number(
          (project as any).dataValues?.totalRaised || project.currentAmount
        ) || 0;

      // Get pending withdrawals
      const pendingWithdrawals =
        (await Withdraw.sum('amount', {
          where: {
            projectId,
            status: {
              [Op.in]: [
                WithdrawStatus.PENDING,
                WithdrawStatus.PROCESSING,
                WithdrawStatus.APPROVED,
              ],
            },
          },
        })) || 0;

      // Get completed withdrawals
      const completedWithdrawals =
        (await Withdraw.sum('amount', {
          where: {
            projectId,
            status: WithdrawStatus.COMPLETED,
          },
        })) || 0;

      const availableAmount =
        totalRaised - completedWithdrawals - Number(pendingWithdrawals);

      // Minimum withdrawal amount check
      const minimumWithdrawal = 10000; // IDR 10,000
      if (availableAmount < minimumWithdrawal) {
        return {
          eligible: false,
          reason: `Minimum withdrawal amount is IDR ${minimumWithdrawal.toLocaleString()}`,
          availableAmount,
          totalRaised,
          pendingWithdrawals: Number(pendingWithdrawals),
        };
      }

      return {
        eligible: true,
        availableAmount,
        totalRaised,
        pendingWithdrawals: Number(pendingWithdrawals),
      };
    } catch (error) {
      logger.error(
        { err: error, projectId, userId },
        'Error checking withdrawal eligibility'
      );
      throw error;
    }
  }

  /**
   * Create a withdrawal request
   */
  async createWithdrawRequest(
    userId: string,
    request: WithdrawRequest
  ): Promise<WithdrawInstance> {
    let transaction: Transaction | undefined;

    try {
      transaction = await Withdraw.sequelize!.transaction();

      // Check eligibility
      const eligibility = await this.checkWithdrawEligibility(
        request.projectId,
        userId
      );

      if (!eligibility.eligible) {
        throw new Error(eligibility.reason || 'Withdrawal not eligible');
      }

      // Validate withdrawal amount
      if (request.amount <= 0) {
        throw new Error('Withdrawal amount must be greater than zero');
      }

      if (request.amount > eligibility.availableAmount) {
        throw new Error(
          `Insufficient funds. Available: IDR ${eligibility.availableAmount.toLocaleString()}`
        );
      }

      // Validate bank account for bank transfers
      if (
        [
          WithdrawMethod.BANK_TRANSFER,
          WithdrawMethod.XENDIT_DISBURSEMENT,
        ].includes(request.method)
      ) {
        if (!request.bankAccount) {
          throw new Error(
            'Bank account details are required for this withdrawal method'
          );
        }

        if (
          !request.bankAccount.bankCode ||
          !request.bankAccount.accountNumber ||
          !request.bankAccount.accountHolderName
        ) {
          throw new Error('Complete bank account details are required');
        }
      }

      // Create withdrawal record
      const withdrawalData: any = {
        userId,
        projectId: request.projectId,
        amount: request.amount,
        availableAmount: eligibility.availableAmount,
        currency: 'IDR',
        method: request.method,
        status: WithdrawStatus.PENDING,
        requestedAt: new Date(),
        reason: request.reason,
      };

      // Add bank details if provided
      if (request.bankAccount) {
        withdrawalData.bankName = request.bankAccount.bankName;
        withdrawalData.bankCode = request.bankAccount.bankCode;
        withdrawalData.accountNumber = request.bankAccount.accountNumber;
        withdrawalData.accountHolderName =
          request.bankAccount.accountHolderName;
      }

      const withdrawal = await Withdraw.create(withdrawalData, { transaction });

      await transaction.commit();

      logger.info('Withdrawal request created', {
        withdrawalId: withdrawal.id,
        userId,
        projectId: request.projectId,
        amount: request.amount,
        method: request.method,
      });

      return withdrawal;
    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      logger.error(
        { err: error, userId, request },
        'Error creating withdrawal request'
      );
      throw error;
    }
  }

  /**
   * Approve or reject a withdrawal request (admin only)
   */
  async processWithdrawApproval(
    adminId: string,
    approval: WithdrawApproval
  ): Promise<WithdrawInstance> {
    let transaction: Transaction | undefined;

    try {
      transaction = await Withdraw.sequelize!.transaction();

      const withdrawal = await Withdraw.findByPk(approval.withdrawId, {
        transaction,
      });

      if (!withdrawal) {
        throw new Error('Withdrawal request not found');
      }

      if (!withdrawal.canBeApproved() && !withdrawal.canBeRejected()) {
        throw new Error(
          `Cannot process withdrawal in ${withdrawal.status} status`
        );
      }

      const updateData: any = {
        adminNotes: approval.adminNotes,
      };

      if (approval.approved) {
        // Re-check eligibility before approval
        const eligibility = await this.checkWithdrawEligibility(
          withdrawal.projectId,
          withdrawal.userId
        );

        if (!eligibility.eligible) {
          throw new Error(`Cannot approve: ${eligibility.reason}`);
        }

        if (withdrawal.amount > eligibility.availableAmount) {
          throw new Error(
            `Cannot approve: Insufficient funds. Available: IDR ${eligibility.availableAmount.toLocaleString()}`
          );
        }

        updateData.status = WithdrawStatus.APPROVED;
        updateData.approvedBy = adminId;
        updateData.approvedAt = new Date();

        // Update processing method if provided
        if (approval.processingMethod) {
          updateData.method = approval.processingMethod;
        }
      } else {
        updateData.status = WithdrawStatus.REJECTED;
        updateData.rejectedBy = adminId;
        updateData.rejectedAt = new Date();
      }

      await withdrawal.update(updateData, { transaction });
      await transaction.commit();

      logger.info('Withdrawal approval processed', {
        withdrawalId: withdrawal.id,
        approved: approval.approved,
        adminId,
        newStatus: updateData.status,
      });

      return withdrawal;
    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      logger.error(
        { err: error, adminId, approval },
        'Error processing withdrawal approval'
      );
      throw error;
    }
  }

  /**
   * Process approved withdrawal via Xendit disbursement
   */
  async processXenditDisbursement(
    withdrawalId: string,
    processedBy: string
  ): Promise<WithdrawInstance> {
    let transaction: Transaction | undefined;

    try {
      transaction = await Withdraw.sequelize!.transaction();

      const withdrawal = await Withdraw.findByPk(withdrawalId, { transaction });

      if (!withdrawal) {
        throw new Error('Withdrawal not found');
      }

      if (!withdrawal.canBeProcessed()) {
        throw new Error(
          `Cannot process withdrawal in ${withdrawal.status} status`
        );
      }

      if (
        !withdrawal.bankCode ||
        !withdrawal.accountNumber ||
        !withdrawal.accountHolderName
      ) {
        throw new Error(
          'Bank account details are required for Xendit disbursement'
        );
      }

      // Update status to processing
      await withdrawal.update(
        {
          status: WithdrawStatus.PROCESSING,
          processedBy,
          processedAt: new Date(),
        },
        { transaction }
      );

      await transaction.commit();

      // Create Xendit disbursement (outside transaction to avoid long locks)
      try {
        const disbursementRequest: XenditDisbursementRequest = {
          external_id: `withdraw-${withdrawal.id}`,
          bank_code: withdrawal.bankCode,
          account_holder_name: withdrawal.accountHolderName,
          account_number: withdrawal.accountNumber,
          description: `Withdrawal for project ${withdrawal.projectId}`,
          amount: withdrawal.netAmount,
          email_to: [], // Add email notifications if needed
        };

        let disbursementResponse: XenditDisbursementResponse;

        if (XENDIT_CONFIG.isProduction) {
          // Real Xendit API call
          disbursementResponse = await (xendit as any).Disbursement.create({
            data: disbursementRequest,
          });
        } else {
          // Mock response for development
          disbursementResponse = {
            id: `disb_${Date.now()}`,
            external_id: disbursementRequest.external_id,
            amount: disbursementRequest.amount,
            bank_code: disbursementRequest.bank_code,
            account_holder_name: disbursementRequest.account_holder_name,
            disbursement_description: disbursementRequest.description,
            status: 'PENDING',
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          };
        }

        // Update withdrawal with disbursement details
        await withdrawal.update({
          xenditDisbursementId: disbursementResponse.id,
          disbursementData: disbursementResponse,
        });

        logger.info('Xendit disbursement created', {
          withdrawalId: withdrawal.id,
          disbursementId: disbursementResponse.id,
          amount: withdrawal.netAmount,
          processedBy,
        });

        return withdrawal;
      } catch (disbursementError: any) {
        // Update withdrawal status to failed
        await withdrawal.update({
          status: WithdrawStatus.FAILED,
          adminNotes: `Disbursement failed: ${disbursementError.message}`,
        });

        logger.error(
          { err: disbursementError, withdrawalId },
          'Xendit disbursement failed'
        );
        throw new Error(`Disbursement failed: ${disbursementError.message}`);
      }
    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      logger.error(
        { err: error, withdrawalId, processedBy },
        'Error processing Xendit disbursement'
      );
      throw error;
    }
  }

  /**
   * Mark withdrawal as completed (when disbursement succeeds)
   */
  async completeWithdrawal(
    withdrawalId: string,
    disbursementData?: any
  ): Promise<WithdrawInstance> {
    try {
      const withdrawal = await Withdraw.findByPk(withdrawalId);

      if (!withdrawal) {
        throw new Error('Withdrawal not found');
      }

      if (withdrawal.status !== WithdrawStatus.PROCESSING) {
        throw new Error(
          `Cannot complete withdrawal in ${withdrawal.status} status`
        );
      }

      const updateData: any = {
        status: WithdrawStatus.COMPLETED,
        completedAt: new Date(),
      };

      if (disbursementData) {
        updateData.disbursementData = {
          ...withdrawal.disbursementData,
          ...disbursementData,
        };
      }

      await withdrawal.update(updateData);

      logger.info('Withdrawal completed', {
        withdrawalId: withdrawal.id,
        amount: withdrawal.amount,
        netAmount: withdrawal.netAmount,
      });

      return withdrawal;
    } catch (error) {
      logger.error({ err: error, withdrawalId }, 'Error completing withdrawal');
      throw error;
    }
  }

  /**
   * Cancel a withdrawal request
   */
  async cancelWithdrawal(
    withdrawalId: string,
    userId: string,
    isAdmin: boolean = false
  ): Promise<WithdrawInstance> {
    try {
      const withdrawal = await Withdraw.findByPk(withdrawalId);

      if (!withdrawal) {
        throw new Error('Withdrawal not found');
      }

      // Check authorization
      if (!isAdmin && withdrawal.userId !== userId) {
        throw new Error('Not authorized to cancel this withdrawal');
      }

      if (!withdrawal.canBeCancelled()) {
        throw new Error(
          `Cannot cancel withdrawal in ${withdrawal.status} status`
        );
      }

      await withdrawal.update({
        status: WithdrawStatus.CANCELLED,
        adminNotes: isAdmin ? 'Cancelled by admin' : 'Cancelled by user',
      });

      logger.info('Withdrawal cancelled', {
        withdrawalId: withdrawal.id,
        cancelledBy: userId,
        isAdmin,
      });

      return withdrawal;
    } catch (error) {
      logger.error(
        { err: error, withdrawalId, userId },
        'Error cancelling withdrawal'
      );
      throw error;
    }
  }

  /**
   * Get withdrawal statistics for a project
   */
  async getProjectWithdrawStats(projectId: string): Promise<{
    totalRequested: number;
    totalCompleted: number;
    totalPending: number;
    availableAmount: number;
    totalFees: number;
  }> {
    try {
      const [requested, completed, pending, fees] = await Promise.all([
        Withdraw.sum('amount', {
          where: { projectId },
        }) || 0,

        Withdraw.sum('amount', {
          where: {
            projectId,
            status: WithdrawStatus.COMPLETED,
          },
        }) || 0,

        Withdraw.sum('amount', {
          where: {
            projectId,
            status: {
              [Op.in]: [
                WithdrawStatus.PENDING,
                WithdrawStatus.PROCESSING,
                WithdrawStatus.APPROVED,
              ],
            },
          },
        }) || 0,

        Withdraw.sum('processingFee', {
          where: {
            projectId,
            status: WithdrawStatus.COMPLETED,
          },
        }) || 0,
      ]);

      // Get project's total raised amount
      const project = await Project.findByPk(projectId);
      const totalRaised = project ? Number(project.currentAmount) : 0;
      const availableAmount = Math.max(
        0,
        totalRaised - Number(completed) - Number(pending)
      );

      return {
        totalRequested: Number(requested),
        totalCompleted: Number(completed),
        totalPending: Number(pending),
        availableAmount,
        totalFees: Number(fees),
      };
    } catch (error) {
      logger.error(
        { err: error, projectId },
        'Error getting project withdraw stats'
      );
      throw error;
    }
  }

  /**
   * Process Xendit disbursement webhooks
   */
  async processXenditWebhook(webhookData: any): Promise<void> {
    try {
      const { external_id, status, id: disbursementId } = webhookData;

      if (!external_id || !external_id.startsWith('withdraw-')) {
        logger.warn('Invalid webhook external_id', { external_id });
        return;
      }

      const withdrawalId = external_id.replace('withdraw-', '');
      const withdrawal = await Withdraw.findByPk(withdrawalId);

      if (!withdrawal) {
        logger.warn('Withdrawal not found for webhook', {
          withdrawalId,
          external_id,
        });
        return;
      }

      if (withdrawal.xenditDisbursementId !== disbursementId) {
        logger.warn('Disbursement ID mismatch', {
          withdrawalId,
          expected: withdrawal.xenditDisbursementId,
          received: disbursementId,
        });
        return;
      }

      // Update withdrawal based on disbursement status
      let newStatus: WithdrawStatus;
      const updateData: any = {
        disbursementData: {
          ...withdrawal.disbursementData,
          ...webhookData,
        },
      };

      switch (status.toUpperCase()) {
        case 'COMPLETED':
          newStatus = WithdrawStatus.COMPLETED;
          updateData.completedAt = new Date();
          break;
        case 'FAILED':
          newStatus = WithdrawStatus.FAILED;
          updateData.adminNotes = `Disbursement failed: ${webhookData.failure_reason || 'Unknown error'}`;
          break;
        default:
          // For other statuses (PENDING, etc.), keep current status
          await withdrawal.update(updateData);
          return;
      }

      updateData.status = newStatus;
      await withdrawal.update(updateData);

      logger.info('Withdrawal updated from Xendit webhook', {
        withdrawalId,
        oldStatus: withdrawal.status,
        newStatus,
        disbursementStatus: status,
      });
    } catch (error) {
      logger.error(
        { err: error, webhookData },
        'Error processing Xendit disbursement webhook'
      );
      throw error;
    }
  }
}

export const withdrawService = new WithdrawService();
