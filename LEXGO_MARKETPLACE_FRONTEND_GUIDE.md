# LexGo Marketplace Frontend Integratsiya Qo'llanmasi

Sana: 2026-09-29

Bu hujjat LexGo marketplace qismini frontend/mobile tomonda 0dan ulash uchun yozildi. Marketplace deganda tashqi advokat/yuristlarni ko'rish, filterlash, detail sahifasini ochish, ularning xizmatini sotib olish, Telegram inline tasdiqdan keyin sellerga ish tushishi, chat/call/meeting boshlash va seller promotion/boost oqimi tushuniladi.

## 1. Marketplace maqsadi

Marketplace mijozga LexGo ichidagi tasdiqlangan advokat/yuristlarni tanlash imkonini beradi.

Asosiy flow:

1. Mijoz marketplace sahifasiga kiradi.
2. Backenddan filter meta olinadi.
3. Mijoz advokat/yuristlarni yo'nalish, hudud, narx, reyting, xizmat turi bo'yicha filterlaydi.
4. Mijoz seller detail sahifasiga kiradi.
5. Seller xizmatlaridan birini tanlab sotib olish so'rovini yuboradi.
6. To'lov provider ulanmagani uchun hozircha Telegram inline confirm ishlaydi.
7. Telegramdan tasdiqlansa payment `paid`, order `paid`, secure chat ochiladi.
8. Client va sellerga notification + websocket event boradi.
9. Seller o'z kabinetida marketplace buyurtmani ko'radi.
10. Mijoz va seller secure chat, audio/video call yoki meeting orqali ishni davom ettiradi.

## 2. Backendda qilingan asosiy o'zgarishlar

### 2.1 Marketplace cardlar boyitildi

`GET /marketplace/lawyers` response ichidagi har bir seller card endi qo'shimcha maydonlar qaytaradi:

- `price_from`
- `price_to`
- `service_titles`
- `categories`
- `category_ids`
- `detail_url`
- `services_url`
- `purchase_url`
- har bir service ichida `purchase_url`

Frontend listing cardda alohida hisob-kitob qilmasdan shu maydonlardan foydalanadi.

### 2.2 Marketplace filter meta qo'shildi

Yangi endpoint:

```http
GET /marketplace/meta
```

Bu endpoint filter UI qurish uchun tayyor ma'lumot beradi:

- seller types
- hududlar
- tumanlar
- yo'nalishlar
- tillar
- kategoriyalar
- marketplace xizmatlari
- sort variantlari

### 2.3 Listingga `district` filter qo'shildi

```http
GET /marketplace/lawyers?region=Toshkent&district=Yunusobod
```

### 2.4 Listingga `include_meta=true` qo'shildi

Frontend bitta request bilan list + filter meta olishi mumkin:

```http
GET /marketplace/lawyers?limit=20&include_meta=true
```

### 2.5 Purchase response boyitildi

`POST /marketplace/lawyers/{lawyer_user_id}/services/{service_id}/purchase-request` endi:

- `work_id`
- `next_status`
- `seller_will_receive_after_payment`
- `preferred_channel`
- `preferred_time`
- category/seller/service ma'lumotlarini payloadda qaytaradi.

### 2.6 Seller/client marketplace orders endpoint qo'shildi

Yangi endpoint:

```http
GET /marketplace/me/orders
```

Bu endpoint:

- client uchun o'zi sotib olgan marketplace ishlarni
- seller uchun unga kelgan marketplace buyurtmalarni

qaytaradi.

### 2.7 Realtime event qo'shildi

Telegram inline confirmdan keyin backend quyidagi websocket eventni yuboradi:

```json
{
  "event": "marketplace.order_paid",
  "work_id": "ADV-XXXXX",
  "order_id": "...",
  "payment_id": "...",
  "room_id": "...",
  "chat_url": "/secure-chats/{room_id}/messages",
  "lawyer_user_id": "...",
  "client_user_id": "...",
  "service_title": "..."
}
```

Client va seller ikkalasi ham `user:{user_id}` kanalidan oladi.

## 3. Endpointlar ro'yxati

### 3.1 Filter meta

```http
GET /marketplace/meta
```

Auth shart emas.

Response:

```json
{
  "seller_types": ["advokat", "yurist", "advokat_tashkiloti"],
  "regions": ["Toshkent"],
  "districts": ["Yunusobod"],
  "specializations": ["oilaviy", "jinoyat", "iqtisodiy"],
  "languages": ["uz", "ru"],
  "categories": [
    {
      "id": "...",
      "title": "Fuqarolik",
      "slug": "fuqarolik"
    }
  ],
  "services": [
    {
      "id": "...",
      "title": "Da'vo ariza tayyorlash",
      "category_id": "...",
      "base_price": 150000,
      "currency": "UZS"
    }
  ],
  "sort_options": ["recommended", "rating", "experience", "price_asc"]
}
```

Frontend ishlatishi:

- Filter selectlar uchun `seller_types`, `regions`, `districts`, `specializations`, `languages`, `categories`, `services`.
- Sort dropdown uchun `sort_options`.
- `services` orqali aniq xizmat bo'yicha filter beriladi.

### 3.2 Marketplace seller list

```http
GET /marketplace/lawyers
```

Query parametrlar:

| Param | Ma'nosi |
|---|---|
| `q` | ism, region, bio, specialization bo'yicha qidirish |
| `seller_type` | `advokat`, `yurist`, `advokat_tashkiloti` |
| `region` | hudud |
| `district` | tuman |
| `specialization` | yo'nalish |
| `service_id` | xizmat bo'yicha filter |
| `category_id` | kategoriya bo'yicha filter |
| `language` | til |
| `min_rating` | 0-5 |
| `price_min` | minimal narx |
| `price_max` | maksimal narx |
| `online_now` | true/false |
| `verified` | true/false |
| `sort` | `recommended`, `rating`, `experience`, `price_asc` |
| `limit` | 1-100 |
| `offset` | pagination |
| `include_meta` | true bo'lsa filter meta ham qaytadi |

Misol:

```http
GET /marketplace/lawyers?seller_type=advokat&region=Toshkent&sort=recommended&limit=20&offset=0
```

Response:

```json
{
  "items": [
    {
      "user_id": "...",
      "public_id": "LG-...",
      "lawyer_name": "Ali Valiyev",
      "phone": "+998...",
      "seller_type": "advokat",
      "verification_status": "verified",
      "region": "Toshkent",
      "district": "Yunusobod",
      "specializations": ["fuqarolik", "oilaviy"],
      "languages": ["uz", "ru"],
      "bio": "...",
      "education": "...",
      "experience_years": 7,
      "lawyer_experience_years": 7,
      "total_cases": 120,
      "wins_count": 90,
      "partial_wins_count": 20,
      "success_rate": 92,
      "rating": 5,
      "reviews_count": 18,
      "is_verified": true,
      "services_count": 4,
      "service_titles": ["Da'vo ariza tayyorlash"],
      "categories": [
        {
          "id": "...",
          "title": "Fuqarolik",
          "slug": "fuqarolik"
        }
      ],
      "category_ids": ["..."],
      "price_from": 100000,
      "price_to": 500000,
      "completed_orders": 12,
      "response_rate": 0.94,
      "trust_score": 88,
      "promotion": {
        "active": true,
        "id": "...",
        "package_title": "Top boost",
        "days_left": 5,
        "boost_score": 100
      },
      "promotion_boost_score": 100,
      "online_now": true,
      "availability": {
        "status": "available",
        "timezone": "Asia/Tashkent"
      },
      "detail_url": "/marketplace/lawyers/{lawyer_user_id}",
      "services_url": "/marketplace/lawyers/{lawyer_user_id}/services",
      "purchase_url": "/marketplace/lawyers/{lawyer_user_id}/services/{service_id}/purchase-request",
      "services": [
        {
          "id": "...",
          "title": "Da'vo ariza tayyorlash",
          "category_id": "...",
          "category_title": "Fuqarolik",
          "base_price": 150000,
          "selected_price": 120000,
          "currency": "UZS",
          "purchase_url": "/marketplace/lawyers/{lawyer_user_id}/services/{service_id}/purchase-request"
        }
      ]
    }
  ],
  "count": 20,
  "total": 77,
  "limit": 20,
  "offset": 0,
  "filters": {
    "seller_type": "advokat",
    "region": "Toshkent",
    "district": null,
    "sort": "recommended"
  },
  "sort_options": ["recommended", "rating", "experience", "price_asc"]
}
```

Frontend listing card:

- Seller ism: `lawyer_name`
- Role badge: `seller_type`
- Hudud: `region`, `district`
- Rating: `rating`, `reviews_count`
- Tajriba: `experience_years` yoki `lawyer_experience_years`
- Ish statistikasi: `total_cases`, `success_rate`
- Narx: `price_from` dan boshlanadi
- Xizmatlar: `service_titles`
- Kategoriyalar: `categories`
- Boost badge: `promotion.active`
- Detail button: `detail_url`

### 3.3 Seller detail

```http
GET /marketplace/lawyers/{lawyer_user_id}
```

Auth shart emas.

Bu endpoint seller carddagi barcha ma'lumotlarga qo'shimcha:

- `reviews`
- `compare_key`

qaytaradi.

Frontend detail page:

- Profil header
- Verification badge
- Mutaxassisliklar
- Xizmatlar ro'yxati
- Narxlar
- Reviews
- Statistikalar
- Sotib olish buttonlari

### 3.4 Seller xizmatlari

```http
GET /marketplace/lawyers/{lawyer_user_id}/services
```

Response:

```json
{
  "lawyer_user_id": "...",
  "items": [
    {
      "id": "...",
      "title": "...",
      "selected_price": 120000,
      "purchase_url": "/marketplace/lawyers/{lawyer_user_id}/services/{service_id}/purchase-request"
    }
  ]
}
```

Frontend:

- Seller detail ichida service cards shu endpointdan olinadi.
- Har bir service cardda narx, delivery time, category va `Sotib olish` button bo'ladi.

### 3.5 Marketplace xizmat sotib olish

```http
POST /marketplace/lawyers/{lawyer_user_id}/services/{service_id}/purchase-request
Authorization: Bearer {client_token}
Content-Type: application/json
```

Request:

```json
{
  "note": "Menga shartnoma bo'yicha maslahat kerak",
  "preferred_channel": "chat",
  "preferred_time": "bugun 18:00 dan keyin"
}
```

Maydonlar:

| Field | Majburiy | Ma'nosi |
|---|---:|---|
| `note` | yo'q | mijoz izohi |
| `preferred_channel` | yo'q | `chat`, `audio`, `video`, `meeting` kabi qiymat |
| `preferred_time` | yo'q | mijozga qulay vaqt |
| `amount` | yo'q | odatda frontend yubormaydi, backend seller tanlagan narxni oladi |

Response:

```json
{
  "work_id": "ADV-XXXXX",
  "status": "pending",
  "next_status": "admin_telegram_confirm_required",
  "seller_will_receive_after_payment": true,
  "telegram_sent": true,
  "order": {
    "id": "...",
    "work_id": "ORD-XXXXX",
    "status": "pending_payment",
    "payment_status": "pending",
    "source": "marketplace",
    "details": {
      "marketplace": true,
      "flow": "direct_seller_service",
      "client_note": "...",
      "preferred_channel": "chat",
      "preferred_time": "...",
      "seller_type": "advokat",
      "work_id": "ADV-XXXXX"
    }
  },
  "payment": {
    "id": "...",
    "work_id": "PAY-XXXXX",
    "provider": "telegram_manual",
    "status": "pending",
    "amount": 120000,
    "currency": "UZS"
  },
  "purchase_request": {
    "id": "...",
    "work_id": "ADV-XXXXX",
    "module": "marketplace_purchase_request",
    "status": "pending",
    "payload": {
      "client_user_id": "...",
      "client_name": "...",
      "client_phone": "...",
      "lawyer_user_id": "...",
      "lawyer_name": "...",
      "lawyer_phone": "...",
      "seller_type": "advokat",
      "service_id": "...",
      "service_title": "...",
      "category_id": "...",
      "category_title": "...",
      "amount": 120000,
      "currency": "UZS",
      "preferred_channel": "chat",
      "preferred_time": "..."
    }
  }
}
```

Frontend UX:

1. Button bosilganda loading ko'rsatiladi.
2. 201 response kelsa “To'lov tasdiqlanishi kutilmoqda” statusi ko'rsatiladi.
3. Mijoz sahifasida pending request `work_id` bilan chiqadi.
4. Websocketdan `marketplace.order_paid` event kelganda status paidga o'tadi.
5. `chat_url` orqali chat ochiladi.

## 4. Telegram inline confirm flow

Hozir real payment provider ulanmagani uchun marketplace service purchase Telegram inline orqali tasdiqlanadi.

Telegramga boradigan message:

- Mijoz ismi/telefoni
- Mutaxassis ismi/telefoni
- Xizmat nomi
- Summa
- Tasdiqlash/Bekor qilish tugmalari

Tasdiqlansa backend:

- payment `paid`
- order `paid`
- order `contact_unlocked=true`
- secure chat room yaratadi yoki mavjudini ishlatadi
- clientga notification yuboradi
- sellerga notification yuboradi
- client va seller websocket kanaliga `marketplace.order_paid` yuboradi

Rad qilinsa:

- payment `cancelled`
- order `cancelled`
- request `rejected`
- clientga notification boradi

## 5. Sellerga ish qayerda ko'rinadi

Yangi endpoint:

```http
GET /marketplace/me/orders
Authorization: Bearer {token}
```

Seller token bilan kirsa:

```http
GET /marketplace/me/orders?role_view=seller
```

Client token bilan kirsa:

```http
GET /marketplace/me/orders?role_view=client
```

`role_view=auto` default. Seller roli bo'lsa seller view, client bo'lsa client view qaytadi.

Response:

```json
{
  "items": [
    {
      "id": "...",
      "work_id": "ORD-XXXXX",
      "client_user_id": "...",
      "lawyer_user_id": "...",
      "status": "paid",
      "payment_status": "paid",
      "source": "marketplace",
      "service_title": "Da'vo ariza tayyorlash",
      "lawyer_name": "Ali Valiyev",
      "price": 120000,
      "currency": "UZS",
      "details": {
        "marketplace": true,
        "flow": "direct_seller_service",
        "client_note": "...",
        "preferred_channel": "chat",
        "preferred_time": "..."
      },
      "client": {
        "id": "...",
        "lexgo_id": "LGC-...",
        "role": "client",
        "name": "...",
        "phone": "+998..."
      },
      "lawyer": {
        "id": "...",
        "lexgo_id": "LGA-...",
        "role": "advokat",
        "name": "...",
        "phone": "+998..."
      },
      "secure_chat_room_id": "...",
      "chat_url": "/secure-chats/{room_id}/messages",
      "payment": {
        "id": "...",
        "status": "paid",
        "amount": 120000
      },
      "can_start_chat": true,
      "can_create_call": true,
      "call_create_url": "/secure-chats/{room_id}/calls",
      "complete_url": "/orders/{order_id}/status"
    }
  ],
  "count": 1,
  "role_view": "seller",
  "seller_actions": {
    "open_chat": "chat_url",
    "create_call": "call_create_url",
    "complete": "complete_url"
  },
  "client_actions": {
    "open_chat": "chat_url",
    "create_call": "call_create_url"
  }
}
```

Seller kabinetida alohida page qilish tavsiya:

- `Marketplace buyurtmalar`
- filter: status
- cardda `work_id`, client, service, summa, preferred channel/time, status
- `Chatni ochish`
- `Call boshlash`
- `Yakunlash`

Client kabinetida:

- `Mening marketplace xizmatlarim`
- pending/paid/completed holatlar
- chatga o'tish
- call/meetingga o'tish

## 6. Websocket integratsiya

Frontend user kanaliga ulanib turishi kerak:

```text
user:{user_id}
```

Marketplace uchun event:

```json
{
  "event": "marketplace.order_paid",
  "work_id": "ADV-XXXXX",
  "order_id": "...",
  "payment_id": "...",
  "room_id": "...",
  "chat_url": "/secure-chats/{room_id}/messages",
  "lawyer_user_id": "...",
  "client_user_id": "...",
  "service_title": "..."
}
```

Frontend event olganda:

1. Pending purchase cardni paidga o'zgartiradi.
2. Clientga “Xizmat faollashtirildi” toast/push ko'rsatadi.
3. Sellerga “Yangi marketplace buyurtma” ko'rsatadi.
4. `/marketplace/me/orders`ni backgroundda refresh qiladi.
5. `chat_url` buttonni aktiv qiladi.

## 7. Promotion / marketplace boost

Seller marketplace ro'yxatida yuqoriroq chiqishi uchun boost sotib oladi.

Endpointlar:

```http
GET /promotions/me
GET /promotions/analytics
POST /promotions/checkout
```

Checkout:

```http
POST /promotions/checkout
Authorization: Bearer {seller_token}
Content-Type: application/json
```

Request:

```json
{
  "package_id": "...",
  "days": 7,
  "specialization": "fuqarolik"
}
```

Hozir Telegram inline confirm orqali tasdiqlanadi.

Tasdiqlansa seller cardda:

```json
{
  "promotion": {
    "active": true,
    "package_title": "...",
    "days_left": 7,
    "boost_score": 100
  },
  "promotion_boost_score": 100
}
```

Listing default `recommended` sortda avval `promotion_boost_score`, keyin trust/rating bo'yicha tartiblaydi.

## 8. Frontend sahifa strukturasi

### 8.1 Marketplace home

Route tavsiya:

```text
/marketplace/lawyers
```

UI:

- Search input
- Role tabs: Hammasi, Advokat, Yurist, Advokat tashkiloti
- Region/district filter
- Category/service filter
- Specialization filter
- Price range
- Rating filter
- Verified toggle
- Online toggle
- Sort dropdown
- Seller cards grid/list

API:

```http
GET /marketplace/meta
GET /marketplace/lawyers?...filters
```

### 8.2 Seller detail

Route:

```text
/marketplace/lawyers/:lawyerUserId
```

API:

```http
GET /marketplace/lawyers/{lawyer_user_id}
GET /marketplace/lawyers/{lawyer_user_id}/services
```

UI:

- Header: avatar/name/role/verified/rating
- Stats: total cases, success rate, experience
- Region/languages/specializations
- About/bio/education
- Services with price and purchase button
- Reviews
- Compare info

### 8.3 Purchase modal

When user presses service purchase:

Form:

- note textarea
- preferred channel select: chat/audio/video/meeting
- preferred time input

Submit:

```http
POST /marketplace/lawyers/{lawyer_user_id}/services/{service_id}/purchase-request
```

After success:

- show `work_id`
- status `To'lov tasdiqlanishi kutilmoqda`
- do not create duplicate request repeatedly without user confirmation
- wait websocket `marketplace.order_paid`

### 8.4 Seller marketplace orders

Route:

```text
/portal/advocate/marketplace-orders
/portal/lawyer/marketplace-orders
```

API:

```http
GET /marketplace/me/orders?role_view=seller
```

UI:

- status tabs: all, pending_payment, paid, completed, cancelled
- card:
  - `work_id`
  - client name/phone
  - service title
  - note
  - preferred channel/time
  - price
  - status
- buttons:
  - chat
  - call
  - complete

### 8.5 Client marketplace orders

Route:

```text
/portal/client/marketplace-orders
```

API:

```http
GET /marketplace/me/orders?role_view=client
```

UI:

- pending payment
- paid/active
- completed
- cancelled
- chat/call buttons when `can_start_chat=true`

## 9. Statuslar

### Purchase request

| Status | Ma'nosi |
|---|---|
| `pending` | Telegram confirm kutyapti |
| `approved` | To'lov tasdiqlandi |
| `rejected` | Bekor qilindi |
| `invalid` | Bog'langan payment/order topilmadi |

### Order

| Status | Ma'nosi |
|---|---|
| `pending_payment` | To'lov kutyapti |
| `paid` | To'lov tasdiqlandi, chat ochildi |
| `completed` | Ish yakunlandi |
| `cancelled` | Bekor qilindi |

### Payment

| Status | Ma'nosi |
|---|---|
| `pending` | Telegram confirm kutyapti |
| `paid` | Tasdiqlandi |
| `cancelled` | Rad qilindi |

## 10. Xatoliklar

### 401

Client login qilmagan.

Frontend:

- login modal/pagega yuborish

### 404 `Mutaxassis yoki xizmat topilmadi`

Seller/service yo'q yoki service inactive.

Frontend:

- detail/listni refresh qilish

### 404 `Bu mutaxassis ushbu xizmatni ko'rsatmaydi`

Seller bu xizmatni tanlamagan.

Frontend:

- service listni qayta olish

### 422

Request body noto'g'ri.

Frontend:

- form validation

## 11. Performance qoidalari

- Listingda birinchi request uchun `GET /marketplace/lawyers?include_meta=true` ishlatish mumkin.
- Keyingi filter o'zgarishlarida faqat `GET /marketplace/lawyers?...` ishlatish kerak.
- Detail sahifada listdagi card data bo'lsa skeleton o'rniga shu data bilan initial render qilish mumkin.
- Har sekund polling qilinmasin. Websocket `marketplace.order_paid` event ishlatilsin.
- Seller orders page ochilganda `GET /marketplace/me/orders` bir marta olinadi, keyin websocket event bilan yangilanadi.

## 12. Test qilingan production natijalar

Production serverda quyidagilar test qilindi:

- `GET /health` 200.
- `GET /marketplace/meta` 200.
- `GET /marketplace/lawyers?limit=2&include_meta=true` 200.
- Listing item ichida `price_from`, `price_to`, `categories`, `service_titles`, `detail_url`, `services_url`, `purchase_url` bor.
- Test client/seller/service bilan purchase request yaratildi.
- `POST /marketplace/lawyers/{lawyer_user_id}/services/{service_id}/purchase-request` 201 qaytdi.
- Telegram confirm handler orqali approve qilindi.
- Order va payment paid bo'ldi.
- Secure chat room ochildi.
- Seller `GET /marketplace/me/orders` orqali ishni ko'rdi.
- Client `GET /marketplace/me/orders` orqali ishni ko'rdi.

## 13. Frontend checklist

- [ ] Marketplace home page `/marketplace/lawyers`.
- [ ] `GET /marketplace/meta` bilan filter optionlarni olish.
- [ ] Seller cards uchun `GET /marketplace/lawyers`.
- [ ] `district`, `service_id`, `category_id`, `price_min`, `price_max`, `verified`, `online_now` filterlarini ulash.
- [ ] Seller detail page.
- [ ] Seller services list.
- [ ] Purchase modal.
- [ ] Purchase successda `work_id` ko'rsatish.
- [ ] Pending payment state.
- [ ] Websocket `marketplace.order_paid` eventni ulash.
- [ ] Client marketplace orders page.
- [ ] Seller marketplace orders page.
- [ ] Seller order carddan chat ochish.
- [ ] Seller order carddan call/meeting boshlash.
- [ ] Promotion checkout seller kabinetida ulash.
- [ ] Promotion active bo'lsa listingda boost badge ko'rsatish.

## 14. Muhim integratsiya eslatmalari

- Marketplace service purchase real payment emas, hozir Telegram inline confirm bilan ishlaydi.
- Frontend `amount` yubormasa ham bo'ladi; backend seller selected price yoki service base price oladi.
- Sellerga ish faqat Telegram confirmdan keyin tushadi.
- Confirmdan oldin seller order listda ko'rinmasligi mumkin, bu to'g'ri.
- Confirmdan keyin secure chat room ochiladi.
- Chat/call uchun `chat_url` va `call_create_url` ishlatiladi.
- `work_id` userga ko'rsatiladigan asosiy qisqa ID sifatida ishlatilsin.
- UUID UI'da ko'rsatilmasin.

