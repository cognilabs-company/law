# LexGo Backend Delivery Status

## Completed

- T0-02 OTP security: two-minute expiry, resend cooldown, daily limit, three-attempt lock, no OTP in API responses.
- T0-04 Password reset: secure reset flow, account-enumeration protection, OTP expiry, cooldown, lockout, and one-time use.
- T0-05 Two-factor authentication: mandatory 2FA for internal, advocate, lawyer, and organization roles; TOTP and SMS flows; inactivity session timeouts.
- T0-06 RBAC: primary-role permission matrix plus assigned-role permissions.
- T0-07 Fixtures: idempotent fixture seed and cleanup of accidental test records.
- T0-08 Notifications: in-app, push, Telegram, email, and critical-event SMS fallback with queued provider states.
- T0-09 Payments: provider abstraction with invoice, confirm, refund, and split operations.
- T0-10 Identity: OneID/MyID provider abstraction with production demo-code protection.
- T0-11 Audit trail: hash-chain fields and PostgreSQL append-only trigger preventing update/delete.
- T0-15 Telegram: one-time account-link deep links, expiry, webhook linking, and Telegram chat persistence.
- T0-17 PII protection: phone, email, PINFL, and passport masking before AI calls and in AI activity logs.
- T0-18 Legal consents: versioned terms, privacy, and legal-disclaimer documents with acceptance API.

## Remaining

- 354 V1.1 review: remains open because the full product review requires final confirmation of the unresolved T3-06 balance-refund decision and complete PM sign-off.
- T0-16 Money in tiyin: canonical tiyin columns and initial backfill foundation exist, but all write paths and public response contracts still need conversion and reconciliation testing. It was intentionally not marked Done to avoid multiplying existing production amounts incorrectly.
- T0-19 Uzbekistan hosting: production data-residency status reporting exists, but infrastructure-level Uzbekistan hosting evidence and provider confirmation are still required before completion.
- T0-20 Business-hours calendar: Asia/Tashkent Monday-Saturday 09:00-19:00 schedule endpoint exists, but holiday storage, holiday management, and business-time timer integration are still required.

## Deployment

- Production: https://lexgo.api.cognilabs.org
- Health check: passing
- Production API docs: disabled and returns 404
- Latest commit: fa54879

## Frontend Integration Notes

- Consume the existing auth, 2FA, consent, identity, notification, and business-hours endpoints from the production API.
- Do not display OTP values from API responses.
- Treat queued notification channels as pending provider delivery.
- Treat money fields as transitional until T0-16 is completed and the canonical tiyin response contract is released.
