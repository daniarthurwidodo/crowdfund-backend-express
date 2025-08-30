# Payment Module Documentation

This document provides comprehensive information about the payment module integration with Xendit for the crowdfunding platform.

## Overview

The payment module provides a complete payment processing system that supports multiple payment methods through Xendit's payment gateway:

- **Invoice Payments**: Multi-method payments (bank transfer, credit card, e-wallet, retail outlets)
- **Virtual Account**: Direct bank transfer with unique account numbers
- **E-wallet**: Digital wallet payments (DANA, OVO, LinkAja, ShopeePay)
- **Webhook Processing**: Real-time payment status updates

## Architecture

### Database Schema

#### Payments Table
- `id` - ULID primary key
- `donation_id` - Reference to donations table
- `external_id` - Unique identifier for Xendit
- `xendit_id` - Xendit's internal payment ID
- `amount` - Payment amount in IDR (smallest unit)
- `currency` - Always 'IDR'
- `method` - Payment method (INVOICE, VIRTUAL_ACCOUNT, EWALLET, CARD)
- `status` - Payment status (PENDING, PAID, EXPIRED, FAILED, CANCELLED)
- `payment_url` - Checkout URL for invoice/e-wallet payments
- `virtual_account` - JSON object with bank code and account number
- `ewallet_type` - E-wallet provider type
- `paid_at` - Payment completion timestamp
- `expired_at` - Payment expiry timestamp
- `failure_code` - Error code for failed payments
- `webhook_data` - JSON object with webhook payload
- Timestamps: `created_at`, `updated_at`

#### Updated Donations Table
- Added `payment_status` - Current payment status
- Added `payment_method` - Preferred payment method

### Service Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Controllers   │ => │  Payment Service │ => │   Xendit SDK    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         v                        v                        v
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Validation    │    │   Database       │    │   Xendit API    │
│   (Joi)         │    │   (Sequelize)    │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Environment Variables

Add these variables to your `.env` file:

```bash
# Xendit Configuration
XENDIT_SECRET_KEY=xnd_test_your_secret_key_here
XENDIT_PUBLIC_KEY=xnd_public_test_your_public_key_here
XENDIT_CALLBACK_URL=http://localhost:3000/api/payments/webhook
XENDIT_WEBHOOK_TOKEN=your_webhook_verification_token_here

# Payment Configuration
DEFAULT_PAYMENT_EXPIRY_HOURS=24
DEFAULT_INVOICE_DURATION_SECONDS=86400
```

### Obtaining Xendit Credentials

1. Sign up for a Xendit account at [https://xendit.co](https://xendit.co)
2. Go to Settings > API Keys in your dashboard
3. Copy your test/live secret key
4. Set up webhook URL in Settings > Webhooks
5. Generate a webhook token for verification

## API Endpoints

### Payment Methods

#### GET `/api/payments/methods`
Get available payment methods and configurations.

**Response:**
```json
{
  "paymentMethods": {
    "invoice": {
      "name": "Invoice",
      "description": "Pay via bank transfer, credit card, e-wallet, or retail outlet",
      "supportedMethods": ["BANK_TRANSFER", "CREDIT_CARD", "EWALLET", "RETAIL_OUTLET"]
    },
    "virtualAccount": {
      "name": "Virtual Account",
      "description": "Pay via bank transfer using virtual account number",
      "supportedBanks": ["BCA", "BNI", "BRI", "PERMATA", "MANDIRI"]
    },
    "ewallet": {
      "name": "E-Wallet",
      "description": "Pay using digital wallet",
      "supportedTypes": ["DANA", "OVO", "LINKAJA", "SHOPEEPAY"]
    }
  }
}
```

### Create Payments

#### POST `/api/payments/invoice`
Create an invoice payment with multiple payment options.

**Request:**
```json
{
  "donationId": "01234567890123456789012345",
  "description": "Donation payment",
  "payerEmail": "donor@example.com",
  "paymentMethods": ["BANK_TRANSFER", "CREDIT_CARD"]
}
```

**Response:**
```json
{
  "message": "Invoice payment created successfully",
  "payment": {
    "id": "01234567890123456789012345",
    "donationId": "01234567890123456789012345",
    "method": "INVOICE",
    "status": "PENDING",
    "paymentUrl": "https://checkout.xendit.co/web/invoice_123",
    "expiredAt": "2023-12-02T10:00:00Z"
  }
}
```

#### POST `/api/payments/virtual-account`
Create a virtual account payment for direct bank transfer.

**Request:**
```json
{
  "donationId": "01234567890123456789012345",
  "bankCode": "BCA",
  "customerName": "John Doe"
}
```

**Response:**
```json
{
  "message": "Virtual account payment created successfully",
  "payment": {
    "id": "01234567890123456789012345",
    "method": "VIRTUAL_ACCOUNT",
    "status": "PENDING",
    "virtualAccount": {
      "bankCode": "BCA",
      "accountNumber": "8808123456789"
    },
    "expiredAt": "2023-12-02T10:00:00Z"
  }
}
```

#### POST `/api/payments/ewallet`
Create an e-wallet payment.

**Request:**
```json
{
  "donationId": "01234567890123456789012345",
  "ewalletType": "DANA",
  "phone": "08123456789",
  "redirectUrl": "https://yourapp.com/success"
}
```

### Payment Management

#### GET `/api/payments/:id/status`
Get current payment status with real-time updates from Xendit.

#### POST `/api/payments/:id/cancel`
Cancel a pending payment.

#### GET `/api/payments/my`
Get user's payments with pagination and filtering.

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10, max: 50)
- `status` - Filter by status (PENDING, PAID, EXPIRED, FAILED, CANCELLED)
- `method` - Filter by method (INVOICE, VIRTUAL_ACCOUNT, EWALLET, CARD)

### Webhooks

#### POST `/api/payments/webhook`
Xendit webhook endpoint for payment status updates.

**Headers:**
- `x-callback-token` - Webhook verification token

This endpoint is called by Xendit when payment status changes and automatically updates the payment and donation status in your database.

## Payment Flow

### 1. Create Donation
```javascript
// User creates a donation
const donation = await Donation.create({
  amount: 100000, // IDR 100,000
  projectId: 'project123',
  userId: 'user123',
  paymentStatus: 'PENDING'
});
```

### 2. Create Payment
```javascript
// Create payment method (example: Invoice)
const payment = await paymentService.createInvoice(donation.id, {
  description: 'Donation to Project ABC',
  payerEmail: 'donor@example.com',
  paymentMethods: ['BANK_TRANSFER', 'CREDIT_CARD']
});
```

### 3. Payment Processing
- User pays via the provided payment URL or virtual account
- Xendit processes the payment
- Webhook is called to update payment status
- Donation status is automatically updated
- Project funding amount is incremented

### 4. Status Updates
- `PENDING` → `PAID` (successful payment)
- `PENDING` → `EXPIRED` (payment expired)
- `PENDING` → `FAILED` (payment failed)
- `PENDING` → `CANCELLED` (manually cancelled)

## Testing

### Unit Tests
Run payment-specific tests:
```bash
npm test -- --testPathPatterns="payment"
```

### Integration Testing with Postman
1. Import the Postman collection: `postman/Payment_APIs.postman_collection.json`
2. Set up environment variables:
   - `baseUrl`: Your server URL
   - `authToken`: Valid JWT token
   - `donationId`: Valid donation ID
   - `xenditWebhookToken`: Your webhook token

### Testing with Xendit Sandbox

1. **Use Test Credentials**: Ensure you're using `xnd_test_` prefixed keys
2. **Test Payment Methods**:
   - Use test credit card numbers provided by Xendit
   - Use test virtual account numbers
   - Test e-wallet flows in sandbox mode

3. **Webhook Testing**:
   - Use ngrok to expose your local server
   - Configure webhook URL in Xendit dashboard
   - Test payment status transitions

### Mock Webhook Testing (Development)
```bash
curl -X POST http://localhost:3000/api/payments/webhook/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "external_id": "donation-123-456",
    "status": "PAID",
    "amount": 100000
  }'
```

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "message": "Validation error: donation ID must be 26 characters long"
}
```

#### 404 Not Found
```json
{
  "message": "Donation not found"
}
```

#### 409 Conflict
```json
{
  "message": "Payment already exists for this donation",
  "payment": { ... }
}
```

### Webhook Error Handling
- Invalid signatures return 401 Unauthorized
- Missing payments are handled gracefully (200 OK)
- Processing errors return 500 for retry by Xendit

## Security Considerations

### Webhook Verification
All webhooks are verified using HMAC SHA256 signature:
```javascript
const expectedSignature = crypto
  .HmacSHA256(payload, XENDIT_WEBHOOK_TOKEN)
  .toString();
```

### Authorization
- Users can only create payments for their own donations
- Admins can access all payments
- Payment status can only be updated via verified webhooks

### Data Validation
- All input is validated using Joi schemas
- Payment amounts have minimum/maximum limits
- Phone numbers validated for Indonesian format

## Monitoring and Logging

### Structured Logging
All payment operations are logged with correlation IDs:
```javascript
logger.info('Payment created', {
  paymentId: payment.id,
  donationId: donation.id,
  method: 'INVOICE',
  amount: payment.amount,
  userId: user.id
});
```

### Webhook Logs
Webhook processing includes detailed logging:
- Signature verification results
- Payload validation
- Processing outcomes
- Error details for failed webhooks

## Deployment Considerations

### Production Environment Variables
```bash
# Use live credentials
XENDIT_SECRET_KEY=xnd_production_your_live_secret_key
XENDIT_CALLBACK_URL=https://yourdomain.com/api/payments/webhook

# Secure webhook token
XENDIT_WEBHOOK_TOKEN=your_production_webhook_token

# Optimize payment expiry
DEFAULT_PAYMENT_EXPIRY_HOURS=24
```

### Database Indexes
The payment table includes indexes for optimal performance:
- `donation_id` (foreign key)
- `external_id` (webhook lookups)
- `status` (filtering)
- `created_at` (sorting)

### Webhook Reliability
- Webhooks are idempotent (safe to process multiple times)
- Failed webhooks are automatically retried by Xendit
- Use appropriate HTTP status codes for retry behavior

## Troubleshooting

### Common Issues

1. **"Missing required environment variables"**
   - Ensure all Xendit environment variables are set
   - Check for typos in variable names

2. **"Invalid signature" on webhooks**
   - Verify webhook token matches Xendit dashboard
   - Check that request body is parsed as raw JSON

3. **"Payment already exists"**
   - Each donation can only have one active payment
   - Cancel existing payment before creating new one

4. **"Donation not found"**
   - Ensure donation ID is valid 26-character ULID
   - Check that donation exists and is accessible to user

### Debug Mode
Enable debug logging in development:
```bash
LOG_LEVEL=debug
```

This provides detailed information about:
- Payment service operations
- Xendit API calls
- Webhook processing
- Database transactions

## Support

For issues related to:
- **Xendit Integration**: Check Xendit documentation and support
- **Payment Module**: Review logs and error messages
- **Database Issues**: Check Sequelize logs and migrations

Remember to never log sensitive information like webhook tokens or payment details in production environments.