# LexGo frontend update — baholash va shikoyat 15 daqiqa

Sana: 2026-09-29
Backend: `https://lexgo.api.cognilabs.org`

## Nima o'zgardi

Backendda hujjat ishlari va tezkor advokat ishlari uchun baholash/shikoyat oynasi qat'iy 15 daqiqa qilib qo'yildi.

Advokat ishni mijozga topshirgandan keyin mijozda faqat 15 daqiqa ichida:

- baho berish;
- past baho orqali shikoyat yuborish;
- izoh yozish

imkoni bo'ladi.

15 daqiqadan keyin baholash ham, shikoyat ham yopiladi.

## Frontend qanday ishlatadi

Frontend o'zi vaqt hisoblab qaror qilmasin. Backend qaytargan `rating` obyektiga qaraydi.

Asosiy qoida:

```ts
if (rating.available === true && rating.submitted === false) {
  // baholash/shikoyat UI ko'rsatilsin
} else {
  // baholash/shikoyat yopiq
}
```

## Mijoz hujjatlari / ish detailida keladigan rating block

Backend response ichida:

```json
{
  "rating": {
    "available": true,
    "deadline_at": "2026-09-29T15:00:00Z",
    "remaining_seconds": 842,
    "submitted": false,
    "closed_reason": "",
    "value": null
  }
}
```

Ma'nosi:

- `available`: baholash/shikoyat oynasi ochiqmi
- `deadline_at`: server belgilagan yopilish vaqti
- `remaining_seconds`: qolgan sekund
- `submitted`: mijoz allaqachon baho berganmi
- `closed_reason`: `expired`, `submitted`, `not_ready` bo'lishi mumkin
- `value`: berilgan baho

## Document request flat fieldlar

Ba'zi endpointlarda eski compatibility uchun flat fieldlar ham bor:

```json
{
  "rating_available": true,
  "rating_deadline_at": "2026-09-29T15:00:00Z",
  "rating_remaining_seconds": 842,
  "rating_submitted": false,
  "rating_closed_reason": ""
}
```

Yangi UI uchun `rating` block ishlatish tavsiya qilinadi.

## Rating yuborish endpointlari

Hujjat ishi:

```http
POST /document-requests/{request_id}/rating
```

Tezkor advokat ishi:

```http
POST /urgent-advokat/requests/{record_id}/rating
```

Body:

```json
{
  "rating": 1,
  "comment": "Izoh yoki shikoyat matni"
}
```

## 15 daqiqa tugaganda error

Agar frontend deadline tugagandan keyin yuborsa backend 409 qaytaradi:

```json
{
  "detail": {
    "code": "rating_window_closed",
    "message": "Baholash va shikoyat qilish muddati tugagan",
    "reason": "expired",
    "deadline_at": "2026-09-29T15:00:00Z"
  }
}
```

Frontend bu holatda:

- modal/formani yopadi;
- "Baholash muddati tugagan" ko'rsatadi;
- qayta yuborish tugmasini chiqarmaydi.

## Shikoyat qachon yaratiladi

Shikoyat alohida tugma emas. Backend quyidagicha ishlaydi:

- `rating` 1 yoki 2 bo'lsa va 15 daqiqa ichida yuborilsa, `quality_complaint` avtomatik yaratiladi;
- `rating` 3, 4, 5 bo'lsa faqat review saqlanadi;
- 15 daqiqadan keyin hech qanday shikoyat yaratilmaydi.

Successful response ichida:

```json
{
  "review": { "...": "..." },
  "quality_complaint": {
    "id": "...",
    "work_id": "LGQ-20260929-...",
    "status": "new",
    "detail_url": "/clients/me/works/LGQ-..."
  }
}
```

Agar `quality_complaint` null bo'lsa, shikoyat yaratilmagan.

## Callcenter uchun

Callcenter shikoyatlarni shu endpointdan oladi:

```http
GET /call-center/quality-complaints
GET /call-center/quality-complaints/{complaint_id}
```

Detail response:

- hujjat shikoyatida `document` keladi;
- tezkor advokat shikoyatida `urgent_request` keladi;
- summary ichida `document_request_id` yoki `urgent_advokat_request_id` bo'ladi.

## UI tavsiya

Mijoz ish yakunlangandan keyin 15 daqiqalik baholash panelini ko'rsating.

Timer uchun backenddan kelgan `deadline_at` va `remaining_seconds` ishlatilsin.

15 daqiqa tugasa:

- baholash tugmalari yo'qolsin;
- shikoyat inputi yo'qolsin;
- "Baholash muddati tugagan" yozuvi chiqsin.

## Production test natijasi

Backendda tekshirildi:

- expired document rating -> `409 rating_window_closed`, DBda `closed`, `rating_available=false`
- active document rating 1 -> review + `quality_complaint` yaratildi
- expired urgent rating -> `409 rating_window_closed`, `rating_available=false`
- active urgent rating 1 -> review + `quality_complaint` yaratildi
- callcenter complaint detailda bog'langan hujjat/tezkor ish ko'rinadi
