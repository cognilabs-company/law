# Frontend tests

Three kinds. Lint, typecheck, unit and browser tests also run in CI on every push and pull request to `main` (`.github/workflows/ci.yml`).

| Command | What | Needs |
|---|---|---|
| `npm run lint`, `npm run typecheck` | ESLint and TypeScript over the whole app and the tests. | nothing |
| `npm test` | Unit tests (`tests/unit`, Vitest): the rules the frontend applies to backend data — contact detection, upload limits, order phases, price snapshots, tariff and promotion rules, monitoring events. | nothing |
| `npm run e2e` | Browser tests (`tests/e2e`, Playwright + system Chrome) of the real pages against a **mocked backend**. | a free port 3120 (it starts `next dev`) |
| `SMOKE_URL=https://… npm run smoke` | Read-only checks of a **deployed** site after a release (`tests/smoke`). | the deployed URL |

## Safety

- **e2e**: `tests/e2e/mock.ts` answers every API request itself. Unknown reads get `404`; any other method that a test does not handle is refused and recorded in `mock.refused`, so a test can never write real data or move money. Realtime sockets connect to the mock too; tests can push events (`mock.push`) and drop the connection (`mock.drop`).
- **smoke**: every non-GET request is refused in the browser before it leaves, so a check against production cannot create an order, a payment or a message.
- Test accounts are fake sessions written to browser storage (`signIn` in `mock.ts`); no real credentials are used or stored.

## What the browser tests cover

| Area | Spec |
|---|---|
| Client journey: marketplace → profile → purchase → payment confirmed → chat | `journey-client.spec.ts` |
| Seller journey: answer deadline, accept, decline reason, expired window, start, complete | `journey-seller.spec.ts` |
| Order realtime: event refetch, duplicates, out-of-order events, other orders, reconnect resync | `realtime-order.spec.ts` |
| Price breakdown, commission privacy, payment stages, chat lock before payment | `order-pricing.spec.ts` |
| Rating and complaint window | `rating-complaint.spec.ts` |
| Privacy: public profile, unrated sellers, contacts in chat and in "about me" | `profile-privacy`, `unrated-seller`, `chat-contacts`, `experience-contacts` |
| Call center refund decision, double submits | `callcenter-cancellation`, `double-submit` |
| Admin: roles, monitoring, tariff versions and feature registry | `admin-roles`, `admin-monitoring`, `admin-tariffs` |
| Subscriber plan and renewal consent | `my-plan.spec.ts` |
| Studio: rule versions (K31), promotions (MP09), removed constructors | `studio-*.spec.ts` |

Studio schemas in `tests/e2e/fixtures/*.json` were recorded from the live API (read-only) and trimmed; regenerate them when a constructor's schema changes.

## After a deployment

1. `SMOKE_URL=<deployed url> npm run smoke` (or GitHub Actions → **Smoke** → Run workflow) — pages load without errors, the API answers through the site, the backend's `/health` says ok, `/api/version` names the deployed commit, a signed-out visitor is sent to sign in, and the read-only guard blocks writes.
2. Check the admin **Monitoring** page: integrations healthy, no open incidents, error rate normal.

## Not covered here (backend)

Database concurrency and idempotency, payment provider callbacks, load tests, rollback and recovery — these belong to the backend test suite.
