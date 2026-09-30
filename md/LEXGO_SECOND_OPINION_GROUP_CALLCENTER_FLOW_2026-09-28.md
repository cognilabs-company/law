# LexGo Frontend: Ikkinchi fikr — advokatlar guruhi / Callcenter meeting flow

Sana: 2026-09-28
Backend: https://lexgo.api.cognilabs.org

## Maqsad

`Tezkor advokat` ichidagi `Ikkinchi fikr — advokatlar guruhi` xizmati callcenter operator tomonidan to'liq boshqarilishi kerak.

Mijoz group request yuboradi. Callcenter operator requestni oladi, yo'nalishlarga mos bir nechta advokat tanlaydi, meeting vaqtini belgilaydi. Keyin bu ish `scheduled` holatda operator panelida qayta ko'rinib turishi kerak. Belgilangan vaqtda operator meetingni boshlaydi.

Muhim: bu flow oddiy advokat/yurist kabinetida emas, callcenter operator ish joyida bo'lishi kerak. Lekin tanlangan advokatlar o'z kabinetida bu meeting borligini oldindan ko'rishi kerak.

## Backend holati

Backendda API mavjud va ishlayapti.

Test qilingan real request:

- `id`: `66e1376f-348b-42ce-97ec-e503d441080d`
- `work_id`: `LGT-20260928-66E1376F`
- `service_kind`: `second_opinion_group`
- `status`: `scheduled`
- `scheduled_at`: `2026-09-28T17:00:00.000Z`
- operator: `+998900000003` / `LexGo Call Center Lawyer`
- tanlangan advokatlar soni: `3`

`+998900000003` accountda flow ishladi: request olindi, advokatlar tanlandi, meeting vaqti belgilandi. Muammo frontend modal yopilgandan keyin scheduled ishni qayta topib ko'rsatmayapti.

## Rollar

### Mijoz

Mijoz `Tezkor advokat -> Ikkinchi fikr -> Advokatlar guruhi` tanlaydi.

Mijoz quyidagilarni beradi:

- video yoki chat turi
- yo'nalishlar: masalan `jinoiy`, `mamuriy`, `iqtisodiy`, `soliq`
- nechta advokat kerakligi
- muammo tavsifi
- kerak bo'lsa file va voice message

### Callcenter operator

Callcenter operator requestni oladi va boshqaradi.

Operator quyidagilarni qila olishi kerak:

- group requestlarni ko'rish
- bitta requestni claim qilish
- yo'nalishga mos advokatlar ro'yxatini ko'rish
- bir nechta advokat tanlash
- meeting sanasi va vaqtini belgilash
- scheduled ishlarni qayta ko'rish
- meeting vaqtida yoki kerak bo'lsa oldindan `Meeting boshlash` bosish

### Tanlangan advokatlar

Tanlangan advokatlarda ularning kabinetida upcoming/rejalashtirilgan meeting ko'rinishi kerak.

Advokat ko'rishi kerak:

- ish ID
- mijoz ismi
- xizmat turi: `Ikkinchi fikr — advokatlar guruhi`
- yo'nalishlar
- meeting vaqti
- boshqa guruh advokatlari qisqa ro'yxati
- meeting boshlanganda join qilish tugmasi yoki notification

## Frontendda kerakli sahifalar

### 1. Callcenter Tezkor Advokat Requests sahifasi

Bitta umumiy sahifa bo'lsin:

`/portal/call-center/urgent-advokat`

yoki mavjud callcenter queue ichida alohida tab.

Tavsiya qilingan tablar:

- `Yangi` -> `open_pool`
- `Olingan` -> `claimed`
- `Rejalashtirilgan` -> `scheduled`
- `Jarayonda` -> `in_progress`
- `Yakunlangan` -> `completed`
- `Bekor qilingan` -> `cancelled`

Group meeting belgilanganidan keyin modal yopilsa, frontend avtomatik `Rejalashtirilgan` tabga o'tishi yoki listni refetch qilishi kerak.

## API ketma-ketligi

### 1. Requestlar ro'yxatini olish

```http
GET /call-center/urgent-advokat/requests
Authorization: Bearer <token>
```

Filterlar:

```http
GET /call-center/urgent-advokat/requests?status=open_pool
GET /call-center/urgent-advokat/requests?status=claimed
GET /call-center/urgent-advokat/requests?status=scheduled
GET /call-center/urgent-advokat/requests?service_kind=second_opinion_group
```

`Rejalashtirilgan` tab uchun aynan shu ishlatiladi:

```http
GET /call-center/urgent-advokat/requests?status=scheduled
```

Javobdagi muhim fieldlar:

```json
{
  "id": "66e1376f-348b-42ce-97ec-e503d441080d",
  "work_id": "LGT-20260928-66E1376F",
  "status": "scheduled",
  "service_kind": "second_opinion_group",
  "title": "Ikkinchi fikr - advokatlar guruhi",
  "client": { "name": "Abdurahmon", "phone": "+998946542341" },
  "group_lawyers": [],
  "payload": {
    "directions": ["jinoiy", "mamuriy", "iqtisodiy", "soliq"],
    "requested_lawyer_count": 4,
    "scheduled_at": "2026-09-28T17:00:00.000Z",
    "group_lawyer_user_ids": ["..."],
    "operator_user_id": "..."
  }
}
```

### 2. Request detail

```http
GET /call-center/urgent-advokat/requests/{record_id}
Authorization: Bearer <token>
```

Bu detail page/modal uchun ishlatiladi.

Detailda ko'rsatish kerak:

- `work_id`
- `status`
- mijoz
- request tavsifi
- yo'nalishlar
- channel: video/chat
- requested lawyer count
- selected lawyers
- scheduled time
- meeting status

### 3. Requestni olish / claim qilish

```http
POST /call-center/urgent-advokat/requests/{record_id}/claim
Authorization: Bearer <token>
```

Claim qilingandan keyin request `claimed` bo'ladi.

Frontend:

- claim muvaffaqiyatli bo'lsa detailni refetch qilsin
- `Advokat tanlash` va `Meeting vaqtini belgilash` bloklarini ochsin

### 4. Advokat kandidatlarini olish

```http
GET /call-center/urgent-advokat/requests/{record_id}/candidates
Authorization: Bearer <token>
```

Qo'shimcha umumiy qidiruv:

```http
GET /call-center/urgent-advokat/candidates?directions=jinoiy,mamuriy&region=tashkent&include_external=true&include_callcenter=true&limit=50
```

Javobda har bir advokat uchun:

```json
{
  "lawyer_user_id": "...",
  "name": "...",
  "role": "advokat",
  "seller_type": "advokat",
  "is_callcenter_member": false,
  "is_external_seller": true,
  "region": "Toshkent",
  "specializations": ["iqtisodiy", "bankrotlik"],
  "rating": 5,
  "reviews_count": 9,
  "total_cases": 30,
  "success_rate": 80,
  "workload": 0,
  "direction_match": true,
  "score": 55,
  "reasons": ["verified_seller", "direction:iqtisodiy"]
}
```

Frontend UI:

- multi-select bo'lishi kerak
- `requested_lawyer_count` nechta bo'lsa, kamida shuncha tanlash tavsiya qilinadi
- score, rating, success rate, specializations, workload ko'rsatiladi
- direction match bo'lgan advokatlar yuqorida chiqsin

### 5. Advokatlar guruhi va meeting vaqtini belgilash

```http
POST /call-center/urgent-advokat/requests/{record_id}/assign-group
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "lawyer_user_ids": [
    "3a6222f8-4973-4041-b4fd-99cc0574d8cb",
    "5da560c5-a048-4339-91ed-0aae59aa7f54",
    "12979e5a-a2b0-4505-87b7-5e26f8f5a414"
  ],
  "scheduled_at": "2026-09-28T17:00:00.000Z",
  "notes": "Mijoz iqtisodiy va ma'muriy masala bo'yicha ikkinchi fikr so'ragan"
}
```

Muvaffaqiyatli javobdan keyin:

- request status `scheduled` bo'ladi
- `payload.group_lawyer_user_ids` saqlanadi
- `payload.scheduled_at` saqlanadi
- tanlangan advokatlarga notification boradi

Frontend muhim qoidasi:

Modal yopilgach ish yo'qolib qolmasin. Darhol quyidagini chaqiring:

```http
GET /call-center/urgent-advokat/requests?status=scheduled
```

va requestni `Rejalashtirilgan` tabda ko'rsating.

### 6. Meeting boshlash

Meeting hali `assign-group` paytida yaratilmaydi. `assign-group` faqat vaqt va advokatlarni belgilaydi.

Meeting boshlash uchun alohida endpoint:

```http
POST /call-center/urgent-advokat/requests/{record_id}/meeting
Authorization: Bearer <token>
Content-Type: application/json
```

Body minimal:

```json
{}
```

Yoki frontend kerak bo'lsa:

```json
{
  "title": "Ikkinchi fikr - advokatlar guruhi",
  "duration_minutes": 30
}
```

Javob LiveKit call/session ma'lumotlarini qaytaradi.

Frontend:

- scheduled request cardida `Meeting boshlash` tugmasi bo'lishi kerak
- tugma scheduled vaqt kelganda aktiv bo'lishi tavsiya qilinadi
- test/staging uchun operatorga vaqt kelmasdan ham boshlash mumkin bo'lsa, backend ruxsat beradi
- meeting yaratilgach operatorni meeting roomga olib kiring
- mijoz va tanlangan advokatlarga WS/notification orqali join event ko'rsating

## Timezone muhim

Backend `scheduled_at` ni ISO UTC sifatida saqlaydi.

Masalan:

```json
"scheduled_at": "2026-09-28T17:00:00.000Z"
```

Bu UTC vaqt. Toshkent vaqti bilan `22:00` bo'ladi.

Frontend agar foydalanuvchi Toshkent vaqtida `17:00` tanlagan bo'lsa, backendga noto'g'ri `17:00Z` yubormasligi kerak.

To'g'ri variant:

- UI local timezone: Asia/Tashkent
- user `2026-09-28 17:00` tanlasa
- backendga UTC yuboriladi: `2026-09-28T12:00:00.000Z`

Yoki backendga timezone bilan yuboring:

```json
"scheduled_at": "2026-09-28T17:00:00+05:00"
```

Frontendda cardda esa local formatda ko'rsatilsin:

`28.09.2026, 17:00`

## Advokat kabinetida ko'rinishi kerak bo'lgan joy

Tanlangan advokatlar uchun alohida upcoming meetings/list bo'lishi kerak.

Tavsiya qilingan joylar:

- Advokat dashboard `Bugungi meetinglar`
- Advokat `Tezkor advokat ishlari`
- Advokat notifications
- Calendar/upcoming section

Advokat cardida:

- `Ikkinchi fikr — advokatlar guruhi`
- `work_id`
- mijoz ismi
- yo'nalishlar
- sana/vaqt
- status: `Rejalashtirilgan`
- `Meetingga kirish` buttoni meeting yaratilgandan keyin aktiv bo'ladi

Agar frontendda alohida endpoint kerak bo'lsa, backenddagi mavjud notification/WS eventlardan foydalaning. Tanlangan advokatlarga `urgent_advokat.group_assigned` notification ketadi.

## Notification va realtime

Backend `assign-group` paytida tanlangan advokatlarga notification yuboradi:

Event:

```text
urgent_advokat.group_assigned
```

Payload ichida:

```json
{
  "record_id": "...",
  "client_user_id": "...",
  "scheduled_at": "...",
  "operator_user_id": "...",
  "directions": ["..."]
}
```

Frontend notification center va websocket listener quyidagilarni qilishi kerak:

- advokatga “Siz ikkinchi fikr guruh meetingiga tanlandingiz” ko'rsatish
- scheduled meetingni upcoming listga qo'shish
- operator `meeting` endpointni bosganda join notification ko'rsatish
- mijozga ham “Meeting boshlandi” push/in-app chiqarish

## Operator card UI

`scheduled` card uchun tavsiya:

- yuqorida `work_id`
- status badge: `Rejalashtirilgan`
- service badge: `Ikkinchi fikr — advokatlar guruhi`
- mijoz: ism + telefon
- yo'nalishlar chips
- tanlangan advokatlar avatar/name list
- scheduled time local formatda
- actions:
  - `Detail`
  - `Advokatlarni o'zgartirish`
  - `Vaqtni o'zgartirish`
  - `Meeting boshlash`
  - `Bekor qilish`

## Bug fix kerak bo'lgan frontend joy

Hozirgi holatda:

1. Operator advokatlarni tanlayapti.
2. Meeting vaqtini belgilayapti.
3. Modal yopilyapti.
4. Request scheduled bo'lgan bo'lsa ham sahifada qayta topilmayapti.

Fix:

- `assign-group` success bo'lgandan keyin `status=scheduled` list refetch qilinsin.
- Yoki operatorni avtomatik `Rejalashtirilgan` tabga o'tkazing.
- `GET /call-center/urgent-advokat/requests?status=scheduled` dan kelgan requestlar card qilib ko'rsatilsin.
- `Meeting boshlash` buttoni shu card/detail ichida bo'lsin.

## Test checklist

1. Mijoz group second opinion request yaratadi.
2. Operator `+998900000003` bilan kiradi.
3. `open_pool` requestni ko'radi.
4. Requestni claim qiladi.
5. Candidates ochiladi.
6. Bir nechta advokat tanlanadi.
7. Sana/vaqt tanlanadi.
8. `assign-group` yuboriladi.
9. Modal yopilgandan keyin request `Rejalashtirilgan` tabda ko'rinadi.
10. Tanlangan advokat kabinetida upcoming meeting ko'rinadi.
11. Advokatga notification keladi.
12. Scheduled vaqtda operator `Meeting boshlash` bosadi.
13. Mijoz va advokatlarga join notification chiqadi.
14. Meeting LiveKit orqali ochiladi.

## Backend endpoint summary

```http
GET  /call-center/urgent-advokat/requests
GET  /call-center/urgent-advokat/requests?status=scheduled
GET  /call-center/urgent-advokat/requests?service_kind=second_opinion_group
GET  /call-center/urgent-advokat/requests/{record_id}
POST /call-center/urgent-advokat/requests/{record_id}/claim
GET  /call-center/urgent-advokat/requests/{record_id}/candidates
POST /call-center/urgent-advokat/requests/{record_id}/assign-group
POST /call-center/urgent-advokat/requests/{record_id}/meeting
PATCH /call-center/urgent-advokat/requests/{record_id}/status
POST /call-center/urgent-advokat/requests/{record_id}/cancel
POST /call-center/urgent-advokat/requests/{record_id}/complete
```

## Xulosa

Backendda group second opinion scheduling bor va productionda real request bilan tekshirildi. Frontendda asosiy yetishmayotgan qism: `scheduled` statusdagi ishni alohida tab/listda qayta ko'rsatish va shu card/detail ichidan `POST /meeting` orqali meeting boshlash.
