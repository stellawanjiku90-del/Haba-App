# Haba — Kenya lending application

Haba is a Kenya-first lending product with a responsive customer interface and a Node.js/PostgreSQL API. It is built to keep customer registration, application data, references, consent records, and account sessions on the server. Lending actions fail closed until their authorization and provider requirements are configured.

## Run locally

1. Install Node.js 22 or newer and PostgreSQL.
2. Create a database and set `DATABASE_URL`.
3. Copy `api/.env.example` to `api/.env` and provide the encryption, token, phone-hash, session-hash, and OTP-hash keys.
4. Run `npm ci --prefix api`, then `npm run migrate --prefix api`, then `npm start --prefix api`.
5. Visit `http://localhost:10000`.

The live interface uses the API served from the same origin. Registration remains off until the SMS provider is configured and `REGISTRATION_ENABLED=true`. Loan applications remain off unless `LENDING_ENABLED=true` and authorization references are set. Credit review and M-Pesa activation payments are not enabled without approved, implemented provider adapters.

## Current operating state

The owner stated that the lending company is not yet incorporated and that no CBK filing or SMS, credit bureau, or M-Pesa providers have been selected. Haba therefore does not accept registrations or applications, make loan decisions, or charge the proposed KES 100 fee. It does not read SMS history, call logs, or an entire phonebook for credit scoring. Do not enable customer data collection or lending until licensing, privacy and consumer disclosures, and integrations have been reviewed and approved.

## Production setup

- Use a managed PostgreSQL database with backups and restricted access.
- Set `DATABASE_URL` and independent random base64 32-byte values for `PHONE_HASH_KEY`, `PII_ENCRYPTION_KEY`, `SESSION_HASH_KEY`, `TOKEN_SIGNING_KEY`, and `OTP_HASH_KEY` in a secret manager.
- Connect an SMS provider for OTP and a credit-reference provider with written approvals and an adapter that handles their current API and consent requirements.
- Complete the CBK digital-credit-provider authorization process and ODPC obligations before switching on lending.
- M-Pesa integration must use a merchant account, verified callback handling, reconciliation, and an approved payment product. The activation fee remains off until legal review confirms the fee and disclosure.
- Keep the web service at one instance until a shared rate-limit store is configured.

See [KENYA_LAUNCH_CHECKLIST.md](KENYA_LAUNCH_CHECKLIST.md) for the launch sequence and remaining owner inputs. See [api/README.md](api/README.md) for API routes and server configuration.
