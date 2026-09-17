# LexGo — loyiha tahlili, PM hujjatlari va bajarilish holati

**Sana:** 2026-09-17
**Tahlil qilingan fayllar:**
1. `V1.1 LexGo_Ishlab_chiqish_rejasi.docx` — ishlab chiqish rejasi (14.09.2026), 107 vazifa, 61 PM qarori, A–G ilovalar.
2. `Ҳуқуқий ҳужжатлар.rar` — 10 ta huquqiy hujjat × 3 til (uz-kirill, uz-lotin, ru) = 30 fayl.
3. `Фуқаролик_судларига_мурожаат_қилишда_фойдаланиладиган_ҳужжатлар.rar` — 36 ta sud da'vo arizasi namunasi (4 bo'lim).

**Solishtirildi:** bugungi kod (frontend `f9fc04e`, backend `06f40e0`), production API va 15–16 sentyabrdagi GM qabul tekshiruvi natijalari.

---

## 1. Loyiha nima (rejadan tushunganim)

**LexGo.uz** — yuridik xizmatlar platformasi. Mijoz muammosini yozadi → **LexGo.AI** manbali javob beradi va 3 darajali taklif chiqaradi → mijoz katalogdan xizmat va advokat tanlaydi → buyurtma → platforma ichida shartnoma (SMS-OTP imzo) → **bosqichma-bosqich to'lov 30/40/30** (escrow maqsad, hozir per-milestone) → xavfsiz chat, video → yakun → baho. Ikkinchi oqim — **kol-markaz navbatchi yuristi** (100% LexGo daromadi). Uchinchi — **obuna** ("Shaxsiy advokatim", LexGo.AI Free/Lite/Pro), sovg'a, referal, SOS. Keyin B2B, akademiya, reklama, mobil ilova.

**Operator yuridik yordam ko'rsatmaydi** — u texnologik vositachi (oferta 1-hujjatda aniq yozilgan). Yordamni tasdiqlangan advokat/yurist/tuzilma ko'rsatadi; natija kafolatlanmaydi.

### 1.1 Ish tamoyillari (reja 3-bo'lim)
- **Skelet birinchi:** rollar, statuslar, abstraksiyalar (to'lov, identifikatsiya, bildirishnoma) boshidan to'g'ri, keyingi hamma narsa ularga ulanadi.
- **Mijoz oqimi birinchi, advokat tomoni bilan birga:** mijozdagi har harakat advokatda darhol ko'rinishi shart.
- **Kutmaymiz:** kontent (shablon, katalog, korpus, huquqiy matn) o'rniga test-ma'lumot; faqat tashqi kalitsiz qurib bo'lmaydigan integratsiyalarda kutamiz.
- **Arxitektura PM'ning keyingi qarorlarini kod o'zgarmasdan ko'tarishi kerak:** `payment_mode`, `commission_payer`, entitlements, rollar — ma'lumot sifatida, feature flag har oila va bosqichga.
- **AI mustaqil, lekin manbali:** manbasiz javob yo'q, "bilmayman" ruxsat etilgan.
- **Ritm:** kunlik hisobot Telegram'da 18:00 gacha; payshanba 16:00 demo; bosqich yakunida acceptance akti; 2 ish kuni sukut = tasdiq.
- Muddat sana bilan emas, **bosqich bilan**. 0-bosqichdan T0-01/06/07/08/09/16/17/20 1A'dan oldin bo'lishi shart.

### 1.2 Nima QILINADI (asosiy talablar)
| Soha | Talab | Manba |
|---|---|---|
| Rollar | 14 ichki rol + executive + provider + client; matritsa ma'lumot sifatida; 2FA barcha ichki rollar + advokat/yurist; sessiya 8/2 soat | S-5, S-56 |
| OTP | 6 raqam, 2 daqiqa, 3 xato → 15 daqiqa, kuniga 10 SMS, qayta 60 s; kanal Telegram → SMS; kod javobda hech qachon qaytmaydi | S-58 |
| Katalog | 17 oila → guruh → xizmat, 8 oila ochiq, sinonimlar majburiy, fuzzy + kirill/lotin qidiruv, SEO, 301 | S-12, S-13 |
| Pasport | to'liq maydonlar (Ilova A), majburiy maydonsiz faol bo'lmaydi, versiyalanadi | S-14 |
| Narx | Tavsiya = Bazaviy × Hudud × Staj × max(Soha 1,30; Super 1,30; 1); advokat [0,70; 1,0]; komissiya mijozga ko'rinmaydi | S-15, S-27 |
| AI | 4 korpus, RAG, manba (modda, hujjat, sana), disclaimer 3 tilda, PII maskalash, foydali/foydasiz | S-8, S-9 |
| AI limit | anonim 2/24 soat (oyiga 5), 3-savolda telefon; ro'yxatli oyiga 5; limit tugasa lid | S-6 |
| AI obuna | Free 0 / Lite 49 000 / Pro 99 000; 3 oy −5%, 6 oy −10%, 12 oy −15%, bir yo'la −5%, maks 20%; verified advokat 50% | S-7 |
| Buyurtma | 18 status + tarmoqli; mijozga 5 bosqich; taymer 30 daqiqa ish vaqtida; kontakt to'lovdan keyin | S-20…S-23 |
| To'lov | PaymentProvider interfeysi (8 funksiya), payment_mode per_milestone/escrow, idempotency, 30/40/30, avtotasdiq 3 ish kuni, tiyin | S-17, S-18, S-21, S-26 |
| Shartnoma | PDF avtomatik, ikki tomon SMS-OTP, SHA-256 xesh, QR tekshiruv | S-54 |
| Shablon | 10 ta Cognilabs, {{field}} / {{#if}} / {{#each}}, wizard, PDF+DOCX, kolontitul+QR, 3 ta bepul/oy keyin 19 000 | S-34, S-35, S-37 |
| Hujjat tahlili | AI obuna ichida (1/5/20); advokat tekshiruvi 149/299/499k; 6 bo'limli natija | S-11 |
| Onboarding | advokat 5 qadam, saqlanadi, selfi, tugallanmasa lid; tuzilmasiz buyurtma qabul qilmaydi | S-38, S-4 |
| Kol-markaz | SLA 60 daqiqa 09:00–19:00, buzilsa avto 30% qaytarish, 3 chat/yurist | S-36, S-45 |
| Huquqiy | 10 hujjat, alohida galochka, consents jurnali (kim/versiya/qachon/IP), admin matnni almashtiradi | S-53 |
| Production | O'zbekiston ЦОД, shifrlash, zaxira, baza reestri; PII maskalash; pentest | S-55, S-56 |

### 1.3 Nima QILINMAYDI / keyinga qoldirilgan
| Nima | Qaror |
|---|---|
| Lid sotish (T7-04) | **Bekor** — PM rad etdi (S-60); lidlar faqat kol-markaz va platforma advokatlari uchun |
| VM 774 tarifi | Kerak emas, rejadan olib tashlandi (S-16) |
| Ko'p darajali referal (MLM) | Yo'q — faqat 1 daraja (S-28) |
| Biometrik ma'lumot saqlash | Yo'q — faqat tasdiq fakti, sana, provayder ID (S-57) |
| Komissiyani mijozga ko'rsatish | Yo'q — narx ichida, "Nega bu narx?"da komissiya qatori bo'lmaydi (S-27) |
| Advokat–mijoz qo'ng'irog'ini yozish | Yo'q — faqat kol-markaz qo'ng'irog'i yoziladi, ogohlantirish bilan (S-31) |
| Eski advokat materiallarini yangi advokatga o'tkazish | Yo'q — advokat siri; faqat 1 sahifalik AI xulosa mijoz fayllaridan (S-24) |
| Pulni float bilan hisoblash | Yo'q — faqat tiyin, butun son (S-18) |
| Placeholder huquqiy matn bilan production | Yo'q (S-53) |
| Demo/seed endpoint'lar production'da | Yo'q — 404 (T0-01) |
| OTP kodini javobda qaytarish | Yo'q (T0-02) |
| Superadmin audit yozuvini o'zgartirishi | Yo'q — append-only (S-56) |
| Kontentni kutib turish | Yo'q — test-ma'lumot bilan quriladi |
| To'liq B2B CRM, telefoniya, avtoto'lov, push, mobil, akademiya, reklama | Keyingi bosqichlar / PM shartnomasi kelgach |
| E-IMZO | 2-bosqich, faqat yuridik shaxs va 5 mln+ (S-54) |
| Test moduli (advokat bilim testi) | Keyin (S-38) — hozir admin tekshiruvi |
| 24/7 navbatchi yurist | 200+ obunachidan keyin (S-45) |

---

## 2. Arxivlar tahlili

### 2.1 `Ҳуқуқий ҳужжатлар.rar` — 10 hujjat × 3 til
Har hujjat: "Tahrir 1.0 • 14.09.2026 da tasdiqlangan". Bu **S-53 dagi 10 hujjatning haqiqiy matni** — reja T0-18 da "PM matnlari kelganda admindan kiritiladi" deyilgan. **Matn keldi.**

| № | Hujjat | Tizimdagi slug | Tizimda hozir |
|---|---|---|---|
| 01 | Foydalanuvchi shartnomasi (ommaviy oferta) | `terms` | ❌ 43 belgili placeholder |
| 02 | Maxfiylik siyosati | `privacy` | ❌ 62 belgi |
| 03 | Cookie siyosati | `cookie` | ❌ 55 belgi |
| 04 | Advokat-yurist bilan hamkorlik shartnomasi (oferta) | `advocate_partnership` | ❌ 49 belgi |
| 05 | Advokatlik tuzilmasi bilan shartnoma | `organization_agreement` | ❌ 47 belgi |
| 06 | Mijoz-advokat yuridik yordam shartnomasi (shablon S-54) | `client_provider_contract` | ❌ 62 belgi — bu T1A-04 shartnoma PDF'ining matni |
| 07 | To'lov, qaytarish va kafolat qoidalari | `payment_refund_warranty` | ❌ 53 belgi |
| 08 | Platforma qoidalari | `platform_rules` | ❌ 54 belgi |
| 09 | Shaxsga doir ma'lumotlarga rozilik | `personal_data` | ❌ 56 belgi |
| 10 | 18+ tasdig'i | `age_18` | ❌ 51 belgi |
| — | Huquqiy ogohlantirish (AI disclaimer) | `legal_disclaimer` | ❌ 76 belgi (S-9 matni ham arxivda yo'q, PM'dan alohida so'rash kerak) |

**Xulosa:** `/legal/consents` da 11 ta hujjatning hammasi **bir jumlali placeholder**. Reja bo'yicha admin panelda matn tahrirlash ekrani bo'lishi kerak edi (T0-18) — u ham frontend'da, ham backend'da (`PUT /admin/legal/consents/{id}` yo'q) yo'q. Hozir matnni faqat backendchi bazaga to'g'ridan-to'g'ri kiritishi mumkin.

Hujjatlar mazmuni bo'yicha muhim tafsilotlar (kod bilan solishtirish uchun):
- **Oferta:** Operator MChJ nomi, STIR, manzil — hali `________` bo'sh. Bu bilan production'ga chiqib bo'lmaydi.
- **To'lov qoidalari 3.3:** escrow 30/40/30, bosqich sharti aniq yozilgan; 3.4 avtotasdiq 3 ish kuni, 3 kun va 1 kun qolganda eslatma; 3.5 escrow qo'llanmaydigan xizmatlar (ekspress, shablon, AI obuna, hujjat tahlili); 3.6 fiskal chek + LexGo kvitansiyasi. Kod bilan mos: milestone 30/40/30 bor; avtotasdiq va eslatmalar — sinalmagan.
- **2.3 "Nega bu narx?"** — bazaviy, hudud, staj, ixtisoslik, chegirma, **platforma xizmati haqi** ko'rsatiladi. E'tibor: hujjatda "platforma xizmati haqi" alohida qator sifatida ko'rsatilishi yozilgan, rejada (S-27) esa komissiya mijozga ko'rinmaydi. **Bu ziddiyat — PM'dan aniqlashtirish kerak.**
- **2.5 QQS** faqat yuridik shaxs uchun — B2B (T1B-07) bilan mos.
- 3 tilda bir xil tuzilma — frontend tilga qarab `language` maydoni bilan ko'rsatishi kerak; hozir `/legal/consents` da til maydoni yo'q.

### 2.2 `Фуқаролик судларига…` — 36 sud da'vo arizasi namunasi
Kirill yozuvida, `.doc`/`.docx`, klassik sud shakli: sud nomi, da'vogar/javobgar rekvizitlari, matn `______` bo'sh joylar bilan, "SO'RAYMAN" qismi, ilovalar ro'yxati, imzo/sana.

| Bo'lim | Soni | Namunalar |
|---|---|---|
| Oilaviy nizolar | 15 | Aliment undirish, nikohdan ajratish, bolaning yashash joyi, meros bo'lish, vasiyatnomani haqiqiy emas deb topish, ota-onalik huquqini tiklash… |
| Uy-joy nizolari | 11 | Majburiy ko'chirish, o'zboshimcha qurilish, umumiy mulkdan foydalanish, propiskadan chiqarish, suv bosishdan zarar… |
| Mehnat nizolari | 7 | Ish haqini undirish, noqonuniy bo'shatish, ishga tiklash, mehnat daftarchasi, mukofot pullari… |
| Boshqa nizolar | 3 | Jinoyat / mol-mulk / voyaga yetmagan shaxs yetkazgan zararni undirish |

**Bu — PM'ning T1-14 / T1B-09 uchun shablon kontenti** (S-34: "PM 30 shablon 1 haftada, 170 tasi 2 haftada"). Tizimdagi holat:
- Tizimda 10 ta seed shablon bor (lotin, 4–5 maydonli, umumiy: "Da'vo arizasi", "Ijara shartnomasi"…). **36 tadan birortasi tizimda yo'q.**
- Namunalar `{{field_code}}` sintaksisida emas — `______` chiziqlar va qavs ichida izohlar ("(ФИШ)", "(сана)"). Ularni tizimga kiritish uchun har birini Ilova F sxemasiga o'tkazish kerak: maydon kodi, leybl 3 tilda, tur (matn/sana/pul/tanlov), majburiylik, qadam.
- Matn kirillda; reja bo'yicha uz-lotin avtomatik transliteratsiya, ru qo'lda.
- Kiritish yo'li — **shablon konstruktori (T1B-09)**: DOCX yuklash → `{{…}}` avtomatik topish → maydon turlari → tasdiq. **Konstruktor qurilmagan**, hozirgi "Yangi namuna" formasi faqat oddiy matn qabul qiladi (DOCX yuklash yo'q).
- Har namunada o'rtacha 8–14 maydon: sud nomi, da'vogar/javobgar F.I.Sh., manzil, telefon, sana, FHDYo bo'limi, dalolatnoma raqami, summa, ilova ro'yxati. "Ishonchnoma" varianti (vakil) — shartli blok `{{#if vakil}}`.

**Taxminiy hajm:** 36 namunani sxemaga o'tkazish — har biriga 30–60 daqiqa (kontent-menejer ishi), konstruktor tayyor bo'lsa. Konstruktorsiz — dasturchi qo'li bilan, samarasiz.

---

## 3. Bajarilish holati — 107 vazifa

**Baholash usuli:** har vazifa GM qabul mezoni bo'yicha (15–16 sentyabr Chrome testi, production API, kod tekshiruvi). Belgilar:
- ✅ to'liq — GM mezoni o'tdi
- ⚠️ qisman — ishlaydi, lekin mezonning bir qismi yo'q
- ❌ bajarilmagan — asosiy qismi yo'q yoki GM "bajarilmagan belgisi" ko'rindi
- 🔒 sinab bo'lmadi — akkaunt / staging / provayder yo'q (kod bor, lekin tasdiqlanmagan)
- ❓ dasturchi ko'rsatadi
- — ko'chgan/bekor (hisobga kirmaydi)

### 3.1 Umumiy hisob

| Bosqich | Vazifa | ✅ | ⚠️ | ❌ | 🔒 | ❓ | — | To'liq % |
|---|---|---|---|---|---|---|---|---|
| 0 — Baza | 20 | 6 | 5 | 5 | 0 | 4 | 0 | 30% |
| 1A — Asosiy oqim | 26 | 1 | 7 | 10 | 8 | 0 | 0 | 4% |
| 1B — Kengaytirish | 10 | 0 | 1 | 7 | 2 | 0 | 0 | 0% |
| 2 — Advokat kabineti | 11 | 0 | 1 | 4 | 4 | 0 | 2 | 0% |
| 3 — Admin | 14 | 0 | 5 | 7 | 0 | 1 | 1 | 0% |
| 4 — Kol-markaz, CRM | 8 | 0 | 4 | 3 | 1 | 0 | 0 | 0% |
| 5 — Obuna | 8 | 1 | 5 | 0 | 1 | 0 | 1 | 14% |
| 6 — Mobil | 5 | 0 | 0 | 5 | 0 | 0 | 0 | 0% |
| 7 — Akademiya, reklama | 5 | 0 | 0 | 2 | 1 | 0 | 2 | 0% |
| **Jami** | **107** | **8** | **28** | **43** | **17** | **5** | **6** | |

**Hisob (101 amaldagi vazifa, 6 ta ko'chgan/bekor chiqarilgan):**
- To'liq bajarilgan: **8 ta = 8%**.
- Qisman bilan birga (⚠️ = 0,5): (8 + 28×0,5) / 101 = **22%**.
- Kod yozilgan, lekin sinab bo'lmagan (🔒) ham qo'shilsa: (8 + 28×0,5 + 17×0,5) / 101 ≈ **30%**.
- Bugungi majburiy doira (0 + 1A = 46 vazifa): to'liq **7 ta (15%)**, qisman 12, bajarilmagan 15, sinab bo'lmagan 8, dasturchi ko'rsatadi 4.

**Frontend tomonidan** (backend'ni hisobga olmasdan, ekran va oqim qurilganmi): 101 dan ~55 tasida frontend qismi bor (to'liq yoki asosiy ekranlar), ~46 tasida frontend ham yo'q yoki juda kam. Ya'ni frontend ham "yarmi" atrofida.

### 3.2 Vazifalar bo'yicha (reja holati → bizdagi holat)

Ustunlar: **Tur/Holat** — rejadagi (Aniq/Kontent/Bloklovchi/Shartli; O'zgarmagan/O'zgargan/Yangi); **Holat** — bizdagi; **Kim** — FE frontend, BE backend, Akk test akkaunt, Stg staging, Dev dasturchi ko'rsatadi, PM kontent.

#### 0-bosqich
| ID | Vazifa | Tur/Holat | Holat | Kim | Qisqa izoh |
|---|---|---|---|---|---|
| T0-01 | Muhitlarni ajratish | Aniq/O'zgarmagan | ✅ | — | Demo/seed 404; seed tugmasi va Test OTP menyusi yashirildi |
| T0-02 | OTP qoidalari | Aniq/O'zgargan | ❌ | BE | Kodlar umumiy Telegram test-chatiga ketadi; 3 xato/15 daqiqa sinalmagan |
| T0-03 | openapi/docs yopish | Aniq/O'zgarmagan | ✅ | — | 404; `/admin/openapi.json` faqat token bilan |
| T0-04 | Parol tiklash | Aniq/O'zgargan | ✅ | — | Havola, kod, yangi parol |
| T0-05 | 2FA va sessiya | Aniq/O'zgargan | ❌ | BE | Ichki rollar (superadmin, admin, sales) kodsiz kiradi; `mandatory_two_factor` faqat asosiy rolga qaraydi |
| T0-06 | Rollar matritsasi | Aniq/O'zgargan | ⚠️ | BE | URL cheklovi ishlaydi; 22 rol (dublikatlar), ruxsat berish qoidalari va 2FA tasdig'i yo'q |
| T0-07 | Test-ma'lumotlar | Aniq/O'zgargan | ❌ | BE, PM | 35 kategoriya, test nomlar, 38 advokatda narx yo'q, paketlar yo'q |
| T0-08 | Bildirishnoma kaskadi | Aniq/O'zgargan | ❌ | FE+BE | Hodisalar ro'yxati va matn tahriri yo'q |
| T0-09 | To'lov abstraksiyasi | Aniq/O'zgargan | ❓ | Dev | Webhook route bor; interfeys va idempotentlik ko'rsatilmagan |
| T0-10 | Identifikatsiya | Aniq/O'zgargan | ⚠️ | Dev+FE | Demo tasdiq bor; `identity_verified` sanasi va "tasdiqlanmaganni yashirish" sozlamasi yo'q |
| T0-11 | Audit trail | Aniq/O'zgargan | ✅ | — | Append-only, filtr, CSV, fayl harakatlari |
| T0-12 | Konsol xatolari | Aniq/O'zgarmagan | ✅ | — | 7 rol, 200 sahifa — xato yo'q |
| T0-13 | Mobil layout | Aniq/O'zgarmagan | ✅ | — | 390 px, skroll yo'q |
| T0-14 | Integratsiyalar holati | Aniq/O'zgarmagan | ⚠️ | BE+FE | Integratsiya bo'lmagan qatorlar "Ulangan"; Test tugmasi yo'q |
| T0-15 | Telegram bot | Aniq/Yangi | ❓ | Siz | Ulash tugmasi va lid manbasi bor; real Telegram bilan tekshirilmagan |
| T0-16 | Tiyin | Aniq/Yangi | ❓ | Dev | Summalar butun; baza ko'rsatilmagan |
| T0-17 | PII maskalash | Aniq/Yangi | ❓ | Dev | Kodda `mask_pii` bor; log ko'rsatilmagan |
| T0-18 | Huquqiy hujjatlar | Kontent/Yangi | ⚠️ | FE+BE, PM | Alohida galochkalar, jurnal API bor; **matnlar placeholder** (real matn arxivda), admin tahrir ekrani va jurnal ekrani yo'q |
| T0-19 | Hosting rejasi | Bloklovchi/Yangi | ❌ | Dev | Hujjat yo'q |
| T0-20 | Ish vaqti kalendari | Aniq/Yangi | ⚠️ | FE+BE | Badge va API bor; taymer muddati buyurtmada ko'rinmaydi; admin bayramlar ekrani yo'q |

#### 1A-bosqich
| ID | Vazifa | Tur/Holat | Holat | Kim | Qisqa izoh |
|---|---|---|---|---|---|
| T1-01 | Ro'yxatdan o'tish | Aniq/O'zgargan | ⚠️ | BE+FE | Hudud majburiy, roziliklar alohida; anonim 3-savolda telefon so'ralmaydi |
| T1-02 | AI bepul limitlar | Aniq/O'zgargan | ❌ | BE+FE | Ro'yxatli 5/oy ishlaydi; anonim 5 (kerak 2), limit kodda, "oxirgi savol" ogohlantirishi yo'q |
| T1-03 | AI obunasi | Aniq/O'zgargan | ❌ | BE | Lite/Pro mijozga ko'rinmaydi (`audience: seller`); 12 oy −10% (kerak −15%); hisoblagich yo'q |
| T1-04 | AI korpus, manba | Kontent/O'zgargan | ❌ | BE, PM | Manba yo'q ("texnik muammo"), "Mars" savoliga ishonch bilan javob; disclaimer va feedback bor |
| T1-05 | 3 darajali taklif | Aniq/O'zgargan | ❌ | BE | Bir xil 3 taklif; qizil blok va lid bor |
| T1-06 | Katalog 3 daraja | Aniq/O'zgargan | ❌ | BE+FE | 2 daraja, "guruh" yo'q, sinonim va fuzzy yo'q, "Tez kunda" yo'q |
| T1-07 | Xizmat pasporti | Kontent/O'zgargan | ⚠️ | BE+FE, PM | Asosiy bloklar bor; bosqichlar, kafolat, "natijada nima olasiz" yo'q |
| T1-08 | Narxlash | Aniq/O'zgargan | ⚠️ | FE+BE | Formula backend'da ishlaydi; mijoz hududi profilda yo'q → doim ×1 |
| T1-09 | Advokat saralash | Aniq/O'zgargan | ❌ | FE+BE | Filtrlar to'liq emas, "Yangi" belgisi va matching sozlamalari yo'q |
| T1-10 | Buyurtma oqimi | Aniq/O'zgargan | 🔒 | Akk+Stg | 18 status bor; taymer va kontakt ochilishi sinalmadi |
| T1A-01 | Milestone to'lov | Aniq/Yangi | 🔒 | Stg+BE | 30/40/30 ko'rinadi; demo to'lov production'da yopiq; "paid" buyurtmada bosqichlar to'lanmagan xatosi |
| T1A-02 | Advokat onboarding | Aniq/Yangi | ⚠️ | FE+BE | Kabinetda 5 qadam, hujjat yuklash, yuborish; ro'yxatdan o'tish 3 qadamli; progress profilni hisoblamaydi |
| T1A-03 | Tuzilmalar | Aniq/Yangi | 🔒 | Akk | Panel bor; tasdiqlangan advokat yo'q |
| T1-11 | Advokat kabineti | Aniq/O'zgargan | ❌ | FE+Akk | "Ta'tildaman" yo'q, ko'rsatkichlar bo'limi yo'q; tasdiqlanmagan akkauntda qulflangan |
| T1-12 | Kol-markaz navbati | Aniq/O'zgargan | 🔒 | Stg | Navbat bor; SLA va avto-qaytarish sinalmadi |
| T1-13 | Ishlar va cheklar | Aniq/O'zgargan | ⚠️ | — | Kvitansiya PDF + QR ishlaydi; fiskal chek yo'q (provayder) |
| T1-14 | Shablon → hujjat | Kontent/O'zgargan | ❌ | FE+BE, PM | Wizard, DOCX, limit, kolontitul yo'q; maydonlar inglizcha; **36 PM namunasi kiritilmagan** |
| T1-15 | Hujjat tahlili | Aniq/O'zgargan | ⚠️ | BE | Narx va fayl yuklash ishlaydi; 3 bo'lim (kerak 6); fayl AI'dan o'tmaydi |
| T1-16 | Baholash | Aniq/O'zgargan | 🔒 | Stg | Sahifa bor; yakunlangan buyurtma yo'q |
| T1-17 | Bildirishnomalar oqimda | Aniq/O'zgargan | 🔒 | Stg | Buyurtma oqimi kerak |
| T1A-04 | Shartnoma | Kontent/Yangi | 🔒 | Stg, PM | Imzolash ekrani bor; 0 shartnoma; **matn (06-hujjat) arxivda, tizimda yo'q** |
| T1A-05 | Lid qabul | Aniq/Yangi | ❌ | FE+BE | Manba bor; UTM/sahifa/qurilma/shahar yo'q |
| T1A-06 | Almashtirish | Aniq/Yangi | ⚠️ | Stg | So'rov formasi va ro'yxat bor; avto-taklif va AI xulosa sinalmadi |
| T1A-07 | Aylanib o'tish | Aniq/Yangi | 🔒 | Stg+FE | Chat maskalash bor; so'z bilan raqam, OCR, hisobot yo'q |
| T1A-08 | Referal asos | Aniq/Yangi | ✅ | — | Kod, havola, QR, `?ref=` |
| T1-18 | E2E ssenariylar | Aniq/O'zgargan | ❌ | Dev | Hisobot yo'q |

#### 1B-bosqich
| ID | Vazifa | Tur/Holat | Holat | Kim | Qisqa izoh |
|---|---|---|---|---|---|
| T1B-01 | Paketlar sotuv | Aniq/Yangi | ❌ | FE | Backend 75 paket bor; mijozda sahifa yo'q |
| T1B-02 | Paket konstruktori | Aniq/Yangi | ❌ | FE+BE | Yo'q |
| T1B-03 | Keys papkasi | Aniq/Yangi | 🔒 | Akk | Ish maydoni (yuklash, versiya) bor; .exe/50 MB cheklovi sinalmadi |
| T1B-04 | Kalendar | Aniq/Yangi | ❌ | FE | Kalkulyator va iCal yo'q |
| T1B-05 | Conflict check | Aniq/Yangi | ❌ | FE | Backend bor, frontend ishlatmaydi |
| T1B-06 | AI ish vositalari | Aniq/Yangi | 🔒 | Akk+FE | Yordamchi bor; taqqoslash yo'q |
| T1B-07 | B2B minimal | Aniq/Yangi | ❌ | FE+BE | Yuridik shaxs ro'yxati, QQS, hisob-faktura yo'q |
| T1B-08 | SOS | Aniq/Yangi | ⚠️ | FE+BE | Sahifa va tugmalar bor; 349 000 taklifi, GPS, push oqimi yo'q |
| T1B-09 | Shablon konstruktori | Aniq/Yangi | ❌ | FE+BE | DOCX yuklash va maydon topish yo'q — **36 namuna shu orqali kirishi kerak** |
| T1B-10 | E2E (1B) | Aniq/Yangi | ❌ | Dev | Hisobot yo'q |

#### 2-bosqich
| ID | Vazifa | Tur/Holat | Holat | Kim | Qisqa izoh |
|---|---|---|---|---|---|
| T2-01 | Dashboard va balans | Aniq/O'zgargan | 🔒 | Akk | Tasdiqlangan advokat yo'q |
| T2-02 | Xizmatlar va narx | Aniq/O'zgargan | 🔒 | Akk | Oraliq tekshiruvi sinalmadi |
| T2-03 | Verifikatsiya, g'alaba | Aniq/O'zgargan | ❌ | FE+BE | G'alaba kiritish, redact, 5 chegarasi yo'q |
| T2-04 | Reyting ko'rinishi | Aniq/O'zgargan | ⚠️ | FE | Blok bor; 5 omil, grafik yo'q |
| T2-05 | Kalendar | Ko'chdi → T1B-04 | — | | |
| T2-06 | Payout | Aniq/O'zgargan | ❌ | FE+Akk | Backend bor; advokat sahifasi yo'q; finance akkaunti yo'q |
| T2-07 | Mijozlar | Ko'chdi → T1B-03/05 | — | | |
| T2-08 | Referal to'liq | Aniq/O'zgargan | ❌ | FE | Advokat kabinetida yo'q |
| T2-09 | Video va AI xulosa | Aniq/O'zgargan | 🔒 | Stg | Video xona qayta ishlandi (17.09), ekran ulashish, chat; AI xulosa oqimi yo'q |
| T2-10 | Rad sabablari | Aniq/O'zgargan | ❌ | FE+BE | Sababsiz rad |
| T2-11 | Yurist cheklovlari | Aniq/O'zgargan | 🔒 | Akk | "Yurist" akkaunti backend'da advokat |

#### 3-bosqich
| ID | Vazifa | Tur/Holat | Holat | Kim | Qisqa izoh |
|---|---|---|---|---|---|
| T3-01 | Tekshiruv workflow | Aniq/O'zgargan | ❌ | FE+BE | Faqat "Tasdiqlash"; dalil, rad sabablari, qora ro'yxat yo'q |
| T3-02 | Excel import | Aniq/O'zgargan | ❌ | FE+BE | Yo'q |
| T3-03 | Narx qoidalari | Aniq/O'zgargan | ❌ | FE+BE | Koeffitsientlar kodda |
| T3-04 | Shablonlar | Ko'chdi → T1B-09 | — | | |
| T3-05 | Obuna konstruktori | Aniq/O'zgargan | ⚠️ | FE+BE | Oddiy forma; entitlements maydonlari yo'q |
| T3-06 | Nizolar | Shartli/O'zgargan | ❌ | FE+BE | Ro'yxat bor; amal, taymer, qaytarish yo'q |
| T3-07 | Rollar UI | Aniq/O'zgargan | ⚠️ | FE | Matritsa ko'rish; tahrirlash yo'q |
| T3-08 | KPI 3 daraja | Aniq/O'zgargan | ⚠️ | FE+BE | Umumiy/CEO panellari bor; formula, eksport, dayjest yo'q |
| T3-09 | Sharh moderatsiyasi | Aniq/O'zgargan | ⚠️ | Stg | Sahifa bor, navbat bo'sh |
| T3-10 | Audit ko'rinishi | Aniq/O'zgargan | ⚠️ | FE | Filtr va eksport bor; anomaliya ro'yxati ekranda yo'q |
| T3-11 | Integratsiyalar sahifasi | Aniq/O'zgarmagan | ❌ | FE+BE | Kalit va Test tugmasi yo'q |
| T3-12 | Reyting hisoblash | Aniq/Yangi | ❓ | Dev | Formula ko'rsatilmagan |
| T3-13 | Reestr tekshiruvi | Kontent/Yangi | ❌ | FE+BE, PM | Yo'q |
| T3-14 | Paket analitikasi | Aniq/Yangi | ❌ | FE+BE | Yo'q |

#### 4-bosqich
| ID | Vazifa | Tur/Holat | Holat | Kim | Qisqa izoh |
|---|---|---|---|---|---|
| T4-01 | Navbatchi yurist ish stoli | Aniq/O'zgargan | ⚠️ | FE+BE | Navbat, doska, mijoz qidirish, qo'ng'iroqlar (16.09 qayta ishlandi); chat limiti, skript paneli, smenalar yo'q |
| T4-02 | Operator ish stoli | Aniq/O'zgargan | ⚠️ | FE+BE | Kanban, lid kartasi, mijoz 360 (16.09); avto-taqsimlash, buyurtmaga aylantirish, yo'qotish sababi yo'q |
| T4-03 | Skriptlar | Kontent/O'zgargan | ❌ | FE+BE, PM | Yo'q |
| T4-04 | IP-telefoniya | Bloklovchi/O'zgargan | 🔒 | Provayder | Qo'lda qo'ng'iroq logi bor |
| T4-05 | Lid skoringi | Aniq/O'zgargan | ❌ | FE+BE | Ball bor, qoidalar ekrani yo'q |
| T4-06 | Upsell | Aniq/O'zgarmagan | ⚠️ | Stg | Sahifa bor |
| T4-07 | Vaqt tarifli konsultatsiya | Aniq/O'zgargan | ❌ | FE+BE | Yo'q |
| T4-08 | To'liq B2B CRM | Aniq/Yangi | ⚠️ | FE+Stg | B2B ro'yxat va qo'shish bor |

#### 5-bosqich
| ID | Vazifa | Tur/Holat | Holat | Kim | Qisqa izoh |
|---|---|---|---|---|---|
| T5-01 | Entitlements mijozda | Aniq/O'zgargan | ⚠️ | FE+Stg | API bor; hisoblagichlar kabinetda yo'q |
| T5-02 | Oila a'zolari | Aniq/O'zgargan | ⚠️ | Stg | Qo'shish bor; almashtirish qoidasi sinalmadi |
| T5-03 | SOS | Ko'chdi → T1B-08 | — | | |
| T5-04 | Sovg'a | Aniq/O'zgargan | ⚠️ | Stg | Sahifa va holatlar bor; flayer, qayta ishlatish taqiqi sinalmadi |
| T5-05 | Referal mijoz | Aniq/O'zgargan | ⚠️ | FE | Sahifa bor; bosh ekranda progress yo'q |
| T5-06 | Avtoto'lov | Bloklovchi/O'zgargan | 🔒 | Provayder | |
| T5-07 | Retention | Aniq/O'zgarmagan | ⚠️ | Stg | Navbat bor |
| T5-08 | Gift KPI | Aniq/O'zgarmagan | ✅ | — | CEO panelida |

#### 6–7-bosqich
| ID | Vazifa | Tur/Holat | Holat | Kim | Qisqa izoh |
|---|---|---|---|---|---|
| T6-01…05 | Mobil ilova (5 vazifa) | — | ❌ | — | Bu repoda yo'q; keyingi bosqich |
| T7-01 | B2B | Ko'chdi → T4-08 | — | | |
| T7-02 | Akademiya | Aniq/O'zgarmagan | ❌ | FE+BE | Katalog bor, "Tez orada" |
| T7-03 | Reklama | Aniq/O'zgargan | ❌ | FE+BE | Paketlar bor; katalogda "Reklama" belgisi yo'q |
| T7-04 | Lid sotish | **Bekor** | — | | |
| T7-05 | Tuzilma kabineti | Aniq/Yangi | 🔒 | Akk | Panel bor, qulflangan |

---

## 4. Reja bo'yicha "asosiy oqim ishlayapti" belgilari — hozir

| Bosqich | Belgi | Holat |
|---|---|---|
| 0 | Production'da demo/openapi yo'q | ✅ |
| 0 | Parol tiklash, OTP qoidalari | ⚠️ tiklash bor, OTP kodlari umumiy chatga ketadi |
| 0 | Har rol faqat o'z sahifalari, rol kodsiz yaratiladi | ⚠️ sahifalar to'g'ri; 2FA yo'q |
| 0 | Seed bir buyruq bilan to'liq test-dunyo | ❌ |
| 0 | PII test bilan tasdiqlangan | ❓ |
| 1A | Yangi mijoz butun oqimni advokat ishtirokida yakunlaydi | ❌ (staging va tasdiqlangan advokat yo'q) |
| 1A | AI manbali, limit taklifi javobdan keyin, lid | ❌ manba yo'q |
| 1A | Advokat 5 qadam, tuzilmasiz qabul qilmaydi | ⚠️ |
| 1A | Shartnoma ikki tomon OTP, PDF | 🔒 |
| 1A | Shablon 3 bepul, keyin obuna/19 000, kolontitul va QR | ❌ |

**Xulosa:** 0-bosqich yopilishiga 5 ta backend tuzatish (T0-02, T0-05, T0-07, T0-08, T0-18 matnlar) va 4 ta dasturchi namoyishi qolgan. 1A esa hali ochiq — asosiy to'siqlar AI manba (T1-04), takliflar (T1-05), katalog (T1-06), shablon mexanizmi (T1-14) va staging.

---

## 5. Arxivdagi kontent bo'yicha nima qilish kerak

| # | Ish | Kim | Qachon |
|---|---|---|---|
| 1 | 10 huquqiy hujjatning 3 tildagi matnini `/legal/consents` ga versiya 1.0 sifatida kiritish (hozir placeholder). Til maydoni qo'shish (`language`), frontend tilga qarab ko'rsatadi | BE (+FE til tanlash) | Darhol — S-53: placeholder bilan production yo'q |
| 2 | Admin → "Huquqiy hujjatlar" tahrir ekrani va "Roziliklar" jurnali ekrani (T0-18) | FE + BE (`PUT /admin/legal/consents/{id}`) | 0-bosqich |
| 3 | Ofertadagi bo'sh joylar (MChJ nomi, STIR, manzil) — PM'dan | PM | Production'dan oldin |
| 4 | "Nega bu narx?"da platforma haqi ko'rsatiladimi (hujjat 2.3) yoki yashirinmi (S-27) — aniqlashtirish | PM | Hozir |
| 5 | 06-hujjat (mijoz–advokat shartnoma shabloni) → T1A-04 PDF shablon matni sifatida | BE | 1A |
| 6 | Shablon konstruktori (T1B-09): DOCX yuklash, `{{…}}` topish, maydon turlari, ZIP import | FE + BE | 1B, lekin 36 namuna uchun kerak |
| 7 | 36 sud namunasini Ilova F sxemasiga o'tkazish (maydon kodlari, 3 til, shartli bloklar) | Kontent-menejer / PM yuristi | Konstruktor tayyor bo'lgach |
| 8 | Namunalar kirillda — lotin transliteratsiyasi avtomatik (T1-14), ruscha qo'lda | BE + PM | |

---

## 6. Keyingi haftaga tavsiya (ustuvorlik bo'yicha)

**Backend (bloklovchi):**
1. T0-02 — OTP kodlari umumiy chatga ketmasin (xavfsizlik).
2. T0-05 — barcha ichki rollar va advokat/yurist uchun 2FA, sessiya 8/2 soat.
3. T0-18 — 10 hujjat matnini kiritish + tahrir API.
4. T1-04 — AI manba (modda, hujjat, sana), "bilmayman".
5. T1-05 — 3 darajali taklif (turli narx, yo'nalishga mos).
6. T0-07 — test ma'lumotlarni tozalash, 3 darajali katalog, advokat narxlari, paketlar.
7. Staging muhiti va har rol uchun akkaunt (tasdiqlangan advokat, yurist, finance, moderator, QC).

**Frontend (backend'siz qilsa bo'ladigan):**
1. T1-14 — shablon wizard (qadamlar, progress, saqlash), DOCX yuklab olish, limit ekrani.
2. T0-18 — huquqiy hujjatlar tahriri va roziliklar jurnali ekranlari (API bo'lganda ulanadi).
3. T0-20 — buyurtmada "javob muddati ertaga 09:30 gacha".
4. T1B-01 — mijozda paketlar sahifasi (backend 75 paket bor).
5. T1B-05 — conflict check (backend bor).
6. T2-06 / T2-08 — advokat payout va referal sahifalari (backend bor).
7. T1-09 — advokat filtrlari (narx, reyting, til, jins, onlayn) va "Yangi" belgisi.
