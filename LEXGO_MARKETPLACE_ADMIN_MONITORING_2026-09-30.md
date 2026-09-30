# LexGo Marketplace Admin Monitoring Update

Sana: 2026-09-30

## Nima tuzatildi

### Tezkor Advokat claim xatosi

Oldingi xato:

```json
{
  "detail": "scheduled holatidan claimed holatiga o'tkazib bo'lmaydi"
}
```

Endi `scheduled -> claimed` lifecycle ruxsatli.

Endpoint:

```http
POST /call-center/urgent-advokat/requests/{record_id}/claim
```

Production test:

- `b07280ae-113d-4b39-8815-44add9b0af89`
- oldingi status: `scheduled`
- claim response: `200`
- yangi status: `claimed`

Backend qo'shimcha himoya:

- final statusdagi ishni claim qilib bo'lmaydi;
- boshqa operator olgan ishni oddiy operator overwrite qila olmaydi;
- admin/superadmin staff override qila oladi.

## Marketplace admin monitoring APIlari

Admin panel marketplace holatini kuzatishi uchun alohida endpointlar qo'shildi.

Authorization:

```http
Authorization: Bearer {admin_token}
```

Ruxsat:

- admin/superadmin
- `orders.manage`
- staff access

### 1. Umumiy marketplace overview

```http
GET /admin/marketplace/overview
```

Query:

```text
status?
seller_user_id?
client_user_id?
date_from?  YYYY-MM-DD yoki ISO datetime
date_to?    YYYY-MM-DD yoki ISO datetime
```

Response asosiy qismlari:

```json
{
  "stats": {
    "orders_total": 3,
    "paid_orders": 3,
    "active_orders": 3,
    "completed_orders": 0,
    "pending_payment_orders": 0,
    "cancelled_orders": 0,
    "revenue_paid": 333000,
    "sellers_count": 1,
    "clients_count": 2,
    "by_status": {
      "paid": 3
    }
  },
  "actions": {
    "orders_url": "/admin/marketplace/orders",
    "sellers_url": "/admin/marketplace/sellers"
  }
}
```

Frontend dashboard cardlari:

- jami marketplace ishlar;
- aktiv ishlar;
- to'langan ishlar;
- yakunlangan ishlar;
- pending payment;
- bekor qilinganlar;
- paid revenue;
- seller/client soni;
- status chart.

### 2. Marketplace orderlar ro'yxati

```http
GET /admin/marketplace/orders
```

Query:

```text
status?
seller_user_id?
client_user_id?
date_from?
date_to?
limit=50
offset=0
```

Response:

```json
{
  "items": [
    {
      "id": "order_uuid",
      "work_id": "ADV-XXXXX",
      "order_work_id": "ORD-XXXXX",
      "status": "paid",
      "payment_status": "paid",
      "client": {},
      "lawyer": {},
      "payment": {},
      "chat_url": "/secure-chats/{room_id}/messages",
      "call_create_url": "/secure-chats/{room_id}/calls",
      "cancel_url": "/marketplace/me/orders/{order_id}/cancel",
      "complete_url": "/marketplace/me/orders/{order_id}/complete"
    }
  ],
  "count": 50,
  "total": 120
}
```

Admin panelda:

- order jadvali;
- status filter;
- seller filter;
- client filter;
- sana oralig'i;
- detailga o'tish.

### 3. Marketplace order detail

```http
GET /admin/marketplace/orders/{order_id}
```

Response:

```json
{
  "order": {},
  "purchase_requests": [],
  "activity": []
}
```

Admin detailda ko'rsatiladi:

- client;
- advokat/yurist;
- xizmat;
- summa;
- status;
- payment status;
- chat/call linklari;
- Telegram confirm record;
- activity history.

### 4. Marketplace seller monitoring

```http
GET /admin/marketplace/sellers
```

Query:

```text
q?
status?
date_from?
date_to?
limit=50
offset=0
```

Response:

```json
{
  "items": [
    {
      "seller": {},
      "seller_type": "advokat",
      "region": "Toshkent",
      "district": "",
      "rating": 4.8,
      "reviews_count": 12,
      "is_verified": true,
      "verification_status": "approved",
      "services_count": 3,
      "orders_total": 8,
      "active_orders": 2,
      "pending_payment_orders": 1,
      "completed_orders": 5,
      "paid_orders": 7,
      "revenue_paid": 1200000,
      "last_order_at": "2026-09-30T..."
    }
  ]
}
```

Admin panelda:

- qaysi advokat/yuristda qancha aktiv ish bor;
- qancha ish yakunlagan;
- qancha revenue qilgan;
- oxirgi ish vaqti;
- verified holati;
- service count.

## Frontend tavsiya

Admin marketplace uchun alohida sahifa qiling:

```text
SuperAdmin -> Marketplace monitoring
```

Tablar:

1. Overview
2. Orders
3. Sellers

Orders jadvalda `work_id` sifatida `ADV-XXXXX` ko'rsating.

`id` faqat API action uchun ishlatilsin.

Seller monitoringda `active_orders` katta bo'lgan sellerlarni tepada ko'rsatish yaxshi.

## Production test natijasi

```text
GET /admin/marketplace/overview -> 200
GET /admin/marketplace/orders?limit=2 -> 200
GET /admin/marketplace/sellers?limit=2 -> 200
GET /admin/marketplace/orders/{order_id} -> 200
POST /call-center/urgent-advokat/requests/{record_id}/claim -> 200
```
