# LexGo Frontend Update — Document Payment Skip and Lawyer Inbox

Backend production updated: `https://lexgo.api.cognilabs.org`

## 1. Payment screen must be skipped for service documents

Hozir payment provider real ulanmagani uchun xizmat hujjatlarida payment backendda avtomatik tasdiqlanadi.

Document request response endi quyidagi fieldlarni qaytaradi:

```json
{
  "payment_status": "paid",
  "paid": true,
  "requires_payment": false,
  "auto_confirm_payment": true
}
```

Frontend rule:

```ts
const shouldSkipPayment =
  request.paid === true ||
  request.payment_status === "paid" ||
  request.requires_payment === false ||
  request.auto_confirm_payment === true;
```

Agar `shouldSkipPayment === true` bo'lsa:

- "To'lov amalga oshirilmoqda" ekranini ko'rsatmaslik kerak.
- Userni keyingi stepga o'tkazish kerak.
- AI flowda tayyor file ko'rsatish kerak.
- Advokat flowda "So'rovingiz advokatga yuborildi" statusini ko'rsatish kerak.

## 2. AI bilan to'ldirish flow

Endpoint:

`POST /services/{service_id}/document-ai/generate`

Response:

```json
{
  "document_request": {
    "status": "file_ready",
    "payment_status": "paid",
    "paid": true,
    "requires_payment": false,
    "auto_confirm_payment": true
  },
  "file": {
    "download_url": "/document-requests/{request_id}/file"
  }
}
```

Frontend:

- Payment page skip.
- File download/open UI ko'rsatish.

## 3. O'zim to'ldiraman flow

Endpoint:

`POST /services/{service_id}/document-requests`

Response:

```json
{
  "status": "ready_to_generate",
  "payment_status": "paid",
  "paid": true,
  "requires_payment": false,
  "auto_confirm_payment": true
}
```

Frontend:

- Payment page skip.
- `POST /document-requests/{request_id}/generate` chaqirish mumkin.
- Keyin `/document-requests/{request_id}/file` orqali file olinadi.

## 4. Advokat bilan to'ldirish flow

Client advokat/call-center advokat tanlaydi:

`POST /services/{service_id}/document-lawyer/request`

Payload:

```json
{
  "need": "Mijoz ehtiyoji",
  "lawyer_user_id": "tanlangan-advokat-user-id",
  "answers": {},
  "language": "uz"
}
```

Response:

```json
{
  "request": {
    "id": "...",
    "status": "lawyer_review",
    "payment_status": "paid",
    "paid": true,
    "requires_payment": false,
    "auto_confirm_payment": true
  },
  "lawyer_request": {
    "id": "...",
    "status": "new",
    "need": "...",
    "clean_source_file_url": "/services/{service_id}/document-template/clean-source-file"
  },
  "assigned_lawyer": {
    "id": "...",
    "role": "call_center"
  }
}
```

Frontend:

- Payment page skip.
- Clientga "So'rovingiz advokatga yuborildi" statusini ko'rsatish.
- `lawyer_request.id` ni saqlab qo'yish mumkin.

## 5. Call-center advokat requestni qayerda ko'radi?

Call-center advokat yoki advokat accounti bilan login qilingandan keyin requestlar shu endpointda chiqadi:

`GET /lawyers/me/document-requests`

Bu endpoint faqat o'sha assigned userga tegishli requestlarni qaytaradi.

Response:

```json
{
  "items": [
    {
      "id": "lawyer_request_record_id",
      "status": "new",
      "document_request_id": "...",
      "client": {},
      "service": {},
      "template": {},
      "title": "...",
      "need": "Mijoz ehtiyoji",
      "answers": {},
      "clean_source_file_url": "/services/{service_id}/document-template/clean-source-file",
      "contract_file": null
    }
  ]
}
```

Frontendda bu call-center/advokat panelida alohida inbox bo'lishi kerak:

- Menu nomi: `Hujjat so'rovlari`
- Yoki workspace ichida: `Mijoz hujjatlari`
- Endpoint: `GET /lawyers/me/document-requests`

Detail:

`GET /lawyers/me/document-requests/{lawyer_request_record_id}`

Advokat clean original template faylni ochadi:

`clean_source_file_url`

## 6. Advokat tayyorlab yuboradi

Endpoint:

`POST /lawyers/me/document-requests/{lawyer_request_record_id}/fulfill`

Payload:

```json
{
  "content": "Advokat tayyorlagan yakuniy hujjat matni...",
  "notes": "Mijoz uchun izoh"
}
```

Response:

```json
{
  "request": {
    "status": "file_ready",
    "payment_status": "paid",
    "paid": true,
    "requires_payment": false
  },
  "file": {
    "download_url": "/document-requests/{request_id}/file"
  }
}
```

Client tomonda file tayyor bo'lgandan keyin:

`GET /document-requests/{request_id}/file`

## 7. Important frontend condition

`status === "lawyer_review"` payment kutmoqda degani emas.

Bu degani:

- request advokatga yuborilgan
- advokat hali hujjatni tayyorlamagan
- payment allaqachon backendda paid

Shuning uchun frontend `lawyer_review` holatida payment loader emas, review/status screen ko'rsatishi kerak.

Correct UI mapping:

```ts
if (request.payment_status === "paid" || request.paid || !request.requires_payment) {
  if (request.status === "lawyer_review") showLawyerReviewStatus();
  else if (request.status === "ready_to_generate") showGenerateButton();
  else if (request.status === "file_ready") showFileDownload();
} else {
  showPaymentScreen();
}
```
