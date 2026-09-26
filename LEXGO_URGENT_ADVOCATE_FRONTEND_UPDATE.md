# LexGo frontend update: Tezkor Advokat xizmati online

Backend production: `https://lexgo.api.cognilabs.org`

## Qisqa xulosa

Tezkor Advokat xizmati bitta modul sifatida ishlaydi.

Ichidagi xizmatlar:

- Advokat bilan videokonsultatsiya
- Chat orqali konsultatsiya
- Ikkinchi fikr - yakka advokat
- Ikkinchi fikr - advokatlar guruhi

Ikkinchi fikr ham shu Tezkor Advokat xizmati ichida. Frontend alohida katta modul qilishi shart emas.

## Catalog

`GET /urgent-advokat/catalog`

Qaytadi:

- service keylar
- narxlar
- video/chat variantlari
- meeting default minutlari
- paid extension narxi
- second opinion uchun oldin LexGo xizmat sotib olgan bo'lish sharti

Frontend dashboardda "Tezkor Advokat xizmati online" card/button ochganda shu API orqali variantlarni chizsin.

## Client so'rov yaratadi

`POST /urgent-advokat/requests`

Header:

`Authorization: Bearer CLIENT_TOKEN`

Video konsultatsiya:

```json
{
  "service_kind": "video_consultation",
  "channel": "video",
  "region": "tashkent",
  "need": "Menga tezkor videokonsultatsiya kerak",
  "files": [],
  "voice_messages": []
}
```

Chat konsultatsiya:

```json
{
  "service_kind": "chat_consultation",
  "channel": "chat",
  "region": "tashkent",
  "need": "Chat orqali maslahat kerak"
}
```

Ikkinchi fikr - yakka advokat:

```json
{
  "service_kind": "second_opinion_single",
  "channel": "video",
  "directions": ["jinoiy"],
  "need": "Oldingi ish bo'yicha ikkinchi fikr kerak"
}
```

Ikkinchi fikr - advokatlar guruhi:

```json
{
  "service_kind": "second_opinion_group",
  "channel": "video",
  "lawyer_count": 3,
  "directions": ["jinoiy", "fuqarolik"],
  "need": "Bir nechta advokat fikri kerak"
}
```

Muhim:

- `second_opinion_single` va `second_opinion_group` faqat oldin LexGo xizmat sotib olgan mijozga ochiladi.
- Agar oldin xarid bo'lmasa backend `402 previous_lexgo_purchase_required` qaytaradi.

## Client o'z so'rovlarini ko'radi

`GET /urgent-advokat/requests/me`

Bu page client portalda "Tezkor xizmatlarim" yoki "So'rovlarim" ichida ko'rsatiladi.

## Callcenter so'rovlarni ko'radi

`GET /call-center/urgent-advokat/requests`

Query:

- `status=open_pool`
- `status=claimed`
- `service_kind=video_consultation`
- `service_kind=chat_consultation`
- `service_kind=second_opinion_single`
- `service_kind=second_opinion_group`
- `channel=video`
- `channel=chat`

Callcenter UI’da alohida filter qo'ying:

- Manba: `Tezkor Advokat`
- Xizmat turi
- Video/chat
- Holat

`GET /call-center/queue` ichida ham `type=urgent_advokat`, `source=tezkor_advokat` bo'lib chiqadi.

## Callcenter/advokat ishni oladi

`POST /call-center/urgent-advokat/requests/{record_id}/claim`

Bu bosilganda:

- request `claimed` bo'ladi
- private secure chat room ochiladi
- clientga notification boradi
- chat/file/voice message uchun mavjud secure chat APIlar ishlaydi

Response ichida:

- `payload.secure_chat_room_id`
- `payload.assigned_lawyer_user_id`
- `status=claimed`

## Advokatlar guruhini belgilash

Faqat `second_opinion_group` uchun.

`POST /call-center/urgent-advokat/requests/{record_id}/assign-group`

```json
{
  "lawyer_user_ids": ["LAWYER_ID_1", "LAWYER_ID_2", "LAWYER_ID_3"],
  "scheduled_at": "2026-09-25T16:00:00+05:00",
  "note": "Mijoz jinoiy yo'nalish bo'yicha ikkinchi fikr so'radi"
}
```

Kamida 2 ta advokat kerak.

Clientga belgilangan vaqt va advokatlar soni ko'rinadi.

## Meeting yaratish

`POST /call-center/urgent-advokat/requests/{record_id}/meeting`

Meeting:

- LiveKit video
- default 30 daqiqa
- client invited
- group bo'lsa tanlangan advokatlar ham invited
- response `CallSessionOut`

Frontend eski LiveKit meeting componentdan foydalanadi.

## Meeting extension va recording

Avval qo'shilgan call endpointlar shu modulda ham ishlaydi:

Free extension:

`POST /secure-chats/{room_id}/calls/{call_id}/free-extend`

Paid extension:

`POST /secure-chats/{room_id}/calls/{call_id}/extension-payment-request`

Recording request:

`POST /secure-chats/{room_id}/calls/{call_id}/recording-request`

Recording permission:

`PATCH /secure-chats/{room_id}/calls/{call_id}/recording-permission`

Recording start:

`POST /secure-chats/{room_id}/calls/{call_id}/recording/start`

Qoida:

- Advokat meetingni 1 marta 3 daqiqagacha bepul uzaytira oladi.
- Pullik uzaytirish 2 000 UZS/min.
- Pullik uzaytirishda meeting pause bo'ladi.
- Telegram approve bo'lsa meeting auto uzayadi.
- Client recording request qiladi, advokat ruxsat bersa recording start bo'ladi.

## Hujjat analysis narxlash

`POST /ai/document-analysis/quote`

Endi response:

- `included_pages: 10`
- `extra_pages`
- `lawyer_review_amount`

11 sahifadan boshlab narx oshadi.

Test:

```json
{
  "page_count": 11,
  "lawyer_review": true
}
```

Response example:

```json
{
  "page_count": 11,
  "included_pages": 10,
  "extra_pages": 1,
  "lawyer_review_amount": 299000
}
```

## Yangi xizmatlar

Jinoiy category:

- `Jinoyat bo'yicha ariza berish`
- slug: `legal-doc-v2-jinoyat-boyicha-ariza-advokat-bilan`
- flow: advokat bilan/callcenter pool

Ma'muriy category:

- `Ma'muriy huquqbuzarlik haqida ariza`
- slug: `legal-doc-v2-mamuriy-huquqbuzarlik-haqida-ariza`
- constructor template bilan ishlaydi
- bo'limlar:
  - Ariza
  - Ariza beruvchi
  - So'rayman

Service search:

`GET /services?catalog_only=false&summary=true&q=mamuriy`

`GET /services?catalog_only=false&summary=true&q=jinoyat`

Search filtering tuzatildi: qidiruv endi limitdan oldin filter qilib yo'qolib qolmaydi.

## Test qilingan

- `GET /urgent-advokat/catalog`: 4 service qaytdi.
- `POST /ai/document-analysis/quote`: 11 sahifa uchun `extra_pages=1`, `lawyer_review_amount=299000`.
- `POST /urgent-advokat/requests`: `second_opinion_group` yaratildi.
- `GET /call-center/urgent-advokat/requests`: callcenter ko'rdi.
- `POST /call-center/urgent-advokat/requests/{id}/claim`: claimed bo'ldi, secure room yaratildi.
- `POST /call-center/urgent-advokat/requests/{id}/meeting`: 30 daqiqalik LiveKit meeting yaratildi.
- `GET /services?...q=mamuriy`: ma'muriy xizmat chiqdi.
- `GET /services?...q=jinoyat`: jinoiy xizmat chiqdi.

