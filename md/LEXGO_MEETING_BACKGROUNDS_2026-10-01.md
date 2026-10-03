# LexGo — Meeting kamera foni: blur va virtual fonlar (v3, 2026-10-02)

Meeting paytida foydalanuvchi kamerasi uchun tanlaydi: **Yo'q**, **Yengil blur**, **Kuchli blur**, **6 ta fon rasmi** yoki **o'z rasmi**. Hammasi brauzerning o'zida (qurilmada) ishlanadi, serverga allaqachon ishlangan video ketadi. Backend o'zgarishi kerak emas.

## Tarix

| | v1 (`@livekit/track-processors`) | v2 (o'z dvigatelimiz) | v3 (sifat bosqichi) |
|---|---|---|---|
| Kuchli blur | 5 FPS, 650 ms gacha qotish | kamera FPS'iga teng | kamera FPS'iga teng |
| Odam chegarasi | binar niqob, zinapoya | 3×3 filtr: 5 px zinapoya, oq dog'lar, eski xona bo'laklari | guided filter: silliq va tiniq chegara |
| Harakatda | iz, miltillash | silliqlash eski niqobni 70% ushlab qolardi (iz) | harakat bor joyda eski niqob ishlatilmaydi |
| Fon rasmlari | — | ataylab xiralashtirilgan 1280×720 | tiniq 1600×900 |
| Effektni almashtirish | qotish | 260 ms | 150 ms, ko'rinishi p50 126 ms |

v3 ning sababi — haqiqiy harakatli kamerada (sinov uchun Xiph.org video-konferensiya kliplari) "xira", "piksellarga bo'linadi", "yuzning yarmi ko'rinmaydi", "tez harakatda sekin" shikoyatlari. Oldingi testlarda kamera o'rnida harakatsiz surat ishlatilgani uchun bu nuqsonlar ko'rinmagan.

## Qanday ishlaydi

- **Alohida Web Worker** (`lib/bgEngine/worker.ts`) barcha kadr ishini bajaradi. Asosiy oqim faqat oqimlarni ulaydi, shuning uchun interfeys videoni qotirmaydi (asosiy oqim bloklari 0).
- **Har kamera alohida pipeline'da** ishlaydi: bir vaqtda ikkita xona ochilsa ham bir-biriga xalaqit bermaydi.
- **Kadrlar yo'li:** Chrome/Edge/Android — `MediaStreamTrackProcessor` + `MediaStreamTrackGenerator` oqimlari worker'ga uzatiladi. Safari 18+ — kamera treki nusxasi worker'ga uzatiladi, u yerda standart `MediaStreamTrackProcessor` + `VideoTrackGenerator`.
- **Segmentatsiya:** MediaPipe `ImageSegmenter` (`@mediapipe/tasks-vision` 0.10.35), 16:9 kadrlar uchun landscape model (144×256), tik kadrlar uchun square model. Kirish sifatli kichraytiriladi. Ishga tushishda GPU va CPU o'lchanadi va qurilmaga tezrog'i tanlanadi.
- **Chegara (guided filter):** niqob statistikasi 256×144 da hisoblanadi (oyna 5×5, eps 0.002), chegara esa to'liq o'lchamdagi kamera rangi bo'yicha chiziladi, keyin `smoothstep(0.4, 0.6)`. Natija — zinapoyasiz, lekin tiniq chegara.
- **Vaqt bo'yicha silliqlash:** kamera tasviri o'zgarmagan joyda niqob kuchli silliqlanadi (miltillash ~45% kam), tasvir o'zgargan joyda (harakat) faqat joriy kadr niqobi ishlatiladi — iz qolmaydi.
- **Chegara rangini tozalash:** soch/shapka chetidagi pikselda eski fonning rangi ajratib olinadi, yangi fon ustida oq yoki rangli hoshiya chiqmaydi.
- **Blur:** faqat fon xiralashadi (odam ranglari fonga oqmaydi), dual-filter, yarim o'lchamdan boshlanadi.
- **Chiqish:** kompozitsiya PBO + fence orqali asinxron o'qiladi va encoder'ga CPU kadr beriladi (zaif GPU'larda Chrome'ning ~45 ms konvertatsiyasini chetlab o'tadi).
- **Moslashuv:** yuklama oshsa segmentatsiya har 2–3 kadrda bir bajariladi; bu ham yetmasa effekt o'chiriladi va "Qurilma tortolmayapti" xabari chiqadi.
- **Maxfiylik:**
  - saqlangan effekt bo'lsa, kamera fon tayyor bo'lgandan keyin e'lon qilinadi (qo'ng'iroqqa kirishning o'zi kutmaydi);
  - kamera o'chiq paytda tanlangan effekt ham kamera yoqilishidan oldin ulanadi;
  - ishlovda xato bo'lsa kadr tashlab yuboriladi, xom kamera kadri yuborilmaydi;
  - dvigatel butunlay ishdan chiqsagina (xabar bilan) oddiy kameraga qaytiladi.
- **Barqarorlik:** worker xatosi, GL konteksti yo'qolishi, chiqish to'xtab qolishi aniqlanadi; qo'ng'iroq yopilganda saqlangan effekt o'chmaydi va dvigatel qayta ishga tushmaydi.
- **Saqlash:** tanlangan effekt va foydalanuvchi rasmi akkaunt bo'yicha (`lexgo_call_bg:<user id>`, `lexgo_call_bg_custom:<user id>`); rasm uzun tomoni ≤1280 px, hech qayerga yuklanmaydi.

## Model cheklovlari (o'lchangan)

- Selfie modeli kameraga yon yoki orqa tomoni bilan turgan odamni deyarli ko'rmaydi; bosh to'liq burilganda yuzning bir qismi yo'qolishi mumkin.
- Barmoqlar keng ochilganda model ular orasidagi orqa fonni ham odamga qo'shib yuborishi mumkin.
- Google Meet ham shu modelni ishlatadi. Kuchliroq `selfie_multiclass_256x256` modeli bu kompyuterda kadr boshiga 125–250 ms oldi (7–12 FPS) — ishlatib bo'lmaydi.

## Brauzerlar

| Brauzer | Holat |
|---|---|
| Chrome, Edge, Opera, Yandex (desktop), Android Chrome | to'liq ishlaydi |
| Safari 18+ (macOS, iPhone/iPad) | standart API orqali ishlaydi; real qurilmada hali sinalmagan — xato bo'lsa kamera oddiy holatga qaytadi |
| Firefox, eski Safari, GPU'siz (dasturiy WebGL) qurilmalar | "Fon" tugmasi ko'rinmaydi; saqlangan effekt bo'lsa kamera yoqilganda bir marta xabar chiqadi |

## Fayllar

| Fayl | Vazifasi |
|---|---|
| `lib/bgEngine/worker.ts` | segmentatsiya, guided filter, kompozitsiya, readback, moslashuv (worker) |
| `lib/bgEngine/shaders.ts` | GLSL shaderlar (hammasi `highp`) |
| `lib/bgEngine/engine.ts` | brauzer imkoniyatlari, worker boshqaruvi, LiveKit `TrackProcessor` |
| `lib/bgEngine/protocol.ts` | worker xabarlari turlari |
| `lib/callBackground.ts` | effekt holati, saqlash, o'z rasmi, dvigatelni kameraga ulash |
| `components/chat/CallBackgroundPicker.tsx` | fon tanlash paneli |
| `components/chat/CallRoom.tsx` | "Fon" tugmasi, kamerani fon bilan yoqish, `capSender` FPS |
| `app/globals.css` | `.mtg__bg*` stillari |
| `messages/{uz,ru,en}.json` | `call.bg.*` matnlari |
| `scripts/copy-mediapipe.mjs` | MediaPipe wasm'ni `public/mediapipe/wasm/<versiya>/` ga ko'chiradi (`predev`/`prebuild`) |
| `next.config.ts` | `MEDIAPIPE_VERSION` va kesh sarlavhalari |
| `public/mediapipe/models/` | `selfie_segmenter_landscape.tflite`, `selfie_segmenter.tflite` (Apache-2.0) |
| `public/meeting-bg/` | 6 ta fon (1600×900) va `thumbs/` (320×180) |

`public/mediapipe/wasm/` git'da saqlanmaydi (~22 MB): `npm run dev` va `npm run build` uni o'zi yaratadi. Deploy `next build`ni to'g'ridan-to'g'ri chaqirsa, avval `node scripts/copy-mediapipe.mjs` ishga tushirilsin; aks holda dvigatel jsDelivr/Google Storage'dagi xuddi shu versiyadan yuklaydi.

MediaPipe **0.10.35** ataylab tanlangan: 1.0.x versiyalari har 60 soniyada Google serveriga foydalanish statistikasini yuboradi (telemetriya), bu huquqiy platforma uchun nomaqbul.

## Fon rasmlari va litsenziyalar

Fotosuratlar [Unsplash](https://unsplash.com) dan, [Unsplash License](https://unsplash.com/license) asosida (tijoriy va notijoriy foydalanish bepul, ruxsat shart emas; rasmlarni o'zgartirmasdan sotish yoki ulardan raqobatchi xizmat tuzish mumkin emas). Hammasi 1600×900 ga kesilgan, xiralashtirilmagan (webp, sifat 86).

| Fayl | Nomi | Muallif | Manba |
|---|---|---|---|
| `law-library.webp` | Huquqiy kutubxona | Lina Bob | https://unsplash.com/photos/Xfa7Pte_7YU |
| `advocate-office.webp` | Advokat kabineti | Gian Paolo Aliatis | https://unsplash.com/photos/EJSNrTzz6xk |
| `modern-office.webp` | Zamonaviy ofis | Nastuh Abootalebi | https://unsplash.com/photos/oa1IiRUHCAM |
| `calm-home.webp` | Uy | Alexandra Gorn | https://unsplash.com/photos/JIUjvqe2ZHg |
| `tashkent.webp` | Toshkent | Sarvar Samigov | https://unsplash.com/photos/eK7Q7phvASI |
| `blue-wall.webp` | Ko'k devor | engin akyurt | https://unsplash.com/photos/BawjznQ3Q8U |

Tanlov mezonlari: boshning orqasi tinch, ko'z darajasidagi gorizont, bir tekis yorug'lik, odam va matn yo'q, 16:9 va telefonning 3:4 kesimida ham yaxshi.

Boshqa komponentlar: `@mediapipe/tasks-vision` va selfie segmentatsiya modellari — Google, Apache-2.0.

## Yangi fon qo'shish

1. 1600×900 `webp` ni `public/meeting-bg/<id>.webp` ga, 320×180 nusxasini `public/meeting-bg/thumbs/<id>.webp` ga qo'ying. Rasmni xiralashtirmang.
2. `<id>` ni `lib/callBackground.ts` dagi `BG_IMAGES` ro'yxatiga qo'shing.
3. `call.bg.images.<id>` nomini `messages/uz.json`, `ru.json`, `en.json` ga qo'shing.
4. Rasm muallifini yuqoridagi jadvalga yozing.

## Tekshirilgan (2026-10-02/03, i5-12400F + GeForce GT 730, Edge)

- **Bir xil kadrlarda solishtirish (lab):** harakatli Xiph.org kliplari (vidyo4, Johnny, KristenAndSara) — shapka/yelka chegarasidagi zinapoya va oq dog'lar yo'qoldi, harakatsiz klipda niqob miltillashi ~45% kam, tez qo'l harakatida iz yo'q.
- **FPS:** uchrashuvda kamera 24 FPS beradi (ilova "high" profilida 960×540@24 so'raydi), chiqish 23–24 FPS; lab'da 30 FPS manba bilan chiqish 29–30 FPS — dvigatel FPS'ni cheklamaydi.
- **Dvigatelning 10 daqiqalik stress testi:** 165 ta effekt almashinuvi (ko'rinishi p50 126 ms, p95 181 ms), 30+ marta kamera o'chirish-yoqish, 11 marta processor qayta yaratish, ikki kamera bir vaqtda, kamera o'chiq paytda ulanish — xato 0, qora kadr 0, worker xotirasi 5→5 MB, worker soni doim 1.
- **Ikki ishtirokchili real uchrashuv** (superadmin + client, production backend): saqlangan effekt bilan kirishda va kamera o'chiq paytda fon tanlab yoqishda WebRTC'ga xom kamera kadri 0 marta yuborildi; client 960×540 ~23 FPS ko'rdi; tab yashirilganda ham video to'xtamadi.
