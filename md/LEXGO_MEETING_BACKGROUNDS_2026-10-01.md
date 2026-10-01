# LexGo — Meeting kamera foni: blur va virtual fonlar (2026-10-01)

Meeting paytida foydalanuvchi o'z kamerasi uchun fon effektini tanlaydi: yengil blur, kuchli blur, tayyor fon rasmi yoki o'zining rasmi. Effekt to'liq brauzerda (qurilmaning o'zida) ishlanadi, video serverga allaqachon ishlangan holda ketadi. Backend o'zgarishi talab qilinmaydi.

## Qanday ishlaydi

- Kutubxona: `@livekit/track-processors` 0.8.1 (Apache-2.0). Ichida MediaPipe `selfie_segmenter` modeli va WebGL2 bor.
- Effekt kamera yoqilib, publish bo'lgandan keyin qo'yiladi (`pauseUpstream` → `setProcessor` → `resumeUpstream`). Effekt yoqilmasa ham kamera effektsiz ishlashda davom etadi.
- Effektlar orasida almashish bir zumda bo'ladi (`switchTo`). "Yo'q" tanlansa processor to'liq to'xtatiladi (`stopProcessor`): segmentatsiya ham, WebGL ham ishlamaydi, kamera xom holatiga qaytadi.
- Qo'ng'iroq tugaganda kamera restart bo'layotgan bo'lsa ham, processor va yangi kamera treki to'xtatiladi (LiveKit'dagi race'dan himoya).
- Tanlangan effekt va foydalanuvchi rasmi har bir akkaunt uchun alohida saqlanadi: `lexgo_call_bg:<user id>` va `lexgo_call_bg_custom:<user id>`. Bir kompyuterda boshqa akkaunt kirsa, oldingi odamning foni ko'rinmaydi va qo'llanmaydi. Effekt keyingi meeting'da avtomatik qo'llanadi.
- Foydalanuvchi rasmi o'z proporsiyasida saqlanadi (uzun tomoni ko'pi bilan 1280 px, JPEG), hech qayerga yuklanmaydi.
- Qurilma effektni tortolmasa (dastlabki 60 kadrdan keyin, ketma-ket 120 kadr ishlash vaqtining medianasi 85 ms dan oshsa), effekt o'zi o'chadi va foydalanuvchiga xabar chiqadi.
- Brauzer qo'llamasa (WebGL2 / VideoFrame / OffscreenCanvas yo'q bo'lsa), "Fon" tugmasi umuman ko'rinmaydi.
- MediaPipe fayllari o'z serverimizdan olinadi. Ular topilmasa (masalan, deploy `prebuild`ni o'tkazib yuborgan bo'lsa), kutubxonaning standart CDN manzillari ishlatiladi (jsDelivr va Google Storage).

## Fayllar

| Fayl | Vazifasi |
|---|---|
| `lib/callBackground.ts` | effekt holati, saqlash, qo'llab-quvvatlash tekshiruvi, processor'ni ulash/almashtirish, sekin qurilma detektori, foydalanuvchi rasmi |
| `components/chat/CallBackgroundPicker.tsx` | fon tanlash paneli (desktop'da panel, telefonda pastki sheet) |
| `components/chat/CallRoom.tsx` | "Fon" tugmasi (desktop panelida, telefonda "Yana" menyusida) va effektni kameraga ulash |
| `app/globals.css` | `.mtg__bg*` stillari |
| `messages/{uz,ru,en}.json` | `call.bg.*` matnlari |
| `scripts/copy-mediapipe.mjs` | MediaPipe wasm fayllarini `node_modules` dan `public/mediapipe/wasm/<versiya>/` ga ko'chiradi (`predev`/`prebuild` da avtomatik ishlaydi) |
| `next.config.ts` | `MEDIAPIPE_VERSION` env va kesh sarlavhalari |
| `eslint.config.mjs` | ko'chirilgan MediaPipe JS fayllari (`public/mediapipe/**`) lint'dan chiqarilgan |
| `public/mediapipe/models/selfie_segmenter.tflite` | segmentatsiya modeli (float16, 249 KB) |
| `public/meeting-bg/*.webp`, `thumbs/*.webp` | fon rasmlari (1280×720) va ularning kichik nusxalari (320×180) |

`public/mediapipe/wasm/` git'da saqlanmaydi (≈19 MB): `npm run dev` va `npm run build` uni o'zi yaratadi. Deploy `next build` ni to'g'ridan-to'g'ri chaqirsa, avval `node scripts/copy-mediapipe.mjs` ni ishga tushirish kerak.

## Kesh

| Yo'l | Cache-Control |
|---|---|
| `/mediapipe/wasm/<versiya>/*` | `public, max-age=31536000, immutable` (versiya yo'lda, shuning uchun xavfsiz) |
| `/mediapipe/models/*` | `public, max-age=2592000` |
| `/meeting-bg/*` | `public, max-age=604800` |

## Fon rasmlari va litsenziyalar

Fotosuratlar [Unsplash](https://unsplash.com) dan olingan, [Unsplash License](https://unsplash.com/license) asosida: tijoriy va notijoriy maqsadda bepul ishlatish mumkin, ruxsat so'rash shart emas. Cheklov: rasmlarni o'zgartirmasdan sotish yoki ulardan Unsplash'ga raqobatchi xizmat tuzish mumkin emas. Muallifni ko'rsatish majburiy emas, lekin shu yerda qayd etilgan.

| Fayl | Nomi | Muallif | Manba |
|---|---|---|---|
| `study.webp` | Kabinet | Clay Banks | https://unsplash.com/photos/Mb-lGau6K5U |
| `library.webp` | Kutubxona | Nejc Soklič | https://unsplash.com/photos/POlLqIPWR3c |
| `office.webp` | Ofis | Caroline Badran | https://unsplash.com/photos/xTmez98cqAM |
| `home.webp` | Uy ofisi | Li Zhang | https://unsplash.com/photos/zWWhupBREII |
| `openspace.webp` | Ochiq ofis | Craig Lovelidge | https://unsplash.com/photos/bV5dFLEYecM |
| `tashkent.webp` | Toshkent | Sarvar Samigov | https://unsplash.com/photos/eK7Q7phvASI |
| `chimgan.webp` | Chimyon | Artem Bryzgalov | https://unsplash.com/photos/uDa7num4wvY |
| `bokeh.webp` | Bokeh | Michael | https://unsplash.com/photos/wTw_DQR7HNc |

LexGo uchun maxsus chizilgan (gradient, LexGo'ga tegishli): `lexgo-blue.webp` (LexGo), `dawn.webp` (Tong), `night.webp` (Tun).

Boshqa komponentlar: `@livekit/track-processors` — Apache-2.0; `@mediapipe/tasks-vision` va `selfie_segmenter` modeli — Google, Apache-2.0.

## Yangi fon qo'shish

1. 1280×720 `webp` rasmni `public/meeting-bg/<id>.webp` ga, 320×180 nusxasini `public/meeting-bg/thumbs/<id>.webp` ga qo'ying.
2. `<id>` ni `lib/callBackground.ts` dagi `BG_IMAGES` ro'yxatiga qo'shing.
3. `call.bg.images.<id>` nomini `messages/uz.json`, `ru.json`, `en.json` ga qo'shing.
4. Rasm Unsplash'dan bo'lsa, yuqoridagi jadvalga muallif va havolani yozing.

## Tekshirilgan

Production backend'da superadmin bilan haqiqiy meeting ochildi (Edge, soxta kamera):

- kuchli blur ≈300 ms da yoqildi (fayllar oldindan yuklangan holatda);
- kutubxona foni, foydalanuvchi rasmi va yengil blur ishladi;
- kamera o'chirib-yoqilganda effekt saqlanib qoldi;
- "Yo'q" tanlanganda kamera xom trekka qaytdi;
- saqlangan effekt meeting'ga kirishda panel ochilmasdan qo'llandi, 25 soniyada noto'g'ri "sekin qurilma" xabari chiqmadi;
- Escape panelni yopadi va fokus "Fon" tugmasiga qaytadi; panel tashqarisiga bosish uni yopadi, bar tugmalari esa panel ochiq turganda ham ishlaydi;
- desktop (1440), tor/past ekran (780×420), telefon (390) ko'rinishlari va uz/ru/en matnlari tekshirildi;
- wasm/model faqat o'z serverimizdan yuklandi, keyingi yuklashlar disk keshidan bo'ldi.
