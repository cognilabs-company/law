# LawProject AI API auth update

Backendga client va advokat uchun register/login qo'shildi.

## Register

`POST /auth/register`

```json
{
  "role": "client",
  "name": "Ali Valiyev",
  "phone": "+998901234567",
  "password": "12345678"
}
```

`role`: `client` yoki `advokat`

## Login

`POST /auth/login`

```json
{
  "phone": "+998901234567",
  "password": "12345678"
}
```

Response:

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "user": {
    "id": "...",
    "role": "client",
    "name": "Ali Valiyev",
    "phone": "+998901234567"
  }
}
```

## Current user

`GET /auth/me`

Header:

`Authorization: Bearer {access_token}`

## AI limit

Login qilmagan userlar IP bo'yicha 5 ta AI javob oladi.

5 tadan oshsa:

```json
{
  "detail": "AI limit tugadi. Davom etish uchun login qiling."
}
```

Login qilgan userlarda hozircha limit yo'q.

## Chat message

`POST /clients/{client_id}/chats/{chat_id}/messages`

Login qilingan bo'lsa header qo'shilsin:

`Authorization: Bearer {access_token}`

## WebSocket

Tokenni header bilan yuborish mumkin:

`Authorization: Bearer {access_token}`

Browserda header berish qiyin bo'lsa query ishlatsin:

`/ws/clients/{client_id}/chats/{chat_id}?token={access_token}`
