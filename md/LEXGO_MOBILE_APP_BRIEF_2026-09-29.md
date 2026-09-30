# LexGo — mobil ilova uchun mazmun va funksiya brifi

**Sana:** 2026-09-29
**Loyiha:** LexGo — O'zbekistonning yuridik xizmatlar ekotizimi
**Manba:** amaldagi Next.js veb-ilova kodi (`law/`) va backend integratsiya hujjatlari
**Backend:** `https://lexgo.api.cognilabs.org`

> Bu hujjat **dizayn haqida emas**. Rang, shrift, joylashuv, animatsiya — hech biri
> yo'q. Bu yerda faqat: ilova nima qiladi, kim nimani ko'radi, qanday oqimlar bor,
> qaysi qoidalar majburiy va qanday ma'lumot harakatlanadi. Mobil jamoa (yoki AI)
> shu asosda ilovani o'z platformasiga mos UI bilan qura oladi.

---

## 1. Ilova bir jumlada

**LexGo** — yuridik yordamni bitta ilovaga yig'adi: O'zbekiston qonunchiligiga
o'qitilgan sun'iy intellekt, tasdiqlangan advokatlar marketplace'i, tayyor hujjat
konstruktori, shaxsiy advokat obunasi va ish yuritish tizimi.

**Mobil ilovaning asosiy va'dasi:** muammo chiqqan daqiqada telefondan javob olish —
AI'dan bepul javob, navbatchi advokat bilan bir tugmada bog'lanish, yoki 5 daqiqada
hujjat tayyorlash.

---

## 2. Ikki rol, bitta ilova

Ilova kirishda rolni aniqlaydi va interfeysni shunga qarab quradi:

| Rol | Kim | Ilovada nima qiladi |
|---|---|---|
| **client** | Mijoz (jismoniy shaxs / tadbirkor) | Xizmat qidiradi, buyurtma beradi, hujjat oladi, advokat bilan ishlaydi |
| **yurist / advokat / advokat_tashkiloti** | Xizmat ko'rsatuvchi | Yangi ishlarni oladi, ish yuritadi, hujjat tayyorlaydi, daromadini kuzatadi |

Ichki rollar (`admin`, `manager`, `call_center`, `sales`) mobil ilovaning **birinchi
versiyasiga kirmaydi** — ular veb-panelda ishlaydi. Ilova bu rollarni faqat
"bu hisob mobil ilovaga mo'ljallanmagan" deb to'g'ri xabar berishi kerak.

Mehmon (login qilmagan) foydalanuvchi ham ilovaga kira oladi va cheklangan holda
AI bilan gaplasha oladi — pastda "Mehmon rejimi" bo'limiga qarang.

---

## 3. Autentifikatsiya va sessiya

**Ro'yxatdan o'tish:** rol tanlash → telefon (+998) → SMS/Telegram OTP → parol
o'rnatish. Advokat/yurist qo'shimcha ravishda litsenziya va diplom yuklaydi,
so'ng tasdiqdan (approval) o'tadi — tasdiqlanmaguncha ishlar oqimi ochilmaydi.

**Kirish:** telefon + parol. Hisobda ikki bosqichli tasdiqlash yoqilgan bo'lsa,
6 xonali kod so'raladi — uch usuldan biri bo'yicha: **SMS**, **Telegram**, yoki
**TOTP** (authenticator ilovasi).

**Muhim xatti-harakatlar (veb-ilovada mavjud, mobilda ham kerak):**
- 3 marta xato urinishdan keyin lokal vaqtinchalik blok (5s → 60s, eksponensial).
- Server 429 qaytarsa, uning `retry_after` vaqti hurmat qilinadi.
- Kod qayta yuborish — 60 soniyalik kuldaun.
- Xato turlari ajratiladi: oflayn / server xatosi (5xx) / OTP kanali ishlamayapti (503).
- "Orqaga" bosilsa, hali amal qilayotgan tasdiqlash sessiyasi saqlanadi va
  qaytib kirilganda qayta ishlatiladi.
- Parolni tiklash: telefon → Telegram botga kod → yangi parol.

**Sessiya:** JWT (access + refresh). Token xavfsiz saqlanishi shart
(iOS Keychain / Android Keystore, `AsyncStorage` emas). Access token muddati
tugasa jimgina yangilanadi; refresh ham tugasa — kirish ekraniga qaytariladi va
sababi aytiladi ("Uzoq vaqt faollik bo'lmagani sababli sessiya yakunlandi").

---

## 4. Mehmon rejimi (login talab qilinmaydi)

- **AI bilan suhbat:** mehmon uchun kvota — **kuniga 2 ta, umumiy 5 ta** so'rov
  (IP bo'yicha, backend hisoblaydi). Kvota tugagach — ro'yxatdan o'tish taklifi.
- Xizmatlar katalogi, advokatlar ro'yxati, tariflar va narxlarni ko'rish.
- Buyurtma berish, chat ochish, hujjat yuklab olish — faqat login bilan.

Kvota chegarasi klient tomonda taxmin qilinmaydi: backend qaytargan qolgan
so'rovlar sonini ko'rsatish kerak.

---

## 5. Mijoz ilovasi — ekranlar va oqimlar

### 5.1. Bosh ekran
- Uchta asosiy kirish nuqtasi: **AI'ga savol**, **Advokat topish**, **Hujjat tayyorlash**.
- Faol ishlar qisqacha ro'yxati (keyingi qadam va muddat bilan).
- Tezkor xizmatlar: ekspress konsultatsiya, video konsultatsiya, shartnoma,
  hujjat tekshiruvi, tergovda himoya, kompaniya ochish, obunani sovg'a qilish.
- Obuna holati (agar bor bo'lsa) va AI kvotasi.

### 5.2. LexGo.AI — huquqiy sun'iy intellekt
Ilovaning eng ko'p ishlatiladigan qismi.

**Nima qila oladi:**
- Savolga **aniq modda va normaga havola bilan** javob beradi.
- Muammoni oddiy so'zlardan o'qib **yo'nalish va ish bosqichini** aniqlaydi,
  mos xizmat va advokatlarni taklif qiladi.
- **Hujjat tayyorlash:** 200+ namunadan shartnoma, ariza, shikoyat, da'vo,
  ishonchnoma. AI kerakli maydonlarni savol-javob orqali to'plydi.
- **Hujjat tahlili:** yuklangan faylda xatolar, qonunga zid bandlar, yashirin
  xavflar va bir tomonlama shartlarni topadi, har biriga alternativ formulirovka beradi.
- **Ish xronologiyasi:** yuklangan fayllardan voqealar va muddatlar tartibini tuzadi.

**Mobil uchun muhim:**
- Javob oqim (streaming) ko'rinishida kelishi kerak — uzun javobni kutib turish yomon tajriba.
- Fayl yuklash: PDF, DOCX, foto (kamera va galereyadan), bir nechta fayl.
- Ovozli xabar orqali savol berish.
- Suhbatlar tarixi saqlanadi va qurilmalar orasida sinxronlanadi.
- Har bir AI javobi ostida **disclaimer**: bu dastlabki tahlil, AI advokat o'rnini
  bosmaydi, yakuniy huquqiy qaror advokatda qoladi. Bu qoida — majburiy.
- Har bir AI xizmatining yonida **advokat varianti** ham taklif qilinishi shart.

**Kvotalar:** Free — oyiga 5 savol; Lite — 100 savol + 5 hujjat tahlili;
Pro — cheksiz (fair-use 1000) + 20 tahlil + sud amaliyoti + eksport.
Limit har oyning 1-sanasida yangilanadi. Tarifni oshirish darhol amal qiladi
(farq qolgan kunlarga proporsional), tushirish — joriy davr oxirida.

### 5.3. Advokat topish va buyurtma
- Filtrlar: yo'nalish, hudud, reyting, tajriba, til, narx chegarasi.
- Saralash: reyting / tajriba / narx.
- Kartochkada: ism, "Advokat"/"Yurist" turi, tasdiqlangan belgisi, reyting va
  baholar soni, yillar, **to'liq va qisman g'alabalar soni**, javob vaqti,
  narx ("...so'mdan · paket"). Yangi advokatga "Yangi" belgisi (5 tadan kam baho).
- Narx shaffofligi: narx hudud, staj, reyting va super advokat maqomi bo'yicha
  shakllanadi; oshirilgan bo'lsa **sababi buyurtma oynasida yoziladi**.

**Buyurtma oqimi (majburiy ketma-ketlik):**
1. Xizmat + bosqich + advokat tanlanadi.
2. Advokat **30 daqiqada** tasdiqlaydi yoki rad etadi.
3. Mijoz **10% oldindan to'lov** qiladi.
4. **Faqat shundan keyin** aloqa kanali ochiladi va kontaktlar ko'rinadi.
5. Ish ilova ichida yuritiladi: hujjat, chat, sud sanasi, to'lov.

Ish vaqtidan tashqari (Du–Sha 09:00–19:00 dan tashqari) buyurtma berilsa,
30 daqiqalik taymer ertasi kuni 09:00 dan boshlanishi ilovada aytiladi.

### 5.4. Hujjatlar
- **Konstruktor:** namuna tanlash → maydonlarni bosqichma-bosqich to'ldirish →
  hujjat ko'z oldida shakllanadi → to'lovdan keyin DOCX va PDF yuklab olish.
- Ixtiyoriy **advokat ko'rigi**: ariza navbatchi yurist-advokatlarga tushadi,
  natija ko'pi bilan 60 daqiqada keladi.
- **Hujjat tahlili** (AI yoki advokat): xatolar, xavflar, takliflar.
- Hujjat nomi backenddan kelgan ko'rinishda ko'rsatiladi (backend nomlarni
  o'zi tozalaydi — ilova qayta "chiroyli" qilishi shart emas).
- PDF faqat to'lov tasdiqlangandan keyin paydo bo'ladi.

### 5.5. Tezkor yordam (SOS va Tezkor advokat)
**LexGo SOS** — bitta tugma, navbatchi advokat darhol xabardor qilinadi.
Vaziyat turlari: hibsga olindi, politsiya chaqirdi, sud jarayoni, tintuv,
shoshilinch shartnoma, boshqa. 24/7.

**Tezkor advokat xizmatlari:**
| Xizmat | Yetkazish |
|---|---|
| Video konsultatsiya (30 daq) | Navbatga tushadi, bo'sh navbatchi oladi |
| Express video/audio konsultatsiya | To'g'ridan-to'g'ri navbatchiga, darhol |
| Chat konsultatsiya | Xavfsiz chatda yozishma |
| YTH bo'yicha konsultatsiya | Ixtisoslashgan navbatchi, darhol |
| Ikkinchi fikr — yakka advokat | Hammaga ochiq |
| Ikkinchi fikr — 2–7 advokat guruhi | Faqat ilgari LexGo orqali xizmat olganlarga |

Bo'sh navbatchi bo'lmasa: so'rov navbatga qo'yiladi va shu aytiladi — ilova
"advokat topilmadi" deb yopib qo'ymasligi kerak.

### 5.6. Qo'ng'iroqlar va chat
- **Xavfsiz chat:** matn, fayl, rasm, ovozli xabar. Yozishma saqlanadi.
- **Qo'ng'iroqlar:** LiveKit orqali audio va video, guruh uchrashuvlari,
  ekran ulashish, suhbat davomida chat.
- **Audio → video ko'tarilishi:** audio qo'ng'iroq ichida kimdir kamerani yoqsa,
  qo'ng'iroq avtomatik **video** qo'ng'iroqqa aylanadi. Ilova qo'ng'iroq turini
  o'z holatidan emas, **backenddan kelgan `call_type`** dan o'qishi shart —
  tarix va detal ekranlarida ham. Realtime hodisa: `call.upgraded_to_video`.
- **Adaptiv sifat:** backend har qo'ng'iroq uchun sifat siyosatini beradi
  (start profili, ruxsat etilgan bitreyt, kamera ruxsati). Aloqa yomonlashsa
  avval video tushiriladi, mikrofon **oxirgi** o'chadi — ovoz ustuvor.
- **Uchrashuv muddati:** belgilangan daqiqa, bepul va pullik uzaytirish,
  pauza/davom ettirish — barchasi serverda hisoblanadi.
- **Maxfiylik:** qo'ng'iroq ekranida foydalanuvchi ismi va ish ID'si bilan
  suv belgisi (watermark) chiziladi — kadr sizib chiqsa, kim sizdirganini ko'rsatadi.
  Mobilda skrinshot/ekran yozuvidan himoya ham qo'llanadi.

### 5.7. Obuna va to'lovlar
- **Shaxsiy advokat obunasi:** Standart va Premium; 1 / 6 / 12 oy; 12 oylik −10%,
  bir yo'la to'liq to'lov yana −10%.
- **Sovg'a obunasi (LexGo Gift):** 3 / 6 / 12 oy; QR kod va flayer beriladi;
  muddat sovg'a qabul qilingandan keyin boshlanadi.
- **Oila qamrovi:** Standart — turmush o'rtoq; Premium — ota-ona, turmush o'rtoq,
  qaramog'dagi farzandlar. Qamrab olinadigan a'zolar profilga kiritiladi.
- **To'lov:** ATMOS (avtomatik to'lov, karta ulash), Payme, Click.
  Karta ma'lumotlari ilovada saqlanmaydi.
- **Bo'lib to'lash:** ko'p paketlar 10% avansdan boshlanadi, qolgani bosqichlar bo'yicha.
- To'lovlar tarixi: sana, summa, holat, chek (PDF) va **PAY-XXXXX** ish ID'si.

### 5.8. Boshqa mijoz ekranlari
- **Mening ishlarim** — hujjat ishlari, tezkor ishlar, buyurtmalar, cases,
  shikoyatlar bitta ro'yxatda; har birida keyingi qadam va holat.
- **Mening hujjatlarim** — hujjat arxivi (ishlardan alohida).
- **Profil** — shaxsiy ma'lumot, oila a'zolari, xavfsizlik (2FA, faol
  sessiyalar, qurilmalarni chiqarish), tillar.
- **Referal** — taklif havolasi va bonuslar.
- **Kafolat (Warranty)** — qanday himoyalanganini tushuntirish va murojaat.
- **Akademiya** — yuridik kurslar.
- **Baholar va shikoyatlar** — quyida alohida bo'lim.
- **Bepul yuridik yordam** — vaziyat yozib yuboriladi, yurist bog'lanadi.

---

## 6. Advokat / yurist ilovasi

### 6.1. Dashboard
Bugungi kun bir ekranda: shoshilinch ishlar, bugungi sud majlislari, yaqin
deadline'lar, yangi xabarlar, ko'riladigan hujjatlar, shu oygi daromad.

### 6.2. Case Marketplace
Yo'nalish va hududga mos yangi ishlarning jonli oqimi. Har bir kartochkada
ish tavsifi, bosqichi, kerakli xizmatlar va taklif qilinayotgan summa.
Amallar: **Qabul qilish**, **Ma'lumot so'rash**, rad etish.
Ishni olishdan oldin **Conflict Check** — manfaatlar to'qnashuvi ogohlantirishi.

### 6.3. Case Command Center (Mening ishlarim)
Har bir ish uchun: bosqich, deadline, keyingi harakat, to'lov holati,
hujjatlar, mijoz bilan chat, status tarixi. Ish bosqichini o'zgartirish va
keyingi qadamni yozib qo'yish.

### 6.4. Hujjat so'rovlari va muharrir
Mijozdan kelgan hujjat so'rovlarini olish, tayyorlash yoki tekshirish,
natijani yuborish. Tayyor bo'lgach mijozda **15 daqiqalik baholash oynasi** ochiladi.

### 6.5. Qolgan ekranlar
- **Smart Calendar** — sud majlisi, tergov harakati, apellyatsiya muddati; eslatmalar.
- **Mijozlar bazasi** — ilova orqali kelmagan mijozlarni ham qo'lda qo'shish mumkin.
- **Fayl arxivi** — papkalar, fayllar, kvota; antivirus tekshiruvi holati.
- **AI Legal Assistant** — ishning qisqacha mazmuni, xronologiya, yetishmayotgan
  hujjatlar ro'yxati, qoralama matn.
- **Vazifalar (tasks)** — muddat va ustuvorlik bilan.
- **Profil** — g'alabalar, narx mezonlari, yo'nalishlar, tasdiqlovchi hujjatlar.
- **Targ'ibot (promotion)** — ko'rinuvchanlikni oshirish paketlari. To'lov Telegram
  orqali tasdiqlanadi: so'rov yuborilgach holat "Tasdiqlash kutilmoqda" bo'lib turadi.
- **Obuna/tariflar** — Bepul / Professional / Premium ko'rinuvchanlik tariflari.
- **Referal** — 5+ hamkasb taklif qilinsa komissiya 5% gacha kamayadi.
- **Tashkilot** — advokatlik tashkiloti va uning a'zolari.

### 6.6. Advokat uchun iqtisodiyot
Komissiya — **yakunlangan buyurtmadan 18%**, oldindan hech qanday to'lov yo'q.
O'rtacha to'lov muddati — 48 soat.

---

## 7. Majburiy platforma qoidalari

Bular marketing emas — **mahsulot qoidalari**, ilovada buzilmasligi kerak:

1. **Barcha to'lovlar faqat platforma orqali.** Tashqaridan to'lov qilinsa,
   LexGo kafolat majburiyatini o'z zimmasiga olmaydi — bu ilovada ochiq yoziladi.
2. **To'lovgacha kontaktlar ko'rinmaydi.** Advokat ham, mijoz ham bir-birining
   telefon/emailini ko'rmaydi.
3. **Chatda tashqi kontakt ulashish bloklanadi** — AI aniqlaydi, xabar to'xtatiladi.
4. **Har 5 kunda mijozga yozma yangilanish** — nima qilingani va keyingi qadamlar.
5. **Har bir foydalanuvchiga shaxsiy ID** beriladi.
6. **Kafolat:** advokat javob bermasa yoki ishni tashlab ketsa — almashtiruvchi
   advokat tayinlanadi yoki masala menejerga ko'tariladi.
7. **AI hech qachon advokat o'rnini bosuvchi qilib ko'rsatilmaydi.**

---

## 8. Baholash va shikoyat — 15 daqiqalik oyna

Advokat ishni topshirgandan keyin mijozda **qat'iy 15 daqiqa** ichida:
baho berish, izoh yozish va past baho orqali shikoyat yuborish imkoni bo'ladi.

**Ilova o'zi vaqt hisoblab qaror qilmaydi.** Backend qaytargan `rating` bloki
hal qiladi:

```json
{
  "rating": {
    "available": true,
    "deadline_at": "2026-09-29T15:00:00Z",
    "remaining_seconds": 842,
    "submitted": false,
    "closed_reason": "",
    "value": null
  }
}
```

- Baholash UI ko'rsatiladi **faqat** `available === true && submitted === false` bo'lsa.
- Taymer `remaining_seconds` va `deadline_at` dan chiziladi (qurilma soati ishonchsiz).
- Muddat tugagach: yulduzlar va shikoyat maydoni yo'qoladi, "Baholash muddati
  tugagan" yoziladi, **qayta yuborish tugmasi chiqmaydi**.
- Kech yuborilsa backend `409 rating_window_closed` qaytaradi — bu xato emas,
  oynaning yopilgani: forma yopiladi.
- **1 yoki 2 yulduz** berilsa backend avtomatik `quality_complaint` yaratadi —
  alohida "shikoyat" tugmasi yo'q. Javobda shikoyat obyekti kelsa, mijozga
  "shikoyatingiz qabul qilindi" deb ko'rsatiladi va shikoyat ID'si beriladi.
- 3–5 yulduz — faqat sharh saqlanadi.

---

## 9. Qisqa ommaviy ish ID'lari (work_id)

Foydalanuvchiga **UUID hech qachon ko'rsatilmaydi**. Har bir yozuv qisqa,
prefiksli, base36 ID bilan keladi: `PREFIX-XXXXX`.

| Prefiks | Nima | Prefiks | Nima |
|---|---|---|---|
| `DOC` | Hujjat ishlari | `CMP` | Shikoyat |
| `ADV` | Tezkor advokat, marketplace xizmati, ikkinchi fikr | `LEAD` | Callcenter lead |
| `CALL` | Audio/video qo'ng'iroq, uchrashuv | `CASE` | Yuridik case |
| `CHAT` | Chat konsultatsiya / guruh chat ishi | `ORD` | Buyurtma |
| `PAY` | To'lov | `FILE` / `FLD` | Fayl / papka |
| `SUB` | Tarif/obuna sotib olish | `APR` | Approval / ro'yxat so'rovi |
| `GFT` | Sovg'a obunasi | `REF` | Referal |
| `PROMO` | Targ'ibot so'rovi | | |

**Qoidalar:**
- Ko'rsatishda — `work_id`. Routing va API chaqiriqlarida — avvalgidek `id` (UUID).
- `work_id` kelmasa — **`id.slice(0, 8)` qilinmaydi**. Hech narsa ko'rsatilmaydi
  va bu backendga xabar qilinadi.
- Misollar: `DOC-9M36Z`, `ADV-TI9N4`, `CALL-83JVE`, `PAY-K1OWV`, `LEAD-DX36K`.

---

## 10. Realtime

Ilova ikkita oqimdan foydalanadi:

- **Foydalanuvchi kanali** — `/ws/users/me?token=…`: yangi xabar, kiruvchi
  qo'ng'iroq, buyurtma holati, to'lov, shikoyat, uchrashuv taklifi.
- **Xona kanali** — xavfsiz chat va qo'ng'iroq xonasi hodisalari.

**Muhim hodisalar:** `call.created`, `call.incoming`, `call.participant_*`,
`call.updated`, `call.ended`, `call.paused` / `call.resumed`, `call.extended`,
`call.payment_extension_*`, `call.recording_*`, `call.upgraded_to_video`,
`quality_complaint.created` / `.updated`, `urgent_advokat.*`,
`secure_chat_message`, `meeting_invite`.

Tanimagan hodisa **jimgina tashlab yuborilmasligi** kerak — kamida ekranni
yangilash uchun sabab bo'lishi lozim. Realtime ishlamay qolsa — 15 soniyalik
poll fallback.

**Push-bildirishnomalar:** kiruvchi qo'ng'iroq, yangi xabar, buyurtma tasdiqlandi,
hujjat tayyor, baholash oynasi ochildi, deadline yaqin, to'lov holati.
Kiruvchi qo'ng'iroq uchun tizim darajasidagi qo'ng'iroq ekrani
(CallKit / ConnectionService) ishlatilishi kerak.

---

## 11. Mobil ilovaga xos talablar

- **Oflayn:** ro'yxatlar va ish detallari keshlanadi va oflayn o'qiladi;
  yozish amallari navbatga qo'yiladi. AI javobi va qo'ng'iroq — faqat onlayn.
- **Fayllar:** kamera, galereya, fayl menejeri; skanerlash (ko'p sahifali PDF);
  yuklashda progress va davom ettirish.
- **Xavfsizlik:** biometrik qulf (Face ID / barmoq izi) ilovaga kirishda;
  qo'ng'iroq va hujjat ekranlarida skrinshotdan himoya; token faqat
  Keychain/Keystore'da.
- **Ruxsatlar:** mikrofon va kamera — faqat qo'ng'iroq boshlanishida so'raladi,
  ilova ochilishida emas. Kontaktlar va joylashuv talab qilinmaydi.
- **Tarmoq:** sekin ulanishda ovoz ustuvor; hujjat yuklash uzilib qolsa davom etadi.
- **Tillar:** o'zbek (asosiy), rus, ingliz. Til ilova ichida almashtiriladi.
  Ruscha matn o'zbekchadan ~20–30% uzunroq — matn joylari shunga chidamli bo'lsin.
- **Valyuta va format:** so'm, probel bilan ajratilgan (`3 500 000 so'm`),
  narxlar "...so'mdan" ko'rinishida.
- **Sanalar:** server UTC beradi, ilova mahalliy vaqtga o'giradi.
- **Deep link:** sovg'a havolasi (`/gift/{code}`), referal (`?ref=`),
  bildirishnomadan ishga o'tish, qo'ng'iroqqa qo'shilish.

---

## 12. Backend bilan ishlash asoslari

- Base URL deploydan keladi, ilovada qattiq yozilmaydi.
- Rollar: `client`, `yurist`, `advokat`, `advokat_tashkiloti` (+ ichki rollar).
- Xizmatlar katalogi: `catalog_only=true` sukut bo'yicha — rasmiy katalog qaytadi.
- Xizmat filtrlari: `category_id`, `q`, `executor_type`, `catalog_only`.
- Advokat filtrlari: `region`, `specialization`, `service_id`.
- Xatoliklar: backend `detail.code` beradi (masalan `rating_window_closed`) —
  ilova kodga qarab javob beradi, matnga qarab emas.
- Ro'yxatlar sahifalanadi; ilova backend tartibini o'zgartirmaydi (masalan
  `sort=recommended` da to'langan targ'ibot tartibi saqlanadi).

---

## 13. Ilovaga kirmaydigan narsalar

- Admin / call-center / superadmin panellari (veb-da qoladi).
- Hujjat shablonlarini yaratish va tahrirlash (kontent boshqaruvi).
- Moliyaviy hisobotlar va payout boshqaruvi.
- Marketing landing sahifalarining to'liq nusxasi — ilovada faqat qisqa
  onboarding bo'ladi.

---

## 14. Muvaffaqiyat mezonlari

Mobil ilova quyidagilarni telefondan, kompyuterga murojaat qilmasdan bajara olishi kerak:

1. Muammoni yozib, AI'dan asosli javob olish — 1 daqiqa ichida.
2. Advokat topib, buyurtma berish va 10% to'lash — 5 daqiqa ichida.
3. Hujjatni to'ldirib, to'lab, DOCX/PDF yuklab olish — 5 daqiqa ichida.
4. SOS tugmasi orqali navbatchi advokat bilan bog'lanish — 1 tegishda.
5. Advokat uchun: yangi ishni qabul qilib, mijoz bilan chatni boshlash — 3 tegishda.
