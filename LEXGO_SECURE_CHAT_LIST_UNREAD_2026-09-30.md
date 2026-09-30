# LexGo Secure Chat List: Last Message + Unread Badge

Sana: 2026-09-30

## Nima o'zgardi

Xabarlar page uchun backend chat room ro'yxatiga oxirgi xabar va o'qilmagan xabarlar sonini qaytaradi.

Endi frontend chatlarni Telegram kabi ko'rsatishi kerak:

- oxirgi message yozilgan chat eng tepada turadi;
- chat card ichida oxirgi message preview chiqadi;
- o'qilmagan xabarlar `2`, `3` kabi badge bilan chiqadi;
- chatga kirilganda xabarlar o'qilgan hisoblanadi;
- yangi xabar realtime kelganda shu chat tepaga ko'tariladi.

## Chatlar ro'yxati

```http
GET /secure-chats
Authorization: Bearer <token>
```

Har bir room endi quyidagi fieldlarni qaytaradi:

```json
{
  "id": "room-id",
  "updated_at": "2026-09-30T13:30:00Z",
  "last_message_at": "2026-09-30T13:30:00Z",
  "last_message": {
    "id": "message-id",
    "sender_user_id": "user-id",
    "sender_name": "Client Name",
    "message_type": "text",
    "content": "Oxirgi xabar matni",
    "is_blocked": false,
    "created_at": "2026-09-30T13:30:00Z",
    "is_mine": false
  },
  "unread_count": 3,
  "has_unread": true,
  "last_read_at": "2026-09-30T13:20:00Z"
}
```

## Frontend sort

Backend `/secure-chats` ro'yxatini `updated_at desc` qilib qaytaradi. Frontend ham xavfsizlik uchun shu tartibda sort qilib qo'ysin:

```ts
rooms.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
```

## Chat card UI

Har bir chat cardda:

- ishtirokchi nomi;
- `last_message.content`;
- `last_message.created_at`;
- `unread_count > 0` bo'lsa badge;
- `last_message.is_mine=true` bo'lsa "Siz: ..." prefix qo'yish mumkin.

Misol:

```txt
Ali Valiyev
Siz: Fayl yuborildi
                               2
```

## Xabarlarni o'qilgan qilish

Chat ichiga kirganda frontend quyidagini chaqiradi:

```http
GET /secure-chats/{room_id}/messages
Authorization: Bearer <token>
```

Bu endpoint endi shu user uchun roomni o'qildi deb belgilaydi.

Natija:

- `unread_count` keyingi `/secure-chats` response'da `0` bo'ladi;
- user websocket kanaliga `secure_chat.read` eventi boradi.

## Realtime yangi xabar

Yangi message kelganda user websocket kanalida event keladi:

```json
{
  "event": "secure_chat.message_created",
  "room_id": "room-id",
  "message": {
    "id": "message-id",
    "message_type": "text",
    "content": "Yangi xabar"
  },
  "room": {
    "id": "room-id",
    "updated_at": "2026-09-30T13:30:00Z",
    "last_message": {
      "content": "Yangi xabar",
      "created_at": "2026-09-30T13:30:00Z",
      "is_mine": false
    },
    "unread_count": 1,
    "has_unread": true
  }
}
```

Frontend event kelganda:

1. `room.id` bo'yicha ro'yxatdan chatni topadi.
2. Bor bo'lsa uni `event.room` bilan yangilaydi.
3. Yo'q bo'lsa `event.room`ni ro'yxatga qo'shadi.
4. Shu roomni ro'yxat tepasiga chiqaradi.
5. Agar hozir aynan shu room ochiq bo'lsa, `/secure-chats/{room_id}/messages` chaqirib read qiladi.

## Realtime o'qildi eventi

Chat ochilganda backend user kanaliga quyidagini yuboradi:

```json
{
  "event": "secure_chat.read",
  "room_id": "room-id",
  "user_id": "current-user-id",
  "last_read_at": "2026-09-30T13:35:00Z",
  "last_read_message_id": "message-id",
  "last_read_message_at": "2026-09-30T13:34:00Z",
  "unread_count": 0
}
```

Frontend shu event bo'yicha chat carddagi badge'ni o'chiradi.

## Muhim

`unread_count` faqat boshqa user yozgan xabarlar bo'yicha hisoblanadi. O'zi yozgan xabar unread bo'lmaydi.

`last_message` file yoki voice bo'lsa `content` ichida file name qaytadi. Frontend message type bo'yicha icon qo'shishi mumkin.
