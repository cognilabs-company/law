# LexGo frontend update — promotions checkout va navigation AI

Sana: 2026-09-29
Backend: `https://lexgo.api.cognilabs.org`

## 1. Promotions checkout endi Telegram inline orqali ishlaydi

Oldingi muammo: `POST /promotions/checkout` productionda demo provider sabab 503 berishi mumkin edi.

Endi checkout demo providerga bog'liq emas. Backend `telegram_manual` payment yaratadi va tasdiqlashni Telegram inline tugmalari orqali yuboradi.

### Endpoint

```http
POST /promotions/checkout
Authorization: Bearer <seller_token>
Content-Type: application/json
```

Body:

```json
{
  "package_id": "ads_product_id",
  "days": 7,
  "provider": "telegram_manual"
}
```

`provider` yuborilmasa default `telegram_manual`.
Agar frontend eski `demo_payme` yuborsa ham backend uni productionda `telegram_manual` qilib oladi.

### Response

```json
{
  "payment": {
    "id": "...",
    "provider": "telegram_manual",
    "status": "pending",
    "amount": 149000,
    "currency": "UZS"
  },
  "payment_required": true,
  "payment_gate": {
    "id": "promotion_checkout_request_id",
    "status": "pending",
    "payment_id": "...",
    "amount": 149000,
    "currency": "UZS",
    "provider": "telegram_manual",
    "telegram_sent": true
  },
  "promotion_status": "pending_telegram_approval",
  "checkout_request_id": "..."
}
```

### Frontend holati

Agar `promotion_status=pending_telegram_approval` bo'lsa:

- "Tasdiqlash kutilmoqda" statusini ko'rsating.
- Sellerga paket hali active emasligini ayting.
- Polling qilish shart emas, lekin kerak bo'lsa `/promotions/me` bilan holatni yangilash mumkin.

Telegramda admin `Tasdiqlash` bossa:

- payment `paid` bo'ladi;
- promotion `active` bo'ladi;
- seller marketplace ro'yxatlarida yuqoriroq chiqadi.

Telegramda `Bekor qilish` bossa:

- payment `cancelled` bo'ladi;
- promotion active bo'lmaydi.

## 2. Marketplace ro'yxatida promotion boost

`GET /marketplace/lawyers` response itemlariga qo'shildi:

```json
{
  "promotion": {
    "active": true,
    "id": "...",
    "package_id": "...",
    "package_title": "Top of search - 7 days",
    "specialization": "oilaviy",
    "days_left": 6,
    "ends_at": "2026-10-06T...",
    "boost_score": 60
  },
  "promotion_boost_score": 60
}
```

`sort=recommended` bo'lsa backend promoted sellerlarni yuqoriroq chiqaradi.

Frontend:

- `promotion.active=true` bo'lsa kichik "Promoted" badge chiqarish mumkin.
- Sortingni frontendda qayta buzmaslik kerak, backend tartibini saqlang.

## 3. Navigation AI tezlashtirildi

`POST /api/ai/assistant` endi aniq navigation savollarida OpenAI kutmaydi.

Misol:

```json
{
  "message": "hujjat so'rovlari editor qayerda",
  "session_id": "...",
  "locale": "uz"
}
```

Response:

```json
{
  "intent": "navigation",
  "navigation": {
    "type": "route",
    "route": "/portal/advocate/document-requests",
    "page_id": "lawyer_document_requests",
    "title": "Advokat hujjat so'rovlari"
  },
  "metadata": {
    "provider": "local_navigation",
    "latency_ms": 11
  }
}
```

Frontend:

- Agar `navigation.route` bo'lsa, userni shu routega olib o'tish mumkin.
- `metadata.provider=local_navigation` bo'lsa bu tezkor local javob, OpenAI kutmagan.
- Murakkab savollarda backend hali ham OpenAI ishlatishi mumkin, lekin timeout bor.

## Production test

Backendda tekshirildi:

- `/promotions/checkout` -> 200, `telegram_manual`, `pending_telegram_approval`
- Telegram approve helper -> promotion active bo'ldi
- `/marketplace/lawyers?sort=recommended` -> promoted seller `promotion_boost_score` bilan qaytdi
- `/api/ai/assistant` navigation -> 11ms, `provider=local_navigation`
