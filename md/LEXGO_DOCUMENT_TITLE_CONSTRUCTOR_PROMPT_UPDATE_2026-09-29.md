# LexGo Backend Update - Hujjat nomlari va konstruktor prompt

Sana: 2026-09-29
Backend: https://lexgo.api.cognilabs.org

## 1. UUID title muammosi tuzatildi

Ba'zi hujjatlarda frontendda nom o'rniga UUID chiqayotgan edi.
Masalan:

`756b8bb0-a0ab-48ed-8980-6a1f3ad68f0e`

Sabab frontend emas edi: backend DBda `document_templates.title`, `legal_services.title`, metadata title maydonlari UUID bo'lib qolgan.

Tuzatildi:

- `document_templates.title`
- `document_templates.description`
- `legal_services.title`
- `legal_services.description`
- `legal_service_metadata.title_uz_cyrl`
- `legal_service_metadata.title_uz_latn`
- `legal_service_metadata.title_ru`
- `source_file_name`

Endi ushbu hujjat nomi shunday qaytadi:

`ДАЪВО АРИЗА (Жиноят натижасида етказилган зарарни ундириш ҳақида)`

Production tekshiruv:

- UUID title qolgan template: `0`
- UUID title qolgan service: `0`

## 2. Keyingi importlar uchun himoya qo'shildi

Agar keyingi DOCX importda fayl nomi UUID bo'lsa, backend endi title'ni fayl nomidan emas, DOCX ichidagi matndan chiqaradi.

Masalan DOCX ichida:

`ДАЪВО АРИЗА`
`(Жиноят натижасида етказилган зарарни ундириш ҳақида)`

Backend title sifatida quyidagini saqlaydi:

`ДАЪВО АРИЗА (Жиноят натижасида етказилган зарарни ундириш ҳақида)`

## 3. Advokatga yuborilgan hujjatda konstruktor davom ettirish

Mijoz hujjatni Navbatchi advokatga yuborsa, endi konstruktor butunlay bloklanmaydi.

Backend response ichida yangi blok qaytadi:

```json
{
  "constructor_action": {
    "available": true,
    "prompt_required": true,
    "event": "document_constructor_continue_prompt",
    "title": "Ishingiz Navbatchi advokatga berildi",
    "message": "Konstruktor orqali hujjatni o'zingiz ham to'ldirishni davom ettirasizmi?",
    "yes_action": "open_constructor",
    "no_action": "wait_for_lawyer",
    "continue_url": "/document-requests/{request_id}",
    "answers_url": "/document-requests/{request_id}/answers",
    "preview_url": "/document-requests/{request_id}/preview",
    "generate_url": "/document-requests/{request_id}/generate"
  }
}
```

Frontend ishlatishi:

- `prompt_required=true` bo'lsa modal/toast chiqariladi.
- `Ha` bosilsa `continue_url` orqali konstruktor ochiladi.
- `Yo'q` bosilsa mijoz advokat aloqasini kutadi.

## 4. Bir document uchun qayta advokat request bloklanadi

Agar shu document bo'yicha active lawyer request bor bo'lsa, qayta advokatga yuborish mumkin emas.

Endpoint:

`POST /document-requests/{request_id}/lawyer-review`

Active request bor bo'lsa response:

```json
{
  "already_exists": true,
  "can_send_lawyer_request": false,
  "message": "Bu hujjat bo'yicha Navbatchi advokatga so'rov yuborilgan. Ish yakunlangandan keyin qayta yuborish mumkin.",
  "constructor_action": { ... }
}
```

Frontend:

- `already_exists=true` bo'lsa yangi request yaratildi deb ko'rsatmasin.
- Userga message ko'rsatsin.
- Konstruktorni davom ettirish varianti `constructor_action` orqali ochilsin.

## 5. Client service-flow yangilandi

Endpoint:

`GET /document-requests/service-flow`

Har bir item ichida yangi fieldlar bor:

```json
{
  "lawyer_request_active": true,
  "can_send_lawyer_request": false,
  "lawyer_request_block_reason": "Bu hujjat bo'yicha Navbatchi advokatga so'rov yuborilgan. Ish yakunlangandan keyin qayta yuborish mumkin.",
  "constructor_action": { ... },
  "actions": {
    "constructor_continue_url": "/document-requests/{request_id}",
    "constructor_answers_url": "/document-requests/{request_id}/answers",
    "constructor_preview_url": "/document-requests/{request_id}/preview",
    "constructor_generate_url": "/document-requests/{request_id}/generate"
  }
}
```

## 6. Notification

Mijoz hujjatni Navbatchi advokatga yuborganida backend notification yaratadi.

Event:

`document_constructor_continue_prompt`

Title:

`Ishingiz Navbatchi advokatga berildi`

Body:

`Konstruktor orqali hujjatni o'zingiz ham to'ldirishni davom ettirasizmi?`

Data ichida:

```json
{
  "document_request_id": "...",
  "lawyer_request_id": "...",
  "template_id": "...",
  "constructor_continue_url": "/document-requests/{request_id}",
  "constructor_answers_url": "/document-requests/{request_id}/answers",
  "constructor_preview_url": "/document-requests/{request_id}/preview",
  "constructor_generate_url": "/document-requests/{request_id}/generate",
  "yes_action": "open_constructor",
  "no_action": "wait_for_lawyer"
}
```

Frontend notification bosilganda shu modalni ochishi yoki to'g'ridan-to'g'ri konstruktor sahifasiga olib kirishi mumkin.

## Test qilingan

- UUID title count productionda `0`.
- Search API endi UUID emas, to'g'ri hujjat nomini qaytaryapti.
- Advokatga yuborilganda `constructor_action.prompt_required=true` qaytdi.
- `service-flow` ichida `lawyer_request_active=true`, `can_send_lawyer_request=false` qaytdi.
- Qayta lawyer-review yuborilganda yangi request ochilmadi, `already_exists=true` qaytdi.
