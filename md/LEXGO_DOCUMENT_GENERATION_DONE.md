# LexGo Backend Update: Service Document Generation

## Qilingan Ishlar

Backendda LegalZoom uslubidagi document generation flow qo'shildi.

Asosiy maqsad:

- Foydalanuvchi xizmatlar bo'limidan hujjat turini tanlaydi.
- Frontend servicega ulangan template fieldsni oladi.
- Foydalanuvchi hujjat matnini qo'lda tahrirlamaydi.
- Foydalanuvchi faqat input formalarni to'ldiradi.
- Backend `{{placeholder}}` qiymatlarini answers bilan almashtiradi.
- Preview realtime ko'rsatiladi.
- Required fieldlar to'lmaguncha generate yopiq turadi.
- Yakuniy hujjat PDF va DOCX qilib qaytariladi.

## Production URL

Backend:

```text
https://lexgo.api.cognilabs.org
```

## Legal Consent Import

`Ҳуқуқий ҳужжатлар.rar` ichidagi 10 ta huquqiy hujjat production DBga import qilindi.

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

Har bir hujjatda 3 til matni bor:

- `uz`
- `uz_cyrl`
- `ru`

Public legal consent listda faqat shu 10 ta active hujjat chiqadi. Eski placeholder/test active hujjatlar public listdan olib tashlandi.

## Service Template Link

Service modelga `document_template_id` qo'shildi.

Service response endi shunday field qaytaradi:

```json
{
  "id": "service-id",
  "title": "Shartnoma tayyorlash",
  "document_template_id": "template-id"
}
```

Agar `document_template_id` `null` bo'lsa, bu oddiy marketplace service.

Agar `document_template_id` bor bo'lsa, frontend document generation flow ochishi kerak.

## Frontend Flow

1. Category list olinadi.
2. Category ichidagi servicelar olinadi.
3. Service ichida `document_template_id` borligi tekshiriladi.
4. Service template olinadi.
5. User `Create document` bosadi.
6. Document request yaratiladi.
7. Frontend `questionnaire` yoki `template.fields` asosida form chizadi.
8. User input to'ldirganda preview API chaqiriladi.
9. Backend placeholderlarni answers bilan almashtirib preview qaytaradi.
10. Required fieldlar to'lsa `can_generate=true` bo'ladi.
11. User `Generate` bosadi.
12. Backend PDF yaratadi.
13. Frontend PDF yoki DOCX file download qiladi.

## Endpointlar

### Categories

```http
GET /service-categories
```

### Services

```http
GET /services?category_id={category_id}&catalog_only=false
```

`catalog_only=false` ishlatish kerak, chunki document service catalog metadata bo'lmasa ham chiqishi mumkin.

### Service Template

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
    "description": "Xizmat shartnomasi",
    "category": "contract",
    "fields": []
  },
  "flow": "service_category_to_questionnaire_preview_generate_pdf_docx"
}
```

### Create Document Request From Service

```http
POST /services/{service_id}/document-requests
Authorization: Bearer {token}
Content-Type: application/json
```

Body:

```json
{
  "answers": {},
  "title": "Service Agreement"
}
```

Javobda document request qaytadi. `questionnaire` ichida form fields bo'ladi.

### Preview

```http
POST /document-requests/{request_id}/preview
Authorization: Bearer {token}
Content-Type: application/json
```

Body:

```json
{
  "answers": {
    "client_name": "Kamron Karimov",
    "company_name": "ABC MCHJ",
    "contract_date": "19.09.2026",
    "amount": "5000000"
  }
}
```

Javob:

```json
{
  "preview_text": "THIS AGREEMENT is entered into on 19.09.2026 between Kamron Karimov and ABC MCHJ.",
  "final_text": "THIS AGREEMENT is entered into on 19.09.2026 between Kamron Karimov and ABC MCHJ.",
  "missing_required_fields": [],
  "can_generate": true,
  "completion_percent": 100,
  "placeholder_mapping": {
    "{{client_name}}": "Kamron Karimov",
    "{{company_name}}": "ABC MCHJ",
    "{{contract_date}}": "19.09.2026",
    "{{amount}}": "5000000"
  }
}
```

Required field yetishmasa:

```json
{
  "can_generate": false,
  "missing_required_fields": [
    {
      "name": "company_name",
      "key": "company_name",
      "label": "Kompaniya"
    }
  ]
}
```

### Save Answers

```http
PUT /document-requests/{request_id}/answers
Authorization: Bearer {token}
Content-Type: application/json
```

Body:

```json
{
  "answers": {
    "client_name": "Kamron Karimov",
    "company_name": "ABC MCHJ",
    "contract_date": "19.09.2026",
    "amount": "5000000"
  }
}
```

Statuslar:

- `questionnaire`: required fieldlar to'liq emas
- `ready_to_generate`: required fieldlar to'liq va narx 0
- `awaiting_payment`: required fieldlar to'liq va to'lov kerak
- `payment_pending`: payment yaratilgan
- `file_ready`: file tayyor

### Unlock Policy

```http
GET /document-requests/{request_id}/unlock-policy
Authorization: Bearer {token}
```

Narx 0 bo'lsa:

```json
{
  "paid": true,
  "requires_payment": false,
  "can_generate": true,
  "formats": ["pdf", "docx"]
}
```

Narx 0 dan katta bo'lsa frontend payment flow ochishi kerak.

### Generate PDF

```http
POST /document-requests/{request_id}/generate
Authorization: Bearer {token}
```

Success:

```json
{
  "status": "file_ready"
}
```

### Download PDF

```http
GET /document-requests/{request_id}/file
Authorization: Bearer {token}
```

### Download DOCX

```http
GET /document-requests/{request_id}/docx
Authorization: Bearer {token}
```

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

Frontend `answers[name]` qilib yuboradi.

Qo'llanadigan field typelar:

- `text`
- `textarea`
- `date`
- `number`
- `select`
- `checkbox`

## Frontend UI Talab

- Chap tarafda input formalar.
- O'ng tarafda document preview.
- Preview 300-500 ms debounce bilan chaqirilsin.
- Required fieldlar bo'sh bo'lsa error field tagida ko'rsatilsin.
- `can_generate=false` bo'lsa `Complete document` disabled bo'lsin.
- `completion_percent` progress uchun ishlatilsin.
- PDF va DOCX download alohida button bo'lsin.

## Production Smoke Test Natijasi

Production serverda test qilindi.

Natijalar:

- `GET /services/{service_id}/document-template`: 200
- `POST /services/{service_id}/document-requests`: 201
- Partial answers bilan preview: `can_generate=false`
- Full answers bilan preview: `can_generate=true`
- `GET /document-requests/{request_id}/unlock-policy`: `paid=true`, `requires_payment=false`, `can_generate=true`
- `POST /document-requests/{request_id}/generate`: `file_ready`
- `GET /document-requests/{request_id}/docx`: 200, DOCX file qaytdi
- `GET /document-requests/{request_id}/file`: 200, PDF file qaytdi

## Muhim Eslatma

RAR ichidagi 10 ta hujjat huquqiy consent/legal document journal sifatida import qilindi.

Service bo'limida document generation ishlashi uchun backend tayyor:

- servicega template ulash bor
- template fields bor
- placeholder replace bor
- preview bor
- PDF/DOCX generate bor

Frontend endi service card ichida `document_template_id` bor service uchun yuqoridagi flow bo'yicha document builder ochishi kerak.
