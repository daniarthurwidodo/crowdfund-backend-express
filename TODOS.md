# Project TODOs

- [ ] add payment module
  - [ ] design payment service API
  - [ ] DB migrations for transactions
  - [ ] implement endpoints + webhook handling
  - [ ] add unit/integration tests
  - [ ] Xendit integration
    - [ ] add env vars: XENDIT_SECRET_KEY, XENDIT_PUBLIC_KEY, XENDIT_CALLBACK_URL
    - [ ] choose integration approach (Invoices / Virtual Accounts / E-wallets / Card)
    - [ ] add example server-side routes: createCharge, createVA, createInvoice
    - [ ] implement webhook verification & handler (signature check)
    - [ ] add Postman requests and webhook mock examples (sandbox)
    - [ ] add unit & integration tests using Xendit sandbox
    - [ ] document usage in README and .env.example

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

- [ ] Image upload improvements
  - [ ] ensure uploads folders are created on startup
  - [ ] add unit tests for upload handlers and error cases

- [ ] Controllers & routes
  - [ ] create/review userController (ensure avatar update handled)
  - [ ] review projectController for image handling and authorization

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
  - [ ] add unit tests for controllers, services, and utils (jest)
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

- [ ] Payments
  - [ ] expand Xendit plan: sample flows (invoice, VA, e-wallet), retry logic, settlement handling
  - [ ] add reconciliation job to sync payment status

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
