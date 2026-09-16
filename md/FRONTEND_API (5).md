# LawProject AI API file payload update

Shartnoma yaratilganda backend endi faqat link emas, PDF faylning o'zini ham chat response ichida beradi.

## REST message response

`POST /clients/{client_id}/chats/{chat_id}/messages`

`contracts` array:

```json
[
  {
    "id": "contract_id",
    "contract_type": "Shartnoma turi",
    "status": "ready",
    "download_url": "/contracts/contract_id/download",
    "inline_url": "/contracts/contract_id/file",
    "file_name": "Shartnoma turi-contract_id.pdf",
    "mime_type": "application/pdf",
    "file_base64": "JVBERi0x..."
  }
]
```

Frontend chatda PDF attachment qilib ko'rsatsin. Faylni bevosita yaratish uchun:

```js
const bytes = Uint8Array.from(atob(contract.file_base64), c => c.charCodeAt(0));
const blob = new Blob([bytes], { type: contract.mime_type });
const url = URL.createObjectURL(blob);
```

`inline_url` browserda ochish uchun, `download_url` majburiy yuklab olish uchun.

## WebSocket

Assistant `message.created` eventida ham shu `contracts` array keladi.
