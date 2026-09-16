# LexGo Backend Update

Project: Law Marketplace
Backend URL: https://lexgo.api.cognilabs.org

## Done

- `GET /lawyers/me/stats` now returns real `workload.unread_messages` from secure-chat notifications.
- `GET /lawyers/me/stats` keeps `courts_today`, `documents_to_review`, `earnings_today`, `earnings_via_lexgo`, `payable`.
- `GET /lawyers/me/clients` no longer duplicates clients and now includes:
  - `orders_count`
  - `active_case_ids`
- `POST /calendar-events` accepts `reminder_minutes_before`.
- `PATCH /calendar-events/{event_id}` accepts `reminder_minutes_before`.
- Calendar responses include `reminder_scheduled`.
- Order lifecycle now creates notifications for create, assigned, accepted, declined, payment update, and status update.
- Secure chat messages now create `secure_chat` notifications for the other participant, so unread counters can update.
- Document request flow now creates notifications for request created, payment created, and file ready.
- Seller register approval/rejection now creates in-app/push/SMS queued notifications.
- `GET /admin/audit-trail` now supports `date_from`, `date_to`, and `export=json|csv` metadata.
- `GET /integrations/status` now returns admin-ready fields: `label`, `category`, `can_test`, `requires_superadmin`, `secret_exposed=false`.
- Production `/docs` and `/openapi.json` are closed; `/docs` returns 404.

## Frontend Notes

- Use `/notifications/unread-count` for global unread badge.
- Use `GET /lawyers/me/stats.workload.unread_messages` for seller home message badge.
- Calendar reminder UI can send `reminder_minutes_before: 30` or any non-negative integer.
- Integrations page must not expect secrets from backend; only status metadata is returned.
- Admin audit page can filter with `date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`.

## Verified On Production

- `/health` returns 200.
- `/docs` returns 404 in production.
- Container smoke test passed: order create, accept, secure chat message, seller stats, calendar reminder, lawyer clients, audit trail, integrations status.
