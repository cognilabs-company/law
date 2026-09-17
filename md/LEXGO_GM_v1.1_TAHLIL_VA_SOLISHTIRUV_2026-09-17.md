# LexGo — GM qabul tekshiruvi v1.1 (17.09.2026) tahlili va tizim bilan solishtiruv

**Sana:** 2026-09-17
**Asos:** `LexGo_GM_Qabul_tekshiruvi_v1.1 3.docx` (9 701 qator matn; law/ va Telegram papkasidagi ikki nusxa bir xil — md5 `52569c83…`).
**Solishtirildi:** frontend (main, bugungi `fa78bbd` + batch 3), backend `bb5945d` (production `lexgo.api.cognilabs.org`), oldingi test hisobotlari (`LEXGO_GM_QABUL_TEST_NATIJASI_2026-09-16.md`, `LEXGO_LOYIHA_TAHLILI_VA_HOLAT_2026-09-17.md`, `LEXGO_BACKEND_ISSUES_2026-09-15.md`).

---

## 1. v1.1 hujjati nima o'zgartirdi (v1.0 ga nisbatan)

v1.0 (14.09) — qisqa variant, har vazifada 3–6 qadam. v1.1 — **batafsil qo'llanma**: har vazifa kartochkasi 8 qismdan iborat va **har talab alohida raqamlangan**. Endi qabul «vazifa bo'yicha» emas, **«talab bo'yicha»** yoziladi («T1-02: qisman. 1–7, 9–11 bajarildi, 8 bajarilmadi»).

Yangi narsalar:

| Bo'lim | Mazmuni | Bizga ta'siri |
|---|---|---|
| 1.2 Kartochka tuzilmasi | Tur/Holat, Kim tekshiradi, Tayyorgarlik, **Talablar (raqamli)**, Qadamlar (har qadam qaysi talabni tekshiradi), **Bajarilmagan belgisi**, Eslatma | Har talab uchun alohida dalil kerak |
| 1.4 Tur | Aniq / **Kontent** (PM matni kelmasa ham test-ma'lumot bilan qabul qilinadi) / **Bloklovchi** (shartnoma/kalitsiz — «kutilmoqda») / Shartli (faqat T3-06 «LexGo balansi») | Kontent va bloklovchi vazifalar bizni to'xtatmaydi |
| 1.5 Qoidalar | «Tez kunda», «dasturchi orqali» = bajarilmagan; ikki brauzer (mijoz + advokat) bilan tekshirish; menyu nomi farqi xato emas, **funksiya yo'qligi xato** | Har funksiya UI'da tugma sifatida bo'lishi shart |
| 1.6 Test-akkauntlar | Mijoz ×3 (+Telegram bog'langan/bog'lanmagan, yuridik shaxs, Lite/Pro/Standart/Premium), advokat ×3 (tuzilmali/tuzilmasiz/tasdiqlanmagan), yurist, super_admin ×2, admin, executive, ceo_viewer, moderator, finance, quality_control, content_manager, call_center_lawyer, sales_operator, sales_head, b2b_manager, marketing, yangi telefonlar | T0-07 seed'i shularni yaratishi kerak — hozir bunday to'plam **yo'q** |
| 1.8 Taymerlar jadvali | OTP 2/15 daq/60 s, 10 SMS/kun; sessiya 8 s/2 s; ish vaqti Du–Sha 09–19; javob 30/15/5 daq; avtotasdiq 3 ish kuni; SLA 60/30 daq; almashtirish 48 s; sovush 24 s; moderator 24 s; baho 3/7 kun; dublikat 72 s; issiq lid 5/30 daq, eskalatsiya 2 s; shikoyat 24 s/3 kun; nizo chati 7 kun; payout payshanba/3 kun/100 000; referal 14 kun/90 kun; avtoto'lov 0/+3/+7, grace 7, 90 kun; konsultatsiya 5/1/2/10 daq; transkript 24 s; signed URL 15 daq | Staging'da qisqartirib, keyin real qiymatga qaytarish talab qilinadi |
| 3. Ko'chgan/bekor | T2-05→T1B-04, T2-07→T1B-03/05, T3-04→T1B-09, T5-03→T1B-08, T7-01→T4-08, **T7-04 bekor** (lid sotilmaydi) | Task-tizimda eski ID'lar yangisiga ko'chirilishi kerak |
| 4. Bosqichni yopish | Har vazifa PM belgisi bilan «qabul qilindi»; demo-ssenariy o'tilgan; E2E hisobot (T1-18, T1B-10); taymerlar qaytarilgan; demo payshanba 16:00, 60 daq; PM 2 ish kunida javob bermasa — tasdiqlangan (S-61) | Har bosqich uchun **dasturchi E2E hisoboti** majburiy |
| 5. Production ro'yxati | 12 shart: OTP yopiq, demo/seed/docs yo'q, 2FA hamma ichki rolda, real to'lov, UZ hosting + TLS 1.3, PII niqoblash, 10 huquqiy hujjat real matn, pentest + audit, SPF/DKIM/DMARC, marketing raqamlari real, console/mobil audit, login/OTP cheklovlari | Hozir 12 tadan **0** tasi to'liq |

Har bosqich oxirida **«demo-ssenariy»** — payshanba demosida aynan shu tartibda ko'rsatiladi (0-bosqich 8 band, 1A — 8, 1B — 7, 2 — 6, 3 — 6, 4 — 6, 5 — 5, 6 — 4, 7 — 3).

---

## 2. Loyihani tushunish — qisqa xulosa

LexGo.uz — yuridik xizmatlar ekotizimi. Uch tomon: **mijoz** (jismoniy/yuridik), **ijrochi** (advokat — tuzilma orqali to'lanadi; yurist — shaxsan), **LexGo xodimlari** (12 ichki rol + executive). Pul oqimi: mijoz → milestone (30/40/30) → provayder split → LexGo komissiyasi (18%, tuzilma 5+ advokat 15%, referal 16/15/13%) + ijrochi. Mijoz jalb qilish voronkasi: **LexGo.AI** (anonim 2 savol/kun → telefon tasdig'i → oyiga 5 bepul) → tasnif → 3 darajali taklif → **lid** (UTM bilan CRM'ga) → buyurtma. Ishonch mexanizmlari: moderator reestr tekshiruvi, g'alaba statistikasi (5+ tasdiqlangan ish), Bayes reytingi, append-only audit, PII niqoblash, chatda kontakt bloklash (to'lovgacha), roziliklar jurnali (10 hujjat, versiyali). O'z xodimlari uchun: navbatchi yurist (60 daq SLA, buzilsa 30% avtoqaytarish), operator ish stoli (kanban, 360°, skoring 0–100), SOS (Toshkent, 3/15/60 daq).

Bosqich tartibi: **0 → 1A → 1B → 2 → 3 → 4 → 5 → 6 → 7**; 1A boshlanishidan oldin T0-01/06/07/08/09/16/17/20 qabul qilingan bo'lishi kerak.

---

## 3. Umumiy holat — talab darajasida

Belgilar: ✅ barcha talablar bor · 🟡 qisman (bajarilgan/jami talab) · ❌ deyarli yo'q · 🔒 bloklovchi/provayder · 🧪 bugun qurildi, GM bo'yicha jonli test kerak.

| Bosqich | Vazifa | Talab (jami) | ✅ | 🟡 | ❌ | 🔒 | Bajarilgan talab (taxminan) |
|---|---|---|---|---|---|---|---|
| 0 | 20 | 106 | 1 | 12 | 5 | 2 | ~38 (36%) |
| 1A | 26 | 209 | 0 | 14 | 12 | 0 | ~62 (30%) |
| 1B | 10 | 91 | 0 | 4 | 6 | 0 | ~17 (19%) |
| 2 | 9 | 62 | 0 | 6 | 3 | 0 | ~20 (32%) |
| 3 | 13 | 86 | 0 | 6 | 7 | 0 | ~18 (21%) |
| 4 | 8 | 51 | 0 | 4 | 3 | 1 | ~12 (24%) |
| 5 | 7 | 43 | 0 | 5 | 1 | 1 | ~15 (35%) |
| 6 | 5 | 19 | 0 | 0 | 3 | 2 | 0 |
| 7 | 3 | 17 | 0 | 1 | 2 | 0 | ~2 |
| **Jami** | **101** | **684** | **1** | **52** | **42** | **6** | **~184 (27%)** |

Talab bo'yicha ~27%, vazifa bo'yicha «to'liq qabul» — faqat **T4-06** (upsell/retention navbati). v1.0 hisobotida 8 vazifa ✅ edi; v1.1 talablarni raqamlab, har birida yangi qadamlar (admin sozlamasi, jurnal, statistika) qo'shgani uchun ular endi 🟡 ga tushdi (T0-04 — «3 xato → 15 daq blok» tekshiruvi; T0-13 — advokat onboarding 5 qadam telefon kamerasi bilan; T1-13 — kvitansiya QR/tuzatuvchi chek; T1A-08 — ilova QR + 90 kun cookie; T5-05 — bosh ekranda progress (bugun qo'shildi) va h.k.).

---

## 4. Vazifa-ma-vazifa solishtiruv

Har qatorda: talablar soni → holat → nima bor / nima yo'q → mas'ul (**FE** / **BE** / **PM**).

### 0-bosqich (20 vazifa)

| ID | Talab | Holat | Bor | Yo'q | Mas'ul |
|---|---|---|---|---|---|
| T0-01 Muhitlar | 4 | 🟡 2/4 | Prod'da demo-pay/seed 404; `DEMO_MODE` bor | 6 ta demo manzil hammasi bitta flag ostida ekani ko'rsatilmagan; staging manzili yo'q | BE/Dev |
| T0-02 OTP | 8 | 🟡 3/8 | 6 raqam, 2 daq, 60 s resend, 3 xato blok (FE taymerlari bor) | **Prod'da kod umumiy Telegram test-chatga ketadi** (`telegram_otp_test_mode`); kunlik 10 SMS ko'rsatilmagan; staging ekranida kod ko'rsatish yo'q | BE |
| T0-03 openapi | 2 | 🟡 1/2 | — | Prod'da `/docs`, `/openapi.json` ochiq | BE |
| T0-04 Parol tiklash | 5 | 🟡 4/5 | Havola, forgot/reset, eski parol ishlamaydi | 3 xato → 15 daq blok jonli tasdiqlanmagan | BE/test |
| T0-05 2FA/sessiya | 8 | 🟡 2/8 | Yurist/advokat/cc/sales'da 2FA so'raladi; mijoz profilida yoqish bor | **Superadmin/Admin 2FA'siz** (primary role = client); sessiya 8 s/2 s yo'q; rol berish/rekvizitda qayta 2FA yo'q; executive roli yo'q | BE |
| T0-06 Rollar | 12 | 🟡 5/12 | Rollar ro'yxati (13 ta + TEST), matritsa (bugun `[object Object]` tuzatildi), URL bilan kirish bloklanadi (bootstrapOk) | executive roli; 2 super_admin tasdig'i; admin faqat 6 rol; o'ziga rol berish taqiqi; packages.create/approve; rol berish 2FA+audit | BE (+FE ko'rsatish) |
| T0-07 Seed | 12 | ❌ 1/12 | Bitta seed buyrug'i bor | 38 kategoriya (17 emas), guruh darajasi yo'q, «Tez kunda» yo'q, 38/57 advokatda narx «—», Demo/Test nomlar, 3 paket/3 tuzilma/10 shablon/5 mijoz/3 cc xodim to'plami yo'q, har rol akkaunti yo'q | BE |
| T0-08 Bildirishnoma | 7 | 🟡 2/7 | Yagona `notify_user`, kanallar (in_app/push/telegram) | Admin'da hodisa×kanal×ustuvorlik sozlamasi, 3 tilli matn tahriri, SMS faqat kritik, navbat ko'rinishi, SMS sarfi hisoboti | BE + FE (admin ekranlari) |
| T0-09 To'lov abstraksiyasi | 8 | 🟡 3/8 | PaymentProvider + DemoProvider, `payment_mode`, commission_payer | 8 funksiya to'liq emas (tokenize/chargeToken/split?), idempotentlik, vebhuk imzo/takror, getStatus qayta tasdiqi, tashlab ketilgan to'lov hisoboti + issiq lid | BE |
| T0-10 Identifikatsiya | 5 | 🟡 2/5 | IdentityProvider + demo, `identity_verified*` maydonlar, «Tasdiqlangan» bejji (FE) | Tasdiqlanmagan advokat uchun ikki rejim sozlamasi; biometrik saqlanmasligi ko'rsatilmagan | BE (+FE sozlama) |
| T0-11 Audit | 5 | 🟡 2/5 | Audit sahifasi, hash zanjiri, CSV eksport (FE) | Fayl harakatlari, status o'zgarishida eski/yangi/sabab/IP/qurilma, eksport ruxsati va jurnalga yozish, shubhali kirish ogohlantirishi (faqat IP o'zgarishi bor) | BE |
| T0-12 Console audit | 3 | 🟡 | Asosiy sahifalarda qizil xato yo'q (bizning testlar) | Dasturchi ko'rsatadi; ba'zi 403/404 (cc client 360, /admin/test-otps) | Dev |
| T0-13 Mobil | 3 | 🟡 2/3 | 360–414 px asosiy sahifalar, meeting room (bugun) | Onboarding 5 qadam telefonda + kamera skaner (bugun `capture` qo'shildi — test kerak) | FE (test) |
| T0-14 Integratsiyalar | 2 | 🟡 1/2 | `/integrations/status` real tekshiruv (AI, Telegram) | Payme/SMS/MyID «sozlanmagan» deb ko'rsatilishi tekshirilmagan | BE |
| T0-15 Telegram bot | 6 | 🟡 4/6 | Bot, deep link, OTP botga, bildirishnoma, botdan lid | Bog'lash taklifi onboarding oxirida (FE); sovg'a havolasi (T5-04) | FE + BE |
| T0-16 Tiyin | 5 | 🟡 2/5 | `price_tiyin` maydonlari; FE `uzs()` yaxlitlash | Migratsiya ko'rsatilmagan; 1000 so'mga pastga yaxlitlash; paket taqsimoti farqi; moliya yoyilmasi/eksport | BE |
| T0-17 PII | 5 | 🔒/❌ 0/5 | — | Niqoblash qatlami ko'rsatilmagan, avtomatik test yo'q, Sentry filtri | BE |
| T0-18 Huquqiy hujjatlar | 6 | 🟡 3/6 🧪 | **Bugun:** Admin → «Huquqiy hujjatlar» (10 slug, versiyalar, ko'rish, yangi versiya formasi, «Roziliklar jurnali» user_id/hujjat filtri); ro'yxatda alohida checkbox'lar | Backend'da 11 slug bor (17.09), lekin matnlar ~50 belgili placeholder; **yozish API yo'q** (POST/PUT `/admin/legal/consents`); jurnalda qurilma maydoni yo'q; «muhim/kichik» yangilanish mantiqi (`requires_reaccept`) yo'q | BE |
| T0-19 Hosting rejasi | 7 | 🔒 | — | Reja hujjati yo'q | Dev/PM |
| T0-20 Ish vaqti | 4 | 🟡 3/4 🧪 | `/business-hours` (Du–Sha 09–19, bayramlar), FE `responseDeadline` (T0-20 muddat qatori — kecha qurildi) | SLA va avtotasdiq ham shu servisdan ekani ko'rsatilmagan; mijozga «ertalab 09:00 dan keyin» xabari — FE'da muddat ko'rinadi, matn shakli tekshiriladi | BE |

### 1A-bosqich (26 vazifa)

| ID | Talab | Holat | Bor | Yo'q | Mas'ul |
|---|---|---|---|---|---|
| T1-01 Ro'yxat | 5 | 🟡 2/5 | Ism/telefon/hudud majburiy, alohida checkbox'lar | Anonim AI 3-savolda telefon taklifi (limit 5 → 2 kerak, BE), anonim tarix akkauntga ulanishi, Telegram taklifi oxirgi qadamda (FE) | BE + FE |
| T1-02 AI limit | 11 | 🟡 3/11 🧪 | Server limit (402), **bugun**: «oxirgi bepul savol» xabari, `5 tadan N` hisoblagich (localStorage) | Admin'da limit modeli, anonim 2/kun, captcha, 3-savol taklifi, usage `/auth/me`da yo'q, issiq lid, so'rov logi | BE + FE (admin ekrani) |
| T1-03 AI obuna | 10 | 🟡 3/10 | Rejalar backend'da, demo to'lov (staging), muddat chegirmalari (−10% — GM −15%) | Free/Lite/Pro mijozga ko'rinmaydi (audience), 50% advokat, hisoblagich, upgrade proporsional/downgrade davr oxirida, imtiyoz maydonlari | BE + FE |
| T1-04 AI korpus | 11 | ❌ 2/11 | Disclaimer (FE, 4 til), foydali/foydasiz | Manba (modda/sana `None`), «bilmayman», 4 korpus admin'da, lex.uz yangilanish, so'nish, saqlash, moderator navbati, eksport disclaimer, cc-yurist javobida disclaimer yo'qligi | BE |
| T1-05 3 daraja | 8 | 🟡 2/8 | `offer_levels` (bir xil 3 taklif), lid yaratish | Daraja farqi, qizil blok (FE bor, BE `urgency` bermaydi), SOS tugmasi, admin sozlama/A/B, voronka, skoring | BE + FE |
| T1-06 Katalog | 10 | 🟡 3/10 | Kategoriya → xizmat, qidiruv, admin CRUD, SEO qisman | 17 oila/guruh darajasi, sinonimlar majburiy, drag-drop, 301, Excel, feature flag «Tez kunda» + «Xabardor qiling», xato/kirill/ru qidiruv, xizmat sahifasida advokat soni/narx oralig'i | BE + FE |
| T1-07 Pasport | 13 | 🟡 5/13 | Pasport (FE ServicePassport, kecha value/kun tuzatildi), qoralama holati | 14 guruh to'liq emas (hujjatlar ro'yxati, milestone ulushlari, kafolat, FAQ, versiyalash) — admin formasi ham | BE + FE |
| T1-08 Narxlash | 13 | 🟡 4/13 | `/pricing/quote` (hudud/staj), «Nega bu narx?» modal (FE) | Koeffitsientlar GM jadvaliga mos emasligi tekshirilmagan, tuman −5%, 70–100% oraliq tekshiruvi, snapshot, admin qoidalar/A/B, komissiya qatori yo'qligi | BE + FE (oraliq validatsiyasi) |
| T1-09 Saralash | 6 | 🟡 3/6 🧪 | **Kecha:** filtrlar (reyting, staj, til, narx), «Yangi» bejji + kvota; matching_mode xizmatda | Jins/onlayn/Super filtri (API'da maydon yo'q), vaznlar admin'da + A/B, impression/click yozuvi | BE |
| T1-10 Buyurtma oqimi | 13 | 🟡 4/13 🧪 | 19 status, tarix (`/orders/{id}/status-history`), **bugun:** mijozda «Tarix» panel, advokat modalida keyingi qadam tugmalari; 5 sodda bosqich (FE); 30 daq muddat (FE) | Status nomlari GM'dan farq (18+8), taymer advokat ekranida sanoq, javobsizlikda «yana 3 advokat», auto 15 daq/5 urinish, oqibatlar, rad sabab majburiy (**bugun FE'da bor, BE saqlamaydi**), kontakt maskalash to'lovgacha, tarixda IP/qurilma | BE + FE |
| T1A-01 Milestone | 10 | 🟡 4/10 | Milestone'lar, pay/release (FE OrderMilestones), `payment_mode`, commission_payer | 30/40/30 pasportdan, avtotasdiq 3 ish kuni + eslatmalar, rad/bekor qaytarish qoidalari, disputed'da to'xtash | BE |
| T1A-02 Onboarding | 10 | 🟡 6/10 🧪 | **Bugun:** 5 qadam (shaxsiy+selfi, kasbiy+litsenziya skan, ixtisoslik/hudud/til/ish vaqti, narx (tavsiya oraliq), ko'rib chiqish + alohida roziliklar), har qadam saqlanadi (24 s), «Tasdiqlash kutilmoqda» | Yurist uchun «advokat talab qilinadigan» filtri, xizmat bo'yicha narx (hozir umumiy soatlik), tugallanmagan → advokat lidi (BE), «Profil kuchi» (OnboardingProgress bor — nomi/mazmuni moslash), moderator 24 s | FE (kichik) + BE |
| T1A-03 Tuzilma | 7 | 🟡 2/7 | Organizations moduli, advokat→tuzilma | Tuzilmasiz qabul taqiqi, admin tasdig'i bilan almashtirish, rekvizit tuzilmada, 2FA+24 s sovush+xabar, yuristda maydon yo'qligi | BE + FE |
| T1-11 Kabinet | 9 | 🟡 6/9 🧪 | Kabinet, yangi buyurtmalar (qabul/rad+sabab), faol ishlar, xabarlar, profil, **Ko'rsatkichlarim + «Ta'tildaman»** (kecha, localStorage) | «Ish vaqtim» sozlamasi (bugun onboarding'da bor, kabinetda yo'q), ta'til BE'da (buyurtma kelmasligi), tuzilma ogohlantirishi | FE + BE |
| T1-12 Kol-markaz | 12 | 🟡 3/12 | Navbat (FE CallCenterQueue), cc xizmatlar, 100% LexGo | 99 000/399 000 narxlar, ustuvorlik, 3 guruh, 3 chat limiti, kutish vaqti, SLA 60/30, 30% avtoqaytarish, taymer/eskalatsiya, tungi bot javobi | BE + FE |
| T1-13 Ishlarim/cheklar | 6 | 🟡 3/6 | Buyurtmalar 5 bosqich, to'lovlar ro'yxati, PDF kvitansiya (mavjud) | Kvitansiyada QR/tuzilma/holat, fiskal chek joyi, tuzatuvchi chek, qidiruv/sana filtri | BE + FE |
| T1-14 Shablon | 17 | 🟡 7/17 🧪 | **Kecha:** wizard, progress, qoralama, tur validatsiyasi, DOCX tugmasi, «3 tadan N» matni, kabinetda saqlanadi | 10 shablon turlari, {{#if}}/{{#each}}, 3 til/transliteratsiya, AI avtoto'ldirish, kolontitul+QR, watermark, 19 000 so'm, tashlab ketilgan lid, versiyalash, «Advokat tekshirsin — 149 000» taklifi | BE (+FE taklif bloki) |
| T1-15 Hujjat tahlili | 7 | 🟡 2/7 | AI tahlil sahifasi, narx so'rovi | 6 bo'limli natija, sahifa bo'yicha narx 149/299/499/15 000, shoshilinch/xulosa/−25%, OCR, limitlar, cc navbatiga tushish | BE + FE |
| T1-16 Baholash | 8 | 🟡 3/8 | Baho (FE), moderatsiya sahifasi | Faqat completed, 3 mezon, advokat javobi 500, avtofiltr, ≤3★ moderatsiya, o'chirish sababi, 3/7 kun eslatma, profil taqsimoti | BE + FE |
| T1-17 Bildirishnoma oqimi | 3 | 🟡 1/3 | Hodisalarning bir qismi | To'liq hodisalar ro'yxati, admin matn tahriri | BE |
| T1A-04 Shartnoma | 8 | 🟡 3/8 | Shartnoma PDF, OTP imzo (FE ContractSign), hash | Mazmun bandlari, ikkala tomon imzo, QR, qo'shimcha kelishuv, admin'da shablon matni | BE + FE |
| T1A-05 Lid | 4 | 🟡 2/4 🧪 | **Kecha:** UTM/landing/referrer/qurilma har lidga; manbalar: AI, xabardor qiling, bot | Tashlab ketilgan shablon/to'lov/onboarding lidlari, shahar (IP), ko'rilgan sahifalar, hujjatlar, **72 s dublikat** | BE |
| T1A-06 Almashtirish | 7 | 🟡 2/7 | Replacement request + history (FE) | 4 asos avtomatikasi, 48 s SLA, 50% kamaytirish, AI xulosa, «3 nomzod topildi» | BE |
| T1A-07 Aylanib o'tish | 4 | ❌ 0/4 | — | Chat maskalash (raqam/so'z/@/OCR), ogohlantirish→pasaytirish, hisobot, to'lovdan keyin ochish | BE + FE |
| T1A-08 Referal asos | 4 | 🟡 3/4 | Kod, havola, QR, referred_by, 90 kun (FE attribution) | Ijrochi kabinetida referal bo'limi (bugun dashboard'da progress qo'shildi; to'liq sahifa yo'q) | FE |
| T1-18 E2E hisobot | 8 | ❌ | Admin → E2E readiness sahifasi bor | 7 ssenariy hisoboti yo'q | Dev |

### 1B-bosqich (10 vazifa)

| ID | Talab | Holat | Bor | Yo'q | Mas'ul |
|---|---|---|---|---|---|
| T1B-01 Paketlar | 15 | 🟡 3/15 🧪 | 77 paket (BASIC/STANDARD/PREMIUM, included/excluded/duration), admin CRUD (bb5945d), **bugun:** mijozda «Paketlar» sahifasi («Alohida/Paketda/Tejaysiz», batafsil, buyurtma) | 14 guruh pasport, tarkib birliklari/guruhlar, 3 narx modeli, chegirma manbasi, snapshot, holatlar (qoralama→tekshiruvda→sotuvda), create≠approve, avtotekshiruv, advokat taklifi, Excel | BE + FE (admin konstruktor) |
| T1B-02 Konstruktor | 18 | ❌ 1/18 | Admin paket ro'yxati | Konstruktor UI, preview, versiya solishtirish, narx sinash, qoidalar, shaxsiy narx ruxsati, 8 qabul mezoni | BE + FE |
| T1B-03 Keys papkasi | 12 | 🟡 2/12 | Keys hujjatlari (FE CaseDocs), audit qisman | Bo'limlar, versiya, tur/hajm/antivirus, signed URL 15 daq, attachment, shifrlash, preview, saqlash muddatlari | BE + FE |
| T1B-04 Kalendar | 5 | 🟡 3/5 🧪 | Hodisa turlari, eslatmalar, **bugun:** muddat kalkulyatori (appeal/document/complaint/general, kalendarga qo'shish), har hodisada .ics yuklab olish | 5 tur nomlari (sud/tergov/uchrashuv/topshirish/apellyatsiya — hozir 4), eslatma 1 hafta/3 kun/1 kun/2 soat to'plami, Google Calendar | FE (turlar) + BE (Google) |
| T1B-05 Conflict check | 3 | 🟡 1/3 | `/conflicts/check`, `/lawyers/me/clients` (BE) | Advokat UI: «Mijozlar → yangi mijoz», buyurtmada qizil ogohlantirish | FE |
| T1B-06 AI vositalari | 5 | 🟡 1/5 | `ai case tools` (BE bb5945d) | Advokat UI: xulosa/xronologiya/yetishmayotgan/savollar, solishtirish, tahrir | FE |
| T1B-07 B2B minimal | 6 | 🟡 2/6 | B2B modul, invoice/contract/monthly-report (BE) | Yuridik shaxs ro'yxati, QQS bilan/QQS'siz narx, PDF'lar UI, vazifalar, hisobot UI | FE + BE |
| T1B-08 SOS | 12 | 🟡 2/12 | SOS so'rov (FE/BE), sos patch | 349 000/249 000 taklif, GPS+5 tugma+ovoz, 3 daq operator, parallel 10 km, «Yo'lga chiqdim»/xarita, SLA, 500 000, qamrov, jurnal/3 asossiz, tungi rejim | BE + FE |
| T1B-09 Shablon konstruktori | 7 | 🟡 3/7 | import-docx/zip/preview (BE bb5945d) | Admin UI: yuklash→maydonlar→tur→preview→tasdiq, versiya, Excel | FE |
| T1B-10 E2E 1B | 4 | ❌ | — | Hisobot yo'q | Dev |

### 2-bosqich (9 vazifa)

| ID | Talab | Holat | Bor | Yo'q | Mas'ul |
|---|---|---|---|---|---|
| T2-01 Dashboard | 5 | 🟡 3/5 🧪 | Bugun/Moliya/Yangi keyslar, **bugun:** payout paneli (keyingi payshanba, kutilmoqda/to'langan), reyting maslahati (kecha, «hozir N daqiqa, tavsiya 15») | Balans vidjeti «nizo oynasida … so'm» (BE'da nizo oynasi hisobi yo'q) | BE |
| T2-02 Xizmat/narx | 5 | 🟡 2/5 | Xizmatlarim (lawyer/services) | Shartlarga rozilik tasdig'i, 70–100% oraliq validatsiyasi, paket shaxsiy narx | FE + BE |
| T2-03 Profil/g'alaba | 9 | 🟡 3/9 | Profil, stats (FE), moderator verification | Jins/soha staji hujjati, g'alaba kiritish formasi + redact eslatma, hujjat o'chirilib xesh, «Statistika to'planmoqda» (<5), formula | BE + FE |
| T2-04 Reyting ko'rinishi | 4 | 🟡 1/4 | Reyting raqami | Tarkib, tarix grafigi, Super mezonlari, «Yangi» (<5 baho) — FE'da `isNew` bor, raqam yashirish yo'q | FE + BE |
| T2-06 Payout | 9 | 🟡 3/9 🧪 | `/payouts/me`, admin payouts, **bugun:** kabinetda balans/kutilmoqda/tarix, 100 000 qoidasi matni | Payshanba/3 kun nizo oynasi/oy oxiri (BE), rekvizit 2FA+sovush, 10 mln ikki tasdiq, hisobot/dalolatnoma PDF | BE |
| T2-08 Referal to'liq | 9 | 🟡 3/9 🧪 | `/referrals/me`, **bugun:** ijrochi dashboard'ida progress (5→16%, 10→15%, 20→13%) | Komissiya haqiqatan pasayishi, «faol» = 1 yakunlangan, 12 oy, mijoz 3/5/10, 14 kun oynasi, frod filtri, retrospektiv, ulashish matni | BE |
| T2-09 Qo'ng'iroq | 9 | 🟡 4/9 🧪 | **Kecha:** LiveKit xona (audio/video/ekran/chat, past sifat), meta-ma'lumot | Fayl yuborish qo'ng'iroqda, «faqat audio» tugmasi (chat bor, alohida rejim yo'q), yozib olmaslik/cc yozish ogohlantirishi, AI xulosa oqimi, transkript 24 s, «Ikkinchi fikr» | BE + FE |
| T2-10 Rad sabablari | 2 | 🟡 1/2 🧪 | **Bugun:** 9 sabab ro'yxati, «boshqa» — matn majburiy | BE body'ni saqlamaydi → admin statistikasi yo'q | BE |
| T2-11 Yurist cheklovlari | 3 | 🟡 2/3 | «Yurist» belgisi, tuzilma yo'q | advokat_required xizmatlar yuristga ko'rinmasligi (xizmat tanlashda filtr) | FE + BE |

### 3-bosqich (13 vazifa)

| ID | Talab | Holat | Bor | Yo'q | Mas'ul |
|---|---|---|---|---|---|
| T3-01 Moderator workflow | 10 | 🟡 2/10 | Verifications sahifasi (tasdiq/rad) | Dalil majburiy, 11 rad sababi, ko'rsatma, qora ro'yxat, 12 oy, litsenziya 30 kun, ish stoli statistikasi, g'alaba navbati | BE + FE |
| T3-02 Excel | 6 | ❌ 0/6 | — | Shablon eksport/import, xatolar fayli, qoralama, yo'riqnoma | BE + FE |
| T3-03 Narx qoidalari | 3 | ❌ 0/3 | — | Admin jadval, versiya, A/B | BE + FE |
| T3-05 Obuna konstruktori | 12 | 🟡 2/12 | Plans sahifasi (narxlar) | 16 imtiyoz parametri, muddat/limit/oila/avtouzaytirish sozlamalari, yashirin limit yo'qligi | BE + FE |
| T3-06 Nizolar | 13 | 🟡 3/13 | Shikoyat (FE), quality sahifasi, refund request | Muddatlar 24 s/3 kun, executive, to'lov to'xtashi, chatni 7 kunga ochish + jurnal, qaytarish qoidalari, Warranty, karta/balans, oqibatlar, bir ekran, analitika | BE + FE |
| T3-07 Rollar UI | 4 | 🟡 2/4 | Rollar sahifasi, matritsa ko'rish | Yangi rol yaratish/katak tahriri UI, rol berish qoidalari, packages.* | FE + BE |
| T3-08 KPI | 10 | 🟡 2/10 | CEO sahifasi (asosiy ko'rsatkichlar) | 3 daraja to'liq, formula tooltip, replika, filtr/taqqoslash, Excel/PDF, dushanba dayjest | BE + FE |
| T3-09 Sharhlar moderatsiyasi | 5 | 🟡 2/5 | Reviews moderatsiya (approve/reject) | Avtofiltr, ≤3★ navbat 24 s, javob moderatsiyasi, o'chirish faqat qoidabuzarlik + audit | BE |
| T3-10 Audit ko'rinishi | 3 | 🟡 2/3 🧪 | Filtr (kim/nima/qachon), CSV, **bugun:** «Anomaliya ogohlantirishlari» paneli (`/admin/security-events`, holat filtri) | Eksport alohida ruxsat + jurnalga yozilishi (BE) | BE |
| T3-11 Integratsiyalar | 3 | 🟡 1/3 | Holatlar sahifasi | Kalitlar faqat superadmin, «Test» tugmasi | BE + FE |
| T3-12 Reyting batch | 8 | ❌ 0/8 | — | Vaznlar 50/15/15/10/10, Bayes, so'nish, Super hisobi, tungi batch, admin sozlama | BE |
| T3-13 Reestr | 3 | ❌ 0/3 | — | Fayl yuklash + solishtirish | BE + FE |
| T3-14 Paket analitikasi | 3 | ❌ 0/3 | — | — | BE + FE |

### 4-bosqich (8 vazifa)

| ID | Talab | Holat | Bor | Yo'q | Mas'ul |
|---|---|---|---|---|---|
| T4-01 Navbatchi yurist ish stoli | 4 | 🟡 1/4 | Navbat + (kecha) mijoz qidiruv/karta, qo'ng'iroqlar tarixi | Bir ekranda 7 qism (keys tarixi, hujjat qidiruvi, shablonlar, namunaviy javoblar, AI), smena jadvali, KPI | FE + BE |
| T4-02 Operator | 8 | 🟡 4/8 🧪 | Kanban+ro'yxat (tezligi bugun optimistik), 360° (kecha), lid→buyurtma | Avtotaqsimlash, lid yoshi/2 s eskalatsiya, AI tarixi/sahifalar/hujjatlar, yo'qotilgan sabab majburiy (6 ta), reaktivatsiya 30/90 | BE + FE |
| T4-03 Skriptlar | 8 | 🟡 2/8 | Skriptlar moduli (BE), FE ro'yxat | Qaror daraxti, e'tirozlar, o'zgaruvchilar, o'ng panel + AI taklif, statistika | BE + FE |
| T4-04 IP-telefoniya | 5 | 🔒 2/5 | Qo'lda qo'ng'iroq jurnali (kecha CcCallForm), bot lid | Abstrakt qatlam, callback vazifasi, provayder | BE |
| T4-05 Skoring | 6 | 🟡 2/6 | Lid score (BE) | 10 qoida jadvali admin'da, 39/69 chegara, issiq 5 daq taymer, sovuq → avtovoronka | BE + FE |
| T4-06 Upsell | 2 | ✅ 2/2 | Retention navbati + natija | — | — |
| T4-07 Vaqt tarifli konsultatsiya | 13 | ❌ 1/13 | Meeting xona | Narxlar 49/89/129/239, ×1,3, ikkinchi fikr, server taymer, ogohlantirish/muruvvat, +10 daq, kechikish/kelmaslik qoidalari, yozuv | BE + FE |
| T4-08 B2B CRM | 7 | 🟡 2/7 | B2B admin sahifasi | Kompaniya kabineti, yurist biriktirish, KPI, prays-list, uzaytirish | BE + FE |

### 5-bosqich (7 vazifa)

| ID | Talab | Holat | Bor | Yo'q | Mas'ul |
|---|---|---|---|---|---|
| T5-01 Entitlements | 5 | 🟡 2/5 | `/clients/me/entitlements`, obuna sahifasi | Iste'mol hisoblagichlari (BE bermaydi), qo'shimcha sotib olish, upgrade proporsional | BE + FE |
| T5-02 Oila | 4 | 🟡 2/4 | Family members (BE/FE) | 3 oyda 1 almashtirish, reja bo'yicha qarindoshlik cheklovi | BE |
| T5-04 Sovg'a | 11 | 🟡 5/11 | Gifts sahifasi (tarif, yuborish, holat, bekor) | 12 oy → qaytarish/ko'chirish, muddat faollashtirilgan kundan, flayer PDF/PNG, 30 kun −30%, uzaytirish/farq, kod himoyasi | BE + FE |
| T5-05 Referal mijoz | 4 | 🟡 3/4 🧪 | Referal sahifasi, **bugun:** bosh ekranda progress kartasi | Ulashish matni tayyor (share bor), statistika «to'laganlar» ustuni | FE (kichik) |
| T5-06 Avtoto'lov | 5 | 🔒 1/5 | Recurring (BE demo) | 0/+3/+7, grace 7, 90 kun, bir bosishda tiklash — FE UI yo'q | BE + FE |
| T5-07 Retention | 4 | 🟡 2/4 | Retention navbati | Obuna tugash eslatmasi, haftalik yangiliklar, advokat churn ro'yxati | BE |
| T5-08 Gift KPI | 1 | 🟡 | Gift KPI (admin) | 8 ko'rsatkich to'liq emas | BE |

### 6-bosqich (5) — mobil ilova: ❌ boshlanmagan (T6-01/02/03), 🔒 T6-04 push, T6-05 nashr. Mobile API hujjatlari bor.

### 7-bosqich (3)

| ID | Talab | Holat | Yo'q |
|---|---|---|---|
| T7-02 Akademiya | 5 | 🟡 2/5 | Ro'yxat/to'lov/yopiq material/sertifikat |
| T7-03 Reklama | 6 | ❌ 1/6 | Slotlar, karusel, e'lonlar, «Reklama» belgisi (lawyers API'da promoted maydoni yo'q), statistika |
| T7-05 Tuzilma kabineti | 6 | ❌ 0/6 | Kabinet, taklif, daromad, 15%, hisobot, audit |

---

## 5. Bugun (17.09) frontend'da qilingan ishlar (v1.1 talablariga mos)

| Task | Talab № | Qayerda ko'rish |
|---|---|---|
| T0-18 | 1, 2, 3, 4 (FE qismi) | Admin → **Huquqiy hujjatlar** (yangi menyu, users.manage): 10 hujjat holati (matn kiritilgan / placeholder / nashr qilinmagan), «Ko'rish», «Yangi versiya» (backend yozish API yo'q — aniq xabar), tab **Roziliklar jurnali** (foydalanuvchi ID va hujjat bo'yicha filtr) |
| T1-10 | 4, 5 (FE), 11 | Mijoz → Ishlarim → **«Tarix»** tugmasi (status tarixi + mijoz uchun «Bekor qilish»/«Qabul qilish» qadamlari); Advokat/Yurist → Ishlarim → ish → modal pastida **Buyurtma tarixi** + keyingi qadam tugmalari (ishni boshlash → jarayonda → natija tayyor → topshirish) |
| T1A-02 | 1, 2, 3, 4, 5, 6, 7 (FE) | /register → Advokat: 5 qadam stepper (Shaxsiy · Kasbiy · Yo'nalishlar · Narx · Ko'rib chiqish); selfi (telefonda old kamera), litsenziya skan (orqa kamera); yo'nalishlar/hududlar/tillar/ish kunlari+vaqti; tavsiya oraliq + soatlik narx; har hujjatga alohida checkbox; brauzer yopilsa — «Oldingi ma'lumotlar tiklandi» |
| T2-10 | 1 | Advokat → Yangi buyurtmalar → «Rad etish» → 9 sabab, «Boshqa» — izoh majburiy |
| T1B-04 | 3, 5 | Advokat/Yurist → Kalendar → **«Muddat kalkulyatori»** (apellyatsiya 1 oy / hujjat 10 kun / shikoyat 30 kun / umumiy 7 kun, «Kalendarga qo'shish» — eslatma 1 kun oldin); har hodisada **⤓ .ics** tugmasi |
| T2-06 | 9 | Advokat/Yurist → Boshqaruv paneli → **Hisob-kitob (payout)**: kutilmoqda/to'langan/yozuvlar, keyingi payshanba, 100 000 so'm qoidasi, jadval |
| T2-08 / T5-05 | 8 / 3 | Advokat/Yurist va Mijoz boshqaruv panelida **referal progress kartasi** («N ta qo'shildi — yana M tadan keyin komissiya 16% / 25% chegirma») |
| T3-10 | 3 | Admin → Audit jurnali → tepada **Anomaliya ogohlantirishlari** (yangi/ko'rildi/hal qilindi filtri) |
| T1B-01 | 5, 6 (mijoz qismi) | Mijoz → **Paketlar** (yangi menyu): kod bo'yicha guruh, Basic/Standard/Premium, «Alohida: X · Paketda: Y · Tejaysiz: Z» (xizmat narxlari bo'lsa), kiradi/kirmaydi, muddat, «Batafsil», «Buyurtma berish» (→ xizmatlar sahifasi, `package_id` bilan) |

Kecha (16.09) qilinganlar: T1-14 wizard, T0-20 muddat, T1-02 «oxirgi bepul savol», T1-09 filtrlar/«Yangi», T1A-05 UTM, T1-11 ko'rsatkichlar/ta'til, kanban optimistik, call-markaz qidiruv/karta/qo'ng'iroqlar, Uchrashuvlar xonasi.

**Jonli test holati:** T1A-02 (5 qadam, validatsiya, qoralama tiklash) — anonim brauzerda o'tdi ✅. T0-18, T1-10, T1B-04, T2-06, T2-08, T5-05, T3-10, T1B-01, T2-10 — build o'tdi (tsc/eslint/i18n toza), lekin jonli tekshirish uchun **tasdiqlangan ijrochi / mijoz / superadmin sessiyasi kerak** (hozirgi Chrome'da tasdiqlanmagan Advokat turibdi, unda kabinet cheklangan).

---

## 6. v1.1 dan kelib chiqqan yangi frontend ishlar (backend bo'lmasa ham qilinadi)

1. **T1-11 «Ish vaqtim»** — kabinetda kunlar/soat sozlamasi (onboarding maydonlarini profil tahririga chiqarish).
2. **T1A-02 «Profil kuchi»** — OnboardingProgress'ni GM nomiga moslash + «tuzilma kiritilmagan» ogohlantirishi (T1A-03 §4).
3. **T1B-04** — hodisa turlarini 5 taga keltirish (sud majlisi, tergov, uchrashuv, hujjat topshirish, apellyatsiya), eslatma to'plami «1 hafta/3 kun/1 kun/2 soat».
4. **T1B-05** — Advokat → Mijozlar: «Yangi mijoz» formasi (`/lawyers/me/clients` POST bor) + yangi buyurtmada `/conflicts/check` natijasi (qizil ogohlantirish).
5. **T1B-06** — Keys → AI vositalari (4 tugma + solishtirish) — backend `ai case tools` bor.
6. **T1B-09** — Admin → Shablonlar → DOCX yuklash → maydonlar → preview → tasdiq (backend import-docx/zip/preview bor).
7. **T1B-07** — Yuridik shaxs ro'yxati (STIR, direktor, bank), QQS'siz/QQS bilan narx, invoice/contract PDF tugmalari (backend bor).
8. **T1-13** — To'lovlar: qidiruv + sana filtri; kvitansiya maydonlari tekshiruvi.
9. **T1-14** — yuklab olishdan keyin «Advokat tekshirsinmi — 149 000» + «To'ldirishda yordam» bloki; watermark preview.
10. **T2-02** — «Shartlar va narx siyosatiga roziman» tasdig'i; 70–100% oraliq validatsiyasi (tavsiya narx `/pricing/quote`dan).
11. **T2-04** — «Yangi» advokatda reyting raqamini yashirish; Super advokat mezonlari bo'limi.
12. **T3-07** — Rollar: yangi rol yaratish/katak tahriri UI (backend roles CRUD bor).
13. **T4-02** — yo'qotilgan lid sababi (6 ta) majburiy; lid yoshi qizil belgi.
14. **T5-06** — obuna sahifasida «Qayta tiklash» va to'lov urinishlari tarixi.
15. **T1-05** — qizil «shoshilinch» blok yuqorida (backend `urgency` berganda), SOS tugmasi obunachida.

## 7. Backend'siz bo'lmaydigan (hisobotga qo'shildi: `LEXGO_BACKEND_ISSUES_2026-09-15.md` §0E)

- T0-18: `POST/PUT /admin/legal/consents` (slug, version, title, body, is_active, requires_reaccept); jurnalda `device`; 10 slug seed.
- T1-10/T2-10: decline body `{reason, note}` saqlash + `/admin/decline-reasons/stats`; status tarixida `changed_by`, `ip`, `device`, `old_status`.
- T2-06: payout jadvali (payshanba, 3 kun nizo oynasi, 100 000, oy oxiri), `/payouts/me` da `period`, `dispute_hold`.
- T2-08: `/referrals/me` da `commission_rate`, `active_count`, tier; ijrochi uchun ham.
- T5-01: `/clients/me/entitlements` da iste'mol hisoblagichlari (`used/limit` har imtiyoz).
- T1-02: `/auth/me` yoki `/ai/usage` — `used/limit/reset_at`; anonim 2/kun.
- T1B-04: Google Calendar OAuth.
- T7-03: lawyers API'da `is_promoted` / ads slotlari.
- T1-09: lawyers API'da `gender`, `is_online`; `vacation` maydoni (T1-11).
- T1A-07: chat kontakt maskalash.
- Seed (T0-07) — GM 1.6 ro'yxatidagi barcha test akkauntlar.

---

## 8. Xulosa

- v1.1 hujjati **684 ta raqamlangan talab** qo'ydi; tizimda taxminan **27%** bajarilgan, to'liq qabul qilinadigan vazifa — 1 ta (T4-06).
- 0- va 1A-bosqichlar (46 vazifa, 315 talab) — birinchi navbat; ularda eng ko'p bloklovchi kamchiliklar **backend'da** (2FA, OTP test-chat, seed/katalog, AI manba, limitlar, milestone qoidalari, audit tafsilotlari).
- Frontend tomonidan bugungi 3 batch bilan T0-18, T1-10, T1A-02, T1B-01, T1B-04, T2-06, T2-08, T2-10, T3-10, T5-05 ning UI qismi tayyor; **6-bo'limdagi 15 ta ish** hali frontend'da qilinadi.
- Production ro'yxati (5-bo'lim, 12 shart) — hozircha hech biri to'liq emas; eng oddiylari: `/docs` yopish, OTP test-chat o'chirish, marketing raqamlarini real qilish.

---

## 9. 17.09 (kechki) — qo'shimcha frontend ishlar

| Task | Talab | Qayerda ko'rish |
|---|---|---|
| T1-11 §6,8,9 · T2-03 §1 · T1A-02 §9 | Ijrochi profili to'liq tahrirlanadi | Advokat / Yurist → **Profil**: Shaxsiy (rasm, F.I.Sh., email, viloyat, tuman, jins, tillar), Kasbiy (litsenziya + skan, ixtisoslik, tuzilma, staj, ma'lumot, bio), Yo'nalish va statistika («Statistika to'planmoqda» <5 ish), Narx (tavsiya 70–100 %), **Ish vaqtim va ta'til**, Ish tajribasi, xizmatlar, 2FA/Telegram/xabarnoma, «To'ldirilmagan: …» ro'yxati. Yurist uchun yangi *Profil* menyusi |
| T0-11 §5 · T3-10 §3 (foydalanuvchi tomoni) | Profil audit jurnali | Mijoz / Advokat / Yurist → Profil → **Faol sessiyalar** (chiqarish), **Xavfsizlik hodisalari** (IP o'zgarishi), **Harakatlar jurnali** (tur filtri + qidiruv) |
| T1B-05 §1,3 | Conflict check + mijozlar bazasi | Advokat/Yurist → Mijozlar → **Yangi mijoz** (telefon, JShShIR, qarshi tomon, vakillar), **Conflict tekshiruvi** (qizil ogohlantirish + qaysi ish bilan mosligi) |
| T1B-06 §1,2,5 | AI vositalari | Advokat/Yurist → Ishlarim → ish → **AI vositalari**: xulosa / xronologiya / yetishmayotgan hujjatlar / savollar / versiyalarni solishtirish → tahrir → tasdiqlash |
| T1B-09 §1,3,4,6 | Shablon konstruktori | Admin → Shablonlar → **DOCX / ZIP import**: fayl → maydonlar ro'yxati (tur bilan) → preview → qoralama |
| T2-02 §1,2,3 | Xizmat narxlari | Yurist → Xizmatlarim: har xizmatga narx (70–100 % oralig'i, 422 tekshiruvi), «Shartlar va narx siyosatiga roziman» majburiy |
| T2-04 §4 | «Yangi» advokat | Advokatlar ro'yxati: 5 tadan kam baho → raqam o'rniga «Yangi» |
| T4-02 §7 | Yo'qotilgan lid sababi | Admin → Lidlar doskasi / Call-markaz doskasi: «Yo'qotilgan» ustuniga o'tkazishda 6 sababdan biri majburiy (lid details'ga yoziladi) |
| T1-14 §11 | Yuklab olishdan keyingi taklif | Mijoz → Hujjat namunalari → tayyor hujjat: «Advokat tekshirsinmi — 149 000» va «To'ldirishda yordam — 399 000» |

Jonli tekshirildi (tasdiqlanmagan Advokat bilan): profil tahriri saqlanadi (`PUT /lawyers/me`), sessiyalar/xavfsizlik/harakatlar jurnali to'ladi, conflict tekshiruvi ishlaydi.

Backend'ga qo'shimcha (0E ga): `GET /lawyers/me/services` tanlangan narxlarni qaytarmaydi (#61); `PUT /lawyers/me` da `gender`, `work_days/from/to`, `avatar_url` yo'q (#56 kengaytirildi); `/call-center/leads/{id}` PATCH yo'q — operator lost_reason'ni `admin` PATCH orqali yozadi (leads.manage kerak) (#62).

## 10. 17.09 — tashqi tester hisoboti bo'yicha tuzatishlar

| # | Hisobotdagi muammo | Tekshiruv natijasi | Qilingan |
|---|---|---|---|
| 1 | Mijoz login → consent gate'dan keyin sahifalarda «Huquqiy hujjatlarni qabul qiling» qoladi | Lokal build'da qayta sinaldi (advokat sessiyasi, `lexgo_consents` tozalab): server'dagi 11 rozilik topildi, gate chiqmadi; navigatsiya va reload'da ham chiqmadi. Mijoz akkaunt bilan takrorlash uchun login kerak | Admin «Huquqiy hujjatlar» sahifasi backend slug'lariga moslandi (advocate_partnership, organization_agreement, client_provider_contract, payment_refund_warranty, personal_data) |
| 2 | Advokat/yurist login: 2FA oynasi o'rniga «Server bilan bog'lanib bo'lmadi» | Frontend 428 → 2FA oynasini ochadi (bu sessiyada yurist/advokat/cc/sales bilan bir necha marta o'tilgan). «Server bilan bog'lanib bo'lmadi» faqat fetch xatosi / 502–504 da chiqadi → tester muhitida proxy (`/api/backend`) backend'ga yetmagan yoki eski deploy | 5xx (kod yuborilmadi) endi «Serverda xatolik» deb alohida ko'rsatiladi; «internet» matni faqat 0/502/503/504 da |
| 3 | `/portal/advocate` → `/portal/lawyer`, sidebar yo'q, public footer | Bu sessiya roli boshqa bo'lganda (yurist advokat manzilini ochsa) redirect; redirect paytida shell `null` qaytarib public footer ko'rinardi | PortalShell/AdminShell redirect va yuklanish paytida portal chrome (spinner) ko'rsatadi — public navbar/footer chiqmaydi. Anonim: `/portal/advocate` → `/login` tekshirildi |
| 4 | `/portal/call-center`, `/portal/callcenter(/leads)` 404 | Call-markaz `/admin/call-center` da | Alias'lar qo'shildi: `/portal/call-center`, `/portal/callcenter`, `…/leads` → `/admin/call-center` |
| 5 | `/admin/dashboard`, `/portal/admin` 404; `/admin` seller'ga yo'naltiradi | `/admin` admin ruxsati yo'q sessiyani o'z portaliga qaytaradi (to'g'ri); admin (+998900000002) paroli 16.09 dan ishlamaydi (backend) | Alias'lar: `/admin/dashboard`, `/portal/admin` → `/admin`; `/portal/advokat`, `/portal/yurist` → mos portal |

Eslatma: tester ko'rgan 2–5 belgilar **eski deploy** (Vercel `law-two-tau`) bilan mos keladi — main'dagi so'nggi commitlar deploy qilinmagan bo'lsa, avval push/redeploy qilish kerak.

## 11. 17.09 — `LEXGO_BACKEND_PRODUCTION_POLICY_UPDATE.md` bo'yicha va qolgan frontend ishlar

Backend policy yangilanishi (frontend qismi qilindi):

| Backend | Frontend | Qayerda |
|---|---|---|
| `GET /platform/policies` | `getPlatformPolicies()` (5 daq kesh); ish maydoni yuklashda ruxsat etilgan kengaytmalar + hajm chegarasi; hujjat namunasida «Advokat tekshirsinmi» narxi policy'dan | Advokat/Yurist → Ish maydoni → Fayl qo'shish (qoidalar matni, `accept`); Mijoz → Hujjat namunalari |
| `GET/PUT /admin/platform/policies(/{section})`, `/history` | Admin → **Platforma qoidalari**: 6 bo'lim kartochkasi, tahrirlash (raqam/boolean/ro'yxat/JSON), versiyalar tarixi | Admin menyu → Tizim |
| `GET /admin/compliance/readiness` | O'sha sahifada tepada «Production tayyorgarligi» checklist (holat belgilari) | Admin → Platforma qoidalari |
| `content-reveal request/approve/status` | Xodim secure chatni ochganda **«Chat mazmuni yashirin»** paneli: sabab + «Ochishni so'rash», ikkinchi xodim «Tasdiqlash»; `[metadata_only]` xabarlar 🔒 bilan | Admin/xodim → /portal/chat/{room} |
| workspace `scan` metadata | Fayl kartasida antivirus holati belgisi (toza / tekshirilmoqda / xavfli) | Ish maydoni |
| Document analysis `pricing_rule` | Sahifa allaqachon backend quote'dan narx oladi — hardcode yo'q | Mijoz → Hujjat tahlili |

GM 6-bo'limdan qo'shimcha yopilganlar:

| Task | Qilindi |
|---|---|
| T1B-07 §1,2,3,4,6 (admin/b2b_manager tomoni) | Admin → B2B: kompaniya (STIR, direktor, oylik to'lov, SLA), bosqich tanlash, **Hisob-faktura** (QQS'siz / QQS 12% / jami, PDF), **Shartnoma** PDF, **Oylik hisobot** PDF (oy tanlash) — fayllar token bilan yuklab olinadi |
| T1-13 §6 | Mijoz → To'lovlar: qidiruv + sana oralig'i filtri |
| T1B-04 §1 | Kalendar hodisa turlari 5 ta: sud majlisi, tergov, uchrashuv, hujjat topshirish muddati, apellyatsiya muddati |
| T1A-08 §1 · T2-08 §8 | Advokat/Yurist → **Referal** sahifasi (kod, havola, QR, statistika); dashboard progress kartasi shu sahifaga olib boradi |
| T1A-02 §9 | Kabinetda «Profil kuchi: N%» indikatori |

Kutib turilganlar (backend yo'q / hujjatda aniq emas): T1B-07 mijoz tomonida yuridik shaxs ro'yxati va QQS'li narx (backend'da yuridik shaxs mijoz modeli yo'q; PATCH'da `address`/`bank` maydonlari yo'q — #63), T2-04 reyting tarixi/Super mezonlari, T1-05 shoshilinch blok + SOS (`urgency` backend'dan kelmaydi), T5-06 avtoto'lov tiklash, T3-07 rol yaratish UI (backend `POST /admin/roles` bor, lekin matritsa PUT shakli hujjatda yo'q), T1B-04 eslatma to'plami (bitta eslatma), T1-01 §5 Telegram taklifi (pending ro'yxatdan keyin token yo'q).

## 12. 17.09 — `LEXGO_CALL_WEBSOCKET_FRONTEND_UPDATE.md` bo'yicha

| Backend | Frontend |
|---|---|
| `wss://…/ws/users/me?token=` global socket, `call.incoming` | `lib/userSocket.ts` — sessiya bo'lgach bitta ulanish (eksponensial reconnect, tab qaytganda/online bo'lganda qayta), logout'da yopiladi. `IncomingCallWatcher` shu socketdan `call.incoming` oladi → qo'ng'iroq kartasi; uchrashuv → inline CallRoom (token `join-token` dan), 1:1 → chat sahifasi |
| Polling olib tashlash | Har 6 s `listSecureChats + listCalls` polling **o'chirildi**; `/calls/invited` faqat sahifa ochilganda, tab fokusga qaytganda va socket uzilganda (45 s fallback) |
| Room socket `call.*` eventlari | `lib/callEvents.ts` bus: SecureChat socketi `call.created / participant_* / updated / ended` ni tarqatadi; chat ichidagi «qo'shilish» kartasi `call.created`dan, `call.ended`da yo'qoladi; 5 s `listCalls` polling o'chirildi (faqat ochilganda va reconnect'da) |
| CallRoom | Ishtirokchilar ro'yxati eventlarda yangilanadi; `call.ended` → xona yopiladi; 3 s polling → 15 s fallback (uchrashuv mehmoni room socketsiz) |

Jonli tekshiruv: `/ws/users/me` ochildi va ochiq qoldi; 15 s davomida `/calls` so'rovlari — 0 (oldin har 6 s ≥ 13 so'rov).

## 13. 17.09 — Telegram bog'lash xatosi va Uchrashuvlar tuzatishlari

| Muammo | Sabab | Tuzatish |
|---|---|---|
| Mijoz → Telegram bog'lash: backend `{share_url, expires_at, status}` qaytaradi, frontend xato | Parser `share_url` maydonini o'qimasdi (faqat `deep_link/url/link/…`) | `startTelegramLink` endi `share_url` ni ham qabul qiladi |
| Ekran ulashishda qora bo'lib qotib, keyin qaytadi | Har `tick` (gapiryapti/ro'yxat/chat) da video element trekka qayta ulanardi (detach/attach); unsubscribe'da React'ga tegishli `<video>` DOM'dan olib tashlanardi | Tile faqat trek o'zgarganda ulanadi; unsubscribe'da faqat yashirin audio elementlar olib tashlanadi |
| Kamera almashtirishda «yaqinlashib qoladi», old kameraga 4–5 marta bosganda qaytadi | Barcha `videoinput` qurilmalar (tele/ultra-keng linzalar ham) ketma-ket aylantirilardi; telefonda 16:9 kesim 4:3 sensorni «zoom» qilib ko'rsatardi | `restartTrack({facingMode: user/environment})` — brauzer shu tomonning standart linzasini tanlaydi; fallback: label bo'yicha old/orqa qurilma; telefonda 4:3 (480×360) capture; almashtirish paytida tugma bloklanadi; ko'zgu faqat old kamerada |
| Dizayn sayt uslubiga mos emas | Referens rasmdagi to'q-kulrang/to'q sariq palitra | Sayt palitrasi: navy `--b900/850/800`, brend ko'k `--b600`/`--grad`, `--ok` yashil, tugash — qizil; radiuslar `--rl`, shriftlar `--fb/--fd` |

Jonli tekshirish: ikki akkaunt (host + mehmon) kerak — fake-media Chrome bilan `meet-test.mjs` (HOST_PHONE/HOST_PASS, GUEST_PHONE/GUEST_PASS env) qayta o'tkaziladi.

## 14. 17.09 — Uchrashuvlar: sifat, animatsiya, ovoz, yozib olish, mobil

| Nima | Qanday |
|---|---|
| Video sifati «xira» | Capture 720p (desktop) / 540p 4:3 (telefon); simulcast qatlamlari 216/360 + to'liq; ekran ulashish 1080p15, `contentHint: detail` (matn aniq), 720p fallback qatlam |
| Yangi odam qo'shilganda silliq o'tish | FLIP (First–Last–Invert–Play): kartalar eski joyidan yangi joyiga faqat `transform` bilan siljiydi (Web Animations API, 380 ms, `cubic-bezier(.2,.8,.2,1)`); yangi karta scale/opacity bilan kiradi; `prefers-reduced-motion` hurmat qilinadi |
| Kirish ovozi | WebAudio «qo'ng'iroqcha» tembri (asosiy + oktava + 3-garmonika, past-chastota filtri): birinchi odam kirganda C5–E5–G5 uch notali salom, keyingilarda ikki notali; chiqishda tushuvchi nota; yozib olishda ikki «tik» |
| Yozib olish (barcha ovozlar) | Brauzerda mikser: mening mikrofonim + barcha uzoq audio treklar → AudioContext → MediaRecorder (webm/opus, Safari'da mp4); serverga yuborilmaydi. Boshlanganda hamma ishtirokchiga data-channel orqali xabar + qizil «Yozilmoqda» belgisi; to'xtatilgach «Yozuv tayyor → Qurilmaga saqlash»: iOS/Android — share sheet (fayl), desktop — yuklab olish |
| Mobil | Pastki panel 4 ta katta tugma (mikrofon, kamera, almashtirish, tugatish) + «Yana» varag'i (chat, ishtirokchilar, yozib olish, tartib); safe-area inset'lar; tepada ortiqcha tugmalar yashirin; yon panel — pastki varaq |
| Dizayn | Sayt navy/ko'k palitrasi, `--fd` sarlavha shrifti, ortiqcha «L» logotip va tepadagi «Odam qo'shish» tugmasi olib tashlandi (ishtirokchilar panelida qoldi), blur'li header |

Eslatma (GM T2-09 §3): advokat↔mijoz qo'ng'irog'i **serverda** yozilmaydi — bu funksiya faqat foydalanuvchining o'z qurilmasida lokal yozuv; boshqalar ogohlantiriladi.

## 15. 17.09 — Mijoz «Obuna rejalari» sahifasi (T1-03 / T5-01)

Muammo: sahifada faqat backend `audience=personal` rejalari (Shaxsiy advokat Standard/Premium) chiqardi, LexGo.AI Free/Lite/Pro ko'rinmasdi (backend ularni `audience=seller` deb belgilagan); ijrochi sahifasida esa «Бизнес абонент», «Lexgo.AI — жисмоний шахс» kabi ortiqcha rejalar chiqardi.

Endi (GM T0-07 §9, T1-03 §1–8):
- **LexGo.AI rejalari**: Free / Lite 49 000 / Pro 99 000 — slug bo'yicha (`lexgo-ai-free|lite|pro`), backend `features` bilan; muddat 1/3/6/12 oy, chegirma −5/−10/−15 %, «bir yo'la» +5 %, jami ≤ 20 % (jonli: Lite 12 oy bir yo'la = **470 400**, Pro = 950 400 — GM misoliga to'g'ri); Free kartasida «Bu oy: 5 tadan N tasi» hisoblagichi; ijrochi (tasdiqlangan) ko'rinishida −50 % avtomatik (Lite 24 500, Pro 49 500).
- **Shaxsiy advokatim**: Standard / Premium (6 / 12 oy, backend narxlari) + sovg'a kartasi — faqat mijozda.
- Biznes va ortiqcha rejalar hech qayerda ko'rsatilmaydi (B2B — T4-08 admin).

Backend'ga: AI rejalar `audience` = client bo'lishi, 3 oylik `billing_period` va GM chegirma jadvali (−15 % / −20 %) — hozir backend yearly −10 % hisoblaydi (frontend to'g'ri summani checkout'ga o'zi yuboradi); ijrochi −50 % server tomonda tasdiqlanishi; Standart narxi seed'da 149 000, GM T1B-08 §2 da 249 000 — PM aniqlashi kerak (#65–66).

## 16. 17.09 — Uchrashuv: o'z-o'zidan ochilish, xiralashish, ikki rejimli yozib olish

| Muammo | Sabab | Tuzatish |
|---|---|---|
| Uchrashuv o'zidan ochilib qoladi | (1) Sahifa yangilanganda `lexgo_active_call` bo'yicha xona avtomatik ochilardi; (2) chat sahifasida `?join=` deep-link reload'da qayta qo'shardi; (3) qo'ng'iroq qiluvchining o'zi uchun `call.created`/`call.incoming` (caller id bo'sh kelsa) karta chiqarishi mumkin edi | (1) endi «Uchrashuv hali davom etmoqda — qaytasizmi?» kartasi (qabul/rad), avtomatik ochilmaydi; (2) qo'shilgach `?join=` URL'dan olib tashlanadi, faqat faol qo'ng'iroqqa qo'shiladi; (3) o'z qo'ng'irog'i (host/joined) hech qachon jiringlamaydi |
| Xiralashish | adaptiveStream CSS piksel bo'yicha past qatlam tanlardi; qatlamlar 216/360 | `pixelDensity: "screen"` (retina'da yuqori qatlam), fon tabda video to'xtamaydi; qatlamlar 360/540 (+720 to'liq), telefonda 240/360 (+540) |
| Yozib olish ishlamaydi | — | Qayta yozildi: **ikki rejim** — «Faqat ovoz (hammasi)» va **«Ekran + ovoz»** (uchrashuv sahnasi canvas'ga 15 fps chiziladi, telefonda ham ishlaydi, ekran tanlash oynasi yo'q); to'xtatishda `onstop`/`onerror`/2.5 s himoya; xato matni ko'rsatiladi; «Yozuv tayyor» panelida rejim, davomiylik, hajm, **Qurilmaga saqlash** (iOS/Android share sheet → yuklab olish) va **Ochish** (yangi oyna) zaxira tugmasi. Chrome'da sintetik tekshiruv: audio webm/opus 46 KB, ekran webm/vp9 55 KB (2.5 s) — ikkala rejim ishlaydi |

## 17. 17.09 kechki — uchrashuv tugashi, login kutish, «Vazifalar», kalendar, taklif qidiruvi

| Muammo | Sabab | Tuzatish |
|---|---|---|
| Advokat chiqib ketsa mijoz oynasida uchrashuv davom etaverardi | Backend REST `…/calls/{id}/end` hech qanday socket xabari yubormaydi; `call.ended` faqat chat xonasi socketida (`/ws/secure-chats/{room}`) keladi, mijoz-taklif qilingan ishtirokchi esa u socketga ulanmagan; host tabni yopsa hech qanday xabar yo'q | (1) Uchrashuv «call socket» (`/ws/secure-chats/{room}/calls/{call}`) orqali endi **`call.join` / `call.leave` / `call.end`** signallari yuboriladi — host «Tugatish» bossa hamma darhol chiqadi; (2) LiveKit xonasi bo'shab qolsa (kimdir bo'lgan edi, endi hech kim yo'q) «Suhbatdosh chiqib ketdi — 10 s» sanog'i, kimdir qaytsa bekor bo'ladi, aks holda o'zi tugaydi (titul'li uchrashuv hosti bundan mustasno — u yana odam taklif qilishi mumkin); (3) 15 s roster so'rovi `status = ended/cancelled/expired` ko'rsa ham yopadi |
| Login: `429 {"detail":{"message":"Qayta yuborish uchun kuting","retry_after":36}}` — matn chiqar, kutish yo'q | `retryAfterSec` bor edi, lekin faqat 2FA qayta yuborishda ishlatilgan | Endi login'da 429 kelganda **teskari sanoq** (36 → 0): tugma «Qayta urinish: N s» bo'lib bloklanadi, xato ostida «N soniya kuting»; IP limit (`Retry-After` sarlavhasi, proxy uzatadi) uchun ham |
| Noto'g'ri parol qayta-qayta → server 429 (too many requests) ga «urib turadi» | Frontend har bosishda so'rov yuborardi | 3-noto'g'ri urinishdan boshlab lokal pauza: 5 → 10 → 20 → 40 → 60 s (server limiti 20/15 min ga yetmaydi); muvaffaqiyatli login sanoqni nollaydi |
| «Vazifalar» sahifasi | 3 ustun (todo/doing/done), backend `review`/`blocked` holatlari yo'qolardi, tahrirlash/o'chirish/tavsif/ro'yxat yo'q, har ko'chirishda to'liq qayta yuklash | Qayta yozildi: **4 ustun** (Bajarilishi kerak / Jarayonda / Tekshiruvda / Bajarildi) + «Bloklangan» belgisi (tugma bilan almashtiriladi); **tahrirlash** (`PATCH /tasks/{id}`: nom, muhimlik, muddat, ish, tavsif, nazorat ro'yxati `[x]` bilan), **o'chirish** (tasdiq bilan, `DELETE`), qidiruv, «Bajarilganlarni yashirish», muddati o'tganlar qizil va tepada, optimistik ko'chirish (xatoda qaytariladi), telefonda ustunlar scroll-snap; 403 uchun alohida matn |
| Kalendar «brauzer default» ko'rinishda | `<input type="time">`, `<input type="month">` (admin B2B), oddiy ro'yxat | Yangi **TimePicker** (soat/daqiqa panjarasi, sayt uslubida; profil ish vaqti va ro'yxatdan o'tishda ham), B2B oy tanlash → `MonthPicker`; kalendar sahifasi endi **oy panjarasi** (voqealar turi bo'yicha rangli chiplar, bugun/tanlangan kun, dam olish kunlari, ikki bosish → shu kunga voqea) + yon panelda **kun rejasi** va **Yaqinlashayotgan** ro'yxat; «Oy / Ro'yxat» ko'rinishi; o'chirish tasdiq bilan; telefonda nuqtali ixcham panjara |
| Taklif qidiruvida ism yozsam hech kim chiqmaydi | `/users/search` faqat staff yoki `leads.manage` uchun (mijoz/advokat host → 403), xato yutilardi | 403 bo'lsa lokal katalog: **tasdiqlangan advokat/yuristlar** (`/lawyers`) + ijrochi uchun **o'z mijozlari** (`/lawyers/me/clients`); ism/telefon (≥4 raqam) bo'yicha filtrlanadi, o'zim va xonadagilar chiqmaydi. Backend'ga #67 |

Backend'ga (0E jadvali #67–68): `/users/search` uchrashuv hostiga (o'z aloqalari doirasida) ochilishi; REST `end`/`leave` da call socket va user socket orqali `call.ended`/`call.participant_left` yuborilishi.

## 18. 17.09 — `LEXGO_FRONTEND_BUGFIX_UPDATE_2026_09_17.md` bo'yicha frontend

| § | Backend | Frontend holati |
|---|---|---|
| 1 | Login 2FA: TOTP bo'lsa `method=totp`, `POST /auth/login/2fa` | Avvaldan shunday (`completeLogin2fa` → `/auth/login/2fa`; TOTP'da Telegram tugmasi/qayta yuborish yo'q) — o'zgarish shart emas |
| 2 | Register OTP 3 xato → 15 min blok, `register/start` 429 `{blocked_until, retry_after: 900}` | Tasdiqlash bosqichida blok bo'lganda **kod kiritish maydonlari yopiladi**, «Kod kiritish vaqtincha bloklandi» paneli + teskari sanoq; sanoq tugagach **«Yangi kod olish»** tugmasi (yana `register/start`, alohida resend endpoint yo'q); ko'rib chiqish bosqichida 429 kelsa tugma «Qayta yuborish: 15:00» sanog'i bilan kutadi |
| 3 | `GET /admin/register-requests/{id}` | Admin «Ro'yxatdan o'tish so'rovlari» sahifasida har arizada «ko'z» tugmasi → tafsilot oynasi: ariza, ro'yxatdan o'tishda kiritilgan F.I.O./hudud/telefon/holat/OTP urinishlari/blok, bog'langan foydalanuvchi, ijrochi profili, so'nggi faollik (`title_uz`) |
| 4 | `GET /lawyers/me/clients/{id}` | Advokat/yurist «Mijozlar» sahifasida mijoz kartasi bosiladi → oyna: mijoz kartasi (qo'lda qo'shilgan bo'lsa izohlar), statistika, maxfiy chatga o'tish, «Tarix / Ishlar / Buyurtmalar / To'lovlar / Hujjatlar» tablari; 404 → «Bu mijoz bilan ish topilmadi» |
| 5 | Workspace `download_url`, signed URL absolute | Fayl «ochish» endi `POST /workspace/files/{id}/signed-url` → `url` yangi oynada (Vercel domeniga qo'shilmaydi); xato bo'lsa sessiya bilan yuklab olish (blob) zaxirasi; `downloadUrl` tip maydonlari qo'shildi |
| 6 | `/auth/me` → `two_factor_enabled`, `two_factor_method` | Avvaldan `TwoFactorCard` shu maydonlardan holat/usulni ko'rsatadi (telegram/sms/totp) |
| 7 | Audit `title_uz`, `description_uz` | Profil «Audit jurnali»da uz tilida `title_uz`/`description_uz` ko'rsatiladi (qidiruv ham ular bo'yicha); admin audit-trail'da `action · title_uz` |
| 8 | `/referrals/me` → `link`/`register_url`/`landing_url` | `link` (register) ishlatiladi; `?ref=` kod 90 kun saqlanadi va login→«Hisob yaratish» / register→«Kirish» havolalarida saqlanib qoladi (jonli: `/uz/register?ref=TESTCODE1`) |
