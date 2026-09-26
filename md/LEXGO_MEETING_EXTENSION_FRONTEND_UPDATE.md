# LexGo frontend update: hujjat meeting va audio call

Backend productionga qo'yildi: `https://lexgo.api.cognilabs.org`

## Nima qo'shildi

- Hujjat ishlari uchun advokat-client LiveKit meeting default 15 daqiqa.
- Advokat 1 marta bepul 3 daqiqagacha uzaytira oladi.
- Pullik uzaytirish: 2 000 UZS / daqiqa.
- Pullik uzaytirishda meeting payment javobi kelguncha pause bo'ladi.
- Pause faqat 5 daqiqa amal qiladi. 5 daqiqada approve/reject bo'lmasa, meeting qolgan vaqti bilan davom etadi.
- Telegram inline approve/reject orqali pullik uzaytirish tasdiqlanadi.
- Client hujjat ishi yakunlanmaguncha advokatga 3 martagacha LiveKit audio call boshlashi mumkin.
- Recording flow avvalgidek: client request qiladi, advokat approve qilsa recording start qilinadi.

## Muhim response fieldlar

`CallSessionOut` ichida yangi fieldlar:

- `max_duration_minutes`
- `auto_end_at`
- `remaining_seconds`
- `paused`
- `pause_expires_at`
- `paused_remaining_seconds`
- `free_extension_used`
- `free_extension_available`
- `free_extension_max_minutes`
- `paid_extension_price_per_minute`
- `pending_extension_request`
- `document_request_id`
- `document_lawyer_record_id`
- `client_call_usage`

Frontend `remaining_seconds` va `paused` bo'yicha timer ko'rsatsin.

## Advokat meeting yaratishi

`POST /lawyers/me/document-requests/{record_id}/meeting`

Body optional:

```json
{
  "call_type": "video",
  "title": "Hujjat bo'yicha uchrashuv"
}
```

`max_duration_minutes` yuborilmasa backend 15 daqiqa qiladi.

## Bepul uzaytirish

`POST /secure-chats/{room_id}/calls/{call_id}/free-extend`

Faqat host advokat/callcenter advokat bosadi.

```json
{
  "minutes": 3
}
```

Faqat 1 marta ishlaydi. Ikkinchi marta 409 qaytadi.

## Pullik uzaytirish

`POST /secure-chats/{room_id}/calls/{call_id}/extension-payment-request`

```json
{
  "minutes": 10
}
```

Backend:

- amount = `minutes * 2000`
- Telegram inline approve/reject yuboradi
- call `paused=true` bo'ladi
- `pause_expires_at` qaytadi

Frontend:

- `paused=true` bo'lsa LiveKit join/publishni vaqtincha bloklang yoki "To'lov javobi kutilmoqda" holatini ko'rsating.
- `pause_expires_at` tugasa call holatini qayta GET qiling.
- WebSocket eventlar:
  - `call.payment_extension_requested`
  - `call.payment_extension_approved`
  - `call.payment_extension_rejected`
  - `call.extended`

## Client audio call

`POST /document-requests/{request_id}/calls/audio`

Client bosadi. Shartlar:

- document request clientniki bo'lishi kerak
- ish callcenter advokat tomonidan claimed bo'lishi kerak
- ish hali yakunlanmagan bo'lishi kerak
- limit: 3 marta

4-marta chaqirilsa 429 qaytadi.

Response ichida:

```json
{
  "call_type": "audio",
  "max_duration_minutes": 15,
  "client_call_usage": {
    "used": 1,
    "limit": 3,
    "remaining": 2
  }
}
```

## Recording flow

Client:

`POST /secure-chats/{room_id}/calls/{call_id}/recording-request`

Advokat:

`PATCH /secure-chats/{room_id}/calls/{call_id}/recording-permission`

```json
{
  "allowed": true,
  "reason": ""
}
```

Client yoki participant:

`POST /secure-chats/{room_id}/calls/{call_id}/recording/start`

## WebSocket

Call signaling:

`wss://lexgo.api.cognilabs.org/ws/secure-chats/{room_id}/calls/{call_id}?token=JWT`

User level eventlar uchun mavjud user WS ishlatilsin. Incoming call, extension approve/reject eventlari shu realtime oqimlarda keladi.

## Test qilingan

- Lawyer meeting create: 201, 15 daqiqa.
- Free extension: 200, duration 18 daqiqa.
- Ikkinchi free extension: 409.
- Paid extension request: 200, 2 daqiqa uchun 4 000 UZS, `paused=true`.
- Telegram approve callback: call `paused=false`, duration 20 daqiqa.
- Client audio call: 3 marta 201, 4-marta 429.

