# Frontend Document Generation Flow

Bu hujjat frontendchi uchun document template, questionnaire, preview va generate oqimini tushuntiradi.

## Production Holati

- Backend deploy qilingan: `https://lexgo.api.cognilabs.org`
- `Ҳуқуқий ҳужжатлар.rar` ichidagi 10 ta huquqiy hujjat backendga import qilindi.
- Public legal consent list faqat 10 ta active hujjat qaytaradi.
- Har bir hujjatda `uz`, `uz_cyrl`, `ru` matnlari bor.
- Admin legal consent edit endpointlari ishlaydi.
- Service ichiga `document_template_id` qo‘shildi.
- Service orqali document request yaratish ishlaydi.
- Narxi `0` bo‘lgan hujjatlar payment talab qilmaydi.
- PDF va DOCX download ishlaydi.

## Huquqiy Hujjatlar

```http
GET /legal/consents
GET /legal/consents/me
POST /legal/consents/{consent_id}/accept
GET /admin/legal/consents
POST /admin/legal/consents
PUT /admin/legal/consents/{consent_id}
PATCH /admin/legal/consents/{consent_id}
DELETE /admin/legal/consents/{consent_id}
GET /admin/legal/user-consents
```

Active hujjatlar:

- `user_offer`
- `privacy`
- `cookie`
- `lawyer_partnership_offer`
- `organization_agreement`
- `client_advocate_contract_template`
- `payment_refund_warranty`
- `platform_rules`
- `personal_data_consent`
- `age_18`

Frontend admin panelda `title_json` va `body_json` bilan 3 tilda edit qilishi kerak.

## Asosiy Flow

1. Foydalanuvchi xizmatlar bo‘limidan category ichidagi hujjat turini tanlaydi.
2. Frontend `GET /service-categories` va `GET /services?category_id={category_id}` orqali xizmatlarni oladi.
3. Har service javobida `document_template_id` bo‘lsa, bu xizmat document generation flowga ulangan.
4. Frontend `GET /services/{service_id}/document-template` orqali shu servicega ulangan template va fields oladi.
5. Foydalanuvchi `Create document` bosadi.
6. Frontend `POST /services/{service_id}/document-requests` qiladi.
7. Backend template `fields` ni request `questionnaire` sifatida saqlaydi.
8. Frontend request ichidagi `questionnaire` asosida input formalarni chizadi.
9. Har input o‘zgarganda frontend `POST /document-requests/{request_id}/preview` qiladi.
10. Backend `preview_text`, `missing_required_fields`, `can_generate`, `completion_percent` qaytaradi.
11. `can_generate=true` bo‘lganda frontend payment/generate tugmalarini aktiv qiladi.
12. To‘lov kerak bo‘lsa `POST /document-requests/{request_id}/payments` ishlatiladi.
13. To‘lovdan keyin yoki staff user uchun `POST /document-requests/{request_id}/generate` PDF yaratadi.
14. PDF yuklab olish: `GET /document-requests/{request_id}/file`.
15. DOCX yuklab olish: `GET /document-requests/{request_id}/docx`.

Alternativ flow:

1. Frontend `GET /document-templates?category={category}` orqali active templatelarni oladi.
3. Foydalanuvchi template tanlab `Create document` bosadi.
4. Frontend `POST /document-requests` qiladi.
5. Backend template `fields` ni request `questionnaire` sifatida saqlaydi.
6. Frontend request ichidagi `questionnaire` asosida input formalarni chizadi.
7. Har input o‘zgarganda frontend `POST /document-requests/{request_id}/preview` qiladi.
8. Backend `preview_text`, `missing_required_fields`, `can_generate`, `completion_percent` qaytaradi.
9. `can_generate=true` bo‘lganda frontend payment/generate tugmalarini aktiv qiladi.
10. To‘lov kerak bo‘lsa `POST /document-requests/{request_id}/payments` ishlatiladi.
11. To‘lovdan keyin yoki staff user uchun `POST /document-requests/{request_id}/generate` PDF yaratadi.
12. PDF yuklab olish: `GET /document-requests/{request_id}/file`.
13. DOCX yuklab olish: `GET /document-requests/{request_id}/docx`.

## Service List

```http
GET /service-categories
GET /services?category_id={category_id}&catalog_only=false
```

Service javobida document flow uchun kerakli field:

```json
{
  "id": "service-id",
  "category_id": "category-id",
  "title": "Shartnoma tayyorlash",
  "document_template_id": "template-id"
}
```

`document_template_id=null` bo‘lsa, service oddiy marketplace service bo‘lib turadi.

## Service Template

```http
GET /services/{service_id}/document-template
Authorization: Bearer {token}
```

Javob:

```json
{
  "service": {
    "id": "service-id",
    "title": "Shartnoma tayyorlash",
    "document_template_id": "template-id"
  },
  "template": {
    "id": "template-id",
    "title": "Service Agreement",
    "fields": []
  },
  "flow": "service_category_to_questionnaire_preview_generate_pdf_docx"
}
```

## Create From Service

```http
POST /services/{service_id}/document-requests
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "answers": {},
  "title": "Service Agreement"
}
```

Backend servicega ulangan template orqali request yaratadi. `questionnaire` ichida frontend inputlari uchun fields qaytadi.

## Template Field Format

```json
{
  "name": "client_name",
  "key": "client_name",
  "label": "Client full name",
  "type": "text",
  "required": true,
  "placeholder": "{{client_name}}"
}
```

`name` va `key` frontend uchun bir xil ishlatilishi mumkin. Input value `answers[name]` ichiga yoziladi.

Qo‘llanadigan `type` qiymatlari:

- `text`
- `textarea`
- `date`
- `number`
- `select`
- `checkbox`

## Template List

```http
GET /document-templates?category=contract
Authorization: Bearer {token}
```

Javob:

```json
[
  {
    "id": "template-id",
    "slug": "service-agreement",
    "title": "Service Agreement",
    "category": "contract",
    "language": "uz-latn",
    "description": "Xizmat shartnomasi",
    "fields": [
      {
        "name": "client_name",
        "key": "client_name",
        "label": "Client full name",
        "type": "text",
        "required": true,
        "placeholder": "{{client_name}}"
      }
    ],
    "template_text": "THIS AGREEMENT is entered into by {{client_name}}.",
    "price": 25000,
    "visibility": "client",
    "is_active": true
  }
]
```

## Create Document Request

```http
POST /document-requests
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "template_id": "template-id",
  "document_type": "contract",
  "title": "Service Agreement",
  "answers": {}
}
```

Backend template fieldlarini avtomatik `questionnaire` qilib saqlaydi.

## Real Time Preview

```http
POST /document-requests/{request_id}/preview
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "answers": {
    "client_name": "Kamron Karimov",
    "company_name": "ABC MCHJ",
    "contract_date": "2026-09-19",
    "amount": 5000000
  }
}
```

Javob:

```json
{
  "preview_text": "THIS AGREEMENT is entered into on 2026-09-19 between Kamron Karimov and ABC MCHJ.",
  "final_text": "THIS AGREEMENT is entered into on 2026-09-19 between Kamron Karimov and ABC MCHJ.",
  "missing_required_fields": [],
  "can_generate": true,
  "completion_percent": 100,
  "placeholder_mapping": {
    "{{client_name}}": "Kamron Karimov",
    "{{company_name}}": "ABC MCHJ"
  }
}
```

Required field to‘ldirilmasa:

```json
{
  "preview_text": "THIS AGREEMENT is entered into by [Client full name].",
  "missing_required_fields": [
    {
      "name": "client_name",
      "key": "client_name",
      "label": "Client full name"
    }
  ],
  "can_generate": false,
  "completion_percent": 0
}
```

## Save Answers

```http
PUT /document-requests/{request_id}/answers
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "answers": {
    "client_name": "Kamron Karimov",
    "company_name": "ABC MCHJ",
    "contract_date": "2026-09-19",
    "amount": 5000000
  }
}
```

Backend statusni avtomatik belgilaydi:

- `questionnaire`: required fieldlar hali to‘liq emas
- `ready_to_generate`: barcha required fieldlar to‘liq va narx 0
- `awaiting_payment`: barcha required fieldlar to‘liq va to‘lov kerak
- `payment_pending`: payment yaratilgan
- `file_ready`: yakuniy fayl tayyor

## Payment Policy

```http
GET /document-requests/{request_id}/unlock-policy
Authorization: Bearer {token}
```

Frontend `can_generate`, `requires_payment`, `missing_required_fields` va `formats` qiymatlariga qaraydi.

Narx `0` bo‘lsa backend:

```json
{
  "paid": true,
  "requires_payment": false,
  "can_generate": true
}
```

qaytaradi.

Narx `0` dan katta bo‘lsa, frontend avval payment yaratadi va confirmdan keyin generate qiladi.

## Generate PDF

```http
POST /document-requests/{request_id}/generate
Authorization: Bearer {token}
```

Agar required field yetishmasa backend `422` qaytaradi:

```json
{
  "detail": {
    "message": "Required fieldlar to'ldirilmagan",
    "missing_required_fields": [
      {
        "name": "client_name",
        "key": "client_name",
        "label": "Client full name"
      }
    ]
  }
}
```

## Download

PDF:

```http
GET /document-requests/{request_id}/file
Authorization: Bearer {token}
```

DOCX:

```http
GET /document-requests/{request_id}/docx
Authorization: Bearer {token}
```

## Frontend UI Tavsiya

- Chap tarafda input formalar.
- O‘ng tarafda real time document preview.
- Required field errorlari field tagida ko‘rsatiladi.
- `Complete document` tugmasi `can_generate=false` bo‘lsa disabled turadi.
- `completion_percent` progress indikator uchun ishlatiladi.
- Preview uchun har klavish bosilganda emas, 300-500 ms debounce bilan API chaqirish tavsiya qilinadi.

## Production Smoke Test Natijasi

- `GET /services/{service_id}/document-template`: 200
- `POST /services/{service_id}/document-requests`: 201
- Partial answers: `status=questionnaire`, `can_generate=false`
- Full answers: `status=ready_to_generate`, `can_generate=true`
- `GET /document-requests/{request_id}/unlock-policy`: `paid=true`, `requires_payment=false`
- `POST /document-requests/{request_id}/generate`: `status=file_ready`
- `GET /document-requests/{request_id}/docx`: 200, DOCX file
- `GET /document-requests/{request_id}/file`: 200, PDF file
