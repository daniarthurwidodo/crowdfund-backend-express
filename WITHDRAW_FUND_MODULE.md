# Withdraw Fund Module Documentation

This document provides comprehensive information about the withdrawal fund module that allows project fundraisers to withdraw collected funds from their crowdfunding campaigns.

## Overview

The withdraw fund module provides a complete withdrawal management system that supports:

- **Eligibility Checking**: Automatic validation of withdrawal eligibility
- **Multiple Withdrawal Methods**: Bank transfer, Xendit disbursement, and manual processing
- **Admin Approval Workflow**: Multi-stage approval process with admin oversight
- **Automated Processing**: Integration with Xendit for automated disbursements
- **Fee Management**: Transparent processing fee calculation and deduction
- **Audit Trail**: Complete transaction history and status tracking
- **Webhook Processing**: Real-time status updates from payment processors

## Architecture

### Database Schema

#### Withdrawals Table
- `id` - ULID primary key
- `userId` - Reference to users table (project owner)
- `projectId` - Reference to projects table
- `amount` - Withdrawal amount in smallest currency unit
- `availableAmount` - Available amount at time of request
- `currency` - Currency code (default: IDR)
- `method` - Withdrawal method (BANK_TRANSFER, XENDIT_DISBURSEMENT, MANUAL)
- `status` - Current status (PENDING, PROCESSING, APPROVED, REJECTED, COMPLETED, FAILED, CANCELLED)
- `requestedAt` - When withdrawal was requested
- `approvedAt` - When withdrawal was approved by admin
- `processedAt` - When withdrawal processing started
- `completedAt` - When withdrawal was completed
- `rejectedAt` - When withdrawal was rejected
- `reason` - Reason for withdrawal request
- `adminNotes` - Admin notes for approval/rejection
- **Bank Details**: `bankName`, `bankCode`, `accountNumber`, `accountHolderName`
- **Xendit Details**: `xenditDisbursementId`, `disbursementData`
- **Fee Details**: `processingFee`, `netAmount`
- **Audit Fields**: `approvedBy`, `processedBy`, `rejectedBy`
- Timestamps: `createdAt`, `updatedAt`

### Service Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Controllers   │ => │ Withdraw Service │ => │   Xendit SDK    │
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
# Xendit Configuration (for disbursements)
XENDIT_SECRET_KEY=xnd_test_your_secret_key_here
XENDIT_PUBLIC_KEY=xnd_public_test_your_public_key_here
XENDIT_CALLBACK_URL=http://localhost:3000/api/withdrawals/webhook/xendit

# Frontend URLs for notifications
FRONTEND_URL=http://localhost:3000

# Withdrawal Configuration
MINIMUM_WITHDRAWAL_AMOUNT=10000
MAXIMUM_WITHDRAWAL_AMOUNT=100000000000
DEFAULT_PROCESSING_FEE_RATE=0.005
```

## API Endpoints

### User Endpoints

#### GET `/api/withdrawals/eligibility/:projectId`
Check withdrawal eligibility for a project.

**Response:**
```json
{
  "message": "Eligibility check completed",
  "eligibility": {
    "eligible": true,
    "availableAmount": 500000,
    "totalRaised": 1000000,
    "pendingWithdrawals": 0
  }
}
```

#### POST `/api/withdrawals`
Create a new withdrawal request.

**Request:**
```json
{
  "projectId": "01HZAB123456789012345678CD",
  "amount": 100000,
  "method": "BANK_TRANSFER",
  "reason": "Project completion withdrawal",
  "bankAccount": {
    "bankName": "Bank BCA",
    "bankCode": "BCA",
    "accountNumber": "1234567890",
    "accountHolderName": "John Doe"
  }
}
```

**Response:**
```json
{
  "message": "Withdrawal request created successfully",
  "withdrawal": {
    "id": "01HZAB123456789012345678CD",
    "projectId": "01HZAB123456789012345678CD",
    "amount": 100000,
    "status": "PENDING",
    "method": "BANK_TRANSFER",
    "processingFee": 2500,
    "netAmount": 97500,
    "requestedAt": "2025-01-01T10:00:00Z"
  }
}
```

#### GET `/api/withdrawals/my`
Get user's withdrawal requests with pagination.

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10, max: 50)
- `status` - Filter by status
- `projectId` - Filter by project ID

#### GET `/api/withdrawals/:id`
Get detailed withdrawal information.

#### POST `/api/withdrawals/:id/cancel`
Cancel a pending withdrawal request.

#### GET `/api/withdrawals/project/:projectId/stats`
Get withdrawal statistics for a project.

**Response:**
```json
{
  "message": "Project withdrawal statistics retrieved successfully",
  "projectId": "01HZAB123456789012345678CD",
  "stats": {
    "totalRequested": 500000,
    "totalCompleted": 300000,
    "totalPending": 100000,
    "availableAmount": 100000,
    "totalFees": 15000
  }
}
```

### Admin Endpoints

#### GET `/api/withdrawals/admin/pending`
Get pending withdrawal requests for admin review.

**Query Parameters:**
- `page` - Page number
- `limit` - Items per page
- `method` - Filter by withdrawal method

#### POST `/api/withdrawals/:id/approve`
Approve or reject a withdrawal request.

**Request:**
```json
{
  "approved": true,
  "adminNotes": "Approved after document verification",
  "processingMethod": "XENDIT_DISBURSEMENT"
}
```

#### POST `/api/withdrawals/:id/process`
Process an approved withdrawal via Xendit disbursement.

### Webhook Endpoint

#### POST `/api/withdrawals/webhook/xendit`
Handle Xendit disbursement status updates.

## Withdrawal Flow

### 1. Eligibility Check
```javascript
// Check if project can withdraw funds
const response = await fetch('/api/withdrawals/eligibility/project123');
const { eligibility } = await response.json();

if (eligibility.eligible) {
  console.log(`Available to withdraw: IDR ${eligibility.availableAmount.toLocaleString()}`);
} else {
  console.log(`Cannot withdraw: ${eligibility.reason}`);
}
```

### 2. Create Withdrawal Request
```javascript
const withdrawalRequest = {
  projectId: 'project123',
  amount: 500000, // IDR 500,000
  method: 'XENDIT_DISBURSEMENT',
  reason: 'Project completion - equipment purchase completed',
  bankAccount: {
    bankName: 'Bank BCA',
    bankCode: 'BCA',
    accountNumber: '1234567890',
    accountHolderName: 'John Doe'
  }
};

const response = await fetch('/api/withdrawals', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + userToken
  },
  body: JSON.stringify(withdrawalRequest)
});
```

### 3. Admin Review Process
1. **Admin Reviews Request**: Admin checks withdrawal request details
2. **Approval Decision**: Admin approves/rejects with notes
3. **Processing Method**: Admin can change processing method if needed

```javascript
// Admin approval
const approvalData = {
  approved: true,
  adminNotes: 'Verified project completion and bank details',
  processingMethod: 'XENDIT_DISBURSEMENT'
};

await fetch(`/api/withdrawals/${withdrawalId}/approve`, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + adminToken },
  body: JSON.stringify(approvalData)
});
```

### 4. Automated Processing
```javascript
// Process approved withdrawal
await fetch(`/api/withdrawals/${withdrawalId}/process`, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + adminToken }
});
```

### 5. Status Updates
- `PENDING` → `APPROVED` (admin approval)
- `APPROVED` → `PROCESSING` (disbursement initiated)
- `PROCESSING` → `COMPLETED` (disbursement successful)
- `PROCESSING` → `FAILED` (disbursement failed)

## Withdrawal Methods

### Bank Transfer
- **Manual Processing**: Admin handles transfer manually
- **Processing Fee**: 0.5% + IDR 2,500 fixed fee
- **Timeline**: 1-3 business days

### Xendit Disbursement
- **Automated Processing**: Via Xendit API
- **Processing Fee**: 0.3% + IDR 5,000 fixed fee
- **Timeline**: Same day to 1 business day
- **Supported Banks**: BCA, BNI, BRI, Mandiri, Permata, and others

### Manual Processing
- **Admin Controlled**: Full manual oversight
- **Processing Fee**: 1% of withdrawal amount
- **Timeline**: Varies based on admin availability

## Fee Calculation

### Processing Fee Structure
```typescript
function calculateProcessingFee(amount: number, method: WithdrawMethod): number {
  let feeRate = 0;
  let fixedFee = 0;

  switch (method) {
    case WithdrawMethod.BANK_TRANSFER:
      feeRate = 0.005; // 0.5%
      fixedFee = 2500; // IDR 2,500
      break;
    case WithdrawMethod.XENDIT_DISBURSEMENT:
      feeRate = 0.003; // 0.3%
      fixedFee = 5000; // IDR 5,000
      break;
    case WithdrawMethod.MANUAL:
      feeRate = 0.01; // 1%
      fixedFee = 0;
      break;
  }

  const percentageFee = Math.floor(amount * feeRate);
  const totalFee = percentageFee + fixedFee;
  
  // Cap the fee at 2% of the withdrawal amount
  const maxFee = Math.floor(amount * 0.02);
  return Math.min(totalFee, maxFee);
}
```

### Fee Examples
- **IDR 100,000 via Bank Transfer**: Fee = IDR 3,000 (0.5% + IDR 2,500)
- **IDR 1,000,000 via Xendit**: Fee = IDR 8,000 (0.3% + IDR 5,000)
- **IDR 10,000,000 via Manual**: Fee = IDR 100,000 (1%)

## Eligibility Rules

### Project Requirements
1. **Project Status**: Must be ACTIVE or COMPLETED
2. **Owner Verification**: Only project owner can request withdrawals
3. **Minimum Amount**: IDR 10,000 minimum withdrawal
4. **Available Funds**: Must have sufficient available funds

### Available Fund Calculation
```
Available Amount = Total Raised - Completed Withdrawals - Pending Withdrawals
```

### Restrictions
- Cannot withdraw if project is DRAFT, CANCELLED, or SUSPENDED
- Cannot withdraw more than available amount
- Cannot have multiple pending withdrawals for same project
- Must provide complete bank account details for electronic methods

## Testing

### Unit Tests
Run withdrawal-specific tests:
```bash
npm test -- --testPathPatterns="withdraw"
```

### Integration Testing with Postman
1. **Import Collection**: Use the withdrawal endpoints in Postman
2. **Set Environment Variables**:
   - `baseUrl`: Your server URL
   - `authToken`: Valid JWT token (fundraiser)
   - `adminToken`: Valid admin JWT token
   - `projectId`: Valid project ID
   - `withdrawalId`: Valid withdrawal ID

### Testing Scenarios

#### 1. Complete Withdrawal Flow
```bash
# 1. Check eligibility
GET /api/withdrawals/eligibility/{{projectId}}

# 2. Create withdrawal request
POST /api/withdrawals
{
  "projectId": "{{projectId}}",
  "amount": 100000,
  "method": "XENDIT_DISBURSEMENT",
  "bankAccount": {
    "bankName": "Bank BCA",
    "bankCode": "BCA",
    "accountNumber": "1234567890",
    "accountHolderName": "Test User"
  }
}

# 3. Admin approves
POST /api/withdrawals/{{withdrawalId}}/approve
{
  "approved": true,
  "adminNotes": "Test approval"
}

# 4. Admin processes
POST /api/withdrawals/{{withdrawalId}}/process
```

#### 2. Test Xendit Webhook
```bash
curl -X POST http://localhost:3000/api/withdrawals/webhook/xendit \
  -H "Content-Type: application/json" \
  -d '{
    "id": "disb_123456",
    "external_id": "withdraw-{{withdrawalId}}",
    "status": "COMPLETED",
    "amount": 100000
  }'
```

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "message": "Insufficient funds. Available: IDR 50,000"
}
```

#### 403 Forbidden
```json
{
  "message": "Only project owner can request withdrawals"
}
```

#### 404 Not Found
```json
{
  "message": "Withdrawal not found"
}
```

#### 409 Conflict
```json
{
  "message": "Cannot cancel withdrawal in COMPLETED status"
}
```

### Error Categories
1. **Eligibility Errors**: Insufficient funds, wrong project status
2. **Validation Errors**: Invalid amounts, missing bank details
3. **Authorization Errors**: Wrong user, insufficient permissions
4. **Processing Errors**: Xendit API failures, network issues
5. **State Errors**: Invalid status transitions

## Security Considerations

### Authorization
- Users can only withdraw from their own projects
- Admins can manage all withdrawals
- Bank account details are encrypted in database
- Withdrawal amounts are validated server-side

### Audit Trail
- All withdrawal actions are logged with user IDs
- Status changes include timestamps and responsible users
- Bank account details are masked in logs
- Failed attempts are recorded for security monitoring

### Data Protection
- Bank account numbers are partially masked in responses
- Sensitive data is excluded from non-owner requests
- Admin notes are only visible to admins and owners
- Processing fees are calculated server-side to prevent manipulation

## Monitoring and Logging

### Key Metrics to Monitor
1. **Withdrawal Success Rate**: Completed vs Total requests
2. **Processing Times**: Time from request to completion
3. **Fee Revenue**: Total processing fees collected
4. **Failure Analysis**: Common reasons for rejections/failures
5. **Admin Response Time**: Time from request to approval

### Log Examples

#### Withdrawal Request
```json
{
  "level": "info",
  "message": "Withdrawal request created",
  "withdrawalId": "withdraw_123",
  "userId": "user_456",
  "projectId": "project_789",
  "amount": 100000,
  "method": "XENDIT_DISBURSEMENT"
}
```

#### Processing Error
```json
{
  "level": "error",
  "message": "Xendit disbursement failed",
  "withdrawalId": "withdraw_123",
  "error": "Invalid bank account number",
  "disbursementId": "disb_456"
}
```

## Deployment Considerations

### Production Environment
```bash
# Use live Xendit credentials
XENDIT_SECRET_KEY=xnd_production_your_live_secret_key

# Set production webhook URL
XENDIT_CALLBACK_URL=https://yourdomain.com/api/withdrawals/webhook/xendit

# Configure appropriate fees
DEFAULT_PROCESSING_FEE_RATE=0.005
MINIMUM_WITHDRAWAL_AMOUNT=10000
```

### Database Indexes
The withdrawal table includes optimized indexes:
- `userId` - Fast user-specific queries
- `projectId` - Project-specific queries
- `status` - Status-based filtering
- `requestedAt` - Chronological ordering
- Composite indexes for admin queries

### Webhook Reliability
- Webhooks are idempotent (safe to process multiple times)
- Failed webhooks should be retried by Xendit
- Implement appropriate HTTP status codes for retry behavior
- Log all webhook attempts for debugging

## Troubleshooting

### Common Issues

1. **"Insufficient funds available"**
   - Check project's total raised amount
   - Verify no pending withdrawals exist
   - Ensure payments are marked as PAID

2. **"Bank account details required"**
   - Provide complete bank account information
   - Verify bank code is supported by Xendit
   - Check account holder name matches project owner

3. **"Cannot process withdrawal in current status"**
   - Check withdrawal status in database
   - Ensure proper status flow (PENDING → APPROVED → PROCESSING)
   - Verify admin permissions for status changes

4. **"Xendit disbursement failed"**
   - Check Xendit account balance
   - Verify bank account details are correct
   - Review Xendit API error messages

### Debug Mode
Enable debug logging:
```bash
LOG_LEVEL=debug
```

This provides detailed information about:
- Withdrawal service operations
- Fee calculations
- Xendit API interactions
- Database transactions
- Status transitions

## Support

For issues related to:
- **Withdrawal Processing**: Check logs and status transitions
- **Xendit Integration**: Review Xendit documentation and API responses
- **Database Issues**: Check Sequelize logs and migration status
- **Fee Calculations**: Verify fee structure and business rules

Remember to never log sensitive information like bank account details or full disbursement responses in production environments.