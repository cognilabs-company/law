# LexGo frontend update: packages, dashboard, CRM, meetings

Backend deployed to production:

- API: `https://lexgo.api.cognilabs.org`
- Commit: `abe84ab`
- Date: 2026-09-19

## Frontend-only item

### Login animation

This is frontend-only. Backend changes are not required.

Recommended UX:

- show loading animation after submit
- disable login button during request
- if login returns `requires_2fa`, switch to OTP/TOTP step
- if login fails, stop animation and show the backend error message

## Packages / tariffs

The product copy should use "paket" / "tarif" instead of "reja".

### List packages

`GET /subscription-plans`

New fields available:

- `audience`
- `target_roles`
- `billing_type`
- `auto_charge_provider`
- `name`
- `features`
- `monthly_price`
- `six_month_price`
- `yearly_price`
- `prepaid_yearly_price`

Use `target_roles` to show the package to the correct user type:

- `client`
- `yurist`
- `advokat`

### Admin create package

`POST /admin/subscription-plans`

Send:

```json
{
  "slug": "client-standard",
  "title": "Client Standard",
  "audience": "personal",
  "monthly_price": 149000,
  "target_roles": ["client"],
  "auto_charge_provider": "atmos",
  "billing_type": "subscription",
  "features": {
    "uz": ["..."],
    "ru": ["..."],
    "en": ["..."]
  }
}
```

### Admin edit package

`PATCH /admin/subscription-plans/{plan_id}`

Editable fields:

- `slug`
- `title`
- `description`
- `audience`
- `billing_type`
- `auto_charge_provider`
- `monthly_price`
- `six_month_price`
- `yearly_price`
- `prepaid_yearly_price`
- `is_active`
- `features`
- `name`
- `sort_order`
- `allowed_gift_durations`
- `benefits`
- `target_roles`

Allowed `target_roles`:

- `client`
- `yurist`
- `advokat`

## ATMOS recurring payment

### Buy package

`POST /subscription-plans/{plan_id}/purchase`

Request:

```json
{
  "billing_period": "monthly",
  "provider": "atmos",
  "auto_renew": true,
  "payment_method_id": "optional-card-token",
  "provider_customer_id": "optional-customer-id",
  "family_members": [],
  "provider_payload": {}
}
```

Allowed `billing_period`:

- `monthly`
- `six_month`
- `yearly`
- `prepaid_yearly`

Response:

```json
{
  "payment": {
    "id": "...",
    "provider": "atmos",
    "status": "pending",
    "amount": 149000,
    "payment_url": "https://pay.atmos.uz/invoice/..."
  },
  "subscription_id": "...",
  "status": "pending_payment",
  "next_billing_at": "..."
}
```

Frontend should redirect/open `payment.payment_url`.

### Change auto-renew

`PATCH /subscriptions/{subscription_id}/auto-renew`

Request:

```json
{
  "auto_renew": false,
  "payment_method_id": null,
  "provider_customer_id": null
}
```

## Dashboard

### Dashboard filters

`GET /admin/dashboard`

Query params:

- `region`
- `date_from`
- `date_to`

Example:

`GET /admin/dashboard?region=tashkent&date_from=2026-09-01&date_to=2026-09-30`

### Card click / drilldown

When a dashboard card is clicked, call:

`GET /admin/dashboard/drilldown`

Query params:

- `metric`
- `region`
- `date_from`
- `date_to`
- `limit`

Allowed `metric`:

- `users`
- `clients`
- `yurists`
- `advokats`
- `orders`
- `cases`
- `leads`
- `payments`
- `tasks`
- `b2b_clients`
- `reviews`

Example:

`GET /admin/dashboard/drilldown?metric=leads&region=tashkent&limit=50`

Use this for modal/table after clicking stats cards.

## CRM / leads

### Auto assignment

When admin/callcenter creates a lead without `assigned_operator_user_id`, backend automatically assigns it to the least-loaded active operator.

Eligible operators:

- `call_center`
- `sales`

### Create lead

`POST /admin/leads`

Optional field:

```json
{
  "assigned_operator_user_id": "optional-user-id"
}
```

If omitted, backend auto-distributes.

### CRM filters

`GET /admin/leads`

New query params:

- `region`
- `source`
- `assigned_operator_user_id`
- `date_from`
- `date_to`

`GET /admin/leads/kanban`

New query params:

- `region`
- `assigned_operator_user_id`

`GET /call-center/leads/kanban`

New query params:

- `region`
- `assigned_operator_user_id`

## Services

### Admin service list

`GET /admin/services`

Query params:

- `category_id`
- `q`
- `is_active`
- `executor_type`

Use this endpoint for admin edit/search page.

Existing endpoints:

- `POST /admin/services`
- `PATCH /admin/services/{service_id}`
- `DELETE /admin/services/{service_id}`
- `GET /services`
- `GET /services/search`

## Notifications

### Notification list filters

`GET /notifications`

Query params:

- `category`
- `role`
- `unread_only`

### Notification category counts

`GET /notifications/categories`

Use this for tabs/badges on notifications page.

### Admin send notification

`POST /admin/notifications`

New fields:

```json
{
  "category": "payment",
  "audience_role": "client"
}
```

## Meetings / calls

Callcenter operators, advocates and lawyers can create meetings if they have a room and permission.

Main endpoint:

`POST /secure-chats/{room_id}/calls`

Meetings are LiveKit-based and support more than two participants.

### Recording flow

Client requests recording:

`POST /secure-chats/{room_id}/calls/{call_id}/recording-request`

Callcenter/advokat/yurist/admin approves or denies:

`PATCH /secure-chats/{room_id}/calls/{call_id}/recording-permission`

Request:

```json
{
  "allowed": true,
  "reason": ""
}
```

Participant starts recording only after approval:

`POST /secure-chats/{room_id}/calls/{call_id}/recording/start`

Backend response now includes:

- `recording_status`
- `recording_requested_by_user_id`
- `recording_allowed_by_user_id`
- `recording_started_by_user_id`

WebSocket call events are broadcast for:

- `call.recording_requested`
- `call.recording_permission_updated`
- `call.recording_started`

Frontend should listen through the existing secure chat/call WebSocket instead of polling every second.

## Showcase stats data

Admin-only endpoint:

`POST /admin/showcase-data/seed`

This fills dashboard-visible data:

- leads
- payments
- tasks
- B2B records
- reviews
- promo data
- demo document templates

Use only for staging/demo presentation data.

## Tested on production

Backend smoke tests passed:

- `GET /admin/services` -> 200
- `GET /admin/dashboard` with filters -> 200
- `GET /admin/dashboard/drilldown` -> 200
- `GET /notifications/categories` -> 200
- `POST /subscription-plans/{plan_id}/purchase` with ATMOS -> 200
- `PATCH /subscriptions/{subscription_id}/auto-renew` -> 200
- `PATCH /admin/subscription-plans/{plan_id}` -> 200
- `POST /admin/leads` auto assignment -> 200
- `GET /admin/leads` filters -> 200
- `GET /admin/leads/kanban` filters -> 200
- `POST /admin/notifications` with category/role -> 200
- meeting create -> 201
- recording request -> 200
- recording permission -> 200
- recording start -> 200
