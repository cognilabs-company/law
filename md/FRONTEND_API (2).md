# LawProject AI API update

Backend endi shartnoma so'ralganda chatga PDF contract object qaytaradi.

## Message endpoint

`POST /clients/{client_id}/chats/{chat_id}/messages`

Response:

```json
{
  "chat": {},
  "user_message": {},
  "assistant_message": {
    "role": "assistant",
    "content": "PDF shartnoma tayyor..."
  },
  "contracts": [
    {
      "id": "contract_id",
      "contract_type": "Oldi-sotdi shartnomasi",
      "status": "ready",
      "download_url": "/contracts/contract_id/download"
    }
  ]
}
```

Frontend `contracts` bo'sh bo'lmasa chat ichida PDF download button ko'rsatsin.

## WebSocket

`WS /ws/clients/{client_id}/chats/{chat_id}`

Assistant message eventida ham `contracts` keladi:

```json
{
  "event": "message.created",
  "message": {},
  "contracts": [
    {
      "id": "contract_id",
      "contract_type": "Shartnoma turi",
      "status": "ready",
      "download_url": "/contracts/contract_id/download"
    }
  ]
}
```

PDF download URL ni backend base URL bilan ochish kerak:

`http://localhost:8000/contracts/{contract_id}/download`

Frontend CORS:

`http://localhost:3000`

`http://localhost:5173`
