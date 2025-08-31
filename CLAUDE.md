# Crowdfunding Backend Express - Claude Code Documentation

This is a comprehensive Node.js/Express backend for a crowdfunding platform built with TypeScript, PostgreSQL, and integrated payment processing through Xendit.

## Project Overview

### Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Sequelize ORM
- **Authentication**: JWT-based with role-based authorization
- **Payment Processing**: Xendit integration (invoices, virtual accounts, e-wallets)
- **File Storage**: Local file system with image processing
- **Caching**: Redis for session management
- **Job Scheduling**: Node-cron for background tasks
- **Testing**: Jest with comprehensive test coverage
- **Documentation**: Swagger/OpenAPI specifications

### Key Features
- **User Management**: Registration, authentication, profile management
- **Project Management**: CRUD operations with image uploads and status tracking
- **Donation System**: Multi-method donations with payment processing
- **Payment Processing**: Complete Xendit integration with retry logic and settlement
- **Withdrawal System**: Automated fund withdrawal with admin approval workflow
- **Admin Panel**: Administrative oversight with approval workflows
- **File Uploads**: Image upload and processing with validation
- **Background Jobs**: Payment reconciliation and project status updates

## Tech Stack

### Core Dependencies
```json
{
  "express": "^4.18.2",
  "typescript": "^5.0.0",
  "sequelize": "^6.35.2",
  "pg": "^8.11.3",
  "redis": "^4.6.10",
  "jsonwebtoken": "^9.0.2",
  "bcryptjs": "^2.4.3",
  "joi": "^17.11.0",
  "multer": "^1.4.5",
  "sharp": "^0.32.6",
  "xendit-node": "^4.5.0",
  "node-cron": "^3.0.3"
}
```

### Development Dependencies
```json
{
  "jest": "^29.7.0",
  "supertest": "^6.3.3",
  "@types/node": "^20.8.0",
  "nodemon": "^3.0.1",
  "ts-node": "^10.9.1"
}
```

## Project Structure

```
crowdfund-backend-express/
├── src/
│   ├── config/           # Configuration files
│   │   ├── database.ts   # Database configuration
│   │   ├── redis.ts      # Redis configuration
│   │   ├── logger.ts     # Logging configuration
│   │   ├── swagger.ts    # API documentation setup
│   │   └── xendit.ts     # Payment gateway configuration
│   ├── controllers/      # Request handlers
│   │   ├── authController.ts
│   │   ├── userController.ts
│   │   ├── projectController.ts
│   │   ├── donationController.ts
│   │   ├── paymentController.ts
│   │   ├── withdrawController.ts
│   │   ├── uploadController.ts
│   │   ├── adminController.ts
│   │   └── webhookController.ts
│   ├── middleware/       # Express middleware
│   │   ├── auth.ts       # Authentication middleware
│   │   ├── roleAuth.ts   # Role-based authorization
│   │   └── upload.ts     # File upload middleware
│   ├── models/           # Database models
│   │   ├── user.ts
│   │   ├── project.ts
│   │   ├── donation.ts
│   │   ├── payment.ts
│   │   ├── withdraw.ts
│   │   └── index.ts
│   ├── routes/           # API route definitions
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   ├── projects.ts
│   │   ├── donations.ts
│   │   ├── payments.ts
│   │   ├── withdrawals.ts
│   │   ├── uploads.ts
│   │   └── admin.ts
│   ├── services/         # Business logic services
│   │   ├── paymentService.ts
│   │   ├── enhancedPaymentService.ts
│   │   ├── withdrawService.ts
│   │   └── projectScheduler.ts
│   ├── jobs/             # Background job definitions
│   │   ├── paymentReconciliationJob.ts
│   │   └── scheduler.ts
│   ├── utils/            # Utility functions
│   │   ├── ulid.ts       # ULID generation
│   │   ├── imageUpload.ts # Image processing utilities
│   │   └── validation.ts
│   ├── migrations/       # Database migrations
│   ├── seeders/          # Database seeders
│   ├── __tests__/        # Test files
│   ├── types.ts          # TypeScript type definitions
│   └── server.ts         # Application entry point
├── uploads/              # File upload directory
│   ├── avatars/
│   └── projects/
├── postman/              # Postman collections
├── docs/                 # Documentation
├── .env.example          # Environment variables template
├── package.json
└── README.md
```

## Database Schema

### Core Tables
1. **users**: User accounts with authentication and profile data
2. **projects**: Crowdfunding projects with funding goals and status
3. **donations**: Individual donation records linked to users and projects
4. **payments**: Payment processing records with Xendit integration
5. **withdrawals**: Fund withdrawal requests with approval workflow

### Key Relationships
- Users can create multiple projects (one-to-many)
- Users can make multiple donations (one-to-many)
- Projects receive multiple donations (one-to-many)
- Donations have one payment record (one-to-one)
- Projects can have multiple withdrawal requests (one-to-many)

## API Endpoints

### Authentication (`/api/auth`)
- `POST /register` - User registration
- `POST /login` - User authentication
- `POST /logout` - User logout
- `POST /refresh` - Token refresh

### Users (`/api/users`)
- `GET /profile` - Get current user profile
- `PUT /profile` - Update user profile
- `PUT /change-password` - Change password
- `DELETE /avatar` - Delete user avatar
- `GET /stats` - Get user statistics
- `GET /:id` - Get public user profile

### Projects (`/api/projects`)
- `GET /` - List projects with filtering and pagination
- `POST /` - Create new project (fundraisers only)
- `GET /:id` - Get project details
- `PUT /:id` - Update project
- `DELETE /:id` - Delete project
- `GET /my` - Get user's projects
- `POST /:id/remove-image` - Remove project image

### Donations (`/api/donations`)
- `GET /` - List donations with filtering
- `POST /` - Create donation
- `GET /:id` - Get donation details
- `GET /my` - Get user's donations
- `GET /project/:projectId` - Get project donations

### Payments (`/api/payments`)
- `GET /methods` - Get available payment methods
- `POST /invoice` - Create invoice payment
- `POST /virtual-account` - Create virtual account payment
- `POST /ewallet` - Create e-wallet payment
- `GET /:id/status` - Get payment status
- `POST /:id/cancel` - Cancel payment
- `GET /my` - Get user's payments
- `POST /webhook` - Payment webhook endpoint

### Withdrawals (`/api/withdrawals`)
- `GET /eligibility/:projectId` - Check withdrawal eligibility
- `POST /` - Create withdrawal request
- `GET /my` - Get user's withdrawals
- `GET /:id` - Get withdrawal details
- `POST /:id/cancel` - Cancel withdrawal
- `GET /project/:projectId/stats` - Get project withdrawal stats
- `GET /admin/pending` - Get pending withdrawals (admin)
- `POST /:id/approve` - Approve withdrawal (admin)
- `POST /:id/process` - Process withdrawal (admin)

### File Uploads (`/api/uploads`)
- `POST /avatar` - Upload user avatar
- `POST /project` - Upload project images
- `GET /check-folders` - Check upload folder status

### Admin (`/api/admin`)
- `POST /reconciliation/run` - Run payment reconciliation
- `POST /reconciliation/payments` - Reconcile specific payments
- `GET /reconciliation/report` - Get reconciliation report
- `GET /jobs/status` - Get job scheduler status
- `POST /jobs/run` - Run scheduled job manually

## Environment Variables

### Required Configuration
```bash
# Server Configuration
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=crowdfund_db
DB_USERNAME=your_db_user
DB_PASSWORD=your_db_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Session Configuration
SESSION_SECRET=your_session_secret_here

# Xendit Configuration
XENDIT_SECRET_KEY=xnd_test_your_secret_key_here
XENDIT_PUBLIC_KEY=xnd_public_test_your_public_key_here
XENDIT_CALLBACK_URL=http://localhost:3000/api/payments/webhook
XENDIT_WEBHOOK_TOKEN=your_webhook_verification_token_here

# Payment Configuration
DEFAULT_PAYMENT_EXPIRY_HOURS=24
DEFAULT_INVOICE_DURATION_SECONDS=86400

# Upload Configuration
MAX_FILE_SIZE=10485760
ALLOWED_IMAGE_TYPES=image/jpeg,image/png,image/webp

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Logging Configuration
LOG_LEVEL=info
```

## Key Features Deep Dive

### 1. Payment Processing
- **Multiple Methods**: Invoice, Virtual Account, E-wallet payments
- **Xendit Integration**: Complete API integration with retry logic
- **Webhook Handling**: Real-time payment status updates
- **Reconciliation**: Automated payment status synchronization
- **Settlement Processing**: Fee calculation and settlement tracking

### 2. Withdrawal System
- **Eligibility Checking**: Smart validation of available funds
- **Admin Approval**: Multi-stage approval workflow
- **Multiple Methods**: Bank transfer, Xendit disbursement, manual processing
- **Fee Management**: Transparent fee calculation and deduction
- **Audit Trail**: Complete transaction history

### 3. File Upload System
- **Image Processing**: Sharp-based image optimization
- **Multiple Formats**: JPEG, PNG, WebP support
- **Size Validation**: Configurable file size limits
- **Secure Storage**: Organized file structure with cleanup

### 4. Background Jobs
- **Payment Reconciliation**: Automated status synchronization
- **Project Status Updates**: Automated project lifecycle management
- **Scheduled Tasks**: Cron-based job scheduling
- **Error Handling**: Comprehensive error recovery

### 5. Security Features
- **JWT Authentication**: Secure token-based authentication
- **Role-based Authorization**: User, Fundraiser, Admin roles
- **Input Validation**: Joi-based request validation
- **Rate Limiting**: Protection against abuse
- **CORS Configuration**: Cross-origin request security

## Testing Strategy

### Test Coverage
- **Unit Tests**: Individual function and method testing
- **Integration Tests**: API endpoint testing with supertest
- **Service Tests**: Business logic validation
- **Database Tests**: Model and migration testing
- **Mock Testing**: External service mocking

### Test Files
```
src/__tests__/
├── authController.test.ts
├── userController.test.ts
├── projectController.test.ts
├── donationController.test.ts
├── paymentController.test.ts
├── withdrawController.test.ts
├── webhookController.test.ts
├── paymentService.test.ts
└── imageUpload.test.ts
```

### Running Tests
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --testPathPatterns="payment"

# Run tests in watch mode
npm run test:watch
```

## Development Workflow

### Setup Instructions
1. **Clone Repository**: `git clone <repository-url>`
2. **Install Dependencies**: `npm install`
3. **Environment Setup**: Copy `.env.example` to `.env` and configure
4. **Database Setup**: Create PostgreSQL database and run migrations
5. **Redis Setup**: Start Redis server
6. **Start Development**: `npm run dev`

### Common Commands
```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run database migrations
npm run migrate

# Run database seeders
npm run seed

# Lint code
npm run lint

# Format code
npm run format

# Type checking
npm run type-check
```

### Code Quality Tools
- **ESLint**: Code linting with TypeScript rules
- **Prettier**: Code formatting
- **Husky**: Git hooks for pre-commit checks
- **TypeScript**: Static type checking
- **Jest**: Testing framework with coverage reports

## Deployment Configuration

### Production Environment
```bash
# Set production environment
NODE_ENV=production

# Use production database
DB_HOST=your-production-db-host
DB_NAME=your_production_db

# Use production Redis
REDIS_HOST=your-production-redis-host

# Use live Xendit credentials
XENDIT_SECRET_KEY=xnd_production_your_live_secret_key

# Set production URLs
FRONTEND_URL=https://yourdomain.com
XENDIT_CALLBACK_URL=https://yourdomain.com/api/payments/webhook
```

### Health Checks
- **GET** `/health` - Application health status
- **Database**: Connection status verification
- **Redis**: Cache service verification
- **External APIs**: Xendit service status

### Monitoring
- **Structured Logging**: JSON-formatted logs with correlation IDs
- **Error Tracking**: Comprehensive error logging and reporting
- **Performance Metrics**: Request timing and success rates
- **Background Job Monitoring**: Job execution status and failures

## Business Logic

### Project Lifecycle
1. **DRAFT** → **ACTIVE** → **COMPLETED** / **CANCELLED**
2. **Funding Rules**: Projects collect donations until target or deadline
3. **Status Automation**: Background jobs update project status
4. **Fund Management**: Available funds calculated for withdrawals

### Payment Flow
1. **Donation Creation** → **Payment Processing** → **Status Updates**
2. **Multiple Methods**: Invoice, VA, E-wallet with different flows
3. **Webhook Integration**: Real-time status synchronization
4. **Reconciliation**: Automated status verification and correction

### Withdrawal Process
1. **Eligibility Check** → **Request Creation** → **Admin Approval** → **Processing** → **Completion**
2. **Fee Calculation**: Dynamic fees based on method and amount
3. **Fund Validation**: Ensures sufficient available funds
4. **Audit Trail**: Complete tracking of all actions

## Integration Points

### Xendit Payment Gateway
- **Invoice API**: Multi-method payment checkout
- **Virtual Account API**: Bank transfer payments
- **E-wallet API**: Digital wallet payments (DANA, OVO, LinkAja, ShopeePay)
- **Disbursement API**: Automated fund withdrawals
- **Webhook System**: Real-time status updates

### External Dependencies
- **PostgreSQL**: Primary database
- **Redis**: Session management and caching
- **Sharp**: Image processing
- **Node Mailer**: Email notifications (if configured)

## Performance Considerations

### Database Optimization
- **Indexes**: Strategic indexes on frequently queried fields
- **Pagination**: Efficient pagination for large datasets
- **Query Optimization**: Optimized Sequelize queries with proper joins
- **Connection Pooling**: Database connection management

### Caching Strategy
- **Redis Caching**: Session and frequently accessed data
- **HTTP Caching**: Appropriate cache headers for static content
- **Query Caching**: Database query result caching

### File Storage
- **Local Storage**: Organized file structure with cleanup
- **Image Optimization**: Sharp-based image processing
- **Size Limits**: Configurable file size restrictions
- **Format Support**: Multiple image format support

## Security Implementation

### Authentication & Authorization
- **JWT Tokens**: Secure stateless authentication
- **Role-based Access**: User, Fundraiser, Admin roles
- **Token Refresh**: Secure token renewal mechanism
- **Session Management**: Redis-based session storage

### Input Validation
- **Joi Schemas**: Comprehensive request validation
- **File Upload Validation**: MIME type and size checking
- **SQL Injection Prevention**: Sequelize ORM protection
- **XSS Prevention**: Input sanitization

### API Security
- **Rate Limiting**: Protection against abuse
- **CORS Configuration**: Cross-origin request management
- **Helmet Integration**: Security headers
- **Webhook Signature Verification**: Xendit webhook security

This documentation provides a comprehensive overview of the crowdfunding backend system. The codebase implements enterprise-grade features with proper error handling, security measures, and scalability considerations.