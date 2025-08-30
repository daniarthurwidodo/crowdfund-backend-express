import { xendit, XENDIT_CONFIG, SUPPORTED_VA_BANKS, SUPPORTED_EWALLETS } from '../config/xendit';
import { Payment, Donation } from '../models';
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

const logger = createChildLogger('PaymentService');

export class PaymentService {
  
  /**
   * Create an invoice payment
   */
  async createInvoice(donationId: string, options: {
    payerEmail?: string;
    description: string;
    paymentMethods?: string[];
  }): Promise<PaymentInstance> {
    try {
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
        payment_methods: options.paymentMethods || ['BANK_TRANSFER', 'CREDIT_CARD', 'EWALLET', 'RETAIL_OUTLET']
      };

      logger.info('Creating Xendit invoice', { externalId, amount: donation.amount });
      // Note: Using mock response for now - update with correct Xendit SDK method
      const invoice = {
        id: `inv_${Date.now()}`,
        invoiceUrl: `https://checkout.xendit.co/web/${Date.now()}`
      };

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
        paymentUrl: invoice.invoiceUrl,
        expiredAt
      });

      logger.info('Invoice payment created successfully', { 
        paymentId: payment.id, 
        xenditId: invoice.id,
        invoiceUrl: invoice.invoiceUrl 
      });

      return payment;
    } catch (error) {
      logger.error({ err: error, donationId }, 'Error creating invoice payment');
      throw error;
    }
  }

  /**
   * Create a virtual account payment
   */
  async createVirtualAccount(donationId: string, options: {
    bankCode: keyof typeof SUPPORTED_VA_BANKS;
    customerName: string;
  }): Promise<PaymentInstance> {
    try {
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

      // Note: Using mock response for now - update with correct Xendit SDK method
      const va = {
        id: `va_${Date.now()}`,
        account_number: `8808${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`
      };

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
    } catch (error) {
      logger.error({ err: error, donationId, bankCode: options.bankCode }, 'Error creating virtual account payment');
      throw error;
    }
  }

  /**
   * Create an e-wallet payment
   */
  async createEwallet(donationId: string, options: {
    ewalletType: keyof typeof SUPPORTED_EWALLETS;
    phone?: string;
    redirectUrl?: string;
  }): Promise<PaymentInstance> {
    try {
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
        redirect_url: options.redirectUrl
      };

      logger.info('Creating Xendit e-wallet payment', { 
        externalId, 
        ewalletType: options.ewalletType,
        amount: donation.amount 
      });

      let ewalletResponse: any;
      
      // Note: Using mock response for now - update with correct Xendit SDK method
      ewalletResponse = {
        id: `ewallet_${Date.now()}`,
        checkout_url: `https://checkout.xendit.co/web/${Date.now()}`,
        actions: {
          desktop_web_checkout_url: `https://checkout.xendit.co/web/${Date.now()}`
        }
      };

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
    } catch (error) {
      logger.error({ err: error, donationId, ewalletType: options.ewalletType }, 'Error creating e-wallet payment');
      throw error;
    }
  }

  /**
   * Process webhook payload from Xendit
   */
  async processWebhook(payload: XenditWebhookPayload): Promise<void> {
    try {
      logger.info('Processing Xendit webhook', { 
        externalId: payload.external_id, 
        status: payload.status,
        paymentMethod: payload.payment_method 
      });

      // Find payment by external ID
      const payment = await Payment.findOne({
        where: { externalId: payload.external_id }
      });

      if (!payment) {
        logger.warn('Payment not found for webhook', { externalId: payload.external_id });
        return;
      }

      // Update payment status based on webhook status
      let newStatus: PaymentStatus;
      let paidAt: Date | undefined;

      switch (payload.status.toUpperCase()) {
        case 'PAID':
          newStatus = PaymentStatus.PAID;
          paidAt = payload.paid_at ? new Date(payload.paid_at) : new Date();
          break;
        case 'EXPIRED':
          newStatus = PaymentStatus.EXPIRED;
          break;
        case 'FAILED':
          newStatus = PaymentStatus.FAILED;
          break;
        default:
          newStatus = PaymentStatus.PENDING;
      }

      // Update payment record
      await payment.update({
        status: newStatus,
        paidAt,
        webhookData: payload
      });

      // Update donation status
      const donation = await Donation.findByPk(payment.donationId);
      if (donation && newStatus === PaymentStatus.PAID) {
        await donation.update({ paymentStatus: PaymentStatus.PAID });
      }

      logger.info('Webhook processed successfully', { 
        paymentId: payment.id,
        oldStatus: payment.status,
        newStatus,
        donationId: payment.donationId
      });

    } catch (error) {
      logger.error({ err: error, payload }, 'Error processing webhook');
      throw error;
    }
  }

  /**
   * Get payment status from Xendit
   */
  async getPaymentStatus(paymentId: string): Promise<PaymentInstance | null> {
    try {
      const payment = await Payment.findByPk(paymentId);
      if (!payment) {
        return null;
      }

      // Note: Mock implementation - update with correct Xendit SDK methods
      let xenditResponse: any = { status: payment.status };
      
      // In a real implementation, you would query Xendit API here
      logger.info('Mock status check', { paymentId, method: payment.method });

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
        default:
          newStatus = PaymentStatus.PENDING;
      }

      if (payment.status !== newStatus) {
        await payment.update({ status: newStatus });
        logger.info('Payment status updated from Xendit', { 
          paymentId, 
          oldStatus: payment.status,
          newStatus 
        });
      }

      return payment;
    } catch (error) {
      logger.error({ err: error, paymentId }, 'Error getting payment status');
      throw error;
    }
  }

  /**
   * Cancel a payment
   */
  async cancelPayment(paymentId: string): Promise<PaymentInstance | null> {
    try {
      const payment = await Payment.findByPk(paymentId);
      if (!payment) {
        return null;
      }

      if (payment.status === PaymentStatus.PAID) {
        throw new Error('Cannot cancel a paid payment');
      }

      // Update local status
      await payment.update({ status: PaymentStatus.CANCELLED });

      logger.info('Payment cancelled', { paymentId });
      return payment;
    } catch (error) {
      logger.error({ err: error, paymentId }, 'Error cancelling payment');
      throw error;
    }
  }
}

export const paymentService = new PaymentService();