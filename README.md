# Crowdfund Backend Express

A comprehensive crowdfunding backend API built with Express.js, TypeScript, Sequelize, PostgreSQL, and Redis.

## 🚀 Features

- **TypeScript**: Full TypeScript support with type safety
- **Express.js**: Fast and minimal web framework
- **PostgreSQL**: Robust relational database with Sequelize ORM
- **Redis**: Session storage and caching
- **JWT Authentication**: Secure authentication system
- **Swagger Documentation**: Interactive API documentation
- **Docker**: Containerized application with Docker Compose
- **Health Checks**: Built-in health monitoring endpoints
- **Security**: Helmet, CORS, rate limiting, and input validation
- **Database Migrations**: Sequelize migrations for database versioning

## 📋 Prerequisites

- Node.js (v18 or higher)
- Docker and Docker Compose
- PostgreSQL (if running locally)
- Redis (if running locally)

## 🛠️ Installation & Setup

### Option 1: Using Docker (Recommended)

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd crowdfund-backend-express
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start with Docker Compose**

   ```bash
   docker-compose up -d
   ```

4. **Run database migrations**

   ```bash
   docker-compose exec app npm run migrate
   ```

5. **Access the application**
   - API: <http://localhost:3000>
   - Swagger Documentation: <http://localhost:3000/api-docs>
   - Health Check: <http://localhost:3000/health>

### Option 2: Local Development

1. **Clone and install**

   ```bash
   git clone <repository-url>
   cd crowdfund-backend-express
   npm install
   ```

2. **Setup environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your local database and Redis credentials
   ```

3. **Start PostgreSQL and Redis locally**

4. **Run migrations**

   ```bash
   npm run migrate
   ```

5. **Start development server**

   ```bash
   npm run dev
   ```

## 🔧 Environment Variables

Copy `.env.example` to `.env` and configure:

```env
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=crowdfund_db
DB_USERNAME=postgres
DB_PASSWORD=password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=24h

# Session
SESSION_SECRET=your_super_secret_session_key_here

# CORS
CORS_ORIGIN=http://localhost:3000
```

## 📝 Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run build:watch` - Build with watch mode
- `npm run migrate` - Run database migrations
- `npm run migrate:undo` - Undo last migration
- `npm run seed` - Run database seeders
- `npm run seed:dummy` - Seed database with realistic test data (40 users, 20 projects)
- `npm run seed:admin` - Create admin test users only
- `npm run db:clear` - Clear all data from database (with confirmation)
- `npm run db:reset` - Clear database and re-seed with dummy data
- `npm run db:setup` - Run migrations and create admin users
- `npm run db:create` - Create database
- `npm run db:drop` - Drop database

## 📚 API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user (requires auth)
- `GET /api/auth/me` - Get current user profile (requires auth)

### Users
- `GET /api/users` - List all users (admin only)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user profile
- `PATCH /api/users/:id/activate` - Activate user (admin)
- `PATCH /api/users/:id/deactivate` - Deactivate user (admin)

### Projects
- `GET /api/projects` - List projects (with search, filters, pagination)
- `POST /api/projects` - Create new project (fundraisers only)
- `GET /api/projects/:id` - Get project details with donations
- `PUT /api/projects/:id` - Update project (owner or admin)
- `DELETE /api/projects/:id` - Delete project (owner or admin)
- `GET /api/projects/my` - Get current user's projects

### Donations
- `GET /api/donations` - List donations (with filters)
- `POST /api/donations` - Create donation (anonymous or authenticated)
- `GET /api/donations/:id` - Get donation details
- `GET /api/donations/my` - Get current user's donations
- `GET /api/donations/project/:id` - Get donations for specific project

### Health Checks

- `GET /health` - Service health status
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe
- `POST /shutdown` - Graceful shutdown (development only)

### Documentation

- `GET /api-docs` - Swagger UI documentation

## 🧪 Test Data & Quick Start

### Quick Setup with Test Data
```bash
# Setup database and create admin users
npm run db:setup

# Or seed with realistic dummy data for testing
npm run seed:dummy
```

### Test User Credentials (after `npm run seed:admin`)
```
Admin User:
  Email: admin@crowdfund.com
  Password: admin123

Fundraiser User:
  Email: fundraiser@crowdfund.com  
  Password: fundraiser123

Regular User:
  Email: user@crowdfund.com
  Password: user123
```

### Dummy Data Overview (after `npm run seed:dummy`)
- **40 Users**: 20 regular users + 20 fundraisers with unique emails
- **20 Projects**: Realistic crowdfunding projects across various categories
- **60-300 Donations**: Mix of anonymous and authenticated donations
- **All Project States**: ACTIVE, CLOSED, CANCELLED for comprehensive testing
- **Realistic Scenarios**: Some projects fully funded, others ongoing or expired

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## 📖 API Documentation

Visit `/api-docs` when the server is running to access interactive Swagger documentation.

## 🐳 Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Run migrations
docker-compose exec app npm run migrate

# Access database
docker-compose exec postgres psql -U postgres -d crowdfund_db

# Access Redis CLI
docker-compose exec redis redis-cli

# Stop all services
docker-compose down

# Rebuild and start
docker-compose up --build -d
```

## 🗄️ Database

The application uses PostgreSQL with Sequelize ORM:

- **Users table**: User authentication and profile data
- **Migrations**: Located in `src/migrations/`
- **Models**: Located in `src/models/`

### Migration Commands

```bash
# Create new migration
npx sequelize-cli migration:generate --name migration-name

# Run migrations
npm run migrate

# Undo last migration
npm run migrate:undo

# Reset database (caution!)
npm run db:drop && npm run db:create && npm run migrate
```

## 🔧 Development

### Project Structure

```
src/
├── config/          # Configuration files
│   ├── database.ts  # Database configuration
│   ├── redis.ts     # Redis configuration
│   └── swagger.ts   # Swagger configuration
├── middleware/      # Express middleware
│   └── auth.ts      # JWT authentication middleware
├── models/          # Sequelize models
│   ├── index.ts     # Models index
│   └── user.ts      # User model
├── routes/          # API routes
│   └── auth.ts      # Authentication routes
├── types/           # TypeScript type definitions
│   └── index.ts     # Global types
├── migrations/      # Database migrations
└── server.ts        # Main server file
```

### Adding New Features

1. **Add new routes**: Create route files in `src/routes/`
2. **Add models**: Create model files in `src/models/`
3. **Add migrations**: Use Sequelize CLI to generate migrations
4. **Add middleware**: Create middleware in `src/middleware/`
5. **Update types**: Add TypeScript types in `src/types/`

## 🧪 Testing

```bash
# Run tests (when implemented)
npm test

# Run tests with coverage
npm run test:coverage
```

## 🚀 Production Deployment

1. **Build the application**

   ```bash
   npm run build
   ```

2. **Set production environment variables**

3. **Run migrations**

   ```bash
   NODE_ENV=production npm run migrate
   ```

4. **Start production server**

   ```bash
   npm start
   ```

## 🔍 Monitoring

### Health Checks

- `/health` - Comprehensive health check (database + redis)
- `/health/ready` - Kubernetes readiness probe
- `/health/live` - Kubernetes liveness probe

### Logging

The application logs important events:

- Database connection status
- Redis connection status
- Authentication attempts
- Error handling

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Troubleshooting

### Common Issues

1. **Database connection issues**
   - Verify PostgreSQL is running
   - Check database credentials in `.env`
   - Ensure database exists

2. **Redis connection issues**
   - Verify Redis is running
   - Check Redis host/port in `.env`

3. **Migration errors**
   - Check database connection
   - Verify migration files syntax
   - Run `npm run db:create` if database doesn't exist

4. **Docker issues**
   - Run `docker-compose down` and `docker-compose up --build`
   - Check Docker logs: `docker-compose logs app`

### Getting Help

- Check the logs: `docker-compose logs app`
- Verify environment variables
- Check database and Redis connectivity
- Review API documentation at `/api-docs`

Local Build

- local db : docker run --name postgres-dev -e POSTGRES_DB=crowdfund_db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15-alpine
- local redis : docker run --name redis-dev -p 6379:6379 -d redis:7-alpine redis-server --appendonly yes
