import { Request, Response } from 'express';
import crypto from 'crypto-js';
import { paymentService } from '../services/paymentService';
import { XENDIT_CONFIG } from '../config/xendit';
import { XenditWebhookPayload } from '../types';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger('WebhookController');

/**
 * Verify Xendit webhook signature
 */
const verifyXenditSignature = (payload: string, signature: string): boolean => {
  try {
    const expectedSignature = crypto.HmacSHA256(payload, XENDIT_CONFIG.webhookToken).toString();
    return signature === expectedSignature;
  } catch (error) {
    logger.error({ err: error }, 'Error verifying webhook signature');
    return false;
  }
};

/**
 * Handle Xendit webhook
 */
export const handleXenditWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-callback-token'] as string;
    const payload = JSON.stringify(req.body);
    
    // Log webhook received (without sensitive data)
    logger.info('Webhook received', { 
      signature: signature ? 'present' : 'missing',
      bodySize: payload.length,
      userAgent: req.headers['user-agent']
    });

    // Verify signature
    if (!signature) {
      logger.warn('Webhook received without signature');
      res.status(400).json({ message: 'Missing signature' });
      return;
    }

    if (!verifyXenditSignature(payload, signature)) {
      logger.warn('Webhook signature verification failed', { 
        receivedSignature: signature.substring(0, 20) + '...' 
      });
      res.status(401).json({ message: 'Invalid signature' });
      return;
    }

    // Parse and validate webhook payload
    let webhookData: XenditWebhookPayload;
    try {
      webhookData = req.body as XenditWebhookPayload;
      
      // Basic validation
      if (!webhookData.external_id || !webhookData.status) {
        logger.warn('Invalid webhook payload structure', { 
          hasExternalId: !!webhookData.external_id,
          hasStatus: !!webhookData.status 
        });
        res.status(400).json({ message: 'Invalid webhook payload' });
        return;
      }
    } catch (error) {
      logger.error({ err: error }, 'Error parsing webhook payload');
      res.status(400).json({ message: 'Invalid JSON payload' });
      return;
    }

    // Process webhook
    try {
      await paymentService.processWebhook(webhookData);
      
      logger.info('Webhook processed successfully', {
        externalId: webhookData.external_id,
        status: webhookData.status,
        paymentMethod: webhookData.payment_method
      });

      res.status(200).json({ message: 'Webhook processed successfully' });
    } catch (error) {
      logger.error({ err: error, externalId: webhookData.external_id }, 'Error processing webhook');
      
      // Return 200 to prevent Xendit from retrying if it's our internal error
      // but return 500 for genuine processing errors that might benefit from retry
      if (error instanceof Error && error.message.includes('Payment not found')) {
        res.status(200).json({ message: 'Payment not found, webhook ignored' });
      } else {
        res.status(500).json({ message: 'Internal error processing webhook' });
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Unexpected error in webhook handler');
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Test webhook endpoint (for development/testing)
 */
export const testWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({ message: 'Not found' });
      return;
    }

    const testPayload: XenditWebhookPayload = {
      id: 'test-webhook-id',
      external_id: req.body.external_id || 'test-external-id',
      user_id: 'test-user-id',
      is_high: false,
      payment_method: req.body.payment_method || 'BANK_TRANSFER',
      status: req.body.status || 'PAID',
      merchant_name: 'Test Merchant',
      amount: req.body.amount || 100000,
      paid_amount: req.body.amount || 100000,
      bank_code: req.body.bank_code || 'BCA',
      paid_at: new Date().toISOString(),
      payer_email: 'test@example.com',
      description: 'Test payment',
      adjusted_received_amount: req.body.amount || 100000,
      fees_paid_amount: 0,
      updated: new Date().toISOString(),
      created: new Date().toISOString(),
      currency: 'IDR'
    };

    await paymentService.processWebhook(testPayload);

    logger.info('Test webhook processed', { 
      externalId: testPayload.external_id,
      status: testPayload.status 
    });

    res.json({ 
      message: 'Test webhook processed successfully',
      payload: testPayload 
    });
  } catch (error) {
    logger.error({ err: error }, 'Error processing test webhook');
    res.status(500).json({ message: 'Error processing test webhook' });
  }
};

/**
 * Get webhook logs (for debugging)
 */
export const getWebhookLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    // This is a simplified implementation
    // In a real application, you might want to store webhook logs in a database
    
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ message: 'Admin access required' });
      return;
    }

    // Return a placeholder response
    res.json({
      message: 'Webhook logs endpoint - implement based on your logging strategy',
      note: 'Check application logs for webhook processing details'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting webhook logs');
    res.status(500).json({ message: 'Internal server error' });
  }
};