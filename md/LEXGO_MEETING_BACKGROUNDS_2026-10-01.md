# LexGo — Meeting kamera foni: blur va virtual fonlar (2026-10-01, v2)

Meeting paytida foydalanuvchi kamerasi uchun tanlaydi: **Yo'q**, **Yengil blur**, **Kuchli blur**, **6 ta fon rasmi** yoki **o'z rasmi**. Hammasi brauzerning o'zida (qurilmada) ishlanadi, serverga allaqachon ishlangan video ketadi. Backend o'zgarishi kerak emas.

## Nega qayta yozildi (v1 → v2)

v1 `@livekit/track-processors` kutubxonasida edi. GT 730 + i5-12400F kompyuterida o'lchandi:

| | v1 (kutubxona) | v2 (o'z dvigatelimiz) |
|---|---|---|
| Kuchli blur | 5 FPS, 650 ms gacha qotish | kamera FPS'iga teng (~23–24 meeting'da, 30 benchmarkda) |
| Rasm foni | 9.7 FPS, 10 soniyada 25 ta asosiy oqim bloki | kamera FPS'iga teng, 0 blok |
| Kamera restarti (sifat almashuvi, o'chirib-yoqish) | 746 ms muzlash (MediaPipe noldan yuklanardi) | ~26 ms (faqat manba almashadi) |
| Effektlar orasida almashish | qotish, qora/oq miltillash | 260 ms silliq o'tish |

Sabablari: kutubxona hamma ishni sahifaning asosiy oqimida qilardi, har kamera restartida MediaPipe'ni qayta yuklardi, binar niqob ishlatardi (zinapoya qirralar, miltillash) va butun kadrni blur qilardi (shaxs atrofida halo).

## Qanday ishlaydi

- **Alohida Web Worker** (`lib/bgEngine/worker.ts`) barcha kadr ishini bajaradi. Asosiy oqim faqat oqimlarni ulaydi, shuning uchun interfeys (React, chat) videoni qotirmaydi.
- **Kadrlar yo'li:** Chrome/Edge/Android — `MediaStreamTrackProcessor` + `MediaStreamTrackGenerator` oqimlari worker'ga uzatiladi. Safari 18+ — kamera treki nusxasi worker'ga uzatiladi, u yerda standart `MediaStreamTrackProcessor` + `VideoTrackGenerator`.
- **Segmentatsiya:** MediaPipe `ImageSegmenter` (`@mediapipe/tasks-vision` 0.10.35), 16:9 kadrlar uchun landscape model (144×256), tik kadrlar uchun square model. Kirish 256×144 gacha kichraytiriladi. Ishga tushishda GPU va CPU delegate o'lchanadi va qurilmaga tezrog'i tanlanadi (masalan, zaif GPU + kuchli CPU'da CPU).
- **Sifat:** ishonch niqobi + noaniq qirralarda vaqt bo'yicha silliqlash (miltillamaydi, harakatda iz qoldirmaydi), qirralarni kamera ranglariga qarab aniqlashtirish (joint bilateral), blur faqat fonga qo'llanadi (halo yo'q, dual-filter), rasm fonlarida "light wrap" (qirralar tabiiy ko'rinadi).
- **Chiqish:** kompozitsiya FBO'ga chiziladi va PBO + fence orqali asinxron o'qiladi, encoder'ga CPU kadr beriladi. Bu zaif GPU'larda Chrome'ning ichki konvertatsiyasi kutishini (~45 ms) chetlab o'tadi; kadr tayyor bo'lishi bilan uzatiladi.
- **Moslashuv:** yuklama oshsa segmentatsiya har 2–3 kadrda bir bajariladi (kompozitsiya baribir har kadrda). Bu ham yetmasa effekt o'chiriladi va "Qurilma tortolmayapti" xabari chiqadi.
- **Almashish:** effektlar orasida 260 ms crossfade. "Yo'q" tanlansa dvigatel kadrlarni o'zgartirmasdan o'tkazadi (GPU ishi yo'q), qayta yoqish bir zumda.
- **Xavfsizlik:** worker xatosi, GL konteksti yo'qolishi, chiqish to'xtab qolishi yoki effekt yoqiq turib 3 soniyadan ortiq ishlanmagan kadr chiqishi — hammasi aniqlanadi: effekt o'chadi, xabar chiqadi, kamera xom holatiga qaytadi.
- **Saqlash:** tanlangan effekt va foydalanuvchi rasmi akkaunt bo'yicha (`lexgo_call_bg:<user id>`, `lexgo_call_bg_custom:<user id>`); rasm o'z proporsiyasida, uzun tomoni ≤1280 px, hech qayerga yuklanmaydi.
- **Qo'ng'iroq sifati bilan bog'liq tuzatish:** `capSender` endi rung FPS'ini ham o'rnatadi. Avval qo'ng'iroq 12 FPS (low) bilan boshlansa, keyin sifat oshganda ham boshqalar 12 FPS ko'rardi.

## Brauzerlar

| Brauzer | Holat |
|---|---|
| Chrome, Edge, Opera, Yandex (desktop), Android Chrome | to'liq ishlaydi |
| Safari 18+ (macOS, iPhone/iPad) | standart API orqali ishlaydi; real qurilmada hali sinalmagan — xato bo'lsa kamera xom holatiga qaytadi |
| Firefox, eski Safari, GPU'siz (dasturiy WebGL) qurilmalar | "Fon" tugmasi ko'rinmaydi |

## Fayllar

| Fayl | Vazifasi |
|---|---|
| `lib/bgEngine/worker.ts` | segmentatsiya, kompozitsiya, readback, moslashuv (worker) |
| `lib/bgEngine/shaders.ts` | GLSL shaderlar |
| `lib/bgEngine/engine.ts` | brauzer imkoniyatlari, worker boshqaruvi, LiveKit `TrackProcessor` |
| `lib/bgEngine/protocol.ts` | worker xabarlari turlari |
| `lib/callBackground.ts` | effekt holati, saqlash, o'z rasmi, dvigatelni kameraga ulash |
| `components/chat/CallBackgroundPicker.tsx` | fon tanlash paneli |
| `components/chat/CallRoom.tsx` | "Fon" tugmasi, ulanish, `capSender` FPS |
| `app/globals.css` | `.mtg__bg*` stillari |
| `messages/{uz,ru,en}.json` | `call.bg.*` matnlari |
| `scripts/copy-mediapipe.mjs` | MediaPipe wasm'ni `public/mediapipe/wasm/<versiya>/` ga ko'chiradi (`predev`/`prebuild`) |
| `next.config.ts` | `MEDIAPIPE_VERSION` va kesh sarlavhalari |
| `public/mediapipe/models/` | `selfie_segmenter_landscape.tflite`, `selfie_segmenter.tflite` (Apache-2.0) |
| `public/meeting-bg/` | 6 ta fon (1280×720) va `thumbs/` (320×180) |

`public/mediapipe/wasm/` git'da saqlanmaydi (~22 MB): `npm run dev` va `npm run build` uni o'zi yaratadi. Deploy `next build`ni to'g'ridan-to'g'ri chaqirsa, avval `node scripts/copy-mediapipe.mjs` ishga tushirilsin; aks holda dvigatel jsDelivr/Google Storage'dagi xuddi shu versiyadan yuklaydi.

MediaPipe **0.10.35** ataylab tanlangan: 1.0.x versiyalari har 60 soniyada Google serveriga foydalanish statistikasini yuboradi (telemetriya), bu huquqiy platforma uchun nomaqbul.

## Fon rasmlari va litsenziyalar

Fotosuratlar [Unsplash](https://unsplash.com) dan, [Unsplash License](https://unsplash.com/license) asosida (tijoriy va notijoriy foydalanish bepul, ruxsat shart emas; rasmlarni o'zgartirmasdan sotish yoki ulardan raqobatchi xizmat tuzish mumkin emas). Hammasi 1280×720 ga kesilgan va yengil defokus berilgan (tabiiyroq ko'rinadi, qirralar kamroq seziladi).

| Fayl | Nomi | Muallif | Manba |
|---|---|---|---|
| `law-library.webp` | Huquqiy kutubxona | Lina Bob | https://unsplash.com/photos/Xfa7Pte_7YU |
| `advocate-office.webp` | Advokat kabineti | Gian Paolo Aliatis | https://unsplash.com/photos/EJSNrTzz6xk |
| `modern-office.webp` | Zamonaviy ofis | Nastuh Abootalebi | https://unsplash.com/photos/oa1IiRUHCAM |
| `calm-home.webp` | Uy | Alexandra Gorn | https://unsplash.com/photos/JIUjvqe2ZHg |
| `tashkent.webp` | Toshkent | Sarvar Samigov | https://unsplash.com/photos/eK7Q7phvASI |
| `blue-wall.webp` | Ko'k devor | engin akyurt | https://unsplash.com/photos/BawjznQ3Q8U |

Tanlov mezonlari: boshning orqasi tinch (segmentatsiya xatolari ko'rinmaydi), ko'z darajasidagi gorizont, bir tekis yorug'lik, odam va matn yo'q (o'z ko'rinishi oynadek aks etadi), 16:9 va telefonning 3:4 kesimida ham yaxshi.

Boshqa komponentlar: `@mediapipe/tasks-vision` va selfie segmentatsiya modellari — Google, Apache-2.0.

## Yangi fon qo'shish

1. 1280×720 `webp` ni `public/meeting-bg/<id>.webp` ga, 320×180 nusxasini `public/meeting-bg/thumbs/<id>.webp` ga qo'ying.
2. `<id>` ni `lib/callBackground.ts` dagi `BG_IMAGES` ro'yxatiga qo'shing.
3. `call.bg.images.<id>` nomini `messages/uz.json`, `ru.json`, `en.json` ga qo'shing.
4. Rasm muallifini yuqoridagi jadvalga yozing.

## Tekshirilgan (2026-10-01, production backend, haqiqiy meeting, soxta kamera, GT 730)

- kuchli blur, rasm foni, tez almashtirish (har 600 ms), kamera o'chirib-yoqish — chiqish FPS kamera FPS'iga teng, asosiy oqim bloklari 0;
- "Yo'q" — kadrlar o'zgarmasdan o'tadi, FPS xom kamera bilan bir xil;
- saqlangan effekt meeting'ga kirishda avtomatik qo'llanadi, noto'g'ri "sekin qurilma" xabari chiqmaydi;
- desktop (1440) va telefon (390) ko'rinishlari, uz/ru/en matnlari.
