# LexGo Law Marketplace — e2e test results

Ran against the **live** backend `https://lexgo.api.cognilabs.org` through the
frontend proxy. Tokens obtained via `POST /auth/login` for client, superadmin
and call-center roles. No secrets are stored in this file.

**Result: 35 / 35 checks pass.**

## Auth & registration
- `POST /auth/login` (client / superadmin / call-center) — 200
- `POST /auth/register/start` with `first_name` + `last_name` — 200

## Client GET
- `/referrals/me`, `/reviews/pending`, `/reviews/me`, `/complaints`,
  `/warranty/claims`, `/academy/courses/catalog`, `/matching/me`,
  `/users/me/activity`, `/clients/me/family-members`, `/gifts` — all 200

## Admin GET (superadmin)
- `/admin/complaints`, `/calls/analytics`, `/analytics/ceo`,
  `/quality/overview`, `/b2b/clients`, `/retention/overview`, `/tasks/me` — all 200

## POST / mutations
- `POST /sos` — 200 (returns duty_lawyer + chat_room_id)
- `POST /ai/classify` — 200 (`routed_to: call_center`, `lead_id` created)
- `POST /ai/document-analysis` — 200
- `POST /ai/assistant` — 200
- `POST /complaints` — 200 (module record: record_type / payload)
- `POST /warranty/claims` — 200 (module record)
- `POST /gifts` (service) — 201
- `POST /gifts` (plan) — 201 **with a giftable plan**; a non-giftable plan
  returns 404 "Giftable plan topilmadi". The gifts UI only offers
  `is_giftable` plans, so this is handled correctly.
- `POST /clients/me/family-members` — 201, `DELETE` — 200
- `PATCH /clients/me/family-members/{id}` `{shared_access}` — 402 when the owner
  has no active plan (business rule); the UI now shows "active plan required".
- `POST /secure-chats/{room}/zoom` (call-center) — 200 (join/start URL)
- `PATCH /secure-chats/{room}/settings` (call-center) — 200
- Call permission: a **client** POSTing to `/secure-chats/{room}/zoom` — 403
  (only call-center roles may start calls) ✓

## UI e2e (screenshots, real data through the proxy)
- Matched lawyers — 10 real advocates with match % and reason
- Academy — 2 real courses (category filter)
- CEO dashboard — real revenue / users / conversion / funnel

## Notes / not covered
- `DELETE /secure-chats/{room}` — endpoint + schema confirmed; not run live to
  avoid deleting real rooms.
- `POST /reviews` — needs a completed case; none available in the test account.
- Empty live data for some lists (channels attribution, revenue trend,
  tasks / b2b / reviews) is backend seeding, not a frontend issue; normalizers
  read the module-record shape (record_type / title / payload) with fallbacks.
