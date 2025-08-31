import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleAuth';
import {
  createInvoice,
  createVirtualAccount,
  createEwallet,
  getPaymentStatus,
  cancelPayment,
  getMyPayments,
  getPaymentMethods,
} from '../controllers/paymentController';
import {
  handleXenditWebhook,
  testWebhook,
  getWebhookLogs,
} from '../controllers/webhookController';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Payment:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Payment ID
 *         donationId:
 *           type: string
 *           description: Associated donation ID
 *         externalId:
 *           type: string
 *           description: External payment ID for Xendit
 *         xenditId:
 *           type: string
 *           description: Xendit internal payment ID
 *         amount:
 *           type: number
 *           description: Payment amount in IDR
 *         currency:
 *           type: string
 *           default: IDR
 *         method:
 *           type: string
 *           enum: [INVOICE, VIRTUAL_ACCOUNT, EWALLET, CARD]
 *         status:
 *           type: string
 *           enum: [PENDING, PAID, EXPIRED, FAILED, CANCELLED]
 *         paymentUrl:
 *           type: string
 *           description: Payment URL for invoice or e-wallet
 *         virtualAccount:
 *           type: object
 *           properties:
 *             bankCode:
 *               type: string
 *             accountNumber:
 *               type: string
 *         ewalletType:
 *           type: string
 *           enum: [DANA, OVO, LINKAJA, SHOPEEPAY]
 *         paidAt:
 *           type: string
 *           format: date-time
 *         expiredAt:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/payments/methods:
 *   get:
 *     summary: Get available payment methods
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Available payment methods
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 paymentMethods:
 *                   type: object
 *                   properties:
 *                     invoice:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                         description:
 *                           type: string
 *                         supportedMethods:
 *                           type: array
 *                           items:
 *                             type: string
 *                     virtualAccount:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                         description:
 *                           type: string
 *                         supportedBanks:
 *                           type: array
 *                           items:
 *                             type: string
 *                     ewallet:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                         description:
 *                           type: string
 *                         supportedTypes:
 *                           type: array
 *                           items:
 *                             type: string
 */
router.get('/methods', getPaymentMethods);

/**
 * @swagger
 * /api/payments/invoice:
 *   post:
 *     summary: Create an invoice payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - donationId
 *               - description
 *             properties:
 *               donationId:
 *                 type: string
 *                 description: Donation ID to create payment for
 *               payerEmail:
 *                 type: string
 *                 format: email
 *                 description: Payer email address
 *               description:
 *                 type: string
 *                 description: Payment description
 *               paymentMethods:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [BANK_TRANSFER, CREDIT_CARD, EWALLET, RETAIL_OUTLET]
 *                 description: Allowed payment methods for the invoice
 *     responses:
 *       201:
 *         description: Invoice payment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 payment:
 *                   $ref: '#/components/schemas/Payment'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Donation not found
 *       409:
 *         description: Payment already exists
 */
router.post('/invoice', authenticateToken, createInvoice);

/**
 * @swagger
 * /api/payments/virtual-account:
 *   post:
 *     summary: Create a virtual account payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - donationId
 *               - bankCode
 *               - customerName
 *             properties:
 *               donationId:
 *                 type: string
 *                 description: Donation ID to create payment for
 *               bankCode:
 *                 type: string
 *                 enum: [BCA, BNI, BRI, PERMATA, MANDIRI]
 *                 description: Bank code for virtual account
 *               customerName:
 *                 type: string
 *                 description: Customer name for virtual account
 *     responses:
 *       201:
 *         description: Virtual account payment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 payment:
 *                   $ref: '#/components/schemas/Payment'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Donation not found
 *       409:
 *         description: Payment already exists
 */
router.post('/virtual-account', authenticateToken, createVirtualAccount);

/**
 * @swagger
 * /api/payments/ewallet:
 *   post:
 *     summary: Create an e-wallet payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - donationId
 *               - ewalletType
 *             properties:
 *               donationId:
 *                 type: string
 *                 description: Donation ID to create payment for
 *               ewalletType:
 *                 type: string
 *                 enum: [DANA, OVO, LINKAJA, SHOPEEPAY]
 *                 description: E-wallet type
 *               phone:
 *                 type: string
 *                 description: Phone number (Indonesian format)
 *               redirectUrl:
 *                 type: string
 *                 format: uri
 *                 description: URL to redirect after payment
 *     responses:
 *       201:
 *         description: E-wallet payment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 payment:
 *                   $ref: '#/components/schemas/Payment'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Donation not found
 *       409:
 *         description: Payment already exists
 */
router.post('/ewallet', authenticateToken, createEwallet);

/**
 * @swagger
 * /api/payments/my:
 *   get:
 *     summary: Get current user's payments
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PAID, EXPIRED, FAILED, CANCELLED]
 *       - in: query
 *         name: method
 *         schema:
 *           type: string
 *           enum: [INVOICE, VIRTUAL_ACCOUNT, EWALLET, CARD]
 *     responses:
 *       200:
 *         description: User's payments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 payments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Payment'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalItems:
 *                       type: integer
 *                     hasNext:
 *                       type: boolean
 *                     hasPrev:
 *                       type: boolean
 *       401:
 *         description: Unauthorized
 */
router.get('/my', authenticateToken, getMyPayments);

/**
 * @swagger
 * /api/payments/{id}/status:
 *   get:
 *     summary: Get payment status
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Payment status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 payment:
 *                   $ref: '#/components/schemas/Payment'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to view this payment
 *       404:
 *         description: Payment not found
 */
router.get('/:id/status', authenticateToken, getPaymentStatus);

/**
 * @swagger
 * /api/payments/{id}/cancel:
 *   post:
 *     summary: Cancel a payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Payment cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 payment:
 *                   $ref: '#/components/schemas/Payment'
 *       400:
 *         description: Cannot cancel paid payment
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to cancel this payment
 *       404:
 *         description: Payment not found
 */
router.post('/:id/cancel', authenticateToken, cancelPayment);

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     summary: Handle Xendit webhook
 *     tags: [Payments]
 *     description: Webhook endpoint for Xendit payment notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               external_id:
 *                 type: string
 *               status:
 *                 type: string
 *               payment_method:
 *                 type: string
 *               amount:
 *                 type: number
 *               paid_at:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid webhook payload
 *       401:
 *         description: Invalid signature
 *       500:
 *         description: Internal error processing webhook
 */
router.post('/webhook', handleXenditWebhook);

/**
 * @swagger
 * /api/payments/webhook/test:
 *   post:
 *     summary: Test webhook endpoint (development only)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               external_id:
 *                 type: string
 *               status:
 *                 type: string
 *               payment_method:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Test webhook processed successfully
 *       404:
 *         description: Not available in production
 *       500:
 *         description: Error processing test webhook
 */
router.post('/webhook/test', authenticateToken, testWebhook);

/**
 * @swagger
 * /api/payments/webhook/logs:
 *   get:
 *     summary: Get webhook logs (admin only)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Webhook logs
 *       403:
 *         description: Admin access required
 */
router.get('/webhook/logs', authenticateToken, requireAdmin, getWebhookLogs);

export default router;
