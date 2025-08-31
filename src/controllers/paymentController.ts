import { Request, Response } from 'express';
import Joi from 'joi';
import { paymentService } from '../services/paymentService';
import { Payment, Donation } from '../models';
import { PaymentMethod, PaymentStatus } from '../types';
import { SUPPORTED_VA_BANKS, SUPPORTED_EWALLETS } from '../config/xendit';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger('PaymentController');

// Validation schemas
const createInvoiceSchema = Joi.object({
  donationId: Joi.string().length(26).required(),
  payerEmail: Joi.string().email().optional(),
  description: Joi.string().min(1).max(500).required(),
  paymentMethods: Joi.array()
    .items(
      Joi.string().valid(
        'BANK_TRANSFER',
        'CREDIT_CARD',
        'EWALLET',
        'RETAIL_OUTLET'
      )
    )
    .optional(),
});

const createVASchema = Joi.object({
  donationId: Joi.string().length(26).required(),
  bankCode: Joi.string()
    .valid(...Object.keys(SUPPORTED_VA_BANKS))
    .required(),
  customerName: Joi.string().min(1).max(100).required(),
});

const createEwalletSchema = Joi.object({
  donationId: Joi.string().length(26).required(),
  ewalletType: Joi.string()
    .valid(...Object.keys(SUPPORTED_EWALLETS))
    .required(),
  phone: Joi.string()
    .pattern(/^(\+62|62|0)8[1-9][0-9]{6,9}$/)
    .optional(), // Indonesian mobile number
  redirectUrl: Joi.string().uri().optional(),
});

/**
 * Create an invoice payment
 */
export const createInvoice = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { error, value } = createInvoiceSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.details[0].message });
      return;
    }

    const { donationId, payerEmail, description, paymentMethods } = value;

    // Check if donation exists and belongs to user (or is anonymous)
    const donation = await Donation.findByPk(donationId);
    if (!donation) {
      res.status(404).json({ message: 'Donation not found' });
      return;
    }

    // Check authorization
    if (
      donation.userId &&
      donation.userId !== req.user?.id &&
      req.user?.role !== 'ADMIN'
    ) {
      res.status(403).json({
        message: 'Not authorized to create payment for this donation',
      });
      return;
    }

    // Check if payment already exists for this donation
    const existingPayment = await Payment.findOne({
      where: {
        donationId,
        status: [PaymentStatus.PENDING, PaymentStatus.PAID],
      },
    });

    if (existingPayment) {
      res.status(409).json({
        message: 'Payment already exists for this donation',
        payment: existingPayment,
      });
      return;
    }

    const payment = await paymentService.createInvoice(donationId, {
      payerEmail,
      description,
      paymentMethods,
    });

    // Update donation payment method
    await donation.update({ paymentMethod: PaymentMethod.INVOICE });

    logger.info('Invoice payment created', {
      paymentId: payment.id,
      donationId,
      userId: req.user?.id,
    });

    res.status(201).json({
      message: 'Invoice payment created successfully',
      payment: payment.toJSON(),
    });
  } catch (error: any) {
    logger.error(
      { err: error, userId: req.user?.id, body: req.body },
      'Error creating invoice payment'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Create a virtual account payment
 */
export const createVirtualAccount = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { error, value } = createVASchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.details[0].message });
      return;
    }

    const { donationId, bankCode, customerName } = value;

    // Check if donation exists and belongs to user (or is anonymous)
    const donation = await Donation.findByPk(donationId);
    if (!donation) {
      res.status(404).json({ message: 'Donation not found' });
      return;
    }

    // Check authorization
    if (
      donation.userId &&
      donation.userId !== req.user?.id &&
      req.user?.role !== 'ADMIN'
    ) {
      res.status(403).json({
        message: 'Not authorized to create payment for this donation',
      });
      return;
    }

    // Check if payment already exists for this donation
    const existingPayment = await Payment.findOne({
      where: {
        donationId,
        status: [PaymentStatus.PENDING, PaymentStatus.PAID],
      },
    });

    if (existingPayment) {
      res.status(409).json({
        message: 'Payment already exists for this donation',
        payment: existingPayment,
      });
      return;
    }

    const payment = await paymentService.createVirtualAccount(donationId, {
      bankCode,
      customerName,
    });

    // Update donation payment method
    await donation.update({ paymentMethod: PaymentMethod.VIRTUAL_ACCOUNT });

    logger.info('Virtual account payment created', {
      paymentId: payment.id,
      donationId,
      bankCode,
      userId: req.user?.id,
    });

    res.status(201).json({
      message: 'Virtual account payment created successfully',
      payment: payment.toJSON(),
    });
  } catch (error: any) {
    logger.error(
      { err: error, userId: req.user?.id, body: req.body },
      'Error creating virtual account payment'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Create an e-wallet payment
 */
export const createEwallet = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { error, value } = createEwalletSchema.validate(req.body);
    if (error) {
      res.status(400).json({ message: error.details[0].message });
      return;
    }

    const { donationId, ewalletType, phone, redirectUrl } = value;

    // Check if donation exists and belongs to user (or is anonymous)
    const donation = await Donation.findByPk(donationId);
    if (!donation) {
      res.status(404).json({ message: 'Donation not found' });
      return;
    }

    // Check authorization
    if (
      donation.userId &&
      donation.userId !== req.user?.id &&
      req.user?.role !== 'ADMIN'
    ) {
      res.status(403).json({
        message: 'Not authorized to create payment for this donation',
      });
      return;
    }

    // Check if payment already exists for this donation
    const existingPayment = await Payment.findOne({
      where: {
        donationId,
        status: [PaymentStatus.PENDING, PaymentStatus.PAID],
      },
    });

    if (existingPayment) {
      res.status(409).json({
        message: 'Payment already exists for this donation',
        payment: existingPayment,
      });
      return;
    }

    const payment = await paymentService.createEwallet(donationId, {
      ewalletType,
      phone,
      redirectUrl,
    });

    // Update donation payment method
    await donation.update({ paymentMethod: PaymentMethod.EWALLET });

    logger.info('E-wallet payment created', {
      paymentId: payment.id,
      donationId,
      ewalletType,
      userId: req.user?.id,
    });

    res.status(201).json({
      message: 'E-wallet payment created successfully',
      payment: payment.toJSON(),
    });
  } catch (error: any) {
    logger.error(
      { err: error, userId: req.user?.id, body: req.body },
      'Error creating e-wallet payment'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get payment status
 */
export const getPaymentStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const payment = await paymentService.getPaymentStatus(id);
    if (!payment) {
      res.status(404).json({ message: 'Payment not found' });
      return;
    }

    // Check authorization - user can only see their own payments or admins can see all
    const donation = await Donation.findByPk(payment.donationId);
    if (
      donation?.userId &&
      donation.userId !== req.user?.id &&
      req.user?.role !== 'ADMIN'
    ) {
      res.status(403).json({ message: 'Not authorized to view this payment' });
      return;
    }

    res.json({ payment: payment.toJSON() });
  } catch (error: any) {
    logger.error(
      { err: error, paymentId: req.params.id, userId: req.user?.id },
      'Error getting payment status'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Cancel a payment
 */
export const cancelPayment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const payment = await Payment.findByPk(id);
    if (!payment) {
      res.status(404).json({ message: 'Payment not found' });
      return;
    }

    // Check authorization
    const donation = await Donation.findByPk(payment.donationId);
    if (
      donation?.userId &&
      donation.userId !== req.user?.id &&
      req.user?.role !== 'ADMIN'
    ) {
      res
        .status(403)
        .json({ message: 'Not authorized to cancel this payment' });
      return;
    }

    if (payment.status === PaymentStatus.PAID) {
      res.status(400).json({ message: 'Cannot cancel a paid payment' });
      return;
    }

    const cancelledPayment = await paymentService.cancelPayment(id);

    logger.info('Payment cancelled', { paymentId: id, userId: req.user?.id });

    res.json({
      message: 'Payment cancelled successfully',
      payment: cancelledPayment?.toJSON(),
    });
  } catch (error: any) {
    logger.error(
      { err: error, paymentId: req.params.id, userId: req.user?.id },
      'Error cancelling payment'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get user's payments
 */
export const getMyPayments = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;

    const { status, method } = req.query;
    const whereClause: any = {};

    if (
      status &&
      Object.values(PaymentStatus).includes(status as PaymentStatus)
    ) {
      whereClause.status = status;
    }

    if (
      method &&
      Object.values(PaymentMethod).includes(method as PaymentMethod)
    ) {
      whereClause.method = method;
    }

    // Get donations by user first, then find payments
    const userDonations = await Donation.findAll({
      where: { userId: req.user?.id },
      attributes: ['id'],
    });

    const donationIds = userDonations.map(d => d.id);

    const { count, rows: payments } = await Payment.findAndCountAll({
      where: {
        donationId: donationIds,
        ...whereClause,
      },
      include: [
        {
          model: Donation,
          as: 'donation',
          include: [
            {
              model: require('../models').Project,
              as: 'project',
              attributes: ['id', 'title'],
            },
          ],
        },
      ],
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      payments: payments.map(p => p.toJSON()),
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: count,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error: any) {
    logger.error(
      { err: error, userId: req.user?.id },
      'Error getting user payments'
    );
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get available payment methods
 */
export const getPaymentMethods = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const paymentMethods = {
      invoice: {
        name: 'Invoice',
        description:
          'Pay via bank transfer, credit card, e-wallet, or retail outlet',
        supportedMethods: [
          'BANK_TRANSFER',
          'CREDIT_CARD',
          'EWALLET',
          'RETAIL_OUTLET',
        ],
      },
      virtualAccount: {
        name: 'Virtual Account',
        description: 'Pay via bank transfer using virtual account number',
        supportedBanks: Object.keys(SUPPORTED_VA_BANKS),
      },
      ewallet: {
        name: 'E-Wallet',
        description: 'Pay using digital wallet',
        supportedTypes: Object.keys(SUPPORTED_EWALLETS),
      },
    };

    res.json({ paymentMethods });
  } catch (error: any) {
    logger.error({ err: error }, 'Error getting payment methods');
    res.status(500).json({ message: 'Internal server error' });
  }
};
