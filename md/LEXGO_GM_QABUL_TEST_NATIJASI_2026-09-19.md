# LexGo — GM qabul tekshiruvi, to'liq qayta test (2026-09-19)

**Asos:** `LexGo_GM_Qabul_tekshiruvi_v1.1 3.docx` — 9 bosqich, 101 vazifa, har biri "Talablar" + "Tekshirish qadamlari" + "Bajarilmagan belgisi" bilan.
**Oldingi natija:** `LEXGO_GM_QABUL_TEST_NATIJASI_2026-09-16.md` (3 kun oldin) — bu hujjat o'shandan beri nima o'zgarganini qayta tekshiradi, ustiga qo'shadi, ustidan yozmaydi.
**Muhit:** frontend `localhost:3120` (mahalliy `next dev`, push qilinmagan holat ham kiradi), **production backend** `lexgo.api.cognilabs.org` bilan ulangan. Staging yo'q.
**Qoida:** production'da real yozuv qoldiradigan oqimlar (buyurtma, to'lov, obuna xarid, sovg'a, shikoyat, baho) sinalmaydi — faqat sahifa/forma holati, mavjud yozuvlar va AI so'rovlar tekshiriladi.

Belgilar: ✅ o'tdi · ⚠️ qisman · ❌ bajarilmagan · 🔒 sinab bo'lmadi (akkaunt/yozuv kerak) · 🔧 shu sessiyada FE tomonda tuzatildi

---

## 0. Bu sessiyada topilib tuzatilgan xatolar

| # | Xato | Sabab | Tuzatildi |
|---|---|---|---|
| 1 | Mahalliy `next dev`da **hech qanday tugma ishlamadi** (login, parolni ko'rsatish — hammasi) | Next.js 16 `allowedDevOrigins` yo'q edi — `127.0.0.1` orqali kirilganda barcha `_next/static/chunks/*` **403** qaytargan, sahifa hech qachon hydrate bo'lmagan | `next.config.ts`ga `allowedDevOrigins: ["127.0.0.1","localhost"]` qo'shildi |

---

## 1. Mijoz (client) — sahifalar bo'yicha tezkor tekshiruv

20+ sahifa (Xizmatlar, Paketlar, Hujjatlar, Mening ishlarim, Obuna, Referal, Sovg'alar, Bildirishnomalar, Profil, Kafolat, Mos advokatlar, Sharhlar, Shikoyatlar, To'lovlar, Hujjat tahlili, SOS, Muammo tahlili, Xabarlar, Advokatlar, Akademiya) — hammasi xatosiz ochildi, JS exception yo'q.

## 2. T1-02 — LexGo.AI bepul limitlar

| Talab | Holat | Izoh |
|---|---|---|
| #6/#7 limitdan keyin taklif, oxirgi javob to'liq | ✅ | Mehmon rejimida darhol "Mehmonlar uchun bepul limit tugadi. Davom etish uchun telefon raqamingizni tasdiqlang." + "Telefonni tasdiqlab davom etish" tugmasi `/register`ga (to'g'ri, oldingi tuzatish ishlayapti) |
| #11 server-side, cookie tozalash tiklamaydi | ✅ | Fresh incognito-kontekst ham "limit tugagan" holatni ko'rsatdi (bugungi kvota boshqa test'lardan sarflangan edi) |
| Kabinetda "5 tadan N ishlatildi" hisoblagich (test-qadam #3) | ❌ | DOMda hech qanday limit/quota/usage elementi yo'q — frontendda ko'rsatadigan joy yo'q, chunki backendda `/clients/me/entitlements`/`GET /ai/usage` yo'q (allaqachon `LEXGO_BACKEND_MAJBURIY_ISHLAR` B2 #49/#50da qayd qilingan) | BE |
| #1 admin panelda limit modeli sozlanishi, #3 captcha, #4 mehmonga 3-savolda taklif (aniq matn), #8 issiq lid, #9 log | 🔒 | Admin/dasturchi ko'rsatishi kerak yoki bugungi kvota sarflanganligi sababli qayta hosil qilib bo'lmadi |

## 3. T1-06 — Katalog qidiruvi

| Talab | Holat | Izoh |
|---|---|---|
| Lotin/rus yozuv ("aliment") | ✅ | Ishlaydi |
| Rus-kirill ("алимент") | ✅ | Ishlaydi |
| O'zbek-kirill ("нафака") | ❌ | 0 natija |
| Imlo xatosiga chidamlilik ("ajrashuv"→"ajralish") | ❌ | 0 natija |

`app/[locale]/portal/client/services/page.tsx` avval server `/services/search`ni chaqiradi, muvaffaqiyatsiz bo'lsa nom/kod bo'yicha oddiy `.includes()` filtriga tushadi — na server, na fallback'da sinonim/fuzzy lug'at yo'q. Bu katta hajmli BE+FE funksiya (allaqachon `LEXGO_GM_v1.1_TAHLIL...`da T1-06 band sifatida qayd qilingan), shoshilinch soxta-tuzatish qilinmadi.

## 4. T1-03 — Obuna tariflari (mijoz)

| Talab | Holat |
|---|---|
| Muddat chegirmalari 3/6/12 oy −5/−10/−15% | ✅ (avvalgi 09-16 hisobotda −10%/12 oy noto'g'ri deb yozilgan edi — hozir to'g'ri) |
| Lite/Pro tariflar mijozga ko'rinadi | ✅ |
| Shaxsiy advokat obunasi (Standard/6 oy/1 yil) | ✅ ko'rinadi |

## 5. Advokat kabineti — keng sweep (2026-09-19)

14 ta sahifa (Boshqaruv paneli, Imkoniyatlar, Mening ishlarim, Kalendar, Mijozlar, Vazifalar, Xabarlar, Uchrashuvlar, Bildirishnomalar, Tashkilot, Ish maydoni, Sun'iy intellekt yordamchi, Profil, Referal, Targ'ibot, Paket tariflar) — hammasi xatosiz ochildi.

**09-17 tahlil hujjatida "yo'q" deb yozilgan, lekin hozir tekshirilsa ALLAQACHON qurilgan:**
- T1B-05 Conflict check: Mijozlar sahifasida "Conflict tekshiruvi" va "Yangi mijoz" tugmalari bor.
- T1B-06 AI ish vositalari: "Sun'iy intellekt yordamchi" sahifasida to'liq menyu — Ishni qisqacha bayon qil / Voqealar xronologiyasi / Hujjatlarni taqqosla / Ziddiyatlarni top / Yetishmayotgan hujjatlar / Muddatlarni ajrat / Savollar ro'yxati / Javob loyihasini tuz.
- T1B-04 Kalendar 5 turi: kodda (`CalendarPanel.tsx`) `hearing/investigative/meeting/filing_deadline/appeal_deadline` — hammasi bor, "Voqea qo'shish" modali jonli ochilib ishladi (TURI, NOMI, SANA/VAQT, MANZIL, ESLATMA maydonlari).
- T1-11 "Ish vaqtim": Profil sahifasida "Ish vaqtim va ta'til" bo'limi bor (kun/vaqt jadvali).

**Test qila olmagan (real buyurtma/mijoz yo'qligi sababli, production'da yaratilmadi):** shartnoma imzolash, milestone to'lov oqimi, real conflict check natijasi, AI ish vositalarining haqiqiy ishi (case tanlanishi kerak), uchrashuv/meeting oqimi. Test advokatida faol ish/mijoz yo'q ("0 ta ish", "Hozircha mijoz yo'q").

Yangi frontend xato topilmadi.

**T1B-04 Kalendar — to'liq uchidan-uchiga sinaldi (yaratish → o'chirish):** "Voqea qo'shish" modali orqali test voqea yaratildi (`201 POST /calendar-events`), kunlik katakchada va "Yaqinlashayotgan" ro'yxatida to'g'ri sana/vaqt bilan chiqdi, ICS yuklab olish tugmasi (`.calev__ical`) bor, o'chirish tasdiqlash oynasi bilan ishladi (`200 DELETE /calendar-events/{id}`) — test yozuv tozalandi.

Tashkilot (T1A-03), Vazifalar, Ish maydoni, Bildirishnomalar, Targ'ibot — hammasi ochildi, ma'lumot bor (bitta "PENDING" tashkilot, 2 ta vazifa, fayllar). Targ'ibot paketlaridan biri inglizcha nom bilan ("Regional boost - 30 days") — bu backend katalog ma'lumoti (tarjima FE muammosi emas, backend seed/admin kontenti).

