# Xendit Payment Sample Flows

This document provides comprehensive examples of payment flows using the enhanced Xendit integration with retry logic, settlement handling, and reconciliation.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Invoice Payment Flow](#invoice-payment-flow)
- [Virtual Account Payment Flow](#virtual-account-payment-flow)
- [E-wallet Payment Flow](#e-wallet-payment-flow)
- [Retry Logic Examples](#retry-logic-examples)
- [Settlement Handling](#settlement-handling)
- [Reconciliation Examples](#reconciliation-examples)
- [Error Handling](#error-handling)

## Prerequisites

### Environment Variables
```bash
# Xendit Configuration
XENDIT_SECRET_KEY=xnd_test_your_secret_key_here
XENDIT_PUBLIC_KEY=xnd_public_test_your_public_key_here
XENDIT_CALLBACK_URL=https://yourdomain.com/api/payments/webhook
XENDIT_WEBHOOK_TOKEN=your_webhook_verification_token_here

# Frontend URLs for redirects
FRONTEND_URL=https://yourfrontend.com

# Payment Configuration
DEFAULT_PAYMENT_EXPIRY_HOURS=24
DEFAULT_INVOICE_DURATION_SECONDS=86400
```

### Test Credentials
For testing, use Xendit's test environment credentials:
- Secret Key: `xnd_test_...`
- Use test credit card numbers provided by Xendit
- Use test virtual account numbers
- Test webhooks with ngrok for local development

## Invoice Payment Flow

### 1. Create Invoice Payment

**Request:**
```bash
curl -X POST http://localhost:3000/api/payments/invoice \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "donationId": "01HZAB123456789012345678CD",
    "description": "Donation to Save the Ocean Project",
    "payerEmail": "donor@example.com",
    "paymentMethods": ["BANK_TRANSFER", "CREDIT_CARD", "EWALLET"]
  }'
```

**Response:**
```json
{
  "message": "Invoice payment created successfully",
  "payment": {
    "id": "01HZAB123456789012345678CD",
    "donationId": "01HZAB123456789012345678CD",
    "method": "INVOICE",
    "status": "PENDING",
    "paymentUrl": "https://checkout.xendit.co/web/invoice_abc123",
    "expiredAt": "2025-01-02T10:00:00Z",
    "amount": 100000,
    "currency": "IDR"
  }
}
```

### 2. Customer Payment Process

1. **Redirect customer** to `paymentUrl`
2. **Customer selects** payment method (bank transfer, credit card, e-wallet)
3. **Customer completes** payment using chosen method
4. **Xendit processes** payment and sends webhook
5. **System updates** payment status automatically

### 3. Webhook Processing

When payment is completed, Xendit sends a webhook:

```json
{
  "id": "webhook_12345",
  "external_id": "donation-01HZAB123456789012345678CD-ulid123",
  "user_id": "xendit_user_id",
  "payment_method": "BANK_TRANSFER",
  "status": "PAID",
  "amount": 100000,
  "paid_amount": 100000,
  "bank_code": "BCA",
  "paid_at": "2025-01-01T12:00:00Z",
  "payer_email": "donor@example.com",
  "description": "Donation to Save the Ocean Project",
  "adjusted_received_amount": 100000,
  "fees_paid_amount": 2500,
  "settlement_id": "settlement_123",
  "settlement_date": "2025-01-02T12:00:00Z"
}
```

## Virtual Account Payment Flow

### 1. Create Virtual Account Payment

**Request:**
```bash
curl -X POST http://localhost:3000/api/payments/virtual-account \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "donationId": "01HZAB123456789012345678CD",
    "bankCode": "BCA",
    "customerName": "John Doe"
  }'
```

**Response:**
```json
{
  "message": "Virtual account payment created successfully",
  "payment": {
    "id": "01HZAB123456789012345678CD",
    "method": "VIRTUAL_ACCOUNT",
    "status": "PENDING",
    "virtualAccount": {
      "bankCode": "BCA",
      "accountNumber": "8808123456789"
    },
    "amount": 100000,
    "expiredAt": "2025-01-02T10:00:00Z"
  }
}
```

### 2. Customer Payment Instructions

Provide customer with:
- **Bank**: BCA
- **Account Number**: 8808123456789
- **Amount**: Rp 100,000
- **Expiry**: 24 hours from creation

### 3. Payment Confirmation

Customer transfers exact amount to the virtual account. Xendit automatically:
1. **Detects payment** within minutes
2. **Sends webhook** with PAID status
3. **Updates payment** status in your system
4. **Increases project** funding amount

## E-wallet Payment Flow

### 1. Create E-wallet Payment

**Request:**
```bash
curl -X POST http://localhost:3000/api/payments/ewallet \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "donationId": "01HZAB123456789012345678CD",
    "ewalletType": "DANA",
    "phone": "08123456789",
    "redirectUrl": "https://yourapp.com/payment/success"
  }'
```

**Response:**
```json
{
  "message": "E-wallet payment created successfully",
  "payment": {
    "id": "01HZAB123456789012345678CD",
    "method": "EWALLET",
    "status": "PENDING",
    "paymentUrl": "https://checkout.xendit.co/web/ewallet_xyz789",
    "ewalletType": "DANA",
    "expiredAt": "2025-01-01T10:15:00Z"
  }
}
```

### 2. Customer Payment Process

1. **Redirect customer** to `paymentUrl`
2. **Customer logs in** to their DANA app
3. **Customer confirms** payment in app
4. **System receives** webhook immediately
5. **Payment status** updated to PAID

## Retry Logic Examples

The enhanced payment service automatically retries failed operations:

### Retry Configuration
```typescript
const retryOptions = {
  maxAttempts: 3,
  backoffMs: 1000,
  backoffMultiplier: 2
}
```

### Example Retry Scenarios

#### 1. Network Timeout
```
Attempt 1: Failed (timeout) - retry in 1000ms
Attempt 2: Failed (timeout) - retry in 2000ms  
Attempt 3: Success
```

#### 2. Temporary Xendit API Error
```
Attempt 1: Failed (500 error) - retry in 1000ms
Attempt 2: Success
```

#### 3. Non-Retryable Error
```
Attempt 1: Failed (400 validation error) - no retry
Result: Error thrown immediately
```

### Monitoring Retry Logic

Check logs for retry patterns:

```json
{
  "level": "warn",
  "message": "createInvoice failed on attempt 1/3",
  "error": "Request timeout",
  "attempt": 1,
  "maxAttempts": 3
}
```

## Settlement Handling

When payments are settled (usually next business day), additional webhook is sent:

### Settlement Webhook Example

```json
{
  "id": "webhook_settlement_123",
  "external_id": "donation-01HZAB123456789012345678CD-ulid123",
  "status": "SETTLED",
  "amount": 100000,
  "fees_paid_amount": 2500,
  "adjusted_received_amount": 97500,
  "settlement_id": "settlement_20250102_123",
  "settlement_date": "2025-01-02T12:00:00Z",
  "settlement_bank_account": "BCA_1234567890"
}
```

### Settlement Data Processing

The system automatically:
1. **Records settlement** data in payment record
2. **Calculates net amount** after fees
3. **Updates accounting** records
4. **Triggers payout** processes (if configured)

```typescript
const settlementData = {
  settlementId: "settlement_20250102_123",
  settlementDate: new Date("2025-01-02T12:00:00Z"),
  feeAmount: 2500,
  netAmount: 97500,
  bankAccount: "BCA_1234567890"
}
```

## Reconciliation Examples

### Automatic Reconciliation Schedule

The system runs automatic reconciliation jobs:

- **Incremental**: Every 30 minutes (last 2 hours)
- **Full**: Daily at 2 AM (last 30 days)
- **Expired**: Every hour
- **Report**: Weekly on Mondays at 8 AM

### Manual Reconciliation

#### 1. Run Full Reconciliation

**Request:**
```bash
curl -X POST http://localhost:3000/api/admin/reconciliation/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -d '{
    "type": "full"
  }'
```

**Response:**
```json
{
  "message": "Reconciliation completed successfully",
  "result": {
    "totalChecked": 150,
    "totalUpdated": 12,
    "statusUpdates": {
      "PAID": 8,
      "EXPIRED": 3,
      "FAILED": 1
    },
    "errors": [],
    "executionTime": 2500
  }
}
```

#### 2. Reconcile Specific Payments

**Request:**
```bash
curl -X POST http://localhost:3000/api/admin/reconciliation/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -d '{
    "paymentIds": [
      "01HZAB123456789012345678CD",
      "01HZAB123456789012345678CE",
      "01HZAB123456789012345678CF"
    ]
  }'
```

#### 3. Generate Reconciliation Report

**Request:**
```bash
curl -X GET "http://localhost:3000/api/admin/reconciliation/report?days=7" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

**Response:**
```json
{
  "message": "Reconciliation report generated successfully",
  "report": {
    "summary": {
      "totalPayments": 245,
      "byStatus": {
        "PAID": 180,
        "PENDING": 45,
        "EXPIRED": 15,
        "FAILED": 5
      },
      "byMethod": {
        "INVOICE": 120,
        "VIRTUAL_ACCOUNT": 80,
        "EWALLET": 45
      }
    },
    "issues": {
      "longPendingPayments": [
        {
          "id": "01HZAB123456789012345678CD",
          "externalId": "donation-123-456",
          "daysPending": 3
        }
      ],
      "failedPayments": [
        {
          "id": "01HZAB123456789012345678CE",
          "externalId": "donation-123-457",
          "failureCode": "INSUFFICIENT_BALANCE"
        }
      ]
    }
  },
  "period": {
    "days": 7,
    "fromDate": "2024-12-25T00:00:00Z",
    "toDate": "2025-01-01T00:00:00Z"
  }
}
```

## Error Handling

### Common Error Scenarios and Solutions

#### 1. Payment Gateway Timeout
```json
{
  "status": 500,
  "message": "Payment gateway error: Request timeout"
}
```
**Solution**: Automatic retry with exponential backoff

#### 2. Invalid Payment Amount
```json
{
  "status": 400,
  "message": "Amount must be between 1,000 and 1,000,000,000 IDR"
}
```
**Solution**: Validate amount before API call

#### 3. Expired Payment
```json
{
  "status": 400,
  "message": "Cannot process expired payment"
}
```
**Solution**: Check expiry before processing, run expired payment job

#### 4. Duplicate Webhook
```json
{
  "level": "info",
  "message": "Webhook already processed",
  "webhookId": "webhook_123",
  "paymentId": "payment_456"
}
```
**Solution**: Idempotent webhook processing prevents duplicates

### Production Monitoring

Monitor these metrics in production:

1. **Payment Success Rate**: `PAID / (PAID + FAILED + EXPIRED)`
2. **Average Processing Time**: Time from creation to PAID status
3. **Retry Rate**: Percentage of operations that required retries
4. **Settlement Accuracy**: Reconciliation of settled vs recorded amounts
5. **Webhook Latency**: Time from payment to webhook receipt

### Logging Examples

#### Success Log
```json
{
  "level": "info",
  "message": "Invoice payment created successfully",
  "paymentId": "01HZAB123456789012345678CD",
  "xenditId": "inv_12345",
  "amount": 100000,
  "method": "INVOICE"
}
```

#### Error Log
```json
{
  "level": "error",
  "message": "Xendit invoice creation failed",
  "error": "Invalid API key",
  "externalId": "donation-123-456",
  "amount": 100000
}
```

#### Reconciliation Log
```json
{
  "level": "info",
  "message": "Payment status reconciled",
  "paymentId": "01HZAB123456789012345678CD",
  "oldStatus": "PENDING",
  "newStatus": "PAID",
  "source": "reconciliation-job"
}
```

## Testing Checklist

### Integration Testing
- [ ] Invoice payment creation and completion
- [ ] Virtual account payment flow
- [ ] E-wallet payment with redirects
- [ ] Webhook signature verification
- [ ] Retry logic on API failures
- [ ] Settlement data processing
- [ ] Reconciliation job execution
- [ ] Expired payment handling

### Performance Testing
- [ ] Concurrent payment creation
- [ ] Webhook processing under load
- [ ] Reconciliation job performance
- [ ] Database query optimization

### Security Testing
- [ ] Webhook signature validation
- [ ] JWT token verification
- [ ] Admin endpoint authorization
- [ ] Input validation and sanitization
- [ ] Rate limiting effectiveness

## Deployment Notes

### Production Checklist
1. **Update environment variables** to production values
2. **Configure webhook URLs** in Xendit dashboard
3. **Set up monitoring** for payment metrics
4. **Configure log aggregation** for payment events
5. **Test reconciliation jobs** in staging
6. **Set up alerts** for failed payments and reconciliation issues
7. **Document operational procedures** for payment issues

### Monitoring Setup
```bash
# Example monitoring queries
# Payment success rate in last 24h
SELECT 
  status,
  COUNT(*) as count,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
FROM payments 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY status;

# Average payment processing time
SELECT 
  method,
  AVG(EXTRACT(EPOCH FROM (paid_at - created_at))/60) as avg_minutes
FROM payments 
WHERE status = 'PAID' 
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY method;
```

This comprehensive guide covers all aspects of the enhanced Xendit integration with real-world examples and production considerations.