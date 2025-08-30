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
