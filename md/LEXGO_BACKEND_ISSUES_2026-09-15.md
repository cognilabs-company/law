# LexGo backend — frontend integratsiya va jonli testda topilgan muammolar

**Sana:** 2026-09-15
**Backend commit:** `7b7a89c` (birinchi tekshiruv) → `4aa7137` (qayta tekshiruv, 0A bo'lim) → `06f40e0` (barcha rollar bilan test, 0B bo'lim; 16.09 kanban va call-markaz, 0C bo'lim) → `bb5945d` (17.09 qayta tekshiruv, 0D bo'lim)
**Qanday tekshirildi:**
- Frontend'ning yangi build'i production backend (`https://lexgo.api.cognilabs.org`) bilan Chrome'da real akkauntlarda sinaldi.
- Sinov faqat ko'rish rejimida bo'ldi: to'lov, buyurtma, imzo, lid ko'chirish kabi amallar bajarilmadi.
- Javob formatlari backend kodi bilan solishtirildi.

**Sinalgan akkauntlar:**

| Akkaunt | Natijalar |
|---|---|
| Mijoz | 1–5 bo'limlar |
| Advokat (tasdiqlanmagan) | 6A |
| "LexGo Yurist" — backend'da advokat bo'lib chiqdi, yurist kabineti sinalmadi | 6A.4 |
| Sales operator | 6B |
| Superadmin, Admin | 6C |
| Call-center lawyer | 6D |

**Sinalmagan:** haqiqiy yurist, tasdiqlangan advokat, yuridik shaxs mijoz, moderator, moliya, sifat nazorati, sales head (akkaunt berilmagan).

Muhimlik darajasi: 🔴 yuqori (ish oqimi to'xtaydi) · 🟠 o'rta · 🟡 past.

> ⚠️ **Task raqamlari mos kelmaydi.** Backend hujjatlaridagi (TASK_STATUS, REVIEW_FRONTEND_INTEGRATION) task raqamlari "Ishlab chiqish rejasi v1.1" va "GM qabul tekshiruvi"dagi raqamlardan farq qiladi. Masalan:
> - backend "T0-15 tiyin" — v1.1 da T0-15 Telegram bot;
> - backend "T0-17 LiveKit" — v1.1 da T0-17 PII niqoblash;
> - backend "T1A-04 almashtirish" — v1.1 da T1A-04 shartnoma.
>
> Bosh menejer v1.1 raqamlari bo'yicha tekshiradi. Quyida raqamlar **v1.1** bo'yicha yozilgan.

## 0. Bugungi qabul (0-bosqich + bugun Review'ga o'tgan tasklar) uchun majburiyligi

"GM qabul tekshiruvi"dagi **"Bajarilmagan belgisi"** qatoriga to'g'ri keladiganlar — shu muammo tuzalmaguncha task qabul qilinmaydi.

| # | Muammo (bo'lim) | Task (v1.1) | GM "bajarilmagan belgisi" | Majburiy? |
|---|---|---|---|---|
| 1 | Superadmin, admin, advokat va sales operator 2FA'siz kiradi (6C.1, 6A.1, 6B.1) | T0-05 | "Admin kodsiz kirsa — bajarilmagan" (S-5: barcha ichki rollar) | 🔴 Ha, 0-bosqich |
| 2 | Telegram'i ulanmagan foydalanuvchi 2FA bilan kira olmaydi (6.1) | T0-02, T0-05 | Kod yetkazilmasa oqim to'xtaydi | 🔴 Ha |
| 3 | Production'da test yozuvlari: katalog, advokatlar, shablon, reklama, shikoyat (3.3, 6C.2) | T0-07 | "test nomlar qolsa" | 🔴 Ha |
| 4 | Katalog 3 darajali emas (3.3) | T0-07, T1-06 | "katalog bir darajali bo'lsa" | 🔴 Ha |
| 5 | "LexGo Yurist" test akkaunti backend'da `advokat` (6A.4) | T0-07, T2-11 | Har rol uchun test akkaunt kerak | 🔴 Ha |
| 6 | Login va ro'yxat hodisalaridan yuzlab soxta lid, dublikat filtri yo'q (6B.2) | T1A-05 | "Lidlar manbali, dublikat yo'q" | 🔴 Ha |
| 7 | Payme/Click webhook yo'q (2.1) | T0-09, T1A-01 | "takror vebhuk ikkinchi to'lov yaratmaydi" ko'rsatilishi kerak | 🔴 Ha |
| 8 | `demo-confirm` bosqichni yopmaydi; "paid" buyurtmada bosqichlar to'lanmagan (2.2, 2.3) | T1A-01 | "Uch to'lov, avtotasdiq" staging'da o'tishi kerak | 🔴 Ha |
| 9 | `offer_levels` 1 ta va noto'g'ri xizmat (3.1) | T1-05 (bugun Review) | "Hamma savolga bir xil taklif chiqsa" | 🔴 Ha |
| 10 | AI manbalarida modda va sana yo'q (3.6) | T1-04 (bugun Review) | "Manbasiz javob bersa" | 🔴 Ha |
| 11 | Hujjat tahlili narxlari rejaga mos emas, fayl yuklash yo'q (3.7) | T1-15 (bugun Review) | "Narx bir xil bo'lsa"; 149 000 taklifi | 🔴 Ha |
| 12 | E2E readiness qattiq yozilgan "ready", hisobot yo'q (8) | T1-18 (bugun Review) | "Hisobot yo'q — bosqich yopilmaydi" | 🔴 Ha |
| 13 | Call-center yuristi `advokat` rolida, sotuvchi onboarding'iga tushadi (6D.1) | T0-06, T1-12 | Har rol faqat o'z sahifalarini ko'radi | 🟠 Ha |
| 14 | AI rejalari mijozga ko'rinmaydi, rejalar `audience` noto'g'ri (6A.2) | T1-03 | "Narx boshqacha yoki hisoblagich yo'q" | 🟠 Ha, 1A |
| 15 | Onboarding'ni tekshiruvga yuborish va tugallanmaganidan lid yaratish yo'q (6A.3) | T1A-02 (bugun Review) | "5 qadam, saqlanadi, lid, kutish holati" | 🟠 Ha |
| 16 | Kvitansiya PDF'ida QR va buyurtma ma'lumoti yo'q (4.3) | T1-13 | "QR ishlaydi" | 🟠 Ha, 1A |
| 17 | Integratsiyalar ro'yxatida integratsiya bo'lmagan qatorlar (6C.3) | T0-14 | Holatlar haqiqiy bo'lishi kerak | 🟠 Tavsiya |
| 18 | Katalog/qidiruv ~11 s, AI ~12 s, tahlil ~33 s (1.x) | T1-06, T1-05, T1-15 | GM mezonida yo'q | 🟡 Yo'q, lekin demoda ko'rinadi |
| 19 | Referal QR 404 (5.1) | T1A-08 | Faqat kod va havola talab qilinadi | 🟡 Yo'q |
| 20 | Buyurtmada xizmat nomi yo'q (4.1) | T1-13 | Mezonda yo'q | 🟡 Yo'q (UX) |
| 21 | Mijoz almashtirish so'rovlarini ko'rmaydi (4.2) | T1A-06 | Mezon — eski advokat hujjatlari o'tmasligi | 🟡 Yo'q |
| 22 | Parol tiklashda akkaunt borligi oshkor bo'ladi (6.2) | T0-04 | Mezonda yo'q | 🟡 Yo'q (xavfsizlik tavsiyasi) |
| 23 | Roziliklar: `audience` yo'q, foydalanuvchi o'z roziligini o'qiy olmaydi (6.3, 6C.4) | T0-18 | Admin jurnali yetarli | 🟡 Yo'q |
| 24 | Haqiqiy MyID/OneID yo'q (6.4) | T0-10 | "hozir demo tasdiq" qabul qilinadi | 🟡 Yo'q |
| 25 | Sales operator ruxsatlari, kanban nomlari inglizcha (6B.3, 6B.4) | T4-02, T0-06 | Keyingi bosqich | 🟡 Yo'q |
| 26 | Hujjatdagi yo'q route'lar, WS close code, 409 formati (7, 8) | — | — | 🟡 Yo'q |


## 0B. Barcha rollar bilan to'liq test — backend `06f40e0` (38dcfe1 + 06f40e0)

Chrome'da 7 ta test akkaunt bilan login qilindi (2FA kodi Telegram'dan olindi). Har rolda menyudagi hamma sahifa ochildi. Qo'shimcha tekshiruvlar:
- boshqa rol sahifalarini URL orqali ochib ko'rish (T0-06);
- telefon kengligida (390 px) ko'rinish (T0-13);
- `/auth/me` holati.

To'lov, imzo, buyurtma yoki lid ko'chirish qilinmadi. Mijozda bitta AI tahlil va bitta hujjat tahlili yuborildi.

### Rollar bo'yicha natija

| Akkaunt | Backend roli | 2FA so'raldimi | Sahifalar | URL orqali kirish (T0-06) | Telefon (T0-13) |
|---|---|---|---|---|---|
| Superadmin `…0001` | `client` + `superadmin` | ❌ Yo'q | 33 ochildi, JS xato yo'q | ✅ | ✅ |
| Admin `…0002` | `client` + `admin` | ❌ Yo'q | 29 ochildi | ✅ "Rollar" ochilmaydi | ✅ |
| Call-center lawyer `…0003` | **`advokat`** + `call_center_lawyer`, `sales_operator` | ✅ Ha | 43 ochildi | ✅ | ✅ |
| Sales operator `…0004` | `client` + `sales_operator` | ❌ Yo'q | 29 ochildi | ✅ | ✅ |
| Client `…0005` | `client` | Kerak emas | 21 ochildi | ✅ | ✅ |
| Advokat `…0006` | `advokat`, `pending` | ✅ Ha | 14 ochildi, 10 bo'lim qulflangan | ✅ | ✅ |
| Yurist `…0007` | **`advokat`**, `pending` | ✅ Ha | Advokat kabineti ochildi | ✅ | ✅ |

Frontend'da topilib tuzatilgani: "Bootstrap" sahifasi sales operator va call-center xodimiga URL orqali ochilardi, endi ularni o'z sahifasiga qaytaradi.

### Qayta tekshiruvdan keyingi holat

| # | Muammo | Holat | Izoh |
|---|---|---|---|
| 1 | Ichki rollar 2FA'siz kiradi | ❌ | Sabab 30-bandda |
| 6 | Login'dan soxta lidlar | ⚠️ | ✅ Test paytida 8 marta login qilindi, so'nggi 90 daqiqada faqat 1 ta `login` lidi paydo bo'ldi (ehtimol deploy'dan oldin). ❌ Eski 411 ta lid "Yangi" ustunida turibdi, ular tozalanishi kerak |
| 9 | AI takliflari | ❌ Regress | 31-bandga qarang |
| 10 | AI manbalari | ⚠️ | ✅ `answer_status: reliable_source_required` qo'shildi, frontend ogohlantirish ko'rsatadi. ❌ `article` va `date` hali `null` |
| 12 | E2E readiness | ⚠️ | ✅ Holatlar endi ma'lumotdan hisoblanadi (`verified` / `needs_verification` / `blocked`), frontend ulandi. ❌ `verified` faqat bazada to'langan to'lov yoki chat xonasi borligini bildiradi. Bu ssenariy o'tkazilgani haqidagi hisobot emas, GM T1-18 dagi "Hisobot bor" talabi yopilmaydi |
| 5, 13 | "Yurist" va "Call-center lawyer" advokat rolida | ❌ | O'zgarmagan. Yurist kabinetini (T2-11) umuman sinab bo'lmadi |

### 🔴 30. 2FA majburiyligi asosiy rolga bog'langan, ichki rollarga emas (T0-05)
- **Kod:** `main.py` ~363-qator — `mandatory_two_factor(user): return user.role != UserRole.client`.
- **Muammo:** Superadmin, Admin va Sales operator akkauntlarining asosiy roli `client`, ichki rollari esa `user_roles` jadvalida. Shuning uchun ular kodsiz kiradi.
- **Advokat'ga ham ta'sir qiladi:** call-center lawyer'da kod so'raladi, lekin sababi uning asosiy roli `advokat` ekanligi.
- `settings.admin_2fa_required` sukut bo'yicha `False`.
- **Avto-chiqish ham ishlamaydi:** `session_inactivity_hours(user)` ham `user.role` ga qaraydi. Admin'ning 2 soatlik avto-chiqishi (T0-05) superadmin va admin akkauntlarida ishlamaydi.
- **Taklif:**
  - `mandatory_two_factor` foydalanuvchining barcha rollarini tekshirsin: `client` dan boshqa har qanday rol yoki ichki ruxsat (`users.manage`, `leads.manage`…) bo'lsa, 2FA majburiy.
  - `session_inactivity_hours` ham shu tartibda ishlasin.
  - Production'da `ADMIN_2FA_REQUIRED=true`.

### 🔴 31. AI takliflari yo'qoldi (T1-05, regress 38dcfe1)
- `ai_offer_levels` dan zaxira (`fallback`) ro'yxat olib tashlandi.
- **So'rov:** "shartnoma bo'yicha qarz qaytarilmayapti, sudga ariza berish kerakmi?"
- **Javob:** `category: contract`, `offer_levels: []`. Mijoz 3 ta advokat yoki xizmat kartasi o'rniga faqat "Bu xizmatni buyurtma qilish" tugmasini ko'radi.
- **Sabab:** `category in haystack` sharti inglizcha kalitni (`contract`) xizmat nomi, slug, `ai_category` va `category_title` ichidan qidiradi. `ai_category` esa `catalog_seed.py` da Excel'dagi "AI категория" ustunidan olinadi. Inglizcha kalit bilan mos kelmaydi, zaxira ro'yxat olib tashlangani uchun natija bo'sh qoladi.
- **GM mezoni:** "aniq muammoda — 3 advokat kartasi".
- **Taklif:**
  - Kategoriya → katalog oilasi xaritasi qilinsin: `contract` → G, `family` → B, `labor` → C, `court` → I…
  - Takliflar shu oila ichidan va turli narx darajalarida tanlansin.

### 🔴 32. Production'da boshqa foydalanuvchilarning OTP kodlari umumiy Telegram chatiga ketyapti (T0-02)
- **Nima ko'rindi:** test paytida test chatiga bizning akkauntlarga tegishli bo'lmagan raqamlarning kodlari keldi: `+998901999901`, `+998902999901`.
- **Sabab:** `deliver_user_otp` da `telegram_otp_test_mode` yoqilgan bo'lsa, har foydalanuvchi kodi `telegram_test_chat_ids()` ga yuboriladi. 06f40e0 xabarga telefon raqamini ham qo'shdi.
- **Nega muhim:**
  - GM T0-02: "SMS-kod hech qayerda 'ko'rinib' qolmaydi".
  - `deliver_user_otp` login 2FA, **parol tiklash** (`main.py` ~1017) va 2FA yoqishda ishlatiladi. Test chatiga kirishi bor har kim istalgan foydalanuvchining parolini tiklab, akkauntini egallashi mumkin.
- **Taklif:** production'da `TELEGRAM_OTP_TEST_MODE=false`. Test rejimi faqat staging'da va faqat test raqamlar ro'yxati uchun ishlasin.

### 🟠 33. "To'langan" buyurtmada to'lov bosqichlari to'lanmagan (T1A-01)
- **Akkaunt:** Client `…0005`, "Ekspress yuridik konsultasiya (chat)".
- **Holat:** buyurtma statusi `paid` ("To'langan", 4/5-bosqich). Lekin 3 ta bosqichning hammasi `pending`: 32 670 / 43 560 / 32 670 so'm, birinchisida "To'lash" tugmasi bor.
- Superadmin'dagi `paid` buyurtmada bosqichlar `paid` edi, bu buyurtmada esa yo'q. Sabab aniqlanmadi: ehtimol tuzatish faqat yangi to'lovlarga ishlaydi.
- **Taklif:** buyurtma `paid` bo'lganda bosqichlar bilan moslik tekshirilsin, eski buyurtmalar migratsiya bilan tuzatilsin.

### 🟠 34. Onboarding progressi profilni hisobga olmaydi (T1A-02)
- **Akkaunt:** Advokat `…0006`.
- Profil 60% to'ldirilgan, statistikasi bor (12 ish). Lekin `/seller-onboarding/progress` da 0/5, "Profil" qadami ham bajarilmagan.
- **Taklif:** qadam holatlari profil maydonlaridan hisoblansin, masalan bio, tajriba, yo'nalish, hudud to'ldirilgan bo'lsa "Profil" bajarilgan.

### 🟡 35. Ma'lumotlar tili aralash
- Xizmat pasportida: `Yo'nalish = B. Оила ва никоҳ муносабатлари`, `Ijrochi = Юрист`, `Format = Онлайн`, `Bo'lim = Никоҳни бекор қилиш`.
- Obuna rejalarida: `Lexgo.AI — юрист/адвокат (Seller)`, `Lexgo.AI — жисмоний шахс`, `Бизнес абонент — Basic`.
- UI lotin yozuvida, katalog va reja nomlari kirill yozuvida.
- Advokatga biznes abonent rejalari ham ko'rinadi (`audience: seller`).
- **Taklif:**
  - Katalog metadata'sida `title_uz_latn` va `title_ru` allaqachon bor. Pasport va `/service-categories` javobida ular alohida qaytarilsin (`category_title_uz_latn`, `executor_type` kaliti), frontend tilga qarab tanlaydi.
  - Rejalar nomi lotinga o'girilsin.

### 🟡 36. Test akkauntlar GM tekshiruvi uchun yetarli emas
- **Client:** `region` bo'sh (GM T1-01: hudud majburiy).
- **Kerakli akkauntlar yo'q:**
  - tasdiqlangan advokat — T1-11 kabinet, T1A-03 tuzilma gate, T1-10 buyurtma qabul qilish;
  - haqiqiy yurist — T2-11;
  - moderator, moliya, sifat nazorati.
- Hozirgi advokat va yurist `pending`, kabinet bo'limlarining 10 tasi qulflangan.

## 0D. 17.09 qayta tekshiruv — backend `bb5945d` (Implement T1B backend workflows)

Production API superadmin bilan to'g'ridan-to'g'ri so'raldi. Kod `bb5945d` gacha o'qildi.

### Yangi qo'shilgan (T1B backend, 16.09 18:58)
`/admin/service-packages` (CRUD, submit/approve/publish/stop/clone/preview, price-simulator), `/service-packages/proposals`, `/admin/document-templates/import-docx`, `/preview`, `/import-zip`, `POST /lawyers/me/clients`, `/calendar-events/{id}/reminders/cascade`, `/calendar-events/{id}/ical`, `/calendar/deadline-calculator`, `/workspace/files/{id}/signed-url`, `PATCH /sos/{id}`, `/b2b/clients/{id}/invoice|contract|monthly-report`, `/ai/cases/{id}/tools`. Hammasi production'da ochiq (401/405 — ro'yxatda). Frontend hali ulanmagan — T1B-01/02/04/05/06/07/09 uchun endi backend bor.

### Oldingi muammolar holati

| # | Muammo | 17.09 |
|---|---|---|
| 1 / 30 | Ichki rollar 2FA'siz | ❌ `mandatory_two_factor` o'zgarmagan (`user.role != client`); superadmin login javobida `access_token` keladi, kod so'ralmaydi |
| 32 | OTP kodlari umumiy Telegram chatga | ❌ Kodda o'zgarish yo'q (`telegram_otp_test_mode` production sozlamasi tekshirilmadi) |
| 10 | AI manbalarida modda/sana | ❌ `article: None, date: None` qattiq yozilgan (`legal_corpus_sources`) |
| 9 / 31 | AI takliflari | ❌ Endi 3 ta taklif keladi, lekin oddiy savol ("Aliment qanday hisoblanadi?") va aniq muammo ("Erim aliment to'lamayapti… Samarqand") uchun **bir xil** 3 ta xizmat (Nikoh shartnomasi / Vasiylik / Aliment). GM T1-05: "hamma savolga bir xil taklif — bajarilmagan" |
| 23 / T0-18 | Huquqiy hujjat matnlari | ❌ 11 ta hujjat hali 43–76 belgili placeholder. Haqiqiy matnlar PM'dan kelgan (`Ҳуқуқий ҳужжатлар.rar`, 10 hujjat × 3 til) — bazaga kiritilishi va tahrir API (`PUT /admin/legal/consents/{id}`) kerak |
| 14 | Rejalar `audience` | ❌ Free/Lite/Pro hali `seller` |
| 3 / 4 | Katalog va test ma'lumot | ❌ Yomonlashdi: kategoriyalar 35 → **38** (yangi `T1BTEST-140959 Cat`, `T1BTEST-20260916140652 Category`, `test`), `FX-*` 20 ta xizmat, "guruh" darajasi yo'q |
| 3 | Test yozuvlar | ❌ Ko'paydi: rollar 22 → **23** (`TEST`), so'rovlar `Smoke Yurist`, `Test Yurist`, `Runtime Yurist`, `yurist2/3`; paketlar `T1BTEST-140959 Package` (holati `on_sale` — **mijozga ko'rinadi**); shablonlar "Document request list test", "Frontend download test template"; shikoyatlar `sssss`, `e2e`. T1B testlari production bazasida o'tkazilgan |
| 38 | Call-markaz yuristi mijoz kartasi 403 | ❌ `call_center_client_card` hali `admin_client_360` → `users.manage` |
| 37 | Kanban tezligi | ⚠️ Hozir 233 ms, lekin faqat lidlar 435 → 47 ga tushgani uchun; kod o'zgarmagan, lid ko'paysa yana sekinlashadi |
| 12 | E2E readiness | ⚠️ 12 ssenariy `verified`, `report: null` — holat bazada yozuv borligidan hisoblanadi, sinov hisoboti emas |
| 17 | Integratsiyalar | ❌ `database`, `payment_mode`, `website_api`, `mobile_api` hali `connected` |
| 18 | Matnli hujjat tahlili | ❌ 38 soniya |
| 28 | Fayl tahlili AI'dan o'tmaydi, 6 bo'lim yo'q | ❌ O'zgarmagan |
| 6 | Login lidlari | ✅ Yangi login lidi yaratilmayapti |
| — | Kanbanda ustunlar o'zgarib turibdi | ℹ️ 16.09 kechqurun "Yangi" 10 ta qoldirilgan edi; 17.09 da `new:11, contacted:10, qualified:8, proposal:5, lost:4, duplicate:2` — kimdir lidlarni ko'chirgan/qo'shgan |

### Yangi topilgan
- **`/calendar/deadline-calculator`** `base_date` maydonini kutadi (`from_date` emas) — hujjatlashtirilmagan; frontend ulaganda `{kind, base_date}` yuboradi.
- **Test paketi `on_sale`** — `/service-packages` ochiq ro'yxatida chiqadi, mijoz sotib olishga urinishi mumkin. To'xtatilsin.
- `TEST` roli `/admin/roles` da — o'chirilsin.

## 0C. 16.09 kechki topilmalar — kanban tezligi va call-markaz

### 🔴 37. Lidlar kanbani juda sekin: `GET /admin/leads/kanban` ~10 soniya (T4-02)
- **O'lchov:** 435 lid uchun `GET /admin/leads/kanban` 10–12 soniya, `GET /call-center/leads/kanban` ham shuncha. Har ko'chirish (`PATCH …/move`) tez, lekin undan keyingi qayta yuklash yana 10 soniya.
- **Frontend'da:** ko'chirish endi optimistik (karta darhol o'tadi, doska qayta yuklanmaydi), shuning uchun foydalanuvchi sezmaydi. Lekin doskaning **birinchi ochilishi** hali ham 10 soniya.
- **Sabab (kod):**
  - `build_lead_kanban` barcha lidlarni xotiraga oladi va har biri uchun `lead_kanban_details()` (JSON parse) chaqiradi.
  - `move_lead_on_kanban` (~961-qator) ham **barcha** lidlarni o'qib, manba va manzil ustundagi har bir lidni qayta yozadi (`set_lead_kanban_details`) — 400+ UPDATE bitta ko'chirish uchun.
  - Kanban ustuni va pozitsiyasi `details_json` ichida saqlanadi, indeks yo'q.
- **Taklif:**
  - `Lead` jadvaliga `kanban_column` va `kanban_position` ustunlari (indeksli) qo'shilsin, `details_json` dan chiqarilsin.
  - Kanban javobi ustun bo'yicha limit bilan bersin (masalan har ustunda 50 ta, "yana yuklash"), `total_count` alohida.
  - Ko'chirishda faqat manzil ustunidagi pozitsiyalar yangilansin, manba ustunda bo'shliq qolsa ham bo'ladi (frontend tartibni pozitsiya bo'yicha oladi).
  - Eski `login` manbali 411 ta lid o'chirilsa, doska darhol yengillashadi.

### 🟠 38. Call-markaz yuristi mijoz kartasini ocholmaydi (T4-02 "360")
- `GET /call-center/clients/{id}` (~5834-qator) call-markaz xodimiga ruxsat beradi, lekin ichida `admin_client_360()` ni chaqiradi, u esa `require_permission(user, "users.manage")` qiladi. Natijada call-markaz yuristi (users.manage yo'q) **403** oladi.
- `GET /call-center/clients/search` esa ishlaydi, ya'ni qidiruv bor, karta yo'q.
- **Frontend:** karta ochilganda 403 bo'lsa "sizning rolingizda ruxsat yo'q" deb ko'rsatadi, qidiruv natijasidagi ma'lumot (ism, ID, telefon, holat) va qo'ng'iroq yozish ishlayveradi.
- **Taklif:** `admin_client_360` ichidagi tekshiruvni chaqiruvchi route'ga chiqarish: `/admin/clients/{id}/360` uchun `users.manage`, `/call-center/clients/{id}` uchun `is_call_center_user`.

### 🟠 39. Sales operator mijoz qidira olmaydi va 360 ko'rmaydi (T4-02)
- `/call-center/clients/search` va `/call-center/clients/{id}` faqat `is_call_center_user` yoki `users.manage` uchun. Sales operator (`sales_operator`, 4 ta ruxsat) 403 oladi.
- GM T4-02: "Sales operator → Lidlar → lidni oching → 360 (AI tarixi, sahifalar, hujjatlar)". Ya'ni operator uchun ham mijoz kartasi kerak.
- **Frontend:** Call-markaz sahifasida qidiruv sales operatorga ham ko'rsatiladi; 403 kelsa "faqat call-markaz xodimlari uchun" xabari chiqadi.
- **Taklif:** `leads.manage` yoki yangi `clients.view` ruxsati bo'lganlarga qidiruv va karta ochilsin; sales operator roliga shu ruxsat berilsin.

### 🟡 40. Qo'ng'iroqlar tarixi (`/call-center/calls`)
- ✅ Ishlaydi: yozuvda `direction`, `phone`, `topic`, `result`, `next_action`, `duration_sec`, `client_user_id`, `owner_user_id` saqlanadi. Frontend endi hammasini ko'rsatadi va yangi qo'ng'iroqni forma orqali yozadi.
- ❌ Operator ismi yo'q: `owner_user_id` keladi, lekin ism yo'q. Ro'yxatda "kim gaplashgan" ko'rsatish uchun `owner_name` qo'shilsin.
- ❌ Filtr va sahifalash yo'q: hamma yozuv bitta so'rovda keladi (`client_user_id` dan boshqa filtr yo'q). `direction`, `status`, `date_from/date_to`, `limit/offset` qo'shilsin.
- ❌ Telefoniya ulanmaguncha (T4-04) yozuvlar faqat qo'lda kiritiladi.

### 🟡 41. Navbatdagi lid sarlavhasi kategoriya kaliti
- `/call-center/queue` da lid uchun `title` = `details.title or lead.category` — ko'pincha `contract`, `family` kabi kalit keladi. Frontend tarjima qiladi, lekin `details.title` bo'sh bo'lgani asosiy sabab: AI tasnifdan lid yaratilganda `title` (savolning qisqa matni) saqlansin.

## 0A. Qayta tekshiruv — backend `4aa7137` (ac68669 + 40b4d5a + 4aa7137)

Production API superadmin akkaunti bilan qayta so'raldi. Frontend yangi endpoint'larga ulanib, Chrome'da jonli sinaldi. To'lov, imzo, buyurtma yoki lid ko'chirish qilinmadi.

Belgilar: ✅ tuzatildi · ⚠️ qisman · ❌ tuzatilmagan · ⏸ qayta sinalmadi.

| # | Muammo | Holat | Qayta tekshiruvda nima ko'rindi |
|---|---|---|---|
| 1 | Ichki rollar 2FA'siz kiradi | ❌ | `/auth/me` bo'yicha superadmin'da 2FA yoqilmagan, parol bilan kod so'ralmasdan kiradi. GM T0-05 bo'yicha bu hali ham "bajarilmagan" |
| 2 | Telegram'i ulanmagan foydalanuvchi 2FA | ⏸ | 4aa7137 test chat'ga yuborishni tuzatgan, ulanmagan real foydalanuvchi bilan sinalmadi |
| 3 | Production'da test yozuvlari | ❌ | Katalogda `FX-002…FX-017 fixture-*` xizmatlari, kategoriyalar `Gift Cat`, `Test`, `Test category` (2 marta), shablonlar `Admin tpl`, `Document request list test`, `Frontend download test template`, shikoyatlar `sssss`, `e2e` (2 ta), reklama `Adm Ad`, kutayotgan so'rovlar `yurist3` (4 marta), `yurist7`, `yurist9` |
| 4 | Katalog 3 darajali emas | ❌ | `/service-categories` hali tekis ro'yxat. Lotin (`Oilaviy huquq`, `Sud ishlari`) va kirill (`B. Оила ва никоҳ…`, `I. Суд ишлари`) nomlar aralash, dublikatlar bor |
| 5 | "LexGo Yurist" backend'da advokat | ❌ | `seller_type` o'zgarmagan |
| 6 | Login'dan soxta lidlar | ❌ | Jami 430 lid. Manbalar: `login` 257, `register_start` 86, `register_verify` 37. So'nggi 1 soatda login'dan yana 4 ta lid yaratilgan, ya'ni oqim hali ham lid yaratyapti |
| 7 | Payme/Click webhook | ⚠️ | Route bor: imzosiz so'rovga 401 qaytaradi. Takroriy webhook ikkinchi to'lov yaratmasligini (idempotentlik) staging'da ko'rsatish kerak |
| 8 | `demo-confirm` bosqichni yopmaydi | ✅ | "paid" buyurtmada 3 ta bosqich `paid`. Production'da `demo-confirm` 404, bu to'g'ri. Staging'da jonli sinalmadi |
| 9 | `offer_levels` 1 ta, noto'g'ri | ⚠️ | 3 ta daraja katalog xizmatlaridan keladi (X01, G01, X05). Lekin uchalasi ham **99 000 so'm**, "Asosiy/Standart/Premium" farqi narxda ko'rinmaydi. Yangi topilgan muammo uchun 27-bandga qarang |
| 10 | AI manbalarida modda va sana yo'q | ❌ | `sources[].article` va `sources[].date` hali `null`, faqat portal havolasi keladi. `answer_status` ("bilmayman") yo'q. `summary` hali ham foydalanuvchi matnini qaytaradi |
| 11 | Hujjat tahlili narxi, fayl yuklash | ⚠️ | ✅ Narx sahifaga qarab: `1-5:149000; 6-15:299000; 16-30:499000; 31+:15000/page; urgent:+50%`. ✅ `written_opinion_amount` 99 000. ✅ `POST /ai/document-analysis/file` ishlaydi (TXT, 200). Qolgani 28-bandda |
| 12 | E2E readiness qattiq yozilgan | ❌ | `overall: "ready"`, 6 ssenariyning hammasi `ready`, `report: null` |
| 13 | Call-center yuristi `advokat` rolida | ❌ | O'zgarmagan |
| 14 | Rejalar `audience` | ❌ | `lexgo-ai-free`, `lexgo-ai-lite`, `lexgo-ai-pro`, `lexgo-ai-jismoniy-shaxs` va `biznes-abonent-*` hali `audience: seller`. GM T1-03 dagi Free/Lite/Pro mijoz uchun, lekin mijoz kabinetida ko'rinmaydi |
| 15 | Onboarding submit / hujjat yuklash | ⚠️ | `POST /seller-onboarding/documents` va `/seller-onboarding/submit` kodda bor, frontend ulandi. Tasdiqlanmagan advokat akkauntida jonli sinalmadi. Tugallanmagan onboarding'dan lid yaratilishi tekshirilmadi |
| 16 | Kvitansiya QR | ✅ | PDF'da tekshirish havolasi (QR) bor, `/receipt/verify` ishlaydi |
| 17 | Integratsiyalarda integratsiya bo'lmagan qatorlar | ❌ | `database`, `payment_mode`, `website_api`, `mobile_api`, `data_residency`, `analytics` hali `connected` bo'lib turibdi, `demo_payment` ham ro'yxatda |
| 18 | Tezlik | ⚠️ | ✅ Katalog 0,47–0,72 s, qidiruv 0,13–0,39 s, AI tasnif 0,16 s. ❌ Matnli hujjat tahlili hali **37,7 s** |
| 19 | Referal QR 404 | ✅ | PNG qaytaradi |
| 20 | Buyurtmada xizmat nomi | ⚠️ | ✅ `service_title` bor. ❌ `lawyer_name` bo'sh |
| 21 | Mijoz almashtirish so'rovlarini ko'rmaydi | ✅ | `GET /replacement-requests/me` bor, frontend ulandi |
| 22 | Parol tiklashda akkaunt borligi oshkor bo'ladi | ❌ | O'zgarmagan (GM mezonida yo'q) |
| 23 | Roziliklar | ⚠️ | ✅ `GET /legal/consents/me` bor, frontend ulandi: avval rozi bo'lgan foydalanuvchiga oyna qayta chiqmaydi. ❌ Hujjatlarda `audience` hali yo'q, frontend slug bo'yicha ajratishda davom etadi |
| 24 | Haqiqiy MyID/OneID | ❌ | Kutilgan holat: demo tasdiq qabul qilinadi |
| 25 | Kanban nomlari inglizcha | ❌ | Ustunlar `New`, `Contacted`, `Qualified`… Yangi ustun ham paydo bo'lgan: **`nmkj_b` — "NMKJ, B"**, test yozuviga o'xshaydi |
| 26 | Hujjatdagi yo'q route'lar, WS, 409 | ⏸ | Qayta sinalmadi |
| — | `/contracts` ro'yxati | ✅ | Yangi endpoint, 200 |
| — | `/ai/feedback` | ✅ | UI'dan "Foydali" → 200 |
| — | `/matching/preview` | ✅ | 20 nomzod |

### Qayta tekshiruvda yangi topilganlar

#### 🟠 27. AI tasnifi: noto'g'ri yo'nalish va bir xil narxli takliflar (T1-05)
- **So'rov:** "Ish beruvchi 2 oydan beri maoshimni bermayapti, mehnat shartnomam bor."
- **Javob:** `category: contract` ("Shartnomalar"). Kutilgan yo'nalish: mehnat huquqi. "Shartnoma" so'zi yo'nalishni belgilab qo'yyapti.
- **Takliflar:** `basic` X01 "Ariza tayyorlash (umumiy)", `standard` G01 "Standart shartnoma loyihasini tayyorlash", `premium` X05 "Ekspress yuridik konsultasiya (chat)". Uchalasi ham 99 000 so'm, ikkinchisi muammoga mos emas.
- **Nega muhim:** GM mezoni "Hamma savolga bir xil taklif chiqsa — bajarilmagan". Turli savollarda bir xil 3 ta xizmat va bir xil narx chiqsa, task qabul qilinmaydi.
- **Taklif:**
  - Daraja bo'yicha narx farqi bo'lsin: basic < standard < premium.
  - Takliflar aniqlangan yo'nalish ichidan tanlansin.
  - Mehnat, oila, meros kabi kalit so'zlar "shartnoma" so'zidan ustun tursin.

#### 🟠 28. Fayldan hujjat tahlili AI emas, matnning birinchi gapini qaytaradi (T1-15)
- `POST /ai/document-analysis/file` 131 ms da javob beradi.
- `summary` — fayldagi birinchi gap: "IJARA SHARTNOMASI. Toshkent sh. Ijaraga beruvchi kvartirani 12 oy muddatga ijaraga beradi."
- **Sabab** (`marketplace_routes.py`, ~6464-qator):
  - Fayl yo'li faqat `heuristic_document_analysis(text)` ni chaqiradi.
  - Matnli yo'l (`POST /ai/document-analysis`, ~6396-qator) esa `run_seller_ai(...)` ni ham chaqirib, `analysis_text` qo'shadi.
  - Fayl yo'lida `upsell_offer` ham yo'q.
- **Sahifa soni ikki yo'lda turlicha hisoblanadi:** faylda `len // 2500 + 1`, matnda `(len + 2499) // 2500`. Natijada 2 500 belgili hujjat faylda 2 sahifa, matnda 1 sahifa bo'ladi va narx pog'onasi o'zgarishi mumkin.
- GM talabi "AI xulosa **6 bo'limda**". Hozir ikkala yo'lda ham 3 ta bo'lim bor: `summary`, `risks`, `recommendations`.
- **Taklif:**
  - Fayldan olingan matn ham matnli yo'l bilan bir xil funksiyadan o'tsin: AI tahlili, `upsell_offer` va bir xil sahifa formulasi.
  - Javobga 6 bo'lim qo'shilsin, masalan: hujjat turi va tomonlar, asosiy shartlar, xatarlar, qonunga moslik, yetishmayotgan bandlar, tavsiyalar.
  - Frontend yangi bo'limlarni ko'rsatishga tayyor, faqat maydon nomlari kerak.

#### 🟡 29. `nmkj_b` kanban ustuni
`/leads/kanban` da `nmkj_b` ("NMKJ, B") nomli yangi ustun bor. Test paytida qo'shilgan bo'lsa o'chirilsin. Kerakli ustun bo'lsa, `title` to'g'ri nomlansin.

---

## 0E. 17.09 — GM v1.1 talablari uchun frontend kutayotgan backend ishlari

Frontend bugun UI ni qurdi; quyidagilar backend tomonidan bo'lmasa GM talabi yopilmaydi (talab raqamlari GM v1.1 bo'yicha).

| # | Task / talab | Nima kerak | Hozir |
|---|---|---|---|
| 42 | T0-18 §2,3,6 | `POST /admin/legal/consents` {slug, version, title, body, is_active, requires_reaccept} — yangi versiya nashr qilish; `requires_reaccept=true` bo'lsa keyingi kirishda qayta rozilik, `false` — faqat xabar | Faqat GET; matn kodda (seed) |
| 43 | T0-18 §1 | ~~10 slug seed~~ — **bajarilgan** (17.09 tekshiruv: 11 slug bor: terms, privacy, cookie, advocate_partnership, organization_agreement, client_provider_contract, payment_refund_warranty, platform_rules, personal_data, age_18, legal_disclaimer). Qolgani: matnlar 43–76 belgili placeholder — PM matni admin orqali kiritilishi uchun #42 kerak | 11 slug, placeholder |
| 44 | T0-18 §4 | `/admin/legal/user-consents` javobida `device` (user-agent) | Faqat ip_address |
| 45 | T1-10 §4 | `/orders/{id}/status-history` yozuvida `old_status`, `changed_by_user_id`, `ip`, `device`, `reason` | status, note, created_at |
| 46 | T1-10 §11, T2-10 §1–2 | `POST /orders/{id}/decline` body `{reason, note}` ni saqlash (reason: conflict_of_interest, not_my_specialization, busy, region_far, price_mismatch, documents_insufficient, prior_dispute, sick_or_vacation, other) + `GET /admin/orders/decline-reasons/stats` | Body e'tiborsiz qoldiriladi |
| 47 | T2-06 §1,2,9 | `/payouts/me` da `period`, `scheduled_for` (payshanba), `dispute_hold_amount`; payout yaratish qoidasi (3 kun nizo oynasi, 100 000 min, oy oxiri) | payment_split ro'yxati |
| 48 | T2-08 §1,8 | `/referrals/me` da ijrochi uchun `active_count`, `commission_rate`, `next_tier`; mijoz uchun `paid_count`, `share_text` | Frontend tier'ni o'zi hisoblaydi (5→16%, 10→15%, 20→13%) |
| 49 | T5-01 §2 | `/clients/me/entitlements` da har imtiyoz uchun `{limit, used, reset_at}` | Faqat has_active_subscription, ai_limit matni |
| 50 | T1-02 §5,6 | AI usage (`used/limit/reset_at`) `/auth/me` yoki `GET /ai/usage` — 200 javobda ham | Faqat 402 detail'da |
| 51 | T1B-01 §5 | `/service-packages` javobida `related_service_ids` yoki har komponentda `service_id, unit_price` — «Alohida: X» hisoblash uchun | Faqat `related_service_codes: "G01-G03"` matni; frontend xizmatlardagi `catalog_code` bilan moslashtiradi |
| 52 | T1B-04 §1,2 | Hodisa turlari: hearing, investigative, meeting, filing_deadline, appeal_deadline; eslatma to'plami [10080, 4320, 1440, 120] daqiqa | 4 tur, bitta eslatma |
| 53 | T1B-04 §4 | Google Calendar OAuth (`/calendar/google/connect`) | Yo'q |
| 54 | T3-10 §3 | `/admin/security-events` — turlar: suspicious_login, otp_bruteforce, password_bruteforce, mass_read; `PATCH .../{id}` status | Faqat suspicious_login (IP) |
| 55 | T1-09 §5 | lawyers API: `gender`, `is_online`, `is_super` | Yo'q |
| 56 | T1-11 §8,9 | `PATCH /lawyers/me` — `work_days`, `work_from`, `work_to`, `vacation_mode`; ta'tilda buyurtma yuborilmaydi va ko'rsatkichlarga kirmaydi | Frontend localStorage |
| 57 | T1A-02 §1,3,8 | Onboarding draft server'da (`/register/draft`), selfie/litsenziya fayl yuklash, tugallanmagan → «advokat lidi» | Frontend localStorage (24 soat) |
| 58 | T7-03 §5 | lawyers/ads API'da `is_promoted` / slot turi — «Reklama» belgisi uchun | Yo'q |
| 59 | T1A-07 | Chat xabarida telefon/@username/«telegramda yozing» maskalash (to'lovgacha) + urinishlar hisoboti | Yo'q |
| 60 | T0-07 / GM 1.6 | Test-akkaunt to'plami: mijoz ×3 (+TG bog'langan, yuridik shaxs, Lite/Pro/Standart/Premium), advokat ×3 (tuzilmali/tuzilmasiz/tasdiqlanmagan), yurist, super_admin ×2, executive, ceo_viewer, moderator, finance, quality_control, content_manager, sales_head, b2b_manager, marketing | 7 akkaunt |
| 61 | T2-02 §3 | `GET /lawyers/me/services` javobida har xizmat uchun `selected_price` (va tavsiya `min_allowed/max_allowed`) | Faqat xizmatlar ro'yxati; narx frontend'da saqlanadi |
| 62 | T4-02 §7 | `PATCH /call-center/leads/{id}` (details merge) yoki move payload'ida `lost_reason` — operator lids'ni sabab bilan yopishi uchun | Faqat admin PATCH (leads.manage), details to'liq almashadi |

## 1. Tezlik

### 🔴 1.1 `GET /services` va `GET /services/search` ~11,5 soniya
```
GET /services?catalog_only=true          200  11.39s  142 KB
GET /services/search?q=ajralish&limit=50 200  11.79s  2.4 KB
GET /service-categories                  200   0.92s
GET /services/{id}/passport              200   1.08s
```
- **Qayerda ta'sir qiladi:** mijoz "Xizmatlar" katalogi 7–11 soniyada ochiladi, qidiruv natijasi ~12 soniyada keladi.
- **Taxminiy sabab:**
  - Har bir `LegalService` uchun `metadata_items` va `category` alohida so'rov bilan yuklanadi (N+1).
  - `search_services` barcha xizmatlarni xotiraga olib, har birida `normalized_search_text()` ni Python'da hisoblaydi.
- **Taklif:**
  - `selectinload(LegalService.metadata_items)` va `selectinload(LegalService.category)`.
  - Normallashtirilgan qidiruv matnini alohida ustunda saqlash (xizmat saqlanganda yangilanadi) va `ILIKE` / trigram indeks bilan DB ichida qidirish.
  - `limit` ni SQL'da qo'llash.
  - Katalog ro'yxatini qisqa muddatga keshlash.

### 🟠 1.2 `POST /ai/classify` ~12 soniya
`ai_offer_levels()` ham barcha xizmatlarni metadata bilan yuklaydi (1.1 bilan bir xil muammo).

### 🟠 1.3 `POST /ai/document-analysis` ~33 soniya
- **Sabab:** OpenAI chaqiruvi sinxron bajariladi.
- **Taklif:**
  - Provayderga timeout qo'yish (masalan 20 s), oshsa heuristik natijani qaytarish.
  - Yoki fon vazifasi + natijani so'rab turish (polling).

---

## 2. To'lovlar

### 🔴 2.1 To'lov webhook'i yo'q — real invoice'lar hech qachon "paid" bo'lmaydi
- **Muammo:**
  - `POST /payments`, `POST /document-requests/{id}/payments` va `POST /orders/{id}/milestones/{mid}/pay` Payme/Click invoice yaratadi.
  - Lekin provayder callback'ini qabul qiladigan endpoint yo'q.
  - To'lovni tasdiqlaydigan yagona yo'l — `POST /payments/{id}/demo-confirm` (faqat DEMO_MODE).
- **Natija production'da:**
  - Hujjat so'rovlari `payment_pending` holatida qotib qoladi, `unlock-policy.can_generate=false` bo'lib turadi, PDF chiqmaydi.
  - Obuna (`subscription_plan`) faollashmaydi.
  - Maxfiy chat (`private_chat`) ochilmaydi.
  - Buyurtma bosqichi (`order_milestone`) "paid" bo'lmaydi.
  - Test mijoz akkauntida "To'lovlar" ro'yxatida bir nechta `document_request` va `gift` to'lovlari `pending` holatida turibdi.
- **Eslatma:** Telegram'da `payme.json` keldi (`"service": "Payme Merchant API Webhook (JSON-RPC 2.0)"`, `merchant_id` placeholder). Lekin `cognilabs-company/lexgo` repozitoriyasida (`7b7a89c`) `CheckPerformTransaction` va boshqa Payme metodlari yo'q. Webhook alohida servisda bo'lsa, u to'lovni LexGo backend'iga qanday "paid" qilib o'tkazishini hujjatlashtiring.
- **Kerak:**
  - `POST /payments/webhook/payme`, `POST /payments/webhook/click`: imzo tekshiruvi, takroriy callback'ni o'tkazib yuborish, idempotentlik (T0-09).
  - Hozir `demo_confirm_payment` ichidagi settle mantiqi bitta umumiy funksiyaga chiqarilsin va webhook ham shuni chaqirsin.

### 🟠 2.2 `demo-confirm` buyurtma bosqichini "paid" qilmaydi
`target_type="order_milestone"` to'lov `demo-confirm` qilinganda `OrderMilestone.status` o'zgarmaydi, faqat `mark-paid` o'zgartiradi. Staging'da bosqichlar oqimini sinab bo'lmaydi.

### 🟠 2.3 Buyurtma "paid", lekin barcha bosqichlar "to'lov kutilmoqda"
- **Qayerda ko'rindi:** test mijozdagi buyurtma `status=paid`, lekin `GET /orders/{id}/milestones` 3 ta bosqichni ham `pending` qaytaradi.
- **Sabab:** eski "avans" oqimida to'langan buyurtma uchun keyinroq to'lanmagan bosqichlar yaratilgan.
- **Kerak:** bosqichlar yaratilganda buyurtmaga tushgan to'lovlar hisobga olinsin (to'langan summa ulushlarga taqsimlansin) yoki migratsiya qilinsin.

### 🟡 2.4 To'lovlar tarixida `description` o'rniga xom `target_type`
- **Muammo:** `GET /payments` `description` maydonida `document_request`, `gift`, `order` qaytaradi.
- **Kerak:** hujjat nomi, reja nomi, xizmat nomi kabi odam o'qiydigan sarlavha. Frontend hozircha kalitni tarjima qilib ko'rsatadi.

---

## 3. AI va katalog

### 🔴 3.1 `/ai/classify` → `offer_levels` noto'g'ri
Test so'rovi: "shartnoma bo'yicha qarz qaytarilmayapti, sudga ariza berish kerakmi?"
- **Muammolar:**
  - 3 ta daraja (basic/standard/premium) o'rniga **1 ta** taklif qaytdi.
  - Taklif qilingan xizmat "**Shaxsiy advokat obunasi — Standard**", `base_price = 2` (2 so'm!). Bu obuna, yuridik xizmat emas.
- **Sabab (`ai_offer_levels`):**
  - `if category in haystack or not matched` sharti mos kelmasa ham ro'yxatning birinchi xizmatini qo'shadi.
  - Obuna yoki paket yozuvlari katalogdan chiqarib tashlanmagan.
  - Narx maydoni noto'g'ri saqlangan.
- **Kerak:**
  - Faqat katalog xizmatlari (metadata bor, `is_active`, obuna/paket emas).
  - Kategoriya bo'yicha kamida 3 ta xizmat, yetmasa oila yoki guruh bo'yicha to'ldirish.
  - Narx ma'lumotini tuzatish.

### 🟠 3.2 `/ai/classify` `summary` — foydalanuvchi matnining o'zi
`summary = payload.text[:240]`, ya'ni foydalanuvchi yozgani qaytib keladi. Haqiqiy qisqa xulosa bering yoki maydonni qaytarmang (frontend hozir takror matnni yashiradi).

### 🟠 3.3 Production'da fixture va test ma'lumotlari
- **Katalogda:** `FX-003 "fixture-ajrashish-hujjatlari" — LexGo demo xizmati`.
- **Advokatlar va mos kelishlarda:** "Demo Yurist 1..5", "Demo Advokat 3..9", "Test Yurist", "Full Check Advokat", "Civil Yurist".
- **`/matching/me` `area`:** `fixture-nikoh-shartnomasi, fixture-aliment-undirish`.
- **Kerak:** production bazasi fixture yozuvlaridan tozalansin (T0-07: fixture faqat staging uchun).

### 🟡 3.4 `/matching/me` formati
- `region` kalit bilan keladi (`tashkent`, `andijan`), frontend tarjima qiladi.
- `area` — vergul bilan birlashtirilgan xizmat slug'lari. Massiv (`[{id, title}]`) ko'rinishida bersangiz yaxshi bo'ladi.

### 🟡 3.5 `/pricing/quote` modifier'larida `label` yo'q
Faqat `code` (region / experience / seller_premium) keladi. Frontend kodni tarjima qiladi, lekin `label_uz/ru` bo'lsa, yangi koeffitsientlar ham avtomatik ko'rinadi.

### 🔴 3.6 AI manbalari modda va sanasiz (T1-04)
- **Muammo:**
  - `/ai/classify` va `/ai/legal-corpus` `sources` ichida faqat 4 ta portal havolasi keladi (lex.uz, advice.adliya.uz, gov.uz, my.gov.uz).
  - GM mezoni: "har javobda qonun manbasi (**modda, hujjat, sana**)".
  - Korpusda topilmasa "Ishonchli ma'lumotim yo'q" javobi va "foydali/foydasiz" feedback navbati yo'q.
- **Kerak:**
  - `sources[]` ichida `document_title`, `article`, `date`, `url`.
  - Topilmasa `answer_status: "no_reliable_source"`.
  - `POST /ai/feedback`.

### 🔴 3.7 Hujjat tahlili narxlari rejaga mos emas (T1-15)
- **Muammo:**
  - `document_analysis_quote`: 1 sahifa = 10 000, OCR +5 000/sahifa, advokat tekshiruvi **50 000**, shoshilinch +20%.
  - Reja (S-11/Ilova D) bo'yicha advokat tekshiruvi 1–5 sahifa **149 000**, 6–15 — 299 000, 16–30 — 499 000, 30+ — sahifasi 15 000, shoshilinch +50%, yozma xulosa +99 000.
  - AI tahlili obuna limiti ichida bo'lishi kerak (Free 1, Lite 5, Pro 20).
  - Fayl (PDF/DOCX) yuklab tahlil qilish endpoint'i yo'q, faqat `text` qabul qilinadi.
- **Kerak:** narx jadvalini rejaga moslash, fayl yuklash, natijani 6 bo'limda qaytarish (tur, xavflar, yetishmayotgan shartlar, qonunga zid bandlar, tahrirlar, xulosa).

---

## 4. Buyurtmalar va keyslar

### 🟠 4.1 `ServiceOrderOut` da xizmat nomi yo'q
Faqat `service_id` bor. Mijozning "Mening ishlarim" sahifasida buyurtma "Buyurtma" deb chiqadi. Qo'shish kerak: `service_title` (uz/ru), `lawyer_name`.

### 🟠 4.2 Mijoz o'z almashtirish so'rovlarini ko'ra olmaydi
- **Muammo:** `GET /replacement-requests` `replacements.manage` ruxsatini talab qiladi. Mijoz faqat `GET /replacement-requests/{id}/history` ni o'qiy oladi.
- **Oqibat:** frontend so'rov id'sini brauzerda saqlashga majbur (boshqa qurilmada yo'qoladi).
- **Kerak:** egasi uchun `GET /replacement-requests/me` yoki `?owner=me`.

### 🟠 4.3 To'lov kvitansiyasi to'liq emas (T1-13)
- **Muammo:** `GET /payments/{id}/receipt` PDF'ida faqat `Receipt ID`, `Status`, `Provider`, `Amount` matni bor.
- **Reja talab qiladi:** buyurtma raqami, sana, xizmat, ijrochi F.I.Sh. va tuzilma, to'lov usuli, **QR tekshiruv havolasi**, fiskal chek (OFD) havolasi, qaytarishda tuzatuvchi kvitansiya.

---

## 5. Referal

### 🟠 5.1 QR route yo'q
`GET /referrals/me` → `qr_url: "/referrals/{code}/qr"`, lekin bu so'rov **404** qaytaradi (jonli testda tasdiqlandi). Route qo'shilsin (PNG/SVG yoki `data:` URI).

### 🟡 5.2 Referal havolasi bosh sahifaga olib boradi
Havola `https://law-two-tau.vercel.app/?ref=CODE` ko'rinishida. Frontend endi kodni istalgan sahifada ushlaydi, lekin `/register?ref=CODE` to'g'riroq.

### 🟡 5.3 Referal `items`
Hozir `MarketplaceRecordOut` (`title`, `payload`, `price`) qaytadi. Aniq maydonlar bo'lsa yaxshi: `name`, `phone` (maskalangan), `status`, `reward`, `joined_at`.

---

## 6. Autentifikatsiya va xavfsizlik

### 🔴 6.1 Telegram'i ulanmagan foydalanuvchi 2FA bilan kira olmaydi
- **Muammo:** `deliver_user_otp` `telegram_chat_id` bo'lmasa 503 qaytaradi ("SMS provayderi hali ulanmagan" yoki "Tasdiqlash kanali ulanmagan").
- **Oqibat:** 2FA majburiy rollar (advokat, yurist, xodimlar) Telegram ulanmaguncha tizimga kira olmaydi.
- **Kerak (quyidagilardan biri):**
  - Ro'yxatdan o'tishda Telegram ulashni majburiy qilish.
  - Birinchi kirishda TOTP sozlashga yo'naltirish.
  - SMS kanalini ulash.

### 🟠 6.2 Parol tiklashda akkaunt borligi oshkor bo'ladi
`POST /auth/password/forgot` faqat mavjud foydalanuvchi uchun `deliver_user_otp` chaqiradi. Telegram yuborilmasa 503 qaytadi, mavjud bo'lmagan raqamga esa 200. Javob hamma holatda bir xil bo'lishi kerak (yuborish xatosini log'ga yozing).

### 🟡 6.3 Foydalanuvchi o'z roziliklarini o'qiy olmaydi
Faqat `GET /admin/legal/user-consents` bor. `GET /legal/consents/me` bo'lmagani uchun yangi qurilmada rozilik oynasi qayta chiqadi.

### 🟡 6.4 Haqiqiy `POST /identity/verify` yo'q
Faqat `POST /identity/verify-demo` bor. `identity/start` qaytaradigan `auth_url` placeholder (`https://demo.lexgo.identity/...`), OneID/MyID callback yo'q.

---

## 6A. Advokat akkaunti bilan jonli test (2026-09-15)

Test akkaunti: `role=advokat`, `account_status=active`, `verification.status=pending`, `limited_access=true`.

Frontend cheklangan rejimni to'g'ri ko'rsatadi:
- 10 ta bo'lim qulflangan va bosh sahifaga qaytaradi.
- "Buyurtmalarni qabul qilish / Maxfiy chat / Qo'ng'iroqlar" yopiq deb ko'rsatiladi.
- Onboarding 0/5.
- Barcha so'rovlar 2xx, JS xato yo'q.

Backend tomonda topilganlar:

### 🔴 6A.1 Advokat uchun majburiy 2FA login'da talab qilinmaydi
- **Muammo:**
  - `/auth/me`: `two_factor_enabled=false`, `two_factor_method=""`.
  - Akkaunt 428 bosqichisiz kirdi, garchi S-56 bo'yicha advokat va yurist uchun 2FA majburiy bo'lsa ham.
- **Kerak:** 2FA sozlanmagan majburiy rol login'da ikkinchi bosqichga (Telegram yoki TOTP) yo'naltirilsin yoki 2FA yoqilmaguncha cheklangan rejimda ushlab turilsin.

### 🟠 6A.2 Obuna rejalarida `audience` noto'g'ri
`GET /subscription-plans` 11 ta reja qaytaradi. `audience="seller"` bo'lib turganlar:

| slug | Muammo |
|---|---|
| `lexgo-ai-free`, `lexgo-ai-lite`, `lexgo-ai-pro` | T1-03 bo'yicha AI rejalari **hamma** foydalanuvchi uchun, mijoz ularni ko'ra olmaydi |
| `lexgo-ai-jismoniy-shaxs` ("Lexgo.AI — жисмоний шахс") | nomi "jismoniy shaxs" (mijoz), lekin advokatga ko'rsatiladi |
| `biznes-abonent-basic/standard/premium` | B2B (yuridik shaxs) rejalari advokat kabinetida chiqadi |
| `lexgo-ai-yurist-advokat-seller` | faqat shu reja haqiqatan advokat/yurist uchun |

- **Kerak:**
  - `audience` qiymatlarini aniqlashtirish: `personal` / `seller` / `all` / `business`.
  - Reja nomlari o'zbek lotinida bo'lsin, hozir ba'zilari kirillda ("Бизнес абонент", "жисмоний шахс").
- Frontend hozir advokatga `personal` bo'lmagan barcha rejalarni ko'rsatadi.

### 🟠 6A.3 Onboarding progress va "tekshiruvga yuborish"
- **Muammo:**
  - `GET /seller-onboarding/progress` 5 ta qadam qaytaradi, lekin 5/5 bo'lganda (`status=ready_for_review`) arizani moderatorga yuboradigan endpoint yo'q, avtomatik yuborilishi ham aniq emas.
  - "Hujjatlar" qadami `seller_onboarding` yozuvi `record_type="documents"` yoki `profile.proof_documents` bilan yakunlanadi. Advokat hujjat yuklaydigan aniq endpoint va format hujjatlashtirilmagan.
- **Kerak:** yuborish endpoint'i (yoki avtomatik yuborish qoidasi) va hujjat yuklash kontrakti.

### 🔴 6A.4 "LexGo Yurist" test akkaunti backend'da advokat bo'lib turibdi
- **Qayerda ko'rindi:**
  - Yurist sifatida berilgan akkaunt: ism "LexGo Yurist", ID `LGA-80577949`, telefon `…0007`.
  - `/auth/me` → `role: "advokat"`; `/lawyers/me/cabinet` va `/lawyers/me` → `seller_type: "advokat"`.
- **Natija:** frontend backend roliga qarab bu akkauntni **advokat portaliga** yo'naltiradi. Yurist kabineti (Ishlar bozori, Xizmatlarim, advokat talab qiladigan xizmatlarni yashirish — T2-11) umuman sinab bo'lmaydi.
- **Kerak:** test akkaunti `role="yurist"`, `seller_type="yurist"` qilib tuzatilsin (T0-07: har rol uchun alohida test akkaunt). ID prefiksi ham tekshirilsin (`LGA` — advokat).

## 6B. Sales operator akkaunti bilan jonli test (2026-09-15)

Test akkaunti: "LexGo Sales Operator", `role=client`, `roles=["sales_operator"]`, `permissions=[leads.manage, notifications.manage, orders.manage, sales.access]`.

Frontend tomonda:
- Menyu ruxsatlarga moslandi: Sotuv voronkasi, Call-markaz, Uchrashuvlar, Qo'ng'iroq tahlili, Ushlab qolish, Bildirishnomalar.
- Ruxsatsiz sahifalar endi ma'lumot so'ramasdan qaytaradi.
- Belgi "Sotuv operatori" deb chiqadi.
- Voronka ustunlari, manba va kategoriyalar tarjima qilinadi.

### 🔴 6B.1 Sales operator ham 2FA'siz kiradi
`/auth/me`: `two_factor_enabled=false`, login'da 428 yo'q. S-5 bo'yicha barcha ichki rollar uchun 2FA majburiy (T0-05). 6A.1 bilan bir xil muammo.

### 🔴 6B.2 Lidlar tizim hodisalaridan to'lib ketgan va dublikatlar filtrlanmaydi
- **Muammo:**
  - Voronkada **422 ta lid**, "Yangi" ustunida **405 ta**.
  - Ularning aksariyati `source="login"` yoki `registration` / `register_start`, nomi "LexGo Superadmin", "Audit User", "Security Audit", "LexGo Client", bitta telefon (`+998900000001`) bilan qayta-qayta takrorlanadi.
- **Taxminiy sabab:** har login yoki ro'yxatdan o'tish hodisasi lid yaratmoqda.
- **Oqibat:** T1A-05 bo'yicha dublikat telefon bo'yicha 72 soat ichida filtrlanishi kerak (GM: "Lidlar manbali, dublikat yo'q").
- **Kerak:**
  - Login hodisasidan lid yaratmaslik.
  - Dublikat filtri.
  - Mavjud soxta lidlarni tozalash.

### 🟡 6B.3 Sales operator ruxsatlari (keyingi bosqich T4-02 uchun)
- **Muammo:** `/call-center/queue`, `/call-center/calls`, `POST /call-center/calls` va mijoz qidiruvi (`/call-center/clients`) `is_call_center_user` yoki `users.manage` talab qiladi. `/b2b/clients` esa `b2b.manage` talab qiladi.
- **Oqibat:** sales operator qo'ng'iroq yoza olmaydi, mijoz qidira olmaydi, navbatni ko'rmaydi. Frontend bu bo'limlarni unga ko'rsatmaydi.
- **Kerak:** T4-02 (operator ish stoli) uchun ruxsatlar matritsasida aniqlashtirish (T0-06, PM tasdig'i).

### 🟡 6B.4 Kanban ustun nomlari bazada inglizcha
`DEFAULT_LEAD_KANBAN_COLUMNS` title'lari "New / Contacted / Qualified / Proposal / Won / Lost / Duplicate". Frontend default nomlarni tarjima qiladi, lekin bazada uz/ru nomlar bo'lgani to'g'ri.

## 6C. Superadmin va Admin akkauntlari bilan jonli test (2026-09-15)

Barcha 28–29 ta admin sahifasi ochildi, backend so'rovlari 2xx.
- Audit jurnali 651+ yozuv, CSV eksport ishlaydi (`200 text/csv`, ~125 KB).
- E2E readiness, integratsiyalar, rollar matritsasi ma'lumot bilan chiqdi.
- Admin'ga rollar sahifasi 403 qaytaradi, frontend endi uni URL orqali ham ochmaydi.

### 🔴 6C.1 Superadmin va Admin 2FA kodisiz kiradi
- **Muammo:**
  - `+998900000001` (superadmin) va `+998900000002` (admin) parol bilan to'g'ridan-to'g'ri kirdi, 428 yo'q.
  - Call-center lawyer (`+998900000003`) esa Telegram kodi so'raladi. Qoida rollar orasida bir xil emas.
- **GM T0-05:** "Admin kodsiz kirsa — bajarilmagan".
- **Kerak:** superadmin, admin va barcha ichki rollar uchun 2FA majburiy.

### 🔴 6C.2 Production'da test yozuvlari (T0-07)
- Shablonlar: "Admin tpl", "Document request list test".
- Reklama paketi: "Adm Ad".
- Shikoyatlar: "sssss", "e2e x", "e2e test complaint".
- Xizmat kategoriyasi: `fixture-business`.
- Ro'yxatdan o'tish so'rovlari: `yurist3`, `yurist7`, `yurist9` (10.09 dan beri kutilmoqda).
- Ko'p `seller_register` tasdiqlash so'rovlari kutilmoqda.
- Kategoriya nomlari kirillda ("A. Фуқаролик ҳуқуқи").

### 🟠 6C.3 Integratsiyalar ro'yxatida integratsiya bo'lmagan qatorlar
"Mobil API — Ulangan", "Payment Mode — Ulangan" integratsiya emas. "Demo Payment — Sozlanmagan" production ro'yxatida bo'lmasligi kerak. Payme va Click "Sozlanmagan" — to'g'ri (T0-14).

### 🟡 6C.4 Roziliklarda `audience` yo'q
`GET /legal/consents` 11 ta hujjat qaytaradi, lekin kimga tegishliligi ko'rsatilmaydi. Frontend hozir slug bo'yicha ajratadi:

| Slug | Kimga |
|---|---|
| `advocate_partnership` | advokat, yurist |
| `organization_agreement` | advokat |
| `payment_refund_warranty`, `age_18` | xodimlarga emas |
| `client_provider_contract` | buyurtmada imzolanadi, ro'yxatdan o'tishda emas |

**Kerak:** `audience: ["client","lawyer","advocate","staff"]` maydoni.

### 🟡 6C.5 Foydalanuvchi o'z roziligini qaytarib o'qiy olmaydi
Superadmin va admin har yangi qurilmada rozilik oynasini qayta ko'radi (6.3 bilan bir xil).

## 6D. Call-center lawyer akkaunti bilan jonli test (2026-09-15)

Akkaunt: "LexGo Call Center Lawyer", `+998900000003`, `role="advokat"`, `roles=["call_center_lawyer","sales_operator"]`.

Kirishda Telegram 2FA so'raldi (frontend "Telegram botga yuborilgan 6 xonali kod" deb ko'rsatdi). Call-markaz navbati, lidlar doskasi, mijoz qidirish, qo'ng'iroqlar, uchrashuvlar, namunalar ochiladi, 403 yo'q.

### 🟠 6D.1 Call-center yuristining asosiy roli `advokat`
- **Muammo:**
  - Ichki xodim (LexGo navbatchi yuristi, T1-12/T4-01) backend'da `role="advokat"`, tasdiqlanmagan sotuvchi sifatida turibdi.
  - Shu sabab advokat kabinetiga tushadi: "Ro'yxatdan o'tishni yakunlang 0/5", cheklangan rejim, sotuvchi obuna rejalari.
- **Kerak:** asosiy rol ichki xodim roli bo'lsin (`call_center` yoki `call_center_lawyer`) va sotuvchi onboarding'iga tushmasin.
- Frontend endi admin paneliga kirish huquqi bor xodimlarni login'dan keyin `/admin` ga yo'naltiradi.

---

## 7. Hujjatda bor, backend'da yo'q (LEXGO_REVIEW_FRONTEND_INTEGRATION.md)

| Hujjatda | Backend'da | Frontend hozir nima ishlatadi |
|---|---|---|
| `GET /contracts` (ro'yxat) | yo'q | shartnoma `document_request.contract_id` orqali ochiladi |
| `POST /matching/preview` | yo'q | `GET /matching/candidates` |
| `GET /leads`, `GET /call-center/leads` | yo'q | `GET /admin/leads`, `GET /call-center/leads/kanban` |
| Call-center navbatida lid uchun accept/decline | yo'q | `PATCH /call-center/leads/{id}/move`, `POST /matching/orders/{id}/assign-next` |
| `POST /calls`, `POST /calls/{id}/participants` | yo'l boshqacha | `POST /secure-chats/{room_id}/calls`, `.../participants` |
| `POST /identity/verify` | faqat `verify-demo` | `verify-demo` |
| T0-11 eksport uchun `audit.export` ruxsati | route `users.manage` ni tekshiradi | `users.manage` |

Hujjat yangilansin yoki route'lar qo'shilsin.

---

## 8. Boshqa kuzatuvlar

- 🟡 **E2E readiness soxta:** `GET /admin/e2e/readiness` ssenariy holatlarini qattiq yozilgan `"ready"` sifatida qaytaradi, haqiqiy tekshiruv yo'q.
- 🟡 **Tashkilot a'zosi roli:** `OrganizationMemberCreate.role_id` bor, lekin tashkilot egasi uchun rollar ro'yxati endpoint'i yo'q. Frontend rol tanlashni ko'rsata olmaydi.
- 🟡 **WebSocket auth xatolari:** `event:"error"` frame sifatida keladi (frontend endi buni ushlaydi). Standart close code'lar (4401/4403) bilan yopish ham tavsiya etiladi.
- 🟡 **`/orders/{id}/status` 409:** `detail` obyekt (`current_status`, `allowed_next_statuses`) — yaxshi, shu format boshqa 409'larda ham bo'lsin (masalan `/orders/{id}/accept` "Order boshqa yurist tomonidan olingan" hozir oddiy matn).

---

## Frontend tomonda qilingan ishlar (ma'lumot uchun)

- **2FA va OTP:** `method:"telegram"` va 503 kanal xatosi qo'llab-quvvatlandi.
- **To'lov va buyurtmalar:**
  - Demo bo'lmagan to'lov `POST /payments` orqali ketadi.
  - Buyurtma bosqichlari ketma-ket to'lanadi: faqat birinchi to'lanmagan bosqich to'lanadi.
- **AI va katalog:**
  - Katalog qidiruvi `/services/search`, xizmat pasporti, `/matching/candidates` va `/pricing/quote` modifier'lari ishlatiladi.
  - `/ai/legal-corpus`, `offer_levels`, `sources` va `disclaimer` ko'rsatiladi.
  - Hujjat tahlili quote + natija bilan ishlaydi.
- **Hujjat va shartnoma:** hujjat PDF'i `unlock-policy` → `generate` → `file` (Blob) tartibida olinadi. Shartnomani OTP bilan imzolash qo'shildi.
- **Admin:** audit filtrlari va CSV eksport, call-center navbati va doska.
- **Xatolar va real vaqt:**
  - 402/403/409/422/429 xatolari ishlanadi.
  - WebSocket qayta ulanishi exponential backoff bilan.
