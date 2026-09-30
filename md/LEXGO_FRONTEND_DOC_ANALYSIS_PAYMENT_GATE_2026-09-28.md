# LexGo Frontend Update - Hujjat tahlili + advokat tekshiruvi payment gate

Sana: 2026-09-28

## Nima o'zgardi

Hujjatni analiz qilgandan keyin mijoz uni advokatga yuborsa va hujjat 10 sahifadan oshsa, backend endi so'rovni darhol advokatlarga yubormaydi.

Flow:

1. Mijoz hujjatni analiz qiladi.
2. Frontend `page_count` ni biladi.
3. Mijoz “Advokat tekshirsin” desa, backend `page_count > 10` bo'lsa qo'shimcha to'lov gate ochadi.
4. Telegramga inline “To'landi / Bekor qilish” so'rovi ketadi.
5. Tasdiqlanmaguncha request advokat pooliga tushmaydi.
6. Telegramda “To'landi” bosilsa payment `paid` bo'ladi va request navbatchi advokatlar pooliga tushadi.
7. “Bekor qilish” bosilsa request `payment_cancelled` bo'ladi.

## Qaysi endpointlarga ulandi

### 1. Bor service/template bilan advokatga yuborish

```http
POST /services/{service_id}/document-lawyer/request
```

JSON body ichida optional yuboring:

```json
{
  "need": "Advokat tekshirib bersin",
  "page_count": 12,
  "urgency": "normal"
}
```

### 2. File/voice bilan advokatga yuborish

```http
POST /services/{service_id}/document-lawyer/request-with-files
```

Form-data ichida optional yuboring:

```text
page_count=12
urgency=normal
```

### 3. Constructor hujjatini advokatga tekshirtirish

```http
POST /document-requests/{request_id}/lawyer-review
```

JSON body ichida optional yuboring:

```json
{
  "need": "Konstruktorda yasalgan hujjatni tekshirib bering",
  "page_count": 12,
  "urgency": "normal"
}
```

### 4. Mavjud hujjatni advokatga tekshirtirish

```http
POST /document-services/review-existing/request
```

Form-data:

```text
need=Hujjatni tekshirib bering
page_count=12
urgency=normal
main_file=<docx/pdf/txt>
```

Agar `page_count` yuborilmasa, backend filedan aniqlashga harakat qiladi:

- PDF: real page count
- DOCX/TXT: taxminiy, 2500 belgi = 1 sahifa

## Response: payment kerak bo'lsa

Agar `page_count > 10` bo'lsa response shunday keladi:

```json
{
  "payment_required": true,
  "payment_gate": {
    "id": "...",
    "status": "pending",
    "payment_id": "...",
    "amount": 299000,
    "currency": "UZS",
    "page_count": 12,
    "included_pages": 10,
    "extra_pages": 2,
    "telegram_sent": true,
    "quote": {
      "page_count": 12,
      "included_pages": 10,
      "extra_pages": 2,
      "lawyer_review_amount": 299000,
      "total_amount": 299000,
      "payment_required": true
    }
  },
  "request": {
    "status": "payment_required"
  },
  "lawyer_request": {
    "status": "pending_payment"
  }
}
```

Frontend bunday holatda:

- “To'lov tasdiqlanishi kutilmoqda” holatini ko'rsatadi.
- Advokatga yuborildi deb ko'rsatmaydi.
- Pool/chat/editor ochmasin.
- WS/notification orqali keyingi statusni kutadi.

## Response: 10 sahifagacha

Agar `page_count <= 10` yoki page_count yo'q bo'lsa, request avvalgidek `open_pool` bo'ladi va advokatlarga tushadi.

## Telegram approve'dan keyin

Backend holatlari:

- payment: `paid`
- document request: `lawyer_review_requested`
- lawyer request: `open_pool`

Frontendga realtime event boradi:

```json
{
  "event": "document_request.pool_created"
}
```

Client uchun:

```json
{
  "event": "document_request.sent"
}
```

## Telegram reject'dan keyin

Backend holatlari:

- payment: `cancelled`
- document request: `payment_cancelled`
- lawyer request: `payment_cancelled`

Frontend UI:

- “To'lov bekor qilindi” ko'rsatiladi.
- Qayta yuborish yoki paymentni qayta boshlash buttoni chiqarilishi mumkin.

## Narx qoidasi

Backend policy:

```json
{
  "1-10": 149000,
  "11-20": 299000,
  "21-30": 499000,
  "30+": "page_count * 15000"
}
```

Payment gate faqat `page_count > 10` bo'lganda majburiy qilindi.

## Analiz qilingan file editor masalasi

Mijoz mavjud DOCX file yuborsa:

- backend `editor_source=uploaded_docx` qiladi
- advokat ishni olgandan keyin editor shu DOCX file asosida ochilishi kerak
- file faqat chat attachment bo'lib qolmasligi kerak

Agar PDF/TXT bo'lsa:

- backend page_count hisoblashga harakat qiladi
- file attachment sifatida boradi
- editor uchun blank/AI draft flow ishlatiladi, chunki PDF/TXT bevosita DOCX editor file emas

## Frontend test checklist

1. 9 sahifa hujjat yuboring:
   - request darhol `open_pool`
   - advokat poolida ko'rinadi

2. 12 sahifa hujjat yuboring:
   - `payment_required=true`
   - `lawyer_request.status=pending_payment`
   - advokat poolida ko'rinmasligi kerak

3. Telegramda “To'landi” bosilgandan keyin:
   - `lawyer_request.status=open_pool`
   - advokat poolida ko'rinadi

4. Telegramda “Bekor qilish” bosilgandan keyin:
   - `payment_cancelled`
   - advokat poolida chiqmaydi

5. DOCX file review:
   - advokat ishni olganda editor `uploaded_docx` source bilan ochilishi kerak

## Production test natijasi

Backend production containerda test qilindi:

- 12 sahifalik DOCX yuborildi
- response: `payment_required=true`
- amount: `299000 UZS`
- request status: `payment_required`
- lawyer request status: `pending_payment`
- editor_source: `uploaded_docx`
- approve simulyatsiya qilindi
- gate status: `approved`
- document request status: `lawyer_review_requested`
- lawyer request status: `open_pool`
- editor_source saqlandi: `uploaded_docx`
