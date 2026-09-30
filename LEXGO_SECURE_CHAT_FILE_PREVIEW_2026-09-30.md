# LexGo Secure Chat File Preview

Sana: 2026-09-30

## Nima o'zgardi

Chatlarda yuborilgan fayllar endi faqat download bo'lib ketmaydi. Backend har bir file message uchun preview metadata qaytaradi va faylni browser ichida ochish uchun inline endpoint beradi.

Bu marketplace chatlari, tezkor advokat chatlari, hujjat ishi chatlari va secure chat ishlatiladigan boshqa joylar uchun bir xil ishlaydi.

## Asosiy endpointlar

### Xabarlar ro'yxati

```http
GET /secure-chats/{room_id}/messages
Authorization: Bearer <token>
```

File message ichida `meta.preview` qaytadi.

### Faylni preview uchun ochish

```http
GET /secure-chats/{room_id}/messages/{message_id}/file?disposition=inline
Authorization: Bearer <token>
```

Bu URL browser preview uchun ishlatiladi.

### Faylni download qilish

```http
GET /secure-chats/{room_id}/messages/{message_id}/file
Authorization: Bearer <token>
```

Bu eski download flow.

## Message meta formati

```json
{
  "file_name": "shartnoma.docx",
  "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "size": 24880,
  "download_url": "/secure-chats/{room_id}/messages/{message_id}/file",
  "inline_url": "/secure-chats/{room_id}/messages/{message_id}/file?disposition=inline",
  "preview_url": "/secure-chats/{room_id}/messages/{message_id}/file?disposition=inline",
  "preview_supported": true,
  "preview_kind": "office_document",
  "viewer": "office_viewer",
  "open_mode": "modal_preview",
  "preview": {
    "supported": true,
    "kind": "office_document",
    "viewer": "office_viewer",
    "open_mode": "modal_preview",
    "url": "/secure-chats/{room_id}/messages/{message_id}/file?disposition=inline",
    "inline_url": "/secure-chats/{room_id}/messages/{message_id}/file?disposition=inline",
    "download_url": "/secure-chats/{room_id}/messages/{message_id}/file",
    "file_name": "shartnoma.docx",
    "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "size": 24880
  }
}
```

Frontend `meta.preview`ni asosiy manba deb ishlatsin. Eski xabarlar uchun ham backend response vaqtida shu metadata qo'shib beradi.

## Frontend qanday ochadi

File message ustiga bosilganda darhol download qilinmaydi. Modal yoki side preview ochiladi.

### PDF

Shart:

```json
{
  "preview_kind": "pdf",
  "viewer": "browser_inline"
}
```

Ochish:

1. `meta.preview.inline_url`ni auth bilan `fetch` qiling.
2. Blob URL yarating.
3. Modal ichida `iframe`, `object` yoki PDF viewer bilan ko'rsating.
4. Modal ichida alohida download button bo'lsin.

### Rasm

Shart:

```json
{
  "preview_kind": "image",
  "viewer": "browser_inline"
}
```

Ochish:

1. Auth bilan blob oling.
2. `<img>` orqali modalda ko'rsating.

### Audio va voice message

Shart:

```json
{
  "preview_kind": "audio",
  "viewer": "browser_inline"
}
```

Ochish:

1. Auth bilan blob oling.
2. `<audio controls>` bilan ko'rsating.

### Video

Shart:

```json
{
  "preview_kind": "video",
  "viewer": "browser_inline"
}
```

Ochish:

1. Auth bilan blob oling.
2. `<video controls>` bilan ko'rsating.

### TXT / CSV / JSON / XML

Shart:

```json
{
  "preview_kind": "text",
  "viewer": "browser_inline"
}
```

Ochish:

1. Auth bilan text oling.
2. Modal ichida monospace preview chiqaring.
3. Katta fayllarda birinchi qismini ko'rsatib, download button qoldiring.

### DOC / DOCX

Shart:

```json
{
  "preview_kind": "office_document",
  "viewer": "office_viewer"
}
```

Ochish:

1. Ideal variant: OnlyOffice viewer modal.
2. Frontend faylni `meta.preview.inline_url` orqali auth bilan oladi.
3. Viewerga blob/source sifatida beradi yoki backenddagi inline URLni ishlatadi.
4. Viewer ochilmasa, fallback sifatida file card + download button ko'rsatiladi.

### XLS / XLSX

Shart:

```json
{
  "preview_kind": "office_spreadsheet",
  "viewer": "office_viewer"
}
```

Ochish DOCX bilan bir xil: OnlyOffice viewer modal, fallback download.

### PPT / PPTX

Shart:

```json
{
  "preview_kind": "office_presentation",
  "viewer": "office_viewer"
}
```

Ochish DOCX bilan bir xil: OnlyOffice viewer modal, fallback download.

## Auth muhim

`inline_url` ham himoyalangan. Browserga oddiy `<iframe src="/secure-chats/...">` qo'yilsa token header ketmasligi mumkin. Shuning uchun frontend uchun eng xavfsiz usul:

```ts
const response = await fetch(apiBase + preview.inline_url, {
  headers: { Authorization: `Bearer ${token}` },
});
const blob = await response.blob();
const url = URL.createObjectURL(blob);
```

Keyin modal viewer `url`ni ishlatadi.

Modal yopilganda:

```ts
URL.revokeObjectURL(url);
```

## UI oqimi

1. Chatda file bubble ko'rinadi.
2. Bubble ichida file icon, file name, size, preview/download action bo'ladi.
3. Bubble bosilganda:
   - `preview.supported=true` bo'lsa modal ochiladi.
   - `preview.supported=false` bo'lsa download confirmation yoki to'g'ridan-to'g'ri download.
4. Modal header:
   - file name
   - file size
   - download button
   - close button
5. Modal body:
   - PDF/image/audio/video/text/office viewer.

## Fallback

Agar preview ochilmasa:

1. Userga "Preview ochilmadi, faylni yuklab oling" holatini ko'rsating.
2. `meta.preview.download_url` bilan download qiling.
3. Chat xabari yo'qolib ketmasin, xato modal ichida chiqsin.

## Backenddan keladigan preview_kind qiymatlari

```txt
image
pdf
audio
video
text
office_document
office_spreadsheet
office_presentation
download_only
```

## Backenddan keladigan viewer qiymatlari

```txt
browser_inline
office_viewer
download
```

## Test qilish

1. Secure chatga `.pdf` yuboring.
2. Message response ichida `meta.preview.kind=pdf` kelishini tekshiring.
3. Fayl ustiga bosing, modalda PDF ochilishi kerak.
4. `.docx` yuboring.
5. Message response ichida `meta.preview.kind=office_document` kelishini tekshiring.
6. Frontend OnlyOffice viewer yoki fallback download card ochishi kerak.
7. `.xlsx` yuboring.
8. Message response ichida `meta.preview.kind=office_spreadsheet` kelishini tekshiring.
9. Voice message yuboring.
10. Message response ichida `meta.preview.kind=audio` kelishi va player ochilishi kerak.

## Muhim

Chatda file preview frontend ishi, lekin backend endi kerakli barcha metadata va inline file endpointni beradi. Frontend faylni avtomatik download qilmasdan, modal preview qilib ochishi kerak.
