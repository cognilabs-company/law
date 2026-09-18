# LexGo Call WebSocket Update

Backend call/meet invite realtime eventlari qo'shildi. Endi frontend `GET /secure-chats/{room_id}/calls` ni har sekund polling qilmasligi kerak.

## Global user socket

User login bo'lgandan keyin app layout darajasida bitta global socket ochiladi:

```ts
const ws = new WebSocket(`wss://lexgo.api.cognilabs.org/ws/users/me?token=${token}`)
```

Keladigan asosiy event:

```json
{
  "event": "call.incoming",
  "room_id": "secure-chat-room-id",
  "call_id": "call-id",
  "caller_user_id": "caller-user-id",
  "call": {
    "id": "call-id",
    "room_id": "secure-chat-room-id",
    "call_type": "video",
    "title": "Meeting title",
    "status": "active",
    "provider": "livekit",
    "livekit_url": "wss://lexgo.api.cognilabs.org/livekit",
    "livekit_room": "lexgo-room",
    "livekit_token": "",
    "participants": [],
    "remaining_seconds": 3600,
    "min_participants_required": false,
    "can_start_now": true
  }
}
```

`livekit_token` realtime event ichida ataylab bo'sh keladi. User callga kirayotganda tokenni alohida oladi:

```http
GET /secure-chats/{room_id}/calls/{call_id}/join-token
```

## Private chat room socket

Private chat ochilganda shu socket avvalgidek ulanadi:

```ts
const roomWs = new WebSocket(`wss://lexgo.api.cognilabs.org/ws/secure-chats/${roomId}?token=${token}`)
```

Yangi eventlar:

- `call.created`
- `call.participant_invited`
- `call.participant_joined`
- `call.participant_left`
- `call.participant_removed`
- `call.participant_updated`
- `call.updated`
- `call.ended`

## Frontend oqimi

1. Login bo'lgandan keyin `/ws/users/me` socketni oching.
2. `call.incoming` kelsa incoming call modal/toast chiqaring.
3. User accept qilsa `GET /secure-chats/{room_id}/calls/{call_id}/join-token` chaqiring.
4. LiveKit roomga `call.livekit_url`, `call.livekit_room`, `livekit_token` bilan kiring.
5. Private chat sahifasida `/ws/secure-chats/{room_id}` eventlaridan call list state ni yangilang.
6. `GET /secure-chats/{room_id}/calls` faqat page birinchi ochilganda yoki reconnect fallback uchun ishlatilsin.
7. Har sekund polling olib tashlansin.

## Test qilingan

- `POST /secure-chats/{room_id}/calls` -> global user socket `call.incoming` oldi.
- `POST /secure-chats/{room_id}/calls` -> room socket `call.created` oldi.
- Event payloadlarda `livekit_token` bo'sh keladi, token faqat `join-token` endpointdan olinadi.
