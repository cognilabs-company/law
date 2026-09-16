# LexGo — qilingan ishlarni tekshirish yo'riqnomasi

**Sana:** 2026-09-16
**Nima uchun:** bu fayl faqat **allaqachon ishlab chiqilgan** funksiyalarni sanaydi. Har qatorda: qaysi sahifaga kirasiz, qaysi tugmani bosasiz, nima ko'rinishi kerak. Tartib bilan yursangiz, hammasini ~60–90 daqiqada tekshirasiz.

Hali qilinmagan narsalar bu faylda yo'q — ular `LEXGO_GM_QABUL_TEST_NATIJASI_2026-09-16.md` da.

---

## 0. Boshlashdan oldin

1. **Push kerak.** Oxirgi push `93bd31d`. Bu sessiyadagi ishlar (Telegram 2FA ekranlari, AI takliflari va manbalari, hujjat tahlilida fayl yuklash, xizmat pasporti, advokat onboarding'i, E2E sahifasi, rollar bo'yicha cheklovlar, matritsa tuzatishi, pasport va akademiya tuzatishlari) hali deploy qilinmagan. Avval **"push qil"** deb yozing.
2. **Akkauntlar:**

| Rol | Telefon | Kirishda |
|---|---|---|
| Superadmin | +998900000001 | kod so'ralmaydi |
| Admin | +998900000002 | kod so'ralmaydi |
| Call-center lawyer | +998900000003 | Telegram kodi |
| Sales operator | +998900000004 | kod so'ralmaydi |
| Client | +998900000005 | kod yo'q |
| Advokat | +998900000006 | Telegram kodi |
| Yurist | +998900000007 | Telegram kodi (kabinet advokatniki) |

3. **Tavsiya:** ikkita oyna oching — oddiy oynada mijoz, inkognitoda admin. Konsol ochiq tursin (F12 → Console): qizil xato chiqmasligi kerak.
4. Belgilar: ✅ ishlashi kerak · ⚠️ ishlaydi, lekin ma'lum kamchiligi bor.

---

## 1. Ochiq sayt (kirmasdan)

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Bosh sahifa | Pastgacha aylantiring | Bloklar buzilmaydi, gorizontal skroll yo'q | ✅ |
| Yuqori o'ng burchak | "UZ" tugmasi → RU → EN | Butun sahifa tarjima bo'ladi, sahifa o'zgarmaydi | ✅ |
| Yuqori o'ng burchak | Mavzu tugmasi: Yorug' / Qorong'i / Qurilma bo'yicha | Rang sxemasi darhol almashadi, matn o'qiladi | ✅ |
| Advokatlar | Yo'nalish chiplari, "Advokatlar / Yuristlar", hudud, saralash | Ro'yxat filtrga qarab o'zgaradi | ⚠️ narx ko'p advokatda "—" |
| Advokatlar | Ismni qidirish maydoniga yozing | Ro'yxat qisqaradi | ✅ |
| Sun'iy Intellekt chat | Savol yozib yuboring | Javob keladi, ostida ogohlantirish va maxfiylik yozuvi turadi | ⚠️ manba ko'rsatilmaydi |
| Huquqiy hujjatlar (Legal) | Har hujjatning "O'qish" tugmasi | Hujjat matni va versiyasi ochiladi | ✅ |
| Kirish | "Parolni unutdingizmi?" | Telefon so'raladigan "Parolni tiklash" sahifasi ochiladi | ✅ |
| Ro'yxatdan o'tish | Telefon → "Davom etish" → rolni tanlash | Mijoz / Yurist / Advokat kartalari chiqadi | ✅ |
| Ro'yxatdan o'tish → Mijoz | Formani ko'ring | Ism, familiya, otasining ismi, **viloyat**, email, parol va **8 ta alohida rozilik galochkasi** | ✅ |
| Ro'yxatdan o'tish | Majburiy maydonlarni bo'sh qoldirib davom eting | Qizil ogohlantirish chiqadi, o'tkazmaydi | ✅ |
| Havola bilan kirish | Manzilga `?ref=TEST123` qo'shib oching | Kod saqlanadi, ro'yxatdan o'tganda biriktiriladi | ✅ |

---

## 2. Mijoz (Client, +998900000005)

### 2.1 Kirish va xavfsizlik

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Kirish | Telefon + parol | To'g'ridan-to'g'ri mijoz kabinetiga tushadi | ✅ |
| Kirish | Ataylab noto'g'ri parol | "Telefon yoki parol noto'g'ri" xabari, kod ko'rinmaydi | ✅ |
| Profil → Aktiv sessiyalar | Ro'yxatni ko'ring, "Chiqarish" | Qurilmalar ro'yxati, sessiyani yopish ishlaydi | ✅ |
| Profil → Ikki bosqichli himoya | "Authenticator ilova" yoki "Telegram orqali kod" | 2FA yoqish oqimi ochiladi (QR yoki kod) | ✅ |
| Profil → Telegram hisobi | "Telegramni ulash" | Bir martalik havola, bot ochiladi | ⚠️ ulanish sizning Telegram'ingiz bilan tekshiriladi |

### 2.2 Sun'iy intellekt

| Sahifa (menyu) | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Sun'iy Intellekt | "Aliment miqdori qancha?" deb yozing | Javob keladi, ostida ogohlantirish va PII yozuvi | ⚠️ manba yo'q |
| Sun'iy Intellekt | Ketma-ket 6 ta savol bering | 6-savolda "Oylik limit tugadi (5/5) · Tarifni yangilash" | ✅ |
| Sun'iy Intellekt | Chap panel: "Yangi suhbat", eski suhbatni ochish | Suhbatlar tarixi saqlanadi | ✅ |
| Muammo tahlili | "Erim aliment to'lamayapti, sudga bermoqchiman" → "Tahlil qilish" | Yo'nalish, ijrochi, 3 ta xizmat kartasi (Asosiy / Standart / Premium) narx va muddat bilan | ⚠️ taklif savolga har doim ham mos emas |
| Muammo tahlili | Xizmat kartasida "Xizmat pasporti" | Kod, yo'nalish, ijrochi, muddat, narx, hujjatlar ochiladi | ✅ |
| Muammo tahlili | "Buyurtma berish" | Xizmatlar sahifasi shu xizmat ochilgan holda chiqadi | ✅ |
| Muammo tahlili | Pastga tushing: "Rasmiy manbalar" | Lex.uz, Adliya, gov.uz, my.gov.uz havolalari | ⚠️ modda va sana yo'q |
| Muammo tahlili | "Javob foydali bo'ldimi?" → "Foydali" | "Rahmat! Fikringiz qabul qilindi" | ✅ |
| Muammo tahlili | "Meni hozir hibsga olishdi" deb yozing | Natijadan **yuqorida qizil blok**: SOS tugmasi va call-markaz raqami | ✅ |
| Muammo tahlili | Pastda "Mos advokatlar" | 3–4 ta advokat, moslik foizi bilan | ✅ |
| Muammo tahlili | Ish vaqtidan tashqari kiring | "Hozir ish vaqti emas · Du–Sh 09:00–19:00" | ✅ |

### 2.3 Xizmatlar va narx

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Xizmatlar | Yo'nalish kartasini oching | Ichida xizmatlar ro'yxati, "Orqaga" tugmasi | ⚠️ 35 ta yo'nalish, ba'zisi test |
| Xizmatlar | Qidiruvga "aliment" yoki "алимент" | Aliment xizmatlari topiladi | ⚠️ "alment" (xato) topilmaydi |
| Xizmatlar | Xizmatni bosing | Oyna: narx, "Xizmat pasporti", advokat tanlash | ✅ |
| Xizmatlar → oyna | "Xizmat pasporti"ni oching | Kod, yo'nalish, **Ijrochi: Yurist yoki advokat**, **Format: Onlayn**, **muddat: 3 kun**, narx, kerakli hujjatlar | ✅ (bugun tuzatildi) |
| Xizmatlar → oyna | "Advokatni tanlang": Mosligi / Reyting / Tajriba / Narx | Ro'yxat qayta tartiblanadi | ✅ |
| Xizmatlar → oyna | Advokatni tanlang | Narx yoyilmasi: asosiy narx, hudud koeffitsienti, tajriba, super ustamasi, yakuniy narx | ⚠️ hudud doim ×1 |
| Xizmatlar → oyna | Yoyilmani tekshiring | **"Komissiya" qatori bo'lmasligi kerak** | ✅ |

### 2.4 Hujjatlar

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Hujjat namunalari | Ro'yxatni sanang | 10 ta namuna, har birida kategoriya va narx | ✅ |
| Hujjat namunalari | Namunani oching | Ma'lumot formasi va "Davom etish" | ⚠️ maydon nomlari inglizcha |
| Hujjat namunalari | Yuqoridagi "Sizdan so'ralgan hujjatlar" | Advokat so'ragan hujjatlar va "Yuklash" tugmasi | ✅ |
| Hujjat tahlili | Matnni joylang → "Narxni hisoblash" | Narx yoyilmasi chiqadi, AI tahlili obunaga kiradi | ✅ |
| Hujjat tahlili | "Advokat tekshiruvi" galochkasini belgilang, sahifalar sonini 3 → 10 → 20 qiling | Narx 149 000 → 299 000 → 499 000 ga o'zgaradi | ✅ |
| Hujjat tahlili | "Yozma xulosa" galochkasi | Yoyilmaga +99 000 qatori qo'shiladi | ✅ |
| Hujjat tahlili | "Fayl yuklash (PDF, DOCX, TXT)" → fayl tanlang | Fayl nomi va hajmi ko'rinadi, matn maydoni yashiriladi | ✅ |
| Hujjat tahlili | "Tahlil qilish" | Qisqacha, xatarlar (yuqori/o'rta/past), tavsiyalar va "Advokat tomonidan tekshiruv" taklifi | ⚠️ 6 bo'lim emas, 3 bo'lim |
| Hujjat tahlili | 20 MB dan katta yoki .png fayl tanlang | "Faqat PDF, DOCX yoki TXT" / "Fayl 20 MB dan katta" xabari | ✅ |

### 2.5 Ishlar, to'lovlar, kafolat

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Mening ishlarim | So'rovni oching | Holat belgisi va 5 bosqichli progress chizig'i | ✅ |
| Mening ishlarim | "To'lov bosqichlari" | 30% / 40% / 30% bosqichlar, summasi va holati | ⚠️ "To'langan" buyurtmada ham "To'lov kutilmoqda" chiqmoqda |
| To'lovlar | Ro'yxatni ko'ring | Sana, summa, holat ("To'langan", "Kutilmoqda"), turi | ✅ |
| To'lovlar | Chek tugmasini bosing | PDF kvitansiya yuklanadi, ichida tekshirish havolasi (QR) | ✅ |
| Kafolat | "Advokatni almashtirish" formasi: ish nomi + sabab | "So'rov yuborish" ishlaydi, so'rovlar ro'yxati pastda | ✅ |
| Shikoyatlar | "Yangi shikoyat" | Forma ochiladi, mavjud shikoyatlar ro'yxati ko'rinadi | ✅ |
| Baholash va sharhlar | Sahifani oching | "Baholanmagan ishlar" va "Mening sharhlarim" bo'limlari | ⚠️ yakunlangan buyurtma bo'lmagani uchun bo'sh |
| Xabarlar | Sahifani oching | Maxfiy chatlar ro'yxati | ✅ |
| Bildirishnomalar | "Barchasini o'qilgan" | Yozuvlar o'qilgan bo'ladi, sana o'zbekcha formatda | ✅ |

### 2.6 Obuna, sovg'a, referal, SOS

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Obuna | "6 oy" va "1 yil" tugmalari | Narx va chegirma (−5%, −10%) o'zgaradi, jami summa ko'rinadi | ⚠️ GM'da 12 oy uchun −15% |
| Obuna | Pastda "To'lovlar tarixi" | Obuna to'lovlari ro'yxati | ✅ |
| Sovg'alar | "Obuna sovg'a qilish" | Sovg'a oqimi ochiladi, mavjud sovg'alar holati bilan ro'yxatda | ✅ |
| Do'stni taklif qilish | "Nusxa olish" va "Ulashish" | Havola nusxalanadi, QR ko'rinadi, takliflar soni chiqadi | ✅ |
| SOS — Shoshilinch | 6 ta vaziyat tugmasi (hibs, politsiya, sud, tintuv, shartnoma, boshqa) | Tanlanadi, izoh maydoni bor, yuqorida navbatchi raqam | ✅ |
| Akademiya | Kategoriya chiplari | "Qarz undirish", "Biznes" deb chiqadi (kalit emas) | ✅ (bugun tuzatildi) |
| Profil | "Tahrirlash" | Ism, email o'zgaradi | ⚠️ hudud maydoni yo'q |
| Profil → Shaxsni tasdiqlash | "OneID" yoki "MyID" | Demo tasdiqlash oqimi ishlaydi | ✅ |
| Profil → Oila a'zolari | "Oila a'zosini qo'shish" | Forma ochiladi | ⚠️ obunasiz oxirigacha bormaydi |
| Profil → To'lov usullari | "Karta qo'shish" | Forma ochiladi | ⚠️ provayder ulanmagan |
| Profil → Xabarnoma sozlamalari | Push / SMS / Telegram / Email va hodisalar | Belgilash saqlanadi (sahifani yangilab tekshiring) | ✅ |

---

## 3. Advokat (+998900000006) va Yurist (+998900000007)

Bu akkauntlar **tasdiqlanmagan**, shuning uchun ko'p bo'lim qulflangan — bu shundayligicha to'g'ri ishlashi kerak.

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Kirish | Telefon + parol | **Telegram kodi so'raladi**, kod bilan kiradi | ✅ |
| Boshqaruv paneli | Yuqoriga qarang | "Akkaunt admin tasdig'ini kutmoqda" banneri | ✅ |
| Boshqaruv paneli | "Ro'yxatdan o'tishni yakunlang" bloki | 5 qadam: Profil, Identifikatsiya, Hujjatlar, Xizmatlar, Narxlar; progress chizig'i | ⚠️ profil to'ldirilgan bo'lsa ham 0/5 |
| Boshqaruv paneli | "Hujjat yuklash" (3-qadam) | PDF/JPG/PNG yuklanadi, "Hujjat yuklandi" xabari | ✅ |
| Boshqaruv paneli | "Tasdiqlash" (2-qadam) | Identifikatsiya oynasi ochiladi | ✅ |
| Chap menyu | Qulfli bo'limlarni bosing (Imkoniyatlar, Mening ishlarim, Kalendar…) | Ochilmaydi, boshqaruv paneliga qaytaradi | ✅ |
| Manzil qatori | `/uz/portal/advocate/cases` deb yozing | Baribir boshqaruv paneliga qaytaradi | ✅ |
| Profil | "Professional profilim" | To'ldirilganlik foizi, "Tasdiqlash so'rash" | ✅ |
| Profil | "Yo'nalish va statistika" → "O'zgartirish" | Kasbiy yo'nalishlarni tanlash oynasi | ✅ |
| Profil | "Ikki bosqichli himoya" | "Sizning rolingiz uchun 2FA majburiy" yozuvi va yoqish tugmalari | ✅ |
| Obuna | "1 oy / 6 oy / 1 yil" | LexGo.AI Free / Lite / Pro narxlari o'zgaradi | ⚠️ ro'yxatda kirillcha nomlar ham bor |
| Bildirishnomalar | Ro'yxat | Hujjat so'rovlari va sanalar o'zbekcha | ✅ |

---

## 4. Sales operator (+998900000004)

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Kirish | Telefon + parol | To'g'ridan-to'g'ri **Sotuv voronkasi**ga tushadi | ✅ |
| Chap menyu | Ro'yxatni ko'ring | Faqat 6 bo'lim: Sotuv voronkasi, Call-markaz, Uchrashuvlar, Qo'ng'iroq tahlili, Ushlab qolish, Bildirishnomalar | ✅ |
| Manzil qatori | `/uz/admin/roles`, `/uz/admin/audit-trail`, `/uz/admin/bootstrap` | Uchalasi ham ochilmaydi, voronkaga qaytaradi | ✅ (bugun tuzatildi) |
| Yuqori chap | Rol belgisi | "Sotuv operatori" deb yozilgan bo'lishi kerak | ✅ |
| Sotuv voronkasi | "Kanban" / "Jadval" tugmalari | Ko'rinish almashadi | ✅ |
| Sotuv voronkasi | Manba va hudud filtrlari | Lidlar filtrlanadi | ✅ |
| Sotuv voronkasi | Lid kartasini bosing | O'ng panel: bosqichlar, telefon, manba, kategoriya, hudud, ball, sana | ✅ |
| Lid paneli | "Qo'ng'iroqni yozish", izoh qo'shish, eslatma | Yozuv saqlanadi va tarixda ko'rinadi | ✅ |
| Lid paneli | Bosqich tugmalari | Lid bosqichi o'zgaradi (**test lid tanlang**) | ⚠️ yo'qotish sababi so'ralmaydi |
| Call-markaz | "Lidlar doskasi" | Ustunlar va lidlar ko'rinadi | ⚠️ ustun nomlari inglizcha |
| Ushlab qolish | Sahifani oching | "Xavf ostidagi mijozlar" va "Upsell tavsiyalari" | ✅ |

---

## 5. Call-center lawyer (+998900000003)

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Kirish | Telefon + parol | **Telegram kodi** so'raladi | ✅ |
| Yuqori chap | Rol belgisi | "Call-markaz yuristi" | ✅ |
| Chap menyu | Ro'yxat | Sotuv voronkasi, Call-markaz, Uchrashuvlar, Qo'ng'iroq tahlili, Ushlab qolish, **Namunalar**, Bildirishnomalar | ✅ |
| Call-markaz | "Navbat" bloki | Navbatdagi murojaatlar (hozir bo'sh bo'lishi mumkin) | ✅ |
| Call-markaz | "Mijoz qidirish" | Ism yoki telefon bo'yicha mijoz topiladi | ✅ |
| Call-markaz | "So'nggi qo'ng'iroqlar" | Qo'ng'iroqlar tarixi | ✅ |
| Uchrashuvlar | "Ishtirokchilarni tanlang" → "Uchrashuvni boshlash" | Video xona ochiladi | ✅ |
| Manzil qatori | `/uz/admin/audit-trail` yoki `/uz/admin/payouts` | Ochilmaydi | ✅ |

---

## 6. Admin (+998900000002)

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Kirish | Telefon + parol | Admin paneliga tushadi | ⚠️ 2FA kodi so'ralmayapti (tuzatilishi kerak) |
| Birinchi kirish | Rozilik oynasi | 6 ta hujjat alohida galochka bilan | ✅ |
| Chap menyu | Ro'yxat | "Rollar va ruxsatlar" **bo'lmasligi** kerak | ✅ |
| Manzil qatori | `/uz/admin/roles` | Ochilmaydi, admin paneliga qaytaradi | ✅ |
| Qolgan bo'limlar | 6-bo'limdagi Superadmin ro'yxati bo'yicha yuring | Audit jurnali va boshqa bo'limlar ochiladi | ✅ |

---

## 7. Superadmin (+998900000001)

### 7.1 Boshqaruv

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Umumiy | Sahifani oching | Daromad, MRR, foydalanuvchilar, konversiya, SLA, xavf ostida; daromad grafigi, voronka, to'lovlar, lidlar bahosi, buyurtmalar holati | ✅ |
| Umumiy | "7 kun / 30 kun / 90 kun / Hammasi" | Grafik davrga qarab o'zgaradi | ✅ |
| Umumiy | Sahifani tekshiring | Production'da "Demo ma'lumot" tugmasi **bo'lmasligi** kerak | ✅ (bugun tuzatildi) |
| CEO paneli | Bo'limlarni ko'ring | Daromad, voronka, kanallar (attribution), KPI, "Sovg'a dasturi KPI" | ✅ |

### 7.2 Mijozlar va sotuv

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Sotuv voronkasi | "Status qo'shish" | Yangi ustun yaratish formasi (nom + rang) | ✅ |
| Sotuv voronkasi | Ustun nomi yonidagi qalam va savat belgilari | Nomini o'zgartirish va o'chirish (lidlarni ko'chirish so'raladi) | ✅ |
| Sotuv voronkasi | Lidni o'ng/chap strelka bilan surish | Lid bosqichi o'zgaradi | ✅ |
| Call-markaz | Navbat, doska, qidiruv, qo'ng'iroqlar | To'rt blok ham yuklanadi | ✅ |
| Qo'ng'iroq tahlili | Sana filtri | Kunlar bo'yicha statistika va faol operatorlar | ✅ |
| Ushlab qolish | Sahifa | Xavf ostidagi mijozlar, upsell tavsiyalari | ✅ |
| B2B mijozlar | "B2B mijoz qo'shish" | Forma ochiladi | ✅ |

### 7.3 Katalog va buyurtmalar

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Xizmatlar | "Qo'shish" (kategoriya) | Kategoriya formasi | ✅ |
| Xizmatlar | "Qo'shish" (xizmat) | Forma: kategoriya, nomi, slug, tavsif, asosiy narx, yetkazish daqiqasi, "Faol" | ⚠️ pasport maydonlari yo'q |
| Rejalar | "Qo'shish" | Forma: nomi, slug, tavsif, oylik narx, imkoniyatlar, "Sovg'a qilsa bo'ladi", "Faol" | ⚠️ limit va chegirma maydonlari yo'q |
| Namunalar | Qidiruv va qalam belgisi | Namunani tahrirlash ochiladi | ✅ |
| Namunalar | "Qo'shish" | Forma: nomi, slug, kategoriya, til, tavsif, namuna matni | ⚠️ DOCX yuklab bo'lmaydi |
| Reklama | "Qo'shish" | Reklama paketi formasi | ✅ |

### 7.4 Sotuvchilar

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Ro'yxatdan o'tish so'rovlari | Ro'yxat | Kutilayotgan so'rovlar, "Qabul qilish" va "Rad etish" | ✅ |
| Advokatlarni tasdiqlash | Ro'yxat | Yurist va advokatlar, holat belgisi, "Tasdiqlash" | ⚠️ dalil va rad sababi yo'q |
| Sifat nazorati | Sahifa | Belgilangan holatlar va shikoyatlar ro'yxati | ⚠️ amal tugmalari yo'q |
| Sharh moderatsiyasi | Sahifa | Moderatsiya navbati (hozir bo'sh) | ✅ |

### 7.5 To'lov va moliya

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| To'lovlar (payout) | Yuqoridagi blok | Yarashtirish: umumiy summa, komissiya, provayder to'lovi, sotuvchi ulushi | ✅ |
| To'lovlar (payout) | Yozuvlar ro'yxati | Har yozuvda summa, komissiya va "To'langan deb belgilash" | ✅ |
| Tasdiqlashlar | Ro'yxat | "Admin tasdiqlashi" va "Menejer tasdiqlashi" tugmalari (ikki tomonlama tasdiq) | ✅ |

### 7.6 Tizim

| Sahifa | Nima qilasiz | Nima ko'rinishi kerak | |
|---|---|---|---|
| Yuridik yordam | Sahifa | Bepul yordam so'rovlari ro'yxati | ✅ |
| Bildirishnomalar | Foydalanuvchi + kanal + matn → "Yuborish" | Xabar yuboriladi | ⚠️ hodisa shablonlari yo'q |
| Avtomatlashtirish | "Ishga tushirish" | Qoida ishga tushadi, tarixda yozuv paydo bo'ladi | ✅ |
| Integratsiyalar | Sahifa | Payme, Click, SMS, Email, MyID — "Sozlanmagan"; PostgreSQL, Telegram, AI — "Ulangan" | ⚠️ "Test" tugmasi yo'q |
| E2E tayyorlik | "Yangilash" | 6 ssenariy holati, tekshiruv belgilari va route'lar, test ma'lumotlari soni | ✅ (bugun yangilandi) |
| Rollar va ruxsatlar | "Rollar" ro'yxati | 22 ta rol, har birida ruxsatlar soni | ⚠️ GM'da 14 ta rol kutilgan |
| Rollar va ruxsatlar | "Qo'shish" | Yangi rol formasi: nomi, kodi, ruxsatlarni belgilash | ✅ |
| Rollar va ruxsatlar | "Rol biriktirish" | Foydalanuvchi + rol tanlab biriktirish | ✅ |
| Rollar va ruxsatlar | "Ruxsatlar matritsasi" | Ruxsat nomlari va rol ustunlari, belgilar ko'rinadi | ✅ (bugun tuzatildi) |
| Audit jurnali | Filtrlar: foydalanuvchi ID, harakat ("login"), sana → "Qo'llash" | Ro'yxat filtrlanadi | ✅ |
| Audit jurnali | "CSV eksport" | Fayl yuklanadi; eksportning o'zi ham jurnalga yoziladi | ✅ |
| Audit jurnali | O'chirish tugmasini qidiring | **Bo'lmasligi kerak** | ✅ |
| Test OTP | Menyuda qidiring | Production'da menyuda **bo'lmasligi** kerak | ✅ (bugun tuzatildi) |

---

## 8. Telefonda ko'rinish (har rolda 5 daqiqa)

Telefon brauzerida yoki F12 → Ctrl+Shift+M → kenglik 390:

| Sahifa | Nima ko'rinishi kerak | |
|---|---|---|
| Bosh sahifa, Kirish | Gorizontal skroll yo'q, tugmalar bosiladi | ✅ |
| Mijoz: Xizmatlar, Muammo tahlili, Hujjat tahlili, Mening ishlarim, To'lovlar, Obuna | Kartalar ustma-ust tushmaydi, matn chetga chiqmaydi | ✅ |
| Advokat: Boshqaruv paneli, Profil, Obuna | Onboarding qadamlari o'qiladi | ✅ |
| Admin: Umumiy, Sotuv voronkasi, Call-markaz, Audit jurnali | Menyu burger tugmasi bilan ochiladi, jadvallar o'z ichida suriladi | ✅ |

---

## 9. Qisqa yo'l (30 daqiqalik tezkor tekshiruv)

Vaqtingiz kam bo'lsa, shu 12 qadamni bajaring:

1. Mijoz bilan kiring → **Muammo tahlili** → "Erim aliment to'lamayapti…" → 3 ta taklif va manbalar chiqdimi.
2. O'sha sahifada "Foydali" tugmasini bosing.
3. **Muammo tahlili** → "Meni hozir hibsga olishdi" → qizil blok yuqorida chiqdimi.
4. **Xizmatlar** → "aliment" qidiring → xizmatni oching → "Xizmat pasporti" to'g'ri chiqyaptimi ("3 kun", "Yurist yoki advokat").
5. Advokat tanlang → narx yoyilmasida "komissiya" yo'qligini tekshiring.
6. **Hujjat tahlili** → fayl yuklang → sahifa sonini 3 va 20 qilib narx o'zgarishini ko'ring.
7. **To'lovlar** → chekni yuklab oling, PDF ochilyaptimi.
8. **Profil** → Xabarnoma sozlamalarini o'zgartirib, sahifani yangilang — saqlandimi.
9. Advokat bilan kiring → Telegram kodi so'raldimi → onboarding 5 qadam va "Hujjat yuklash" ishlaydimi.
10. Sales operator bilan kiring → `/uz/admin/roles` ni manzilga yozing → qaytardimi.
11. Superadmin bilan kiring → **Rollar va ruxsatlar** → matritsada nomlar to'g'ri chiqyaptimi.
12. Superadmin → **Audit jurnali** → CSV eksport ishladimi; **Umumiy** sahifada "Demo ma'lumot" tugmasi yo'qligini tekshiring.

---

## 10. Topilgan xatoni qanday yozish

Har xato uchun shuni yozing:
1. **Rol va telefon** (masalan: Mijoz, …0005).
2. **Sahifa nomi** (menyudagi nomi bilan).
3. **Nima bosdingiz**.
4. **Nima kutgan edingiz / nima chiqdi**.
5. Iloji bo'lsa skrinshot va F12 → Console'dagi qizil xato matni.

Shu ko'rinishda yuborsangiz, frontend xatosini darhol tuzataman; backendga tegishlisini `LEXGO_BACKEND_ISSUES_2026-09-15.md` ga qo'shaman.
