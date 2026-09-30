# LexGo Call Adaptive Quality Frontend Integration

Sana: 2026-09-28
Backend: `https://lexgo.api.cognilabs.org`

## Maqsad

Audio/video call internet sifatiga qarab avtomatik moslashishi kerak.
Mijozga yoki advokatga "pastroq sifatga o'ting" degan xabar chiqarilmaydi.
Frontend LiveKit sozlamalarini backend qaytargan `quality_policy` bo'yicha ichkarida o'zi almashtiradi.

## Backenddan keladigan yangi maydonlar

Quyidagi call endpointlarida endi `connection_hints` va `quality_policy` qaytadi:

- `POST /secure-chats/{room_id}/calls`
- `GET /secure-chats/{room_id}/calls`
- `GET /secure-chats/{room_id}/calls/{call_id}`
- `GET /secure-chats/{room_id}/calls/{call_id}/join-token`
- `POST /secure-chats/{room_id}/zoom`
- Document meeting va urgent/tezkor advokat meeting response ichidagi call payloadlar

## `quality_policy` namunasi

```json
{
  "mode": "adaptive",
  "user_visible_quality_prompt": false,
  "audio_priority": true,
  "auto_downgrade": true,
  "auto_upgrade": true,
  "audio_only_fallback": true,
  "start_profile": "low",
  "video_enabled": true,
  "recommended_room_options": {
    "adaptiveStream": true,
    "dynacast": true,
    "stopLocalTrackOnUnpublish": true
  },
  "audio_capture_defaults": {
    "echoCancellation": true,
    "noiseSuppression": true,
    "autoGainControl": true
  },
  "publish_defaults": {
    "simulcast": true,
    "videoCodec": "vp8",
    "backupCodec": true,
    "dtx": true,
    "red": true
  },
  "profiles": {
    "audio_only": { "audio": true, "video": false, "audio_bitrate": 24000 },
    "low": { "width": 320, "height": 180, "fps": 12, "max_bitrate": 160000 },
    "medium": { "width": 640, "height": 360, "fps": 15, "max_bitrate": 450000 },
    "high": { "width": 960, "height": 540, "fps": 24, "max_bitrate": 900000 },
    "screen_share": { "fps": 5, "max_bitrate": 500000 }
  },
  "connection_quality_actions": {
    "excellent": { "profile": "high", "camera_allowed": true },
    "good": { "profile": "medium", "camera_allowed": true },
    "poor": { "profile": "low", "camera_allowed": true },
    "lost": { "profile": "audio_only", "camera_allowed": false }
  }
}
```

Audio calllarda `start_profile = "audio_only"` va `video_enabled = false` bo'ladi.

## Frontend LiveKit ulash qoidasi

Room yaratishda backend policy ishlatilsin:

```ts
const policy = call.quality_policy;

const room = new Room({
  adaptiveStream: policy?.recommended_room_options?.adaptiveStream ?? true,
  dynacast: policy?.recommended_room_options?.dynacast ?? true,
  stopLocalTrackOnUnpublish: policy?.recommended_room_options?.stopLocalTrackOnUnpublish ?? true,
  publishDefaults: {
    simulcast: policy?.publish_defaults?.simulcast ?? true,
    videoCodec: policy?.publish_defaults?.videoCodec ?? "vp8",
    backupCodec: policy?.publish_defaults?.backupCodec ?? true
  },
  audioCaptureDefaults: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  },
  videoCaptureDefaults: {
    resolution: {
      width: policy.profiles.low.width,
      height: policy.profiles.low.height,
      frameRate: policy.profiles.low.fps
    }
  }
});
```

## Video publish default

Video call har doim `low` profildan boshlansin:

```ts
const low = policy.profiles.low;

await room.localParticipant.setCameraEnabled(true, {
  resolution: {
    width: low.width,
    height: low.height,
    frameRate: low.fps
  }
});
```

Keyin LiveKit `adaptiveStream` va `dynacast` orqali avtomatik moslashadi.

## Yomon internetda foydalanuvchiga xabar chiqmasin

`user_visible_quality_prompt = false`.

Shuning uchun frontend quyidagilarni qilmaydi:

- "Internet yomon, past sifatga o'ting" degan modal chiqarmaydi.
- Manual sifat tanlashni majbur qilmaydi.
- Meetingni o'chirib yubormaydi.

Frontend faqat ichkarida avtomatik:

- high -> medium -> low
- low -> audio_only
- reconnectdan keyin audio/video trackni qayta publish

qiladi.

## Connection quality event

LiveKit connection quality eventni tinglash kerak:

```ts
room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
  if (!participant?.isLocal) return;

  if (quality === ConnectionQuality.Poor) {
    applyVideoProfile("low");
  }

  if (quality === ConnectionQuality.Lost) {
    switchToAudioOnly();
  }
});
```

Bu UI alert emas, ichki avtomatik harakat.

## Audio-only fallback

Internet juda yomon bo'lsa:

```ts
async function switchToAudioOnly() {
  await room.localParticipant.setCameraEnabled(false);
  await room.localParticipant.setMicrophoneEnabled(true);
}
```

Internet tiklansa:

```ts
async function restoreVideoIfAllowed() {
  if (!policy.video_enabled) return;
  const low = policy.profiles.low;
  await room.localParticipant.setCameraEnabled(true, {
    resolution: {
      width: low.width,
      height: low.height,
      frameRate: low.fps
    }
  });
}
```

## Audio call

Audio calllarda `quality_policy.video_enabled = false`.

Frontend:

- camera buttonni default hidden yoki disabled qiladi
- faqat microphone publish qiladi
- screen share kerak bo'lsa alohida ruxsat bilan yoqiladi

## Reconnect

Reconnect holatlarida meeting yopilmasin:

```ts
room.on(RoomEvent.Reconnecting, () => {
  setInternalCallState("reconnecting");
});

room.on(RoomEvent.Reconnected, () => {
  setInternalCallState("connected");
  restoreVideoIfAllowed();
});

room.on(RoomEvent.Disconnected, () => {
  setInternalCallState("disconnected");
});
```

Userga texnik "quality downgrade" text ko'rsatilmadi. Faqat ulanish qayta tiklanayotgani kabi oddiy status ko'rsatilishi mumkin.

## Backend test natijasi

Production containerda tekshirildi:

- video call payload `quality_policy.mode = adaptive`
- video call `start_profile = low`
- poor network action `profile = low`
- lost network action `profile = audio_only`
- `connection_hints.auto_quality = true`
- `connection_hints.client_switches_quality_silently = true`
- audio call `start_profile = audio_only`
- audio call `video_enabled = false`

## Muhim

Backend internet sifatini brauzer ichida o'lchamaydi. Real moslashish frontend LiveKit SDK orqali bajariladi. Backend endi barcha call sessionlarga yagona policy beradi, frontend esa shu policy asosida avtomatik sifatni boshqaradi.
