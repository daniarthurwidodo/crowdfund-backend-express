import request from 'supertest';
import express from 'express';
import withdrawRoutes from '../routes/withdrawals';
import { authenticateToken } from '../middleware/auth';
import { withdrawService } from '../services/withdrawService';
import { Withdraw, Project } from '../models';
import { WithdrawStatus, WithdrawMethod, UserRole } from '../types';

// Mock the authentication middleware
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = {
      id: 'user123',
      email: 'fundraiser@example.com',
      username: 'fundraiser',
      role: UserRole.FUNDRAISER
    };
    next();
  }
}));

// Mock the role auth middleware
jest.mock('../middleware/roleAuth', () => ({
  requireAdmin: (req: any, res: any, next: any) => next(),
  requireFundraiserOrAdmin: (req: any, res: any, next: any) => next()
}));

// Mock the logger
jest.mock('../config/logger', () => ({
  createChildLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    fatal: jest.fn()
  })
}));

// Mock the withdraw service
jest.mock('../services/withdrawService', () => ({
  withdrawService: {
    checkWithdrawEligibility: jest.fn(),
    createWithdrawRequest: jest.fn(),
    processWithdrawApproval: jest.fn(),
    processXenditDisbursement: jest.fn(),
    cancelWithdrawal: jest.fn(),
    getProjectWithdrawStats: jest.fn(),
    processXenditWebhook: jest.fn()
  }
}));

// Mock the models
jest.mock('../models', () => ({
  Withdraw: {
    findByPk: jest.fn(),
    findAndCountAll: jest.fn()
  },
  Project: {
    findByPk: jest.fn()
  }
}));

describe('Withdraw Controller', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/withdrawals', withdrawRoutes);
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('GET /api/withdrawals/eligibility/:projectId', () => {
    it('should check withdrawal eligibility successfully', async () => {
      const mockEligibility = {
        eligible: true,
        availableAmount: 500000,
        totalRaised: 1000000,
        pendingWithdrawals: 0
      };

      (withdrawService.checkWithdrawEligibility as jest.Mock).mockResolvedValue(mockEligibility);

      const response = await request(app)
        .get('/api/withdrawals/eligibility/project123');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Eligibility check completed');
      expect(response.body.eligibility).toEqual(mockEligibility);
      expect(withdrawService.checkWithdrawEligibility).toHaveBeenCalledWith('project123', 'user123');
    });

    it('should return eligibility with reason when not eligible', async () => {
      const mockEligibility = {
        eligible: false,
        reason: 'Minimum withdrawal amount is IDR 10,000',
        availableAmount: 5000,
        totalRaised: 5000,
        pendingWithdrawals: 0
      };

      (withdrawService.checkWithdrawEligibility as jest.Mock).mockResolvedValue(mockEligibility);

      const response = await request(app)
        .get('/api/withdrawals/eligibility/project123');

      expect(response.status).toBe(200);
      expect(response.body.eligibility.eligible).toBe(false);
      expect(response.body.eligibility.reason).toContain('Minimum withdrawal');
    });
  });

  describe('POST /api/withdrawals', () => {
    const mockWithdraw = {
      id: 'withdraw123',
      userId: 'user123',
      projectId: 'project123',
      amount: 100000,
      method: WithdrawMethod.BANK_TRANSFER,
      status: WithdrawStatus.PENDING,
      toJSON: jest.fn().mockReturnValue({
        id: 'withdraw123',
        amount: 100000,
        status: WithdrawStatus.PENDING
      })
    };

    it('should create withdrawal request successfully', async () => {
      (withdrawService.createWithdrawRequest as jest.Mock).mockResolvedValue(mockWithdraw);

      const requestData = {
        projectId: 'project123',
        amount: 100000,
        method: WithdrawMethod.BANK_TRANSFER,
        reason: 'Project completion withdrawal',
        bankAccount: {
          bankName: 'Bank BCA',
          bankCode: 'BCA',
          accountNumber: '1234567890',
          accountHolderName: 'John Doe'
        }
      };

      const response = await request(app)
        .post('/api/withdrawals')
        .send(requestData);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Withdrawal request created successfully');
      expect(response.body.withdrawal.id).toBe('withdraw123');
      expect(withdrawService.createWithdrawRequest).toHaveBeenCalledWith('user123', requestData);
    });

    it('should return 400 for validation errors', async () => {
      const invalidData = {
        projectId: 'short', // Too short
        amount: 100, // Below minimum
        method: 'INVALID_METHOD'
      };

      const response = await request(app)
        .post('/api/withdrawals')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('length must be 26 characters long');
    });

    it('should require bank account for bank transfer methods', async () => {
      const dataWithoutBankAccount = {
        projectId: 'project123456789012345678',
        amount: 100000,
        method: WithdrawMethod.BANK_TRANSFER
      };

      const response = await request(app)
        .post('/api/withdrawals')
        .send(dataWithoutBankAccount);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('required');
    });

    it('should handle service errors gracefully', async () => {
      (withdrawService.createWithdrawRequest as jest.Mock).mockRejectedValue(
        new Error('Insufficient funds. Available: IDR 50,000')
      );

      const requestData = {
        projectId: 'project123456789012345678',
        amount: 100000,
        method: WithdrawMethod.BANK_TRANSFER,
        bankAccount: {
          bankName: 'Bank BCA',
          bankCode: 'BCA',
          accountNumber: '1234567890',
          accountHolderName: 'John Doe'
        }
      };

      const response = await request(app)
        .post('/api/withdrawals')
        .send(requestData);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Insufficient funds');
    });
  });

  describe('GET /api/withdrawals/my', () => {
    const mockWithdrawals = [
      {
        id: 'withdraw1',
        amount: 100000,
        status: WithdrawStatus.PENDING,
        method: WithdrawMethod.BANK_TRANSFER,
        project: { id: 'project1', title: 'Project 1' },
        toJSON: () => ({ id: 'withdraw1', amount: 100000 })
      },
      {
        id: 'withdraw2',
        amount: 200000,
        status: WithdrawStatus.COMPLETED,
        method: WithdrawMethod.XENDIT_DISBURSEMENT,
        project: { id: 'project2', title: 'Project 2' },
        toJSON: () => ({ id: 'withdraw2', amount: 200000 })
      }
    ];

    beforeEach(() => {
      (Withdraw.findAndCountAll as jest.Mock).mockResolvedValue({
        count: 2,
        rows: mockWithdrawals
      });
    });

    it('should get user withdrawals with pagination', async () => {
      const response = await request(app)
        .get('/api/withdrawals/my?page=1&limit=10');

      expect(response.status).toBe(200);
      expect(response.body.withdrawals).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        currentPage: 1,
        totalItems: 2,
        hasNext: false,
        hasPrev: false
      });
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/withdrawals/my?status=PENDING');

      expect(response.status).toBe(200);
      expect(Withdraw.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user123',
            status: 'PENDING'
          })
        })
      );
    });

    it('should filter by project ID', async () => {
      const response = await request(app)
        .get('/api/withdrawals/my?projectId=project123');

      expect(response.status).toBe(200);
      expect(Withdraw.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user123',
            projectId: 'project123'
          })
        })
      );
    });
  });

  describe('GET /api/withdrawals/:id', () => {
    const mockWithdraw = {
      id: 'withdraw123',
      userId: 'user123',
      amount: 100000,
      status: WithdrawStatus.PENDING,
      project: { id: 'project123', title: 'Test Project' },
      user: { id: 'user123', username: 'testuser' },
      toJSON: () => ({ id: 'withdraw123', amount: 100000 })
    };

    it('should get withdrawal by ID successfully', async () => {
      (Withdraw.findByPk as jest.Mock).mockResolvedValue(mockWithdraw);

      const response = await request(app)
        .get('/api/withdrawals/withdraw123');

      expect(response.status).toBe(200);
      expect(response.body.withdrawal.id).toBe('withdraw123');
    });

    it('should return 404 for non-existent withdrawal', async () => {
      (Withdraw.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/withdrawals/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Withdrawal not found');
    });

    it('should return 403 for unauthorized access', async () => {
      const unauthorizedWithdraw = { ...mockWithdraw, userId: 'other-user' };
      (Withdraw.findByPk as jest.Mock).mockResolvedValue(unauthorizedWithdraw);

      // Mock non-admin user
      jest.mocked(authenticateToken).mockImplementationOnce((req: any, res: any, next: any) => {
        req.user = { id: 'user123', role: UserRole.USER };
        next();
      });

      const response = await request(app)
        .get('/api/withdrawals/withdraw123');

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not authorized to view this withdrawal');
    });
  });

  describe('POST /api/withdrawals/:id/cancel', () => {
    const mockWithdraw = {
      id: 'withdraw123',
      status: WithdrawStatus.CANCELLED,
      toJSON: () => ({ id: 'withdraw123', status: WithdrawStatus.CANCELLED })
    };

    it('should cancel withdrawal successfully', async () => {
      (withdrawService.cancelWithdrawal as jest.Mock).mockResolvedValue(mockWithdraw);

      const response = await request(app)
        .post('/api/withdrawals/withdraw123/cancel');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Withdrawal cancelled successfully');
      expect(response.body.withdrawal.status).toBe(WithdrawStatus.CANCELLED);
      expect(withdrawService.cancelWithdrawal).toHaveBeenCalledWith('withdraw123', 'user123', false);
    });

    it('should handle cancellation errors', async () => {
      (withdrawService.cancelWithdrawal as jest.Mock).mockRejectedValue(
        new Error('Cannot cancel withdrawal in COMPLETED status')
      );

      const response = await request(app)
        .post('/api/withdrawals/withdraw123/cancel');

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Cannot cancel');
    });
  });

  describe('GET /api/withdrawals/project/:projectId/stats', () => {
    const mockStats = {
      totalRequested: 500000,
      totalCompleted: 300000,
      totalPending: 100000,
      availableAmount: 100000,
      totalFees: 15000
    };

    const mockProject = {
      id: 'project123',
      fundraiserId: 'user123'
    };

    beforeEach(() => {
      (Project.findByPk as jest.Mock).mockResolvedValue(mockProject);
      (withdrawService.getProjectWithdrawStats as jest.Mock).mockResolvedValue(mockStats);
    });

    it('should get project withdrawal stats successfully', async () => {
      const response = await request(app)
        .get('/api/withdrawals/project/project123/stats');

      expect(response.status).toBe(200);
      expect(response.body.stats).toEqual(mockStats);
      expect(response.body.projectId).toBe('project123');
    });

    it('should return 404 for non-existent project', async () => {
      (Project.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/withdrawals/project/nonexistent/stats');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Project not found');
    });

    it('should return 403 for unauthorized project access', async () => {
      const unauthorizedProject = { ...mockProject, fundraiserId: 'other-user' };
      (Project.findByPk as jest.Mock).mockResolvedValue(unauthorizedProject);

      // Mock non-admin user
      jest.mocked(authenticateToken).mockImplementationOnce((req: any, res: any, next: any) => {
        req.user = { id: 'user123', role: UserRole.USER };
        next();
      });

      const response = await request(app)
        .get('/api/withdrawals/project/project123/stats');

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Not authorized');
    });
  });

  describe('Admin Endpoints', () => {
    beforeEach(() => {
      // Mock admin user for admin endpoints
      jest.mocked(authenticateToken).mockImplementation((req: any, res: any, next: any) => {
        req.user = {
          id: 'admin123',
          email: 'admin@example.com',
          username: 'admin',
          role: UserRole.ADMIN
        };
        next();
      });
    });

    describe('GET /api/withdrawals/admin/pending', () => {
      const mockPendingWithdrawals = [
        {
          id: 'withdraw1',
          status: WithdrawStatus.PENDING,
          method: WithdrawMethod.BANK_TRANSFER,
          user: { id: 'user1', email: 'user1@example.com' },
          project: { id: 'project1', title: 'Project 1' },
          toJSON: () => ({ id: 'withdraw1', status: WithdrawStatus.PENDING })
        }
      ];

      beforeEach(() => {
        (Withdraw.findAndCountAll as jest.Mock).mockResolvedValue({
          count: 1,
          rows: mockPendingWithdrawals
        });
      });

      it('should get pending withdrawals for admin', async () => {
        const response = await request(app)
          .get('/api/withdrawals/admin/pending');

        expect(response.status).toBe(200);
        expect(response.body.withdrawals).toHaveLength(1);
        expect(Withdraw.findAndCountAll).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { status: WithdrawStatus.PENDING }
          })
        );
      });

      it('should filter by method', async () => {
        const response = await request(app)
          .get('/api/withdrawals/admin/pending?method=BANK_TRANSFER');

        expect(response.status).toBe(200);
        expect(Withdraw.findAndCountAll).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              status: WithdrawStatus.PENDING,
              method: WithdrawMethod.BANK_TRANSFER
            }
          })
        );
      });
    });

    describe('POST /api/withdrawals/:id/approve', () => {
      const mockApprovedWithdraw = {
        id: 'withdraw123',
        status: WithdrawStatus.APPROVED,
        toJSON: () => ({ id: 'withdraw123', status: WithdrawStatus.APPROVED })
      };

      it('should approve withdrawal successfully', async () => {
        (withdrawService.processWithdrawApproval as jest.Mock).mockResolvedValue(mockApprovedWithdraw);

        const approvalData = {
          approved: true,
          adminNotes: 'Approved after review',
          processingMethod: WithdrawMethod.XENDIT_DISBURSEMENT
        };

        const response = await request(app)
          .post('/api/withdrawals/withdraw123/approve')
          .send(approvalData);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Withdrawal approved successfully');
        expect(response.body.withdrawal.status).toBe(WithdrawStatus.APPROVED);
        expect(withdrawService.processWithdrawApproval).toHaveBeenCalledWith('admin123', {
          withdrawId: 'withdraw123',
          ...approvalData
        });
      });

      it('should reject withdrawal successfully', async () => {
        const rejectedWithdraw = {
          id: 'withdraw123',
          status: WithdrawStatus.REJECTED,
          toJSON: () => ({ id: 'withdraw123', status: WithdrawStatus.REJECTED })
        };

        (withdrawService.processWithdrawApproval as jest.Mock).mockResolvedValue(rejectedWithdraw);

        const rejectionData = {
          approved: false,
          adminNotes: 'Insufficient documentation'
        };

        const response = await request(app)
          .post('/api/withdrawals/withdraw123/approve')
          .send(rejectionData);

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Withdrawal rejected successfully');
        expect(response.body.withdrawal.status).toBe(WithdrawStatus.REJECTED);
      });

      it('should return 400 for validation errors', async () => {
        const invalidData = {
          approved: 'not-boolean', // Invalid type
          processingMethod: 'INVALID_METHOD'
        };

        const response = await request(app)
          .post('/api/withdrawals/withdraw123/approve')
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('must be a boolean');
      });
    });

    describe('POST /api/withdrawals/:id/process', () => {
      const mockProcessedWithdraw = {
        id: 'withdraw123',
        status: WithdrawStatus.PROCESSING,
        xenditDisbursementId: 'disb_123456',
        toJSON: () => ({ 
          id: 'withdraw123', 
          status: WithdrawStatus.PROCESSING,
          xenditDisbursementId: 'disb_123456'
        })
      };

      it('should process withdrawal successfully', async () => {
        (withdrawService.processXenditDisbursement as jest.Mock).mockResolvedValue(mockProcessedWithdraw);

        const response = await request(app)
          .post('/api/withdrawals/withdraw123/process');

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Withdrawal processing started successfully');
        expect(response.body.withdrawal.status).toBe(WithdrawStatus.PROCESSING);
        expect(withdrawService.processXenditDisbursement).toHaveBeenCalledWith('withdraw123', 'admin123');
      });

      it('should handle processing errors', async () => {
        (withdrawService.processXenditDisbursement as jest.Mock).mockRejectedValue(
          new Error('Bank account details are required for Xendit disbursement')
        );

        const response = await request(app)
          .post('/api/withdrawals/withdraw123/process');

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('required');
      });
    });
  });

  describe('POST /api/withdrawals/webhook/xendit', () => {
    it('should process Xendit webhook successfully', async () => {
      const webhookData = {
        id: 'disb_123456',
        external_id: 'withdraw-withdraw123',
        status: 'COMPLETED',
        amount: 100000
      };

      (withdrawService.processXenditWebhook as jest.Mock).mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/withdrawals/webhook/xendit')
        .send(webhookData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Webhook processed successfully');
      expect(withdrawService.processXenditWebhook).toHaveBeenCalledWith(webhookData);
    });

    it('should handle webhook processing errors', async () => {
      (withdrawService.processXenditWebhook as jest.Mock).mockRejectedValue(
        new Error('Invalid webhook data')
      );

      const response = await request(app)
        .post('/api/withdrawals/webhook/xendit')
        .send({ invalid: 'data' });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Internal error processing webhook');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (Withdraw.findAndCountAll as jest.Mock).mockRejectedValue(new Error('Database connection error'));

      const response = await request(app)
        .get('/api/withdrawals/my');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Internal server error');
    });

    it('should handle service errors gracefully', async () => {
      (withdrawService.checkWithdrawEligibility as jest.Mock).mockRejectedValue(
        new Error('Service unavailable')
      );

      const response = await request(app)
        .get('/api/withdrawals/eligibility/project123');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Internal server error');
    });
  });
});