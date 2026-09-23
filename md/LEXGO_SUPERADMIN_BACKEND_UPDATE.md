# LexGo SuperAdmin backend update

Production API:

- `https://lexgo.api.cognilabs.org`
- Commit: `05a3124`
- Date: 2026-09-20

## 1. Subscription plans

### Soft delete / nofaol qilish

New endpoint:

`DELETE /admin/subscription-plans/{plan_id}`

What it does:

- deletes nothing physically
- sets `is_active = false`
- public `GET /subscription-plans` no longer returns that plan

Existing edit endpoint remains:

`PATCH /admin/subscription-plans/{plan_id}`

Frontend test flow:

1. Create or choose a plan.
2. Edit title/price/target roles.
3. Check `GET /subscription-plans`.
4. Delete plan with `DELETE /admin/subscription-plans/{plan_id}`.
5. Check that client side list no longer shows it.
6. Restore with `PATCH /admin/subscription-plans/{plan_id}` and `{ "is_active": true }` if needed.

## 2. Document templates / namunalar

New admin list endpoint:

`GET /admin/document-templates`

Query:

- `q`
- `category`
- `visibility`
- `is_active`

Existing endpoints still work:

- `POST /admin/document-templates`
- `PATCH /admin/document-templates/{template_id}`
- `DELETE /admin/document-templates/{template_id}`
- `POST /admin/document-templates/preview`

Frontend should use `GET /admin/document-templates` for admin template table because it can show inactive templates too.

## 3. Ads products

New endpoints:

`PATCH /ads/products/{product_id}`

Editable:

- `record_type`
- `title`
- `status`
- `price`
- `currency`
- `payload`

`DELETE /ads/products/{product_id}`

What it does:

- soft deletes by setting `status = deleted`

Existing:

- `POST /ads/products`
- `GET /ads/products`

## 4. Register requests + advocate/lawyer approval

Existing endpoint extended:

`GET /admin/register-requests`

New query:

- `status`
- `role`
- `date_from`
- `date_to`

Example:

`GET /admin/register-requests?role=advokat&date_from=2026-09-01&date_to=2026-09-20`

New unified endpoint:

`GET /admin/seller-requests`

Query:

- `status`
- `role`
- `date_from`
- `date_to`

Response:

- `items`
- `stats`
- `filters`

Stats includes:

- total
- advokat
- yurist
- advokat_tashkiloti
- pending
- approved
- rejected

Use this endpoint for one combined page instead of separate advocate approval page.

## 5. Register request detail with uploaded files

Existing detail endpoint improved:

`GET /admin/register-requests/{request_id}`

Now returns:

- request
- pending registration data
- linked user
- lawyer profile
- proof_documents
- verification_items
- activity

Each proof document has:

- `file_url`
- `inline_url`
- `download_url`

File preview endpoint:

`GET /admin/lawyer-proof-documents/{document_id}/file?disposition=inline`

Frontend should open this inside modal/iframe/object viewer, not a separate browser tab.

## 6. Review moderation

Existing endpoint extended:

`GET /admin/reviews`

New query:

- `status`
- `lawyer_user_id`
- `seller_type`
- `rating`
- `date_from`
- `date_to`

Example:

`GET /admin/reviews?seller_type=advokat&rating=5`

New detail endpoint:

`GET /admin/reviews/{review_id}`

Returns:

- review data
- seller
- seller_profile
- seller_type
- client
- case
- order
- raw payload

Frontend can now split review moderation by `advokat` and `yurist`, then open detail page/modal.

## 7. Legal aid

New detail endpoint:

`GET /legal-aid/requests/{request_id}`

Returns:

- request
- source
- event
- created_by
- payload
- explanation

New info endpoint:

`GET /legal-aid/info`

Use it to show what the page means or decide whether to keep/hide the page.

## 8. Meeting history

New admin list endpoint:

`GET /admin/calls`

Query:

- `status`
- `user_id`
- `room_id`
- `date_from`
- `date_to`

Returns:

- call id
- status
- title
- call type
- room id
- creator user id
- creator name
- participant count
- duration seconds
- started at
- ended at
- created/updated dates

New admin detail endpoint:

`GET /admin/calls/{call_id}`

Returns:

- call
- room
- creator
- duration_seconds
- duration_minutes
- participants
- payload

Use this for Zoom/meeting history detail page.

## 9. Approvals page explanation

New endpoint:

`GET /approvals/info`

Returns:

- module purpose
- used_for list
- status flow
- frontend note

If this page is not needed in current UI, frontend can hide it from menu. Backend remains because refund/replacement/four-eyes approval uses it.

## 10. Workflow / automation explanation

New endpoint:

`GET /workflow/info`

Returns:

- module purpose
- rules endpoint
- runs endpoint
- frontend note

If automation page is not needed in current UI, frontend can hide it from menu. Backend remains for later automation flows.

## 11. User select/search

Already available:

`GET /users/search?q={text}&role={role}&limit=20`

Use this for select inputs instead of manual user id typing.

## Production smoke tests

Passed:

- `GET /admin/seller-requests` -> 200
- `GET /admin/register-requests` with role/date filters -> 200
- `GET /admin/document-templates` -> 200
- `GET /approvals/info` -> 200
- `GET /workflow/info` -> 200
- `GET /legal-aid/info` -> 200
- `GET /admin/calls` -> 200
- `GET /admin/reviews` with seller_type/date filters -> 200
- `POST /ads/products` -> 200
- `PATCH /ads/products/{product_id}` -> 200
- `DELETE /ads/products/{product_id}` -> 200
- `DELETE /admin/subscription-plans/{plan_id}` -> 200
- `GET /admin/reviews/{review_id}` -> 200
- `GET /legal-aid/requests/{request_id}` -> 200
