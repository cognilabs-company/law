# LexGo Frontend Update: Tezkor Advokat Group Chat

Sana: 2026-09-28
Backend: https://lexgo.api.cognilabs.org

## Nima qo'shildi

`Ikkinchi fikr — advokatlar guruhi` xizmatida `channel=chat` endi haqiqiy group chat sifatida ishlaydi.

Group chat participantlari:

- mijoz
- callcenter operator
- tanlangan advokatlar

Tanlangan advokatlar endi chat roomga kira oladi, xabar yozadi, file/voice upload qiladi va realtime xabarlarni oladi.

## Flow

1. Mijoz urgent request yaratadi:

```http
POST /urgent-advokat/requests
```

Body:

```json
{
  "service_kind": "second_opinion_group",
  "channel": "chat",
  "directions": ["iqtisodiy"],
  "lawyer_count": 2,
  "need": "Menga advokatlar guruhidan ikkinchi fikr kerak"
}
```

2. Operator requestni oladi:

```http
POST /call-center/urgent-advokat/requests/{record_id}/claim
```

Response ichida:

```json
{
  "payload": {
    "secure_chat_room_id": "..."
  }
}
```

3. Operator advokatlarni tanlaydi:

```http
POST /call-center/urgent-advokat/requests/{record_id}/assign-group
```

Body:

```json
{
  "lawyer_user_ids": ["...", "..."],
  "allow_count_override": true
}
```

Shundan keyin tanlangan advokatlar chat participant bo'ladi.

## Chat message API

### Messages list

```http
GET /secure-chats/{room_id}/messages
```

Endi tanlangan advokat ham shu endpointdan xabarlarni ko'ra oladi.

### Text / emoji message

```http
POST /secure-chats/{room_id}/messages
```

Body:

```json
{
  "message_type": "text",
  "content": "Salom 🙂⚖️",
  "meta": {}
}
```

Emoji unicode text sifatida ishlaydi.

### Reply message

```http
POST /secure-chats/{room_id}/messages
```

Body:

```json
{
  "message_type": "text",
  "content": "Javob yozdim ✅",
  "meta": {
    "reply_to_message_id": "MESSAGE_ID"
  }
}
```

Response:

```json
{
  "id": "...",
  "sender_user_id": "...",
  "sender": {
    "id": "...",
    "lexgo_id": "...",
    "role": "advokat",
    "name": "..."
  },
  "reply_to_message_id": "MESSAGE_ID",
  "reply_to": {
    "id": "MESSAGE_ID",
    "sender_user_id": "...",
    "sender": { "name": "..." },
    "message_type": "text",
    "content": "..."
  }
}
```

Frontend reply UI shu `reply_to` preview orqali chiziladi.

### File / voice upload

```http
POST /secure-chats/{room_id}/messages/upload
Content-Type: multipart/form-data
```

Fields:

- `message_type`: `file` yoki `voice`
- `content`: optional caption
- `reply_to_message_id`: optional
- `file`: upload file

Voice uchun tavsiya:

- `message_type=voice`
- `webm`, `ogg`, `mp3`, `m4a` formatlardan foydalanish mumkin

## Realtime

WebSocket:

```text
/ws/secure-chats/{room_id}?token=...
```

Group participantlar ham ulana oladi.

Yangi xabar event:

```json
{
  "event": "secure_message.created",
  "message": {
    "id": "...",
    "sender": { "name": "...", "role": "advokat" },
    "content": "...",
    "reply_to_message_id": "..."
  }
}
```

## Chatni yakunlash

Group chatni mijoz yakunlay olmaydi. Faqat groupdagi advokat/operator yakunlaydi.

```http
POST /urgent-advokat/requests/{record_id}/chat/complete
```

Body:

```json
{
  "summary": "Guruh chat konsultatsiyasi yakunlandi"
}
```

Client shu endpointni chaqirsa `403` qaytadi.

Yakunlangandan keyin:

- request `completed`
- room `completed`
- yangi message yuborish `409 Chat yakunlangan`
- mijozga 15 daqiqalik baholash oynasi ochiladi

## Baholash

Mijoz 15 daqiqa ichida baholaydi:

```http
POST /urgent-advokat/requests/{record_id}/rating
```

Body:

```json
{
  "rating": 5,
  "comment": "Yaxshi xizmat"
}
```

Request detailda:

```json
{
  "rating": {
    "deadline_at": "...",
    "available": true,
    "submitted": false,
    "value": null
  }
}
```

15 daqiqadan keyin rating yopiladi.

## Frontend UI talablari

Group chatda har bir xabarda ko'rsatilsin:

- sender name
- sender role: mijoz / operator / advokat
- message type
- reply preview bo'lsa yuqorisida kichik blok
- emoji normal ko'rinsin
- file/voice bubble alohida chiqsin

Chat headerda:

- ish ID / work_id
- xizmat: Ikkinchi fikr — advokatlar guruhi
- participantlar soni
- status

Advokat/operator uchun:

- `Chatni yakunlash` buttoni chiqadi

Mijoz uchun:

- `Chatni yakunlash` chiqmaydi
- chat completed bo'lgandan keyin `Baholash` chiqadi

## Production test natijasi

Tekshirildi:

- group chat request yaratildi
- operator claim qildi
- 2 advokat tanlandi
- dedicated room yaratildi
- tanlangan advokat room messages ko'rdi
- emoji message yuborildi
- reply message ishladi
- mijoz complete qila olmadi: 403
- advokat complete qildi
- complete keyin message 409 bo'ldi
- mijoz rating berdi

Test OK.
