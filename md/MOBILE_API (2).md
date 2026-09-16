# LexGo Backend API Guide for Mobile Apps

This document describes the mobile app integration contract. Do not hardcode a backend URL from this file. Use the environment value provided by deployment.

## Mobile Roles

The mobile app has two primary user experiences:

- Client
- Advokat

Additional internal roles are managed by admin permissions:

- Admin
- Superadmin
- Call-center lawyer
- Sales operator

## Authentication Flow

1. Register with `name`, `phone`, `password`, and role.
2. Login with `phone` and `password`.
3. Store `access_token` securely.
4. Send `Authorization: Bearer {access_token}` in protected API calls.
5. Read `roles` and `permissions` from login or `/auth/me` when showing admin, call-center, or sales modules.

Register:

`POST /auth/register`

Login:

`POST /auth/login`

Current user:

`GET /auth/me`

## Guest AI Access

Guest users can receive 5 AI answers per IP. After the limit is reached, show a login/register screen.

Limit response:

```json
{
  "detail": "AI limit tugadi. Davom etish uchun login qiling."
}
```

Authenticated users currently have no AI answer limit.

## Client App Main Sections

### Home

Use service catalog endpoints:

- `GET /service-categories`
- `GET /services`
- `GET /subscription-plans`
- `GET /lawyers`

### LexGo AI

Create chat:

`POST /clients/{client_id}/chats`

Send message:

`POST /clients/{client_id}/chats/{chat_id}/messages`

Get chat:

`GET /clients/{client_id}/chats/{chat_id}`

Realtime:

`/ws/clients/{client_id}/chats/{chat_id}?token={access_token}`

### Document Generation

When the AI creates a contract or legal document, the response contains the PDF file in `contracts`.

```json
{
  "contracts": [
    {
      "id": "contract_id",
      "file_name": "document.pdf",
      "mime_type": "application/pdf",
      "file_base64": "JVBERi0x...",
      "inline_url": "/contracts/contract_id/file",
      "download_url": "/contracts/contract_id/download"
    }
  ]
}
```

Render the file from `file_base64` or open `inline_url` in an in-app web view.

### Online Legal Services

Create order:

`POST /orders`

List orders:

`GET /orders`

Orders support AI-generated services, online consultation, video consultation, second opinion, written legal conclusion, and lawyer-assisted services.

### My Cases

Create case:

`POST /cases`

List cases:

`GET /cases`

Cases include:

- `case_number`
- `case_type`
- `stage`
- `status`
- `next_action`
- `deadline_at`

### Payments

Create payment record:

`POST /payments`

Providers planned:

- `payme`
- `click`
- `rahmat`

### Subscriptions

Plans:

`GET /subscription-plans`

Planned products:

- Standard subscription
- Premium subscription
- Gift subscription

## Advokat App Main Sections

### Lawyer Profile

Create or update profile:

`PUT /lawyers/me`

Required profile fields:

- Region
- District
- License number
- Bar association
- Experience years
- Specializations
- Languages
- Biography
- Education
- Wins count
- Partial wins count
- Base hourly price

### Case Marketplace

Current MVP uses service orders and cases:

- `GET /orders`
- `POST /cases`

Accept, decline, and request-more-information status endpoints will be added in the next phase.

### My Cases

Use:

- `GET /cases`

Mobile UI should group cases by:

- Active
- New
- Investigation
- Court
- Appeal
- Completed
- Archived

### Secure Chat

Use the same chat and WebSocket structure. Future secure-chat media support should attach:

- Text
- Documents
- Photos
- Voice
- Video call metadata
- Read status

## Notifications

Admin notification creation exists:

`POST /admin/notifications`

Planned channels:

- Push
- SMS

Mobile should be ready to display notifications and reminders for:

- Case deadlines
- Court dates
- Investigation actions
- Payment updates
- Lawyer response SLA

## Contact Blocking

The platform should prevent clients and lawyers from bypassing LexGo payments by sharing direct contacts in platform chats.

Recommended future behavior:

1. Detect phone numbers, Telegram usernames, emails, and external payment instructions in chat messages.
2. Warn the sender before sending.
3. Block repeat attempts.
4. Allow admins to review flagged messages.
5. Explain that LexGo warranty and protection apply only to platform payments.

This feature is not a normal AI legal answer feature. It is a platform safety and revenue-protection layer.

## Languages

The mobile app should fully support:

- Uzbek Latin
- Uzbek Cyrillic
- Russian
