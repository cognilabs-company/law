# LexGo Service Document Assist Flow

Backendga xizmat hujjatlari uchun 2 ta yangi oqim qo'shildi:

1. AI bilan hujjat tayyorlash.
2. Advokat/yurist/call-center advokat bilan hujjat tayyorlash.

Muhim qoida: bu oqimlarda frontend field-markerli `{{...}}` template faylni emas, original clean RAR template faylni ishlatadi.

## 1. Field va flow ma'lumotlari

`GET /services/{service_id}/document-fields`

Endi javobda quyidagilar bor:

```json
{L
  "clean_source_file_url": "/services/{service_id}/document-template/clean-source-file",
  "clean_source_file_inline_url": "/services/{service_id}/document-template/clean-source-file?disposition=inline",
  "ai_flow": {
    "questions_url": "/services/{service_id}/document-ai/questions",
    "generate_url": "/services/{service_id}/document-ai/generate"
  },
  "lawyer_flow": {
    "lawyers_url": "/services/{service_id}/document-lawyers",
    "request_url": "/services/{service_id}/document-lawyer/request"
  }
}
```

## 2. Clean original template fayl

`GET /services/{service_id}/document-template/clean-source-file`

Frontend preview yoki advokatga ko'rsatish uchun original clean DOCX faylni oladi.

`GET /document-templates/{template_id}/clean-source-file`

Template ID orqali clean original faylni olish.

`GET /document-requests/{request_id}/clean-template-file`

Yaratilgan request orqali clean original faylni olish.

## 3. AI bilan tayyorlash

Avval AI kerakli savollarni oladi:

`POST /services/{service_id}/document-ai/questions`

```json
{
  "need": "Menga aliment qarzdorligini to'lashdan ozod qilish bo'yicha ariza kerak",
  "language": "uz"
}
```

Javob:

```json
{
  "mode": "ai",
  "questions": [
    {
      "key": "client_goal",
      "label": "Mijoz hujjat orqali nimaga erishmoqchi?",
      "type": "textarea",
      "required": true
    }
  ],
  "clean_source_file_url": "/services/{service_id}/document-template/clean-source-file",
  "generate_url": "/services/{service_id}/document-ai/generate"
}
```

Keyin hujjat generatsiya qilinadi:

`POST /services/{service_id}/document-ai/generate`

```json
{
  "need": "Menga aliment qarzdorligini to'lashdan ozod qilish bo'yicha ariza kerak",
  "answers": {
    "client_goal": "Qarzdorlikni to'lashdan ozod qilish",
    "facts": "Ish bo'yicha asosiy faktlar...",
    "claims": "Suddan qarzdorlikni bekor qilishni so'rayman"
  },
  "language": "uz",
  "extra_instructions": "Matn rasmiy sud arizasi uslubida bo'lsin"
}
```

Javobda `document_request` va tayyor DOCX `file.download_url` keladi.

## 4. Advokat bilan tayyorlash

Avval mos advokat/yurist/call-center ro'yxati olinadi:

`GET /services/{service_id}/document-lawyers`

Keyin request yuboriladi:

`POST /services/{service_id}/document-lawyer/request`

```json
{
  "need": "Menga aliment qarzdorligi bo'yicha sudga ariza tayyorlash kerak",
  "lawyer_user_id": "optional-user-id",
  "answers": {
    "client_goal": "Qarzdorlikdan ozod bo'lish",
    "facts": "Asosiy faktlar..."
  },
  "language": "uz"
}
```

Agar `lawyer_user_id` yuborilmasa, backend mos call-center/advokat/yuristga auto assign qiladi.

## 5. Advokat ish joyi

Advokat yoki call-center requestlarni ko'radi:

`GET /lawyers/me/document-requests`

Detail:

`GET /lawyers/me/document-requests/{record_id}`

Tayyorlab mijozga yuborish:

`POST /lawyers/me/document-requests/{record_id}/fulfill`

```json
{
  "content": "Advokat tayyorlagan yakuniy hujjat matni...",
  "notes": "Mijoz uchun izoh"
}
```

Javobda tayyor DOCX file qaytadi:

```json
{
  "file": {
    "download_url": "/document-requests/{request_id}/file",
    "format": "docx"
  }
}
```

## 6. Frontend UI tavsiya

Xizmat ichida 3 ta tanlov ko'rsatiladi:

- O'zim fieldlarni to'ldiraman: eski `/document-generate` flow.
- AI bilan tayyorlash: yangi AI questions + generate flow.
- Advokat bilan tayyorlash: lawyer list + request flow.

AI yoki advokat flowda clean template faylni ko'rsatish kerak:

`clean_source_file_inline_url`

Field-markerli `source_file_url` faqat eski manual field flow uchun ishlatiladi.
