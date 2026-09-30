# LexGo audio call -> video call frontend integratsiya

Backend productionda yangilandi: audio call vaqtida kimdir camera yoqsa, shu call avtomatik video call sifatida saqlanadi.

## Nima o'zgardi

- Audio call `call_type: "audio"` bo'lib boshlanadi.
- Audio call ichida user camera yoqsa backend callni `call_type: "video"` ga o'tkazadi.
- Call tugagandan keyin history/detail sahifalarida ham u video call sifatida ko'rinishi kerak.
- Agar camera hech qachon yoqilmasa, call `audio` bo'lib qoladi.
- Audio call participantlari default `camera_enabled: false` bilan keladi.

## Frontend nima qilishi kerak

Camera toggle yoqilganda shu API chaqiriladi:

```http
PATCH /secure-chats/{room_id}/calls/{call_id}/participants/{participant_user_id}
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "camera_enabled": true
}
```

Response ichida:

```json
{
  "call_type": "video",
  "quality_policy": {
    "video_enabled": true
  }
}
```

Frontend response kelgandan keyin UI holatini backend response bo'yicha yangilasin:

- `call_type === "video"` bo'lsa video call UI ko'rsatilsin.
- History/detail/listlarda call turini local state yoki buttondan emas, backenddan kelgan `call_type`dan o'qisin.
- Same LiveKit room/token ishlatiladi, yangi call yaratish kerak emas.

## Realtime event

Camera audio callni video callga aylantirgan paytda WS event ham ketadi:

```text
call.upgraded_to_video
```

Event payloadida yangilangan call object keladi. Call ekranida va boshqa participantlarda shu event kelganda `call_type`ni `video`ga yangilash kerak.

## Template file name o'zgarishi

Backend yangi yuklanadigan/import qilinadigan template file nomlarini normal ko'rinishga keltiradi:

- ALL CAPS file nomlari Title Case bo'ladi.
- `.DOCX` extension `.docx` bo'ladi.
- boshidagi `_`, ortiqcha nuqta/bo'sh joylar tozalanadi.

Frontend `source_file_name`ni ko'rsatishda aynan backenddan kelgan nomni ishlatsin.

## Test natijasi

Productionda test qilindi:

- Audio call yaratildi, camera yoqilmagan holatda `call_type=audio`, `quality_policy.video_enabled=false` qoldi.
- Audio call ichida `camera_enabled=true` yuborilganda `call_type=video`, `quality_policy.video_enabled=true` bo'ldi va DBda video sifatida saqlandi.
- 990 ta template tekshirildi, all-caps `source_file_name` qolmadi.
