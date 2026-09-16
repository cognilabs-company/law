# LexGo Web Frontend API Guide

Use the deployment-provided backend URL. Do not hardcode localhost in production.

## Auth

`POST /auth/register`

```json
{
  "role": "client",
  "name": "Ali Valiyev",
  "phone": "+998901234567",
  "password": "12345678"
}
```

Allowed roles: `client`, `yurist`, `advokat`, `advokat_tashkiloti`, `admin`, `manager`, `call_center`, `sales`.

`POST /auth/login`

```json
{
  "phone": "+998901234567",
  "password": "12345678"
}
```

Use `Authorization: Bearer {access_token}` for protected endpoints. Read `roles` and `permissions` from `/auth/me`.

## AI Chat

Guests get 5 AI answers per IP. Authenticated users are not limited yet.

`POST /clients/{client_id}/chats`

`GET /clients/{client_id}/chats`

`GET /clients/{client_id}/chats/{chat_id}`

`POST /clients/{client_id}/chats/{chat_id}/messages`

WebSocket: `/ws/clients/{client_id}/chats/{chat_id}?token={access_token}`

AI no longer creates paid legal documents directly inside chat. For contracts or applications, show the AI questionnaire answer, then create a document request and payment flow.

## Catalog

`GET /service-categories`

`GET /services`

Query params: `category_id`, `q`, `executor_type`, `catalog_only`.

`catalog_only` defaults to `true`, so the public list shows the official 129-service LexGo catalog.

Each service can include LexGo catalog metadata: `catalog_code`, `title_uz_cyrl`, `title_uz_latn`, `title_ru`, `executor_type`, `advokat_required`, `pricing_tier`, `standard_price`, `refund_code`, `sla_code`, `ai_category`.

`GET /service-packages`

Query params: `package_code`, `tariff`.

The backend seeds 129 services, 26 categories, 75 package tariffs, and 7 subscription plans from the TZ Excel files.

## Seller Profiles

`PUT /lawyers/me`

Works for `yurist`, `advokat`, and `advokat_tashkiloti`.

```json
{
  "seller_type": "advokat",
  "region": "Toshkent",
  "district": "Yunusobod",
  "license_number": "LICENSE-001",
  "bar_association": "Toshkent",
  "experience_years": 7,
  "specializations": ["civil", "contracts"],
  "languages": ["uz-latn", "uz-cyrl", "ru"],
  "bio": "Profile text",
  "education": "University",
  "wins_count": 12,
  "partial_wins_count": 4,
  "base_hourly_price": 300000
}
```

`GET /lawyers`

Query params: `region`, `specialization`, `service_id`.

`GET /lawyers/me/services`

`PUT /lawyers/me/services`

```json
{
  "service_ids": ["service_id_1"],
  "selected_prices": {
    "service_id_1": 300000
  }
}
```

`POST /lawyers/me/verifications`

`POST /admin/lawyers/{lawyer_user_id}/verify`

## Organizations

`POST /organizations`

`GET /organizations`

`POST /organizations/{organization_id}/members`

`GET /organizations/{organization_id}/members`

Use this for advocate organizations and their internal roles.

## Orders And Cases

`POST /orders`

```json
{
  "service_id": "service_id",
  "package_id": "package_id",
  "lawyer_user_id": "seller_user_id",
  "source": "web",
  "details": {}
}
```

`GET /orders`

`POST /cases`

`GET /cases`

Order response includes `payment_status` and `contact_unlocked`. Contact should stay inside platform chat even after payment.

## Document Requests

`POST /document-requests`

```json
{
  "template_id": "optional_template_id",
  "order_id": "optional_order_id",
  "document_type": "contract",
  "title": "Ikki firma kelishuvi",
  "questionnaire": [
    { "name": "party_a", "label": "Party A legal name", "required": true }
  ],
  "answers": {},
  "price": 300000,
  "currency": "UZS"
}
```

`PUT /document-requests/{request_id}/answers`

`POST /document-requests/{request_id}/payments`

`GET /document-requests/{request_id}`

The PDF file is returned only after payment is confirmed:

```json
{
  "status": "file_ready",
  "contract_file": {
    "id": "contract_id",
    "file_name": "Ikki firma kelishuvi-contract_id.pdf",
    "mime_type": "application/pdf",
    "file_base64": "JVBERi0x...",
    "inline_url": "/contracts/contract_id/file",
    "download_url": "/contracts/contract_id/download"
  }
}
```

Render the file from `file_base64`; do not show a plain text download link as the only result.

## Templates

`GET /document-templates`

Staff templates are visible only to users with `templates.manage` or `callcenter.access`. Client-facing templates must have `visibility: "client"`.

## Payments

`POST /payments`

Supported provider values for the first version: `payme`, `click`.

Admin confirmation while real provider callbacks are not connected:

`POST /admin/payments/{payment_id}/mark-paid`

## Secure Chat

`POST /secure-chats`

`GET /secure-chats`

`POST /secure-chats/{room_id}/messages`

`GET /secure-chats/{room_id}/messages`

Phone numbers, Telegram usernames, WhatsApp, and external links are blocked in text messages. The UI should display `filtered_content`; if `is_blocked` is true, show `block_reason`.

## Approvals

Refund and lawyer replacement approvals require four-eyes flow.

`POST /approvals`

`GET /approvals`

`POST /approvals/{approval_id}/admin-approve`

`POST /approvals/{approval_id}/manager-approve`

Final status becomes `approved` only after both admin and manager approvals.

## Leads

`POST /leads`

`GET /admin/leads`

Use leads for web forms, AI lead capture, ads, and sales call-center.

## Subscriptions

`GET /subscription-plans`

Plans include monthly, 6-month, yearly, and prepaid yearly prices where available.
