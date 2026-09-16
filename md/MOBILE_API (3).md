# LexGo Mobile API Guide

Use the backend URL provided by deployment. Store JWT tokens securely.

## Roles

Primary app roles: `client`, `yurist`, `advokat`, `advokat_tashkiloti`.

Internal roles: `admin`, `manager`, `call_center`, `sales`.

Organization users can be attached to an advocate organization with internal role permissions.

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

`POST /auth/login`

`GET /auth/me`

OTP/SMS provider is not fixed yet. Build the mobile UI so an OTP step can be inserted later.

## AI

Guest users can receive 5 AI answers per IP. After that, show login/register.

`POST /clients/{client_id}/chats`

`GET /clients/{client_id}/chats`

`GET /clients/{client_id}/chats/{chat_id}`

`POST /clients/{client_id}/chats/{chat_id}/messages`

Realtime: `/ws/clients/{client_id}/chats/{chat_id}?token={access_token}`

AI should ask for document questionnaire fields. It should not be treated as the final PDF generator. PDF appears only after document request payment is confirmed.

## Client Home

Use:

- `GET /service-categories`
- `GET /services`
- `GET /service-packages`
- `GET /subscription-plans`
- `GET /lawyers`

Service filters: `category_id`, `q`, `executor_type`, `catalog_only`.

`catalog_only` defaults to `true`, so mobile receives the official 129-service LexGo catalog.

Lawyer filters: `region`, `specialization`, `service_id`.

## Document Flow

1. AI or UI asks questionnaire fields.
2. App creates document request.
3. Client fills answers.
4. Client pays through Payme or Click.
5. Backend returns PDF file object after payment confirmation.

`POST /document-requests`

`PUT /document-requests/{request_id}/answers`

`POST /document-requests/{request_id}/payments`

`GET /document-requests/{request_id}`

When `status` is `file_ready`, render:

```json
{
  "contract_file": {
    "file_name": "document.pdf",
    "mime_type": "application/pdf",
    "file_base64": "JVBERi0x...",
    "inline_url": "/contracts/contract_id/file",
    "download_url": "/contracts/contract_id/download"
  }
}
```

The mobile UI should open the actual PDF file, not only show a download URL.

## Orders

`POST /orders`

```json
{
  "service_id": "service_id",
  "package_id": "package_id",
  "lawyer_user_id": "seller_user_id",
  "source": "mobile",
  "details": {}
}
```

`GET /orders`

Order fields include `status`, `payment_status`, `contact_unlocked`, `price`, and `currency`.

## Cases

`POST /cases`

`GET /cases`

Use cases for My Cases, deadlines, stages, command center, and seller/client tracking.

## Seller App

`PUT /lawyers/me`

Works for `yurist`, `advokat`, `advokat_tashkiloti`.

Seller capability selection:

`GET /lawyers/me/services`

`PUT /lawyers/me/services`

```json
{
  "service_ids": ["service_id"],
  "selected_prices": {
    "service_id": 300000
  }
}
```

Verification:

`POST /lawyers/me/verifications`

Admin manual approval:

`POST /admin/lawyers/{lawyer_user_id}/verify`

## Organizations

`POST /organizations`

`GET /organizations`

`POST /organizations/{organization_id}/members`

`GET /organizations/{organization_id}/members`

Use this for advocate organizations and their staff.

## Secure Chat

`POST /secure-chats`

`GET /secure-chats`

`POST /secure-chats/{room_id}/messages`

`GET /secure-chats/{room_id}/messages`

Always display `filtered_content`. If `is_blocked` is true, show `block_reason`. Phone numbers, Telegram, WhatsApp, and external links are blocked so communication stays inside LexGo.

Voice and video call UI should use the same room model. A signaling/media service can be connected later without changing room ownership.

## Payments

`POST /payments`

First provider values: `payme`, `click`.

Temporary admin confirmation:

`POST /admin/payments/{payment_id}/mark-paid`

After an order payment reaches at least 10% of the order price, `contact_unlocked` can become true, but the UI should still keep communication inside platform chat.

## Approvals

`POST /approvals`

`GET /approvals`

`POST /approvals/{approval_id}/admin-approve`

`POST /approvals/{approval_id}/manager-approve`

Refunds and replacements become approved only after both approvals.

## Leads

`POST /leads`

`GET /admin/leads`

Use leads for AI capture, free consultation forms, sales call-center, and ads.

## Staff Templates

`GET /document-templates`

Call-center lawyers can see staff templates. Ordinary clients should not receive staff-only templates.
