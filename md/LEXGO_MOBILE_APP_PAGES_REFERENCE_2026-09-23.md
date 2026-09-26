# LexGo — Mobil ilova uchun sahifalar/funksiyalar to'liq spetsifikatsiyasi

**Sana:** 2026-09-23
**Manba:** `C:\Users\KamronONE\Desktop\lex-go\law` (Next.js veb-ilova) — real kodga qarab yozilgan, taxmin emas.
**Maqsad:** Mobil ilova jamoasi uchun — veb-ilovada qaysi sahifalar bor, ularda foydalanuvchi nima qila oladi, qanday ma'lumot ko'rsatiladi/yuboriladi. **Bu DIZAYN hujjati emas** — rang, joylashuv, ikonka, animatsiya kabi vizual tafsilotlar atayin tashlab ketilgan. Faqat FUNKSIYA, KONTENT va MA'LUMOT OQIMI tasvirlangan — mobil ilova shu asosida xuddi shu funksiyalarni (o'z platformasiga mos UI bilan) qayta qurishi mumkin.

Har bir bo'lim uchun: sahifa yo'li, kim ko'radi (rol), maqsadi, asosiy funksiyalar ro'yxati, ishlatiladigan ma'lumot/backend chaqiriqlari (`lib/services/backend.ts`dagi funksiya nomlari orqali — aniq URL/parametr darajasida emas, funksional daraja).

## Mundarija

1. [Ommaviy / marketing / kirish sahifalari](#1-ommaviy--marketing--kirish-sahifalari) — 20 sahifa, auth talab qilmaydi
2. [Client (mijoz) paneli](#2-client-mijoz-paneli) — 22 sahifa
3. [Lawyer (yurist) va Advocate (advokat) panellari](#3-lawyer-yurist-va-advocate-advokat-panellari) — 34 sahifa (aksariyati umumiy komponent)
4. [Admin / CRM / Call-center paneli](#4-admin--crm--call-center-paneli) — 26 sahifa
5. [Umumiy platforma qaydlari](#5-umumiy-platforma-qaydlari)

Rollar: **client** (mijoz), **lawyer/yurist**, **advocate/advokat**, **call-center/admin/superadmin** (ichki xodimlar). Har bir rol tizimga kirgach o'z roliga mos portalga (`/portal/{role}`) yo'naltiriladi.

---

# 1. Ommaviy / marketing / kirish sahifalari


## /

**Rol/auditoriya:** mehmon (auth talab qilinmaydi).

**Maqsad:** Bosh (marketing) sahifa — LexGo nima ekanligini tushuntiradi, mijozni ro'yxatdan o'tishga yoki xizmat buyurtma qilishga undaydi.

**Asosiy funksiyalar:**
- Bir nechta statik marketing blok ketma-ketligi: Hero (asosiy taklif), statistika, muammo/yechim tushuntirishi, AI-huquqiy yordam tanishtiruvi, ish bosqichlari, xizmatlar preview, afzalliklar, advokatlar katalogi preview, ijtimoiy isbot (sharhlar/statistika), kafolat (Warranty) tushuntirishi, obuna tariflari preview, FAQ, yakuniy CTA.
- Deyarli barcha bloklar statik matn (next-intl tarjimalaridan) — real-vaqt ma'lumot olmaydi, faqat `LawyersSection` (advokatlar katalogi bloki, pastda alohida tavsiflangan) va `SubscriptionSection` (pastda) real backend ma'lumotini ko'rsatadi.

**Ma'lumot va amallar:** Asosan navigatsiya (boshqa sahifalarga link). Mobil ilova uchun bu sahifa — ilovaning "onboarding/marketing" ekrani, real funksiya emas.

---

## /login

**Rol/auditoriya:** mehmon.

**Maqsad:** Tizimga kirish (barcha rollar uchun bitta forma — client, lawyer, advocate, admin/call-center va h.k.).

**Asosiy funksiyalar:**
- Telefon raqami (+998) va parol bilan kirish.
- 2FA (ikki bosqichli tasdiqlash) qo'llab-quvvatlanadi: SMS, Telegram yoki TOTP (authenticator ilova) usullaridan biri bo'yicha 6 xonali kod so'raladi.
- "Parolni unutdingizmi" havolasi → /reset-password.
- Muvaffaqiyatli kirishdan keyin foydalanuvchi o'z roliga mos portalga yo'naltiriladi: admin-huquqli rollar → `/admin`, qolganlari → `/portal/{role}`.
- Noto'g'ri urinishlar hisoblanadi: 3-marta xato parol/telefondan keyin mahalliy vaqtinchalik bloklash (5→60s, eksponensial), server tomonidan rate-limit (429) bo'lsa uning `retry_after` vaqti kutiladi.
- Tarmoq/serverdagi xatolar farqlanadi: oflayn, server 5xx, SMS/Telegram kanali ishlamayotgani (503) — har biriga alohida xabar.

**Ma'lumot va amallar:** `login(phone, password)` — agar 2FA kerak bo'lsa javobda `twoFactor` obyekti qaytadi (`verificationId`, `method`, `expiresAt`); `completeLogin2fa(verificationId, code, phone)` — kodni tasdiqlaydi va sessiyani ochadi.

**Muhim oqimlar/holatlar:**
1. Telefon + parol → yubor.
2. Agar 2FA yoqilgan bo'lsa: kod kiritish ekrani (SMS/Telegram/TOTP), "kodni qayta yuborish" (60s kuldaun), "Orqaga" (kodni "parklab" qo'yadi — agar hali amal qilsa, qaytib kirganda qayta ishlatiladi).
3. Muvaffaqiyat → portalga yo'naltirish (qisqa "kirildi" animatsiyasi bilan).

---

## /register

**Rol/auditoriya:** mehmon (referral kodi bo'lsa ham qabul qilinadi, `?ref=`).

**Maqsad:** Yangi hisob ochish — mijoz yoki advokat/yurist sifatida.

**Asosiy funksiyalar:** (`RegisterFlow` komponenti — ko'p bosqichli forma, quyidagi ketma-ketlikda, taxminan):
- Rol tanlash (mijoz / advokat-yurist).
- Telefon raqami kiritish → SMS-OTP yuborish.
- OTP kodni tasdiqlash.
- Parol o'rnatish.
- (Advokat/yurist bo'lsa) qo'shimcha profil ma'lumotlari — ixtisoslik, hudud, tajriba va h.k. — keyinroq portal profilida to'ldiriladi.
- Referral kodi URL yoki brauzer xotirasidan avtomatik olinadi va ro'yxatdan o'tish so'roviga qo'shiladi.

**Ma'lumot va amallar:** OTP yuborish/tasdiqlash va hisob yaratish backend chaqiriqlari orqali (login/reset-password formalari bilan bir xil OTP infratuzilmasi — `useOtpTimer`, rate-limit/qayta yuborish mantig'i).

---

## /reset-password

**Rol/auditoriya:** mehmon.

**Maqsad:** Parolni tiklash.

**Asosiy funksiyalar:**
- 3 bosqich: telefon kiritish → SMS orqali kelgan kodni tasdiqlash → yangi parol o'rnatish.
- Xavfsizlik: noma'lum telefon raqami ham "muvaffaqiyatli yuborildi" ko'rinishida javob oladi (hisob mavjudligini oshkor qilmaslik uchun).
- Kodni qayta yuborish (60s kuldaun), rate-limit xatolari alohida ko'rsatiladi.

**Ma'lumot va amallar:** `forgotPassword(phone)` → `{verificationId, expiresAt}`; keyingi bosqichda `resetPassword(...)` (kod + yangi parol) chaqiriladi.

**Muhim oqimlar/holatlar:** `phone` → `code` → `done` (3 bosqich, state nomlari shu).

---

## /services

**Rol/auditoriya:** mehmon.

**Maqsad:** LexGo.AI (sun'iy intellekt) va jonli advokat orqali xizmat olish variantlarini solishtirib ko'rsatuvchi marketing sahifasi.

**Asosiy funksiyalar:**
- Xizmatlar ro'yxati/turlari haqida statik marketing blok ("AI orqali ham, tirik advokat orqali ham — tanlov sizda").
- Ikki variant narx/tezlik solishtiruvi (`ServicesCompare`) — statik jadval.
- Bu sahifa REAL katalogni (portal ichidagi `/portal/client/services`dan farqli) ko'rsatmaydi — faqat tushuntiruvchi/marketing kontent.

---

## /subscription

**Rol/auditoriya:** mehmon (yoki tizimga kirgan client/advokat — tugma ularni o'z portalidagi obuna sahifasiga olib boradi).

**Maqsad:** "Shaxsiy advokat" obuna tariflarini ko'rsatish va sotib olishga undash.

**Asosiy funksiyalar:**
- Ikki asosiy tarif: Standard va Premium, har birida narx, xususiyatlar ro'yxati.
- Muddat tanlash: 1/6/12 oy — muddat uzunroq bo'lsa chegirma (masalan 12 oy uchun oldindan to'lov qo'shimcha chegirma beradi).
- Sovg'a (gift) tarif varianti — boshqa odamga obuna sovg'a qilish.
- Narxlar backenddan (`getSubscriptionPlans()`) olinadi; agar backend javob bermasa, kod ichida qattiq yozilgan zaxira narxlar (`FALLBACK`) ishlatiladi.
- "Sotib olish" tugmasi: tizimga kirmagan bo'lsa `/register`ga, kirgan bo'lsa o'z portalidagi `/portal/{role}/subscription`ga olib boradi (haqiqiy sotib olish o'sha yerda amalga oshadi).
- Qo'shimcha shartlar/tez-tez so'raladigan savollar bloki (`SubscriptionExtras`, statik).

**Ma'lumot va amallar:** `getSubscriptionPlans()` — tarif ro'yxati (nom, oylik/6 oylik/yillik/oldindan to'lov narxlari, xususiyatlar).

---

## /warranty

**Rol/auditoriya:** mehmon.

**Maqsad:** LexGo orqali olingan xizmatlarga kompaniya tomonidan beriladigan sifat kafolati (Warranty) tushuntirilishi.

**Asosiy funksiyalar:** Statik marketing/tushuntirish kontenti — kafolat nima, qanday holatlarda ishlaydi, da'vo jarayoni bosqichlari (`WarrantyProcess`). Real amal/forma yo'q.

---

## /academy

**Rol/auditoriya:** mehmon (yuristlar/advokatlar uchun mo'ljallangan, lekin ochiq sahifa).

**Maqsad:** Amaliyotchi yuristlar uchun professional trening kurslarini reklama qilish.

**Asosiy funksiyalar:** Kurslar haqida statik kontent + "Kursga yozilish" CTA (portal ichida haqiqiy yozilish — `/portal/{role}/academy` sahifasida, pastda tavsiflangan).

---

## /ai

**Rol/auditoriya:** mehmon.

**Maqsad:** LexGo.AI (O'zbekiston qonunchiligiga o'qitilgan huquqiy sun'iy intellekt) haqida tushuntirish/marketing.

**Asosiy funksiyalar:** Statik kontent — AI qanday ma'lumotlar bilan o'qitilgani (milliy qonunchilik, sud amaliyoti, hujjat namunalari), AI imkoniyatlari haqida tafsilotlar (`AiDetails`). Haqiqiy AI-chat bu yerda emas, portal ichida (`/portal/client/ai`).

---

## /app

**Rol/auditoriya:** mehmon.

**Maqsad:** Mobil ilovaning o'zini reklama qiluvchi sahifa — **bu MOBIL ILOVA spetsifikatsiyasi uchun eng muhim manba**, chunki bu yerda rejalashtirilgan mobil ilova imkoniyatlari to'g'ridan-to'g'ri sanab o'tilgan.

**Asosiy funksiyalar (marketing kontenti, lekin mobil ilova doirasini aniq belgilaydi):**
- Kontseptsiya: "Ikki rol, bitta ilova" — foydalanuvchi kirganda tizim uni **client** yoki **advokat/yurist** sifatida aniqlaydi va interfeys shunga mos quriladi.
- **Mijoz roli uchun e'lon qilingan funksiyalar:** xizmat qidirish va buyurtma, "Mening ishlarim va hujjatlar", to'lovlar/obuna/chegirmalar, advokat bilan yozishma.
- **Advokat roli uchun e'lon qilingan funksiyalar:** Dashboard va Case Marketplace, My Cases va hujjat arxivi, kalendar va deadline eslatmalari, moliyaviy holat va to'lovlar.
- Umumiy 6 ta asosiy xususiyat sanaladi: (1) AI javoblari, (2) advokat topish/buyurtma, (3) hujjatlarni to'ldirish/imzolash/DOCX-PDF yuklab olish, (4) ish holatini kuzatish (bosqich/muddat/sud sanasi/to'lov), (5) xavfsiz yozishma (fayl ulashish, video qo'ng'iroq), (6) to'lovlar va obuna boshqaruvi.
- App Store / Google Play yuklab olish tugmalari (hozircha marketing — ilova hali chiqmagan bo'lishi mumkin).
- Alohida blok: "Professional yurist va advokatlarni tayyorlash kursi" — kurslar soni bo'yicha to'lov, guruhga yozilish (Akademiya bilan bog'liq).

---

## /business

**Rol/auditoriya:** mehmon (tadbirkorlar/tashkilotlar).

**Maqsad:** Biznes/korporativ mijozlar uchun yuridik xizmatlar paketi.

**Asosiy funksiyalar:** Statik marketing — autsors yuridik xizmat, huquqiy xavflar auditi, kompaniya ochish, Compliance tizimi, HR hujjatlari, shartnomalar nazorati, korporativ boshqaruv haqida tushuntirish (`BusinessSection`, `B2bSection` — obunalar/paketlar, `DirectionsSection` — kichik xizmatlarni tayyor paketlarga birlashtirish tushunchasi).

---

## /for-lawyers

**Rol/auditoriya:** mehmon (advokat/yurist bo'lishni o'ylayotganlar).

**Maqsad:** Advokatlarni platformaga jalb qilish (ro'yxatdan o'tishga undash).

**Asosiy funksiyalar:** Statik marketing — "yangi mijoz ham, ish yuritish tizimi ham bitta ilovada": kalendar, hujjat arxivi, mijozlar bazasi, deadline eslatmalari kabi ish-yuritish vositalari reklama qilinadi (bular haqiqatda `/portal/lawyer/*` va `/portal/advocate/*`da mavjud, pastda tavsiflangan).

---

## /contact

**Rol/auditoriya:** mehmon.

**Maqsad:** Kompaniya bilan bog'lanish (umumiy murojaat/lid).

**Asosiy funksiyalar:**
- Forma: ism, kontakt (telefon/email), xabar matni.
- Yuborilgach lid sifatida backendga tushadi.
- Ofislar ro'yxati (shahar, manzil, telefon) va bo'limlar ro'yxati (masalan yuridik/moliya/texnik bo'lim, har biri o'z kontaktiga ega) — statik.

**Ma'lumot va amallar:** `createLead({name, phone, note})`.

---

## /faq

**Rol/auditoriya:** mehmon.

**Maqsad:** Tez-tez so'raladigan savollar (statik akkordion, real ma'lumot yo'q).

---

## /legal-aid

**Rol/auditoriya:** mehmon (moddiy holati past yoki bepul yordamga muhtoj shaxslar).

**Maqsad:** Bepul yuridik yordam so'rovi yuborish.

**Asosiy funksiyalar:**
- Forma: ism, telefon, vaziyat tafsilotlari (erkin matn).
- Yuborilgach maxsus "legal aid" so'rovi sifatida qayd etiladi (odatdagi lid'dan farqli tur).

**Ma'lumot va amallar:** `createLegalAidRequest({title, payload: {name, phone, details}})`.

---

## /lawyers

**Rol/auditoriya:** mehmon va tizimga kirgan client — ikkalasi ham ko'radi, lekin buyurtma berish uchun kirish talab qilinadi.

**Maqsad:** Advokatlar/yuristlar katalogi — qidiruv, filtrlash va tanlab buyurtma berish (LexGo'ning eng muhim ommaviy-funksional sahifalaridan biri).

**Asosiy funksiyalar:**
- Qidiruv (ism bo'yicha), yo'nalish (ixtisoslik) filtri, hudud filtri, advokat/yurist turi filtri, minimal reyting, minimal tajriba, til, maksimal narx bo'yicha filtrlar.
- Saralash: reyting bo'yicha (standart) va boshqa mezonlar.
- Har bir karta: ism, tasdiqlangan (verified) belgisi, ixtisoslik, hudud, tajriba yili, reyting, sharhlar soni, yutgan/qisman yutgan ishlar soni, narx, tillar, "Yangi" belgisi (platformada 30 kundan kam va 5tadan kam sharh bo'lsa).
- Ish vaqti (business hours) hisobga olinadi: agar ish vaqtidan tashqari bo'lsa, "javob kelishi mumkin bo'lgan vaqt" ko'rsatiladi.
- "Tanlash" tugmasi: tizimga kirmagan bo'lsa `/login`ga, kirgan bo'lsa shu advokat oldindan tanlangan holda `/portal/client/services?lawyer=...`ga o'tkazadi (xizmat tanlash bosqichiga).
- Demo/sinov: xususiy chat so'rash imkoniyati (`demoPrivateChat`/`getLawyerPrivateChat` — ba'zi holatlarda demo/sinov rejimi).
- To'lov/checkout oqimi bilan integratsiya (`createCheckout`) — ba'zi xizmatlar to'g'ridan-to'g'ri shu sahifadan buyurtma qilinishi mumkin.

**Ma'lumot va amallar:** `listLawyers()` — advokatlar ro'yxati (backend obyekti mahalliy `Lawyer` tipiga moslashtiriladi); `getBusinessHours()`.

---

## /legal va /legal/[slug]

**Rol/auditoriya:** mehmon.

**Maqsad:** Yuridik hujjatlar (foydalanish shartlari, maxfiylik siyosati, ommaviy oferta va h.k.) ro'yxati va har birining to'liq matni.

**Asosiy funksiyalar:**
- `/legal` — barcha rasmiy hujjatlar ro'yxati (nomi, versiyasi).
- `/legal/[slug]` — bitta hujjatning to'liq matni.
- Agar backend hujjat ro'yxatini bera olmasa, statik zaxira (`LegalDocsFallback`) ko'rsatiladi.

**Ma'lumot va amallar:** `ConsentDoc` ro'yxati backenddan (huquqiy kelishuv/consent hujjatlari tizimi orqali) olinadi.

---

## /gift/[code]

**Rol/auditoriya:** mehmon (sovg'a havolasini olgan shaxs) — sovg'ani "olish" (claim) uchun tizimga kirish shart.

**Maqsad:** Kimdir yuborgan obuna sovg'asini qabul qilish sahifasi.

**Asosiy funksiyalar:**
- Sovg'a kodi (`LX-XXXX`) URL orqali keladi.
- Tizimga kirmagan bo'lsa — avval login qilish talab qilinadi.
- "Qabul qilish" tugmasi bosilganda sovg'a claim qilinadi va qabul qiluvchining obunasi shu paytdan boshlanadi.
- Xato holatlari farqlanadi: allaqachon olingan, hali claim qilib bo'lmaydi (to'lanmagan/bekor qilingan/muddati o'tgan), yoki kod topilmadi.

**Ma'lumot va amallar:** `claimGift(code)`.

---

## /chat

**Rol/auditoriya:** mehmon/umumiy (aniq rol talab qilinmasligi mumkin, kontekstga bog'liq).

**Maqsad:** Umumiy chat interfeysi — `ChatPage` komponenti orqali (portal ichidagi chat bilan bir xil mexanizm bo'lishi mumkin, real-vaqt xabar almashish).

---

## Eslatma: route alias'lar (hujjatlashtirish shart emas)

Quyidagilar mustaqil sahifa emas — faqat boshqa yo'lga avtomatik yo'naltiradi (`RouteAlias` komponenti orqali): `/portal` (rol asosida `/portal/{role}`ga), `/portal/admin` → `/admin`, `/portal/advokat` → `/portal/advocate`, `/portal/yurist` → `/portal/lawyer`, `/portal/callcenter` va `/portal/call-center` (ham asosiy, ham `/leads`) → `/admin/call-center`.

---

# 2. Client (mijoz) paneli


Umumiy: barcha sahifalar `/portal/client/*` ostida, kirish shart. Portal qobig'i (nav, header, bildirishnoma qo'ng'irog'i, robot maskot) barcha sahifalarda umumiy.

## /portal/client (dashboard)

**Rol/auditoriya:** client.

**Maqsad:** Mijozning bosh sahifasi — tezkor amallar va joriy ishlar holatiga umumiy nazar.

**Asosiy funksiyalar:**
- "Vaziyatingizni tasvirlab bering" — matn kiritish maydoni, yuborilsa AI-chatga (`/portal/client/ai`) shu savol bilan o'tkazadi.
- 6 ta tezkor amal kartasi: AI bilan tasvirlash, mutaxassis topish, konsultatsiya (matches), AI so'rash, hujjat yuklash (doc-analysis), xizmatlar katalogi.
- KPI qatori: jami arizalar, faol, tugallangan, "keyingi qadam kerak" sonlari — mijozning o'z ishlari ro'yxatidan hisoblanadi (alohida backend chaqiruv emas).
- "Faol so'rovlar" ro'yxati (case holati, keyingi qadam matni bilan) — "Hammasini ko'rish" → /cases.
- Yon panel: referral dasturi progress-bloki, AI-yordamchi kartasi.

**Ma'lumot va amallar:** `listCases()` — mijozning barcha case/order'lari.

---

## /portal/client/ai

**Rol/auditoriya:** client (ro'yxatdan o'tgan) — bir xil komponent mehmon uchun ham `/chat`da ishlaydi.

**Maqsad:** Sun'iy intellekt bilan yuridik savol-javob chati (LexGo.AI asosiy interfeysi).

**Asosiy funksiyalar:**
- Ko'p suhbat (chat tarixi) — yon panel, yangi suhbat ochish.
- Xabar yuborish, AI javobi (manba/havolalar bilan, `sources`), ba'zi javoblarda tayyor shartnoma/hujjat taklifi (`ContractCard`).
- Taklif qilingan savollar (suggestions) — bosh xabar sifatida tez tanlash.
- Oylik bepul savollar chegarasi (ro'yxatdan o'tgan foydalanuvchi uchun) — limitga yetganda obunaga taklif (upgrade CTA).
- Mehmon (login qilmagan) uchun IP asosidagi cheklov.
- URL orqali savol uzatish (`?q=...`) — boshqa sahifalardan (masalan dashboard, intake) kelganda avtomatik yuboriladi.

**Ma'lumot va amallar:** `listChats()`, `createChat()`, `getChatMessages()`, `postMessage()` (`lib/api.ts`); `useLexAi()` orqali AI javob olish.

---

## /portal/client/intake ("Vaziyatni tasvirlab bering" — AI-triage)

**Rol/auditoriya:** client.

**Maqsad:** Mijoz muammosini erkin matn bilan yozadi, AI uni tasniflaydi va mos xizmat/advokatni tavsiya qiladi — bu **eng muhim "AI → real harakat" ko'prigi**.

**Asosiy funksiyalar:**
- Erkin matn kiritish (min. 8 belgidan) → "Tahlil qilish".
- AI javobi: shoshilinchlik darajasi (past/o'rta/yuqori/kritik), kategoriya, tavsiya etilgan ijrochi turi, qisqacha xulosa.
- Agar shoshilinch (urgent/high/critical) bo'lsa — alohida qizil ogohlantiruvchi blok: to'g'ridan-to'g'ri SOS sahifasiga yoki call-center raqamiga qo'ng'iroqqa yo'naltiradi.
- 3 darajali taklif tizimi: (1) aniq xizmat takliflari (narx, muddat, hujjatlar soni bilan — "passport" ko'rinishida ochib ko'rish mumkin) → to'g'ridan-to'g'ri buyurtma; (2) faqat tavsiya etilgan xizmat turi bo'lsa — katalogga link; (3) hech narsa topilmasa.
- Mos advokatlar ro'yxati (4 tagacha, moslik foizi bilan) — "Barcha mosliklarni ko'rish" → /matches.
- Rasmiy manbalar ro'yxati (AI javobi qaysi qonun/hujjatlarga asoslangani) — havola bilan.
- "Foydali bo'ldimi?" fikr-mulohaza tugmalari (ha/yo'q) — "yo'q" javobi moderatsiya navbatiga tushadi.
- Doimiy ko'rinadigan huquqiy ogohlantirish (disclaimer).

**Ma'lumot va amallar:** `classifyProblem(text)`, `getMyMatches()`, `getLegalCorpus()`, `sendAiFeedback(useful, comment, requestId)`.

---

## /portal/client/sos (shoshilinch yordam)

**Rol/auditoriya:** client.

**Maqsad:** Favqulodda holatda (hibsga olish, politsiya, tintuv va h.k.) tezkor advokat bilan bog'lanish.

**Asosiy funksiyalar:**
- 6 ta tayyor kategoriya (hibsga olish, politsiya, sud, tintuv, shartnoma, boshqa) + erkin tavsif matni.
- "Bog'lanish" tugmasi — so'rov yuboriladi, holat: ulanmoqda → ulandi (navbatchi advokat biriktirilgan, chatga o'tish tugmasi) yoki yuborildi (operator qayta qo'ng'iroq qiladi).
- Doim ko'rinadigan "hoziroq qo'ng'iroq qilish" telefon raqami (hotline).
- Yon blok: qanday ishlaydi (3 qadam), nima uchun ishonch (24/7, maxfiy, tez).

**Ma'lumot va amallar:** `createSosRequest({category, description})` → javobda `roomId` bo'lsa xavfsiz chatga yo'naltiradi.

---

## /portal/client/lawyers

Sahifa `LawyersSection` komponentini ishlatadi — bu bosh sahifadagi `/lawyers` bilan **bir xil komponent** (advokatlar katalogi: qidiruv, filtrlar, buyurtma). Farqi — bu yerda foydalanuvchi allaqachon tizimga kirgan, shu sababli to'g'ridan-to'g'ri buyurtma oqimiga o'tadi.

---

## /portal/client/matches

**Rol/auditoriya:** client.

**Maqsad:** AI (yoki intake) tomonidan tavsiya etilgan advokatlar ro'yxati — moslik foizi bilan.

**Asosiy funksiyalar:**
- Har bir karta: moslik foizi (doira grafik), ism, turi (advokat/yurist), reyting, hudud, ixtisoslik, moslik sababi (matn).
- "Ko'rish" — advokat profilini modal oynada ochadi (`LawyerProfileModal`).
- Bo'sh holat: "Vaziyatingizni tasvirlab bering" tugmasi → /intake.

**Ma'lumot va amallar:** `getMyMatches()`.

---

## /portal/client/cases ("Mening ishlarim")

**Rol/auditoriya:** client.

**Maqsad:** Mijozning barcha yuridik ishlari (case) va buyurtmalari (order) ro'yxati, ularning holati va bosqichi — **portalning eng markaziy sahifalaridan biri**.

**Asosiy funksiyalar:**
- Case va order'lar birlashtirilgan ro'yxat (case bog'langan order bilan, yoki case'siz order alohida).
- Har bir qator: turi, holati, bosqich indikatori (progress-bar, 5 bosqichli), keyingi harakat matni, javob berish muddati (agar kutish holatida bo'lsa va ish vaqti hisobga olingan holda — "bugun/ertaga soat X" ko'rinishida).
- "Bosqichlar" (milestones) ochish/yopish — buyurtma bosqichlari tafsiloti.
- "Tarix" ochish/yopish — status o'zgarishlari tarixi.
- Hujjatlar modali: ishga tegishli hujjatlar ro'yxati + yangi hujjat qo'shish (nom bilan).
- "So'rov yuborish" — pul qaytarish (refund) yoki almashtirish (replacement) so'rovi, sabab matni bilan; almashtirish so'rovining holati keyinchalik shu yerda kuzatiladi.

**Ma'lumot va amallar:** `listCases()`, `listOrders()`, `createRefundRequest()`, `createReplacementRequest()`, `getReplacementHistory()`, `listMyReplacementRequests()`, `listCaseDocuments()`, `createCaseDocument()`, `getBusinessHours()`.

---

## /portal/client/messages (xavfsiz yozishmalar ro'yxati)

**Rol/auditoriya:** client.

**Maqsad:** Advokat bilan xavfsiz (shifrlangan) chat xonalari ro'yxati.

**Asosiy funksiyalar:** Har bir xona: holat belgisi, "xavfsizlangan" yorlig'i — bosilganda `/portal/chat/{roomId}`ga o'tadi.

**Ma'lumot va amallar:** `listSecureChats()`.

### /portal/chat/[roomId] (xavfsiz chat xonasi — barcha rollar uchun umumiy)

**Asosiy funksiyalar (bu portalning eng murakkab real-vaqt komponenti):**
- Real-vaqt xabar almashish (WebSocket).
- Matnli xabarlar, yuborilgan/o'qilgan belgilari (✓/✓✓), kutilayotgan/xato holatlar.
- **Audio va video qo'ng'iroq** (LiveKit orqali) — qo'ng'iroq boshlash, kiruvchi qo'ng'iroq banneri, qo'ng'iroq oynasi (`CallRoom`).
- Kontakt ma'lumotlarini avtomatik yashirish (telefon raqami, ijtimoiy tarmoq havolalari — `maskContacts`) — maxsus "ochish" (reveal) tugmasi bilan ko'rsatish mumkin (T&C bo'yicha nazorat).
- Avtomatik o'chirish taymeri (chat tarixi N soatdan keyin o'chadi) — sozlanadigan.
- Chatni butunlay o'chirish imkoniyati.
- Kun bo'yicha guruhlangan xabarlar, vaqt belgilari.

**Ma'lumot va amallar:** `getSecureMessages()`, `sendSecureMessage()`, `secureSocketUrl()` (WS), `startCall()`, `listCalls()`, `setChatAutoDelete()`, `deleteSecureChat()`.

---

## /portal/client/notifications

**Rol/auditoriya:** client (bir xil komponent boshqa rollarda ham ishlatiladi).

**Maqsad:** Barcha bildirishnomalar ro'yxati.

**Asosiy funksiyalar:**
- Kategoriya bo'yicha tab/filtr, o'qilgan/o'qilmagan filtri, qidiruv.
- Har bir bildirishnoma: sarlavha, matn, qaysi yetkazish kanali orqali yuborilgani va holati (push/telegram/email — "yetkazildi"/"kutilmoqda"/"noma'lum").
- "Hammasini o'qilgan deb belgilash", bitta bildirishnomani o'qilgan deb belgilash.
- Bildirishnoma bosilsa tegishli sahifaga (masalan tegishli ishga) o'tkazadi.

**Ma'lumot va amallar:** `listNotificationsRich()`, `getNotificationCategoryCounts()`, `markNotificationRead()`, `markAllNotificationsRead()`.

---

## /portal/client/payments (to'lovlar tarixi)

**Rol/auditoriya:** client.

**Maqsad:** Barcha to'lovlar tarixi va chek yuklab olish.

**Asosiy funksiyalar:**
- Jadval: nima uchun, sana, summa, holat.
- Qidiruv (matn bo'yicha) va sana oralig'i bo'yicha filtr.
- Har bir to'lov uchun PDF chek yuklab olish (agar mavjud bo'lsa).

**Ma'lumot va amallar:** `listPayments()`, `getPaymentReceipt(id)`.

---

## /portal/client/profile

**Rol/auditoriya:** client.

**Maqsad:** Shaxsiy profil va hisob sozlamalari — portalning eng ko'p bo'limli sahifasi.

**Asosiy funksiyalar:**
- Shaxsiy ma'lumotlar (ism, telefon, email, rasm) — tahrirlash modali orqali.
- Identifikatsiya tasdiqlash (`IdentityVerify` — pasport/shaxsni tasdiqlash oqimi) — tasdiqlangan bo'lsa maxsus belgi.
- Ikki bosqichli autentifikatsiya (2FA) boshqaruvi (`TwoFactorCard`).
- Telegram akkauntini bog'lash (`TelegramLinkCard`).
- **Oila a'zolari**: qo'shish (ism, telefon, qarindoshlik), o'chirish, o'z obunasidan foydalanish huquqini ulash/o'chirish (agar faol obuna bo'lsa).
- **To'lov kartalari**: qo'shish (turi, oxirgi 4 raqam, amal muddati), o'chirish.
- Faol obuna haqida qisqa ma'lumot.
- Bildirishnoma sozlamalari (`NotificationPrefsCard`).
- **Faol sessiyalar** (qurilmalar) ro'yxati — har birini bekor qilish (log out) imkoniyati; joriy qurilma bekor qilinsa avtomatik chiqish.
- Hisob faoliyati tarixi (audit log, `AccountAudit`).

**Ma'lumot va amallar:** `getClientProfile()`, `updateClientProfile()`, `listFamilyMembers()`, `addFamilyMember()`, `deleteFamilyMember()`, `setFamilyMemberAccess()`, `listPaymentMethods()`, `addPaymentMethod()`, `deletePaymentMethod()`, `listSessions()`, `revokeSession()`, `getIdentity()`.

---

## /portal/client/referrals ("Do'stni taklif qilish")

**Rol/auditoriya:** client.

**Maqsad:** Referral dasturi — do'stlarni taklif qilib bonus olish.

**Asosiy funksiyalar:**
- Shaxsiy referral kodi va havola, nusxalash, ulashish (native share yoki nusxalash), QR-kod.
- Statistika: taklif qilinganlar soni, qo'shilganlar soni, bonus balansi.
- Chegirma progress-indikatori ("yana N ta taklif qilsangiz X% chegirma ochiladi").
- Taklif qilinganlar ro'yxati (ism/telefon, holati, sana, olingan bonus).

**Ma'lumot va amallar:** `getMyReferral()`.

---

## /portal/client/reviews (sharhlar)

**Rol/auditoriya:** client.

**Maqsad:** Advokatlarga baho/sharh qoldirish.

**Asosiy funksiyalar:**
- "Baholanishi kerak" ro'yxati (tugallangan ishlar, hali baholanmagan) — "Baholash" tugmasi modal oynani ochadi: 1-5 yulduz + izoh matni.
- "Mening sharhlarim" ro'yxati — yuborilgan baholar.

**Ma'lumot va amallar:** `listReviewable()`, `listMyReviews()`, `submitReview({caseId, lawyerUserId, rating, comment})`.

---

## /portal/client/subscription (obuna boshqaruvi — `PlansPanel` umumiy komponent)

**Rol/auditoriya:** client (bir xil komponent advokat/yuristda ham, farqli tariflar bilan).

**Maqsad:** LexGo.AI va "Shaxsiy advokat" tariflarini sotib olish/boshqarish.

**Asosiy funksiyalar:**
- Client uchun ikki toifa tarif: **LexGo.AI** (Free/Lite/Pro — oylik AI savol-javob limiti bilan) va **Shaxsiy advokat** (Standard/Premium).
- Muddat tanlash (1/3/6/12 oy) — uzunroq muddat chegirma beradi (3→−5%, 6→−10%, 12→−15%, oldindan to'lasa yana −5%, jami maksimal −20%).
- Joriy faol obuna holati, avtomatik to'lov (autopay) yoqish/o'chirish.
- To'lov usuli tanlash/qo'shish, checkout (to'lov) oqimiga o'tish.
- To'lovlar tarixi shu yerda ham ko'rinadi.

**Ma'lumot va amallar:** `getSubscriptionPlans()`, `purchasePlan()`, `demoPlanPurchase()`, `listPayments()`, `listPaymentMethods()`, `addPaymentMethod()`, `createCheckout()`.

---

## /portal/client/packages (tayyor paketlar)

**Rol/auditoriya:** client.

**Maqsad:** Bir nechta xizmatni birlashtirgan tayyor paketlarni ko'rish va buyurtma qilish.

**Asosiy funksiyalar:**
- Paketlar kodi bo'yicha guruhlangan, har biri 3 tarif darajasida (BASIC/STANDARD/PREMIUM) ko'rsatiladi.
- Har bir tarif: narx, "alohida sotib olinsa qancha turadi / paketda qancha / qancha tejaladi" solishtiruvi, muddat, kiritilgan/kiritilmagan xizmatlar ro'yxati (qisqa, "Tafsilotlar" bilan to'liq ochiladi).
- Qidiruv (nom/kategoriya/kod bo'yicha).
- "Buyurtma" — paketdagi birinchi xizmatni tanlab, shu xizmat buyurtma oynasini ochadi (paket ID bilan).

**Ma'lumot va amallar:** `getServicePackages()`, `getServices()`.

---

## /portal/client/gifts (obuna sovg'a qilish)

**Rol/auditoriya:** client.

**Maqsad:** Boshqa odamga obuna yoki xizmatni sovg'a qilish.

**Asosiy funksiyalar:**
- Yuborilgan sovg'alar ro'yxati (nomi, qabul qiluvchi, muddat, sana, holati, ulashish havolasi agar hali olinmagan bo'lsa).
- "Sovg'a qilish" — ikki tur: tarif (obuna, muddat tanlash bilan, taxminiy narx ko'rsatiladi) yoki aniq xizmat; qabul qiluvchi haqida ixtiyoriy izoh.
- Yuborilgandan keyin: ulashish havolasi + QR-kod, nusxalash, to'lov sahifasiga o'tish (agar to'lov talab qilinsa).

**Ma'lumot va amallar:** `listGifts()`, `createGift()`, `getSubscriptionPlans()`, `getServices()`. (Qabul qilish tomoni — ommaviy `/gift/[code]` sahifasida, yuqorida tavsiflangan.)

---

## /portal/client/complaints (shikoyatlar)

**Rol/auditoriya:** client.

**Maqsad:** Xizmat sifatiga shikoyat yuborish.

**Asosiy funksiyalar:** Ro'yxat + "Yangi shikoyat": kategoriya (xizmat/advokat/to'lov/sifat/boshqa), mavzu, tavsif. Har bir shikoyat holati bilan ko'rsatiladi.

**Ma'lumot va amallar:** `listComplaints()`, `createComplaint()`.

---

## /portal/client/doc-analysis (hujjatni AI bilan tahlil qilish)

**Rol/auditoriya:** client.

**Maqsad:** Shartnoma/hujjatni yuklab yoki matn sifatida kiritib, AI orqali xavflar tahlilini olish.

**Asosiy funksiyalar:**
- Matn kiritish YOKI fayl yuklash (PDF/DOCX/TXT, 20MB gacha).
- Qo'shimcha xizmatlar (checkbox): OCR, shoshilinch, advokat tomonidan ko'rib chiqish, yozma xulosa — har biri narxni oshiradi.
- Narx taklifi (quote) avval hisoblanadi, keyin "Tahlil qilish" bosiladi.
- Natija: qisqacha xulosa, to'liq AI matni, xavflar ro'yxati (daraja bo'yicha rangli: past/o'rta/yuqori), tavsiyalar.
- Tahlildan keyin "upsell" bloki — advokat tomonidan tekshirishni qo'shish yoki advokatlar ro'yxatiga o'tish taklifi.

**Ma'lumot va amallar:** `quoteDocumentAnalysis()`, `analyzeDocument(text)`, `analyzeDocumentFile(file)`.

---

## /portal/client/academy (kurslar)

**Rol/auditoriya:** client.

**Maqsad:** Yuridik kurslar katalogi (hozircha "tez kunda" — yozilish tugmasi o'chirilgan holatda ko'rsatiladi).

**Asosiy funksiyalar:** Kategoriya bo'yicha filtr, har bir kurs kartasi: daraja, dars soni, davomiyligi, progress (agar boshlangan bo'lsa).

**Ma'lumot va amallar:** `listAcademyCourses()`.

---

## /portal/client/warranty (kafolat)

**Rol/auditoriya:** client.

**Maqsad:** Xizmat sifatiga oid kafolat (warranty) da'vosini yuborish.

**Asosiy funksiyalar:**
- Kafolat shartlari haqida 3 ta asosiy band.
- Forma: ish nomi (ixtiyoriy), sabab (majburiy) → yuborish.
- Yuborilgan da'volar ro'yxati (sabab, sana, holat).
- Yuborilgandan keyin markazlashtirilgan natija oynasi (holat bilan).

**Ma'lumot va amallar:** `listWarrantyClaims()`, `createWarrantyClaim()`.

---

## /portal/client/services va /portal/client/services/document/[serviceId]

Bu ikkita sahifa **xizmatlar katalogi va hujjat to'ldirish** — bu sessiyada eng ko'p ishlangan va eng murakkab qism, shuning uchun alohida, to'liqroq tavsiflanadi.

### /portal/client/services

**Maqsad:** Xizmatlar katalogini ko'rish, qidirish va buyurtma qilish.

**Asosiy funksiyalar:**
- 3 bosqichli navigatsiya: **umumiy kategoriya** (Jinoiy/Ma'muriy/Iqtisodiy/Fuqarolik, backenddan) → **subkategoriya** (backend `subcategory` maydoni bo'yicha guruhlangan, masalan "Oila va aliment", "Mehnat huquqi" — 21 tagacha) → **xizmatlar ro'yxati** (flat list, alifbo tartibida).
- Har bir subkategoriya sahifaga qarab, faqat tanlangan kategoriyaning ma'lumotlari yuklanadi (butun katalog emas — sahifalab, `limit`/`offset` bilan, kerak bo'lsa avtomatik keyingi sahifalar ham yuklanadi).
- Global qidiruv (server-tomon + mahalliy Kirill/Lotin-tolerant qidiruv fallback bilan).
- Har bir xizmat kartasi: nomi, kodi, narxi (yoki "so'rov bo'yicha"), va 3 ta amal: **Yuklab olish** (agar shablon fayli bo'lsa — Free tarifda qulflangan, obunaga yo'naltiradi), **Advokatga yo'llash** (marketplace — advokat tanlash/buyurtma/to'lov oqimini ochadi), **Hujjatni to'ldirish** (agar hujjat shabloniga bog'langan bo'lsa) — quyidagi sahifaga o'tadi.
- Advokat oldindan tanlangan bo'lsa (`?lawyer=`) — katalog shu advokat taqdim etadigan xizmatlarga toraytiriladi.
- Buyurtma oynasi (modal): narx taklifi (backend modifikatorlari bilan — hudud, referral chegirmasi va h.k.), advokat tanlash (reyting/tajriba/narx/moslik bo'yicha saralash), ish vaqti ogohlantirishi, to'lov.

**Ma'lumot va amallar:** `getServiceCategories()`, `getServices({category_id, catalog_only, limit, offset})`, `searchServices()`, `listLawyers()`, `createOrder()`, `getPricingQuote()`, `getMatchingCandidates()`, `getServiceDocumentFields()`, `getServiceTemplateSourceFile()`.

### /portal/client/services/document/[serviceId] (hujjatni to'ldirish — "DocFill")

**Maqsad:** Tanlangan xizmat uchun DOCX shablonini onlayn to'ldirish, ko'rib chiqish va yuklab olish/advokatga yuborish.

**Asosiy funksiyalar:**
- Backend shablon maydonlarini (`fields` — nom, turi: matn/telefon/email/sana/raqam/katta matn, majburiymi) o'qib, dinamik forma quradi.
- To'ldirilayotgan hujjatning **jonli (live) ko'rinishi** — forma yonida yoki tab orqali — real vaqtda joylashtiruvchilar (placeholder) mijoz kiritgan qiymat bilan almashadi.
- Uch usul mavjud bo'lsa (backend `ai_flow`/`lawyer_flow` mavjudligiga qarab): **o'zi to'ldirish** (qo'lda), **AI bilan to'ldirish** (savol-javob orqali AI hujjatni to'ldiradi), **Advokat bilan to'ldirish** (call-center/advokatga so'rov — auto-assign yoki aniq advokat).
- **"Advokatdan yordam"** tugmasi — agar backend `lawyer_flow`ni qo'llab-quvvatlasa, haqiqiy call-center lead yaratadi (hozirgi to'ldirilgan javoblar bilan birga); aks holda advokatlar ro'yxatiga oddiy havola.
- Asl (original) va "clean" (belgilarsiz) shablon fayllarini ko'rish/yuklab olish.
- To'lov: agar xizmat to'lov talab qilsa — to'lov oynasi; ba'zi holatlarda backend to'lovni avtomatik tasdiqlaydi (auto-confirm) — bunda "to'lov kutilmoqda" ekrani o'tkazib yuboriladi.
- Yakuniy tayyor DOCX faylni yuklab olish.

**Ma'lumot va amallar:** `getServiceDocumentFields()`, `getServiceDocumentTemplate()`, `createServiceDocumentRequest()`, `previewDocumentRequest()`, `updateDocumentAnswers()`, `payDocumentRequest()`, `getDocumentRequest()`, `getDocumentUnlockPolicy()`, `requestServiceDocumentLawyer()` (advokat oqimi), AI oqimi uchun alohida savol-javob endpointlari.

---

## Mobil ilova uchun umumiy eslatmalar (client roli)

- Deyarli barcha sahifalar bir xil naqshga amal qiladi: ro'yxat (backenddan) + "yangi qo'shish" modal forma + holat belgilari. Mobilda bu tabiiy ravishda ro'yxat-ekran + pastdan chiquvchi forma (bottom sheet) shakliga o'tkaziladi.
- **Robot maskot** (3D animatsiyali AI yordamchi) — bu web-ga xos vizual element, mobil ilova uchun funksional ahamiyati yo'q (shunchaki AI-chatga tezkor kirish tugmasi vazifasini bajaradi).
- Xavfsiz chat (audio/video qo'ng'iroq bilan) — mobil ilovada bu WebRTC/LiveKit SDK orqali amalga oshirilishi kerak bo'lgan eng murakkab qism.

---

# 3. Lawyer (yurist) va Advocate (advokat) panellari


**Muhim eslatma:** `/portal/lawyer/*` (yurist) va `/portal/advocate/*` (advokat) — **deyarli bir xil komponentlarni** ishlatadi (bir xil fayl, faqat `role` prop farqlanadi). Shu sababli bu ikki portal BIRGALIKDA tavsiflanadi; faqat farqlar alohida ko'rsatiladi. Ikkala rol ham "sotuvchi" (seller) deb ataladi backend darajasida.

**Umumiy sahifalar (bir xil komponent, ikkala rolda ham bor):**

| Yo'l (lawyer / advocate) | Komponent |
|---|---|
| `/page` | `SellerRichDashboard` |
| `/assistant` | `AiAssistant` |
| `/calendar` | `CalendarPanel` |
| `/cases` | `SellerCases` |
| `/clients` | `ClientsPanel` |
| `/document-requests` | `DocumentRequestsInbox` |
| `/files` | `FileManager` |
| `/meetings` | `MeetingLauncher` |
| `/chat` (lawyer) / `/messages` (advocate) | `SecureInbox` |
| `/notifications` | `NotificationsPanel` |
| `/profile` | `SellerProfileEditor` |
| `/promotion` | `PromotionPanel` |
| `/subscription` | `PlansPanel` |
| `/tasks` | `TaskBoard` |
| `/referrals` | Client bilan **bir xil** sahifa (`ClientReferrals` qayta ishlatiladi) |
| `/ai` (faqat lawyer) | `ChatPage` (client AI-chat bilan bir xil) |

**Faqat lawyer'da bor:** `/documents` (tayyor shablon fayllar kutubxonasi, yuklab olish), `/marketplace` (ochiq buyurtmalar — qabul/rad qilish).
**Faqat advocate'da bor:** `/opportunities` (`/marketplace` bilan bir xil, boshqa nom), `/organization` (yuridik tashkilot boshqaruvi).

---

## Dashboard (`/page` — `SellerRichDashboard`)

**Rol/auditoriya:** advokat, yurist (tasdiqlangan/faol sotuvchilar; tasdiqlanmagan/cheklangan hisoblar soddaroq `SellerDashboard`ni ko'radi).

**Maqsad:** Kunlik ish markazi.

**Asosiy funksiyalar:**
- Sarlavha: kunlik salomlashish, bugungi sud/majlislar soni, bugungi vazifalar soni.
- 4 ta statistika kartasi: mijozlar soni, ishlar soni, bugungi uchrashuvlar, ko'rib chiqilishi kerak hujjatlar — har biri tegishli sahifaga link.
- **Profil to'liqligi** doira-indikatori (%) + bosqichma-bosqich checklist (asosiy ma'lumot → shaxs tasdiqlash → hujjatlar → xizmatlar → narxlash).
- Tezkor amallar: yangi mijoz, yangi ish, hujjat yuklash, uchrashuv.
- "Mening vazifalarim" — bugun/kelgusi/bajarilgan tablari, har biri case-lardan hisoblanadi.
- Mini-kalendar (muddatlar bilan).
- So'nggi faoliyat (bildirishnomalar).
- AI-yordamchiga tezkor kirish kartasi.
- **Faqat advokat**: reklama/targ'ibot (boost) va obunani yaxshilash CTA'lari.
- **Faqat yurist**: 2FA, Telegram bog'lash, bildirishnoma sozlamalari kartalari (chunki yuristning navigatsiyasida bular uchun alohida joy yo'q).

**Ma'lumot va amallar:** `useSellerCabinet()` (bitta umumiy "kabinet" ma'lumoti — faol ishlar, bildirishnomalar, xavfsiz chatlar, statistika, ruxsatlar — ko'p komponent shu bitta manbadan foydalanadi).

---

## AI Yordamchi (`/assistant` — `AiAssistant`)

**Rol/auditoriya:** advokat, yurist.

**Maqsad:** Ish materiallari asosida AI yordamida tahlil qilish vositalari to'plami.

**Asosiy funksiyalar:**
- Ish matnini/kontekstini joylashtirish (matn maydoni).
- 8 ta tayyor vosita: xulosalash, xronologiya, solishtirish, ziddiyatlarni topish, yetishmayotgan hujjatlarni aniqlash, muddatlarni chiqarish, savollar generatsiyasi, qoralama (draft) yozish.
- Erkin savol yuborish ham mumkin.
- Shaxsiy ma'lumotlar (PII) AI'ga yuborishdan oldin backend tomonidan maskalanadi (maxfiylik eslatmasi ko'rsatiladi).

**Ma'lumot va amallar:** `askAiAssistant(prompt, context)`.

---

## Kalendar (`/calendar` — `CalendarPanel`)

**Rol/auditoriya:** advokat, yurist.

**Maqsad:** Sud majlislari, muddatlar va uchrashuvlarni boshqarish.

**Asosiy funksiyalar:**
- Oy ko'rinishi (kunlar to'ri, har kun voqealar bilan rangli chip) + ro'yxat ko'rinishi.
- Tanlangan kunning kun tartibi, kelgusi voqealar ro'yxati (8 tagacha).
- Voqea qo'shish: turi (sud majlisi / tergov harakati / uchrashuv / topshirish muddati / shikoyat muddati), sarlavha, sana/vaqt, joylashuv, eslatma vaqti (15/30/60 daqiqa yoki 1 kun oldin).
- **Muddat kalkulyatori** — huquqiy muddat turi bo'yicha (shikoyat/hujjat/da'vo/umumiy) va boshlanish sanasi asosida haqiqiy tugash sanasini hisoblaydi, natijani to'g'ridan-to'g'ri kalendarga voqea sifatida qo'shish mumkin.
- Voqeani `.ics` fayl sifatida yuklab olish (telefon/Outlook kalendariga import qilish uchun).
- Voqeani o'chirish.

**Ma'lumot va amallar:** `listCalendarEvents()`, `createCalendarEvent()`, `deleteCalendarEvent()`, `calculateDeadline()`, `downloadEventIcal()`.

---

## Ishlar (`/cases` — `SellerCases`)

**Rol/auditoriya:** advokat, yurist.

**Maqsad:** Sotuvchining barcha yuridik ishlari ro'yxati va boshqaruvi.

**Asosiy funksiyalar:**
- Har bir ish kartasi: mijoz nomi (asosiy ko'rsatkich), ish turi, bosqich, holat, keyingi harakat, muddat.
- Karta bosilganda **boshqarish oynasi** ochiladi: holatni o'zgartirish (yangi/faol/tergovda/sudda/apellyatsiyada/tugallangan/arxivlangan), bosqich matni, keyingi harakat matni.
- Agar ish buyurtmaga bog'langan bo'lsa — buyurtma holati paneli ham shu yerda.
- Ish uchun AI vositalari (`CaseAiTools` — xuddi shu ishga oid tezkor AI tahlil).

**Ma'lumot va amallar:** `getMyCases()`, `updateCase()`, `getLawyerClients()`.

---

## Mijozlar (`/clients` — `ClientsPanel`)

**Rol/auditoriya:** advokat, yurist.

**Maqsad:** Mijozlar bazasi (platforma orqali kelganlar + qo'lda qo'shilganlar) va **manfaatlar to'qnashuvini tekshirish** (conflict check).

**Asosiy funksiyalar:**
- Mijozlar ro'yxati: ism, telefon, ishlar/buyurtmalar soni, agar to'qnashuv aniqlangan bo'lsa ogohlantirish belgisi.
- Mijoz kartasi bosilganda — batafsil ma'lumot oynasi (`ClientDetailModal`).
- **Yangi mijoz qo'shish** (qo'lda): ism, telefon, PINFL, kompaniya, qarama-qarshi tomon(lar), vakillar, izohlar — qo'shishdan OLDIN avtomatik conflict-check ishga tushadi.
- **Alohida "Tekshirish" oynasi** — istalgan vaqtda telefon/PINFL/qarama-qarshi tomon/vakillar bo'yicha to'qnashuvni tekshirish, mijoz qo'shmasdan.
- Natija: "toza" yoki "potensial to'qnashuv" (sabab va mos kelgan ishlar ro'yxati bilan).

**Ma'lumot va amallar:** `getLawyerClients()`, `createLawyerClient()`, `checkConflict()`.

---

## Hujjat so'rovlari (`/document-requests` — `DocumentRequestsInbox`)

**Rol/auditoriya:** advokat, yurist (call-center orqali biriktirilgan yoki to'g'ridan-to'g'ri tanlangan).

**Maqsad:** Mijozlar "Advokat bilan to'ldirish"ni tanlaganda kelgan hujjat tayyorlash so'rovlarini ko'rish va bajarish.

**Asosiy funksiyalar:**
- Yangi so'rovlar ro'yxati: mijoz ismi/telefoni, xizmat nomi, hujjat nomi, mijoz yozgan ehtiyoj (need) matni, mijoz oldindan to'ldirgan javoblar.
- Original **toza** (belgilarsiz) shablon faylni ochish/yuklab olish — mijozga ko'rsatilgan `{field}` belgili emas.
- Bajarish: backend forma orqali javoblarni to'ldirish YOKI tayyor DOCX faylni yuklash + izoh qoldirish.
- Bajarilgach hujjat holati "tayyor" bo'ladi va mijozga bildirishnoma ketadi.
- Holat filtri: yangi / ko'rib chiqilmoqda / tayyor / rad etilgan.

**Ma'lumot va amallar:** `requestServiceDocumentLawyer` bilan bog'liq backend endpointlari, `POST /document-lawyer-requests/{id}/complete`.

---

## Fayllar (`/files` — `FileManager`)

**Rol/auditoriya:** advokat, yurist (faqat tasdiqlangan sotuvchilar — 403 qaytarilsa maxsus xabar ko'rsatiladi).

**Maqsad:** Shaxsiy ish-fayl ombori (Google Drive uslubida).

**Asosiy funksiyalar:**
- Papka va fayl daraxti, panjara (grid) va ro'yxat (list) ko'rinishlari.
- Fayl yuklash, papka yaratish, nomini o'zgartirish, yulduzcha qo'yish (starred), arxivlash/o'chirish.
- Filtrlar: hammasi / so'nggi / yulduzchali.
- Qidiruv.
- Rasm fayllar uchun tezkor ko'rish (preview).
- **Xotira kvotasi** ko'rsatkichi (ishlatilgan/jami GB).

**Ma'lumot va amallar:** `getWorkspaceTree()`, `createFolder()`, `updateFolder()`, `deleteFolder()`, `uploadWorkspaceFile()`, `updateFile()`, `deleteFile()`, `getWorkspaceFileBlob()`.

---

## Uchrashuvlar (`/meetings` — `MeetingLauncher`)

**Rol/auditoriya:** advokat, yurist.

**Maqsad:** Video/audio uchrashuvlarni rejalashtirish va boshlash.

**Asosiy funksiyalar:**
- Ishtirokchi(lar)ni qidirib taklif qilish (mijoz yoki boshqa foydalanuvchi).
- Uchrashuvni darhol boshlash (audio/video qo'ng'iroq — real vaqtli, `CallRoom` orqali) yoki rejalashtirish (kalendarga).
- "Menga taklif qilingan/men boshlagan" barcha qo'ng'iroqlar tarixi — holat (faol/rejalashtirilgan/tugagan/bekor qilingan), davomiyligi, ishtirokchilar.
- Mini-kalendar ko'rinishi.
- (Faqat superadmin/leads.manage huquqiga ega bo'lsa) istalgan foydalanuvchining istalgan uchrashuvi tafsilotini ko'rish.

**Ma'lumot va amallar:** `createSecureChat()`, `startCall()`, `listAdminCalls()`, `GET /calls/invited`.

---

## Xavfsiz yozishmalar (`/chat` yoki `/messages` — `SecureInbox`)

Client portaldagi bilan bir xil — xavfsiz chat xonalari ro'yxati, `/portal/chat/[roomId]`ga olib boradi (funksiyalari yuqorida, Client bo'limida to'liq tavsiflangan: real-vaqt xabar, audio/video qo'ng'iroq, kontakt-yashirish, avtomatik o'chirish).

---

## Bildirishnomalar (`/notifications` — `NotificationsPanel`)

Client portaldagi bilan bir xil komponent (yuqorida tavsiflangan).

---

## Profil (`/profile` — `SellerProfileEditor`)

**Rol/auditoriya:** advokat, yurist.

**Maqsad:** To'liq professional profil — portalning eng katta sozlash sahifasi.

**Asosiy funksiyalar:**
- Shaxsiy ma'lumotlar (ism, jins, rasm, telefon, email).
- Professional ma'lumotlar: ixtisoslik(lar), hudud, tajriba yili, litsenziya/guvohnoma.
- **Statistika** (faqat advokat uchun ko'rsatiladi): jami ishlar, to'liq yutilgan, qisman yutilgan, muvaffaqiyat foizi.
- **Narxlash**: tavsiya etilgan narx oralig'i (ixtisoslikka qarab), sotuvchi shu oraliqda (70-100%) o'z narxini belgilaydi.
- **Ish vaqti**: ish kunlari, boshlanish/tugash vaqti, ta'til rejimi (vacation — vaqtinchalik "band" holatga o'tish).
- Ish tarixi (oldingi ish joylari — qo'shish/o'chirish).
- Taklif qiladigan xizmatlar ro'yxati.
- **Shaxsni tasdiqlash so'rovi** (verifikatsiya) — tasdiqlangach "verified" belgisi.
- Xavfsizlik: 2FA, Telegram bog'lash, bildirishnoma sozlamalari, hisob faoliyati tarixi (audit).
- **Mijoz ko'radigan profil oldindan ko'rish** (preview) — advokatlar katalogida qanday ko'rinishini tekshirish.

**Ma'lumot va amallar:** `getMyLawyer()`, `upsertMyLawyer()`, `getClientProfile()`, `updateClientProfile()`, `requestVerification()`, `getLawyerServices()`, `getMyAvailability()`, `putMyAvailability()`.

---

## Reklama/Targ'ibot (`/promotion` — `PromotionPanel`)

**Rol/auditoriya:** advokat, yurist.

**Maqsad:** Profilni katalogda yuqoriroq ko'rsatish uchun to'lovli reklama paketlari.

**Asosiy funksiyalar:**
- Joriy faol reklama holati (necha kun qoldi).
- Analitika: ko'rishlar soni, qidiruvda chiqish soni, profilga o'tishlar, kontakt so'rovlari.
- Reklama paketlari (kunlar soni, qamrov, narx bo'yicha) — sotib olish to'lov sahifasiga o'tkazadi.

**Ma'lumot va amallar:** `listAds()`, `getPromotionStatus()`, `getPromotionAnalytics()`, `checkoutPromotion()`.

---

## Obuna (`/subscription` — `PlansPanel`)

Client portaldagi bilan bir xil komponent, lekin advokat/yurist uchun **turli tariflar** ko'rsatiladi (rolga mos tariflar, `planForRole`) + **avtomatik 50% chegirma** LexGo.AI tariflariga (tasdiqlangan sotuvchilar uchun).

---

## Vazifalar (`/tasks` — `TaskBoard`)

**Rol/auditoriya:** advokat, yurist.

**Maqsad:** Shaxsiy ish vazifalarini boshqarish (Kanban-uslubida).

**Asosiy funksiyalar:**
- 4 ustun: bajarilishi kerak / bajarilmoqda / ko'rib chiqilmoqda / bajarilgan.
- Sudrab-tashlash (drag-and-drop) yoki tugmalar orqali vazifani ustundan-ustunga ko'chirish.
- Vazifa yaratish/tahrirlash: sarlavha, muhimlik (yuqori/o'rta/past), muddat, tavsif, tegishli ish, tekshiruv ro'yxati (checklist).
- Muddati o'tgan vazifalar avtomatik birinchi navbatda ko'rsatiladi.
- Qidiruv, "bajarilganlarni yashirish" filtri.

**Ma'lumot va amallar:** `listMyTasks()`, `updateTaskStatus()`, `createTask()`, `updateTask()`, `deleteTask()`.

---

## Faqat Lawyer'da: Hujjat shablonlari (`/documents`)

**Maqsad:** Tayyor huquqiy hujjat shablonlari kutubxonasi (arizalar, shartnoma namunalari va h.k.) — yuklab olish uchun.

**Asosiy funksiyalar:** Ro'yxat (nomi, kategoriyasi, tili) + har biri uchun yuklab olish tugmasi.

**Ma'lumot va amallar:** `getDocumentTemplates()`, `downloadTemplateFile()`.

## Faqat Lawyer'da: Xizmatlarim (`/services`)

**Maqsad:** Sotuvchi qaysi katalog xizmatlarini taklif qilishini va ularning narxini belgilaydi.

**Asosiy funksiyalar:**
- Katalogdan xizmatlarni tanlash (`ServiceSelector` — qidiruv bilan, ko'p tanlov).
- Har bir tanlangan xizmat uchun narx kiritish — backend tomonidan ruxsat etilgan diapazon (tavsiya etilgan narxning 70-100%) bilan cheklangan.
- Narx siyosatiga rozilik (checkbox) — saqlashdan oldin majburiy.
- Yurist advokat-talab qiladigan xizmatlarni tanlay olmaydi (avtomatik yashiriladi).

**Ma'lumot va amallar:** `getServices()`, `getMyServices()`, `putMyServices()`.

## Faqat Lawyer'da (nomi "Marketplace") / Advocate'da (nomi "Opportunities"): Ochiq buyurtmalar

**Maqsad:** Hali hech kim qabul qilmagan mijoz buyurtmalarini ko'rish va qabul/rad qilish.

**Asosiy funksiyalar:**
- Har bir buyurtma: sarlavha, hudud, byudjet, holat, javob berish uchun **qolgan vaqt** (countdown timer — belgilangan muddat ichida javob berilmasa buyurtma boshqa sotuvchiga o'tishi mumkin).
- "Qabul qilish" — darhol biriktiriladi (agar boshqa sotuvchi allaqachon olgan bo'lsa — "band qilingan" xabari).
- "Rad etish" — sabab tanlash (band/mos kelmaydi/boshqa — "boshqa" tanlansa izoh majburiy).

**Ma'lumot va amallar:** `listOpenOrders()`, `acceptOrder()`, `declineOrder()`.

## Faqat Advocate'da: Tashkilot (`/organization`)

**Maqsad:** Yuridik tashkilot (advokatlar byurosi/firma) yaratish va a'zolarni boshqarish.

**Asosiy funksiyalar:**
- Tashkilotlar ro'yxati, yangi tashkilot yaratish.
- Tashkilot a'zolarini ko'rish, yangi a'zo qo'shish (foydalanuvchi tanlash + lavozim nomi).

**Ma'lumot va amallar:** `listOrganizations()`, `createOrganization()`, `listOrgMembers()`, `addOrgMember()`.

---

## Mobil ilova uchun umumiy eslatmalar (advokat/yurist rollari)

- Bu ikki rol shu qadar o'xshashki, mobil ilovada ham **bitta umumiy kod-bazasi** bilan, faqat kichik farqlar (marketplace/opportunities nomi, tashkilot bo'limi) bilan amalga oshirish tavsiya etiladi — bu web-app'ning o'zi ham aynan shu yondashuvni ishlatadi.
- Kalendar + muddat kalkulyatori + fayl menejeri + Kanban vazifalar taxtasi — bularning barchasi "og'ir" UI komponentlar, mobil versiyada soddalashtirish (masalan drag-and-drop o'rniga tugmalar) tavsiya etiladi.
- Manfaatlar to'qnashuvini tekshirish (conflict check) — O'zbekiston advokatura amaliyotiga xos, muhim yuridik-komplayens funksiyasi, tushirib qoldirilmasligi kerak.

---

# 4. Admin / CRM / Call-center paneli


Barcha sahifalar `/admin/*` ostida, huquqlarga qarab cheklangan (superadmin, yoki tegishli `permissions`: `users.manage`, `leads.manage`, `callcenter.access` va h.k.). Bu — kompaniyaning ichki boshqaruv paneli (CRM + call-center konsoli + platforma sozlamalari), mijoz/advokat portallaridan butunlay alohida.

Ko'p sahifada bir xil naqsh takrorlanadi: **ro'yxat + "Qo'shish" modal (AdminForm generik komponenti) + tahrirlash/o'chirish**. Bunday sahifalar uchun faqat NIMA boshqarilishini (obyekt va maydonlari) yozib, mexanikani qayta tasvirlamaymiz.

## /admin (bosh boshqaruv paneli)

**Rol/auditoriya:** admin/superadmin (huquqlarga qarab ba'zi kartalar ko'rinmasligi mumkin)

**Maqsad:** Butun platformaning yagona KPI monitoringi — 12 ta asosiy ko'rsatkich, har biri bosilganda batafsil "drill-down" oynasi ochiladi.

**Asosiy funksiyalar:**
- Hudud va sana oralig'i bo'yicha filtr paneli (global)
- Agar haqiqiy ma'lumot hali yo'q bo'lsa — "demo" rejimi avtomatik yoqiladi (aniq belgi bilan)
- 12 ta KPI kartasi: daromad, MRR, foydalanuvchilar, konversiya, ushlab qolish (%), reyting, SLA, "xavf ostidagi" mijozlar, ishlar, vazifalar, B2B mijozlar, sharhlar — har biri bosilganda: trend grafigi, taqsimot, ro'yxat kabi tafsilotlar ochiladi
- Daromad trendi chizig'i grafigi, sotuv voronkasi (funnel), to'lovlar (to'langan/kutilayotgan), buyurtmalar holat bo'yicha
- Modullar tezkor havolalari: pipeline, to'lovlar, B2B, retention, call-center
- (Faqat demo-rejim uchun) "Demo ma'lumot yaratish" tugmasi

**Ma'lumot va amallar:** `getAdminDashboardFull()`, `getCeoDashboardFull()`, `getRetentionData()`, `getQualityFull()`, `getDashboardDrilldown()`, `seedDemoData()`.

## /admin/ads

**Maqsad:** Reklama/targetingga oid modulli yozuvlarni (masalan promotion paketlari) CRUD qilish.

**Obyekt maydonlari:** sarlavha, tavsif, narx, status.

**Ma'lumot va amallar:** `listAds()`, `createAd()`, `updateAd()`, `deleteAd()`.

## /admin/approvals

**Maqsad:** Ikki bosqichli tasdiqlash talab qiladigan elementlarni (admin + menejer) tasdiqlash.

**Asosiy funksiyalar:** har bir band uchun alohida "Admin tasdiqlash" va "Menejer tasdiqlash" tugmalari, ikkalasi bajarilgach status yangilanadi.

**Ma'lumot va amallar:** `listApprovals()`, `adminApprove()`, `managerApprove()`.

## /admin/audit-trail

**Maqsad:** Butun platformadagi harakatlar jurnali (append-only, hash-zanjirlangan) + xavfsizlik anomaliyalari.

**Asosiy funksiyalar:**
- **Anomaliyalar** paneli (shubhali kirishlar va h.k.) — holat bo'yicha filtr (yangi/ko'rib chiqilgan/hal qilingan)
- Asosiy audit jurnali: sana oralig'i, foydalanuvchi (qidirib tanlash), amal, nishon turi/id bo'yicha filtr
- Har bir yozuv: amal, tafsilot, IP, vaqt, foydalanuvchi/nishon ID'lari
- **Hash-zanjir tekshiruvi**: har bir yozuv oldingi yozuvning hashiga bog'langanligini vizual ko'rsatadi (uzilishlar aniqlanadi, lekin "buzilgan" emas — faqat "bu ro'yxatda tekshirib bo'lmadi" deb belgilanadi)
- CSV formatida eksport qilish

**Ma'lumot va amallar:** `listAuditTrail()`, `exportAuditTrailCsv()`, `listAdminSecurityEvents()`, `searchUsers()`.

## /admin/b2b

**Maqsad:** Korporativ (B2B) mijozlarni va ular bilan shartnoma/hisob-faktura hujjatlarini boshqarish.

**Asosiy funksiyalar:**
- Kompaniyalar ro'yxati: nomi, sohasi, aloqa, oylik to'lov, bosqich (10 bosqichli sotuv voronkasi — kashf etilgan → aloqa → uchrashuv → ... → faol/yo'qotilgan)
- Har bir kompaniya bosqichini select orqali o'zgartirish
- 3 turdagi PDF hujjat generatsiyasi: **hisob-faktura** (QQS 12% avtomatik hisoblanadi), **shartnoma**, **oylik hisobot** (oy tanlab) — har biri PDF sifatida yuklab olinadi

**Ma'lumot va amallar:** `listB2bClients()`, `createB2bClient()`, `updateB2bClient()`, `createB2bInvoice()`, `createB2bContract()`, `getB2bMonthlyReport()`.

## /admin/bootstrap

**Maqsad:** Tizimdagi birinchi superadminni yaratish (maxsus bootstrap-kalit bilan) — bir martalik sozlash sahifasi.

**Ma'lumot va amallar:** `bootstrapSuperadmin(phone, key)`.

## /admin/call-analytics

**Maqsad:** Qo'ng'iroqlar statistikasi (call-center telefoniya).

**Asosiy funksiyalar:** jami/javob berilgan/o'tkazib yuborilgan qo'ng'iroqlar, o'rtacha davomiylik, kunlar bo'yicha grafik, eng faol operatorlar reytingi — har bir ko'rsatkich bosilganda batafsil oyna.

**Ma'lumot va amallar:** `getCallAnalyticsFull()`.

## /admin/call-center ⭐ (call-center operator konsoli)

**Rol/auditoriya:** call-center xodimlari + `users.manage`/`callcenter.access` huquqiga ega boshqalar

**Maqsad:** Call-center operatorlari uchun kunlik ish maydoni — navbat, lidlar taxtasi, mijoz qidiruvi, qo'ng'iroqlar jurnali, bittada.

**Asosiy funksiyalar:**
- **Navbat** (faqat call-center xodimi ko'radi): SLA muddati buzilgan elementlar birinchi, har 60 soniyada avtomatik yangilanadi; "keyingisini biriktirish" (buyurtmalar uchun) yoki bosqichni o'zgartirish (lidlar uchun) tugmalari, SLA vaqti hisoblagichi bilan
- **Lidlar taxtasi (Kanban)**: qidiruv, hudud/bosqich/sana/"mening lidlarim"/ball bo'yicha filtr, har bir kartani select orqali boshqa bosqichga ko'chirish (yo'qotilgan bosqichga o'tkazishda sabab so'raladi), uchrashuv rejalashtirish tugmasi
- **Mijoz qidiruvi**: ism/telefon bo'yicha jonli qidiruv → mijozning to'liq "360°" kartasi (buyurtmalar, ishlar tarixi) ochiladi, shu yerdan qo'ng'iroq jurnaliga yozish mumkin
- **Qo'ng'iroqlar jurnali**: so'nggi qayd etilgan qo'ng'iroqlar ro'yxati

**Ma'lumot va amallar:** `getCallCenterQueue()`, `assignNextSeller()`, `moveCallCenterLead()`, `getCallCenterKanbanX()`, `ccSearchClients()`, `adminUpdateLead()`.

## /admin/ceo

**Maqsad:** Yuqori darajadagi biznes ko'rsatkichlari (CEO dashboard) — moliyaviy va o'sish metrikalari.

**Asosiy funksiyalar:**
- Daromad, MRR, foydalanuvchilar, konversiya — trend grafigi bilan
- Sotuv voronkasi va kanallar taqsimoti (donut diagramma + jadval: manba, lidlar, to'lovlar, daromad, konversiya)
- **Kengaytirilgan KPI tizimi**: MAU/DAU, GMV, ARR, ARPU, take rate, CAC (mijoz/advokat bo'yicha alohida), LTV, LTV/CAC nisbati, qaytarish muddati (payback), NPS (mijoz/advokat), yangi mijozlar/sotuvchilar, to'langan to'lovlar soni
- **Sovg'a (gift) KPI'lari**: sovg'a xaridlari, faollashtirish darajasi, sovg'adan pullik obunaga o'tish darajasi, o'rtacha sovg'a qiymati, qabul qiluvchi konversiyasi, referal darajasi, sovg'a CAC/LTV

**Ma'lumot va amallar:** `getCeoDashboardFull()`.

## /admin/integrations

**Maqsad:** Tashqi integratsiyalar (to'lov provayderlari, SMS, va h.k.) holatini kuzatish + O'zbekiston ma'lumotlar rezidentligi (data residency) holati.

**Asosiy funksiyalar:** kategoriya bo'yicha guruhlangan integratsiyalar ro'yxati, har biri holat rangi (ulangan/degradatsiyalangan/kutilmoqda) bilan; ma'lumotlar O'zbekiston hududida saqlanishini tasdiqlovchi alohida karta.

**Ma'lumot va amallar:** `getIntegrationsOverview()`.

## /admin/leads → yo'naltirish

Endi mustaqil sahifa emas — `/admin/pipeline`ga avtomatik yo'naltiradi (eski havolalar ishlashi uchun saqlangan).

## /admin/legal

**Maqsad:** Yuridik hujjatlar (foydalanuvchi shartnomasi, maxfiylik siyosati va h.k. — jami 10 ta majburiy hujjat) va foydalanuvchilarning ularga rozilik bildirish jurnalini boshqarish.

**Asosiy funksiyalar:**
- **Hujjatlar** tabi: har bir hujjat turi uchun holat (tayyor/vaqtinchalik matn/mavjud emas), versiya raqami, "Ko'rish" va "Yangi versiya nashr qilish" (versiya raqami avtomatik oshadi, "katta"/"kichik" o'zgarish darajasi tanlanadi)
- **Rozilik jurnali** tabi: foydalanuvchi (qidirib tanlash) va hujjat turi bo'yicha filtrlangan jadval — qachon, qaysi versiyaga, qaysi IP'dan rozi bo'lgan

**Ma'lumot va amallar:** `listAdminConsentDocs()`, `saveConsentDoc()`, `listUserConsents()`, `searchUsers()`.

## /admin/legal-aid

**Maqsad:** Bepul yuridik yordam so'rovlarini ko'rish.

**Asosiy funksiyalar:** ro'yxat (ism, telefon — bosilsa qo'ng'iroq qilinadi, tavsif, holat) + batafsil modal (so'rov manbai/hodisasi, kim tomonidan yaratilgani, tushuntirish).

**Ma'lumot va amallar:** `listLegalAid()`, `getLegalAidRequestDetail()`.

## /admin/meetings (umumiy komponent — `MeetingLauncher`)

**Maqsad:** Boshqaruv/menejerlar uchun video uchrashuvlar — lawyer/advocate portallaridagi bilan bir xil komponent, lekin bu yerda istalgan platforma foydalanuvchisi bilan uchrashuv boshlash mumkin va (superadmin/`leads.manage` uchun) BARCHA foydalanuvchilarning uchrashuv tarixini ko'rish imkoniyati bor.

## /admin/notifications

**Maqsad:** Foydalanuvchilarga qo'lda bildirishnoma yuborish (push/telegram/email/SMS).

**Asosiy funksiyalar:**
- 2 rejim: **Individual** (rol bo'yicha filtrlab, ismi/telefoni bo'yicha qidirib, bir nechta foydalanuvchini belgilab tanlash, yoki ID qo'lda kiritish) yoki **Ommaviy** (butun bir rolga — masalan barcha mijozlarga — yuborish, alohida tasdiqlash so'raladi)
- Kategoriya va kanal (push/telegram/email/SMS) tanlash, sarlavha + matn
- Individual rejimda: har bir qabul qiluvchiga PARALEL (bir vaqtda 3 tagacha) alohida so'rov yuboriladi, har birining natijasi (muvaffaqiyatli/xato) alohida ko'rsatiladi, jarayonni to'xtatish mumkin
- Yuborish natijalari: har bir qabul qiluvchi bo'yicha yetkazish holati (push/SMS/email/telegram alohida-alohida)

**Ma'lumot va amallar:** `listAdminUsers()`, `sendAdminNotification()`.

## /admin/payouts

**Maqsad:** Advokat/yuristlarga to'lanadigan ulush (payout) va moliyaviy solishtirish (reconciliation).

**Asosiy funksiyalar:**
- Umumiy statistika: yalpi summa, platforma komissiyasi (18%), provayder komissiyasi (1%), sotuvchi ulushi, to'langan/jami to'lovlar soni
- Har bir to'lov uchun "To'landi deb belgilash" tugmasi

**Ma'lumot va amallar:** `getReconciliation()`, `listAdminPayouts()`, `updatePayout()`.

## /admin/pipeline ⭐ (sotuv/lidlar boshqaruvi — eng katta admin sahifasi)

**Rol/auditoriya:** sotuv/menejment xodimlari

**Maqsad:** Barcha lidlarni (mijoz so'rovlari) sotuv voronkasi bo'yicha boshqarish — to'liq Kanban tizimi.

**Asosiy funksiyalar:**
- Kanban taxtasi: ustunlar (bosqichlar) sudrab-tashlash (drag&drop) bilan ko'chiriladi, har bir ustun uchun karta soni
- Ustunlarni qo'shish/nomini o'zgartirish/rangini tanlash/o'chirish (o'chirishda lidlarni boshqa ustunga qayta tayinlash so'raladi)
- Har bir lid kartasi: sarlavha, ball (hot/warm/cold), hudud, tayinlangan operator
- Lid qo'shish/tahrirlash/o'chirish, batafsil panel (`LeadDrawer`) — bosilganda to'liq tarix va ma'lumot
- "Yo'qotilgan" bosqichga o'tkazishda sabab so'raladi (narx/o'zi hal qildi/raqobatchi/javob bermadi/xizmat yo'q/spam)
- **Avtomatik tayinlash**: tayinlanmagan lidlarni tanlangan strategiya (round-robin va h.k.) bo'yicha operatorlarga ommaviy taqsimlash
- Jadval ko'rinishi (Kanban o'rniga) ham mavjud
- Filtrlar: qidiruv, hudud, bosqich, sana, ball, "mening lidlarim"

**Ma'lumot va amallar:** `getLeadKanbanX()`, `moveLeadKanban()`, `adminCreateLead()`, `adminUpdateLead()`, `adminDeleteLead()`, `saveLeadKanbanColumns()`, `deleteLeadKanbanColumn()`.

## /admin/plans

**Maqsad:** Obuna tariflarini (LexGo.AI, "Shaxsiy advokatim", biznes va h.k.) to'liq boshqarish.

**Asosiy funksiyalar:**
- Auditoriya bo'yicha filtr (mijoz/yurist/advokat)
- Tarif yaratish/tahrirlash: nomi, slug, auditoriya, maqsadli rollar, avtomatik to'lov provayderi, billing turi, tartib raqami, sovg'a qilish muddatlari, narx davri (oylik/6 oylik/yillik) va narxi, tavsif, imtiyozlar ro'yxati, sovg'a qilinadiganmi, faolmi
- Tarifni yashirish/tiklash/asl holatiga qaytarish (overlay tizimi orqali — backendni to'g'ridan-to'g'ri o'zgartirmasdan)

**Ma'lumot va amallar:** `listSubscriptionPlansAdmin()`, `createPlanAdmin()`, `savePlan()`, `removePlan()`, `restorePlan()`, `resetPlan()`.

## /admin/policies

**Maqsad:** Platforma siyosatlarini (buyurtma, to'lov, hujjat tahlili, ish maydoni, xavfsizlik, bildirishnomalar) sozlash + ishlab chiqarishga tayyorlik nazorat ro'yxati.

**Asosiy funksiyalar:**
- "Ishlab chiqarishga tayyorlik" nazorat ro'yxati (har bir band holati: tayyor/ogohlantirish/xato)
- Har bir siyosat bo'limi tahrirlanadi (JSON/forma), versiyalangan, tarixi ko'riladi
- Tasdiqlanmagan sotuvchilarning katalogda ko'rinish rejimi (belgi bilan/yashirin)
- Ish kunlari/bayramlar kalendari sozlamasi (`BusinessCalendarCard`)

**Ma'lumot va amallar:** `getAdminPolicies()`, `putAdminPolicy()`, `getPolicyHistory()`, `getComplianceReadiness()`, `getUnverifiedSellersMode()`, `setUnverifiedSellersMode()`.

## /admin/register-requests

**Maqsad:** Advokat/yurist/tashkilot bo'lish uchun ro'yxatdan o'tish so'rovlarini ko'rib chiqish (tasdiqlash/rad etish).

**Asosiy funksiyalar:**
- Statistika: jami, rol bo'yicha (advokat/yurist/tashkilot), kutilayotgan/tasdiqlangan/rad etilgan
- Rol tabi va sana oralig'i filtri
- Har bir so'rov: "Ko'rish" (to'liq ariza tafsiloti — `RegisterRequestDetail`), "Qabul qilish"/"Rad etish" tugmalari

**Ma'lumot va amallar:** `getSellerRequests()`, `acceptRegisterRequest()`, `rejectRegisterRequest()`.

## /admin/retention

**Maqsad:** Mijozlarni ushlab qolish (retention) tahlili — kim "xavf ostida", kimga qanday taklif berish kerak.

**Asosiy funksiyalar:**
- Xavf ostidagi mijozlar, shu oy ketganlar, ushlab qolish foizi — har biri batafsil oynaga ega
- Xavf ostidagi har bir mijoz uchun: oxirgi to'lov sanasi, sabablari, "Qaytarish" (win-back) tugmasi — retention navbatiga qo'shadi
- Qo'shimcha sotish (upsell) takliflari ro'yxati

**Ma'lumot va amallar:** `getRetentionData()`, `addRetentionQueue()`.

## /admin/reviews

**Maqsad:** Advokat/yuristlarga qoldirilgan mijoz sharhlarini moderatsiya qilish.

**Asosiy funksiyalar:**
- Sotuvchi turi bo'yicha tab (barchasi/advokat/yurist)
- Har bir sharh: yulduzlar, holat, izoh; "Tasdiqlash"/"Rad etish" (faqat kutilayotganlar uchun)
- Batafsil modal: sharh + sotuvchi + mijoz + tegishli ish/buyurtma ma'lumoti

**Ma'lumot va amallar:** `listAdminReviews()`, `moderateReview()`, `getAdminReviewDetail()`.

## /admin/roles

**Maqsad:** Maxsus rollar va ruxsatlarni (permission) boshqarish — RBAC tizimi.

**Asosiy funksiyalar:**
- Yangi rol yaratish: nomi, sarlavhasi, tavsifi, ruxsatlar ro'yxatidan ko'p tanlovli tanlash
- Foydalanuvchiga rolni biriktirish (foydalanuvchi qidirib tanlash + rol tanlash)
- To'liq ruxsatlar matritsasi ko'rinishi

**Ma'lumot va amallar:** `getRoles()`, `getPermissions()`, `createRole()`, `assignRole()`, `getPermissionMatrix()`.

## /admin/services

**Maqsad:** Xizmatlar katalogini va kategoriyalarni to'g'ridan-to'g'ri boshqarish (backend darajasida, mijoz ko'radigan katalogning o'zi).

**Asosiy funksiyalar:**
- Kategoriyalar: yaratish, tahrirlash, yashirish/tiklash (yashirilganlarni ko'rish tugmasi bilan)
- Xizmatlar: kategoriya/faollik holati/qidiruv (server + lokal) bo'yicha filtr, yaratish/tahrirlash (`ServiceEditModal`)/o'chirish/qayta faollashtirish

**Ma'lumot va amallar:** `getServiceCategories({includeHidden:true})`, `createServiceCategory()`, `saveCategory()`, `removeCategory()`, `restoreCategory()`, `listAdminServices()`, `createService()`, `updateService()`, `deleteService()`, `searchServices()`.

## /admin/templates

**Maqsad:** Hujjat shablonlarini (DOCX asosida) boshqarish — jumladan ommaviy import.

**Asosiy funksiyalar:**
- Shablonlar ro'yxati (nomi, kategoriyasi, tili, narxi, faolligi), qidiruv
- Qo'lda yaratish/tahrirlash (sarlavha, slug, kategoriya, til, tavsif, shablon matni, narx, faollik)
- **⭐ DOCX/ZIP import**: bitta DOCX faylni yuklash → backend `{{maydon}}` belgilarini avtomatik chiqarib oladi → maydonlar ro'yxati va matn oldindan ko'rish (preview) ko'rsatiladi → shablon "qoralama" (nofaol) sifatida yaratiladi, tekshirish uchun. ZIP fayl bilan bir nechta shablonni birdan import qilish mumkin.

**Ma'lumot va amallar:** `getAdminDocumentTemplates()`, `getDocumentTemplate()`, `createDocumentTemplate()`, `updateDocumentTemplate()`, `deleteDocumentTemplate()`, `importTemplateDocx()`, `importTemplatesZip()`, `previewTemplate()`.

## /admin/test-otps

**Maqsad:** Test muhitida (staging) yuborilgan SMS-OTP kodlarini ko'rish — productionda ishlamaydi (404 qaytaradi, "faqat staging uchun" deb ko'rsatiladi).

**Ma'lumot va amallar:** `getTestOtps()`.

---

# 5. Umumiy platforma qaydlari

## Rollar va navigatsiya

- Bitta hisob — bitta rol: `client`, `yurist` (lawyer), `advokat` (advocate), `advokat_tashkiloti` (tashkilot), `call_center`, `sales`, `superadmin` va h.k.
- Kirishdan keyin avtomatik yo'naltirish: admin-huquqli rollar → `/admin`, qolganlari → `/portal/{role}`.
- Lawyer va advocate — funksional jihatdan deyarli bir xil ("sotuvchi"/seller); mobil ilovada ham shu ikkisini bitta umumiy kod-bazasi bilan qurish tavsiya etiladi (veb-ilovaning o'zi ham shunday qilingan).

## Umumiy komponentlar (bir nechta rolda takrorlanadi)

Quyidagi funksiyalar bir nechta rol panelida **bir xil ishlaydi** — mobil ilovada ham umumiy modul sifatida qurish mumkin:
- **Xavfsiz chat** (`/portal/chat/[roomId]`) — real-vaqt xabar almashish, audio/video qo'ng'iroq, kontakt-yashirish, avtomatik o'chirish — client/lawyer/advocate barchasida bor.
- **Bildirishnomalar** — bir xil ro'yxat/filtr/o'qilgan-belgilash mantiqi barcha rollarda.
- **Obuna (`PlansPanel`)** — client/lawyer/advocate barchasida, faqat ko'rsatiladigan tariflar farq qiladi.
- **Video uchrashuvlar (`MeetingLauncher`)** — lawyer/advocate/admin barchasida.

## Backend paginatsiyasi haqida eslatma (mobil ilova rejalashtirishda hisobga olinsin)

Backend'ning `GET /services` endpointi sahifalab (pagination) ishlaydi: default/maksimal limit bor (200/500), va kategoriya ko'rsatilmasa ham cheklanadi. Veb-ilovada bu hisobga olingan:
- Xizmatlar katalogi sahifasi (`/portal/client/services`) kategoriya tanlangandan keyin, o'sha kategoriyaning barcha sahifalarini avtomatik yig'ib yuklaydi.
- Xizmatning TO'LIQ ro'yxati kerak bo'lgan 3 ta joy (`/portal/client/gifts` — sovg'a qilinadigan xizmat tanlash, `/portal/client/packages` — paket narxini solishtirish, `/portal/lawyer/services` — yurist o'z xizmatlarini tanlashi) `getAllServices()` yordam-funksiyasi orqali ishlaydi (`lib/services/backend.ts`) — u sahifalarni ichida avtomatik yig'ib, chaqiruvchiga to'liq ro'yxatni qaytaradi.

Mobil ilova ham xuddi shunday: **browsing (ko'rib chiqish) uchun** kategoriya/subkategoriya bo'yicha filtrlab so'rasin (butun katalogni bitta so'rovda olishga tayanmasin), **to'liq ro'yxat chindan kerak bo'lgan joylarda** (tanlov/qidiruv/narx-jadval) esa sahifalarni ichida yig'ib to'liq ma'lumot bilan ishlasin.

## Hujjat generatsiyasi oqimi (eng murakkab biznes-mantiq)

Uch xil "hujjatni to'ldirish" usuli bor, hammasi bitta `/portal/client/services/document/[serviceId]` sahifasida birlashtirilgan:
1. **O'zi to'ldirish** — forma + jonli hujjat ko'rinishi + (kerak bo'lsa) to'lov + yuklab olish.
2. **AI bilan to'ldirish** — AI savol beradi, javoblardan hujjat generatsiya qiladi.
3. **Advokat bilan to'ldirish** — call-center/advokatga "lead" sifatida yuboriladi (`lawyer_user_id` berilmasa — avtomatik biriktiriladi), advokat portalidagi `/document-requests` inboxida ko'rinadi, u yerda bajariladi, mijozga tayyor fayl va bildirishnoma keladi.

Bu — mijoz va advokat/yurist tomonlarini bog'lovchi eng muhim ikki tomonlama oqim, mobil ilovada ikkala tomon ham (client app va lawyer/advocate app, agar alohida bo'lsa) shu oqimni to'liq qo'llab-quvvatlashi kerak.
