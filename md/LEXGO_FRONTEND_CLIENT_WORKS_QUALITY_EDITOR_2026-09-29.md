# LexGo frontend update — Mening ishlarim, shikoyat flow, editor source

Sana: 2026-09-29
Backend: https://lexgo.api.cognilabs.org

## 1. Mening hujjatlarim va Mening ishlarim ajratildi

Endi bu ikki page bir-birining ma'lumotini ko'rsatmasligi kerak.

### Mening hujjatlarim
Bu page faqat hujjat arxivi va document requestlar uchun ishlatiladi.

Endpointlar:

- `GET /document-requests`
- `GET /document-requests/{id}`
- document generate/download/preview endpointlari

Bu yerga service order, case, urgent advokat, shikoyat, advokat bilan jarayonlar aralashtirilmasin.

### Mening ishlarim
Bu page mijozning yuridik jarayonlari uchun ishlatiladi.

Endpointlar:

- `GET /clients/me/works`
- `GET /clients/me/works/{work_id}`

Query:

- `type` optional: `document_lawyer_work`, `urgent_advokat`, `service_order`, `legal_case`, `quality_complaint`, `complaint`
- `status` optional
- `limit` default 50
- `offset` default 0

Response ichida `tabs` va `separation` bor. Frontend tablarni backenddan olishi mumkin.

## 2. GET /clients/me/works item formati

Har bir itemda umumiy fieldlar bor:

```json
{
  "id": "uuid",
  "work_id": "DOC-LAW-12345678",
  "type": "document_lawyer_work",
  "title": "Hujjat nomi",
  "status": "claimed",
  "status_label": "Advokat ishni oldi",
  "source": "document_lawyer_request",
  "assigned_lawyer": { "id": "...", "name": "...", "phone": "..." },
  "has_chat": true,
  "has_meeting": true,
  "next_action": "Advokat hujjatni tayyorlaydi",
  "detail_url": "/clients/me/works/DOC-LAW-12345678",
  "created_at": "...",
  "updated_at": "..."
}
```

Work ID userga tushunarli qilib beriladi:

- `DOC-LAW-...` advokat bilan hujjat
- `URG-...` tezkor advokat
- `ORD-...` order
- `CASE-...` legal case
- `QCA-...` quality complaint
- `CMP-...` complaint

Frontend UUID o'rniga `work_id` ko'rsatsin.

## 3. GET /clients/me/works/{work_id} detail

Detail `type`ga qarab kerakli bloklarni qaytaradi.

### document_lawyer_work
Qaytadigan asosiy bloklar:

- `summary`
- `lawyer_request`
- `document`
- `chat`
- `meeting`
- `rating`
- `complaints`

Bu client “Mening ishlarim” detail page uchun ishlatiladi.

### quality_complaint / complaint
Qaytadigan bloklar:

- `summary`
- `complaint`
- `document`
- `lawyer_request`
- `review`

Operator xulosasi va shikoyat holati shu yerda ko'rsatiladi.

## 4. Past baho + shikoyat flow

Client hujjat ishini baholaganda eski endpoint ishlatiladi:

`POST /document-requests/{request_id}/rating`

Agar `rating <= 2` bo'lsa backend avtomatik quality complaint ochadi.

Request example:

```json
{
  "rating": 1,
  "comment": "Hujjat noto'g'ri tayyorlangan",
  "complaint": "Advokat talabimni to'liq bajarmadi"
}
```

Response ichida yangi field bor:

```json
{
  "quality_complaint": {
    "id": "...",
    "work_id": "QCA-12345678",
    "type": "quality_complaint",
    "status": "new",
    "status_label": "Yangi",
    "detail_url": "/clients/me/works/QCA-12345678"
  }
}
```

Frontend:

- rating oddiy rating sifatida qoladi;
- `quality_complaint != null` bo'lsa clientga “Shikoyatingiz callcenterga yuborildi” holati ko'rsatiladi;
- shikoyat `Mening ishlarim` ichida alohida item bo'lib chiqadi.

## 5. Callcenter quality complaint API

Callcenter operatorlar uchun:

### Ro'yxat
`GET /call-center/quality-complaints`

Query:

- `status` optional: `new`, `under_review`, `rework_required`, `rejected`, `resolved`

### Detail
`GET /call-center/quality-complaints/{complaint_id}`

Detailda operator ko'radi:

- complaint matni;
- client;
- advokat;
- original document request;
- advokat topshirgan hujjat bo'lsa file/result;
- client rating/review.

### Xulosa qilish
`POST /call-center/quality-complaints/{complaint_id}/resolve`

Body:

```json
{
  "action": "rework_required",
  "note": "Shikoyat asosli. Advokat hujjatni bepul qayta ishlaydi."
}
```

`action` qiymatlari:

- `rework_required` — ish o'sha advokatga bepul qayta ochiladi;
- `rejected` — shikoyat rad qilinadi, clientga note yuboriladi;
- `resolved` — shikoyat yopiladi.

`rework_required` bo'lsa:

- document request status yana `lawyer_review` bo'ladi;
- eski assigned lawyer saqlanadi;
- lawyer request `claimed` holatga qaytadi;
- client va advokatga notification ketadi;
- bu rework bepul ekanligi payloadda bor.

## 6. Realtime eventlar

User websocket:

`/ws/users/me?token=...`

Yangi eventlar:

- `quality_complaint.created`
- `quality_complaint.updated`

Callcenter operator websocket orqali yangi shikoyatni ko'rishi kerak. Client ham shikoyat statusi o'zgarganda realtime oladi.

## 7. Advokat editor source tanlash

Editor ochilishidan oldin frontend 3-4 variant ko'rsatadi:

1. Toza shablondan boshlash
2. Mijoz yuborgan DOCX file bo'yicha ishlash
3. Advokat o'zi DOCX yuklab, shu file bilan ishlash
4. AI draft yoki blank draft, agar mavjud bo'lsa

### Source ro'yxati
`GET /lawyers/me/document-requests/{record_id}/editor/sources`

Response:

```json
{
  "record_id": "...",
  "current_source": "template",
  "options": [
    { "source_type": "template", "title": "Toza shablon", "available": true },
    { "source_type": "blank", "title": "Bo'sh hujjat", "available": true },
    { "source_type": "ai_draft", "title": "AI draft", "available": false },
    { "source_type": "attachment", "attachment_id": "...", "title": "Mijoz fayli", "available": true }
  ]
}
```

Frontend `available=false` bo'lgan variantni disabled ko'rsatsin.

### Source tanlash
`POST /lawyers/me/document-requests/{record_id}/editor/source`

Body:

```json
{
  "source_type": "attachment",
  "attachment_id": "attachment-id"
}
```

Yoki:

```json
{ "source_type": "template" }
```

Yoki:

```json
{ "source_type": "blank" }
```

Yoki:

```json
{ "source_type": "ai_draft" }
```

Muhim: source o'zgarsa backend eski editor sessionni yopadi. Keyin frontend odatdagi editor endpointni qayta chaqiradi.

### Advokat o'z DOCX fileini source qilish
`POST /lawyers/me/document-requests/{record_id}/editor/source-upload`

Multipart:

- `file`: DOCX
- `note`: optional

Response source tanlangan holatda qaytadi. Keyin frontend editorni ochadi.

Faqat `.docx` editable source sifatida qabul qilinadi. PDF/image/audio boshqa attachment sifatida qoladi, editor source bo'lmaydi.

## 8. Editor ochish ketma-ketligi

Advokat document request detailga kiradi.

1. `GET /lawyers/me/document-requests/{record_id}/editor/sources`
2. Frontend modal/screen ko'rsatadi:
   - Toza shablon
   - Mijoz filei
   - O'z fileimni yuklayman
   - AI draft / bo'sh hujjat
3. Tanlangan variant bo'yicha:
   - `POST /editor/source`, yoki
   - `POST /editor/source-upload`
4. Keyin:
   - `GET /lawyers/me/document-requests/{record_id}/editor`
5. OnlyOffice editor ochiladi.
6. Finalize eski flow bilan qoladi.

## 9. UI bo'yicha muhim ajratish

Client role:

- `Mening hujjatlarim` — tayyor/generate qilingan hujjatlar, template asosidagi document requestlar.
- `Mening ishlarim` — advokat bilan ishlar, tezkor xizmatlar, order/case, shikoyatlar.

Callcenter role:

- quality complaints alohida queue bo'lib chiqsin;
- complaint detailda advokat hujjati va client shikoyati ko'rinsin;
- operator `rework_required` yoki `rejected` action qiladi.

Advokat role:

- editor ochishdan oldin source selection majburiy UX bo'lsin;
- agar mijoz bir nechta file yuborgan bo'lsa DOCX filelar source sifatida chiqadi;
- non-DOCX filelar faqat ko'rish/download uchun chiqadi.

## 10. Test qilish uchun qisqa checklist

1. Client advokat bilan hujjat request yaratadi.
2. Client `GET /clients/me/works`da ishni ko'radi.
3. `GET /document-requests`da faqat hujjat arxivi ko'rinadi, works aralashmaydi.
4. Advokat `GET /editor/sources`da source variantlarni ko'radi.
5. Advokat source tanlab editorni ochadi.
6. Client rating 1 yoki 2 beradi va complaint yozadi.
7. Callcenter `GET /call-center/quality-complaints`da shikoyatni ko'radi.
8. Operator `rework_required` qilsa ish o'sha advokatga bepul qayta ochiladi.
9. Operator `rejected` qilsa clientga note bilan xabar boradi.
10. Websocketda `quality_complaint.created/updated` eventlari keladi.
