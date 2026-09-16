# LexGo Backend Implementation Update

Date: 2026-09-14
Environment: Production
API: https://lexgo.api.cognilabs.org
Latest deployed commit: fa54879

## Authentication and OTP

Files changed:

- `main.py`
- `models.py`
- `database.py`

Implemented behavior:

- Registration OTP expires after 2 minutes.
- Password reset OTP expires after 2 minutes.
- Login SMS OTP and 2FA enable OTP expire after 2 minutes.
- Resend is blocked for 60 seconds per phone and purpose.
- Maximum 10 OTP issues per phone per day across registration and OTP flows.
- Three incorrect codes block the verification request for 15 minutes.
- Expired blocks reset their attempt counter after the block period.
- Previous pending OTP records are marked `superseded` when a new OTP is issued.
- OTP values are never returned in API responses.
- Staging test OTP values are stored only in the staging test-OTP admin record and server log.
- Password reset uses the same generic response for known and unknown phone numbers.

Endpoints:

- `POST /auth/register/start`
- `POST /auth/register/verify`
- `POST /auth/password/forgot`
- `POST /auth/password/reset`
- `POST /auth/login/2fa`
- `POST /auth/2fa/start`
- `POST /auth/2fa/verify`

## Two-Factor Authentication and Sessions

Files changed:

- `main.py`
- `auth_service.py`

Implemented behavior:

- Client 2FA remains optional.
- Advocate, lawyer, advocate organization, admin, manager, call-center, and sales roles require 2FA during login.
- TOTP setup supports QR code, authenticator URI, and six-digit rotating codes.
- Mandatory roles cannot disable 2FA through `DELETE /auth/2fa`.
- Admin and manager refresh sessions expire after 2 hours of inactivity.
- Advocate, lawyer, organization, call-center, and sales refresh sessions expire after 8 hours of inactivity.
- Refreshing an inactive session revokes it and returns `401`.

## RBAC

File changed: `auth_service.py`

Implemented behavior:

- Primary user roles now automatically receive their default permission matrix.
- Explicit assigned roles still add their permissions.
- Admin has 19 management permissions.
- Lawyer and advocate have order, case, and document permissions.
- Call-center and sales roles receive their workspace permissions.
- Client receives no administrative permission by default.

This fixes false `403` responses for users whose primary role exists before an explicit assigned-role row is created.

## Fixture Seed

File changed: `marketplace_routes.py`

Implemented behavior:

- Showcase seed remains idempotent.
- Seed contains 5 service categories, 20 services, 10 advocates, 5 lawyers, 5 clients, 3 call-center users, 5 templates, leads, payment fixtures, tasks, B2B records, reviews, and audit fixtures.
- Accidental records titled `Approval Test` and `Runtime` are removed during fixture seed.

## Notification Cascade

File changed: `notification_service.py`

Implemented behavior:

- Notification channels are normalized into the common cascade: in-app, push, Telegram, email.
- Critical events additionally include SMS fallback.
- SMS is queued when Telegram is available instead of being used as the first channel.
- Unconfigured providers create `queued` notification records.
- Notification metadata and queue records are persisted in `notifications` and `marketplace_records`.

The existing notification event calls remain compatible.

## Payment Provider Abstraction

File used: `payment_provider.py`

Verified provider contract:

- `create_invoice`
- `confirm`
- `refund`
- `split`

The demo provider is disabled in production. Payme and Click return a clear `503` until their provider flags and credentials are configured.

## Identity Providers

File used: `identity_provider.py`

Implemented behavior:

- OneID and MyID use the common provider interface with `start` and `verify` methods.
- Demo verification codes are not generated in production.
- An unconfigured production provider returns `503`.
- Identity state is persisted in the existing identity verification records.

## Append-Only Audit Trail

Files changed:

- `models.py`
- `database.py`
- `main.py`
- `marketplace_routes.py`

Implemented behavior:

- Audit records now contain `previous_hash` and `event_hash`.
- Main API and marketplace activity writers create chained audit records.
- PostgreSQL trigger `user_activities_append_only` rejects audit update and delete operations.
- Existing audit filters and export response remain available through `GET /admin/audit-trail`.

## Telegram Account Linking

File changed: `main.py`

Implemented behavior:

- Authenticated users can request a one-time Telegram deep link through `POST /telegram/link/start`.
- Link validity is 10 minutes.
- Telegram webhook accepts registration OTP and account-link tokens.
- Successful linking stores `users.telegram_chat_id`.
- Used and expired links cannot be reused.

## PII Protection for AI

Files changed:

- `ai_service.py`
- `marketplace_routes.py`

Implemented behavior:

- Before external AI calls, phone numbers, email addresses, PINFL values, and passport numbers are replaced with redaction tokens.
- Chat history, current user prompts, tool-result text, document-analysis context, and seller-assistant context are masked.
- Seller AI activity logs store masked prompt text.

## Versioned Legal Consents

Files changed:

- `models.py`
- `main.py`

Implemented behavior:

- Added `consent_documents` with slug, version, title, body, active status, and creation timestamp.
- Added `user_consents` with user, consent document, version, acceptance time, and IP address.
- Startup seeds Terms, Privacy, and Legal Disclaimer version `1.0`.
- New consent versions can be accepted without overwriting previous versions.

Endpoints:

- `GET /legal/consents`
- `POST /legal/consents/{consent_id}/accept`

## Money Migration Foundation

Files changed:

- `models.py`
- `database.py`

Implemented behavior:

- Added canonical tiyin columns for payments, paid payments, orders, service packages, document requests, and subscription plan prices.
- Existing payment and paid-payment values are backfilled into tiyin columns using the legacy UZS integer as the source.

Remaining work: every write path and public response must switch fully to canonical tiyin values after reconciliation testing. The legacy fields were intentionally kept to avoid breaking existing clients.

## Business Hours and Data Residency

File changed: `marketplace_routes.py`

Implemented behavior:

- Added `GET /calendar/business-hours`.
- Schedule is Monday-Saturday, 09:00-19:00, timezone `Asia/Tashkent`.
- Response includes current working-day and working-time status.
- Added `data_residency` to `GET /integrations/status`.

Remaining work: holiday persistence and timer integration, plus infrastructure evidence for Uzbekistan data-center residency.

## Production Verification

Verified in the production Docker container:

- Application startup completed without migration errors.
- `GET /health` returns `200`.
- Production `/docs` and `/openapi.json` return `404`.
- Registration OTP response excludes `demo_otp`.
- Registration expiry is approximately 120 seconds.
- Resend returns `429` during the 60-second cooldown.
- Three wrong registration and password-reset codes result in a 15-minute block.
- Mandatory role login returns `428` for 2FA, correct OTP login returns `200`, and disabling mandatory 2FA returns `403`.
- Inactive seller session refresh returns `401`.
- Audit update mutation is rejected by the PostgreSQL append-only trigger.
- PII masking removes phone, email, PINFL, and passport values before AI input.
- Three versioned consent documents are available from `GET /legal/consents`.
- Payment provider invoice, confirm, refund, and split behavior was verified with the demo provider in container tests.

## Frontend Integration Guidance

- Never read or render OTP values from API responses.
- Use `verification_id` and `expires_at` from OTP responses.
- Handle `428` as a required 2FA step during staff login.
- Handle `429` with the server-provided cooldown or lock message.
- Use `/legal/consents` to render current documents and submit acceptance by consent ID.
- Use `/telegram/link/start` to show the account-link deep link.
- Treat notification status `queued` as waiting for provider delivery.
- Do not assume all money fields are canonical tiyin until T0-16 is completed.
