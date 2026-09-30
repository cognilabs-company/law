# LexGo qisqa ish IDlari frontend integratsiya

Production backend yangilandi. Userga UUID ko'rsatmaslik uchun barcha asosiy ish/zayavkalarda qisqa `work_id` qaytadi.

## Format

```text
PREFIX-XXXXX
```

Misollar:

```text
DOC-9M36Z
ADV-TI9N4
CALL-83JVE
PAY-K1OWV
LEAD-DX36K
```

`XXXXX` base36: raqam + katta lotin harflari.

## Prefixlar

- `DOC` - hujjat ishlari: konstruktor, qoralama, AI hujjat, advokat bilan hujjat, hujjat tahlili.
- `ADV` - tezkor advokat, marketplace advokat/yurist xizmati, second opinion zayavkalari.
- `CALL` - audio/video call, meeting, scheduled consultation.
- `CHAT` - chat konsultatsiya yoki guruh chat ish zayavkasi.
- `PAY` - to'lov request/payment.
- `SUB` - tarif/obuna sotib olish requesti.
- `CMP` - shikoyat/complaint.
- `LEAD` - callcenter lead.
- `CASE` - yuridik case.
- `ORD` - buyurtma/service order.
- `FILE` - storage file.
- `FLD` - storage folder.
- `APR` - approval/register request.
- `GFT` - gift subscription.
- `REF` - referral tracking.
- `PROMO` - reklama/boost request.

## Frontend qoida

- User ko'radigan joylarda `id` emas, `work_id` ko'rsatiladi.
- API routing va actionlar uchun avvalgidek `id` ishlatiladi.
- Agar response ichida `work_id` bo'lsa, UI display ID sifatida doim shuni ishlating.
- Agar ayrim eski joyda `work_id` kelmasa, fallback sifatida `id.slice(0, 8)` emas, bo'sh ko'rsatmaslik uchun backendga xabar bering.

## Endpointlarda keladigan joylar

### Hujjatlar

`GET /document-requests`

Har itemda:

```json
{
  "id": "uuid",
  "work_id": "DOC-9M36Z"
}
```

`GET /document-requests/{id}` va boshqa document request response'larda ham `work_id` bor.

### Tezkor advokat / marketplace ishlar

Urgent advocate va umumiy marketplace record response'larda:

```json
{
  "id": "uuid",
  "work_id": "ADV-TI9N4"
}
```

### Call / meeting

`GET /secure-chats/{room_id}/calls/{call_id}` va call create/join/update response:

```json
{
  "id": "uuid",
  "work_id": "CALL-83JVE",
  "call_type": "audio"
}
```

### To'lov

Payment response:

```json
{
  "id": "uuid",
  "work_id": "PAY-K1OWV"
}
```

### Subscription purchase

`POST /subscription-plans/{plan_id}/purchase`

```json
{
  "work_id": "SUB-ABCDE",
  "payment": {
    "work_id": "PAY-XXXXX"
  }
}
```

`POST /subscription-plans/{plan_id}/telegram-purchase-request`

```json
{
  "id": "uuid",
  "work_id": "SUB-ABCDE",
  "payment_id": "uuid"
}
```

### Leads

Lead response ichida:

```json
{
  "id": "uuid",
  "work_id": "LEAD-DX36K"
}
```

### Cases / Orders

Case:

```json
{
  "id": "uuid",
  "work_id": "CASE-XXXXX",
  "case_number": "CASE-XXXXX"
}
```

Order:

```json
{
  "id": "uuid",
  "work_id": "ORD-XXXXX"
}
```

### Storage

Folder:

```json
{
  "id": "uuid",
  "work_id": "FLD-XXXXX"
}
```

File:

```json
{
  "id": "uuid",
  "work_id": "FILE-XXXXX"
}
```

### Approval / Gift / Promotion / Complaint

- Approval: `APR-XXXXX`
- Gift: `GFT-XXXXX`
- Promotion: `PROMO-XXXXX`
- Complaint: `CMP-XXXXX`

## Shikoyat flow holati

1-2 ball rating berilganda backend `quality_complaint` yaratadi.

Callcenter operator uchun:

- `GET /call-center/quality-complaints`
- `GET /call-center/quality-complaints/{complaint_id}`
- `POST /call-center/quality-complaints/{complaint_id}/resolve`

Realtime:

```text
quality_complaint.created
quality_complaint.updated
```

Operator actionlari:

- `rework_required` - advokatga bepul qayta ishlashga yuborish.
- `rejected` - shikoyat asosli emas.
- `resolved` - hal qilindi.

## Production test natijasi

Backend productionda tekshirildi:

```json
{
  "doc_list": "DOC-9M36Z",
  "call": "CALL-83JVE",
  "doc": "DOC-9M36Z",
  "lead": "LEAD-DX36K",
  "pay": "PAY-K1OWV",
  "apr": "APR-JFQDL",
  "adv": "ADV-TI9N4"
}
```

Mavjud production data ham migratsiya qilindi:

- document_requests: 466
- marketplace_records: 29856
- orders: 23
- leads: 50
- payments: 155
- approvals: 28
- cases: 19
