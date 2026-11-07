# LexGo xarita: frontend holati va qolgan ishlar

Sana: 2026-11-07
Backend vazifalari: `LEXGO_MAP_BACKEND_TASKS_2026_11_07.md`
Kontrakt: `LEXGO_YANDEX_MARKETPLACE_MAP_FRONTEND_2026_10_30.md`

## Bu ishda nima o'zgardi

**Sahifa.** Xarita tabida hero va "ikkinchi fikr" bloki yashiriladi, xarita birinchi ekranda ochiladi. Balandligi ekranga moslashadi: `clamp(460px, 100svh - 150px, 1400px)`.

**Panel.**
- Qidiruv va filtr panel ichiga ko'chdi (telefonda xarita ustida).
- "Xarita / Ro'yxat" tugmasi olib tashlandi, panelning o'zi ro'yxat.
- Bitta "Yaqinimda" tugmasi qoldi (avval ikkita edi).
- Rozilik va maxfiylik matni qulf tugmasi ortiga, saralash filtrlar oynasiga ko'chdi.
- Ro'yxat qatori: ism, tur, reyting, masofa. Manba matni va xizmat qatori olib tashlandi.

**Karta.** Takroriy sarlavha va uzun izohlar olib tashlandi. Sharhsiz reyting ko'rsatilmaydi. Profili 404 bo'lgan sotuvchida profil tugmasi chiqmaydi.

**Ranglar.** Bitta asosiy rang, neytral yuzalar, gradient va shisha effekti yo'q. Xarita fonining to'yinganligi pasaytirildi, pin va yo'l ajralib turadi.

**Pinlar.** Oq pin va bosh harflar, tanlangani asosiy rangda. Ofis kvadratroq, faqat viloyati ma'lum sotuvchi shtrixli, ya'ni aniqlik darajasi matnsiz ko'rinadi.

**Animatsiya.**
- Yo'l chizilgan paytdagi cheksiz animatsiyalar 15 tadan 3 taga tushdi, xarita ichida faqat joylashuv nuqtasining pulsi qoladi.
- Harakatlanuvchi puls, 3D qiyalik, radar, "sonar"lar, kirishdagi uchish, raqam aylanishi olib tashlandi.
- Hamma harakat `transform` va `opacity` bilan, 120 / 200 / 320 ms. Telefon paneli balandlik emas, `transform` bilan siljiydi.
- `prefers-reduced-motion` hamma joyda hisobga olingan.

**Yo'l chizish.**
- Yo'l chizilganda xarita xiralashib qolishi tuzatildi (sabab: to'xtamaydigan puls sikli va 3D qiyalik).
- Qayta hisoblashda chiziq yo'qolib qayta chizilmaydi, joyida almashadi.
- Marshrut faqat mijoz yo'ldan chiqqanda qayta so'raladi, har 100 m da emas.
- Transport turi almashtirilsa, yo'l o'zi qayta tuziladi. Eski chiziq bilan yangi tanlov aralashmaydi.
- Marshrut yo'q bo'lsa, shtrixli ingichka chiziq, "aniq yo'l chizilmadi" yozuvi va asosiy tugma "Yandex Xaritada ochish".
- Geolokatsiya rad etilsa va geocoder ishlamasa, boshlang'ich nuqtani xaritada belgilash mumkin, tanlangan sotuvchi yo'qolmaydi va yo'l o'zi tuziladi.
- Navigatsiyada panel yashirinadi, ekran o'chmaydi (Wake Lock). Bildirishnoma yoki boshqa ilovaga o'tish navigatsiyani to'xtatmaydi, faqat pauza qiladi. Sahifa yashirin paytda joylashuv o'qilmaydi.
- Yandex atributsiyasi endi tugma yoki panel ostida qolmaydi.

## Qolgan frontend ishlari

### Backenddan keyin

| # | Ish | Nima kutilyapti |
|---|---|---|
| F1 | Jonli sessiya bilan haqiqiy marshrutni sinash: `navigation`, qayta hisoblash, qadamlar, `transit` | B1, B16 va test sessiyasi |
| F2 | Pin va kartada rasm ko'rsatish | B10 `avatar_url` |
| F3 | Sharhsiz reyting himoyasini (`ratedOf`) soddalashtirish | B6 |
| F4 | Profil 404 himoyasini (`mapSellerGone`) va undagi qo'shimcha so'rovlarni olib tashlash | B5 |
| F5 | `routing_available` va `geocoder_available` bayroqlarini o'qish: xizmat ishlamasa, so'rov yubormasdan darhol to'g'ri holatni ko'rsatish | B3 |
| F6 | `distance_km: null` bo'lganda hudud markazidagi sotuvchini masofasiz ko'rsatish (kod tayyor, jonli tekshirish kerak) | B9 |

### Backendga bog'liq emas

| # | Ish | Izoh |
|---|---|---|
| F7 | Kirishdan keyin xaritaga qaytish | "Kirish" havolasi `/login` ga olib boradi, qaytish manzili uzatilmaydi va tanlangan sotuvchi yo'qoladi |
| F8 | Bitta surishda 2 ta `sellers/map` so'rovi | Ro'yxat (`useAreaSellers`) va xarita alohida so'raydi. Zoom 13 va undan yuqorida bitta javob yetadi |
| F9 | Haqiqiy telefonda sinash | Wake Lock, kompas, iOS va Android geolokatsiyasi faqat emulyatsiyada tekshirildi |
| F10 | Ofis sozlamalari kartasi (`OfficeLocationCard`, `PointPickerMap`) | Bu ishga kirmagan. Xarita komponentlaridan yangi ranglarni oladi, lekin karta o'zi eski uslubda, `PointPickerMap` kirishdagi uchishni saqlab qolgan |
| F11 | Eski rasmlarni o'chirish | `public/map/night-city.webp` va `night-city-sm.webp` endi xarita sahifasida ishlatilmaydi. O'chirishdan oldin boshqa joyda ishlatilmasligini tekshirish kerak |

## Yangi tuzilma haqida eslatma

- Xarita rang va harakat tokenlari: `components/marketplace/map/mapPanel.css` boshida (`--mm-*`).
- Yo'l chizig'i: `ymaps.ts` ichidagi `route()`. Asosiy rang va chegara `SellersYandexMap.tsx` ichidagi `LINE_COLORS` da.
- `data-ai-id` qiymatlari saqlangan. Olib tashlanganlari: `marketplace.map.intro.locate`, `marketplace.map.live`.
- Sinash: `tests/e2e/market-map.spec.ts`. Soxta Yandex (`ymapsStub.ts`) ishlatiladi, haqiqiy xarita ochilmaydi.
