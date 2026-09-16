# LawProject AI API contract file fix

Backend endi shartnoma so'ralganda assistant text ichida PDF link yozmaydi.

Assistant message:

```json
{
  "content": "PDF shartnoma fayl ko'rinishida tayyor."
}
```

PDF fayl `contracts` array ichida keladi:

```json
{
  "contracts": [
    {
      "id": "contract_id",
      "contract_type": "Hamkorlik shartnomasi",
      "status": "ready",
      "download_url": "/contracts/contract_id/download",
      "inline_url": "/contracts/contract_id/file",
      "file_name": "Hamkorlik shartnomasi-contract_id.pdf",
      "mime_type": "application/pdf",
      "file_base64": "JVBERi0x..."
    }
  ]
}
```

Muhim: frontend chatda assistant `content` ichidagi linkni parse qilmasin. PDF attachment faqat `contracts` arraydan render qilinsin.

`POST /clients/{client_id}/chats/{chat_id}/messages` responseida ham, `GET /clients/{client_id}/chats/{chat_id}` responseida ham `contracts` bor.

Base64dan file yaratish:

```js
const bytes = Uint8Array.from(atob(contract.file_base64), c => c.charCodeAt(0));
const blob = new Blob([bytes], { type: contract.mime_type });
const url = URL.createObjectURL(blob);
```
