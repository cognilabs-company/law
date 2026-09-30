# LexGo Express Videokonsultatsiya Frontend Integration

Sana: 2026-09-28
Backend: `https://lexgo.api.cognilabs.org`

## Nima o'zgardi

`Express videokonsultatsiya` endi oddiy zayavka bo'lib `open_pool`da qolmaydi.

Client express xizmatni tanlaganda backend:

1. Client tanlagan yo'nalish bo'yicha navbatchi advokat/yurist/callcenter advokatni topadi.
2. Requestni darhol shu mutaxassisga biriktiradi.
3. `audio` LiveKit call session yaratadi.
4. Client response olishi bilan audio call ekranini ochishi kerak.
5. Advokatga realtime `call.incoming` va `urgent_advokat.express_audio_call` eventlari boradi.

## Endpoint

```http
POST /urgent-advokat/requests
Authorization: Bearer <client_token>
Content-Type: application/json
```

Request:

```json
{
  "service_kind": "express_video_consultation",
  "directions": ["fuqarolik"],
  "need": "Muammo haqida qisqa izoh"
}
```

`traffic_accident_consultation` ham shu immediate audio call flow bilan ishlaydi.

## Response

Express uchun response top-level request fieldlarini ham, `call_session`ni ham qaytaradi:

```json
{
  "id": "urgent_request_id",
  "work_id": "LGT-20260928-XXXXXXXX",
  "status": "meeting_active",
  "service_kind": "express_video_consultation",
  "assignment_mode": "direct_on_duty_call",
  "immediate_call": true,
  "call_type": "audio",
  "assigned_lawyer": {
    "id": "...",
    "name": "...",
    "phone": "...",
    "role": "advokat"
  },
  "call_session": {
    "id": "call_id",
    "room_id": "secure_chat_room_id",
    "call_type": "audio",
    "status": "active",
    "provider": "livekit",
    "livekit_url": "...",
    "livekit_room": "...",
    "livekit_token": "...",
    "quality_policy": {
      "start_profile": "audio_only",
      "video_enabled": false,
      "audio_priority": true
    }
  }
}
```

## Frontend flow

Client tarafida:

1. Client `Express videokonsultatsiya` tanlaydi.
2. Yo'nalish tanlanadi.
3. `POST /urgent-advokat/requests` yuboriladi.
4. Agar response ichida `immediate_call=true` va `call_session` bo'lsa:
   - request detail/pool ekraniga o'tkazmang
   - darhol audio call ekranini oching
   - `call_session.livekit_token`, `call_session.livekit_url`, `call_session.livekit_room` bilan LiveKitga ulang
5. Call ekranida video tugmani default ko'rsatmaslik mumkin, chunki bu flow audio call.

## Advokat tarafida realtime

Advokat user kanalida quyidagi eventlarni kutadi:

```json
{
  "event": "call.incoming",
  "call_id": "...",
  "room_id": "...",
  "call": {
    "call_type": "audio",
    "status": "active"
  }
}
```

Va urgent request event:

```json
{
  "event": "urgent_advokat.express_call_started",
  "record_id": "...",
  "status": "meeting_active",
  "urgent_request": {
    "service_kind": "express_video_consultation",
    "payload": {
      "call_status": "calling",
      "call_channel": "audio",
      "assigned_lawyer_user_id": "..."
    }
  }
}
```

Advokat shu event kelganda incoming audio call modalini chiqaradi.

## Join token

Call ekran qayta ochilganda yoki token yangilanishi kerak bo'lsa:

```http
GET /secure-chats/{room_id}/calls/{call_id}/join-token
Authorization: Bearer <token>
```

Response `CallSessionOut`.

## Statuslar

Express yaratishda:

- request status: `meeting_active`
- payload `call_status`: `calling`
- payload `call_channel`: `audio`
- payload `assignment_mode`: `direct_on_duty_call`

Demak frontend `open_pool` kutmasligi kerak.

## Test natijasi

Production containerda TestClient bilan tekshirildi:

- `POST /urgent-advokat/requests` status `201`
- `status = meeting_active`
- `service_kind = express_video_consultation`
- `immediate_call = true`
- `call_type = audio`
- `call_session.status = active`
- `call_session.call_type = audio`
- `call_session.provider = livekit`
- `call_session.quality_policy.start_profile = audio_only`

## Muhim

Bu xizmat nomi frontendda hali ham `Express videokonsultatsiya` bo'lishi mumkin, lekin backend real ulanishni audio call sifatida ochadi. Shuning uchun UI tugmasi "Express videokonsultatsiya" bo'lsa ham call screen audio mode'da ochilishi kerak.
