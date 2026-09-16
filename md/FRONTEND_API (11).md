# LexGo Backend API Guide for Web Frontend

This document describes the backend contract for the web frontend. Do not hardcode a backend URL from this file. Use the environment value provided by deployment.

## Authentication

### Register

`POST /auth/register`

```json
{
  "role": "client",
  "name": "Ali Valiyev",
  "phone": "+998901234567",
  "password": "12345678"
}
```

Allowed initial roles:

- `client`
- `advokat`

### Login

`POST /auth/login`

```json
{
  "phone": "+998901234567",
  "password": "12345678"
}
```

Response:

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "user": {
    "id": "...",
    "role": "client",
    "name": "Ali Valiyev",
    "phone": "+998901234567",
    "roles": ["superadmin"],
    "permissions": ["roles.manage", "services.manage"],
    "created_at": "..."
  }
}
```

Use the token in protected requests:

`Authorization: Bearer {access_token}`

### Current User

`GET /auth/me`

Returns the authenticated user with dynamic admin roles and permissions.

## Guest AI Limit

Guests can receive 5 AI answers per IP. Authenticated users currently have no AI limit.

Limit response:

```json
{
  "detail": "AI limit tugadi. Davom etish uchun login qiling."
}
```

## AI Chat

### Create Chat

`POST /clients/{client_id}/chats`

```json
{
  "title": "New chat"
}
```

### List Client Chats

`GET /clients/{client_id}/chats`

Returns chat summaries with the last message.

### Get Chat Detail

`GET /clients/{client_id}/chats/{chat_id}`

Returns messages and generated contract files.

### Send Message

`POST /clients/{client_id}/chats/{chat_id}/messages`

```json
{
  "content": "I need a contract between two companies"
}
```

If the AI creates a document, the PDF file is returned inside `contracts`.

```json
{
  "assistant_message": {
    "content": "PDF shartnoma fayl ko'rinishida tayyor."
  },
  "contracts": [
    {
      "id": "contract_id",
      "contract_type": "Cooperation agreement",
      "status": "ready",
      "download_url": "/contracts/contract_id/download",
      "inline_url": "/contracts/contract_id/file",
      "file_name": "Cooperation agreement-contract_id.pdf",
      "mime_type": "application/pdf",
      "file_base64": "JVBERi0x..."
    }
  ]
}
```

The frontend must render PDF attachments from `contracts`, not by parsing links from assistant text.

## WebSocket

`/ws/clients/{client_id}/chats/{chat_id}?token={access_token}`

Send:

```json
{
  "content": "Question text"
}
```

Receive:

```json
{
  "event": "message.created",
  "message": {},
  "contracts": []
}
```

## PDF Files

Inline view:

`GET /contracts/{contract_id}/file`

Download:

`GET /contracts/{contract_id}/download`

Base64 rendering:

```js
const bytes = Uint8Array.from(atob(contract.file_base64), c => c.charCodeAt(0));
const blob = new Blob([bytes], { type: contract.mime_type });
const url = URL.createObjectURL(blob);
```

## Lawyer Profiles

### Upsert My Lawyer Profile

`PUT /lawyers/me`

Requires an authenticated `advokat` user.

```json
{
  "region": "Toshkent",
  "district": "Yunusobod",
  "license_number": "LICENSE-001",
  "bar_association": "Toshkent advokatlar palatasi",
  "experience_years": 7,
  "specializations": ["criminal", "civil"],
  "languages": ["uz-latn", "uz-cyrl", "ru"],
  "bio": "Short biography",
  "education": "University",
  "wins_count": 12,
  "partial_wins_count": 4,
  "base_hourly_price": 300000
}
```

### List Lawyers

`GET /lawyers`

Optional filters:

- `region`
- `specialization`

## Service Catalog

Public:

- `GET /service-categories`
- `GET /services`

Admin:

- `POST /admin/service-categories`
- `POST /admin/services`

## Orders and Cases

Create order:

`POST /orders`

```json
{
  "service_id": "...",
  "lawyer_user_id": "...",
  "source": "web",
  "details": {
    "question": "Client request"
  }
}
```

List my orders:

`GET /orders`

Create case:

`POST /cases`

List my cases:

`GET /cases`

## Document Templates

Public:

- `GET /document-templates`

Admin:

- `POST /admin/document-templates`

Templates support:

- `category`
- `language`
- `fields`
- `template_text`
- `price`

## Payments

`POST /payments`

```json
{
  "provider": "payme",
  "amount": 100000,
  "currency": "UZS",
  "provider_payload": {}
}
```

Current providers planned:

- `payme`
- `click`
- `rahmat`

The current API stores payment intent records. Real provider callbacks will be added later.

## Subscriptions

Public:

- `GET /subscription-plans`

Admin:

- `POST /admin/subscription-plans`

Planned plans:

- Standard
- Premium
- Gift subscription

## Admin Roles and Permissions

Superadmin can create custom roles and assign permissions.

Bootstrap:

`POST /admin/bootstrap-superadmin`

Permissions:

`GET /admin/permissions`

Roles:

- `GET /admin/roles`
- `POST /admin/roles`
- `POST /admin/users/assign-role`

## Languages

The frontend should support:

- Uzbek Latin
- Uzbek Cyrillic
- Russian
