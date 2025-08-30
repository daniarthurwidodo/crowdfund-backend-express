# Project TODOs

- [x] add payment module
  - [x] design payment service API
  - [x] DB migrations for transactions
  - [x] implement endpoints + webhook handling
  - [x] add unit/integration tests
  - [x] Xendit integration
    - [x] add env vars: XENDIT_SECRET_KEY, XENDIT_PUBLIC_KEY, XENDIT_CALLBACK_URL
    - [x] choose integration approach (Invoices / Virtual Accounts / E-wallets / Card)
    - [x] add example server-side routes: createCharge, createVA, createInvoice
    - [x] implement webhook verification & handler (signature check)
    - [x] add Postman requests and webhook mock examples (sandbox)
    - [x] add unit & integration tests using Xendit sandbox
    - [x] document usage in README and .env.example

- [x] Swagger
  - [x] move Swagger comment blocks above route handlers
  - [x] terminate/format Swagger blocks for upload endpoints
  - [x] clarify avatar & project upload schemas and responses

- [x] Postman
  - [x] add "Check Upload Folders" request
  - [x] add "Upload User Avatar" request (form-data file)
  - [ ] verify collection variables in CI / docs

- [x] Git / repo activities
  - [x] commit: uploads route + check-folders implementation
  - [x] commit: Swagger comment cleanup for uploads.ts
  - [x] commit: Postman collection update (Uploads requests)
  - [ ] create release / tag after payment module implemented

- [x] Image upload improvements
  - [x] ensure uploads folders are created on startup
    - [x] created initializeUploadDirectories() function with error handling
    - [x] integrated directory verification and permission checks
    - [x] added to server startup sequence
  - [x] add unit tests for upload handlers and error cases
    - [x] set up Jest testing framework with TypeScript support
    - [x] added comprehensive test suite (20 tests covering all upload utilities)
    - [x] tests for directory initialization, image processing, validation, and error handling

- [x] Controllers & routes
  - [x] create/review userController (ensure avatar update handled)
    - [x] reviewed existing avatar handling functionality
    - [x] added missing route integrations (/profile, /change-password, /avatar, /stats)
    - [x] updated routes to use controller functions with proper Swagger documentation
  - [x] review projectController for image handling and authorization
    - [x] enhanced authorization with checkProjectAuthorization() helper
    - [x] added image URL validation to prevent unauthorized uploads
    - [x] implemented automatic image cleanup on project updates/deletion
    - [x] added removeProjectImage() function with route for individual image removal
    - [x] improved error handling and logging throughout

- [ ] CI / Devops
  - [ ] add build step to run linter and tests
  - [ ] run schema checks and DB migrations in CI

- [ ] Misc
  - [ ] update README with setup, env vars, and DB visualization steps
  - [ ] add example .env.example

## Additional suggestions (add these as checklist items)

- [ ] Security
  - [ ] add rate limiting (express-rate-limit) on public endpoints
  - [ ] enforce strong password policy and account lockouts
  - [ ] store secrets in a vault (or use env encryption) and add .env.example
  - [ ] enable helmet, CSP, and other hardening middleware
  - [ ] add webhook signature verification and replay protection

- [ ] Observability & Monitoring
  - [ ] integrate structured logging (request IDs) and log rotation
  - [ ] add error tracking (Sentry) with source maps
  - [ ] expose Prometheus metrics and add basic dashboards (Grafana)
  - [ ] add health, readiness, and liveness checks to deployment

- [ ] Testing & Quality
  - [x] add unit tests for controllers, services, and utils (jest)
  - [ ] add integration tests for DB and file uploads (supertest)
  - [ ] add contract tests for external integrations (Xendit/webhooks)
  - [ ] enable CI to run lint, typecheck, tests, and build

- [ ] Storage & File Handling
  - [ ] support S3-compatible storage (AWS S3 / MinIO) as alternative to local uploads
  - [ ] add image optimization and CDN config for production
  - [ ] implement garbage collection for orphaned uploads

- [ ] Database & Data
  - [ ] add migrations (umzug / sequelize-cli) and seeders for test data
  - [ ] create backups/restore strategy and document it
  - [ ] add transactional boundaries where needed (fund transfers / donations)

- [x] Payments
  - [x] expand Xendit plan: sample flows (invoice, VA, e-wallet), retry logic, settlement handling
  - [x] add reconciliation job to sync payment status

- [x] Withdraw Fund Module
  - [x] design withdraw fund system architecture
  - [x] create withdraw fund database migrations and models  
  - [x] implement withdraw fund service with validation
  - [x] create withdraw fund API endpoints and controllers
  - [x] add withdraw fund tests and documentation

- [ ] Performance & Scalability
  - [ ] cache frequent reads with Redis and add cache invalidation strategy
  - [ ] profile slow queries and add indexes where necessary
  - [ ] plan for horizontal scaling (stateless app, shared storage, sticky sessions removal)

- [ ] Developer Experience
  - [ ] add Docker dev compose and Makefile / npm scripts for common tasks
  - [ ] provide local mockserver for webhooks and external services
  - [ ] add contributor guide and code of conduct

- [ ] Documentation & Onboarding
  - [ ] create README sections: local dev, testing, env, DB visualization
  - [ ] add API changelog and versioning policy
  - [ ] add Postman collection run instructions and example webhook consumer

- [ ] Compliance & Legal
  - [ ] add privacy/data retention policy and deletion endpoint
  - [ ] ensure PII handling and encryption at rest where required

- [ ] Operations
  - [ ] add deployment manifests (Dockerfile, Kubernetes manifests/Helm)
  - [ ] add automated deploy pipeline (staging -> production)
  - [ ] implement DB migration run in CI/CD with safe
