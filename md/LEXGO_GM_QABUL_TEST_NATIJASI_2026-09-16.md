# LexGo — GM qabul tekshiruvi bo'yicha to'liq test natijasi

**Sana:** 2026-09-16
**Asos:** "LexGo_GM_Qabul_tekshiruvi.docx" — 9 bosqich, 101 vazifa. Har vazifa hujjatdagi "Qadamlar", "Ko'rishingiz kerak" va "Bajarilmagan belgisi" bo'yicha tekshirildi.

## Qanday tekshirildi
- **Muhit:** Chrome'da frontend'ning oxirgi (push qilinmagan) build'i ochildi, u production backend'ga ulangan (`lexgo.api.cognilabs.org`, backend commit `06f40e0`). GM hujjati staging uchun yozilgan, staging manzili berilmagan.
- **Akkauntlar:**
  - tizimga kirmagan foydalanuvchi (inkognito oyna);
  - Client;
  - Superadmin, Admin;
  - Advokat (tasdiqlanmagan);
  - Sales operator, Call-center lawyer.
- **Yozuvlar:** production'da yozuv qoldirmaslik uchun buyurtma, to'lov, imzo, shikoyat, baho, rol yoki xizmat yaratilmadi. Faqat GM'dagi test savollari AI'ga yuborildi: anonim 3 ta, mijoz chatida 6 ta, "Muammo tahlili"da 3 ta. Hujjat tahlili narxi so'raldi.
- **Oxirigacha o'tib bo'lmaganlar:**
  - production'da demo to'lov yopiq (404), shuning uchun to'lov, obuna va paket xaridi bor oqimlar sinalmadi;
  - tasdiqlangan advokat akkaunti yo'q;
  - moliya, moderator, sifat nazorati, sales head akkauntlari yo'q;
  - ro'yxatdan o'tish uchun yangi telefon raqami yo'q.

Belgilar:
- ✅ GM mezonidan o'tdi
- ⚠️ qisman
- ❌ bajarilmagan (GM "bajarilmagan belgisi" ko'rindi yoki funksiya yo'q)
- 🔒 sinab bo'lmadi (akkaunt, staging yoki provayder yo'q)
- ❓ dasturchi ko'rsatadi yoki hujjat

Mas'ul: **FE** frontend · **BE** backend · **Akk** test akkaunt kerak · **Stg** staging kerak · **Dev** dasturchi ko'rsatadi.

---

## 1. Umumiy natija

| Bosqich | Vazifa | ✅ | ⚠️ | ❌ | 🔒 | ❓ |
|---|---|---|---|---|---|---|
| 0 — Baza, xavfsizlik | 20 | 6 | 5 | 5 | 0 | 4 |
| 1A — Asosiy oqim | 26 | 1 | 7 | 10 | 8 | 0 |
| 1B — Paketlar, SOS, B2B | 10 | 0 | 1 | 7 | 2 | 0 |
| 2 — Advokat kabineti | 9 | 0 | 1 | 4 | 4 | 0 |
| 3 — Admin | 13 | 0 | 5 | 7 | 0 | 1 |
| 4 — Kol-markaz, CRM | 8 | 0 | 4 | 3 | 1 | 0 |
| 5 — Obuna, sovg'a, referal | 7 | 1 | 5 | 0 | 1 | 0 |
| 6 — Mobil ilova | 5 | 0 | 0 | 5 | 0 | 0 |
| 7 — Akademiya, reklama | 3 | 0 | 0 | 2 | 1 | 0 |
| **Jami** | **101** | **8** | **28** | **43** | **17** | **5** |

GM hujjati bo'yicha 6- va 7-bosqichlar keyinroq boshlanadi ("monetizatsiya shartlari bajarilganda"). Hozir qabulga birinchi navbatda **0 va 1A** kiradi. Ularda 46 vazifadan 7 tasi ✅.

## 2. Bosqichni to'xtatadigan eng muhim muammolar

| # | Muammo | Task | Mas'ul |
|---|---|---|---|
| 1 | Superadmin, Admin va Sales operator 2FA kodisiz kiradi | T0-05 | BE |
| 2 | Production'da hamma foydalanuvchining OTP kodi (parol tiklash kodi ham) umumiy Telegram test chatiga ketadi | T0-02 | BE |
| 3 | AI javoblarida manba yo'q: "rasmiy manbalarni qidirishda texnik muammo yuz berdi" chiqadi, modda va sana yo'q, "Mars" savoliga ishonch bilan javob beradi | T1-04 | BE |
| 4 | Oddiy va aniq savolga bir xil 3 ta taklif | T1-05 | BE |
| 5 | Katalog: 35 ta "oila" (GM'da 17), test kategoriyalari, "guruh" darajasi yo'q, "Tez kunda" yo'q, xato yozuv va sinonim topilmaydi | T0-07, T1-06 | BE + FE |
| 6 | 57 advokatdan 38 tasida narx "—", "Demo Yurist", "Test Yurist" nomlari | T0-07 | BE |
| 7 | Anonim AI 3-savolda telefon tasdig'ini so'ramaydi (limit 5, GM'da 2), limit kodda | T1-01, T1-02 | BE + FE |
| 8 | Mijozga Free/Lite/Pro ko'rinmaydi, 12 oylik chegirma −10% (GM'da −15%) | T1-03 | BE |
| 9 | Shablon: bosqichli wizard, DOCX, oyiga 3 ta limit, kolontitul yo'q, maydonlar inglizcha ("CLAIMANT") | T1-14 | FE + BE |
| 10 | Test hisobotlari (T1-18, T1B-10) va hosting rejasi (T0-19) yo'q | T1-18, T0-19 | Dev |

## 3. Test paytida tuzatilgan frontend xatolari
Hammasi build'da tekshirildi, lekin hali **push qilinmagan**.

| Xato | Task | Holat |
|---|---|---|
| "Rollar va ruxsatlar" → matritsada ruxsat nomi o'rniga "[object Object]", katakchalarda belgi yo'q | T0-06, T3-07 | ✅ 158 belgi va ruxsat nomlari chiqadi |
| Production'da admin bosh sahifasida "Demo ma'lumot" (seed) tugmasi va "Test OTP" menyusi bor edi | T0-01 | ✅ Faqat demo API ochiq muhitda ko'rinadi |
| "Bootstrap" sahifasi sales operator va call-center xodimiga URL orqali ochilardi | T0-06 | ✅ O'z sahifasiga qaytaradi |
| Xizmat pasporti: "3 kun kun", tarjimasiz "yurist_advokat", "online", "standard" | T1-07 | ✅ "3 kun", "Yurist yoki advokat", "Onlayn", "Standart" |
| Akademiya kategoriyalari "collection", "business" | T7-02 | ✅ "Qarz undirish", "Biznes" |
| AI xulosasi obyekt bo'lib kelganda "[object Object]" chiqishi mumkin edi | T1-04 | ✅ |
| E2E sahifasi yangi holatlarni ("verified", "needs_verification") tanimasdi | T1-18 | ✅ |
| Tasdiqlangan har advokatga "Super advokat" belgisi chiqardi | T0-10 | ✅ "Tasdiqlangan" |

---

## 4. Bosqichlar bo'yicha batafsil

### 0-bosqich — Baza, xavfsizlik va test-ma'lumotlar

| Task | Nomi | Holat | Testda nima ko'rildi | Mas'ul |
|---|---|---|---|---|
| T0-01 | Muhitlarni ajratish | ✅ | Production'da `/admin/demo-data/seed`, `/payments/demo-pay`, `/orders/demo-purchase`, `demo-confirm` — hammasi **404**. Seed tugmasi va Test OTP menyusi yashirildi (push kutyapti). Staging taqqoslanmadi | — |
| T0-02 | OTP qoidalari | ❌ | ✅ Kod ekranda va URL'da yo'q, 60 soniyalik taymer bor. ❌ Kodlar umumiy Telegram test chatiga ketyapti: test paytida boshqa raqamlarning kodi keldi. "3 xato → 15 daqiqa" yangi raqam yo'qligi uchun sinalmadi | BE |
| T0-03 | Texnik hujjatlarni yopish | ✅ | `/docs`, `/openapi.json`, `/redoc` — 404. `/admin/openapi.json` loginsiz 401, superadmin uchun 200 | — |
| T0-04 | Parolni tiklash | ✅ | "Parolni unutdingizmi?" havolasi bor, telefon → "Kod olish" sahifasi ochiladi. Test akkaunt paroli o'zgarmasin deb oxirigacha o'tilmadi | — |
| T0-05 | 2FA va sessiya | ❌ | Advokat, Yurist, Call-center lawyer'dan kod so'raldi. **Superadmin, Admin, Sales operator — kodsiz.** Sabab: backend 2FA'ni `user.role != client` bo'yicha so'raydi. 2 soatlik avto-chiqish ham admin'larga ishlamaydi | BE |
| T0-06 | Rollar va ruxsatlar | ⚠️ | ✅ Sales operator `/admin/roles`ni ocholmaydi. ✅ Call-center menyusida navbat va namunalar bor, to'lov va rollar yo'q. ✅ Admin'da "Rollar" menyusi yo'q (o'ziga rol bera olmaydi). ✅ "Qo'shish" (rol yaratish) formasi bor, production'da rol yaratilmadi. ❌ Rollar **22 ta**: `super_admin` va `superadmin`, `sales` va `sales_operator` takrorlanadi. ❌ Ruxsat nomlari inglizcha | BE |
| T0-07 | Test-ma'lumotlar | ❌ | Katalogda **35 ta** oila: "Gift Cat", "Test", "Test category" (2 marta), bo'sh oilalar, `FX-*` fixture xizmatlar. Advokatlar: **57 tadan 38 tasida narx "—"**, "Demo Yurist 1–5", "Test Yurist". ✅ Shablonlar 10 ta. ❌ Paketlar sahifasi yo'q. ✅ Rejalar bor, lekin Free/Lite/Pro mijozga ko'rinmaydi | BE (+FE paketlar) |
| T0-08 | Bildirishnoma kaskadi | ❌ | Admin → Bildirishnomalar'da faqat "Bildirishnoma yuborish" formasi bor. Hodisalar ro'yxati, kanal tartibi va matn tahriri yo'q | FE + BE |
| T0-09 | To'lov abstraksiyasi | ❓ | Webhook route bor (imzosiz so'rovga 401). Integratsiyalarda "Payment Mode — Ulangan". Interfeys va takroriy webhookni backendchi ko'rsatishi kerak | Dev |
| T0-10 | MyID abstraksiyasi | ⚠️ | Profilda "OneID" va "MyID" tugmalari bor, Integratsiyalarda "Sozlanmagan". Advokat profilida `identity_verified` belgisi va sanasi, "tasdiqlanmaganni ko'rsatish" sozlamasi topilmadi | Dev + FE |
| T0-11 | Audit jurnali | ✅ | 766 yozuv, filtrlar (foydalanuvchi, harakat, obyekt, sana), CSV eksport, o'chirish tugmasi yo'q. Fayl harakatlari yoziladi: `payment_receipt_download`, `workspace_upload`, `ai_document_analysis_file` | — |
| T0-12 | Brauzer xatolari | ✅ | 7 rolda 200 ga yaqin sahifa ochildi, JS xato yo'q | — |
| T0-13 | Telefonda ko'rinish | ✅ | 390 px kenglikda 7 rolning ~40 ta asosiy sahifasida gorizontal skroll yo'q | — |
| T0-14 | Integratsiyalar holati | ⚠️ | ✅ Payme, Click, SMS, Email, Push, API Docs, MyID — "Sozlanmagan". ❌ PostgreSQL, Veb-sayt API, Mobil API, Payment Mode "Ulangan" deb turadi (tashqi integratsiya emas). ❌ "Test" tugmasi yo'q | BE + FE |
| T0-15 | Telegram bot | ❓ | Profilda "Telegramni ulash" bor, voronkada "Telegram" manbali lidlar bor. Ulashni sizning Telegram'ingiz bilan sinash kerak. Kodlar umumiy chatga ketayotgani uchun "kod botga keldi" hozir dalil emas | Siz |
| T0-16 | Pul tiyinda | ❓ | Summalar butun son (583 048, 747 500). Bazani backendchi ko'rsatadi | Dev |
| T0-17 | PII niqoblash | ❓ | AI chat ostida "telefon, email, JShShIR, pasport yashiriladi" yozuvi bor. Logni backendchi ko'rsatadi | Dev |
| T0-18 | Huquqiy hujjatlar | ⚠️ | ✅ Ro'yxatdan o'tishda **8 ta alohida galochka**. ✅ Admin kirishida rozilik oynasi. ❌ Admin → "Huquqiy hujjatlar" (matn tahriri) yo'q, backend'da ham API yo'q. ❌ Admin → "Roziliklar" jurnali ekrani yo'q, backend'da 91 yozuv bor | FE + BE |
| T0-19 | Hosting rejasi | ❌ | Hujjat berilmagan | Dev |
| T0-20 | Ish vaqti kalendari | ⚠️ | ✅ "Hozir ish vaqti emas · Du–Sh 09:00–19:00" belgisi. ✅ Backend'da bayramlar API'si bor. ❌ Admin → "Ish vaqti va bayramlar" ekrani yo'q. ❌ Buyurtmada "javob muddati ertaga 09:30 gacha" yo'q | FE + BE |

### 1A-bosqich — Asosiy oqim

| Task | Nomi | Holat | Testda nima ko'rildi | Mas'ul |
|---|---|---|---|---|
| T1-01 | Ro'yxatdan o'tish | ⚠️ | ✅ Hudud majburiy, roziliklar alohida. ❌ Anonim foydalanuvchi 3-savolga ham javob oldi, "telefonni tasdiqlang" chiqmadi. 🔒 Tarixni akkauntga ulash yangi raqam bilan sinalmadi | BE + FE |
| T1-02 | AI bepul limitlar | ❌ | ✅ Ro'yxatli mijoz 5 ta javob oldi, 6-savolda "Oylik limit tugadi (5/5) · Tarifni yangilash". ❌ 5-javobda "bu oxirgi bepul savolingiz" yo'q. ❌ Anonim limit 5 (GM: 2). ❌ Limit `config.py` da, admin sozlamasi yo'q | BE + FE |
| T1-03 | AI obunasi | ❌ | Mijoz "Obuna"sida faqat Shaxsiy advokat Standard/Premium. **Lite 49 000 / Pro 99 000 mijozga ko'rinmaydi.** 12 oy −10% (GM: −15%), 6 oy −5%. Kabinetda hisoblagich yo'q. Demo xarid production'da yopiq | BE |
| T1-04 | AI manba, disclaimer | ❌ | AI chatdagi 5 javobning birortasida manba yo'q. Anonim chatda "rasmiy manbalarni qidirishda texnik muammo". "Marsda mulk" savoliga ishonch bilan javob berdi. ✅ Disclaimer yopilmaydi. ✅ "Muammo tahlili"da "Foydali/Foydasiz" va "manba topilmadi" ogohlantirishi bor. ❌ Admin → AI manbalari (PDF yuklash) yo'q | BE (+FE admin) |
| T1-05 | 3 darajali taklif | ❌ | "Aliment qanday hisoblanadi?" (oddiy) va "Erim aliment to'lamayapti… Samarqanddaman" (aniq) savollarining ikkalasiga **bir xil 3 ta xizmat** chiqdi: Nikoh shartnomasi, Vasiylik, Aliment. ✅ "Meni hozir hibsga olishdi" → qizil blok yuqorida, raqam bilan. ✅ Lid yaratiladi. ❌ Admin → AI taklif sozlamalari yo'q | BE |
| T1-06 | Katalog va qidiruv | ❌ | 35 oila → xizmat (2 daraja, guruh yo'q), "Tez kunda" yo'q. Qidiruv: "алимент" ✅, "aliment" ✅, **"alment" (xato) ❌, "bola puli" (sinonim) ❌**. Admin xizmat formasida guruhga ko'chirish va oilani ochish yo'q | BE + FE |
| T1-07 | Xizmat pasporti | ⚠️ | ✅ Kod, yo'nalish, ijrochi, format, muddat, narx, kerakli hujjatlar (formatlash tuzatildi). ❌ Bosqichlar (milestone), kafolat, "natijada nima olasiz" yo'q. ❌ "Yangi xizmat" formasida faqat kategoriya, nom, slug, tavsif, narx, daqiqa — pasport maydonlari va tekshiruv yo'q | BE + FE |
| T1-08 | Narxlash | ⚠️ | ✅ Narx yoyilmasi: asosiy narx, hudud ×, tajriba +20%, super +30%; komissiya ko'rinmaydi. ✅ Backend Xorazm uchun ×0,78 (747 500 → 583 048). ❌ **Mijoz profilida hudud maydoni yo'q**, shuning uchun hudud doim ×1. 🔒 Advokat narxini 50% past qo'yish sinalmadi | FE + BE |
| T1-09 | Advokat saralash | ❌ | Filtrlar: yo'nalish, advokat/yurist, hudud, saralash. **Narx, reyting, til, jins, onlayn filtri yo'q.** "Yangi" belgisi yo'q. Admin → Matching sozlamalari yo'q. Auto rejim sinalmadi | FE + BE |
| T1-10 | Buyurtma oqimi | 🔒 | Tasdiqlangan advokat yo'q, to'lov production'da yopiq. Admin'da buyurtma va status tarixi sahifasi yo'q (backend `/orders/{id}/status-history` bor) | Akk + Stg (+FE admin) |
| T1A-01 | 30/40/30 to'lov | 🔒 | Mijozda "To'lov bosqichlari" 30/40/30 ko'rinadi. "To'langan" buyurtmada bosqichlar "To'lov kutilmoqda" (backend xatosi). Admin → To'lovlar'da "Umumiy summa · Komissiyalar" bor. Demo to'lov production'da yopiq | Stg + BE |
| T1A-02 | Advokat onboarding | ⚠️ | ✅ Kabinetda 5 qadamli ro'yxat, hujjat yuklash, "Tekshiruvga yuborish", "Admin tasdig'ini kutmoqda" banneri. ❌ Ro'yxatdan o'tish 3 bosqichli (shaxsiy, kasbiy, tekshiruv): selfi, til, ish vaqti, narx qadami yo'q. ❌ Profil 60% bo'lsa ham "0/5". 🔒 Tugallanmagan onboarding'dan lid yaratilishi sinalmadi | FE + BE |
| T1A-03 | Tuzilma gate | 🔒 | Tasdiqlanmagan advokatda "Tashkilot" sahifasi qulflangan, buyurtma yo'q | Akk |
| T1-11 | Advokat kabineti | ❌ | Tasdiqlanmagan advokatda 14 bo'limdan 11 tasi qulflangan. **"Ta'tildaman" rejimi kodda umuman yo'q.** "Ko'rsatkichlarim (javob foizi)" alohida yo'q | FE + Akk |
| T1-12 | Kol-markaz navbati | 🔒 | Call-markazda "Navbat" bor, lekin bo'sh. 60 daqiqa SLA va avto-qaytarish buyurtmasiz sinalmadi | Stg |
| T1-13 | Mening ishlarim va cheklar | ⚠️ | ✅ Buyurtma 5 bosqichli progress bilan, to'lov bosqichlari. ✅ Kvitansiya PDF (200, 23 KB), `/receipt/verify` ishlaydi. QR skanerini telefonda o'zingiz tekshiring | — |
| T1-14 | Shablon → hujjat | ❌ | ✅ 10 shablon. ❌ Forma bitta ekran, maydonlar **inglizcha** ("CLAIMANT", "DEFENDANT", "CLAIM", "EVIDENCE"). Progress, saqlash, AI to'ldirish, DOCX, oyiga 3 ta limit va kolontitul yo'q. Ro'yxatsiz foydalanuvchi shablonni ko'ra olmaydi (login'ga yuboradi) | FE + BE |
| T1-15 | Hujjat tahlili | ⚠️ | ✅ Narx sahifaga qarab: 3 sahifa 149 000, 10 sahifa 299 000, 20 sahifa 499 000. ✅ Fayl yuklash, "Advokat tomonidan tekshiruv" taklifi. ❌ Natija 3 bo'limda (6 emas), fayl tahlilini AI qilmaydi | BE |
| T1-16 | Baholash | 🔒 | Yakunlangan buyurtma yo'q. "Baholash va sharhlar" va admin "Sharh moderatsiyasi" sahifalari bor | Stg |
| T1-17 | Bildirishnomalar oqimda | 🔒 | Buyurtma oqimi kerak. Bildirishnomalar sahifasi va kanal sozlamalari bor | Stg |
| T1A-04 | Shartnoma | 🔒 | Shartnomalar 0 ta. Imzolash ekrani kodda bor | Stg |
| T1A-05 | Lid qabul qilish | ❌ | ✅ Lidlarda manba bor. ❌ UTM, sahifa, qurilma, shahar, AI tarixi ustunlari yo'q: frontend UTM'ni saqlamaydi, backend'da maydon yo'q. ❌ Eski 411 ta login lidi — dublikatlar | FE + BE |
| T1A-06 | Advokatni almashtirish | ⚠️ | ✅ "Kafolat" → "Advokatni almashtirish" formasi va so'rovlar ro'yxati. 🔒 48 soat avto-taklif, AI xulosa, hujjatlar ajratilishi buyurtmasiz sinalmadi | Stg |
| T1A-07 | Aylanib o'tishga qarshi | 🔒 | To'lovgacha chat xonasi yo'q. Admin → "Kontakt urinishlari hisoboti" yo'q | Stg + FE |
| T1A-08 | Referal kodi | ✅ | Kod, havola, QR, "Nusxa olish" va "Ulashish" bor. `?ref=` havolasi saqlanadi. Admin'da `referred_by` ko'rinishi yo'q | — (FE admin tavsiya) |
| T1-18 | E2E ssenariylar | ❌ | "E2E tayyorlik" sahifasi 6 ssenariyni "Sinalgan" deb ko'rsatadi, lekin bu faqat bazada to'lov yoki chat borligini bildiradi. **Test hisoboti yo'q** | Dev |

### 1B-bosqich — Paketlar, ish vositalari, B2B, SOS

| Task | Nomi | Holat | Testda nima ko'rildi | Mas'ul |
|---|---|---|---|---|
| T1B-01 | Paketlar — sotuv | ❌ | Backend'da 75 ta paket bor (`/service-packages`), **mijozda "Paketlar" sahifasi yo'q** | FE |
| T1B-02 | Paket konstruktori | ❌ | Admin'da paketlar bo'limi yo'q | FE + BE |
| T1B-03 | Keys papkasi | 🔒 | Advokat "Ish maydoni" qulflangan. Kodda fayl yuklash va versiyalar bor. .exe va 50 MB cheklovi sinalmadi | Akk |
| T1B-04 | Kalendar va muddatlar | ❌ | Kalendar qulflangan. Muddat kalkulyatori va iCal eksport kodda yo'q | FE |
| T1B-05 | Conflict check | ❌ | Backend `/conflicts/check` bor, frontend'da ishlatilmaydi. "Qarshi tomon" maydoni yo'q | FE |
| T1B-06 | AI ish vositalari | 🔒 | "Sun'iy intellekt yordamchi" qulflangan. "Ikki hujjatni taqqoslash" kodda yo'q | Akk + FE |
| T1B-07 | B2B minimal | ❌ | Ro'yxatdan o'tishda faqat Mijoz, Yurist, Advokat — **yuridik shaxs turi (STIR, direktor) yo'q**, QQS va hisob-faktura yo'q | FE + BE |
| T1B-08 | SOS | ⚠️ | ✅ SOS sahifasi: 6 vaziyat tugmasi (hibs, politsiya, sud, tintuv, shartnoma, boshqa), izoh, navbatchi raqam. ❌ Obunasizga "349 000 yoki obuna" chiqmaydi. ❌ Ovozli xabar, GPS, xarita yo'q. 🔒 Operator va push oqimi | FE + BE |
| T1B-09 | Shablon konstruktori | ❌ | "Yangi namuna" formasida faqat nom, slug, kategoriya, til, tavsif, matn. **DOCX yuklash va maydonlarni avtomatik topish yo'q**, ZIP yo'q | FE + BE |
| T1B-10 | E2E (1B) | ❌ | Hisobot yo'q | Dev |

### 2-bosqich — Advokat / Yurist kabineti

| Task | Nomi | Holat | Testda nima ko'rildi | Mas'ul |
|---|---|---|---|---|
| T2-01 | Dashboard va balans | 🔒 | Tasdiqlanmagan advokatda: onboarding, "Hisob holati", "Obro' va reyting". "Bugun", "Moliya", "Yangi keyslar", balans vidjeti ko'rinmaydi | Akk |
| T2-02 | Xizmatlar va narx | 🔒 | Advokat profilida "Mening xizmatlarim — 0". Narx oralig'i va 60% rad etilishi sinalmadi | Akk |
| T2-03 | G'alaba statistikasi | ❌ | Profilda faqat "Tasdiqlash so'rash". "G'alaba qo'shish", redact eslatmasi, 5 ishdan kam bo'lsa foizni yashirish yo'q | FE + BE |
| T2-04 | Reyting ko'rinishi | ⚠️ | "Obro' va reyting" bloki bor. 5 omil, grafik va Super advokat mezonlari yo'q | FE |
| T2-06 | Payout | ❌ | Backend `/payouts/me` 1 yozuv qaytaradi, **advokatda payout sahifasi yo'q**. Finance akkaunti yo'q | FE + Akk |
| T2-08 | Referal (advokat) | ❌ | Backend `/referrals/me` bor, advokat kabinetida referal va progress yo'q | FE |
| T2-09 | Video va AI xulosa | 🔒 | "Uchrashuvlar" va video qo'ng'iroq bor. AI xulosa oqimi buyurtmasiz sinalmadi | Stg |
| T2-10 | Rad etish sabablari | ❌ | Kodda `declineOrder` sababsiz yuboradi. Admin statistikasi yo'q | FE + BE |
| T2-11 | Yurist cheklovlari | 🔒 | "LexGo Yurist" akkaunti backend'da **advokat** | Akk |

### 3-bosqich — Admin va Superadmin

| Task | Nomi | Holat | Testda nima ko'rildi | Mas'ul |
|---|---|---|---|---|
| T3-01 | Tekshiruv workflow | ❌ | "Advokatlarni tasdiqlash"da faqat "Tasdiqlash" tugmasi. Reestr dalili, rad sabablari, qora ro'yxat, qayta tekshiruv sanasi yo'q | FE + BE |
| T3-02 | Excel import | ❌ | Yo'q | FE + BE |
| T3-03 | Narx qoidalari | ❌ | Admin ekrani yo'q, koeffitsientlar kodda | FE + BE |
| T3-05 | Obuna konstruktori | ⚠️ | ✅ "Yangi reja": nom, slug, tavsif, oylik narx, imkoniyatlar, sovg'a, faol. ❌ Limitlar (konsultatsiya soni), chegirmalar, oila, avtouzaytirish maydonlari yo'q | FE + BE |
| T3-06 | Nizolar | ❌ | "Sifat nazorati"da shikoyatlar ro'yxati ("sssss", "e2e") bor, lekin amal, taymer, to'lovni to'xtatish, qaytarish yo'q | FE + BE |
| T3-07 | Rollar UI | ⚠️ | ✅ Matritsa (tuzatildi), "Rol biriktirish". ❌ Matritsa faqat ko'rish uchun, ruxsatni belgilab o'zgartirib bo'lmaydi | FE |
| T3-08 | KPI paneli | ⚠️ | ✅ "Umumiy" va "CEO paneli" tugmasiz ochiladi: daromad, voronka, kanallar, KPI, sovg'a KPI, sana filtri. ❌ Formula ko'rsatilmaydi, eksport yo'q. "Bugun (real-time)" va yunit-iqtisodiyot bo'limlari to'liq emas | FE + BE |
| T3-09 | Sharhlar moderatsiyasi | ⚠️ | Sahifa bor, navbat bo'sh. Qoidalar sinalmadi | Stg |
| T3-10 | Audit ko'rinishi | ⚠️ | ✅ Filtrlar, CSV eksport, eksport jurnalga yoziladi (`audit_export`). ❌ Anomaliya ogohlantirishlari ekranda yo'q (backend `/admin/security-events` 21 yozuv) | FE |
| T3-11 | Integratsiyalar sahifasi | ❌ | Kalit maydoni va "Test" tugmasi yo'q | FE + BE |
| T3-12 | Reyting hisoblash | ❓ | Backendchi ko'rsatadi. Katalogda "Demo" advokatlar 5.0 bilan tepada, "Yangi" belgisi yo'q | Dev |
| T3-13 | Reestr tekshiruvi | ❌ | Yo'q | FE + BE |
| T3-14 | Paket analitikasi | ❌ | Yo'q | FE + BE |

### 4-bosqich — Kol-markaz va CRM

| Task | Nomi | Holat | Testda nima ko'rildi | Mas'ul |
|---|---|---|---|---|
| T4-01 | Navbatchi yurist ish stoli | ⚠️ | ✅ Call-markaz: navbat, lidlar doskasi, mijoz qidirish, so'nggi qo'ng'iroqlar. ❌ Faol chatlar (maks. 3), namunaviy javoblar paneli, AI, smenalar, yurist KPI yo'q | FE + BE |
| T4-02 | Operator ish stoli | ⚠️ | ✅ Kanban va jadval. ✅ Lid kartasi: bosqich, ma'lumot, qo'ng'iroq yozish, izoh, eslatma, tarix. ❌ Avto-taqsimlash, 360 (backend `/admin/clients/{id}/360` bor), "Buyurtmaga aylantirish" va to'lov havolasi, majburiy yo'qotish sababi, eskalatsiya yo'q | FE + BE |
| T4-03 | Skriptlar | ❌ | Yo'q | FE + BE |
| T4-04 | IP-telefoniya | 🔒 | Provayder ulanmagan. ✅ Qo'lda qo'ng'iroq logi bor | Provayder |
| T4-05 | Lid skoringi | ❌ | Lidda `score` bor, lekin skoring qoidalari ekrani yo'q | FE + BE |
| T4-06 | Upsell | ⚠️ | "Ushlab qolish": xavf ostidagi mijozlar va upsell tavsiyalari. "Rad etdi" belgilash sinalmadi (ro'yxat bo'sh) | Stg |
| T4-07 | Vaqt tarifli konsultatsiya | ❌ | Yo'q | FE + BE |
| T4-08 | B2B CRM | ⚠️ | "B2B mijozlar" va "B2B mijoz qo'shish" bor. Yurist biriktirish, KPI, shartnoma, uzaytirish sinalmadi | FE + Stg |

### 5-bosqich — Obuna, sovg'a, referal

| Task | Nomi | Holat | Testda nima ko'rildi | Mas'ul |
|---|---|---|---|---|
| T5-01 | Obuna imtiyozlari | ⚠️ | Backend `/clients/me/entitlements` bor. Mijoz bosh sahifasida hisoblagichlar ("Konsultatsiya: 4 tadan 0") yo'q. Xarid production'da yopiq | FE + Stg |
| T5-02 | Oila a'zolari | ⚠️ | Profilda "Oila a'zolari → Oila a'zosini qo'shish" bor. Oqim obuna va ikkinchi akkauntsiz sinalmadi | Stg |
| T5-04 | Sovg'a obunasi | ⚠️ | "Sovg'alar" sahifasi, "Obuna sovg'a qilish", faollashtirilgan va kutilayotgan sovg'alar bor. Xarid, flayer PDF, qayta ishlatishni rad etish sinalmadi | Stg |
| T5-05 | Referal — mijoz | ⚠️ | ✅ Referal sahifasi: QR, havola, ulashish. ❌ Bosh ekranda progress yo'q | FE |
| T5-06 | Avtoto'lov | 🔒 | "Karta qo'shish" bor, recurring provayder ulanmagan | Provayder |
| T5-07 | Retention | ⚠️ | "Ushlab qolish" navbati bor. Eslatmalar sinalmadi | Stg |
| T5-08 | Gift KPI | ✅ | CEO panelida "Sovg'a dasturi KPI": xaridlar, aktivatsiya, gift→paid, CAC, LTV | — |

### 6-bosqich — Mobil ilova

| Task | Nomi | Holat | Izoh |
|---|---|---|---|
| T6-01…T6-05 | Texnologiya qarori, mijoz ilovasi, advokat ilovasi, push, nashr | ❌ | Bu repozitoriyada mobil ilova yo'q. Saytda faqat "Mobil ilova" haqida sahifa. Qaror hujjati va test-build berilmagan |

### 7-bosqich — Akademiya, reklama, tuzilma

| Task | Nomi | Holat | Testda nima ko'rildi | Mas'ul |
|---|---|---|---|---|
| T7-02 | Akademiya | ❌ | 2 ta kurs, tugmada **"Tez orada"** (GM: "tez kunda" = bajarilmagan). Xarid, materiallar, sertifikat yo'q | FE + BE |
| T7-03 | Reklama joylashuvi | ❌ | Admin → Reklama'da paketlar bor ("Regional boost", "Featured profile", test "Adm Ad"). Katalogda **"Reklama" belgisi yo'q** | FE + BE |
| T7-05 | Tuzilma kabineti | 🔒 | Kodda "Tashkilot" paneli bor, tasdiqlanmagan advokatda qulflangan | Akk |

---

## 5. Testni oxirigacha o'tkazish uchun kerak
1. **Staging manzili** — demo to'lov ochiq bo'lishi kerak. Busiz T1-10, T1A-01, T1A-04, T1-12, T1-16, T1-17, T1A-06, T1A-07, T5-01/02/04 va 2-bosqich to'lovlari sinalmaydi.
2. **Test akkauntlar:**
   - **tasdiqlangan** advokat (tuzilmali va tuzilmasiz);
   - haqiqiy yurist;
   - moderator, finance, quality control, sales head;
   - yuridik shaxs mijoz;
   - ikkinchi mijoz.
3. **Yangi telefon raqamlari** — ro'yxatdan o'tish, anonim AI tarixi va OTP bloki uchun (T0-02, T1-01).
4. **Dasturchi ko'rsatadiganlar:**
   - T0-09 to'lov interfeysi va takroriy webhook;
   - T0-10 IdentityProvider;
   - T0-16 tiyin;
   - T0-17 PII logi;
   - T3-12 reyting formulasi.
5. **Hujjatlar:** T0-19 hosting rejasi, T1-18 va T1B-10 test hisobotlari, T6-01 mobil texnologiya qarori.

## 6. Backendchi uchun yangi topilganlar
Batafsil — `LEXGO_BACKEND_ISSUES_2026-09-15.md`.

- **AI chat:** manba qidiruvi ishlamayapti ("rasmiy manbalarni qidirishda texnik muammo"), javoblarda `sources` bo'sh.
- **Limitlar:** `guest_ai_limit=5` (GM: kuniga 2), limitlar admin sozlamasida emas.
- **Obuna:** 12 oylik chegirma −10% (GM: −15% va bir yo'la −5%). Free/Lite/Pro `audience: seller`.
- **Katalog:** 35 ta kategoriya, test kategoriyalari, "guruh" darajasi va `coming_soon` bayrog'i yo'q, sinonim va xatoga chidamli qidiruv yo'q.
- **Advokatlar:** 38 tasida narx yo'q, "Demo" va "Test" nomlari.
- **Shablonlar:** `questionnaire` maydonlarining `label` qiymati inglizcha kalit (`claimant`, `defendant`…).
- **Rollar:** 22 ta, `super_admin` va `superadmin` takror, ruxsat nomlari (`title`) inglizcha.
- **Mijoz profili:** `/clients/me` da `region` maydoni yo'q, mijoz hududini o'zgartira olmaydi (T1-08).
- **Lidlar:** UTM, sahifa, qurilma, shahar maydonlari yo'q (T1A-05).
