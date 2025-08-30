import request from 'supertest';
import express from 'express';
import paymentRoutes from '../routes/payments';
import { authenticateToken } from '../middleware/auth';
import { paymentService } from '../services/paymentService';
import { Payment, Donation } from '../models';
import { PaymentStatus, PaymentMethod, UserRole } from '../types';

// Mock the authentication middleware
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = {
      id: 'user123',
      email: 'test@example.com',
      role: UserRole.USER
    };
    next();
  }
}));

// Mock the role auth middleware
jest.mock('../middleware/roleAuth', () => ({
  requireAdmin: (req: any, res: any, next: any) => next()
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

// Mock the payment service
jest.mock('../services/paymentService', () => ({
  paymentService: {
    createInvoice: jest.fn(),
    createVirtualAccount: jest.fn(),
    createEwallet: jest.fn(),
    getPaymentStatus: jest.fn(),
    cancelPayment: jest.fn(),
    processWebhook: jest.fn()
  }
}));

// Mock the Xendit config
jest.mock('../config/xendit', () => ({
  xendit: {},
  XENDIT_CONFIG: {
    secretKey: 'test_secret',
    callbackUrl: 'http://localhost:3000/api/payments/webhook',
    webhookToken: 'test_token',
    defaultCurrency: 'IDR',
    defaultInvoiceDuration: 86400,
    defaultExpiryHours: 24,
    isProduction: false
  },
  SUPPORTED_VA_BANKS: {
    BCA: 'BCA',
    BNI: 'BNI',
    BRI: 'BRI'
  },
  SUPPORTED_EWALLETS: {
    DANA: 'DANA',
    OVO: 'OVO'
  }
}));

// Mock the models
jest.mock('../models', () => ({
  Payment: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAndCountAll: jest.fn()
  },
  Donation: {
    findByPk: jest.fn(),
    findAll: jest.fn()
  }
}));

describe('Payment Controller', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/payments', paymentRoutes);
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('POST /api/payments/invoice', () => {
    const mockDonation = {
      id: 'donation123456789012345678',
      amount: 100000,
      paymentStatus: PaymentStatus.PENDING,
      userId: 'user123',
      projectId: 'project123',
      update: jest.fn().mockResolvedValue(true)
    };

    const mockPayment = {
      id: 'payment123',
      donationId: 'donation123456789012345678',
      method: PaymentMethod.INVOICE,
      status: PaymentStatus.PENDING,
      paymentUrl: 'https://checkout.xendit.co/web/123456',
      toJSON: jest.fn().mockReturnValue({
        id: 'payment123',
        method: PaymentMethod.INVOICE,
        status: PaymentStatus.PENDING
      })
    };

    beforeEach(() => {
      (Donation.findByPk as jest.Mock).mockResolvedValue(mockDonation);
      (Payment.findOne as jest.Mock).mockResolvedValue(null);
      (paymentService.createInvoice as jest.Mock).mockResolvedValue(mockPayment);
    });

    it('should create invoice payment successfully', async () => {
      const requestBody = {
        donationId: 'donation123456789012345678', // 26 characters for ULID
        description: 'Test donation payment',
        payerEmail: 'test@example.com',
        paymentMethods: ['BANK_TRANSFER', 'CREDIT_CARD']
      };

      const response = await request(app)
        .post('/api/payments/invoice')
        .send(requestBody);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        message: 'Invoice payment created successfully',
        payment: {
          id: 'payment123',
          method: PaymentMethod.INVOICE,
          status: PaymentStatus.PENDING
        }
      });

      expect(paymentService.createInvoice).toHaveBeenCalledWith('donation123456789012345678', {
        payerEmail: 'test@example.com',
        description: 'Test donation payment',
        paymentMethods: ['BANK_TRANSFER', 'CREDIT_CARD']
      });
    });

    it('should return 400 for invalid request body', async () => {
      const requestBody = {
        donationId: 'invalid', // Too short
        description: '' // Empty
      };

      const response = await request(app)
        .post('/api/payments/invoice')
        .send(requestBody);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('length must be 26 characters long');
    });

    it('should return 404 if donation not found', async () => {
      (Donation.findByPk as jest.Mock).mockResolvedValue(null);

      const requestBody = {
        donationId: 'donation123456789012345678',
        description: 'Test payment'
      };

      const response = await request(app)
        .post('/api/payments/invoice')
        .send(requestBody);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Donation not found');
    });

    it('should return 409 if payment already exists', async () => {
      const existingPayment = {
        id: 'existing123',
        status: PaymentStatus.PENDING
      };
      (Payment.findOne as jest.Mock).mockResolvedValue(existingPayment);

      const requestBody = {
        donationId: 'donation123456789012345678',
        description: 'Test payment'
      };

      const response = await request(app)
        .post('/api/payments/invoice')
        .send(requestBody);

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Payment already exists for this donation');
    });

    it('should return 403 for unauthorized donation access', async () => {
      const unauthorizedDonation = {
        ...mockDonation,
        userId: 'other-user'
      };
      (Donation.findByPk as jest.Mock).mockResolvedValue(unauthorizedDonation);

      const requestBody = {
        donationId: 'donation123456789012345678',
        description: 'Test payment'
      };

      const response = await request(app)
        .post('/api/payments/invoice')
        .send(requestBody);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not authorized to create payment for this donation');
    });
  });

  describe('POST /api/payments/virtual-account', () => {
    const mockDonation = {
      id: 'donation123',
      amount: 100000,
      userId: 'user123',
      update: jest.fn().mockResolvedValue(true)
    };

    const mockPayment = {
      id: 'payment123',
      method: PaymentMethod.VIRTUAL_ACCOUNT,
      virtualAccount: {
        bankCode: 'BCA',
        accountNumber: '8808123456'
      },
      toJSON: jest.fn().mockReturnValue({
        id: 'payment123',
        method: PaymentMethod.VIRTUAL_ACCOUNT
      })
    };

    beforeEach(() => {
      (Donation.findByPk as jest.Mock).mockResolvedValue(mockDonation);
      (Payment.findOne as jest.Mock).mockResolvedValue(null);
      (paymentService.createVirtualAccount as jest.Mock).mockResolvedValue(mockPayment);
    });

    it('should create virtual account payment successfully', async () => {
      const requestBody = {
        donationId: 'donation123456789012345678',
        bankCode: 'BCA',
        customerName: 'Test Customer'
      };

      const response = await request(app)
        .post('/api/payments/virtual-account')
        .send(requestBody);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        message: 'Virtual account payment created successfully',
        payment: {
          id: 'payment123',
          method: PaymentMethod.VIRTUAL_ACCOUNT
        }
      });
    });

    it('should return 400 for invalid bank code', async () => {
      const requestBody = {
        donationId: 'donation123456789012345678',
        bankCode: 'INVALID',
        customerName: 'Test Customer'
      };

      const response = await request(app)
        .post('/api/payments/virtual-account')
        .send(requestBody);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/payments/ewallet', () => {
    const mockDonation = {
      id: 'donation123',
      amount: 100000,
      userId: 'user123',
      update: jest.fn().mockResolvedValue(true)
    };

    const mockPayment = {
      id: 'payment123',
      method: PaymentMethod.EWALLET,
      ewalletType: 'DANA',
      toJSON: jest.fn().mockReturnValue({
        id: 'payment123',
        method: PaymentMethod.EWALLET
      })
    };

    beforeEach(() => {
      (Donation.findByPk as jest.Mock).mockResolvedValue(mockDonation);
      (Payment.findOne as jest.Mock).mockResolvedValue(null);
      (paymentService.createEwallet as jest.Mock).mockResolvedValue(mockPayment);
    });

    it('should create e-wallet payment successfully', async () => {
      const requestBody = {
        donationId: 'donation123456789012345678',
        ewalletType: 'DANA',
        phone: '08123456789'
      };

      const response = await request(app)
        .post('/api/payments/ewallet')
        .send(requestBody);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        message: 'E-wallet payment created successfully',
        payment: {
          id: 'payment123',
          method: PaymentMethod.EWALLET
        }
      });
    });

    it('should return 400 for invalid phone number', async () => {
      const requestBody = {
        donationId: 'donation123456789012345678',
        ewalletType: 'DANA',
        phone: 'invalid-phone'
      };

      const response = await request(app)
        .post('/api/payments/ewallet')
        .send(requestBody);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/payments/:id/status', () => {
    const mockPayment = {
      id: 'payment123',
      donationId: 'donation123456789012345678',
      status: PaymentStatus.PAID,
      toJSON: jest.fn().mockReturnValue({
        id: 'payment123',
        status: PaymentStatus.PAID
      })
    };

    const mockDonation = {
      id: 'donation123',
      userId: 'user123'
    };

    beforeEach(() => {
      (paymentService.getPaymentStatus as jest.Mock).mockResolvedValue(mockPayment);
      (Donation.findByPk as jest.Mock).mockResolvedValue(mockDonation);
    });

    it('should get payment status successfully', async () => {
      const response = await request(app)
        .get('/api/payments/payment123/status');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        payment: {
          id: 'payment123',
          status: PaymentStatus.PAID
        }
      });
    });

    it('should return 404 for non-existent payment', async () => {
      (paymentService.getPaymentStatus as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/payments/nonexistent/status');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Payment not found');
    });
  });

  describe('POST /api/payments/:id/cancel', () => {
    const mockPayment = {
      id: 'payment123',
      status: PaymentStatus.CANCELLED,
      toJSON: jest.fn().mockReturnValue({
        id: 'payment123',
        status: PaymentStatus.CANCELLED
      })
    };

    const mockDonation = {
      id: 'donation123',
      userId: 'user123'
    };

    beforeEach(() => {
      (Payment.findByPk as jest.Mock).mockResolvedValue({
        id: 'payment123',
        donationId: 'donation123',
        status: PaymentStatus.PENDING
      });
      (Donation.findByPk as jest.Mock).mockResolvedValue(mockDonation);
      (paymentService.cancelPayment as jest.Mock).mockResolvedValue(mockPayment);
    });

    it('should cancel payment successfully', async () => {
      const response = await request(app)
        .post('/api/payments/payment123/cancel');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        message: 'Payment cancelled successfully',
        payment: {
          id: 'payment123',
          status: PaymentStatus.CANCELLED
        }
      });
    });

    it('should return 404 for non-existent payment', async () => {
      (Payment.findByPk as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/payments/nonexistent/cancel');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Payment not found');
    });

    it('should return 400 for already paid payment', async () => {
      (Payment.findByPk as jest.Mock).mockResolvedValue({
        id: 'payment123',
        donationId: 'donation123',
        status: PaymentStatus.PAID
      });

      const response = await request(app)
        .post('/api/payments/payment123/cancel');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Cannot cancel a paid payment');
    });
  });

  describe('GET /api/payments/methods', () => {
    it('should return available payment methods', async () => {
      const response = await request(app)
        .get('/api/payments/methods');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('paymentMethods');
      expect(response.body.paymentMethods).toHaveProperty('invoice');
      expect(response.body.paymentMethods).toHaveProperty('virtualAccount');
      expect(response.body.paymentMethods).toHaveProperty('ewallet');
    });
  });

  describe('GET /api/payments/my', () => {
    const mockPayments = [
      {
        id: 'payment1',
        method: PaymentMethod.INVOICE,
        status: PaymentStatus.PAID,
        toJSON: () => ({ id: 'payment1', method: PaymentMethod.INVOICE })
      },
      {
        id: 'payment2',
        method: PaymentMethod.VIRTUAL_ACCOUNT,
        status: PaymentStatus.PENDING,
        toJSON: () => ({ id: 'payment2', method: PaymentMethod.VIRTUAL_ACCOUNT })
      }
    ];

    beforeEach(() => {
      (Donation.findAll as jest.Mock).mockResolvedValue([
        { id: 'donation1' },
        { id: 'donation2' }
      ]);
      (Payment.findAndCountAll as jest.Mock).mockResolvedValue({
        count: 2,
        rows: mockPayments
      });
    });

    it('should return user payments with pagination', async () => {
      const response = await request(app)
        .get('/api/payments/my?page=1&limit=10');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('payments');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.payments).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        currentPage: 1,
        totalItems: 2,
        hasNext: false,
        hasPrev: false
      });
    });

    it('should filter payments by status', async () => {
      const response = await request(app)
        .get('/api/payments/my?status=PAID');

      expect(response.status).toBe(200);
      expect(Payment.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PAID'
          })
        })
      );
    });
  });
});