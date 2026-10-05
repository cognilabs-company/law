# Marketplace AI qidiruv — frontend tayyor (2026-10-05)

"Advokat va yuristlar" sahifasidagi hero qidiruvi AI qidiruvga ulanishga tayyor. Backend endpointi paydo bo'lishi bilan frontend o'zgarishsiz ishlay boshlaydi.

## Frontend kutadigan endpoint

`POST /marketplace/ai-search` (bearer token bilan, odatiy `/api/backend` proksi orqali)

So'rov:

```json
{ "query": "Eri aliment to'lamayapti, ajrashmoqchiman", "limit": 30 }
```

Javob (200):

```json
{
  "items": [
    { "lawyer_user_id": "<marketplace /lawyers dagi user_id>", "score": 0.94, "reason": "Oilaviy nizolar va aliment bo'yicha 40+ ish" }
  ],
  "summary": "Oilaviy huquq — aliment va ajrashish"
}
```

- `items` tartibi — moslik tartibi (birinchisi eng mos).
- `lawyer_user_id` — `GET /marketplace/lawyers` javobidagi `user_id` bilan bir xil bo'lishi shart.
- `score` — 0..1 (yoki 0..100, frontend ikkalasini tushunadi); yo'q bo'lsa karta "AI tanlovi" deb belgilanadi.
- `reason` — kartada "nega mos" izohi (ixtiyoriy, 1–2 qisqa jumla).
- `summary` — hero ostidagi qisqa xulosa (ixtiyoriy).

Muqobil maydon nomlari ham qabul qilinadi: `matches`/`results`/`lawyers` (ro'yxat), `user_id`/`seller_user_id`/`lawyer_id`/`id`, `match_score`/`relevance`/`confidence`, `explanation`/`why`/`match_reason`.

## Frontend xatti-harakati

- Foydalanuvchi 3+ belgi yozib to'xtaganidan 650 ms keyin, yoki "Topish"/Enter bosilganda so'rov yuboriladi.
- Kutish paytida: maydon chegarasi tezroq aylanadi, "AI mos mutaxassislarni qidirmoqda…" ko'rsatiladi, ro'yxat xiralashadi.
- Javob kelganda: faqat AI tanlagan mutaxassislar AI tartibida ko'rsatiladi (rol/hudud/narx kabi filtrlar ustidan), har kartada "N% mos" va izoh chiqadi.
- Endpoint `404/405/501` qaytarsa — sessiya davomida qayta so'ralmaydi, oddiy matn qidiruvi ishlaydi (so'zma-so'z topilmasa, muhim so'zlarning istalgani bo'yicha).
- Boshqa xato yoki bo'sh `items` — oddiy qidiruv natijasi ko'rsatiladi.

## Fayllar

- `lib/services/marketplace.ts` — `aiSearchMarketplace`, `marketAiAvailable`
- `components/marketplace/MarketDirectory.tsx` — hero, AI holatlari, filtrlar, karta izohi
- `app/globals.css` — `.mk-search--ai`, `.mk-aistate`, `.mk-card__ai`, `.mk-chosen`, filtr oynasi
- `messages/{uz,ru,en}.json` — `marketplace.ai*`, `marketplace.filters.show/close`
