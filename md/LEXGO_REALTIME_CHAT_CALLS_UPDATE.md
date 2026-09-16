# LexGo Realtime Chat And Calls Update

Realtime secure chat and audio/video call signaling are implemented and deployed.

## Secure Chat Realtime

Connect:

`wss://<backend-host>/ws/secure-chats/{room_id}?token=<jwt>`

Send:

```json
{
  "content": "Salom",
  "message_type": "text",
  "meta": {}
}
```

All room participants receive:

```json
{
  "event": "secure_message.created",
  "message": {
    "id": "message_id",
    "room_id": "room_id",
    "sender_user_id": "user_id",
    "message_type": "text",
    "content": "original",
    "filtered_content": "filtered",
    "is_blocked": false,
    "block_reason": "",
    "created_at": "2026-09-05T08:00:00+00:00"
  }
}
```

Use `filtered_content` in UI. Contact info and external links are blocked.

## Audio / Video Calls

Create call session:

`POST /secure-chats/{room_id}/calls`

```json
{
  "call_type": "video",
  "title": "Consultation"
}
```

List calls:

`GET /secure-chats/{room_id}/calls`

End/update call:

`PATCH /calls/{call_id}`

```json
{
  "status": "ended"
}
```

Realtime WebRTC signaling:

`wss://<backend-host>/ws/secure-chats/{room_id}/calls/{call_id}?token=<jwt>`

Allowed events:

- `call.join`
- `call.leave`
- `call.end`
- `webrtc.offer`
- `webrtc.answer`
- `webrtc.ice_candidate`
- `media.mute`
- `media.unmute`

Send:

```json
{
  "event": "webrtc.offer",
  "payload": {
    "sdp": "..."
  }
}
```

Sender receives:

```json
{
  "event": "signal.sent",
  "relayed_event": "webrtc.offer",
  "call_id": "call_id",
  "room_id": "room_id"
}
```

Other participant receives:

```json
{
  "event": "webrtc.offer",
  "call_id": "call_id",
  "room_id": "room_id",
  "sender_user_id": "user_id",
  "payload": {
    "sdp": "..."
  },
  "created_at": "2026-09-05T08:00:00+00:00"
}
```

Frontend must implement `getUserMedia`, `RTCPeerConnection`, local/remote stream rendering, and STUN/TURN config. Backend validates room access and relays signaling.

## Production Test Result

Verified in Docker container:

- secure chat message sender received `secure_message.created`
- secure chat receiver received `secure_message.created`
- call sender received `signal.sent`
- call receiver received `webrtc.offer`
- call end sender received `signal.sent`
- call end receiver received `call.end`
