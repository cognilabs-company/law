# LexGo Frontend Update: Qo'lda hujjat to'ldirish uchun paket access

## Maqsad

Client xizmatlardagi shablonlarni yuklab olish va o'zi qo'lda to'ldirish funksiyasidan faqat paket tasdiqlangandan keyin foydalana oladi.

AI bilan hujjat tayyorlash va advokat bilan hujjat tayyorlash flowlari alohida qoladi.

## Entitlement tekshirish

Client portal ochilganda yoki xizmat detailga kirganda:

```http
GET /clients/me/entitlements
Authorization: Bearer {client_token}
```

Muhim response qismi:

```json
{
  "manual_documents": {
    "manual_document_templates": true,
    "template_download": true,
    "manual_document_fill": true,
    "source": "shaxsiy-advokat-standard"
  },
  "pending_manual_document_plan_requests": []
}
```

Agar `manual_documents.template_download=false` yoki `manual_document_fill=false` bo'lsa:

- shablon download tugmasi disabled
- "Qo'lda to'ldirish" disabled
- "Paket sotib olish" tugmasi chiqadi

## Paket tanlash

Paketlar:

```http
GET /subscription-plans
```

Qo'lda document access beradigan planlar `entitlements` ichida quyidagilar bilan keladi:

```json
{
  "entitlements": {
    "manual_document_templates": true,
    "template_download": true,
    "manual_document_fill": true
  }
}
```

Frontend faqat shu entitlement bor planlarni "Qo'lda hujjat to'ldirish uchun paket" sifatida ko'rsatsin.

## Paket sotib olish so'rovi

Client paket tanlab "Sotib olish" bossa:

```http
POST /subscription-plans/{plan_id}/telegram-purchase-request
Authorization: Bearer {client_token}
Content-Type: application/json
```

Body:

```json
{
  "billing_period": "monthly",
  "currency": "UZS"
}
```

Allowed billing periodlar:

- `monthly`
- `six_month`
- `yearly`
- `prepaid_yearly`

Response:

```json
{
  "id": "purchase_request_id",
  "status": "pending",
  "payment_id": "payment_id",
  "plan_id": "plan_id",
  "plan_slug": "shaxsiy-advokat-standard",
  "amount": 149000,
  "currency": "UZS",
  "telegram_sent": true
}
```

Backend bu so'rovni Telegramdagi 3 ta approval chatga inline button bilan yuboradi:

- Tasdiqlash
- Bekor qilish

Tasdiqlansa:

- payment `paid`
- subscription `active`
- clientga `manual_document_templates/template_download/manual_document_fill` ruxsati ochiladi

Bekor qilinsa:

- request `rejected`
- payment `cancelled`

Frontend pending holatda:

```txt
So'rovingiz yuborildi. Tasdiqlangandan keyin qo'lda hujjat to'ldirish ochiladi.
```

Keyin `GET /clients/me/entitlements`ni qayta chaqiring.

## Access yo'q bo'lsa backend xatosi

Plan yo'q client quyidagi endpointlarni chaqirsa:

```http
GET /services/{service_id}/document-fields
GET /services/{service_id}/document-template
GET /services/{service_id}/document-template/clean-source-file
POST /services/{service_id}/document-preview
POST /services/{service_id}/document-generate
POST /services/{service_id}/document-requests
```

Backend:

```json
{
  "detail": {
    "code": "manual_document_plan_required",
    "message": "Shablonni yuklab olish va qo'lda to'ldirish uchun paket sotib oling",
    "required_capability": "manual_document_fill",
    "purchase_request_url": "/subscription-plans/{plan_id}/telegram-purchase-request"
  }
}
```

Status: `402`

Frontend bu xatoda paket tanlash modalini ochsin.

## Fieldlar ketma-ketligi

`GET /services/{service_id}/document-fields` endi har fieldga tartib beradi:

```json
{
  "fields": [
    {
      "order": 1,
      "sort_order": 1,
      "name": "...",
      "label": "...",
      "type": "text",
      "required": true
    }
  ]
}
```

Frontend fieldlarni `order` yoki `sort_order` bo'yicha yuqoridan-pastga chiqarishi kerak.

## Shablon download

Plan tasdiqlangandan keyin client clean template yuklay oladi:

```http
GET /services/{service_id}/document-template/clean-source-file
Authorization: Bearer {client_token}
```

DOCX ichida markerlar ko'rinmaydi:

```txt
________ (Шартнома тузилган вақт)
________ (Даъвогар Ф.И.Ш.)
```

Clientga buni bermang:

```http
GET /services/{service_id}/document-template/source-file
```

Client uchun bu endpoint `403` qaytaradi, chunki markerli original source faqat ichki workflow uchun.

## Eski 36 ta civil-court import

Oldingi RARdan kirgan `civil-court-doc-*` xizmatlari production katalogdan olib tashlandi.

Natija:

- `civil-court-doc-*` service count: `0`
- `civil-court-*` category count: `0`
- eski 36 template file diskdan o'chirildi
- eski 36 template active emas

Template DB rowlari tarixni sindirmaslik uchun inactive holda qoldi, chunki ularga bog'langan eski document requestlar bor.

## Production test natijasi

- Plan yo'q client `GET /document-fields` -> `402 manual_document_plan_required`
- Paket so'rovi Telegramga yuborildi -> `telegram_sent=true`
- Tasdiqlangandan keyin `GET /document-fields` -> `200`
- Fieldlar `order` bilan qaytdi
- Clean DOCXda `________ (label)` bor
- Clean DOCXda `{}` marker qolmadi
- Client `source-file` chaqirsa -> `403`

