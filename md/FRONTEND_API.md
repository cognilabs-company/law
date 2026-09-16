# LawProject AI API

Base URL: `http://localhost:8000`

## Chat API

`POST /clients/{client_id}/chats`

Body:

```json
{
  "title": "Yangi chat"
}
```

`GET /clients/{client_id}/chats`

Clientning barcha chatlarini last message bilan qaytaradi.

`GET /clients/{client_id}/chats/{chat_id}`

Bitta chat ichidagi barcha message larni qaytaradi.

`POST /clients/{client_id}/chats/{chat_id}/messages`

Body:

```json
{
  "content": "Mehnat shartnomasi haqida ma'lumot kerak"
}
```

Response ichida `user_message`, `assistant_message`, `sources` keladi.

## Realtime

`WS /ws/clients/{client_id}/chats/{chat_id}`

Send:

```json
{
  "content": "Savol matni"
}
```

Receive:

```json
{
  "event": "message.created",
  "message": {
    "id": "...",
    "role": "assistant",
    "content": "...",
    "sources": []
  }
}
```

## Contracts

AI shartnoma uchun kerakli ma'lumotlarni o'zi so'raydi. Ma'lumotlar to'lganda PDF yaratadi.

`GET /contracts/{contract_id}`

Shartnoma statusi va download linkni qaytaradi.

`GET /contracts/{contract_id}/download`

PDF faylni yuklab beradi.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

`.env` ichida `OPENAI_API_KEY` majburiy.
