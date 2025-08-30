import request from 'supertest';
import express from 'express';
import crypto from 'crypto-js';
import { handleXenditWebhook, testWebhook } from '../controllers/webhookController';
import { paymentService } from '../services/paymentService';
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

// Mock the Xendit config
jest.mock('../config/xendit', () => ({
  XENDIT_CONFIG: {
    webhookToken: 'test-webhook-token'
  }
}));

// Mock the payment service
jest.mock('../services/paymentService', () => ({
  paymentService: {
    processWebhook: jest.fn()
  }
}));

// Mock crypto-js
jest.mock('crypto-js', () => ({
  HmacSHA256: jest.fn()
}));

describe('Webhook Controller', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Setup webhook route
    app.post('/webhook', handleXenditWebhook);
    app.post('/webhook/test', testWebhook);
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('handleXenditWebhook', () => {
    const validWebhookPayload = {
      id: 'webhook123',
      external_id: 'donation-123-456',
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

    beforeEach(() => {
      // Mock successful signature verification
      (crypto.HmacSHA256 as jest.Mock).mockReturnValue({
        toString: jest.fn().mockReturnValue('valid-signature')
      });
      
      // Mock successful webhook processing
      (paymentService.processWebhook as jest.Mock).mockResolvedValue(undefined);
    });

    it('should process valid webhook successfully', async () => {
      const response = await request(app)
        .post('/webhook')
        .set('x-callback-token', 'valid-signature')
        .send(validWebhookPayload);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Webhook processed successfully');
      expect(paymentService.processWebhook).toHaveBeenCalledWith(validWebhookPayload);
    });

    it('should return 400 when signature is missing', async () => {
      const response = await request(app)
        .post('/webhook')
        .send(validWebhookPayload);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Missing signature');
      expect(paymentService.processWebhook).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid signature', async () => {
      // Mock invalid signature
      (crypto.HmacSHA256 as jest.Mock).mockReturnValue({
        toString: jest.fn().mockReturnValue('different-signature')
      });

      const response = await request(app)
        .post('/webhook')
        .set('x-callback-token', 'invalid-signature')
        .send(validWebhookPayload);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid signature');
      expect(paymentService.processWebhook).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid payload structure', async () => {
      const invalidPayload = {
        // Missing required fields
        id: 'webhook123'
      };

      const response = await request(app)
        .post('/webhook')
        .set('x-callback-token', 'valid-signature')
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid webhook payload');
      expect(paymentService.processWebhook).not.toHaveBeenCalled();
    });

    it('should handle payment not found gracefully', async () => {
      (paymentService.processWebhook as jest.Mock).mockRejectedValue(
        new Error('Payment not found')
      );

      const response = await request(app)
        .post('/webhook')
        .set('x-callback-token', 'valid-signature')
        .send(validWebhookPayload);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Payment not found, webhook ignored');
    });

    it('should return 500 for processing errors', async () => {
      (paymentService.processWebhook as jest.Mock).mockRejectedValue(
        new Error('Database connection error')
      );

      const response = await request(app)
        .post('/webhook')
        .set('x-callback-token', 'valid-signature')
        .send(validWebhookPayload);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Internal error processing webhook');
    });

    it('should handle signature verification errors', async () => {
      (crypto.HmacSHA256 as jest.Mock).mockImplementation(() => {
        throw new Error('Crypto error');
      });

      const response = await request(app)
        .post('/webhook')
        .set('x-callback-token', 'test-signature')
        .send(validWebhookPayload);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid signature');
    });

    it('should validate webhook payload thoroughly', async () => {
      const testCases = [
        { payload: { ...validWebhookPayload, external_id: '' }, field: 'external_id' },
        { payload: { ...validWebhookPayload, status: '' }, field: 'status' },
        { payload: { ...validWebhookPayload, external_id: undefined }, field: 'external_id' },
        { payload: { ...validWebhookPayload, status: undefined }, field: 'status' }
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/webhook')
          .set('x-callback-token', 'valid-signature')
          .send(testCase.payload);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('Invalid webhook payload');
      }
    });
  });

  describe('testWebhook', () => {
    beforeEach(() => {
      // Mock development environment
      process.env.NODE_ENV = 'development';
      (paymentService.processWebhook as jest.Mock).mockResolvedValue(undefined);
    });

    afterEach(() => {
      // Reset environment
      delete process.env.NODE_ENV;
    });

    it('should process test webhook in development', async () => {
      const testPayload = {
        external_id: 'test-external-id',
        status: 'PAID',
        amount: 100000
      };

      const response = await request(app)
        .post('/webhook/test')
        .send(testPayload);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Test webhook processed successfully');
      expect(response.body.payload).toBeDefined();
      expect(paymentService.processWebhook).toHaveBeenCalled();
    });

    it('should return 404 in production', async () => {
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .post('/webhook/test')
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Not found');
      expect(paymentService.processWebhook).not.toHaveBeenCalled();
    });

    it('should handle processing errors', async () => {
      (paymentService.processWebhook as jest.Mock).mockRejectedValue(
        new Error('Processing error')
      );

      const response = await request(app)
        .post('/webhook/test')
        .send({ external_id: 'test' });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Error processing test webhook');
    });

    it('should use default values for missing fields', async () => {
      const response = await request(app)
        .post('/webhook/test')
        .send({});

      expect(response.status).toBe(200);
      
      const callArgs = (paymentService.processWebhook as jest.Mock).mock.calls[0][0];
      expect(callArgs.external_id).toBe('test-external-id');
      expect(callArgs.status).toBe('PAID');
      expect(callArgs.payment_method).toBe('BANK_TRANSFER');
    });

    it('should use provided values when available', async () => {
      const customPayload = {
        external_id: 'custom-external-id',
        status: 'EXPIRED',
        payment_method: 'CREDIT_CARD',
        amount: 250000
      };

      const response = await request(app)
        .post('/webhook/test')
        .send(customPayload);

      expect(response.status).toBe(200);
      
      const callArgs = (paymentService.processWebhook as jest.Mock).mock.calls[0][0];
      expect(callArgs.external_id).toBe('custom-external-id');
      expect(callArgs.status).toBe('EXPIRED');
      expect(callArgs.payment_method).toBe('CREDIT_CARD');
      expect(callArgs.amount).toBe(250000);
    });
  });

  describe('Webhook signature verification', () => {
    const testPayload = '{"test":"data"}';
    const webhookToken = 'test-webhook-token';

    it('should generate correct signature', () => {
      const expectedHash = 'expected-hash-value';
      (crypto.HmacSHA256 as jest.Mock).mockReturnValue({
        toString: jest.fn().mockReturnValue(expectedHash)
      });

      // Test the actual signature generation logic indirectly
      const response = request(app)
        .post('/webhook')
        .set('x-callback-token', expectedHash)
        .send({ external_id: 'test', status: 'PAID' });

      expect(crypto.HmacSHA256).toHaveBeenCalledWith(
        expect.any(String),
        webhookToken
      );
    });

    it('should handle different signature formats', async () => {
      const testSignatures = [
        'valid-signature',
        'another-valid-signature',
        '1234567890abcdef',
        'aBcDeF123456'
      ];

      for (const signature of testSignatures) {
        (crypto.HmacSHA256 as jest.Mock).mockReturnValue({
          toString: jest.fn().mockReturnValue(signature)
        });

        const response = await request(app)
          .post('/webhook')
          .set('x-callback-token', signature)
          .send({ external_id: 'test', status: 'PAID' });

        expect(response.status).toBe(200);
      }
    });
  });
});