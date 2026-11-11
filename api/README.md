# Haba API

Node.js 22+ and PostgreSQL 14+ API. The server also hosts the customer page so the browser and API share an origin.

## Local startup

Create a PostgreSQL database, set the environment variables from `.env.example` in your shell, then run:

```sh
npm ci
npm run migrate
npm start
```

The service listens on port 10000 by default. Generate independent 32-byte base64 keys for the five `*_KEY` secrets. Do not put real applicant information into local development databases.

## Current routes

- `GET /healthz`, `GET /v1/product-status`
- `POST /v1/auth/otp/request`, `POST /v1/auth/otp/verify`, `POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/logout`
- `GET /v1/me`, `POST /v1/me/close-account`
- `POST /v1/applications`, `GET /v1/applications`, `PUT /v1/applications/:id/references`, `POST /v1/applications/:id/consents`, `POST /v1/applications/:id/submit`
- `POST /v1/applications/:id/credit-review`, `POST /v1/applications/:id/activation-payment`

Personally identifying application and reference fields are encrypted before database storage. Passwords use Node's scrypt. Session tokens are opaque and only their HMAC digests are stored. Requests are rate-limited and input is validated.

## Fail-closed integration status

Registration requires a database, SMS provider credentials, encryption keys, and `REGISTRATION_ENABLED=true`. Lending routes require `LENDING_ENABLED=true` and documented authorization references. Credit bureau and M-Pesa calls intentionally return unavailable until provider contracts, credentials, callback verification, reconciliation, and approved adapters are complete. The activation-fee endpoint never accepts a payment in its current form. Do not turn on customer registration or lending from environment flags alone.

Use one service instance until rate limiting moves to a shared store. Before production, add security review, independent penetration testing, backups and retention procedures, data-subject request handling, operational alerting, and a regulator-reviewed reporting integration.
