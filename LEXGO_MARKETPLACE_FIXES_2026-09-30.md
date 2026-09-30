# LexGo Marketplace Fixes

Sana: 2026-09-30

Bu hujjat frontend tomonidan ko'rsatilgan marketplace muammolaridan faqat 3 tasi bo'yicha backendda qilingan tuzatishlarni tushuntiradi.

Yonida OpenAPI snapshot ham berildi:

`LEXGO_MARKETPLACE_OPENAPI_2026-09-30.json`

OpenAPI snapshot production containerdagi real backend koddan generatsiya qilindi. Unda 402 ta path bor.

## Tuzatilgan muammolar

## 1. Xarid himoyasiz edi

Oldingi holat:

- `POST /marketplace/lawyers/{lawyer_user_id}/services/{service_id}/purchase-request` ichida `amount` mijoz yuborgan qiymatdan olinishi mumkin edi.
- Manfiy `amount` yuborish xavfi bor edi.
- Dublikat pending purchase himoyasi yo'q edi.
- Seller o'zidan xizmat sotib olishi mumkin edi.
- Seller/admin kabi rolelar ham purchase request yuborishi mumkin edi.

Yangi holat:

- `amount` endi client request bodydan olinmaydi.
- Narx faqat backenddan olinadi:
  - avval `LawyerServiceCapability.selected_price`
  - bo'lmasa `LegalService.base_price`
- `amount <= 0` bo'lsa 422 qaytadi.
- Faqat `client` role marketplace xizmat sotib oladi.
- Seller o'zidan xizmat sotib ololmaydi.
- Seller marketplace uchun tasdiqlangan bo'lishi kerak:
  - `profile.is_verified == 1`
  - `verification_status` `approved` yoki `verified`
- Bir client ayni seller + ayni service bo'yicha aktiv request/orderga ega bo'lsa, qayta yaratmaydi.

Duplicate response:

```json
{
  "detail": {
    "code": "marketplace_order_already_active",
    "message": "Bu mutaxassis va xizmat bo'yicha aktiv so'rovingiz bor",
    "order_id": "...",
    "work_id": "ADV-XXXXX",
    "status": "pending_payment"
  }
}
```

Frontend nima qilishi kerak:

- `amount` yubormasin.
- Narxni listing/detail response ichidagi `selected_price`, `base_price`, `price_from`dan faqat ko'rsatish uchun ishlatsin.
- Purchase request body:

```json
{
  "note": "Mijoz izohi",
  "preferred_channel": "chat",
  "preferred_time": "bugun 18:00"
}
```

- 409 `marketplace_order_already_active` kelsa yangi request ochmasin, mavjud order detail/pending holatiga olib borsin.

## 2. Sotuvchi to'lanmagan orderni ko'rayotgan edi

Oldingi holat:

- Seller `/marketplace/me/orders` orqali `pending_payment` orderlarni ko'rishi mumkin edi.
- Seller cabinet `new_orders` ichida ham unpaid marketplace order chiqib qolishi mumkin edi.
- Bu frontendda "Qabul qilish" tugmasi bilan noto'g'ri ko'rinishga olib kelardi.

Yangi holat:

- Seller default marketplace orders listida unpaid orderlar ko'rinmaydi.
- Sellerga order faqat payment tasdiqlangandan keyin chiqadi.
- Seller cabinet `new_orders` ham unpaid marketplace orderlarni yashiradi.

Seller default endpoint:

```http
GET /marketplace/me/orders?role_view=seller
Authorization: Bearer {seller_token}
```

Defaultda sellerga quyidagi holatlar chiqadi:

- `paid`
- `accepted`
- `started`
- `in_progress`
- `result_ready`
- `quality_check`
- `delivered`
- `client_confirmation`
- `completed`
- `rated`
- `cancelled`

Frontend nima qilishi kerak:

- Seller marketplace page uchun `GET /marketplace/me/orders?role_view=seller` ishlatsin.
- Payment confirm bo'lmaguncha seller UI'da ish ko'rsatmasin.
- `pending_payment` holatini sellerga "qabul qilish" sifatida ko'rsatmasin.
- Client tomonda pending ko'rsatish mumkin.

Client endpoint:

```http
GET /marketplace/me/orders?role_view=client
Authorization: Bearer {client_token}
```

Client pending paymentni ko'raveradi.

## 3. Client call boshlay olmayotgan edi

Oldingi holat:

- `POST /secure-chats/{room_id}/calls` endpointida `meetings.manage` permission talab qilinardi.
- Client secure chat room participant bo'lsa ham bu permission yo'qligi sabab 403 olishi mumkin edi.

Yangi holat:

- `meetings.manage` majburiy talabi olib tashlandi.
- Agar user room participant bo'lsa, call boshlashi mumkin:
  - `room.client_user_id == user.id`
  - yoki `room.seller_user_id == user.id`
  - yoki roomga qo'shimcha participant sifatida qo'shilgan
  - yoki staff access bor

Endpoint:

```http
POST /secure-chats/{room_id}/calls
Authorization: Bearer {client_or_seller_token}
Content-Type: application/json
```

Request:

```json
{
  "call_type": "audio",
  "title": "Marketplace call",
  "participant_user_ids": ["seller_user_id"],
  "max_duration_minutes": 15
}
```

Response 201:

```json
{
  "id": "...",
  "work_id": "CALL-XXXXX",
  "room_id": "...",
  "call_type": "audio",
  "status": "active",
  "join_url": "/secure-chats/{room_id}/calls/{call_id}/join",
  "provider": "livekit"
}
```

Frontend nima qilishi kerak:

- Client order `can_create_call=true` bo'lsa call buttonni aktiv qilsin.
- `call_create_url` maydonidan foydalanishi mumkin:

```json
{
  "call_create_url": "/secure-chats/{room_id}/calls"
}
```

- Audio call uchun `call_type=audio`.
- Video call uchun `call_type=video`.
- Participant sifatida seller user id yuboriladi.

## Production test natijalari

Production container ichida test qilindi.

### Test 1: Manfiy amount

Requestda:

```json
{
  "amount": -999999,
  "note": "negative amount ignored"
}
```

Natija:

- status 201
- payment amount backenddagi seller narxiga teng bo'ldi: `111000`
- client yuborgan manfiy amount ishlatilmadi

### Test 2: Duplicate purchase

Ayni client + ayni seller + ayni service uchun ikkinchi request yuborildi.

Natija:

- status 409
- code: `marketplace_order_already_active`

### Test 3: Seller unpaid orderni ko'rmasligi

Purchase pending holatda:

```http
GET /marketplace/me/orders?role_view=seller
```

Natija:

- status 200
- count 0

Seller cabinet:

```http
GET /lawyers/me/cabinet
```

Natija:

- unpaid marketplace order `new_orders` ichida ko'rinmadi

### Test 4: Confirmdan keyin seller orderni ko'rishi

Telegram confirm handler orqali approve qilindi.

Natija:

- order paid
- payment paid
- secure chat ochildi
- seller `/marketplace/me/orders` ichida orderni ko'rdi
- `can_create_call=true`

### Test 5: Client call boshlashi

Client token bilan:

```http
POST /secure-chats/{room_id}/calls
```

Natija:

- status 201
- `call_type=audio`

## Frontend uchun yakuniy qoida

Marketplace purchase flow:

1. Client seller detaildan xizmat tanlaydi.
2. Frontend `amount` yubormaydi.
3. Backend narxni o'zi hisoblaydi.
4. Response `status=pending` bo'lsa client pending payment ko'radi.
5. Seller hali orderni ko'rmaydi.
6. Telegram confirm approve bo'lgandan keyin seller orderni ko'radi.
7. Client va seller secure chat/call ishlatadi.

Ko'rsatiladigan asosiy ID:

- Marketplace ish uchun userga `ADV-XXXXX` ko'rsatiladi.
- Payment ID, order UUID yoki raw UUID UI'da ko'rsatilmasin.

