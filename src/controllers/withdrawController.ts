import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Joi from 'joi';
import { withdrawService } from '../services/withdrawService';
import { Withdraw } from '../models';
import { WithdrawStatus, WithdrawMethod, UserRole } from '../types';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger('WithdrawController');

// Validation schemas
const withdrawRequestSchema = Joi.object({
  projectId: Joi.string().length(26).required(),
  amount: Joi.number().integer().min(10000).max(100000000000).required(),
  method: Joi.string().valid(...Object.values(WithdrawMethod)).required(),
  reason: Joi.string().max(500).optional(),
  bankAccount: Joi.when('method', {
    is: Joi.valid(WithdrawMethod.BANK_TRANSFER, WithdrawMethod.XENDIT_DISBURSEMENT),
    then: Joi.object({
      bankName: Joi.string().max(100).required(),
      bankCode: Joi.string().max(10).required(),
      accountNumber: Joi.string().max(50).required(),
      accountHolderName: Joi.string().max(100).required()
    }).required(),
    otherwise: Joi.optional()
  })
});

const approvalSchema = Joi.object({
  approved: Joi.boolean().required(),
  adminNotes: Joi.string().max(1000).optional(),
  processingMethod: Joi.string().valid(...Object.values(WithdrawMethod)).optional()
});

/**
 * @swagger
 * /api/withdrawals/eligibility/{projectId}:
 *   get:
 *     summary: Check withdrawal eligibility
 *     description: Check if a project is eligible for withdrawal and get available amount
 *     tags: [Withdrawals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Eligibility check completed
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Project not found
 */
export const checkEligibility = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const eligibility = await withdrawService.checkWithdrawEligibility(projectId, req.user.id);

    res.json({
      message: 'Eligibility check completed',
      eligibility
    });
  } catch (error: any) {
    logger.error({ err: error, projectId: req.params.projectId, userId: req.user?.id }, 'Error checking withdrawal eligibility');
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * @swagger
 * /api/withdrawals:
 *   post:
 *     summary: Create withdrawal request
 *     description: Create a new withdrawal request for project funds
 *     tags: [Withdrawals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - amount
 *               - method
 *             properties:
 *               projectId:
 *                 type: string
 *                 description: Project ID
 *               amount:
 *                 type: integer
 *                 minimum: 10000
 *                 description: Withdrawal amount in smallest currency unit
 *               method:
 *                 type: string
 *                 enum: [BANK_TRANSFER, XENDIT_DISBURSEMENT, MANUAL]
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *                 description: Reason for withdrawal
 *               bankAccount:
 *                 type: object
 *                 properties:
 *                   bankName:
 *                     type: string
 *                   bankCode:
 *                     type: string
 *                   accountNumber:
 *                     type: string
 *                   accountHolderName:
 *                     type: string
 *     responses:
 *       201:
 *         description: Withdrawal request created successfully
 *       400:
 *         description: Invalid request data
 *       403:
 *         description: Not authorized or insufficient funds
 */
export const createWithdraw = async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = withdrawRequestSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.details[0].message });
      return;
    }

    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const withdrawal = await withdrawService.createWithdrawRequest(req.user.id, value);

    res.status(201).json({
      message: 'Withdrawal request created successfully',
      withdrawal: withdrawal.toJSON()
    });

    logger.info('Withdrawal request created', {
      withdrawalId: withdrawal.id,
      userId: req.user.id,
      projectId: value.projectId,
      amount: value.amount,
      method: value.method
    });
  } catch (error: any) {
    logger.error({ err: error, userId: req.user?.id, body: req.body }, 'Error creating withdrawal request');
    
    if (error.message.includes('not eligible') || error.message.includes('Insufficient funds')) {
      res.status(400).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};

/**
 * @swagger
 * /api/withdrawals/my:
 *   get:
 *     summary: Get user's withdrawal requests
 *     description: Get paginated list of user's withdrawal requests
 *     tags: [Withdrawals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PROCESSING, APPROVED, REJECTED, COMPLETED, FAILED, CANCELLED]
 *         description: Filter by status
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Filter by project ID
 *     responses:
 *       200:
 *         description: Withdrawal requests retrieved successfully
 */
export const getMyWithdrawals = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;

    const { status, projectId } = req.query;

    const whereClause: any = { userId: req.user.id };

    if (status) {
      whereClause.status = status;
    }

    if (projectId) {
      whereClause.projectId = projectId;
    }

    const { count, rows: withdrawals } = await Withdraw.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: require('../models').Project,
          as: 'project',
          attributes: ['id', 'title', 'status']
        }
      ],
      order: [['requestedAt', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      withdrawals: withdrawals.map(w => w.toJSON()),
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: count,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error: any) {
    logger.error({ err: error, userId: req.user?.id }, 'Error fetching user withdrawals');
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * @swagger
 * /api/withdrawals/{id}:
 *   get:
 *     summary: Get withdrawal details
 *     description: Get detailed information about a specific withdrawal
 *     tags: [Withdrawals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Withdrawal ID
 *     responses:
 *       200:
 *         description: Withdrawal details retrieved successfully
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Withdrawal not found
 */
export const getWithdrawById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const withdrawal = await Withdraw.findByPk(id, {
      include: [
        {
          model: require('../models').Project,
          as: 'project',
          attributes: ['id', 'title', 'status']
        },
        {
          model: require('../models').User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName']
        },
        {
          model: require('../models').User,
          as: 'approver',
          attributes: ['id', 'username', 'firstName', 'lastName'],
          required: false
        }
      ]
    });

    if (!withdrawal) {
      res.status(404).json({ message: 'Withdrawal not found' });
      return;
    }

    // Check authorization
    const isAdmin = req.user.role === UserRole.ADMIN;
    const isOwner = withdrawal.userId === req.user.id;

    if (!isAdmin && !isOwner) {
      res.status(403).json({ message: 'Not authorized to view this withdrawal' });
      return;
    }

    res.json({
      withdrawal: withdrawal.toJSON()
    });
  } catch (error: any) {
    logger.error({ err: error, withdrawalId: req.params.id, userId: req.user?.id }, 'Error fetching withdrawal');
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * @swagger
 * /api/withdrawals/{id}/cancel:
 *   post:
 *     summary: Cancel withdrawal request
 *     description: Cancel a pending withdrawal request
 *     tags: [Withdrawals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Withdrawal ID
 *     responses:
 *       200:
 *         description: Withdrawal cancelled successfully
 *       400:
 *         description: Cannot cancel withdrawal
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Withdrawal not found
 */
export const cancelWithdraw = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const isAdmin = req.user.role === UserRole.ADMIN;
    const withdrawal = await withdrawService.cancelWithdrawal(id, req.user.id, isAdmin);

    res.json({
      message: 'Withdrawal cancelled successfully',
      withdrawal: withdrawal.toJSON()
    });

    logger.info('Withdrawal cancelled', {
      withdrawalId: id,
      cancelledBy: req.user.id,
      isAdmin
    });
  } catch (error: any) {
    logger.error({ err: error, withdrawalId: req.params.id, userId: req.user?.id }, 'Error cancelling withdrawal');
    
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('not authorized')) {
      res.status(403).json({ message: error.message });
    } else if (error.message.includes('Cannot cancel')) {
      res.status(400).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};

/**
 * @swagger
 * /api/withdrawals/project/{projectId}/stats:
 *   get:
 *     summary: Get project withdrawal statistics
 *     description: Get withdrawal statistics for a specific project
 *     tags: [Withdrawals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Withdrawal statistics retrieved successfully
 *       403:
 *         description: Not authorized
 */
export const getProjectStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    // Check if user owns the project or is admin
    const project = await require('../models').Project.findByPk(projectId);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    const isAdmin = req.user.role === UserRole.ADMIN;
    const isOwner = project.fundraiserId === req.user.id;

    if (!isAdmin && !isOwner) {
      res.status(403).json({ message: 'Not authorized to view project withdrawal statistics' });
      return;
    }

    const stats = await withdrawService.getProjectWithdrawStats(projectId);

    res.json({
      message: 'Project withdrawal statistics retrieved successfully',
      projectId,
      stats
    });
  } catch (error: any) {
    logger.error({ err: error, projectId: req.params.projectId, userId: req.user?.id }, 'Error fetching project withdrawal stats');
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Admin endpoints

/**
 * @swagger
 * /api/withdrawals/admin/pending:
 *   get:
 *     summary: Get pending withdrawals (Admin)
 *     description: Get paginated list of pending withdrawal requests for admin review
 *     tags: [Withdrawals - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Items per page
 *       - in: query
 *         name: method
 *         schema:
 *           type: string
 *           enum: [BANK_TRANSFER, XENDIT_DISBURSEMENT, MANUAL]
 *         description: Filter by method
 *     responses:
 *       200:
 *         description: Pending withdrawals retrieved successfully
 *       403:
 *         description: Admin access required
 */
export const getPendingWithdrawals = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;

    const { method } = req.query;

    const whereClause: any = {
      status: WithdrawStatus.PENDING
    };

    if (method) {
      whereClause.method = method;
    }

    const { count, rows: withdrawals } = await Withdraw.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: require('../models').Project,
          as: 'project',
          attributes: ['id', 'title', 'status']
        },
        {
          model: require('../models').User,
          as: 'user',
          attributes: ['id', 'username', 'firstName', 'lastName', 'email']
        }
      ],
      order: [['requestedAt', 'ASC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      withdrawals: withdrawals.map(w => w.toJSON()),
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: count,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error: any) {
    logger.error({ err: error, userId: req.user?.id }, 'Error fetching pending withdrawals');
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * @swagger
 * /api/withdrawals/{id}/approve:
 *   post:
 *     summary: Approve or reject withdrawal (Admin)
 *     description: Approve or reject a withdrawal request
 *     tags: [Withdrawals - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Withdrawal ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - approved
 *             properties:
 *               approved:
 *                 type: boolean
 *               adminNotes:
 *                 type: string
 *                 maxLength: 1000
 *               processingMethod:
 *                 type: string
 *                 enum: [BANK_TRANSFER, XENDIT_DISBURSEMENT, MANUAL]
 *     responses:
 *       200:
 *         description: Withdrawal approval processed successfully
 *       400:
 *         description: Invalid request or cannot process withdrawal
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Withdrawal not found
 */
export const approveWithdraw = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { error, value } = approvalSchema.validate(req.body);
    
    if (error) {
      res.status(400).json({ message: error.details[0].message });
      return;
    }

    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const approval = {
      withdrawId: id,
      ...value
    };

    const withdrawal = await withdrawService.processWithdrawApproval(req.user.id, approval);

    res.json({
      message: `Withdrawal ${value.approved ? 'approved' : 'rejected'} successfully`,
      withdrawal: withdrawal.toJSON()
    });

    logger.info('Withdrawal approval processed', {
      withdrawalId: id,
      approved: value.approved,
      adminId: req.user.id
    });
  } catch (error: any) {
    logger.error({ err: error, withdrawalId: req.params.id, userId: req.user?.id }, 'Error processing withdrawal approval');
    
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Cannot approve') || error.message.includes('Cannot process')) {
      res.status(400).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};

/**
 * @swagger
 * /api/withdrawals/{id}/process:
 *   post:
 *     summary: Process approved withdrawal (Admin)
 *     description: Process an approved withdrawal via Xendit disbursement
 *     tags: [Withdrawals - Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Withdrawal ID
 *     responses:
 *       200:
 *         description: Withdrawal processing started successfully
 *       400:
 *         description: Cannot process withdrawal
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Withdrawal not found
 */
export const processWithdraw = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const withdrawal = await withdrawService.processXenditDisbursement(id, req.user.id);

    res.json({
      message: 'Withdrawal processing started successfully',
      withdrawal: withdrawal.toJSON()
    });

    logger.info('Withdrawal processing started', {
      withdrawalId: id,
      processedBy: req.user.id,
      disbursementId: withdrawal.xenditDisbursementId
    });
  } catch (error: any) {
    logger.error({ err: error, withdrawalId: req.params.id, userId: req.user?.id }, 'Error processing withdrawal');
    
    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
    } else if (error.message.includes('Cannot process') || error.message.includes('required')) {
      res.status(400).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};

/**
 * @swagger
 * /api/withdrawals/webhook/xendit:
 *   post:
 *     summary: Xendit disbursement webhook
 *     description: Handle Xendit disbursement status updates
 *     tags: [Withdrawals - Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook data
 */
export const handleXenditWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    await withdrawService.processXenditWebhook(req.body);
    
    res.status(200).json({ message: 'Webhook processed successfully' });
    
    logger.info('Xendit disbursement webhook processed', {
      external_id: req.body.external_id,
      status: req.body.status
    });
  } catch (error: any) {
    logger.error({ err: error, webhookData: req.body }, 'Error processing Xendit disbursement webhook');
    res.status(500).json({ message: 'Internal error processing webhook' });
  }
};