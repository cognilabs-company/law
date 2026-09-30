# LexGo Frontend Integration Guide

Sana: 2026-09-28
Mavzu: Hujjatlar bo'limi, navbatchi advokat, editor, call/meeting, Tezkor Advokat, Ikkinchi fikr, rating va frontend UI talablar

Bu hujjat frontend uchun to'liq integration yo'riqnomasi. Backendda tayyor bo'lgan API, field, status va realtime eventlar shu yerda jamlangan. UI dizayn matnlari, iconlar, hover holatlari va layout frontendda qilinadi.

---

## 0. Muhim umumiy qoidalar

1. Backend imkon qadar og'ir payloadlarni yengillashtirgan.
2. Katalog/list endpointlarda katta template file yoki field listlarni doimiy olib kelmaslik kerak.
3. Fieldlar faqat foydalanuvchi aniq hujjatni tanlaganda olinadi.
4. Call, notification, document pool eventlar uchun polling qilmaslik kerak, WebSocket ishlatish kerak.
5. Token kerak bo'lgan endpointlarda `Authorization: Bearer <token>` yuboriladi.
6. Hujjat ishlari uchun foydalanuvchiga tushunarli `work_id` ko'rsatiladi.
7. Hujjat yoki Tezkor Advokat ishi yakunlangandan keyin 15 minutlik rating oynasi chiqadi.

---

## 1. Hujjatlar bo'limi: kategoriya va subcategory

### Backend holati

Backendda kategoriya ichida subcategorylar qaytadi.

Endpoint:

```http
GET /service-categories
```

Response har bir category uchun quyidagilarni beradi:

```json
{
  "id": "...",
  "slug": "fuqarolik",
  "title": "Fuqarolik",
  "description": "...",
  "subcategories": [
    {
      "title": "Oilaviy nizolar",
      "count": 12
    }
  ],
  "subcategories_count": 4,
  "services_count": 36,
  "created_at": "..."
}
```

### Frontendda nima qilish kerak

Hujjatlar page'da category card yoki accordion ichida:

- category nomi
- category description
- `services_count`
- `subcategories_count`
- subcategory list

ko'rinishi kerak.

Subcategory bosilganda service list shu category/subcategory bo'yicha filterlanadi.

Tavsiya qilingan UI:

- Category: katta bo'lim
- Subcategory: category ichidagi kichik pill/list/accordion item
- Subcategory yonida document/service count

---

## 2. Service list va search

### Public service list

```http
GET /services?catalog_only=true
GET /services?catalog_only=false
```

`catalog_only=true` katalog uchun yengilroq ishlatiladi.

### Search

```http
GET /services/search?q=<query>&limit=50
```

Search file nomi, service title, slug, template nomi bo'yicha ishlashi kerak.

Frontend qoidasi:

- Search inputda debounce ishlating: 300-500ms.
- Har bir keypressda request yubormang.
- Query 2 belgidan kam bo'lsa search qilmaslik tavsiya qilinadi.
- Search natijasi service tanlash uchun ishlatiladi, template fieldlarni shu endpointdan kutmang.

---

## 3. Hujjat fieldlarini olish

Foydalanuvchi service tanlagandan keyin fieldlar alohida olinadi.

Endpoint:

```http
GET /services/{service_id}/document-fields
```

Response:

```json
{
  "service_id": "...",
  "template_id": "...",
  "title": "...",
  "fields": [
    {
      "name": "ariza_berilgan_sud_nomi",
      "key": "ariza_berilgan_sud_nomi",
      "label": "Ариза берилган суд номи",
      "type": "text",
      "required": true,
      "placeholder": "{Ариза берилган суд номи}",
      "order": 1,
      "section": "Ариза реквизитлари"
    }
  ],
  "sections": [
    {
      "title": "Ариза реквизитлари",
      "order": 1,
      "fields": ["ariza_berilgan_sud_nomi"]
    }
  ],
  "field_count": 7,
  "section_count": 3,
  "required_count": 7,
  "source_file_name": "...docx",
  "has_source_file": true,
  "source_file_url": "/services/{service_id}/document-template/source-file",
  "clean_source_file_url": "/services/{service_id}/document-template/clean-source-file",
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

### Frontendda field chiqarish

Fieldlarni `sections` bo'yicha chiqarish kerak.

Tartib:

1. Section order bo'yicha.
2. Section ichida field order bo'yicha.
3. Agar section yo'q bo'lsa fieldlarni `order` bo'yicha bitta umumiy sectionda ko'rsatish.

Bu LegalZoom/Yurxizmat uslubidagi bosqichma-bosqich form uchun kerak.

---

## 4. Original template file va clean template file

### Original source file

```http
GET /services/{service_id}/document-template/source-file
GET /services/{service_id}/document-template/source-file?disposition=inline
```

Bu backenddagi original DOCX template. Ichida `{field}` placeholderlar bo'lishi mumkin.

### Clean source file

```http
GET /services/{service_id}/document-template/clean-source-file
GET /services/{service_id}/document-template/clean-source-file?disposition=inline
```

Bu mijoz/advokatga ko'rsatish uchun tozalangan file. `{field}` joylari frontendga chiroyli ko'rinishi uchun underline/blank ko'rinishiga almashtirilgan.

Frontendda:

- Preview uchun inline URL ishlatish mumkin.
- Download uchun oddiy URL ishlatiladi.
- DOCX ni browser ichida ko'rsatish frontend tanlagan viewer/editor bilan qilinadi.

---

## 5. Yangi hujjatga buyurtma: matnlar va UI o'zgarishlari

### Terminologiya

Frontendda eski `Callcenter advokat` matni o'rniga quyidagilar ishlatilsin:

- `Navbatchi advokat`
- `Navbatchi yurist`
- `Navbatchi mutaxassis`

Quyidagi gap olib tashlanadi:

- `Kim birinchi ishni olsa siz bilan bog'lanadi`

### Yangi buyurtma screenida bo'lishi kerak

1. Sorov matni input/textarea.
2. Ovozli xabar qo'shish tugmasi.
3. Fayl biriktirish tugmasi.
4. Hujjat turini tanlash yoki qo'lda yozish.
5. Hujjat tilini tanlash.
6. Hujjat qanday tayyorlanishini tanlash:
   - tayyor shablon asosida
   - 0 dan advokat bilan
   - o'zim to'ldiraman
   - AI bilan

---

## 6. Hujjat turi tanlash

Backend tayyor.

Endpoint:

```http
GET /document-services/request-document-types
```

Response:

```json
{
  "items": [
    "Shartnoma",
    "Ariza",
    "Sud hujjati",
    "Ishonchnoma va vakillik hujjati",
    "Korporativ hujjat",
    "Mehnat hujjat",
    "Moliyaviy va mulkiy hujjat",
    "Maxsus yuridik hujjat"
  ],
  "optional": true,
  "custom_allowed": true,
  "field": "requested_document_type",
  "applies_to": [
    "custom_from_scratch",
    "template_lawyer_assisted",
    "constructor_review"
  ],
  "not_applies_to": [
    "document_analysis",
    "existing_document_review"
  ]
}
```

### Qayerda ishlatiladi

`requested_document_type` optional field sifatida yuboriladi:

- 0 dan hujjat yasashda
- bor shablon bilan advokatga yuborishda
- constructor bilan yasalgan hujjatni advokatga tekshirtirishda

Document analysis flowda ishlatilmaydi.

### Frontend UI

Select + searchable combobox:

- foydalanuvchi variant tanlaydi
- xohlasa o'zi yozadi
- bo'sh qoldirsa ham bo'ladi

---

## 7. Hujjat tilini tanlash

Yangi hujjat buyurtmasida til select bo'lishi kerak.

Tavsiya variantlar:

```json
[
  { "value": "uz-cyrl", "label": "O'zbekcha (kirill)" },
  { "value": "uz-latn", "label": "O'zbekcha (lotin)" },
  { "value": "ru", "label": "Ruscha" }
]
```

Backend requestlarda `language` yuboriladi.

---

## 8. Ovozli xabar va file upload

### Voice message format

Frontend voice message uchun quyidagi formatni ishlatsin:

- audio/webm yoki audio/ogg tavsiya qilinadi
- duration sekundlarda yoziladi
- file avval upload qilinadi yoki attachment metadata sifatida yuboriladi

Tavsiya object:

```json
{
  "file_id": "...",
  "file_name": "voice-message.webm",
  "mime_type": "audio/webm",
  "size": 123456,
  "duration_seconds": 18,
  "url": "/workspace/files/.../download"
}
```

### Hujjat advokat requestida voice/file

Endpoint:

```http
POST /services/{service_id}/document-lawyer/request-with-files
```

Body ichida:

```json
{
  "need": "Menga aliment bo'yicha ariza kerak",
  "language": "uz-cyrl",
  "requested_document_type": "Ariza",
  "files": [
    {
      "file_id": "...",
      "file_name": "pasport.pdf",
      "mime_type": "application/pdf",
      "size": 123456,
      "url": "/workspace/files/.../download"
    }
  ],
  "voice_messages": [
    {
      "file_id": "...",
      "file_name": "voice.webm",
      "mime_type": "audio/webm",
      "duration_seconds": 20,
      "url": "/workspace/files/.../download"
    }
  ]
}
```

---

## 9. Advokat bilan hujjat tayyorlash: yangi prinsip

Mijoz advokat tanlamaydi.

Flow:

1. Mijoz service tanlaydi.
2. `Advokat bilan tayyorlash` tanlaydi.
3. Sorovini yozadi.
4. Fayl/voice qo'shishi mumkin.
5. Backend requestni callcenter/navbatchi advokat pooliga yuboradi.
6. Qaysi advokat ishni olsa, shu advokatga biriktiriladi.
7. Qolgan advokatlar endi ololmaydi.
8. Realtime event orqali pool yangilanadi.

Eski endpoint:

```http
GET /services/{service_id}/document-lawyers
```

Hozir deprecated sifatida ishlaydi va client advokat tanlamasligini aytadi:

```json
{
  "deprecated": true,
  "selection_required": false,
  "message": "Client advokat tanlamaydi. So'rov callcenter advokatlar pooliga tushadi.",
  "request_url": "/services/{service_id}/document-lawyer/request",
  "pool_url": "/call-center/document-requests/open"
}
```

Frontend endi advokat tanlash UI chiqarmasin.

---

## 10. Advokatga request yuborish

### Oddiy request

```http
POST /services/{service_id}/document-lawyer/request
Authorization: Bearer <client_token>
Content-Type: application/json
```

Body:

```json
{
  "need": "Menga sudga ariza kerak",
  "language": "uz-cyrl",
  "answers": {},
  "requested_document_type": "Ariza",
  "editor_mode": "template",
  "extra_instructions": "..."
}
```

### File/voice bilan request

```http
POST /services/{service_id}/document-lawyer/request-with-files
Authorization: Bearer <client_token>
Content-Type: application/json
```

Body:

```json
{
  "need": "Menda mavjud hujjat bor, advokat ko'rib bersin",
  "language": "uz-cyrl",
  "requested_document_type": "Sud hujjati",
  "files": [],
  "voice_messages": [],
  "editor_mode": "client_file"
}
```

---

## 11. 0 dan hujjat yasash

Mijoz tayyor shablon tanlamasdan 0 dan advokatga topshiriq beradi.

Endpoint:

```http
POST /document-services/custom-draft/request
Authorization: Bearer <client_token>
```

Body:

```json
{
  "title": "Menga ijara shartnomasi kerak",
  "need": "Uy ijarasi uchun shartnoma kerak. Tomonlar jismoniy shaxs.",
  "language": "uz-cyrl",
  "requested_document_type": "Shartnoma",
  "files": [],
  "voice_messages": []
}
```

Backend requestni navbatchi/callcenter advokat pooliga yuboradi.

---

## 12. Constructor bilan yasalgan hujjatni advokatga tekshirtirish

Mijoz constructor orqali hujjat yasab ko'rishi mumkin.

Qoidalar:

- Constructor bilan yasab preview qilish bepul bo'lishi mumkin.
- Download qilish plan/payment talab qilishi mumkin.
- Advokat tekshirsin desa, request callcenter/navbatchi advokat pooliga tushadi.

Backend requestda `requested_document_type` optional yuboriladi.

---

## 13. Advokat roli: pooldagi hujjat requestlari

### Open pool

```http
GET /call-center/document-requests/open
Authorization: Bearer <lawyer_token>
```

Bu navbatchi/callcenter advokatlarga ochiq requestlarni beradi.

### Advokat ishni olishi

```http
POST /call-center/document-requests/{record_id}/claim
Authorization: Bearer <lawyer_token>
```

Claimdan keyin:

- request shu advokatga birikadi
- boshqa advokatlar claim qila olmaydi
- realtime event boradi

### Advokatning o'z requestlari

```http
GET /lawyers/me/document-requests
Authorization: Bearer <lawyer_token>
```

Bu advokat olgan/yoki unga biriktirilgan hujjat requestlarini beradi.

---

## 14. Advokat editor ochilishidan oldingi 3 variant

Frontend advokat editor page ochilishidan oldin 3 ta option ko'rsatishi kerak:

1. Advokat o'zi file upload qiladi.
2. Mijoz bergan file bo'yicha editorda ishlaydi.
3. AI draft bo'yicha editorda ishlaydi.

Backendda `editor_mode` / `editor_source` bor.

Tavsiya enum:

```json
[
  "upload_file",
  "client_file",
  "ai_draft"
]
```

Agar backend response `system_editor_supported=true` desa, tizim ichidagi editor ochiladi.

---

## 15. Advokat editor endpointi

```http
GET /lawyers/me/document-requests/{record_id}/editor
Authorization: Bearer <lawyer_token>
```

Response ichida:

- request detail
- template info
- clean/source file URLs
- OnlyOffice config yoki backend editor config
- file download URL
- draft URL
- finalize URL

Muhim fieldlar:

```json
{
  "record_id": "...",
  "session_id": "...",
  "request": {
    "can_open_editor": true,
    "editor_block_reason": "",
    "template_file": {
      "download_url": "...",
      "inline_url": "...",
      "source_download_url": "...",
      "source_inline_url": "...",
      "has_file": true
    },
    "fulfill_file_url": "...",
    "fulfill_text_url": "...",
    "system_editor_supported": true
  },
  "onlyoffice": {},
  "file": {
    "download_url": "...",
    "public_editor_url": "..."
  },
  "draft_url": "...",
  "finalize_url": "..."
}
```

Frontend:

- `can_open_editor=false` bo'lsa editor ochmasin, `editor_block_reason` ko'rsatsin.
- OnlyOffice config bo'lsa OnlyOffice editorni iframe yoki SDK orqali ochsin.
- `finalize_url` bosilganda advokat mijozga final file yuboradi.

---

## 16. Editor finalize: mijozga tayyor hujjat yuborish

Advokat editorni tugatganda:

```http
POST /lawyers/me/document-requests/{record_id}/editor/finalize
Authorization: Bearer <lawyer_token>
```

Backend:

- oxirgi editor file'ni saqlaydi
- contract/file yaratadi
- `DocumentRequest.status = file_ready`
- `rating_deadline_at` ochadi
- mijozga notification yuboradi
- realtime event yuboradi

Frontend advokat tomonda:

- finalize bosishdan oldin autosave/force save qilinganiga ishonch hosil qilish kerak.
- finalize success bo'lsa request statusini yangilash kerak.

Frontend client tomonda:

- notification oladi
- `Mening hujjatlarim` page'da tayyor file ko'rinadi
- download tugmasi chiqadi
- rating timer chiqadi

---

## 17. Mijozning “Mening hujjatlarim” page

Endpoint:

```http
GET /document-requests/service-flow?limit=20&offset=0
Authorization: Bearer <client_token>
```

Har bir itemda ko'rsatilishi kerak:

- `work_id`
- title
- status
- mode: self / ai / lawyer
- service/template info
- contract/file link
- rating status
- created/updated time

Tabs:

```json
[
  { "key": "all", "title": "Barchasi" },
  { "key": "self", "title": "O'zim to'ldirganlar" },
  { "key": "ai", "title": "AI bilan" },
  { "key": "lawyer", "title": "Advokat bilan" }
]
```

---

## 18. Hujjat rating: 15 minutlik baholash

Backend tayyor.

Advokat hujjatni finalize qilgandan keyin backend avtomatik yozadi:

```json
{
  "rating_deadline_at": "2026-09-28T14:10:00Z",
  "rating_available": true,
  "rating_submitted": false
}
```

Baholash endpoint:

```http
POST /document-requests/{request_id}/rating
Authorization: Bearer <client_token>
Content-Type: application/json
```

Body:

```json
{
  "rating": 5,
  "comment": "Hujjat yaxshi tayyorlandi"
}
```

Qoidalar:

- 15 minut ichida baholash mumkin.
- Izoh optional.
- 15 minutdan keyin backend `409` qaytaradi.
- 15 minutdan keyin request `closed` bo'ladi.
- Baholashdan keyin status `rated` bo'ladi.

Frontend:

- Tayyor hujjat cardida countdown timer ko'rsating.
- Timer tugasa rating UI yopilsin.
- `409` kelsa rating oynasi yopilgan deb ko'rsating.

---

## 19. Document request chat

Hujjat requestda mijoz va advokat chat qilishi mumkin.

Endpointlar:

```http
GET /document-requests/{request_id}/chat
POST /document-requests/{request_id}/chat/messages
```

Chatda qo'llanadi:

- text
- file
- voice
- meeting message
- result message

Frontend:

- Hujjat ishi tugamaguncha chat ochiq bo'lishi kerak.
- Advokat meeting yaratganda chatga meeting link message tushadi.
- File/voice message UI qo'shilsin.

---

## 20. Realtime WebSocket

Polling kamaytirilishi kerak.

User WS:

```text
/ws/users/me?token=<access_token>
```

Kutiladigan eventlar:

```json
{
  "event": "document_request.pool_created"
}
```

```json
{
  "event": "document_request.claimed"
}
```

```json
{
  "event": "document_request.ready"
}
```

```json
{
  "event": "document_request.meeting_created"
}
```

```json
{
  "event": "notifications.unread_count"
}
```

```json
{
  "event": "call.invited"
}
```

Frontend:

- Notifications count polling qilinmasin.
- Call invite polling qilinmasin.
- Pool update polling qilinmasin.
- WS uzilsa exponential reconnect qiling.

---

## 21. Hujjat bo'yicha meeting

Advokat hujjat requestni olgandan keyin meeting yaratadi.

Endpoint:

```http
POST /lawyers/me/document-requests/{record_id}/meeting
Authorization: Bearer <lawyer_token>
```

Backend meeting policy:

```json
{
  "default_minutes": 15,
  "free_extension_once_minutes": 3,
  "paid_extension_price_per_minute": 2000,
  "payment_pause_minutes": 5,
  "client_audio_call_limit": 3
}
```

Frontendda meeting UI:

- 15 minut timer
- tugashiga yaqin ogohlantirish
- advokat uchun 3 minut bepul uzaytirish buttoni
- pullik uzaytirish request buttoni
- pause/resume holati
- recording request/permission UI

---

## 22. Meeting 3 minut bepul uzaytirish

Endpoint:

```http
POST /secure-chats/{room_id}/calls/{call_id}/free-extend
Authorization: Bearer <host_token>
```

Body:

```json
{
  "minutes": 3
}
```

Qoidalar:

- Faqat meeting host ishlata oladi.
- Faqat 1 marta.
- Maksimum 3 minut.

---

## 23. Pullik meeting uzaytirish

Advokat mijozga pullik uzaytirish so'rovi yuboradi.

Endpoint:

```http
POST /secure-chats/{room_id}/calls/{call_id}/extension-payment-request
Authorization: Bearer <host_token>
```

Body:

```json
{
  "minutes": 10
}
```

Backend:

- minut * 2000 UZS hisoblaydi
- payment request yaratadi
- meeting pause bo'ladi
- payment javobini 5 minut kutadi

Frontend:

- Advokatda minut inputi.
- Mijozda payment confirm/cancel UI.
- Payment kutilyotganda meeting paused ko'rsatilsin.
- 5 minut o'tsa dostup yopiladi.

---

## 24. Meeting pause/resume

Pause:

```http
POST /secure-chats/{room_id}/calls/{call_id}/pause
Authorization: Bearer <host_token>
```

Resume:

```http
POST /secure-chats/{room_id}/calls/{call_id}/resume
Authorization: Bearer <host_token>
```

Frontend:

- Pause holatda join/continue cheklansin.
- Timer paused remaining seconds bilan ko'rsatilsin.
- Resume bo'lsa timer davom etadi.

---

## 25. Recording request va permission

Mijoz yozib olishni so'raydi:

```http
POST /secure-chats/{room_id}/calls/{call_id}/recording-request
Authorization: Bearer <client_token>
```

Advokat ruxsat beradi yoki rad qiladi:

```http
PATCH /secure-chats/{room_id}/calls/{call_id}/recording-permission
Authorization: Bearer <lawyer_token>
```

Body:

```json
{
  "allowed": true
}
```

Recording start:

```http
POST /secure-chats/{room_id}/calls/{call_id}/recording/start
Authorization: Bearer <token>
```

Frontend:

- Clientda “Yozib olish” tugmasi.
- Advokatda permission modal.
- Permission bo'lmasa recording boshlanmasin.
- Icon dizayni frontend tomoni.

Eslatma: real media recording saqlash LiveKit Egress/tashqi sozlamaga bog'liq.

---

## 26. Client audio call

Mijoz hujjat ishi bo'yicha advokatga audio call qilishi mumkin.

Endpoint:

```http
POST /document-requests/{request_id}/calls/audio
Authorization: Bearer <client_token>
```

Cheklov:

- Hujjat ishi yakunlanmaguncha.
- 3 martagacha.
- Faqat requestni olgan advokatga.

Frontend:

- “Audio qo'ng'iroq” buttoni.
- Qolgan call count ko'rsatilsa yaxshi.
- Call invite WS orqali kelishi kerak.

---

## 27. Secure chat call umumiy endpointlari

Call yaratish:

```http
POST /secure-chats/{room_id}/calls
```

Call list:

```http
GET /secure-chats/{room_id}/calls
```

Join token:

```http
GET /secure-chats/{room_id}/calls/{call_id}/join-token
```

Call detail:

```http
GET /secure-chats/{room_id}/calls/{call_id}
```

Join:

```http
POST /secure-chats/{room_id}/calls/{call_id}/join
```

Leave:

```http
POST /secure-chats/{room_id}/calls/{call_id}/leave
```

End:

```http
POST /secure-chats/{room_id}/calls/{call_id}/end
```

Participant qo'shish:

```http
POST /secure-chats/{room_id}/calls/{call_id}/participants
```

Participant update:

```http
PATCH /secure-chats/{room_id}/calls/{call_id}/participants/{participant_user_id}
```

---

## 28. Tezkor Advokat katalogi

Endpoint:

```http
GET /urgent-advokat/catalog
```

Response ichida services:

```json
[
  {
    "key": "video_consultation",
    "title": "Advokat bilan videokonsultatsiya",
    "delivery": "callcenter_pool",
    "meeting_minutes": 30,
    "price": 150000,
    "supports_chat": true,
    "supports_files": true,
    "supports_voice": true,
    "variant": "ordinary"
  },
  {
    "key": "express_video_consultation",
    "title": "Express videokonsultatsiya",
    "delivery": "on_duty_lawyer_pool",
    "meeting_minutes": 30,
    "price": 220000,
    "supports_chat": true,
    "supports_files": true,
    "supports_voice": true,
    "variant": "express",
    "immediate_call": true
  },
  {
    "key": "traffic_accident_consultation",
    "title": "YTX bo'yicha huquqiy konsultatsiya",
    "delivery": "on_duty_lawyer_pool",
    "meeting_minutes": 30,
    "price": 0,
    "variant": "traffic_accident",
    "immediate_call": true
  },
  {
    "key": "chat_consultation",
    "title": "Chat orqali konsultatsiya",
    "delivery": "callcenter_pool",
    "meeting_minutes": 0,
    "supports_chat": true
  },
  {
    "key": "second_opinion_single",
    "title": "Ikkinchi fikr - yakka advokat",
    "delivery": "callcenter_pool",
    "requires_prior_lexgo_purchase": false
  },
  {
    "key": "second_opinion_group",
    "title": "Ikkinchi fikr - advokatlar guruhi",
    "delivery": "callcenter_operator_schedules_group",
    "requires_prior_lexgo_purchase": true,
    "lawyer_count_min": 2,
    "lawyer_count_max": 7
  }
]
```

Frontend:

- “Tezkor Advokat” matnini “Advokatga tezkor bog'lanish” qilib ko'rsating.
- Tezkor Advokat ichida AI aralashmasin.
- Bu modulda real odam bilan aloqa bo'ladi.

---

## 29. Tezkor Advokat request yaratish

Endpoint:

```http
POST /urgent-advokat/requests
Authorization: Bearer <client_token>
```

Body:

```json
{
  "service_kind": "video_consultation",
  "channel": "video",
  "directions": ["oilaviy"],
  "need": "Menga maslahat kerak",
  "requested_lawyer_count": 1,
  "files": [],
  "voice_messages": []
}
```

Backend:

- `work_id` beradi.
- service_kind bo'yicha narx hisoblaydi.
- poolga yuboradi.
- WS/notification yuboradi.

---

## 30. Tezkor Advokat: oddiy video consultation

`video_consultation`

Flow:

1. Mijoz izohlarni to'ldiradi.
2. Fayl/voice qo'shishi mumkin.
3. Request callcenter poolga tushadi.
4. Navbatchi/callcenter advokat claim qiladi.
5. Meeting yaratiladi.
6. 30 daqiqalik LiveKit video call.
7. Tugaganda complete.
8. 15 minut rating oynasi.

Frontendda hudud majburiy bo'lmasin, agar backend optional qabul qilsa bo'sh yuborish mumkin.

---

## 31. Tezkor Advokat: express video consultation

`express_video_consultation`

Flow:

1. Mijoz yo'nalish tanlaydi.
2. Tizim navbatchi advokat pooliga yuboradi.
3. Agar yo'nalishsiz bo'lsa, ishlamayotgan/bo'sh advokatga call borishi kerak.
4. Advokat callni boshqa advokatga transfer qilishi mumkin.
5. 30 daqiqalik call.

Backendda:

- `assignment_mode = on_duty_pool`
- `immediate_call = true`
- transfer endpoint bor.

---

## 32. YTX bo'yicha huquqiy konsultatsiya

`traffic_accident_consultation`

Frontendda alohida box bo'lishi kerak:

- “YTX bo'yicha huquqiy konsultatsiya”
- real odam bilan
- tezkor xizmat sifatida

Backendda service_kind mavjud.

---

## 33. Ikkinchi fikr

Frontendda bitta box:

`Ikkinchi fikr`

Ichida 2 variant:

1. Yakka advokat
2. Advokatlar guruhi

### Yakka advokat

`second_opinion_single`

- Oldin LexGo xizmatidan foydalanganini tekshirish shart emas.
- Callcenter/navbatchi advokat poolga tushadi.
- Video yoki chat variant bo'lishi mumkin.

### Advokatlar guruhi

`second_opinion_group`

- Faqat oldin LexGo orqali advokat/yurist xizmatidan foydalangan mijozlar uchun.
- Backend shu eligibilityni tekshiradi.
- Mijoz yo'nalishlar va nechta advokat kerakligini tanlaydi.
- Callcenter operator ishni oladi.
- Operator yo'nalishga mos advokatlarni tanlab meeting vaqtini belgilaydi.
- Advokatlar callcenter advokat ham, tashqi advokat ham bo'lishi mumkin.

---

## 34. Callcenter/operator group assignment

Operator uchun endpoint:

```http
POST /call-center/urgent-advokat/requests/{record_id}/assign-group
Authorization: Bearer <operator_token>
```

Body:

```json
{
  "lawyer_user_ids": ["...", "..."],
  "scheduled_at": "2026-09-28T15:00:00Z",
  "note": "Mijoz oilaviy nizo bo'yicha ikkinchi fikr so'radi"
}
```

Backend:

- tanlangan advokatlarga notification yuboradi
- mijozga meeting vaqti notification qiladi
- request statusini yangilaydi

---

## 35. Yo'nalishga mos advokatlar chiqarish

Urgent second opinion groupda operator yo'nalish tanlaganda frontend yo'nalishga mos advokatlarni ko'rsatishi kerak.

Backend candidate/matching logic bor.

Frontend operator page:

- directions filter
- seller_type filter: advokat/yurist/callcenter
- rating
- workload
- region optional
- selected lawyers list

Agar mismatch bo'lsa, operator `allow_direction_mismatch` bilan yuborishi mumkin.

---

## 36. Urgent request list va queue

Callcenter queue:

```http
GET /call-center/queue
```

Urgent active requestlar shu queue ichida keladi.

Frontend:

- source: `tezkor_advokat`
- service_kind
- channel
- directions
- requested_lawyer_count
- SLA age
- status

ko'rsatilishi kerak.

---

## 37. Urgent meeting yaratish

```http
POST /call-center/urgent-advokat/requests/{record_id}/meeting
Authorization: Bearer <operator_or_lawyer_token>
```

Backend:

- LiveKit call yaratadi
- secure chatga meeting message yozadi
- client/lawyerlarga invite yuboradi
- status `meeting_active`

Meeting policy:

```json
{
  "default_minutes": 30,
  "free_extension_once_minutes": 3,
  "paid_extension_price_per_minute": 2000,
  "payment_pause_minutes": 5
}
```

---

## 38. Urgent request complete

```http
POST /call-center/urgent-advokat/requests/{record_id}/complete
Authorization: Bearer <lawyer_or_operator_token>
```

Body:

```json
{
  "result_summary": "Maslahat berildi",
  "result_files": [],
  "next_action": "...",
  "quality_note": "..."
}
```

Backend:

- status `completed`
- rating 15 minut oynasi ochiladi
- mijozga notification boradi

---

## 39. Urgent rating

```http
POST /urgent-advokat/requests/{record_id}/rating
Authorization: Bearer <client_token>
```

Body:

```json
{
  "rating": 5,
  "comment": "Maslahat foydali bo'ldi"
}
```

Qoidalar:

- 15 minut ichida.
- Izoh optional.
- Qayta rating mumkin emas.
- Muddati o'tsa 409.

---

## 40. Meeting background, blur, iconlar

Bu frontend/device tomoni.

Backend quyidagilarni beradi:

- call_type
- service_kind
- source
- urgent/document context
- permissions
- recording status
- participant info

Frontend shu metadata asosida:

- YTX call uchun alohida fon
- document meeting uchun alohida fon
- client uchun blur/maxfiy fon
- recording icon dizayni
- mic/camera/screen/share UI

qiladi.

---

## 41. Audio/video sifat

Backend LiveKit token/room beradi.

Frontend majburiyatlari:

- LiveKit JS SDK to'g'ri versiya.
- `wss://lexgo.api.cognilabs.org/livekit/rtc` ishlatish.
- `/rtc/v1` pathga majburlamaslik.
- camera/mic permission fallback.
- mobile browser permission handling.
- reconnect UI.
- network quality indicator.

Backend LiveKit path proxy sozlangan bo'lishi kerak, lekin client SDK noto'g'ri path ishlatsa 404 chiqishi mumkin.

---

## 42. Notifications va polling

Frontend pollingni kamaytirsin.

Oldin tez-tez urilgan endpointlar:

- `/calls/invited`
- `/notifications/unread-count`
- document chat endpoints

Endi WS ishlatish kerak.

Polling fallback:

- WS uzilib qolsa 15-30 sekundda bir fallback polling.
- WS ulangan holatda polling yo'q.

---

## 43. Dashboard matn o'zgarishlari

Frontend-only.

O'zgartirishlar:

- `Tezkor advokat` -> `Advokatga tezkor bog'lanish`
- `Konsultatsiya olish` -> `Avtoavariya bo'yicha huquqiy konsultatsiya olish` kerak bo'lgan joyda
- `Hujjat yuklash` -> `Hujjat tahlili`
- Tezkor Advokat modulida AI aralashuvi ko'rsatilmasin

Backenddan service_kind va catalog keladi, lekin button matnlari frontend i18n/localizationda to'g'rilansin.

---

## 44. Xizmatlarni topib beradigan AI

Bu dashboarddagi alohida AI assistant UI bo'ladi.

Backendda umumiy AI assistant endpoint bor:

```http
POST /ai/assistant
```

Frontend vazifasi:

- “Xizmatlarni topib beradigan AI” widget.
- Tizimni ishlatish bo'yicha yordam.
- Muammoni tushunib tegishli service/categoryga yo'naltirish.
- AI yoki advokatdan maslahat olish variantlarini ko'rsatish.
- Subscription/limit bo'yicha to'g'ri paywall chiqarish.

Agar bu modul uchun alohida professional flow kerak bo'lsa, keyin backendda dedicated endpoint ajratiladi.

---

## 45. Limit va subscription nazorati

Ba'zi document/template endpointlar plan talab qiladi.

Agar backend `402 Payment Required` qaytarsa:

Frontend:

- payment required modal ko'rsatadi
- available plansga yo'naltiradi
- plan sotib olish requestini ochadi

Planlar:

```http
GET /subscription-plans
```

Plan sotib olish payment/telegram confirm flow backendda mavjud.

---

## 46. Subscription plans funksiyalar

`GET /subscription-plans` planlar bilan features qaytarishi kerak.

Frontend:

- `audience` bo'yicha filter qilsin.
- client uchun personal/client planlar.
- seller uchun seller planlar.
- business uchun business planlar.

---

## 47. Work ID

Hujjat va urgent ishlarda foydalanuvchiga DB UUID emas, `work_id` ko'rsatiladi.

Misol:

```text
LGT-20260928-AB12CD34
```

Frontend barcha user-facing joylarda `work_id` ko'rsatsin.

UUID faqat API/internal routing uchun ishlatiladi.

---

## 48. Statuslarni userga tushunarli qilish

Frontend status mapping qilsin:

Document request:

```json
{
  "questionnaire": "Ma'lumot kutilmoqda",
  "lawyer_review": "Advokat ko'rib chiqmoqda",
  "claimed": "Advokat ishni oldi",
  "file_ready": "Hujjat tayyor",
  "completed": "Yakunlangan",
  "rated": "Baholangan",
  "closed": "Yopilgan"
}
```

Urgent request:

```json
{
  "open_pool": "Navbatchi mutaxassis kutilmoqda",
  "claimed": "Mutaxassis ishni oldi",
  "scheduled": "Vaqt belgilandi",
  "in_progress": "Jarayonda",
  "meeting_active": "Uchrashuv davom etmoqda",
  "completed": "Yakunlandi",
  "cancelled": "Bekor qilindi",
  "expired": "Muddati tugadi"
}
```

---

## 49. Frontend-only qolgan ishlar

Quyidagilar backenddan emas, frontend UI/design tomoni:

1. Iconlarni boshidan ko'rib chiqish.
2. Recording iconni boshqacha qilish.
3. Video fonlari, blur/maxfiy fonlar.
4. Hoverda avval qiymat haqida ma'lumot, keyin narx ko'rsatish.
5. Dashboard button wording.
6. “Callcenter advokat” matnini “navbatchi advokat” qilish.
7. Marketplace advokat page ko'rinishlari.
8. Mobile call permission UX.
9. Audio/video call UI polishing.
10. Select/find combobox dizayni.

---

## 50. Backenddan tayyor endpointlar ro'yxati

Hujjatlar:

```http
GET /service-categories
GET /services/search?q=&limit=50
GET /services/{service_id}/document-fields
GET /services/{service_id}/document-template/source-file
GET /services/{service_id}/document-template/clean-source-file
GET /document-services/request-document-types
POST /services/{service_id}/document-generate
POST /services/{service_id}/document-ai/generate
POST /services/{service_id}/document-lawyer/request
POST /services/{service_id}/document-lawyer/request-with-files
POST /document-services/custom-draft/request
GET /document-requests/service-flow
POST /document-requests/{request_id}/rating
GET /document-requests/{request_id}/chat
```

Advokat document work:

```http
GET /call-center/document-requests/open
POST /call-center/document-requests/{record_id}/claim
GET /lawyers/me/document-requests
GET /lawyers/me/document-requests/{record_id}/editor
POST /lawyers/me/document-requests/{record_id}/editor/finalize
POST /lawyers/me/document-requests/{record_id}/meeting
POST /document-requests/{request_id}/calls/audio
```

Calls:

```http
POST /secure-chats/{room_id}/calls
GET /secure-chats/{room_id}/calls
GET /secure-chats/{room_id}/calls/{call_id}
GET /secure-chats/{room_id}/calls/{call_id}/join-token
POST /secure-chats/{room_id}/calls/{call_id}/join
POST /secure-chats/{room_id}/calls/{call_id}/leave
POST /secure-chats/{room_id}/calls/{call_id}/end
POST /secure-chats/{room_id}/calls/{call_id}/pause
POST /secure-chats/{room_id}/calls/{call_id}/resume
POST /secure-chats/{room_id}/calls/{call_id}/free-extend
POST /secure-chats/{room_id}/calls/{call_id}/extension-payment-request
POST /secure-chats/{room_id}/calls/{call_id}/recording-request
PATCH /secure-chats/{room_id}/calls/{call_id}/recording-permission
POST /secure-chats/{room_id}/calls/{call_id}/recording/start
GET /calls/invited
```

Tezkor Advokat:

```http
GET /urgent-advokat/catalog
POST /urgent-advokat/requests
GET /urgent-advokat/requests/me
POST /urgent-advokat/requests/{record_id}/rating
GET /call-center/queue
POST /call-center/urgent-advokat/requests/{record_id}/claim
POST /call-center/urgent-advokat/requests/{record_id}/transfer
POST /call-center/urgent-advokat/requests/{record_id}/assign-group
POST /call-center/urgent-advokat/requests/{record_id}/meeting
PATCH /call-center/urgent-advokat/requests/{record_id}/status
POST /call-center/urgent-advokat/requests/{record_id}/complete
POST /call-center/urgent-advokat/requests/{record_id}/cancel
```

Realtime:

```text
/ws/users/me?token=<access_token>
```

---

## 51. Test checklist frontend uchun

### Kategoriya/subcategory

- `GET /service-categories` ochiladi.
- Category ichida subcategorylar chiqadi.
- Subcategory bosilganda service list filterlanadi.

### Yangi hujjat buyurtma

- Hujjat turi select/find ishlaydi.
- Custom type yozish ishlaydi.
- Til tanlash chiqadi.
- Voice button ko'rinadi.
- File attach ko'rinadi.
- “Navbatchi advokat” matni ishlatiladi.

### Advokat pool

- Mijoz advokat tanlamaydi.
- Request poolga tushadi.
- Advokat claim qiladi.
- Boshqa advokat claim qila olmaydi.
- Client status yangilanadi.

### Editor

- Advokat editor oldidan 3 variant ko'radi.
- Editor ochiladi.
- File saqlanadi.
- Finalize qilinganda clientga tayyor hujjat keladi.

### Rating

- Tayyor hujjatda `work_id` chiqadi.
- Rating timer 15 minut chiqadi.
- 15 minut ichida rating yuboriladi.
- 15 minutdan keyin rating yopiladi.

### Meeting

- Document meeting 15 minut.
- 3 minut free extend bor.
- Paid extension request ishlaydi.
- Pause/resume UI ishlaydi.
- Recording permission UI ishlaydi.

### Tezkor Advokat

- Oddiy video consultation request tushadi.
- Express video request on-duty poolga tushadi.
- YTX bo'limi bor.
- Ikkinchi fikr bitta box ichida yakka/guruh bo'ladi.
- Group second opinion oldingi LexGo xizmatini talab qiladi.
- Yakka second opinion talab qilmaydi.
- Urgent rating 15 minut ichida ishlaydi.

---

## 52. Backendda hozir bor, frontend ulashi kerak bo'lgan eng muhim joylar

1. `work_id` userga ko'rsatish.
2. `rating_deadline_at` bo'yicha 15 minut timer.
3. `requested_document_type` select/custom input.
4. `voice_messages` upload UI.
5. `document_request.meeting_created` WS event.
6. `call.invited` WS event.
7. `notifications.unread_count` WS event.
8. `second_opinion_group` uchun prior purchase error handling.
9. `express_video_consultation` va `video_consultation` ni alohida UI qilish.
10. `traffic_accident_consultation` uchun alohida YTX card.

---

## 53. Qisqa xulosa

Backend tomondan quyidagilar tayyor:

- category ichida subcategory
- document type select/custom
- navbatchi advokat pool flow
- advokat claim flow
- editor modes
- AI draft editor source
- meeting 15 minut
- 3 minut free extend
- pullik extend + pause
- recording permission
- client audio call
- Tezkor Advokat services
- ordinary/express video consultation
- YTX consultation
- second opinion single/group
- group second opinion eligibility
- urgent group assignment
- work_id
- 15 minut rating
- realtime events

Frontend tomonda asosan UI, matn, icon, flow routing va WS ulash qoladi.
