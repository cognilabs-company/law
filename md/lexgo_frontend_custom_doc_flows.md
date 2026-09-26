# LexGo frontend update: xizmatlarda 2 ta yangi hujjat flow

## Nima qo'shildi

Tayyor shablon bilan ishlash saqlanadi. Qo'shimcha 2 ta yangi flow qo'shildi:

1. Mijoz advokat bilan 0 dan hujjat yasaydi.
2. Mijoz qo'lidagi hujjatni advokatga tekshirtiradi.

Ikkalasi ham callcenter advokatlar pooliga tushadi. Mijoz advokat tanlamaydi. Qaysi callcenter advokat ishni `claim` qilsa, shu advokatga editor, meeting va chat ochiladi.

## 1. 0 dan hujjat yasash

Endpoint:

`POST /document-services/custom-draft/request`

Content-Type:

`multipart/form-data`

Fields:
- `need` required string
- `title` optional string, default: `0 dan hujjat tayyorlash`
- `language` optional string, default: `uz`
- `files` optional multiple files
- `voice_files` optional multiple audio files

Response:
- `request.document_type=custom_document_from_scratch`
- `lawyer_request.flow=custom_from_scratch`
- `lawyer_request.editor_source=blank`
- `lawyer_request.status=open_pool`
- `pool_url=/call-center/document-requests/open`

Advokat claim qilgandan keyin editor bo'sh DOCX bilan ochiladi. Advokat hujjatni 0 dan yozadi.

## 2. Mavjud hujjatni advokatga tekshirtirish

Endpoint:

`POST /document-services/review-existing/request`

Content-Type:

`multipart/form-data`

Fields:
- `need` required string
- `title` optional string, default: `Mavjud hujjatni tekshirtirish`
- `language` optional string, default: `uz`
- `main_file` required file
- `files` optional multiple files
- `voice_files` optional multiple audio files

Response:
- `request.document_type=existing_document_review`
- `lawyer_request.flow=review_existing_document`
- `lawyer_request.main_file_name`
- `lawyer_request.main_attachment_id`
- `lawyer_request.editor_source`

Editor source qoidasi:
- Agar `main_file` DOCX bo'lsa: `editor_source=uploaded_docx`, editor mijoz yuklagan DOCXni ochadi.
- Agar `main_file` PDF/DOC/rasm bo'lsa: `editor_source=blank`, editor bo'sh DOCX ochadi, original fayl attachment sifatida qoladi.

## 3. Callcenter pool

Open pool:

`GET /call-center/document-requests/open`

Claim:

`POST /call-center/document-requests/{record_id}/claim`

Claim response ichida:
- `secure_chat_room.id`
- `lawyer_request.editor_url`
- `lawyer_request.meeting_url`
- `lawyer_request.chat.messages_url`
- `lawyer_request.chat.upload_url`
- `lawyer_request.chat.ws_url`

## 4. Advokat editorni ochishi

`GET /lawyers/me/document-requests/{record_id}/editor`

Response ichida OnlyOffice config bor:
- `onlyoffice.document_server_url`
- `onlyoffice.document`
- `onlyoffice.editorConfig`
- `onlyoffice.token`

Frontend `document_server_url`ni iframe qilib ochmasin. OnlyOffice quyidagicha ishlatiladi:

1. Script load:
   `https://lexgo.api.cognilabs.org/web-apps/apps/api/documents/api.js`
2. Keyin:
   `new DocsAPI.DocEditor(containerId, response.onlyoffice)`

## 5. Chat va voice

Chat room:

`GET /document-requests/{request_id}/chat`

Text:

`POST /secure-chats/{room_id}/messages`

File yoki voice:

`POST /secure-chats/{room_id}/messages/upload`

Fields:
- `message_type=file` yoki `message_type=voice`
- `content` optional caption
- `file` required

Voice format tavsiyasi:
- `audio/webm;codecs=opus`
- Field: `file`
- `message_type=voice`

Fallback:
- `audio/mp4`, `audio/aac`, `audio/m4a`, `audio/ogg`, `audio/mp3`

WebSocket:

`/ws/secure-chats/{room_id}?token={JWT}`

Event:

`secure_message.created`

## 6. Meeting

Advokat ishni claim qilgandan keyin meeting yaratadi:

`POST /lawyers/me/document-requests/{record_id}/meeting`

Meeting document request chat roomiga bog'langan. Meeting sahifasida chat panel ham ko'rinsin.

## 7. Finalize

Advokat editor ichida hujjatni tayyorlaydi. Yakunda:

`POST /lawyers/me/document-requests/{record_id}/editor/finalize`

Response:
- `request.status=file_ready`
- `file.download_url=/document-requests/{request_id}/file`

Client o'z sahifasida tayyor faylni yuklab oladi.

## 8. Frontend UI taklif

Xizmatlar bo'limida 3 ta hujjat action ko'rsating:

1. Tayyor shablon bilan ishlash
2. Advokat bilan 0 dan hujjat yasash
3. Qo'limdagi hujjatni advokatga tekshirtirish

0 dan hujjat yasash UI:
- So'rov matni textarea
- Fayllar upload
- Voice recorder
- Submit
- Status page: poolda / advokat oldi / chat / meeting / tayyor fayl

Hujjat tekshirtirish UI:
- Asosiy hujjat upload required
- So'rov matni textarea
- Qo'shimcha fayllar upload
- Voice recorder
- Submit
- Status page: poolda / advokat oldi / chat / meeting / tayyor fayl

## 9. Backend test natijalari

Production containerda test qilindi:

0 dan hujjat:
- create -> 201, editor_source=blank
- claim -> 200
- editor -> 200, flow=custom_from_scratch, OnlyOffice configured=true
- finalize -> 200, status=file_ready

Mavjud hujjat review:
- create DOCX main_file bilan -> 201, editor_source=uploaded_docx
- claim -> 200
- editor -> 200, flow=review_existing_document
- editor file download -> 200, DOCX zip signature `PK`
