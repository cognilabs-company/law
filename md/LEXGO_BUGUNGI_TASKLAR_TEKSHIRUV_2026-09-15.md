# LexGo — bugungi tasklarni o'zingiz tekshirish yo'riqnomasi

**Sana:** 2026-09-15
**Asos:** "LexGo_GM_Qabul_tekshiruvi" (bosh menejer qabul mezonlari) va "Ishlab chiqish rejasi v1.1".
**Bugungi tasklar (28 ta):**
- 0-bosqichning 20 ta taski: T0-01 … T0-20;
- bugun Review'ga o'tgan 8 ta task: T1-04, T1-05, T1-06, T1-07, T1A-02, T1-14, T1-15, T1-18.

Har task uchun quyidagilar yozilgan:
- qaysi akkaunt bilan kirish;
- qaysi sahifaga o'tish
- nima qilish;
- to'g'ri natija qanday bo'lishi;
- GM qachon "bajarilmagan" deydi;
- 15-sentyabr kechki testda nima ko'ringani.

---

## ⚠️ Boshlashdan oldin

### 1. Frontend o'zgarishlari hali saytda yo'q
Bu sessiyadagi frontend ishlarining hammasi hali **push qilinmagan va deploy bo'lmagan**. Oxirgi push — `93bd31d`. Saytda hozir eski versiya turibdi, shuning uchun quyidagilar ko'rinmaydi:
- Telegram 2FA ekranlari;
- "Muammo tahlili"dagi takliflar, manbalar, "Javob foydali bo'ldimi?";
- "Hujjat tahlili"dagi fayl yuklash va narx yoyilmasi;
- "Xizmat pasporti", advokat onboarding'i (5 qadam), "E2E tayyorlik";
- rollar bo'yicha menyu va sahifa cheklovlari, "Bootstrap" tuzatishi.

Avval **push + deploy** qiling, keyin tekshiring.

### 2. Test akkauntlar

| Rol | Telefon | Kirishda kod |
|---|---|---|
| Superadmin | +998900000001 | Hozir so'ralmaydi (xato, T0-05) |
| Admin | +998900000002 | Hozir so'ralmaydi (xato, T0-05) |
| Call-center lawyer | +998900000003 | Telegram kodi |
| Sales operator | +998900000004 | Hozir so'ralmaydi |
| Client (mijoz) | +998900000005 | Kerak emas |
| Advokat | +998900000006 | Telegram kodi |
| Yurist | +998900000007 | Telegram kodi. Backend'da hali advokat bo'lib turibdi |

Parollar sizda, bu faylga yozilmadi.

### 3. Tayyorgarlik
- **Ikki brauzer oynasi** oching: masalan, oddiy va inkognito. Birida mijoz, ikkinchisida advokat yoki admin bo'ladi.
- **Konsol:** F12 → **Console** yorlig'i ochiq tursin (qizil xatolarni ko'rish uchun, T0-12).
- **Telefon ko'rinishi:** F12 → Ctrl+Shift+M → kenglik **390** (T0-13), yoki haqiqiy telefonda oching.

### 4. Production'da ehtiyot bo'ling
- Haqiqiy to'lov, shartnoma imzosi va lid ko'chirishni sinab ko'rmang.
- Payme va Click ulanmagan, to'lov baribir oxirigacha bormaydi.
- Parol tiklash (T0-04) test akkauntning parolini o'zgartiradi, jamoaga oldindan ayting.

### Belgilar
✅ testda o'tdi · ⚠️ qisman · ❌ GM mezoni bo'yicha bajarilmagan · ❓ dasturchi ko'rsatadi yoki sizning tekshiruvingiz kerak

---

## Qisqa jadval

| Task | Nima | Akkaunt | Qayerda | Holat |
|---|---|---|---|---|
| T0-01 | Muhitlarni ajratish | Superadmin | Test OTP | ✅ |
| T0-02 | OTP qoidalari | Yangi raqam | Ro'yxatdan o'tish | ❌ |
| T0-03 | API hujjati yopiq | — | Brauzer manzili | ✅ |
| T0-04 | Parol tiklash | Client | Kirish → Parolni unutdingizmi? | ✅ |
| T0-05 | 2FA va sessiya | Admin, Advokat | Kirish | ❌ |
| T0-06 | Rollar va ruxsatlar | Superadmin, Sales operator | Rollar va ruxsatlar | ⚠️ |
| T0-07 | Test ma'lumotlar | Superadmin, Client | Xizmatlar, Namunalar… | ❌ |
| T0-08 | Bildirishnoma kaskadi | Superadmin | Bildirishnomalar | ❌ |
| T0-09 | To'lov abstraksiyasi | Dasturchi | — | ❓ |
| T0-10 | MyID abstraksiyasi | Client, Superadmin | Profil, Integratsiyalar | ✅ |
| T0-11 | Audit jurnali | Superadmin | Audit jurnali | ✅ |
| T0-12 | Konsol xatolari | Hamma rollar | F12 → Console | ✅ |
| T0-13 | Telefonda ko'rinish | Hamma rollar | 390 px | ✅ |
| T0-14 | Integratsiyalar holati | Superadmin | Integratsiyalar | ⚠️ |
| T0-15 | Telegram bot | Client yoki Advokat | Profil → Telegram hisobi | ❓ |
| T0-16 | Pul tiyinda | Dasturchi | — | ❓ |
| T0-17 | PII niqoblash | Dasturchi | — | ❓ |
| T0-18 | Huquqiy hujjatlar, roziliklar | Yangi raqam, Admin | Ro'yxatdan o'tish | ⚠️ |
| T0-19 | Hosting rejasi | — | Hujjat | ❌ |
| T0-20 | Ish vaqti kalendari | Client | Muammo tahlili, Mening ishlarim | ⚠️ |
| T1-04 | AI manba, disclaimer | Client | Muammo tahlili | ❌ |
| T1-05 | 3 darajali taklif | Client | Muammo tahlili | ❌ |
| T1-06 | Katalog 3 daraja, qidiruv | Client | Xizmatlar | ❌ |
| T1-07 | Xizmat pasporti | Client | Xizmatlar → Xizmat pasporti | ⚠️ |
| T1A-02 | Advokat onboarding | Advokat | Boshqaruv paneli | ⚠️ |
| T1-14 | Shablon → hujjat | Client | Hujjat namunalari | ❌ |
| T1-15 | Hujjat tahlili | Client | Hujjat tahlili | ⚠️ |
| T1-18 | Uchidan-uchiga ssenariy | Superadmin | E2E tayyorlik | ❌ |

**Jami:** ✅ 7 · ⚠️ 8 · ❓ 3 · ❌ 10.                 

---

## 0-bosqich

### T0-01 — Test va real muhit ajratilgan
- **Akkaunt:** Superadmin.
- **Qayerda:** Admin panel → **Test OTP**.
- **Qadamlar:**
  1. "Test OTP" sahifasini oching.
  2. Backendchidan production'da demo to'lov manzilini ochib ko'rsatishini so'rang.
- **To'g'ri natija:**
  - Sahifada "Faqat staging muhitida" yozuvi chiqadi.
  - Demo to'lov manzili production'da **404 Not Found** qaytaradi.
- **Bajarilmagan belgisi:** production'da demo manzil ochilsa yoki javob qaytarsa.
- **Testda:** ✅ "Faqat staging muhitida" chiqdi, demo-confirm manzili 404 qaytardi.

### T0-02 — OTP kodi va qoidalari
- **Akkaunt:** hali ro'yxatdan o'tmagan yangi telefon raqami.
- **Qayerda:** Chiqish → **Ro'yxatdan o'tish**.
- **Qadamlar:**
  1. Ism, telefon, **viloyat** va roziliklarni kiriting, kod so'rang.
  2. Ekranda va brauzer manzilida kod ko'rinmasligini tekshiring.
  3. "Qayta yuborish" tugmasi 60 soniya yopiq turishini tekshiring.
  4. Ketma-ket 3 marta noto'g'ri kod kiriting.
  5. 2 daqiqa kutib, eski kodni kiriting.
- **To'g'ri natija:**
  - Kod 6 xonali, faqat Telegram yoki SMS'ga keladi.
  - 3-xatodan keyin "15 daqiqa kuting" xabari chiqadi.
  - Eski kod 2 daqiqadan keyin ishlamaydi.
- **Bajarilmagan belgisi:** kod ekranda yoki URL'da ko'rinsa, yoki 5–6 marta xato kiritish mumkin bo'lsa.
- **Testda:** ❌
  - Frontend'da kod ko'rinmaydi, taymer bor.
  - **Lekin production'da har foydalanuvchining kodi umumiy test Telegram chatiga ketyapti** (`TELEGRAM_OTP_TEST_MODE`). Test paytida boshqa raqamlarning kodlari keldi. Backend MD, 32-band.

### T0-03 — API texnik hujjati yopiq
- **Akkaunt:** kerak emas.
- **Qadamlar:** brauzerda quyidagilarni oching:
  - `https://lexgo.api.cognilabs.org/docs`
  - `https://lexgo.api.cognilabs.org/openapi.json`
- **To'g'ri natija:** ikkalasi ham 404 yoki "kirish taqiqlangan".
- **Bajarilmagan belgisi:** API ro'yxati ochilsa.
- **Testda:** ✅ ikkalasi ham 404.

### T0-04 — Parolni tiklash
- **Akkaunt:** Client (test paroli o'zgaradi, jamoaga ayting).
- **Qayerda:** **Kirish** sahifasi → "**Parolni unutdingizmi?**".
- **Qadamlar:**
  1. Telefonni kiriting va kod oling.
  2. "Yangi parol" maydonini to'ldirib, "Parolni yangilash"ni bosing.
  3. Yangi parol bilan kiring.
  4. Chiqib, eski parol bilan kirib ko'ring.
- **To'g'ri natija:** yangi parol bilan kiradi, eski parol bilan kirmaydi.
- **Bajarilmagan belgisi:** havola yo'q yoki "tez kunda" desa.
- **Testda:** ✅ Havola va ekranlar bor. Parol o'zgarmasin deb oxirigacha sinalmadi.

### T0-05 — 2FA va sessiya muddati
- **Akkaunt:** Admin, keyin Advokat.
- **Qayerda:** **Kirish**.
- **Qadamlar:**
  1. Admin bilan telefon va parolni kiriting.
  2. "Ikki bosqichli tasdiqlash" ekrani chiqishi kerak.
  3. Xuddi shuni Advokat bilan takrorlang.
  4. Admin panelda 2 soat hech narsa qilmay turing.
- **To'g'ri natija:**
  - Admin va advokatda kod majburiy.
  - 2 soatdan keyin qayta login so'raladi.
- **Bajarilmagan belgisi:** admin kodsiz kirsa.
- **Testda:** ❌
  - Superadmin, Admin va Sales operator **kodsiz kirdi**.
  - Advokat, Yurist va Call-center lawyer'dan kod so'raldi.
  - **Sabab:** backend 2FA'ni faqat asosiy roli `client` bo'lmaganlarga so'raydi. Admin'larning asosiy roli esa `client`. Backend MD, 30-band.

### T0-06 — Rollar va ruxsatlar
- **Akkaunt:** Superadmin, keyin Sales operator.
- **Qayerda:** Admin panel → **Rollar va ruxsatlar**.
- **Qadamlar:**
  1. Superadmin: "Rollar" ro'yxatini sanang (14 ta bo'lishi kerak).
  2. "**Yangi rol**" orqali test rol yarating va unga ruxsatlarni belgilang.
  3. "Rol biriktirish" bo'limini ko'ring.
  4. Admin bilan kiring: menyuda "Rollar va ruxsatlar" bo'lmasligi kerak.
  5. Sales operator bilan kiring va brauzer manzil qatoriga sayt manzilidan keyin `/uz/admin/roles` yozing. Xuddi shuni `/uz/admin/audit-trail` va `/uz/admin/bootstrap` bilan ham qiling.
- **To'g'ri natija:**
  - Rol dasturchisiz yaratiladi.
  - Sales operator ruxsatsiz sahifalarni ocholmaydi, "Sotuv voronkasi"ga qaytariladi.
- **Bajarilmagan belgisi:** rol URL orqali ochilsa yoki rol yaratish uchun "dasturchiga ayting" desa.
- **Testda:** ⚠️
  - ✅ 7 ta rolning hammasida boshqa sahifalar URL orqali ochilmaydi.
  - ✅ "Bootstrap" sahifasi Sales operator va Call-center'ga ochilardi — tuzatildi, lekin push kutyapti.
  - ❌ Call-center lawyer va "Yurist" backend'da `advokat` rolida.
  - Rollar soni (14) va rol yaratish jonli sinalmadi.

### T0-07 — Test ma'lumotlar (seed)
- **Akkaunt:** Superadmin, Client.
- **Superadmin'da qarang:**
  - Xizmatlar
  - Namunalar
  - Reklama
  - Sifat nazorati
  - Advokatlarni tasdiqlash
  - Ro'yxatdan o'tish so'rovlari
- **Client'da qarang:**
  - Xizmatlar
  - Advokat va yuristlar
- **To'g'ri natija:**
  - 17 oilali katalog, 8 tasi ochiq.
  - Advokatlarda narx bor.
  - 10 ta shablon, paketlar va rejalar bor.
  - Hamma nomlar real ko'rinadi.
- **Bajarilmagan belgisi:** katalog bir darajali bo'lsa, advokatda narx bo'sh bo'lsa yoki test nomlar qolsa.
- **Testda:** ❌ Hozir ko'rinayotgan test nomlari:
  - kategoriyalar: "Gift Cat", "Test", "Test category", `fixture-business`; kirill va lotin nomlar aralash;
  - namunalar: "Admin tpl", "Document request list test";
  - reklama: "Adm Ad";
  - shikoyatlar: "sssss", "e2e";
  - advokatlar: "Demo Yurist 1–5", "Test Yurist";
  - so'rovlar: `yurist3`, `yurist7`, `yurist9`;
  - voronkada eski 411 ta "Tizimga kirish" lidi.

### T0-08 — Bildirishnoma kaskadi
- **Akkaunt:** Superadmin.
- **Qayerda:**
  - Admin panel → **Bildirishnomalar**;
  - mijoz yoki advokat → **Profil** → "Xabarnoma sozlamalari".
- **Qadamlar:**
  1. Hodisalar ro'yxatini toping (buyurtma qabul qilindi, to'lov…).
  2. Har hodisaning kanallarini (Telegram → SMS → email) va matnini tahrirlab ko'ring.
- **To'g'ri natija:** hodisalar va kanallar ro'yxati bor, matn admin tomonidan tahrirlanadi, xabar Telegram'ga keladi.
- **Bajarilmagan belgisi:** matn kodda bo'lsa, yoki Telegram ulangan bo'lsa ham SMS ketsa.
- **Testda:** ❌ Admin'da faqat "Bildirishnoma yuborish" formasi bor. Hodisalar ro'yxati va matn tahriri ekrani yo'q, backend API ham kerak.

### T0-09 — To'lov abstraksiyasi
- **Kim:** backendchi ko'rsatadi.
- **So'rang:**
  1. To'lov provayderi interfeysi va sozlama qayerda.
  2. Bitta webhook'ni ikki marta yuborib ko'rsatsin.
- **Siz ko'rasiz:** Admin panel → **Integratsiyalar**: Payme va Click "Sozlanmagan".
- **To'g'ri natija:** takroriy webhook ikkinchi to'lov yaratmaydi.
- **Bajarilmagan belgisi:** "Payme kelganda qayta yozamiz" desa.
- **Testda:** ❓ Webhook route bor (imzosiz so'rovga 401). Takroriy webhook ko'rsatilmagan.

### T0-10 — Identifikatsiya abstraksiyasi (MyID)
- **Akkaunt:** Client, Superadmin.
- **Qayerda:**
  - Client → **Profil** → "**Shaxsni tasdiqlash**" → "Tasdiqlash";
  - Superadmin → **Integratsiyalar**.
- **To'g'ri natija:**
  - Hozircha demo tasdiq ishlaydi.
  - Integratsiyalarda OneID va MyID "Sozlanmagan".
  - Biometrik ma'lumot saqlanmaydi (buni backendchi tasdiqlaydi).
- **Bajarilmagan belgisi:** MyID kodga qattiq yozilgan bo'lsa yoki sozlama bo'lmasa.
- **Testda:** ✅

### T0-11 — Audit jurnali
- **Akkaunt:** Superadmin.
- **Qayerda:** Admin panel → **Audit jurnali**.
- **Qadamlar:**
  1. Filtrlarni ishlatib ko'ring (foydalanuvchi, amal, sana).
  2. "**CSV eksport**"ni bosing.
  3. Yozuvni o'chirish tugmasi yo'qligini tekshiring.
  4. Fayl harakatini sinang: Client → Hujjat tahlili → fayl yuklab tahlil qiling, keyin jurnalda shu harakatni qidiring.
- **To'g'ri natija:** har harakat yoziladi, o'chirib bo'lmaydi, fayl harakatlari ham bor.
- **Bajarilmagan belgisi:** yozuv o'chirilsa yoki fayl harakatlari yozilmasa.
- **Testda:** ✅ 690+ yozuv, filtrlar ishlaydi, CSV yuklandi, o'chirish tugmasi yo'q. Fayl harakati yozilishini o'zingiz tasdiqlang.

### T0-12 — Brauzer xatolari yo'q
- **Akkaunt:** hamma rollar.
- **Qadamlar:** F12 → Console ochiq holda har rolning menyusidagi hamma sahifani bosib chiqing.
- **To'g'ri natija:** qizil xatolar yo'q.
- **Bajarilmagan belgisi:** qizil xatolar bo'lsa.
- **Testda:** ✅ 7 rolda 180 dan ortiq sahifa ochildi, JS xato chiqmadi.
  - Faqat "Test OTP" sahifasida backend 404 qaytaradi. Bu production uchun kutilgan holat.

### T0-13 — Telefonda ko'rinish
- **Akkaunt:** hamma rollar.
- **Qadamlar:** F12 → Ctrl+Shift+M → kenglik 390 bo'lsin, asosiy sahifalarni aylanib chiqing (yoki telefonda oching).
- **To'g'ri natija:** gorizontal skroll yo'q, elementlar ustma-ust tushmaydi, hamma narsa bosiladi.
- **Bajarilmagan belgisi:** gorizontal skroll yoki ustma-ust elementlar.
- **Testda:** ✅ 7 rolning ~40 ta asosiy sahifasida gorizontal skroll yo'q.

### T0-14 — Integratsiyalar holati haqiqiy
- **Akkaunt:** Superadmin.
- **Qayerda:** Admin panel → **Integratsiyalar**.
- **To'g'ri natija:**
  - Ulanmaganlar "Sozlanmagan" deb turadi.
  - Ulanganlarida "Test" tugmasi ishlaydi.
- **Bajarilmagan belgisi:** hammasi "Ulangan" deb tursa.
- **Testda:** ⚠️
  - ✅ Payme, Click, SMS, email, OneID, MyID "Sozlanmagan".
  - ❌ Integratsiya bo'lmagan "Mobil API", "Payment Mode", "Veb-sayt API" qatorlari "Ulangan" deb turibdi.
  - ❌ "Test" tugmasi yo'q.

### T0-15 — Telegram bot
- **Akkaunt:** Client yoki Advokat.
- **Qayerda:** **Profil** → "**Telegram hisobi**" → "**Telegramni ulash**".
- **Qadamlar:**
  1. Bot ochiladi, Start'ni bosing. Sahifada "Ulangan" belgisi chiqishi kerak.
  2. Botga muammo yozing, masalan "Ajrashish bo'yicha maslahat kerak".
  3. Superadmin → **Sotuv voronkasi**da manbasi "Telegram" bo'lgan lid paydo bo'lganini tekshiring.
- **To'g'ri natija:** akkaunt bog'lanadi, kod va xabarlar keladi, bot xabaridan lid yaratiladi.
- **Bajarilmagan belgisi:** bot yo'q yoki bog'lanmasa.
- **Testda:** ❓ Ulash tugmasi bor, voronkada "Telegram" manbali lidlar bor. Lekin ulashni sizning Telegram'ingiz bilan sinash kerak.
  - Hozir test rejimi yoqilgani uchun kodlar shaxsiy chatga emas, umumiy chatga ketyapti.

### T0-16 — Pul tiyinda
- **Kim:** backendchi ko'rsatadi: summalar bazada butun son (tiyin).
- **Siz ko'rasiz:** Client → **Mening ishlarim** → "To'lov bosqichlari".
  - Summalar butun son bo'lishi kerak.
  - Bosqichlar yig'indisi buyurtma summasiga teng bo'lishi kerak.
  - Masalan, 32 670 + 43 560 + 32 670 = 108 900.
- **Bajarilmagan belgisi:** kasr son (149000.5) yoki farq bo'lsa.
- **Testda:** ❓

### T0-17 — Shaxsiy ma'lumotlarni niqoblash (AI oldidan)
- **Kim:** backendchi AI logini ko'rsatadi.
- **To'g'ri natija:** logda ism, telefon va pasport o'rnida `[NAME]`, `[PHONE]`, `[PASSPORT]` turadi.
- **Bajarilmagan belgisi:** logda real ma'lumot ko'rinsa.
- **Testda:** ❓

### T0-18 — Huquqiy hujjatlar va roziliklar
- **Akkaunt:** yangi raqam (ro'yxatdan o'tish), Admin.
- **Qadamlar:**
  1. **Ro'yxatdan o'tish**: har hujjat uchun alohida galochka borligini tekshiring.
  2. Admin bilan birinchi kirishda rozilik oynasi chiqadi: hujjatlar alohida-alohida.
  3. Admin panelda huquqiy hujjat matnini tahrirlash va "kim, qaysi versiyaga, qachon rozi bo'lgan" jurnalini qidiring.
- **To'g'ri natija:** alohida galochkalar, admin matnni tahrirlaydi, yangi versiyada qayta rozilik so'raladi, jurnal bor.
- **Bajarilmagan belgisi:** bitta umumiy galochka yoki matn kodda bo'lsa.
- **Testda:** ⚠️
  - ✅ Alohida galochkalar, rolga qarab hujjatlar, qayta rozilik bor.
  - ❌ Admin panelda hujjat matnini tahrirlash ekrani yo'q. Backend'da ham tahrir API yo'q.
  - ❌ Roziliklar jurnali ekrani yo'q. Backend'da `/admin/legal/user-consents` bor, frontend'ga ulanmagan.

### T0-19 — Production hosting rejasi (O'zbekiston)
- **Kim:** backendchi yoki devops.
- **So'rang:** serverni O'zbekistonga ko'chirish rejasi hujjati va staging'dagi sinov natijasi.
- **Bajarilmagan belgisi:** reja yo'q.
- **Testda:** ❌ Hujjat berilmagan.

### T0-20 — Ish vaqti kalendari
- **Akkaunt:** Client.
- **Qayerda:** **Muammo tahlili**, **Mening ishlarim**.
- **Qadamlar:** ish vaqtidan tashqari (19:00 dan keyin yoki yakshanba) kiring.
- **To'g'ri natija:**
  - "Hozir ish vaqti emas · Du–Sh, 09:00–19:00" yozuvi chiqadi.
  - Buyurtmada "javob muddati ertaga 09:30 gacha" kabi muddat ko'rinadi.
- **Bajarilmagan belgisi:** tunda 30 daqiqalik taymer ishlab ketsa.
- **Testda:** ⚠️
  - ✅ "Hozir ish vaqti emas" belgisi bor.
  - ❌ Buyurtmada ish vaqtiga qarab hisoblangan muddat ko'rinmaydi.

---

## Bugun Review'ga o'tgan tasklar

### T1-04 — AI korpusi, manba, disclaimer
- **Akkaunt:** Client.
- **Qayerda:** **Muammo tahlili**.
- **Qadamlar:**
  1. Aniq savol yozing, masalan "Ish beruvchi 2 oydan beri maosh bermayapti", va "Tahlil qilish"ni bosing.
  2. Javob ostida "Rasmiy manbalar" ro'yxatini tekshiring: **modda raqami va sana** bo'lishi kerak.
  3. Ma'nosiz savol yozing: "bilmayman" yoki "manba topilmadi" deyishi kerak.
  4. Pastdagi ogohlantirish (disclaimer) yopilmasligini tekshiring.
  5. "Javob foydali bo'ldimi?" → "Foydasiz"ni bosing: "tekshiruvga yuborildi" xabari chiqishi kerak.
  6. Admin panelda manba fayl qo'shish joyini qidiring.
- **To'g'ri natija:** manba modda va sana bilan, noma'lum savolda "bilmayman", disclaimer bor, feedback navbatga tushadi, admin fayl yuklaydi.
- **Bajarilmagan belgisi:** manbasiz javob bersa yoki hamma narsaga ishonch bilan javob bersa.
- **Testda:** ❌
  - Manbalar faqat portal nomlari (Lex.uz, Adliya, gov.uz, my.gov.uz), modda va sana yo'q.
  - ✅ "Modda va sanasi aniq manba topilmadi" ogohlantirishi, disclaimer va "Foydali/Foydasiz" bor (push kutyapti).
  - ❌ Admin'da manba fayl yuklash joyi yo'q.

### T1-05 — 3 darajali taklif
- **Akkaunt:** Client.
- **Qayerda:** **Muammo tahlili**.
- **Qadamlar:** uch xil savol yuboring.
  1. **Oddiy:** "Aliment qanday hisoblanadi?" → faqat havola yoki tugma chiqishi kerak.
  2. **Aniq muammo:** "Ijarachi 3 oydan beri pul to'lamayapti, shartnoma bor" → **3 ta xizmat yoki advokat kartasi**.
  3. **Shoshilinch:** "Hozir meni militsiya ushlab turibdi" → yuqorida **qizil blok** (SOS va call-markaz raqami).
  4. Superadmin → **Sotuv voronkasi**da manbasi "AI tahlil" bo'lgan lid paydo bo'lganini tekshiring.
- **To'g'ri natija:** uch daraja to'g'ri ishlaydi, lid yaratiladi, matn admindan o'zgaradi.
- **Bajarilmagan belgisi:** hamma savolga bir xil taklif chiqsa.
- **Testda:** ❌
  - Backend'ning oxirgi yangilanishidan keyin aniq muammoda **0 ta taklif** kelyapti (oldin uchalasi bir xil 99 000 so'm edi). Backend MD, 31-band.
  - Maosh haqidagi savol "Shartnomalar"ga tasniflandi.
  - ✅ AI tahlildan lid yaratiladi.
  - Qizil blok ekranda bor, lekin shoshilinch savolni backend to'g'ri aniqlashini bu testda sinamadim — o'zingiz tekshiring.

### T1-06 — Katalog: 3 daraja, sinonim, qidiruv
- **Akkaunt:** Client.
- **Qayerda:** **Xizmatlar**.
- **Qadamlar:**
  1. Oila → guruh → xizmat tartibida ochib ko'ring.
  2. Yopiq oilalarda "Tez kunda" belgisini qidiring.
  3. Qidiruvda uch xil yozing: to'g'ri ("ajrashish"), xato bilan ("ajrashsh") va kirillda ("ажралиш").
  4. Superadmin → **Xizmatlar**: oilani yoqish/o'chirish va xizmatni boshqa guruhga ko'chirishni sinang.
- **To'g'ri natija:** 17 oila → guruh → xizmat, 8 tasi ochiq, qidiruv xato yozuvni ham topadi, oila admindan yoqiladi.
- **Bajarilmagan belgisi:** qidiruv faqat aniq so'zni topsa yoki oila yoqish dasturchi talab qilsa.
- **Testda:** ❌
  - ✅ Qidiruv lotin va kirillda topadi, tez ishlaydi (0,1–0,4 s).
  - ❌ "Guruh" darajasi va "Tez kunda" yo'q, kategoriyalar test nomlari bilan aralash.

### T1-07 — Xizmat pasporti
- **Akkaunt:** Client.
- **Qayerda:** **Xizmatlar** → xizmat kartasi → "**Xizmat pasporti**".
- **Tekshiring:** kerakli hujjatlar, kim bajaradi, muddat, **bosqichlar**, **kafolat**, **natijada nima olasiz**.
- **To'g'ri natija:** pasport to'liq, majburiy maydonsiz xizmat faol bo'lmaydi.
- **Bajarilmagan belgisi:** faqat nom va narx ko'rinsa.
- **Testda:** ⚠️
  - ✅ Bloklar bor: Xizmat, Muddat, Narx, SLA va qaytarish, Kerakli hujjatlar.
  - ❌ Bosqichlar, kafolat va "natijada nima olasiz" yo'q (backend'da maydon yo'q).
  - Ma'lumotlar kirillda: "Юрист", "Онлайн".

### T1A-02 — Advokat onboarding (5 qadam)
- **Akkaunt:** Advokat.
- **Qayerda:** **Boshqaruv paneli** → "**Ro'yxatdan o'tishni yakunlang**".
- **Qadamlar:**
  1. 5 qadamni ko'ring: Profil, Identifikatsiya, Hujjatlar, Xizmatlar, Narxlar.
  2. "Profil"ni to'ldirib saqlang, sahifani yangilang: qadam "bajarildi" bo'lishi kerak.
  3. "Identifikatsiya" → "Tasdiqlash" (demo).
  4. "Hujjatlar" → "Hujjat yuklash" (PDF, JPG yoki PNG, 15 MB gacha).
  5. Hammasi tugagach "**Tekshiruvga yuborish**"ni bosing.
  6. Yuqorida "Akkaunt admin tasdig'ini kutmoqda" banneri turishini tekshiring.
  7. Yarim yo'lda to'xtating, keyin Superadmin → **Sotuv voronkasi**da lid paydo bo'lganini tekshiring.
- **To'g'ri natija:** 5 qadam, holat saqlanadi, tugallanmasa lid, kutish holati bor.
- **Bajarilmagan belgisi:** bitta uzun forma bo'lsa yoki saqlanmasa.
- **Testda:** ⚠️
  - ✅ 5 qadam, "Hujjat yuklash", "Tekshiruvga yuborish" va kutish banneri bor (yuklash va yuborish push kutyapti).
  - ❌ Profil 60% to'ldirilgan bo'lsa ham progress "0/5".
  - ❌ Tugallanmagan onboarding'dan lid yaratilishi tasdiqlanmagan. Backend MD, 34-band.

### T1-14 — Shablon → hujjat
- **Akkaunt:** Client.
- **Qayerda:** **Hujjat namunalari**.
- **Qadamlar:**
  1. Namunani tanlang, ma'lumotlarni **bosqichma-bosqich** to'ldiring, yarim yo'lda chiqib qayta kiring: saqlangan bo'lishi kerak.
  2. "To'lash va yaratish" → PDF va DOCX olinadi. Real to'lov qilmang, faqat ekranni ko'ring.
  3. PDF'da kolontitul va QR borligini tekshiring.
  4. Oyiga 3 ta bepul, 4-hujjatda 19 000 so'm yoki obuna taklifi chiqishi kerak.
- **To'g'ri natija:** wizard, saqlash, AI bilan to'ldirish, PDF va DOCX, limit ishlaydi.
- **Bajarilmagan belgisi:** limit ishlamasa yoki PDF'da kolontitul yo'q bo'lsa.
- **Testda:** ❌
  - ✅ So'rovnoma → to'lov → PDF "Ochish" va "Yuklab olish" bor.
  - ❌ Bosqichli wizard, DOCX, oyiga 3 ta limit va kolontitul yo'q.

### T1-15 — Hujjat tahlili
- **Akkaunt:** Client.
- **Qayerda:** **Hujjat tahlili**.
- **Qadamlar:**
  1. "**Fayl yuklash (PDF, DOCX, TXT)**" orqali shartnoma yuklang yoki matnni joylang.
  2. "Sahifalar soni" avtomatik chiqishini tekshiring.
  3. "Advokat tekshiruvi"ni belgilab "**Narxni hisoblash**"ni bosing. Narx: 1–5 sahifa 149 000, 6–15 sahifa 299 000, 16–30 sahifa 499 000 so'm. Sahifa sonini o'zgartirib, narx o'zgarishini ko'ring.
  4. "Tahlil qilish" → natija **6 bo'limda** chiqishi va "Advokat tomonidan tekshiruv" taklifi bo'lishi kerak.
- **To'g'ri natija:** 6 bo'lim, narx sahifaga qarab, limit.
- **Bajarilmagan belgisi:** narx bir xil bo'lsa.
- **Testda:** ⚠️
  - ✅ Narx sahifaga qarab o'zgaradi.
  - ✅ Fayl yuklash va "Yozma xulosa" narxi bor (push kutyapti).
  - ✅ Advokat tekshiruvi taklifi bor.
  - ❌ Natija 3 bo'limda (qisqacha, xatarlar, tavsiyalar), 6 emas.
  - ❌ Faylni AI emas, oddiy qoida tahlil qiladi: xulosa sifatida matnning birinchi gapi qaytadi.
  - ❌ Matnli tahlil ~40 soniya davom etadi.

### T1-18 — Uchidan-uchiga ssenariylar
- **Akkaunt:** Superadmin.
- **Qayerda:** Admin panel → **E2E tayyorlik**.
- **Qadamlar:**
  1. 6 ta ssenariyning holatini ko'ring ("Sinalgan" / "Sinash kerak" / "Bloklangan").
  2. Backendchidan **yozma test hisobotini** so'rang: yangi mijoz bilan butun oqim o'tkazilgan va natija yozilgan bo'lishi kerak.
- **To'g'ri natija:** hisobot bor, demo o'tadi.
- **Bajarilmagan belgisi:** hisobot yo'q — bosqich yopilmaydi.
- **Testda:** ❌
  - Sahifada holatlar chiqadi, lekin "Sinalgan" faqat bazada to'lov yoki chat xonasi borligini bildiradi.
  - Test hisoboti berilmagan.

---

## GM demo-ssenariysi (PM'ga ko'rsatishdan oldin bir marta o'ting)

### 0-bosqich (~15 daqiqa)
1. Superadmin → Rollar va ruxsatlar → rollar ro'yxati (14) → yangi rol yaratish. *(T0-06)*
2. Client → Kirish → "Parolni unutdingizmi?" oqimi. *(T0-04)*
3. Admin bilan kirish → 2FA kod so'ralishi. *(T0-05 — ❌ hozir so'ralmaydi)*
4. Client → Xizmatlar: katalog 3 daraja va narxli advokatlar. *(T0-07 — ❌)*
5. Superadmin → Integratsiyalar: real holat. Bildirishnomalar: kaskad va matn tahriri. *(T0-14 ⚠️, T0-08 ❌)*
6. Profil → Telegram hisobi → ulash va xabar olish. *(T0-15)*
7. Backendchi: production'da demo manzillar 404, PII niqoblash logi. *(T0-01 ✅, T0-17 ❓)*

### 1A-bosqich (ikki brauzer: mijoz + advokat)
Bu ssenariy uchun **tasdiqlangan advokat akkaunti** kerak. Hozirgi advokat va yurist `pending`, kabinetining 10 ta bo'limi qulflangan. Backendchidan so'rang.
1. Mijoz: 2 ta anonim savol → telefon tasdiq → 3-savolga manbali javob va 3 ta advokat kartasi.
2. Kartadan buyurtma → advokatda taymer bilan ko'rinadi → qabul → shartnoma ikki tomonlama OTP bilan.
3. 30% demo to'lov → chat ochiladi, telefon ko'rinadi (to'lovgacha ••• bo'lishi kerak).
4. Advokat 1-bosqichni "bajarildi" qiladi → mijoz tasdiqlaydi → 40% → yakun → 30% → baho va advokat javobi.
5. Shablon to'ldirish → QR bilan PDF → 4-yuklab olishda limit.
6. Call-markaz: shablon tekshirish buyurtmasi → navbat → SLA taymer.
7. Admin: statuslar tarixi, to'lov ulushlari, lidlar.

---

## Tekshiruvdan keyin

| Topilgan narsa | Kimga |
|---|---|
| Frontend xatosi: ekran, tugma yoki matn noto'g'ri | Menga, sahifa nomi va skrinshot bilan |
| Backend xatosi: ma'lumot, 2FA, AI, to'lov | `LEXGO_BACKEND_ISSUES_2026-09-15.md` dagi band raqami bilan backendchiga |
| Akkaunt yo'qligi: tasdiqlangan advokat, yurist, moderator, moliya | Backendchi yoki PM |
