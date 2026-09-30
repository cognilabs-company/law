# LexGo Audio Call -> Video Call Frontend Integration

Sana: 2026-09-30

## Asosiy qoida

Audio call alohida boshqa meeting tizimi emas.

Backendda audio va video call bitta LiveKit call session orqali ishlaydi.

Farqi:

- audio boshlansa `call_type = "audio"`
- audio boshlanganda participantlarda `camera_enabled = false`
- kamera yoqilsa shu call `video`ga upgrade bo'ladi
- upgrade bo'lgandan keyin call video call sifatida ko'rinadi

## Call yaratish

Oddiy secure chat ichida:

```http
POST /secure-chats/{room_id}/calls
Authorization: Bearer {token}
Content-Type: application/json
```

Audio call uchun:

```json
{
  "call_type": "audio",
  "title": "Audio call",
  "max_duration_minutes": 30,
  "participant_user_ids": ["user_id_1", "user_id_2"]
}
```

Response ichida:

```json
{
  "id": "call_id",
  "call_type": "audio",
  "provider": "livekit",
  "livekit_url": "...",
  "livekit_room": "...",
  "livekit_token": "...",
  "quality_policy": {
    "mode": "adaptive",
    "start_profile": "audio_only",
    "video_enabled": false,
    "audio_only_fallback": true
  },
  "participants": [
    {
      "user_id": "...",
      "mic_enabled": true,
      "camera_enabled": false
    }
  ]
}
```

Frontend audio call UI ochganda:

- LiveKit roomga ulanadi;
- microphone publish qiladi;
- camera publish qilmaydi;
- camera button baribir ko'rinadi;
- user camera buttonni bossa video track publish qilinadi.

## Audio callni video callga o'tkazish

User camera yoqganda frontend quyidagi endpointni chaqirishi shart:

```http
PATCH /secure-chats/{room_id}/calls/{call_id}/participants/{current_user_id}
Authorization: Bearer {token}
Content-Type: application/json
```

Body:

```json
{
  "camera_enabled": true
}
```

Backend nima qiladi:

- participant `camera_enabled = true`
- agar call `audio` bo'lsa, call `video`ga upgrade bo'ladi
- `call_type` `video`ga o'zgaradi
- `quality_policy` video uchun yangilanadi
- roomga realtime event yuboriladi:

```json
{
  "event": "call.upgraded_to_video",
  "call": {
    "id": "call_id",
    "call_type": "video"
  }
}
```

Keyin frontend:

- UI title/labelni video callga o'zgartiradi;
- remote video layoutni ochadi;
- camera off/on buttonlarni video call kabi ishlatadi.

## Camera o'chirish

Camera off:

```http
PATCH /secure-chats/{room_id}/calls/{call_id}/participants/{current_user_id}
Content-Type: application/json
Authorization: Bearer {token}
```

```json
{
  "camera_enabled": false
}
```

Muhim:

- camera off qilinganda call yana `audio`ga qaytmaydi;
- call video session bo'lib qoladi;
- faqat shu participantning kamerasi o'chadi.

Sabab: user call davomida kamera yoqqan bo'lsa, tarixda bu video call sifatida ko'rinishi kerak.

## WebSocket

Call signaling:

```text
WS /ws/secure-chats/{room_id}/calls/{call_id}?token={token}
```

Frontend quyidagi realtime eventlarni eshitishi kerak:

- `call.created`
- `call.updated`
- `call.participant_updated`
- `call.upgraded_to_video`
- `call.participant_joined`
- `call.participant_left`
- `call.ended`

Muhim:

`media.camera_on` WebSocket eventini faqat signaling/local state uchun ishlatish mumkin.

Lekin audio callni rasmiy video callga upgrade qilish uchun frontend albatta PATCH endpointni chaqirishi kerak:

```http
PATCH /secure-chats/{room_id}/calls/{call_id}/participants/{current_user_id}
```

Shunda backend DB, response va realtime eventlarni to'g'ri yangilaydi.

## LiveKit frontend sozlamalari

Backend `quality_policy` qaytaradi.

Frontend undan foydalanib:

```js
adaptiveStream: true
dynacast: true
stopLocalTrackOnUnpublish: true
```

Audio call start:

```js
audio: true
video: false
```

Camera yoqilganda:

```js
video: true
```

Past internetda:

- adaptive stream yoqilgan bo'lishi kerak;
- dynacast yoqilgan bo'lishi kerak;
- frontend userga "past sifatga o'ting" degan message chiqarmaydi;
- sifat avtomatik pasayadi.

## Qaysi joylarda ishlatish kerak

Shu flow hamma calllarda bir xil:

- secure chat call
- marketplace order call
- hujjat ishi audio call
- tezkor advokat express audio call
- hujjat meeting
- urgent advokat meeting

Audio call uchun alohida UI yoki alohida provider kerak emas.

## Frontend acceptance

1. Audio call ochilganda camera avtomatik yoqilmaydi.
2. Audio call ekranida camera button bo'ladi.
3. Camera bosilganda video track publish qilinadi.
4. Shu paytda PATCH endpoint chaqiriladi.
5. Response `call_type=video` qaytaradi.
6. Boshqa participantlar `call.upgraded_to_video` eventini oladi.
7. Call tugaganda historyda video call sifatida chiqadi, agar call davomida kamida bir marta camera yoqilgan bo'lsa.
