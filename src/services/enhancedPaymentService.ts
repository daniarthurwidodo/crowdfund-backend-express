import { xendit, XENDIT_CONFIG, SUPPORTED_VA_BANKS, SUPPORTED_EWALLETS } from '../config/xendit';
import { Payment, Donation, Project } from '../models';
import { 
  PaymentMethod, 
  PaymentStatus, 
  PaymentInstance, 
  XenditInvoiceRequest, 
  XenditVARequest, 
  XenditEwalletRequest,
  XenditWebhookPayload
} from '../types';
import { generateULID } from '../utils/ulid';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger('EnhancedPaymentService');

interface RetryOptions {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
}

interface SettlementData {
  settlementId: string;
  settlementDate: Date;
  feeAmount: number;
  netAmount: number;
  bankAccount?: string;
}

export class EnhancedPaymentService {
  private readonly defaultRetryOptions: RetryOptions = {
    maxAttempts: 3,
    backoffMs: 1000,
    backoffMultiplier: 2
  };

  /**
   * Enhanced retry wrapper for API calls
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {},
    context: string = 'operation'
  ): Promise<T> {
    const { maxAttempts, backoffMs, backoffMultiplier } = { ...this.defaultRetryOptions, ...options };
    let lastError: Error;
    let currentBackoff = backoffMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation();
        if (attempt > 1) {
          logger.info(`${context} succeeded on attempt ${attempt}`);
        }
        return result;
      } catch (error: any) {
        lastError = error;
        logger.warn(`${context} failed on attempt ${attempt}/${maxAttempts}`, { 
          error: error.message,
          attempt,
          maxAttempts
        });

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          logger.error(`${context} failed with non-retryable error`, { error: error.message });
          throw error;
        }

        if (attempt < maxAttempts) {
          await this.sleep(currentBackoff);
          currentBackoff *= backoffMultiplier;
        }
      }
    }

    logger.error(`${context} failed after ${maxAttempts} attempts`, { error: lastError.message });
    throw lastError;
  }

  private isNonRetryableError(error: any): boolean {
    // Don't retry on validation errors, authentication errors, etc.
    const nonRetryableCodes = ['VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'];
    return nonRetryableCodes.includes(error.code) || error.status === 400 || error.status === 401 || error.status === 403 || error.status === 404;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create an invoice payment with real Xendit integration
   */
  async createInvoice(donationId: string, options: {
    payerEmail?: string;
    description: string;
    paymentMethods?: string[];
  }): Promise<PaymentInstance> {
    return this.withRetry(async () => {
      const donation = await Donation.findByPk(donationId);
      if (!donation) {
        throw new Error('Donation not found');
      }

      const externalId = `donation-${donationId}-${generateULID()}`;
      
      const invoiceRequest: XenditInvoiceRequest = {
        external_id: externalId,
        amount: Number(donation.amount),
        payer_email: options.payerEmail,
        description: options.description,
        invoice_duration: XENDIT_CONFIG.defaultInvoiceDuration,
        should_send_email: !!options.payerEmail,
        should_authenticate_credit_card: false,
        currency: XENDIT_CONFIG.defaultCurrency,
        payment_methods: options.paymentMethods || ['BANK_TRANSFER', 'CREDIT_CARD', 'EWALLET', 'RETAIL_OUTLET'],
        success_redirect_url: `${process.env.FRONTEND_URL}/payment/success`,
        failure_redirect_url: `${process.env.FRONTEND_URL}/payment/failed`
      };

      logger.info('Creating Xendit invoice', { externalId, amount: donation.amount });

      // Real Xendit API call
      let invoice: any;
      if (XENDIT_CONFIG.isProduction) {
        try {
          invoice = await xendit.Invoice.createInvoice(invoiceRequest);
        } catch (xenditError: any) {
          logger.error('Xendit invoice creation failed', { error: xenditError.message, externalId });
          throw new Error(`Payment gateway error: ${xenditError.message}`);
        }
      } else {
        // Mock response for development/testing
        invoice = {
          id: `inv_${Date.now()}`,
          invoice_url: `https://checkout.xendit.co/web/${Date.now()}`,
          status: 'PENDING',
          expiry_date: new Date(Date.now() + XENDIT_CONFIG.defaultInvoiceDuration * 1000).toISOString()
        };
        logger.info('Using mock Xendit invoice response', { externalId });
      }

      // Calculate expiry date
      const expiredAt = new Date();
      expiredAt.setSeconds(expiredAt.getSeconds() + XENDIT_CONFIG.defaultInvoiceDuration);

      // Create payment record
      const payment = await Payment.create({
        donationId,
        externalId,
        xenditId: invoice.id,
        amount: Number(donation.amount),
        currency: XENDIT_CONFIG.defaultCurrency,
        method: PaymentMethod.INVOICE,
        status: PaymentStatus.PENDING,
        paymentUrl: invoice.invoice_url,
        expiredAt
      });

      logger.info('Invoice payment created successfully', { 
        paymentId: payment.id, 
        xenditId: invoice.id,
        invoiceUrl: invoice.invoice_url 
      });

      return payment;
    }, { maxAttempts: 3 }, 'createInvoice');
  }

  /**
   * Create a virtual account payment with real Xendit integration
   */
  async createVirtualAccount(donationId: string, options: {
    bankCode: keyof typeof SUPPORTED_VA_BANKS;
    customerName: string;
  }): Promise<PaymentInstance> {
    return this.withRetry(async () => {
      const donation = await Donation.findByPk(donationId);
      if (!donation) {
        throw new Error('Donation not found');
      }

      if (!Object.keys(SUPPORTED_VA_BANKS).includes(options.bankCode)) {
        throw new Error(`Unsupported bank code: ${options.bankCode}`);
      }

      const externalId = `donation-va-${donationId}-${generateULID()}`;
      
      // Calculate expiry date
      const expiredAt = new Date();
      expiredAt.setHours(expiredAt.getHours() + XENDIT_CONFIG.defaultExpiryHours);
      
      const vaRequest: XenditVARequest = {
        external_id: externalId,
        bank_code: options.bankCode,
        name: options.customerName,
        expected_amount: Number(donation.amount),
        is_closed: true,
        expiration_date: expiredAt.toISOString(),
        is_single_use: true
      };

      logger.info('Creating Xendit virtual account', { 
        externalId, 
        bankCode: options.bankCode,
        amount: donation.amount 
      });

      // Real Xendit API call
      let va: any;
      if (XENDIT_CONFIG.isProduction) {
        try {
          va = await xendit.VirtualAcc.createFixedVA(vaRequest);
        } catch (xenditError: any) {
          logger.error('Xendit VA creation failed', { error: xenditError.message, externalId });
          throw new Error(`Payment gateway error: ${xenditError.message}`);
        }
      } else {
        // Mock response for development/testing
        va = {
          id: `va_${Date.now()}`,
          account_number: `8808${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`,
          status: 'PENDING'
        };
        logger.info('Using mock Xendit VA response', { externalId });
      }

      // Create payment record
      const payment = await Payment.create({
        donationId,
        externalId,
        xenditId: va.id,
        amount: Number(donation.amount),
        currency: XENDIT_CONFIG.defaultCurrency,
        method: PaymentMethod.VIRTUAL_ACCOUNT,
        status: PaymentStatus.PENDING,
        virtualAccount: {
          bankCode: options.bankCode,
          accountNumber: va.account_number
        },
        expiredAt
      });

      logger.info('Virtual account payment created successfully', { 
        paymentId: payment.id, 
        xenditId: va.id,
        accountNumber: va.account_number 
      });

      return payment;
    }, { maxAttempts: 3 }, 'createVirtualAccount');
  }

  /**
   * Create an e-wallet payment with real Xendit integration
   */
  async createEwallet(donationId: string, options: {
    ewalletType: keyof typeof SUPPORTED_EWALLETS;
    phone?: string;
    redirectUrl?: string;
  }): Promise<PaymentInstance> {
    return this.withRetry(async () => {
      const donation = await Donation.findByPk(donationId);
      if (!donation) {
        throw new Error('Donation not found');
      }

      if (!Object.keys(SUPPORTED_EWALLETS).includes(options.ewalletType)) {
        throw new Error(`Unsupported e-wallet type: ${options.ewalletType}`);
      }

      const externalId = `donation-ewallet-${donationId}-${generateULID()}`;
      
      const ewalletRequest: XenditEwalletRequest = {
        external_id: externalId,
        amount: Number(donation.amount),
        phone: options.phone,
        ewallet_type: options.ewalletType,
        callback_url: XENDIT_CONFIG.callbackUrl,
        redirect_url: options.redirectUrl || `${process.env.FRONTEND_URL}/payment/success`
      };

      logger.info('Creating Xendit e-wallet payment', { 
        externalId, 
        ewalletType: options.ewalletType,
        amount: donation.amount 
      });

      let ewalletResponse: any;
      if (XENDIT_CONFIG.isProduction) {
        try {
          // Use different methods based on e-wallet type
          switch (options.ewalletType) {
            case 'OVO':
              ewalletResponse = await xendit.EWallet.createOVOPayment(ewalletRequest);
              break;
            case 'DANA':
              ewalletResponse = await xendit.EWallet.createDANAPayment(ewalletRequest);
              break;
            case 'LINKAJA':
              ewalletResponse = await xendit.EWallet.createLinkAjaPayment(ewalletRequest);
              break;
            case 'SHOPEEPAY':
              ewalletResponse = await xendit.EWallet.createShopeepayPayment(ewalletRequest);
              break;
            default:
              throw new Error(`Unsupported e-wallet type: ${options.ewalletType}`);
          }
        } catch (xenditError: any) {
          logger.error('Xendit e-wallet creation failed', { error: xenditError.message, externalId });
          throw new Error(`Payment gateway error: ${xenditError.message}`);
        }
      } else {
        // Mock response for development/testing
        ewalletResponse = {
          id: `ewallet_${Date.now()}`,
          checkout_url: `https://checkout.xendit.co/web/${Date.now()}`,
          actions: {
            desktop_web_checkout_url: `https://checkout.xendit.co/web/${Date.now()}`
          },
          status: 'PENDING'
        };
        logger.info('Using mock Xendit e-wallet response', { externalId });
      }

      // Calculate expiry date (typically shorter for e-wallets)
      const expiredAt = new Date();
      expiredAt.setMinutes(expiredAt.getMinutes() + 15); // 15 minutes for e-wallet

      // Create payment record
      const payment = await Payment.create({
        donationId,
        externalId,
        xenditId: ewalletResponse.id,
        amount: Number(donation.amount),
        currency: XENDIT_CONFIG.defaultCurrency,
        method: PaymentMethod.EWALLET,
        status: PaymentStatus.PENDING,
        paymentUrl: ewalletResponse.checkout_url || ewalletResponse.actions?.desktop_web_checkout_url,
        ewalletType: options.ewalletType,
        expiredAt
      });

      logger.info('E-wallet payment created successfully', { 
        paymentId: payment.id, 
        xenditId: ewalletResponse.id,
        ewalletType: options.ewalletType,
        checkoutUrl: payment.paymentUrl
      });

      return payment;
    }, { maxAttempts: 3 }, 'createEwallet');
  }

  /**
   * Process webhook payload from Xendit with enhanced settlement handling
   */
  async processWebhook(payload: XenditWebhookPayload): Promise<void> {
    try {
      logger.info('Processing Xendit webhook', { 
        externalId: payload.external_id, 
        status: payload.status,
        paymentMethod: payload.payment_method,
        webhookId: payload.id
      });

      // Find payment by external ID
      const payment = await Payment.findOne({
        where: { externalId: payload.external_id },
        include: [{ model: Donation, as: 'donation', include: [{ model: Project, as: 'project' }] }]
      });

      if (!payment) {
        logger.warn('Payment not found for webhook', { externalId: payload.external_id });
        return;
      }

      // Prevent duplicate webhook processing
      if (payment.webhookData && payment.webhookData.id === payload.id) {
        logger.info('Webhook already processed', { webhookId: payload.id, paymentId: payment.id });
        return;
      }

      // Update payment status based on webhook status
      let newStatus: PaymentStatus;
      let paidAt: Date | undefined;
      let settlementData: SettlementData | undefined;

      switch (payload.status.toUpperCase()) {
        case 'PAID':
        case 'SETTLED':
          newStatus = PaymentStatus.PAID;
          paidAt = payload.paid_at ? new Date(payload.paid_at) : new Date();
          
          // Handle settlement data if available
          if (payload.status.toUpperCase() === 'SETTLED') {
            settlementData = await this.processSettlement(payment, payload);
          }
          break;
        case 'EXPIRED':
          newStatus = PaymentStatus.EXPIRED;
          break;
        case 'FAILED':
          newStatus = PaymentStatus.FAILED;
          break;
        case 'CANCELLED':
          newStatus = PaymentStatus.CANCELLED;
          break;
        default:
          newStatus = PaymentStatus.PENDING;
      }

      // Update payment record with transaction
      await payment.sequelize!.transaction(async (transaction) => {
        await payment.update({
          status: newStatus,
          paidAt,
          webhookData: payload,
          ...(settlementData && { settlementData })
        }, { transaction });

        // Update donation and project if payment is successful
        if (newStatus === PaymentStatus.PAID && payment.donation) {
          await payment.donation.update({ 
            paymentStatus: PaymentStatus.PAID 
          }, { transaction });

          // Update project funding amount
          if (payment.donation.project) {
            const project = payment.donation.project;
            const newCurrentAmount = Number(project.currentAmount) + Number(payment.amount);
            await project.update({ 
              currentAmount: newCurrentAmount 
            }, { transaction });

            logger.info('Project funding updated', {
              projectId: project.id,
              previousAmount: project.currentAmount,
              donationAmount: payment.amount,
              newAmount: newCurrentAmount
            });
          }
        }
      });

      logger.info('Webhook processed successfully', { 
        paymentId: payment.id,
        oldStatus: payment.status,
        newStatus,
        donationId: payment.donationId,
        ...(settlementData && { settlementId: settlementData.settlementId })
      });

    } catch (error) {
      logger.error({ err: error, payload }, 'Error processing webhook');
      throw error;
    }
  }

  /**
   * Process settlement data for completed payments
   */
  private async processSettlement(payment: PaymentInstance, payload: XenditWebhookPayload): Promise<SettlementData> {
    try {
      const settlementData: SettlementData = {
        settlementId: payload.settlement_id || `settlement_${Date.now()}`,
        settlementDate: payload.settlement_date ? new Date(payload.settlement_date) : new Date(),
        feeAmount: payload.fees_paid_amount || 0,
        netAmount: payload.adjusted_received_amount || payload.amount || Number(payment.amount),
        bankAccount: payload.settlement_bank_account
      };

      logger.info('Processing settlement', {
        paymentId: payment.id,
        settlementId: settlementData.settlementId,
        feeAmount: settlementData.feeAmount,
        netAmount: settlementData.netAmount
      });

      // You can add additional settlement processing logic here
      // For example: update accounting records, trigger payout processes, etc.

      return settlementData;
    } catch (error) {
      logger.error({ err: error, paymentId: payment.id }, 'Error processing settlement');
      throw error;
    }
  }

  /**
   * Get payment status from Xendit with retry logic
   */
  async getPaymentStatus(paymentId: string): Promise<PaymentInstance | null> {
    return this.withRetry(async () => {
      const payment = await Payment.findByPk(paymentId);
      if (!payment) {
        return null;
      }

      let xenditResponse: any;
      
      if (XENDIT_CONFIG.isProduction && payment.xenditId) {
        try {
          // Query Xendit API based on payment method
          switch (payment.method) {
            case PaymentMethod.INVOICE:
              xenditResponse = await xendit.Invoice.getInvoice({ invoiceID: payment.xenditId });
              break;
            case PaymentMethod.VIRTUAL_ACCOUNT:
              xenditResponse = await xendit.VirtualAcc.getFixedVA({ id: payment.xenditId });
              break;
            case PaymentMethod.EWALLET:
              xenditResponse = await xendit.EWallet.getEWalletPayment({ 
                external_id: payment.externalId,
                ewallet_type: payment.ewalletType 
              });
              break;
            default:
              logger.warn('Unknown payment method for status check', { paymentId, method: payment.method });
              return payment;
          }
        } catch (xenditError: any) {
          logger.error('Xendit status check failed', { 
            error: xenditError.message, 
            paymentId, 
            xenditId: payment.xenditId 
          });
          throw xenditError;
        }
      } else {
        // Mock response for development
        xenditResponse = { status: payment.status };
        logger.info('Using mock status check', { paymentId, method: payment.method });
      }

      // Update local status if different
      let newStatus: PaymentStatus;
      switch (xenditResponse.status?.toUpperCase()) {
        case 'PAID':
        case 'SETTLED':
          newStatus = PaymentStatus.PAID;
          break;
        case 'EXPIRED':
          newStatus = PaymentStatus.EXPIRED;
          break;
        case 'FAILED':
          newStatus = PaymentStatus.FAILED;
          break;
        case 'CANCELLED':
          newStatus = PaymentStatus.CANCELLED;
          break;
        default:
          newStatus = PaymentStatus.PENDING;
      }

      if (payment.status !== newStatus) {
        await payment.update({ 
          status: newStatus,
          ...(newStatus === PaymentStatus.PAID && !payment.paidAt && { paidAt: new Date() })
        });
        logger.info('Payment status updated from Xendit', { 
          paymentId, 
          oldStatus: payment.status,
          newStatus 
        });
      }

      return payment;
    }, { maxAttempts: 2, backoffMs: 500 }, 'getPaymentStatus');
  }

  /**
   * Cancel a payment with Xendit API integration
   */
  async cancelPayment(paymentId: string): Promise<PaymentInstance | null> {
    return this.withRetry(async () => {
      const payment = await Payment.findByPk(paymentId);
      if (!payment) {
        return null;
      }

      if (payment.status === PaymentStatus.PAID) {
        throw new Error('Cannot cancel a paid payment');
      }

      // Cancel with Xendit if in production
      if (XENDIT_CONFIG.isProduction && payment.xenditId) {
        try {
          switch (payment.method) {
            case PaymentMethod.INVOICE:
              await xendit.Invoice.expireInvoice({ invoiceID: payment.xenditId });
              break;
            case PaymentMethod.VIRTUAL_ACCOUNT:
              await xendit.VirtualAcc.updateFixedVA({ 
                id: payment.xenditId,
                is_single_use: false,
                expiration_date: new Date().toISOString() // Expire immediately
              });
              break;
            // E-wallets typically can't be cancelled via API
          }
        } catch (xenditError: any) {
          logger.warn('Failed to cancel payment with Xendit', { 
            error: xenditError.message, 
            paymentId, 
            xenditId: payment.xenditId 
          });
          // Continue with local cancellation even if Xendit call fails
        }
      }

      // Update local status
      await payment.update({ status: PaymentStatus.CANCELLED });

      logger.info('Payment cancelled', { paymentId });
      return payment;
    }, { maxAttempts: 2 }, 'cancelPayment');
  }

  /**
   * Bulk status check for reconciliation
   */
  async bulkStatusCheck(paymentIds: string[]): Promise<{ updated: number; errors: string[] }> {
    let updated = 0;
    const errors: string[] = [];

    logger.info('Starting bulk status check', { count: paymentIds.length });

    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < paymentIds.length; i += batchSize) {
      const batch = paymentIds.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (paymentId) => {
          try {
            const payment = await this.getPaymentStatus(paymentId);
            if (payment) {
              updated++;
            }
          } catch (error: any) {
            errors.push(`${paymentId}: ${error.message}`);
          }
        })
      );

      // Rate limiting: wait between batches
      if (i + batchSize < paymentIds.length) {
        await this.sleep(1000);
      }
    }

    logger.info('Bulk status check completed', { total: paymentIds.length, updated, errors: errors.length });
    return { updated, errors };
  }
}

export const enhancedPaymentService = new EnhancedPaymentService();