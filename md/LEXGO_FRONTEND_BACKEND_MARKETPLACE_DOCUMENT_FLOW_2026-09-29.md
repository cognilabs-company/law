# LexGo frontend update — document flow hardening + Marketplace

Sana: 2026-09-29
Backend: `https://lexgo.api.cognilabs.org`
Commitlar: `3a3875d`, `d434120`

## 1. Bitta hujjatga qayta advokat so'rovi bloklandi

Endi bitta client + bitta template/document bo'yicha tirik advokat so'rovi bo'lsa backend yangi so'rovni qabul qilmaydi.

Tirik statuslar:

```text
open_pool, claimed, in_progress, review, lawyer_review, pending_payment
```

Tekshirilgan endpointlar:

```http
POST /services/{service_id}/document-lawyer/request
POST /services/{service_id}/document-lawyer/request-with-files
POST /document-requests/{request_id}/lawyer-review
```

Duplicate holatda backend:

```http
409 Conflict
```

Response:

```json
{
  "detail": {
    "detail": "Bu hujjat bo'yicha so'rovingiz allaqachon advokatga berilgan.",
    "code": "document_lawyer_request_already_open",
    "request": {
      "id": "DOCUMENT_REQUEST_ID",
      "work_id": "LGD-20260929-XXXXXXXX",
      "status": "open_pool"
    },
    "lawyer_request": {}
  }
}
```

Frontend vazifa:

- `409` va `code=document_lawyer_request_already_open` kelsa, modal/toast ko'rsating.
- Yangi request yaratmang.
- `lawyer_request` ichidagi `status`, `chat`, `editor_url`, `meeting_url`dan mavjud ishga qaytish uchun foydalaning.

Production test:

- Birinchi request: `201`
- Ikkinchi request: `409 document_lawyer_request_already_open`

## 2. Document request list boyitildi

Endpoint:

```http
GET /document-requests
```

Har bir item endi shularni beradi:

```json
{
  "id": "...",
  "template_id": "...",
  "document_type": "lawyer_assisted_service_document",
  "mode": "lawyer",
  "title": "...",
  "status": "open_pool",
  "status_label": "Navbatchi advokat kutilmoqda",
  "price": 0,
  "price_tiyin": 0,
  "currency": "UZS",
  "requested_document_type": "Ariza",
  "requested_document_type_is_custom": false,
  "lawyer_request_active": true,
  "can_send_lawyer_request": false,
  "created_at": "..."
}
```

Frontend vazifa:

- Advokat/konstruktor/AI farqlash uchun endi `mode` va `document_type`dan foydalaning.
- `status_label` bor bo'lsa ishlating, lekin UI localization o'zingizda qolishi mumkin.
- `lawyer_request_active=true` bo'lsa advokatga qayta yuborish tugmasini bloklang.

## 3. Document request detail boyitildi

Endpoint:

```http
GET /document-requests/{id}
```

Endi detail ichida qo'shildi:

```json
{
  "mode": "lawyer",
  "status_label": "Advokat hujjatni tayyorlamoqda",
  "assigned_lawyer": {},
  "lawyer_request": {},
  "lawyer_request_active": true,
  "can_send_lawyer_request": false,
  "lawyer_request_block_reason": "...",
  "constructor_action": {},
  "requested_document_type": "Sud hujjati",
  "requested_document_type_is_custom": false,
  "payment_gate": {},
  "payment_required": false,
  "page_count": 0
}
```

`constructor_action` formati:

```json
{
  "available": true,
  "prompt_required": true,
  "event": "document_constructor_continue_prompt",
  "title": "Ishingiz Navbatchi advokatga berildi",
  "message": "Konstruktor orqali hujjatni o'zingiz ham to'ldirishni davom ettirasizmi?",
  "yes_action": "open_constructor",
  "no_action": "wait_for_lawyer",
  "continue_url": "/document-requests/{id}",
  "answers_url": "/document-requests/{id}/answers",
  "preview_url": "/document-requests/{id}/preview",
  "generate_url": "/document-requests/{id}/generate"
}
```

Frontend vazifa:

- Hujjat detail ekranida endi alohida service-flow chaqirmasdan `assigned_lawyer`, `lawyer_request`, `constructor_action`ni shu detaildan oling.
- Mijoz “konstruktorni davom ettirasizmi?” promptini `constructor_action.prompt_required` bo'yicha chiqaring.

## 4. Service-flow total tuzatildi

Endpoint:

```http
GET /document-requests/service-flow?mode=lawyer&limit=50
```

Endi `total` ham `mode/status` filterdan keyingi son bo'ladi. Oldin `mode=lawyer`da item 16 bo'lsa ham total 114 qaytardi.

Frontend vazifa:

- Pagination uchun `total`ga ishonish mumkin.
- `mode` ishlating; `tab` backend kontrakti emas.

## 5. Payment gate response kengaydi

`GET /document-requests/{id}` ichida `payment_gate` qaytadi, agar qo'shimcha to'lov bor yoki bo'lgan bo'lsa.

```json
{
  "payment_required": true,
  "payment_gate": {
    "id": "MARKETPLACE_RECORD_ID",
    "status": "pending",
    "payment_id": "PAYMENT_ID",
    "amount": 20000,
    "currency": "UZS",
    "page_count": 20,
    "included_pages": 10,
    "extra_pages": 10,
    "telegram_sent": true,
    "created_at": "..."
  }
}
```

Frontend vazifa:

- Hujjat tahlili/advokat reviewda `payment_required=true` bo'lsa “To'lov tasdiqlanishi kutilmoqda” holatini ko'rsating.
- `page_count`, `included_pages`, `extra_pages`, `amount`ni foydalanuvchiga tushunarli ko'rsating.

## 6. Secure chat detail ochildi

Yangi endpoint:

```http
GET /secure-chats/{room_id}
```

Response:

```json
{
  "id": "ROOM_ID",
  "status": "active",
  "client_user_id": "...",
  "seller_user_id": "...",
  "participants": [
    { "user_id": "...", "role": "client", "name": "..." },
    { "user_id": "...", "role": "seller", "name": "..." }
  ],
  "participant_count": 2,
  "urgent_advokat_request_ids": [],
  "document_lawyer_request_ids": [],
  "active_record_id": "..."
}
```

`GET /secure-chats` list ham `participant_count` bilan qaytadi.

Frontend vazifa:

- Chat headerda participant count va userlarni shu endpointdan oling.
- Group/urgent/document record bilan bog'lashda `active_record_id`dan foydalaning.

## 7. Meeting paid extension: client approve/reject API

Oldin faqat Telegram inline callback bor edi. Endi client in-app ham tasdiqlay oladi.

Endpoint:

```http
PATCH /secure-chats/{room_id}/calls/{call_id}/extension-payment-request
```

Payload:

```json
{
  "request_id": "CALL_EXTENSION_PAYMENT_REQUEST_ID",
  "approved": true
}
```

yoki reject:

```json
{
  "request_id": "CALL_EXTENSION_PAYMENT_REQUEST_ID",
  "approved": false
}
```

Response: `CallSessionOut`.

Realtime event:

```text
call.payment_extension_client_answered
```

Frontend vazifa:

- `pending_extension_request` chiqsa clientga Tasdiqlash/Rad etish tugmalarini ko'rsating.
- Tasdiqlashda yuqoridagi PATCHni chaqiring.
- Response `paused=false` bo'lsa callni davom ettiring.
- `call.payment_extension_client_answered` eventini host/advokat tomonda ham tinglang.

## 8. Marketplace lawyer catalog qo'shildi

Yangi endpoint:

```http
GET /marketplace/lawyers
```

Query filterlar:

```text
q
seller_type          advokat | yurist | advokat_tashkiloti
region
specialization
service_id
category_id
language
min_rating
price_min
price_max
online_now
verified
sort                recommended | rating | experience | price_asc
limit
offset
```

Response:

```json
{
  "items": [
    {
      "user_id": "...",
      "lawyer_name": "...",
      "seller_type": "advokat",
      "region": "Toshkent",
      "specializations": [],
      "languages": [],
      "rating": 5,
      "reviews_count": 10,
      "success_rate": 80,
      "trust_score": 92,
      "online_now": true,
      "availability": { "status": "available", "timezone": "Asia/Tashkent" },
      "services": [],
      "services_count": 3,
      "completed_orders": 12,
      "response_rate": 0.94,
      "purchase_url": "/marketplace/lawyers/{lawyer_user_id}/services/{service_id}/purchase-request"
    }
  ],
  "count": 20,
  "total": 100,
  "limit": 20,
  "offset": 0,
  "sort_options": ["recommended", "rating", "experience", "price_asc"]
}
```

Frontend vazifa:

- Marketplace page shu endpointdan ishlasin.
- Filter UI: yo'nalish, hudud, mutaxassis turi, reyting, narx, til, online/verified.
- Sort UI: recommended, rating, experience, price.

## 9. Marketplace lawyer detail

Endpoint:

```http
GET /marketplace/lawyers/{lawyer_user_id}
```

Qo'shimcha qaytadi:

```json
{
  "reviews": [],
  "compare_key": {
    "rating": 5,
    "success_rate": 80,
    "experience_years": 7,
    "price_from": 100000,
    "trust_score": 92
  }
}
```

Frontend vazifa:

- Detail page, compare card va review bloklari shu response’dan ishlasin.

## 10. Marketplace lawyer services

Endpoint:

```http
GET /marketplace/lawyers/{lawyer_user_id}/services
```

Response:

```json
{
  "lawyer_user_id": "...",
  "items": [
    {
      "id": "SERVICE_ID",
      "title": "...",
      "base_price": 0,
      "selected_price": 150000,
      "experience_note": "..."
    }
  ]
}
```

Frontend vazifa:

- Lawyer detaildagi xizmat paketlari shu endpointdan chiqsin.

## 11. Marketplace purchase request + Telegram inline

Endpoint:

```http
POST /marketplace/lawyers/{lawyer_user_id}/services/{service_id}/purchase-request
```

Payload:

```json
{
  "note": "Menga shartnoma bo'yicha konsultatsiya kerak",
  "amount": 150000
}
```

`amount` optional. Yuborilmasa backend lawyer capability price yoki service base price oladi.

Response:

```json
{
  "order": {},
  "payment": {},
  "purchase_request": {},
  "telegram_sent": true,
  "status": "pending"
}
```

Telegram inline callback:

```text
marketreq:approve:{record_id}
marketreq:reject:{record_id}
```

Approve bo'lsa backend:

- order `paid`;
- payment `paid`;
- contact unlocked;
- client + lawyer secure chat ochadi;
- client/lawyer notification oladi.

Reject bo'lsa:

- order `cancelled`;
- payment `cancelled`;
- clientga notification ketadi.

Frontend vazifa:

- Sotib olish bosilganda `purchase-request` chaqiring.
- `status=pending` bo'lsa “Telegram orqali tasdiqlash kutilmoqda” holatini ko'rsating.
- Approvaldan keyin notifications/WS yoki order refresh orqali chatni oching.

## 12. Ko'rinadigan account nomlari

Startup sync qo'shildi: bazada `call center` yozuvi bor xizmat akkauntlari `LexGo Navbatchi advokat` nomiga o'tkaziladi.

Frontend vazifa:

- UI matnlarda “Call center advokat” ishlatmang.
- Fallback label: `Navbatchi advokat`.

## 13. Test natijalari

Productionda tekshirildi:

- `/health` 200.
- `/marketplace/lawyers?limit=3` 200.
- `/marketplace/lawyers/{lawyer_user_id}` 200 va services bor.
- `/document-requests` 200 va yangi fieldlar qaytdi.
- `/document-requests/{id}` 200 va `document_type/lawyer_request/payment_gate/constructor_action` bor.
- `/secure-chats/{id}` 200 va `participant_count` qaytdi.
- Duplicate document lawyer request: birinchi `201`, ikkinchi `409 document_lawyer_request_already_open`.

## 14. Ehtiyot joylar

- Eski endpointlar olib tashlanmadi.
- Response’lar faqat kengaydi.
- Frontend eski fieldlardan foydalansa ham ishlayveradi.
- Marketplace purchase Telegram approve/reject real order/payment/chat yaratadi, shuning uchun testda alohida test account ishlating.
