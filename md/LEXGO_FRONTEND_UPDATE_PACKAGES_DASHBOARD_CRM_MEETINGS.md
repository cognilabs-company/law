# LexGo frontend update

Backend productionga deploy qilindi:

- API: `https://lexgo.api.cognilabs.org`
- Oxirgi commitlar: `6ad1d4b`, `abe84ab`
- Sana: 2026-09-19

## 1. Login animation

Bu frontend tarafdagi ish.

Frontend:

- login button bosilganda loading animation chiqarsin
- request ketayotgan paytda button disabled bo'lsin
- login xato bo'lsa backend error message ko'rsatilsin
- login `requires_2fa` qaytarsa OTP/TOTP oynasiga o'tsin

## 2. Paket / tarif

"Rejalar" emas, UI matnlarda "Paket" yoki "Tarif" ishlatilsin.

### Paketlar ro'yxati

`GET /subscription-plans`

Yangi fieldlar:

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

`target_roles` bo'yicha paket kimga tegishli ekanini aniqlaysiz:

- `client`
- `yurist`
- `advokat`

## 3. Admin tarif yaratish va edit qilish

### Create

`POST /admin/subscription-plans`

Example:

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

### Edit

`PATCH /admin/subscription-plans/{plan_id}`

Editable fieldlar:

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

## 4. ATMOS payment va auto-renew

### Paket sotib olish

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

Frontend `payment.payment_url` ni ochadi.

### Auto-renew update

`PATCH /subscriptions/{subscription_id}/auto-renew`

Request:

```json
{
  "auto_renew": false,
  "payment_method_id": null,
  "provider_customer_id": null
}
```

## 5. Dashboard

### Filterlar

`GET /admin/dashboard`

Query:

- `region`
- `date_from`
- `date_to`

Example:

`GET /admin/dashboard?region=tashkent&date_from=2026-09-01&date_to=2026-09-30`

### Card bosilganda detail

`GET /admin/dashboard/drilldown`

Query:

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

## 6. CRM / leadlar

Lead create qilinganda `assigned_operator_user_id` yuborilmasa backend avtomatik eng kam yuklangan operatorga beradi.

Operator rolelari:

- `call_center`
- `sales`

### Create lead

`POST /admin/leads`

Optional:

```json
{
  "assigned_operator_user_id": "optional-user-id"
}
```

### Filterlar

`GET /admin/leads`

Query:

- `region`
- `source`
- `assigned_operator_user_id`
- `date_from`
- `date_to`

`GET /admin/leads/kanban`

Query:

- `region`
- `assigned_operator_user_id`

`GET /call-center/leads/kanban`

Query:

- `region`
- `assigned_operator_user_id`

## 7. Xizmatlar

Admin service list:

`GET /admin/services`

Query:

- `category_id`
- `q`
- `is_active`
- `executor_type`

Admin edit/search page shu endpointdan foydalansin.

Mavjud endpointlar:

- `POST /admin/services`
- `PATCH /admin/services/{service_id}`
- `DELETE /admin/services/{service_id}`
- `GET /services`
- `GET /services/search`

## 8. Notifications

### List filter

`GET /notifications`

Query:

- `category`
- `role`
- `unread_only`

### Category count

`GET /notifications/categories`

Bu notifications page tab/badge uchun.

### Admin notification

`POST /admin/notifications`

New fields:

```json
{
  "category": "payment",
  "audience_role": "client"
}
```

## 9. Meeting / calls

Callcenter operator, advokat va yurist meeting qila oladi.

Create call:

`POST /secure-chats/{room_id}/calls`

Meeting LiveKit orqali ishlaydi va 2 tadan ko'p odamni qo'llaydi.

### Recording flow

Client recording so'raydi:

`POST /secure-chats/{room_id}/calls/{call_id}/recording-request`

Callcenter/advokat/yurist/admin ruxsat beradi yoki rad qiladi:

`PATCH /secure-chats/{room_id}/calls/{call_id}/recording-permission`

Request:

```json
{
  "allowed": true,
  "reason": ""
}
```

Recording faqat approve bo'lgandan keyin boshlanadi:

`POST /secure-chats/{room_id}/calls/{call_id}/recording/start`

Response ichida:

- `recording_status`
- `recording_requested_by_user_id`
- `recording_allowed_by_user_id`
- `recording_started_by_user_id`

WebSocket eventlar:

- `call.recording_requested`
- `call.recording_permission_updated`
- `call.recording_started`

Frontend har sekund polling qilmasin, mavjud secure chat/call WebSocket orqali eventlarni tinglasin.

## 10. Showcase stats

Admin-only:

`POST /admin/showcase-data/seed`

Dashboard ko'rsatish uchun data yaratadi:

- leads
- payments
- tasks
- B2B records
- reviews
- promo data
- demo document templates

Faqat staging/demo presentation uchun ishlatilsin.

## Production test natijalari

Tekshirildi:

- `GET /admin/services` -> 200
- `GET /admin/dashboard` filter bilan -> 200
- `GET /admin/dashboard/drilldown` -> 200
- `GET /notifications/categories` -> 200
- `POST /subscription-plans/{plan_id}/purchase` ATMOS bilan -> 200
- `PATCH /subscriptions/{subscription_id}/auto-renew` -> 200
- `PATCH /admin/subscription-plans/{plan_id}` -> 200
- `POST /admin/leads` auto assignment -> 200
- `GET /admin/leads` filter bilan -> 200
- `GET /admin/leads/kanban` filter bilan -> 200
- `POST /admin/notifications` category/role bilan -> 200
- meeting create -> 201
- recording request -> 200
- recording permission -> 200
- recording start -> 200
