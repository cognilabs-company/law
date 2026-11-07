# LexGo xarita: backend qilishi kerak bo'lgan ishlar

Sana: 2026-11-07
Kimdan: Frontend
Tegishli sahifa: `/lawyers?mode=nearby` va `/portal/client/lawyers?mode=nearby` ("Advokat va yuristlar" sahifasidagi xarita)
Avvalgi kontrakt: `LEXGO_YANDEX_MARKETPLACE_MAP_FRONTEND_2026_10_30.md`

## Qanday tekshirilgan

Production API (`https://lexgo.api.cognilabs.org`) 2026-11-07 kuni login talab qilmaydigan GET so'rovlar bilan tekshirildi. Yozuv so'rovi yuborilmadi.

Login talab qiladigan endpointlar (`nearby-sellers/search`, `navigation`, `location-consent`, `office-location`, `geocoder/*`) jonli tekshirilmadi, chunki test sessiyasi yo'q. Bu endpointlarga oid gaplar kontrakt va frontend testlaridagi soxta (mock) javoblarga tayanadi. Ular shu hujjatda alohida belgilangan.

## Qisqa xulosa

| # | Muammo | Foydalanuvchi nimani ko'radi | Muhimlik |
|---|---|---|---|
| B1 | Marshrut kaliti ishlamaydi (401) | Yo'l chizilmaydi, faqat to'g'ri chiziq | P0 |
| B2 | Geocoder kaliti ishlamaydi (403) | Manzil bo'yicha qidiruv ishlamaydi | P0 |
| B3 | `map/config` holatni noto'g'ri aytadi | Frontend ishlamaydigan xizmatni bor deb hisoblaydi | P0 |
| B4 | `limit` natijani yo'qotadi, sonlar noto'g'ri | Mutaxassislarning bir qismi xaritada yo'q | P0 |
| B5 | Xaritadagi sotuvchilarning profili 404 | Pin bosilganda profil ochilmaydi | P0 |
| B6 | Baholanmaganlarga `rating: 5.0` | Sharhsiz odam 5 yulduzli ko'rinadi | P1 |
| B7 | Test ma'lumotlari va noto'g'ri hududlar | "Case Stats 8deb2b1e" kabi ismlar | P1 |
| B8 | `service_action` va `category_ids` deyarli bo'sh | Xizmat va narx ko'rinmaydi, jonli filtr ishlamaydi | P1 |
| B9 | Hudud markazidagi sotuvchilar uchun masofa | Masofa va pin ma'nosi noaniq | P1 |
| B10 | `avatar_url` yo'q | Pinda rasm o'rniga bosh harflar | P2 |
| B11 | Marker javobi og'ir | Har surishda ortiqcha trafik | P2 |
| B12 | Xato formati bir xil emas | Frontendga ortiqcha ish | P2 |
| B13 | `/openapi.json` 404 | Kontraktni tekshirib bo'lmaydi | P2 |
| B14 | `provider-health` ochiq va keshsiz | Kvota sarfi xavfi | P2 |
| B15 | `maps_api_key` ortiqcha va kalit cheklovi | Kalitdan begona foydalanish xavfi | P2 |
| B16 | Navigatsiya bo'yicha tasdiq kerak | Frontend taxmin bilan ishlayapti | P1 |

---

## P0: Yo'l chizish ishlashi uchun

### B1. Yandex marshrut kaliti yaroqsiz

`GET /marketplace/map/provider-health` javobi:

```json
{
  "maps":     { "configured": true, "available": true,  "status_code": 200, "reason": null },
  "geocoder": { "configured": true, "available": false, "status_code": 403, "reason": null },
  "routing":  { "configured": true, "available": false, "status_code": 401, "reason": "routing_key_or_subscription_invalid" },
  "checked_at": "2026-11-07T11:43:41.842089Z"
}
```

Yo'l chiziqlari ishlamasligining asosiy sababi shu. Frontend tomondan bunga yechim yo'q: shu kalit bilan brauzerdagi `ymaps.route`, `multiRouter.MultiRoute` va `ymaps.geocode` ham `scriptError` qaytardi.

**Qilish kerak:** Yandex Router API uchun yaroqli kalit yoki obuna o'rnatish.

**Qabul mezoni:**
- `provider-health` javobida `routing.available: true`.
- Faol rozilik bilan `POST /marketplace/sellers/{id}/navigation` javobida `route.available: true`, `geometry` kamida 2 nuqta, `distance_m`, `duration_s`, `steps`.

### B2. Geocoder kaliti yaroqsiz

`geocoder.status_code: 403`. Bu muammo 2026-10-31 hujjatida ham aytilgan edi, hali yopilmagan. Oqibatda mijoz manzil yozib boshlang'ich nuqta tanlay olmaydi, sotuvchi ham ofisni manzil bo'yicha topa olmaydi.

**Qilish kerak:** yaroqli Geocoder kaliti o'rnatish. Qabul mezoni: `geocoder.available: true`, `GET /marketplace/geocoder/search?q=Toshkent` natija qaytaradi.

### B3. `map/config` haqiqiy holatni aytmaydi

`GET /marketplace/map/config` hozir shunday deydi:

```json
{ "geocoder_configured": true, "routing_configured": true, "routing": { "server_route_available": true } }
```

Lekin `provider-health` ikkalasi ham ishlamayotganini ko'rsatadi. Frontend shu bayroqlarga qarab qaror qiladi.

**Qilish kerak:** config'ga haqiqiy holatni qo'shish (masalan `routing_available`, `geocoder_available`, oxirgi health natijasidan), yoki `server_route_available` va `geocoder_configured` qiymatini health'ga bog'lash.

### B4. `limit` filtrdan oldin qo'llanadi va sonlar noto'g'ri

`GET /marketplace/sellers/map?bbox=55.9,37.1,73.2,45.7&zoom=13&verified_only=true` uchun:

| `limit` | `items` | `total_in_bbox` | `truncated` |
|---|---|---|---|
| 1 | 0 | 0 | false |
| 2 | 1 | 1 | false |
| 5 | 3 | 3 | false |
| 10 | 4 | 4 | false |
| 20 | 8 | 8 | false |
| 50 | 13 | 13 | false |
| 300 (standart) | 13 | 13 | false |
| 500 | 13 | 13 | false |

Filtr bilan esa ko'proq chiqadi:

| So'rov | `items` |
|---|---|
| `seller_type=advokat&verified_only=true` | 14 |
| `seller_type=yurist&verified_only=true` | 8 |
| Filtrsiz, `verified_only=true` | **13** (22 bo'lishi kerak) |
| `verified_only=false` | **12** (`true` dan kam bo'lishi mumkin emas) |

Natijalar shuni ko'rsatadi: `limit` filtrlardan oldin qo'llanayotganga o'xshaydi, ichki nomzodlar soni ham cheklangan. Oqibatlari:
- Filtrsiz xaritada 9 ta tasdiqlangan mutaxassis yo'qoladi.
- Ular orasida xizmati va sharhi bor yagona sotuvchi `Demo Advokat 1` ham bor.
- `truncated: false` va `total_in_bbox` buni yashiradi.
- `verified_only=false` tanlansa, mutaxassislar ko'payish o'rniga kamayadi.

**Qilish kerak:**
1. Avval barcha filtrlar (`bbox`, `verified_only`, `seller_type`, reyting, xizmat), keyin `limit`.
2. `total_in_bbox` haqiqiy jami son bo'lsin.
3. Natija qirqilsa, `truncated: true`.

**Qabul mezoni:** `verified_only=false` natijasi `verified_only=true` natijasini to'liq o'z ichiga oladi; `advokat + yurist + advokat_tashkiloti` soni filtrsiz songa teng; `limit=1` bo'lganda 1 ta element va `truncated: true`.

### B5. Xaritadagi sotuvchilarning ommaviy profili yo'q

- Xaritada 23 ta noyob sotuvchi topildi (barcha filtrlar birlashmasi).
- `GET /marketplace/lawyers?limit=100` faqat 2 ta sotuvchi qaytaradi, ulardan 1 tasi xaritada bor.
- Demak xaritadagi 23 tadan 22 tasi katalogda yo'q.
- Tekshirilgan ikkita pinning `profile_url` manzili `404 {"detail":"Mutaxassis topilmadi"}` qaytardi (`38b8938d-...`, `9844bd19-...`).
- Config esa `seller_visibility.public_profiles_require_active_service: true` deydi.
- Teskari holat ham bor: katalogdagi `LexGo OutSource Advokat` xaritada umuman chiqmaydi.

**Qilish kerak:** xarita va katalog uchun bitta qoida. Xaritada faqat ommaviy profili ochiladigan sotuvchilar chiqsin.

**Qabul mezoni:** `sellers/map` qaytargan har bir `seller_user_id` uchun `GET /marketplace/lawyers/{id}` 200 qaytaradi.

Frontend vaqtinchalik himoya qo'ydi: profil 404 bo'lsa, kartada profil tugmasi o'rniga "ommaviy profili hali ochilmagan" yozuvi chiqadi.

---

## P1: Ma'lumot to'g'riligi

### B6. Sharhi yo'q sotuvchiga `rating: 5.0`

Xaritadagi 23 sotuvchidan 22 tasida `rating: 5.0, reviews_count: 0`. `minimum_rating=4.5` filtri ham ularni o'tkazib yuboradi. Katalogda esa `rating_status` maydoni bor.

**Qilish kerak:** `reviews_count = 0` bo'lsa `rating: null`, xaritaga ham `rating_status` qo'shish, `minimum_rating` filtri baholanmaganlarni o'tkazmasligi.

Frontend hozirdan sharhsiz reytingni ko'rsatmaydi.

### B7. Productionda test ma'lumotlari va noto'g'ri hududlar

Xaritadagi ismlar: `Case Stats 8deb2b1e`, `Matching Stats 83c2acba`, `Acceptance UI yurist`, `Demo Advokat 1..5`, `Iqtisodiy Advokat 81ebba64`, `Fuqarolik Yurist 99db3269` va boshqalar.

Hudud bilan koordinata mos emas:

| Sotuvchi | `region` | Koordinata |
|---|---|---|
| Demo Advokat 1 | `samarkand` | 41.312, 69.280 (Toshkent) |
| Demo Advokat 2 | `bukhara` | 41.285, 69.203 (Toshkent) |
| Demo Advokat 3 | `andijan` | 41.366, 69.289 (Toshkent) |
| Demo Advokat 4 | `fergana` | 41.227, 69.221 (Toshkent) |

`region` qiymati ham bir xil emas: `Toshkent`, `tashkent`, `bukhara`.

**Qilish kerak:** test yozuvlarini ommaviy javobdan chiqarish, `region` uchun bitta slug formatini ishlatish.

### B8. `service_action` va `category_ids` deyarli bo'sh

23 sotuvchidan 22 tasida `service_action: null` va `category_ids: []`, `Demo Advokat 1` da esa ikkalasi to'liq. Bu 22 tasida faol xizmat yo'qligi bilan bog'liq bo'lishi mumkin (B5). B5 yopilgach, xaritadagi har bir sotuvchida bu maydonlar to'ldirilgan bo'lishi kerak: narx va jonli hodisalar filtri shularga tayanadi.

### B9. Hudud markazidagi sotuvchilar

Filtrsiz javobdagi 13 tadan 9 tasi `location_source: profile_region`, ya'ni Toshkent markazida 400 m atrofida to'plangan. Haqiqiy joyi noma'lum.

**Qilish kerak:**
- `nearby-sellers/search` javobida `location_precision: region` bo'lsa, `distance_km` qiymatini `null` qilish yoki alohida belgilash. "≈ 2 km" deyish noto'g'ri taassurot beradi.
- Sotuvchilarga ofis manzilini kiritishni so'rash (`office-location`). Hozir faqat 5 ta sotuvchida `navigation.available: true`.

Frontend bunday pinlarni shtrixli va shaffof chizadi, aniq emasligi ko'rinib turadi.

### B16. Navigatsiya bo'yicha tasdiqlash kerak (jonli tekshirilmagan)

Frontend quyidagilarni kontrakt va testlar bo'yicha taxmin qilgan. Iltimos, tasdiqlang yoki tuzating:

1. Kalit yaroqsiz bo'lganda `POST .../navigation` HTTP 200 va `route: { available: false, reason: "routing_key_or_subscription_invalid", retryable: false }` qaytaradimi? Bu holatda `web_url` va `destination` baribir keladimi?
2. `transit` rejimi Router API orqali haqiqatan ishlaydimi? Ishlamasa, uni `navigation.modes` ro'yxatidan olib tashlang, frontend faqat kelgan rejimlarni ko'rsatadi.
3. `route.steps[].instruction` so'rovdagi `locale` tilida keladimi?
4. Frontend o'zgarishi: **marshrut endi har 100 m da emas, faqat mijoz yo'ldan `recalculate_after_meters` dan ko'proq chiqqanda qayta so'raladi.** Bu Yandex kvotasini va 30/daqiqa limitini tejaydi. Backend tomonda qarshi sabab bo'lsa, ayting.

---

## P2: Yaxshilashlar

### B10. `avatar_url`

Marker va `nearby` javoblarida `avatar_url` yo'q (2026-10-31 §7.4 dan beri ochiq). Kelsa, pin va kartada bosh harflar o'rniga rasm qo'yiladi.

### B11. Marker javobi og'ir

Bitta element taxminan 1 KB. Sababi har markerda takrorlanadigan `navigation` obyekti (`active_order_statuses`, `requires_*` va boshqalar). 300 ta marker har surishda taxminan 300 KB bo'ladi.

**Taklif:** markerda faqat `navigation: { available, modes }`, qolgani config yoki alohida endpointda.

### B12. Xato formati bir xil emas

| Endpoint | 401 javobi |
|---|---|
| `/marketplace/me/location-consent`, `/marketplace/me/office-location` | `{"detail":{"code":"authentication_required","message":"Login qiling"}}` |
| `/marketplace/geocoder/*`, `/marketplace/nearby-sellers/search`, `.../navigation` | `{"detail":"Login qiling"}` |

**Qilish kerak:** hamma joyda `{"detail":{"code":...,"message":...}}`.

### B13. `/openapi.json` 404

2026-11-04 da ishlagan (`LEXGO_ROP_CRM_BACKEND_QUESTIONS_2026_11_04.md`), hozir 404. Iltimos, qaytaring. Navigatsiya javobi tiplangan bo'lsa, ayniqsa foydali.

### B14. `provider-health` ochiq

`GET /marketplace/map/provider-health` login so'ramaydi, tekshirilgan so'rovda `cached: false` va 1.4 soniya davom etdi. Har chaqiruv provayderga ketayotgan bo'lsa, begona odam Yandex kvotasini sarflashi mumkin.

**Qilish kerak:** kamida 60 soniya kesh yoki faqat admin uchun.

### B15. Xarita kaliti

Config login so'ramasdan `maps_api_key` beradi. Frontend uni o'qimaydi, kalit `maps_loader_url` ichida keladi. JS API uchun kalitning brauzerga chiqishi tabiiy, lekin:
- `maps_api_key` maydonini olib tashlash mumkin.
- Yandex kabinetida kalitga HTTP Referer cheklovi qo'yilganini tekshiring. U hozir `localhost` dan ham ishlayapti, demak cheklov yo'q yoki `localhost` ham ruxsat etilgan.

---

## Tekshirish uchun buyruqlar

```bash
API=https://lexgo.api.cognilabs.org
UZ=55.9,37.1,73.2,45.7

# B1, B2
curl -s $API/marketplace/map/provider-health

# B3
curl -s "$API/marketplace/map/config?locale=uz" | jq '{geocoder_configured, routing_configured, routing}'

# B4: ikkinchi son birinchidan kam bo'lmasligi kerak, limit=1 esa 1 ta qaytarishi kerak
curl -s "$API/marketplace/sellers/map?bbox=$UZ&zoom=13&limit=500&verified_only=true"  | jq '.items | length'
curl -s "$API/marketplace/sellers/map?bbox=$UZ&zoom=13&limit=500&verified_only=false" | jq '.items | length'
curl -s "$API/marketplace/sellers/map?bbox=$UZ&zoom=13&limit=1&verified_only=true"    | jq '{n: (.items | length), truncated}'

# B5: har bir pin uchun 200 bo'lishi kerak
curl -s "$API/marketplace/sellers/map?bbox=$UZ&zoom=13&limit=500" | jq -r '.items[].seller_user_id' \
  | while read id; do curl -s -o /dev/null -w "%{http_code} $id\n" "$API/marketplace/lawyers/$id"; done

# B6: 0 chiqishi kerak
curl -s "$API/marketplace/sellers/map?bbox=$UZ&zoom=13&limit=500" | jq '[.items[] | select(.reviews_count == 0 and .rating > 0)] | length'
```
