# LexGo frontend update: hujjat so'rovlari chat, fayl va voice

## Nima qo'shildi

Backendda hujjat to'ldirish va advokat tekshiruvi oqimiga chat, fayl va voice message qo'shildi.

Asosiy qoida:
- Mijoz advokat tanlamaydi.
- Mijoz "Advokat bilan to'ldirish" tanlasa so'rov callcenter advokatlar pooliga tushadi.
- Qaysi callcenter advokat `claim` qilsa, ish shu advokatga o'tadi.
- Claim qilingandan keyin editor, meeting va chat ochiladi.
- Chat realtime WebSocket bilan ishlaydi.
- Chatda text, file va voice message bor.

## Voice message formati

Frontend uchun tavsiya qilingan ideal format:
- Browser: `MediaRecorder`
- MIME: `audio/webm;codecs=opus`
- Backendga yuborish: `multipart/form-data`
- Field nomi: `file`
- `message_type=voice`

Fallback:
- iOS/Safari uchun `audio/mp4`, `audio/aac`, `audio/m4a` ishlatish mumkin.
- Backend `.webm`, `.ogg`, `.mp3`, `.m4a`, `.wav`, `.mp4` ni qabul qiladi.

## 1. Advokat bilan hujjat to'ldirish so'rovi

Fayl/voice bilan yuborish uchun yangi endpoint:

`POST /services/{service_id}/document-lawyer/request-with-files`

Content-Type:

`multipart/form-data`

Fields:
- `need` required string
- `title` optional string
- `language` optional string, default `uz`
- `answers_json` optional JSON string, default `{}`
- `files` optional multiple files
- `voice_files` optional multiple audio files

Frontend matni:

"Hujjatni to'ldirish uchun zarur bo'ladigan ma'lumotlar: shaxsga oid ma'lumotlar, kompaniya rekvizitlari, hudud, davlat idoralari va boshqa fayllarni yozing yoki ilova qiling. Bu advokatga ishni tezroq yakunlashga yordam beradi."

Response ichida:
- `lawyer_request.attachments[]`
- `lawyer_request.claim_url`
- `lawyer_request.chat.available`
- `pool_url`

Claim bo'lmaguncha `chat.available=false` bo'lishi mumkin.

## 2. Callcenter pool

Open pool:

`GET /call-center/document-requests/open`

Claim:

`POST /call-center/document-requests/{record_id}/claim`

Claimdan keyin response:
- `secure_chat_room.id`
- `lawyer_request.chat.messages_url`
- `lawyer_request.chat.upload_url`
- `lawyer_request.chat.ws_url`
- `lawyer_request.editor_url`
- `lawyer_request.meeting_url`

Claim vaqtida mijoz oldindan yuborgan fayl va voice lar avtomatik chatga message bo'lib tushadi.

## 3. Document request chatni mijoz tomonda ochish

`GET /document-requests/{request_id}/chat`

Agar ish hali olinmagan bo'lsa:

`available=false`

Agar callcenter advokat claim qilgan bo'lsa:

`available=true`

Response:
- `room.id`
- `messages_url`
- `upload_url`
- `ws_url`
- `lawyer_request`

## 4. Chat xabarlari

Text yuborish:

`POST /secure-chats/{room_id}/messages`

JSON:

```json
{
  "message_type": "text",
  "content": "Salom",
  "meta": {}
}
```

File yoki voice yuborish:

`POST /secure-chats/{room_id}/messages/upload`

Content-Type:

`multipart/form-data`

Fields:
- `message_type`: `file` yoki `voice`
- `content`: optional caption
- `file`: required file

Message response ichida:
- `meta.file_name`
- `meta.mime_type`
- `meta.size`
- `meta.download_url`

File download:

`GET /secure-chats/{room_id}/messages/{message_id}/file`

Shu endpointni faqat room ishtirokchilari ishlata oladi.

## 5. Realtime WebSocket

Room chat websocket:

`/ws/secure-chats/{room_id}?token={JWT}`

Yangi message event:

```json
{
  "event": "secure_message.created",
  "message": { ... }
}
```

User-level websocket:

`/ws/users/me?token={JWT}`

User eventlar:
- `secure_chat.message_created`
- `document_request.pool_created`
- `document_request.claimed`
- `document_request.sent`

## 6. Meeting ichida chat

Meeting document request chat roomiga bog'langan.

Frontend meeting sahifasida shu room chat panelini ko'rsatsin:
- `GET /document-requests/{request_id}/chat`
- `GET messages_url`
- `POST upload_url`
- `WS ws_url`

Ish yakunlanmagan bo'lsa mijoz shu chatni ochib yozishi mumkin.

## 7. Konstruktor hujjatini advokat tekshiruviga yuborish

Mijoz konstruktorda hujjat yaratib ko'rishi mumkin.

Advokat tekshiruviga yuborish:

`POST /document-requests/{request_id}/lawyer-review`

JSON:

```json
{
  "need": "Konstruktor hujjatimni tekshirib bering"
}
```

Bu ham callcenter poolga tushadi.

Response:
- `lawyer_request.status=open_pool`
- `pool_url=/call-center/document-requests/open`

Callcenter advokat claim qilgandan keyin editor ochiladi.

## 8. Konstruktor free/paid flow

Preview qilish tekin bo'lishi kerak.

Frontend preview uchun backend preview endpointlaridan foydalansin, download/generate emas.

Download qilish uchun plan/payment kerak bo'lgan endpointlar:
- `GET /document-requests/{request_id}/docx`
- `GET /document-requests/{request_id}/file`
- `POST /document-requests/{request_id}/generate`

Agar plan/payment yo'q bo'lsa backend `402` qaytaradi. Frontend plan sotib olish modalini ochsin.

## 9. Qayta qo'lda to'ldirish

`GET /document-requests?template_id=...` endi faqat bitta eski request emas, shu template bo'yicha hamma requestlarni qaytaradi.

Yangi qo'lda to'ldirish uchun frontend har safar:

`POST /services/{service_id}/document-requests`

yuborishi mumkin. Eski advokat request bloklamaydi.

## 10. Test qilingan backend case lar

Production container ichida tekshirildi:
- Advokatga multipart request yaratildi.
- Oddiy file va voice file attachment sifatida saqlandi.
- Callcenter advokat claim qildi.
- Claimdan keyin client chat ochildi.
- Oldingi attachmentlar chat message bo'lib tushdi.
- Chatga voice upload qilindi.
- Advokat voice fileni download qildi.
- Konstruktor document request advokat review poolga yuborildi.

Natijalar:
- `request-with-files` -> 201
- attachment download before claim -> 200
- claim -> 200
- client chat -> 200 available true
- messages after claim -> 200
- voice upload -> 201
- voice download by lawyer -> 200
- constructor review -> 201 open_pool
