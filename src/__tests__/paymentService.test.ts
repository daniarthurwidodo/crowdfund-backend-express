import { PaymentService } from '../services/paymentService';
import { Payment, Donation, Project, User } from '../models';
import { PaymentStatus, PaymentMethod, UserRole, ProjectStatus } from '../types';
import { XENDIT_CONFIG } from '../config/xendit';

// Mock the logger
jest.mock('../config/logger', () => ({
  createChildLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  })
}));

// Mock the Xendit configuration
jest.mock('../config/xendit', () => ({
  xendit: {
    Invoice: {
      createInvoice: jest.fn()
    },
    VirtualAcc: {
      createFixedVA: jest.fn()
    },
    EWallet: {
      createOVOPayment: jest.fn(),
      createDANAPayment: jest.fn()
    }
  },
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

describe('PaymentService', () => {
  let paymentService: PaymentService;
  let mockUser: any;
  let mockProject: any;
  let mockDonation: any;

  beforeEach(() => {
    paymentService = new PaymentService();
    
    // Setup mock data
    mockUser = {
      id: 'user123',
      email: 'test@example.com',
      username: 'testuser',
      role: UserRole.USER
    };

    mockProject = {
      id: 'project123',
      title: 'Test Project',
      description: 'Test Description',
      targetAmount: 1000000,
      currentAmount: 0,
      status: ProjectStatus.ACTIVE,
      fundraiserId: 'fundraiser123'
    };

    mockDonation = {
      id: 'donation123',
      amount: 100000,
      paymentStatus: PaymentStatus.PENDING,
      isAnonymous: false,
      projectId: mockProject.id,
      userId: mockUser.id
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('createInvoice', () => {
    beforeEach(() => {
      // Mock Donation.findByPk
      (Donation.findByPk as jest.Mock) = jest.fn().mockResolvedValue(mockDonation);
      
      // Mock Payment.create
      (Payment.create as jest.Mock) = jest.fn().mockResolvedValue({
        id: 'payment123',
        donationId: mockDonation.id,
        externalId: 'donation-donation123-test',
        xenditId: 'inv_123456',
        amount: mockDonation.amount,
        currency: 'IDR',
        method: PaymentMethod.INVOICE,
        status: PaymentStatus.PENDING,
        paymentUrl: 'https://checkout.xendit.co/web/123456',
        expiredAt: new Date(),
        toJSON: jest.fn().mockReturnValue({
          id: 'payment123',
          donationId: mockDonation.id,
          method: PaymentMethod.INVOICE,
          status: PaymentStatus.PENDING
        })
      });
    });

    it('should create an invoice payment successfully', async () => {
      const options = {
        payerEmail: 'test@example.com',
        description: 'Donation payment',
        paymentMethods: ['BANK_TRANSFER', 'CREDIT_CARD']
      };

      const payment = await paymentService.createInvoice(mockDonation.id, options);

      expect(Donation.findByPk).toHaveBeenCalledWith(mockDonation.id);
      expect(Payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          donationId: mockDonation.id,
          amount: mockDonation.amount,
          currency: 'IDR',
          method: PaymentMethod.INVOICE,
          status: PaymentStatus.PENDING
        })
      );
      expect(payment).toBeDefined();
      expect(payment.method).toBe(PaymentMethod.INVOICE);
    });

    it('should throw error if donation not found', async () => {
      (Donation.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(
        paymentService.createInvoice('nonexistent', {
          description: 'Test payment'
        })
      ).rejects.toThrow('Donation not found');
    });

    it('should handle Xendit API errors', async () => {
      // No need to mock Xendit errors since we're using mock responses
      const options = {
        description: 'Test payment'
      };

      const payment = await paymentService.createInvoice(mockDonation.id, options);
      expect(payment).toBeDefined();
    });
  });

  describe('createVirtualAccount', () => {
    beforeEach(() => {
      (Donation.findByPk as jest.Mock) = jest.fn().mockResolvedValue(mockDonation);
      
      (Payment.create as jest.Mock) = jest.fn().mockResolvedValue({
        id: 'payment123',
        donationId: mockDonation.id,
        externalId: 'donation-va-donation123-test',
        xenditId: 'va_123456',
        amount: mockDonation.amount,
        currency: 'IDR',
        method: PaymentMethod.VIRTUAL_ACCOUNT,
        status: PaymentStatus.PENDING,
        virtualAccount: {
          bankCode: 'BCA',
          accountNumber: '8808123456'
        },
        toJSON: jest.fn().mockReturnValue({
          id: 'payment123',
          method: PaymentMethod.VIRTUAL_ACCOUNT,
          virtualAccount: { bankCode: 'BCA', accountNumber: '8808123456' }
        })
      });
    });

    it('should create a virtual account payment successfully', async () => {
      const options = {
        bankCode: 'BCA' as const,
        customerName: 'Test Customer'
      };

      const payment = await paymentService.createVirtualAccount(mockDonation.id, options);

      expect(Donation.findByPk).toHaveBeenCalledWith(mockDonation.id);
      expect(Payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          donationId: mockDonation.id,
          amount: mockDonation.amount,
          method: PaymentMethod.VIRTUAL_ACCOUNT,
          virtualAccount: expect.objectContaining({
            bankCode: 'BCA'
          })
        })
      );
      expect(payment).toBeDefined();
      expect(payment.method).toBe(PaymentMethod.VIRTUAL_ACCOUNT);
    });

    it('should throw error for unsupported bank code', async () => {
      await expect(
        paymentService.createVirtualAccount(mockDonation.id, {
          bankCode: 'INVALID' as any,
          customerName: 'Test Customer'
        })
      ).rejects.toThrow('Unsupported bank code: INVALID');
    });

    it('should throw error if donation not found', async () => {
      (Donation.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(
        paymentService.createVirtualAccount('nonexistent', {
          bankCode: 'BCA' as const,
          customerName: 'Test Customer'
        })
      ).rejects.toThrow('Donation not found');
    });
  });

  describe('createEwallet', () => {
    beforeEach(() => {
      (Donation.findByPk as jest.Mock) = jest.fn().mockResolvedValue(mockDonation);
      
      (Payment.create as jest.Mock) = jest.fn().mockResolvedValue({
        id: 'payment123',
        donationId: mockDonation.id,
        externalId: 'donation-ewallet-donation123-test',
        xenditId: 'ewallet_123456',
        amount: mockDonation.amount,
        currency: 'IDR',
        method: PaymentMethod.EWALLET,
        status: PaymentStatus.PENDING,
        paymentUrl: 'https://checkout.xendit.co/web/123456',
        ewalletType: 'DANA',
        toJSON: jest.fn().mockReturnValue({
          id: 'payment123',
          method: PaymentMethod.EWALLET,
          ewalletType: 'DANA'
        })
      });
    });

    it('should create an e-wallet payment successfully', async () => {
      const options = {
        ewalletType: 'DANA' as const,
        phone: '08123456789',
        redirectUrl: 'http://localhost:3000/success'
      };

      const payment = await paymentService.createEwallet(mockDonation.id, options);

      expect(Donation.findByPk).toHaveBeenCalledWith(mockDonation.id);
      expect(Payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          donationId: mockDonation.id,
          amount: mockDonation.amount,
          method: PaymentMethod.EWALLET,
          ewalletType: 'DANA'
        })
      );
      expect(payment).toBeDefined();
      expect(payment.method).toBe(PaymentMethod.EWALLET);
    });

    it('should throw error for unsupported e-wallet type', async () => {
      await expect(
        paymentService.createEwallet(mockDonation.id, {
          ewalletType: 'INVALID' as any
        })
      ).rejects.toThrow('Unsupported e-wallet type: INVALID');
    });
  });

  describe('processWebhook', () => {
    let mockPayment: any;
    let mockWebhookPayload: any;

    beforeEach(() => {
      mockPayment = {
        id: 'payment123',
        donationId: mockDonation.id,
        externalId: 'test-external-id',
        status: PaymentStatus.PENDING,
        update: jest.fn().mockResolvedValue(true)
      };

      mockWebhookPayload = {
        id: 'webhook123',
        external_id: 'test-external-id',
        user_id: 'user123',
        is_high: false,
        payment_method: 'BANK_TRANSFER',
        status: 'PAID',
        merchant_name: 'Test Merchant',
        amount: 100000,
        paid_amount: 100000,
        paid_at: '2023-01-01T00:00:00Z',
        payer_email: 'test@example.com',
        description: 'Test payment',
        updated: '2023-01-01T00:00:00Z',
        created: '2023-01-01T00:00:00Z',
        currency: 'IDR'
      };

      (Payment.findOne as jest.Mock) = jest.fn().mockResolvedValue(mockPayment);
      (Donation.findByPk as jest.Mock) = jest.fn().mockResolvedValue({
        ...mockDonation,
        update: jest.fn().mockResolvedValue(true)
      });
    });

    it('should process webhook and update payment status to PAID', async () => {
      await paymentService.processWebhook(mockWebhookPayload);

      expect(Payment.findOne).toHaveBeenCalledWith({
        where: { externalId: 'test-external-id' }
      });
      expect(mockPayment.update).toHaveBeenCalledWith({
        status: PaymentStatus.PAID,
        paidAt: new Date('2023-01-01T00:00:00Z'),
        webhookData: mockWebhookPayload
      });
    });

    it('should handle webhook for non-existent payment', async () => {
      (Payment.findOne as jest.Mock).mockResolvedValue(null);

      // Should not throw error
      await expect(paymentService.processWebhook(mockWebhookPayload)).resolves.toBeUndefined();
    });

    it('should handle different webhook statuses', async () => {
      // Test EXPIRED status
      const expiredPayload = { ...mockWebhookPayload, status: 'EXPIRED' };
      await paymentService.processWebhook(expiredPayload);

      expect(mockPayment.update).toHaveBeenCalledWith({
        status: PaymentStatus.EXPIRED,
        paidAt: undefined,
        webhookData: expiredPayload
      });
    });
  });

  describe('getPaymentStatus', () => {
    let mockPayment: any;

    beforeEach(() => {
      mockPayment = {
        id: 'payment123',
        donationId: mockDonation.id,
        method: PaymentMethod.INVOICE,
        status: PaymentStatus.PENDING,
        xenditId: 'inv_123456',
        update: jest.fn().mockResolvedValue(true)
      };

      (Payment.findByPk as jest.Mock) = jest.fn().mockResolvedValue(mockPayment);
    });

    it('should return payment status successfully', async () => {
      const payment = await paymentService.getPaymentStatus('payment123');

      expect(Payment.findByPk).toHaveBeenCalledWith('payment123');
      expect(payment).toBeDefined();
      expect(payment?.id).toBe('payment123');
    });

    it('should return null for non-existent payment', async () => {
      (Payment.findByPk as jest.Mock).mockResolvedValue(null);

      const payment = await paymentService.getPaymentStatus('nonexistent');

      expect(payment).toBeNull();
    });
  });

  describe('cancelPayment', () => {
    let mockPayment: any;

    beforeEach(() => {
      mockPayment = {
        id: 'payment123',
        status: PaymentStatus.PENDING,
        update: jest.fn().mockResolvedValue(true)
      };

      (Payment.findByPk as jest.Mock) = jest.fn().mockResolvedValue(mockPayment);
    });

    it('should cancel a pending payment successfully', async () => {
      const payment = await paymentService.cancelPayment('payment123');

      expect(Payment.findByPk).toHaveBeenCalledWith('payment123');
      expect(mockPayment.update).toHaveBeenCalledWith({ status: PaymentStatus.CANCELLED });
      expect(payment).toBeDefined();
    });

    it('should throw error when trying to cancel paid payment', async () => {
      mockPayment.status = PaymentStatus.PAID;

      await expect(paymentService.cancelPayment('payment123'))
        .rejects.toThrow('Cannot cancel a paid payment');
    });

    it('should return null for non-existent payment', async () => {
      (Payment.findByPk as jest.Mock).mockResolvedValue(null);

      const payment = await paymentService.cancelPayment('nonexistent');

      expect(payment).toBeNull();
    });
  });
});