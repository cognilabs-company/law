# LexGo Backend Update — Service Document Generate Fixed

## Muammo

Xizmatlardan 36 ta fuqarolik sud hujjatlaridan biri tanlanib, fieldlar to'ldirilganda backend oldin boshqa layoutdagi PDF/text file qaytarayotgan edi.

Bu noto'g'ri edi. Kerakli flow: tanlangan shablonning o'zi olinadi va field qiymatlari aynan shu shablon ichiga qo'yiladi.

## Nima tuzatildi

- `CIV-001` ... `CIV-036` uchun source DOCX file backend storagega ulandi.
- `POST /services/{service_id}/document-generate` endi PDF layout yasamaydi.
- Generate natijasi original template DOCX asosida qaytadi.
- `format: "pdf"` yuborilsa ham backend hozir DOCX qaytaradi, chunki PDF generator eski boshqa layout muammosini keltirgan.
- `document_request.contract_file` endi DOCX mime type bilan qaytadi.
- `/contracts/{contract_id}/download` va `/contracts/{contract_id}/file` DOCX file bo'lsa DOCX sifatida qaytaradi.
- `/document-requests/{request_id}/file` ham DOCX/PDF extensionga qarab to'g'ri mime type qaytaradi.

## Frontend ishlatadigan asosiy flow

1. Service tanlash:

```http
GET /services
```

2. Tanlangan service fieldlarini olish:

```http
GET /services/{service_id}/document-fields
```

3. Formani `fields` asosida chiqarish.

4. Generate qilish:

```http
POST /services/{service_id}/document-generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "answers": {
    "court_name": "Toshkent shahar fuqarolik ishlari bo'yicha sudi",
    "claimant_full_name": "Aliyev Ali Aliyevich"
  },
  "format": "docx"
}
```

5. Response:

```json
{
  "file": {
    "file_name": "...docx",
    "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "download_url": "/document-requests/{id}/docx",
    "inline_url": "/contracts/{contract_id}/file",
    "format": "docx"
  }
}
```

## Muhim frontend o'zgarish

- PDF kutmang.
- `file.download_url` yoki `document_request.contract_file.download_url` orqali DOCX yuklab oling.
- Agar user ko'rishi kerak bo'lsa, browserda DOCX preview bo'lmasligi mumkin, download qilib ochiladi.
- Field keylarini frontend taxmin qilmasin, backenddan kelgan `fields` bo'yicha form chizilsin.

## Test natijasi

Productionda test qilindi:

- 36/36 CIV template source DOCX bilan ulangan.
- `POST /services/{service_id}/document-generate` 200 qaytardi.
- Response file format: `docx`.
- Contract file path `.docx`.
- To'ldirilgan qiymat DOCX ichida borligi tekshirildi.
- `{{placeholder}}` qoldig'i qolmadi.
- `/document-requests/{id}/file` DOCX mime type bilan qaytdi.

Backend URL: `https://lexgo.api.cognilabs.org`
