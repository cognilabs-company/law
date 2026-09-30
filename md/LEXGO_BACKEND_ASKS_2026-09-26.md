# LexGo — Backendda qilinishi kerak bo'lgan ishlar

Project: LexGo
Date: 2026-09-26
Manba: frontend `LEXGO_URGENT_ADVOKAT_FRONTEND_UPDATE.md` va
`LEXGO_FRONTEND_SECOND_OPINION_PLAN_UPDATE.md` bo'yicha to'liq ulandi va
production'da (`https://lexgo.api.cognilabs.org`) har bir endpoint real
so'rov bilan tekshirildi. Quyidagilar — o'sha tekshiruvda chiqqan, **backend
tomonidan hal qilinishi kerak** bo'lgan masalalar.

Har bir band uchun: nima kutilgan, production'da nima bo'ldi, va nima kerak.
Barcha misollar haqiqiy javoblar (test akkauntlar bilan olingan).

---

## Muhimlik bo'yicha tartib

| # | Masala | Ta'sir | Muhimlik |
|---|---|---|---|
| 1 | Advokat o'ziga biriktirilgan Tezkor so'rovni ko'ra olmaydi | Guruh ikkinchi fikr flow'i advokat tomonida ishlamaydi | **Yuqori** |
| 2 | `/subscription-plans` "Shaxsiy advokat" paketlarini qaytarmaydi | Mijoz o'zida aktiv bo'lgan paketni sotib ololmaydi/ko'rmaydi | **Yuqori** |
| 3 | Payme va Click sozlanmagan (503) | Hech qaysi paketni haqiqiy to'lov bilan sotib bo'lmaydi | **Yuqori** |
| 4 | Admin test akkaunt paroli ishlamaydi (401) | Admin rolini test qilib bo'lmaydi | O'rta |
| 5 | `lawyer_count_mismatch` minimumda strukturasiz keladi | Operatorga override taklif qilib bo'lmaydi | O'rta |
| 6 | `assign-group` `scheduled_at` siz `in_progress` qiladi | Hujjatda yo'q, UI statusni noto'g'ri kutadi | O'rta |
| 7 | `payload.files` / `voice_messages` shakli hujjatlashtirilmagan | Mijoz yuborgan fayl/ovoz ko'rinmasligi mumkin | O'rta |
| 8 | Bitta paketni o'qish uchun endpoint yo'q (404) | Faqat ro'yxatdan olish mumkin | Past |
| 9 | Client uchun `GET /urgent-advokat/requests/{id}` yo'q | Ro'yxatdan olinyapti — ishlaydi, lekin nomuvofiq | Past |

---

## 1. Advokat o'ziga biriktirilgan Tezkor Advokat so'rovini ko'ra olmaydi

**Muhimlik: yuqori.** `LEXGO_URGENT_ADVOKAT_FRONTEND_UPDATE.md` ning
"Frontend page tavsiyasi" bo'limida yozilgan:

> Advokat/yurist:
> - Realtime invite notification
> - Meeting join
> - **Group request detail read-only yoki participant view**

Uchinchisini bajarib bo'lmaydi — **bunday endpoint yo'q**.

### Production'da tekshirildi

`second_opinion_group` so'roviga ikki advokat `assign-group` orqali
biriktirildi. Keyin o'sha advokatning (yoki umuman xodimning) o'zi so'rovni
o'qishga urindik:

```
GET /urgent-advokat/requests/me        (xodim token bilan)
200  []
```

Bo'sh. Bu endpoint faqat **mijozning o'z** so'rovlarini qaytaradi — hatto
so'rovni `claim` qilgan superadmin ham o'zi ishlayotgan recordni bu yerda
ko'rmaydi.

```
GET /call-center/urgent-advokat/requests/{record_id}   (client token bilan)
403  {"detail":"Ruxsat yo'q"}
```

Callcenter prefiksi — faqat `callcenter.access` uchun. **Tashqi advokat**
(`is_external_seller: true`, callcenter a'zosi emas) — aynan `candidates`
ro'yxati tavsiya qiladigan advokat — bu yo'ldan kira olmaydi.

Ehtimoliy nomlar ham tekshirildi, hammasi `404`:

```
GET /urgent-advokat/requests/assigned        404
GET /urgent-advokat/requests/my-cases        404
GET /urgent-advokat/my                       404
GET /urgent-advokat/assignments              404
GET /lawyer/urgent-advokat/requests          404
GET /sellers/me/urgent-advokat/requests      404
GET /urgent-advokat/lawyer/requests          404
```

### Hozir advokat nimani ko'radi

Faqat **meeting taklifini**. `POST .../meeting` `call.incoming` yuboradi va
frontend uni ring-card qilib ko'rsatadi (buni uladik). Ya'ni advokat
uchrashuvga kira oladi, lekin **nima haqida ekanini bilmaydi**: mijozning
`need` matni, yo'nalishlari, fayllari, guruhdagi boshqa advokatlar,
belgilangan vaqt — hech biri unga yetmaydi.

### Kerak

Advokat/yurist uchun ikkita endpoint:

```
GET /urgent-advokat/requests/assigned
```

Kirgan foydalanuvchi `assigned_lawyer_user_id` yoki `group_lawyer_user_ids`
ichida bo'lgan recordlar ro'yxati.

```
GET /urgent-advokat/requests/{record_id}
```

Faqat shu record ishtirokchisi bo'lsa — read-only. Javob shakli hozirgi
callcenter detail bilan bir xil bo'lsa yetarli, lekin **mijozning shaxsiy
ma'lumotlari cheklangan holda** (telefon raqamini berish kerakmi — o'zingiz
hal qiling; ism va `lexgo_id` yetarli bo'lsa kerak).

Shu ikkisi chiqsa, frontend advokat kabinetida "Mening Tezkor ishlarim"
bo'limini darrov qo'shadi.

---

## 2. `/subscription-plans` "Shaxsiy advokat" paketlarini qaytarmaydi

**Muhimlik: yuqori.** Bu eski masala — hali hal bo'lmagan.

Qoida: **faqat sovg'a qilinadigan** paketlardan tashqari hammasi ko'rinishi
kerak. Hozir esa `shaxsiy-advokat-gift` (sovg'a!) ko'rinadi, `standard` va
`premium` esa **umuman yo'q**.

### Production'da tekshirildi

```
GET /subscription-plans      (client token)
200  9 ta paket:
       shaxsiy-advokat-gift              afdaa11f-1d07-4586-a14b-84acd3c628b4
       lexgo-ai-free                     71a99675-0674-4db0-a8b3-310a383c22cb
       lexgo-ai-lite                     d220db6e-5d11-4b1f-86e8-7fac94f8430a
       lexgo-ai-pro                      7b44bea1-8443-4381-adb0-237ee5141bda
       lexgo-ai-yurist-advokat-seller    86102a14-7e49-4477-840f-0d09d192680a
       lexgo-ai-jismoniy-shaxs           c8ea0440-b019-470b-bc4f-81ed686f5cb8
       biznes-abonent-basic              6dfc01ce-77a9-4792-8369-ad0c144e46a3
       biznes-abonent-standard           06b6aa3d-ee96-4cdc-8dcd-d8a51c780786
       biznes-abonent-premium            74fbbfdd-44a9-4508-9b82-fd2b3ebba9d2
```

Endi **o'sha mijozning o'z entitlements'i**:

```
GET /clients/me/entitlements    (bir xil token)
200  active_subscriptions: [
       { plan_id: "afdaa11f-1d07-4586-a14b-84acd3c628b4", ends_at: "2026-10-25..." },
       { plan_id: "b6335673-8265-4554-bd7d-0627df77d801", ends_at: "2026-10-23..." }   <-- ?
     ]
     pending_manual_document_plan_requests: [
       { plan_slug: "shaxsiy-advokat-standard",
         plan_id:   "b6335673-8265-4554-bd7d-0627df77d801", ... }
     ]
```

`b6335673-8265-4554-bd7d-0627df77d801` = **`shaxsiy-advokat-standard`**.
Mijozda unga **aktiv obuna bor**, `entitlements` uni qaytaradi — lekin
`/subscription-plans` ro'yxatida u yo'q.

### Natija

- Mijoz o'z profilida "sizda Shaxsiy advokat Standard bor" degan holatni
  ko'ra olmaydi, chunki frontend paket nomini/narxini ro'yxatdan oladi.
- Standard/Premium'ni **sotib olish mumkin emas** — cardi umuman chizilmaydi.
- `shaxsiy-advokat-gift` esa ko'rinadi, holbuki u faqat sovg'a uchun
  (frontend uni o'zi filtrlab tashlaydi).

### Kerak

`/subscription-plans` **barcha `is_active` paketlarni** qaytarsin —
`shaxsiy-advokat-standard` va `shaxsiy-advokat-premium` ham. Sovg'alik
paketni ro'yxatdan chiqarib tashlash shart emas, `is_giftable: true`
yetarli — frontend uni o'zi ajratadi.

Agar hozir paketlar `target_roles` yoki `audience` bo'yicha filtrlanayotgan
bo'lsa: `shaxsiy-advokat-*` da `audience: "personal"`, boshqalarida
`"seller"`, lekin `target_roles` deyarli hammasida `[]`. Filtrlash mantig'i
`personal` paketlarni client uchun ham kesib tashlayotganga o'xshaydi.

---

## 3. Payme va Click sozlanmagan

**Muhimlik: yuqori.**

```
POST /payments  {"provider":"payme", "target_type":"subscription_plan", ...}
503  {"detail":"Payme integratsiyasi sozlanmagan"}

POST /payments  {"provider":"click", ...}
503  {"detail":"Click integratsiyasi sozlanmagan"}
```

ATMOS ham hali chiqmagan (`payment_provider.py` faqat payme / click / demo
ni biladi).

### Hozir frontend nima qilyapti

Vaqtinchalik yechim sifatida: provider 503 bersa, "Sotib olish" tugmasi
avtomatik **`POST /subscription-plans/{id}/telegram-purchase-request`** ga
o'tadi — muddat tanlanadi, so'rov admin Telegramiga ketadi, mijozga "so'rov
yuborildi, tasdiqlangach paket faollashadi" deb ko'rsatiladi. Bu
`LEXGO_FRONTEND_SECOND_OPINION_PLAN_UPDATE.md` da tavsiya qilingan yo'l va
u **ishlayapti** (tekshirildi, pastda).

Lekin bu manual jarayon. Haqiqiy to'lov uchun Payme yoki Click (yoki ATMOS)
sozlanishi kerak.

### Kerak

Kamida bittasini ishga tushiring. Qaysi biri birinchi bo'lishini ayting —
frontend `NEXT_PUBLIC_PAYMENT_PROVIDER` orqali darrov o'sha providerga
o'tadi, kod o'zgarishi shart emas.

---

## 4. Admin test akkaunti ishlamayapti

**Muhimlik: o'rta.**

```
POST /auth/login  {"phone":"+998900000002","password":"LexGo-Admin-5Qz9!2026"}
401  {"detail":"Phone yoki password noto'g'ri"}
```

Qolgan olti akkaunt ishlaydi. Admin rolini test qilish uchun yangi parol
kerak (yoki eskisini tiklang).

**Eslatma — 2FA:** hozir `client` va `superadmin` 2FA'siz kiradi, qolganlari
(`call_center`, `advokat`, `yurist`) `428 two_factor_required` qaytaradi va
Telegram kodini talab qiladi. Test uchun bu yetarli bo'ldi (superadmin butun
`/call-center/*` ni qoplaydi), lekin advokat rolini "o'z ko'zi bilan" test
qilish uchun 2FA'siz test akkaunt bo'lsa qulay bo'lardi.

---

## 5. `lawyer_count_mismatch` minimumdan kam bo'lganda strukturasiz keladi

**Muhimlik: o'rta.**

MD da yozilgan:

> Agar son mos kelmasa: `422 lawyer_count_mismatch`

Amalda **ikki xil** javob bor.

### a) Son mijoz so'raganiga teng emas — to'g'ri, strukturali

```
POST /call-center/urgent-advokat/requests/{id}/assign-group
{"lawyer_user_ids":["...","...","..."]}      // mijoz 2 ta so'ragan, 3 ta tanlandi

422  {"detail":{
       "code": "lawyer_count_mismatch",
       "requested_lawyer_count": 2,
       "selected_lawyer_count": 3,
       "message": "Mijoz so'ragan sondagi advokatlarni tanlang"
     }}
```

Bu yaxshi — frontend `allow_count_override` checkbox'ini chiqaradi va
`{"lawyer_user_ids":[...], "allow_count_override": true}` bilan qayta
yuborsa **200** keladi. Tekshirildi.

### b) Son xizmat minimumidan kam — strukturasiz

```
POST .../assign-group
{"lawyer_user_ids":["..."]}                   // 1 ta tanlandi

422  {"detail":"Kamida 2 ta advokat tanlang"}
```

`code` yo'q, obyekt emas, oddiy matn. `allow_count_override` ham yordam
bermaydi.

### Kerak

Ikkinchisini ham birinchisi kabi qiling:

```json
{
  "detail": {
    "code": "lawyer_count_below_minimum",
    "minimum_lawyer_count": 2,
    "selected_lawyer_count": 1,
    "message": "Kamida 2 ta advokat tanlang"
  }
}
```

Alohida `code` bo'lgani ma'qul — bu override qilinadigan xato emas, haqiqiy
xato, va frontend uni override taklifisiz ko'rsatishi kerak.

**Yo'nalish xatosi to'g'ri ishlayapti**, o'zgartirish shart emas:

```
422  {"detail":{
       "code": "lawyer_direction_mismatch",
       "items": [{"lawyer_user_id":"38b8938d-...","reason":"direction_not_matched"}],
       "message": "Tanlangan advokatlar so'rov yo'nalishiga mos emas"
     }}
```

---

## 6. `assign-group` `scheduled_at` siz `in_progress` qiladi

**Muhimlik: o'rta.** MD da bu yozilmagan.

```
POST .../assign-group  {"lawyer_user_ids":[a,b], "scheduled_at":"2026-09-27T10:00:00+05:00"}
200  status: "scheduled"

POST .../assign-group  {"lawyer_user_ids":[a,b,c], "allow_count_override":true}   // vaqtsiz
200  status: "in_progress"
```

Ya'ni `scheduled_at` — **ixtiyoriy**, va uni yubormaslik statusni
o'zgartiradi. Bu mantiqan to'g'ri, lekin hujjatda yo'q edi.

Yana: `"scheduled_at": ""` (bo'sh satr) yuborilsa butun so'rov rad etiladi —
shuning uchun frontend maydonni **umuman yubormaydi**.

### Kerak

Faqat hujjatga qo'shing:

- `scheduled_at` ixtiyoriy;
- berilsa → `scheduled`, berilmasa → `in_progress`;
- bo'sh satr qabul qilinmaydi (yoki qabul qilinadigan qiling).

---

## 7. `payload.files` va `payload.voice_messages` shakli noma'lum

**Muhimlik: o'rta.**

`POST /urgent-advokat/requests` body'sida ikkala massiv ham bor va biz
ularni bo'sh yuboryapmiz. Javobda ham **har doim bo'sh** qaytdi — hech bir
production recordida element ko'rmadik:

```json
"files": [],
"voice_messages": []
```

Shuning uchun element ichida nima borligini bilmaymiz. Frontend hozir
himoyalangan tarzda o'qiyapti (`url` / `file_url` / `download_url` / `path`,
nom uchun `name` / `file_name` / `filename` / `title`), lekin bu taxmin.

### Kerak

Bitta element shaklini ayting, masalan:

```json
"files": [
  { "id": "...", "name": "shartnoma.pdf", "url": "/uploads/...", "size": 128400,
    "content_type": "application/pdf", "uploaded_at": "..." }
],
"voice_messages": [
  { "id": "...", "url": "/uploads/...", "duration_seconds": 34, "uploaded_at": "..." }
]
```

Va aytib bering: mijoz faylni **qachon** biriktiradi — so'rov yaratishda
(`POST /urgent-advokat/requests` body'sida) mi, yoki `claim` ochgan xavfsiz
chat orqali mi? Hozir frontend ikkinchisini taxmin qilib, so'rov formasida
fayl so'ramayapti. Agar birinchisi bo'lsa, qaysi upload endpoint'i ishlatilishini
ayting (`POST /uploads`?) va `files` ga nima yozish kerakligini.

---

## 8. Bitta paketni o'qish uchun endpoint yo'q

**Muhimlik: past.**

```
GET /subscription-plans/afdaa11f-1d07-4586-a14b-84acd3c628b4
404  {"detail":"Not Found"}
```

Ro'yxatda bor paket uchun ham 404. Ya'ni `GET /subscription-plans/{id}`
umuman yo'q.

Hozir muammo emas — frontend ro'yxatni bir marta oladi va undan topadi.
Lekin 2-banddagi masala hal bo'lmaguncha, entitlements'dagi `plan_id` ni
nomga aylantirishning **iloji yo'q**: ro'yxatda ham yo'q, alohida ham
o'qib bo'lmaydi.

### Kerak

2-band hal bo'lsa, bu o'z-o'zidan hal bo'ladi. Aks holda
`GET /subscription-plans/{id}` qo'shilsa yaxshi.

---

## 9. Client uchun `GET /urgent-advokat/requests/{id}` yo'q

**Muhimlik: past.** Ma'lumot uchun.

```
GET /urgent-advokat/requests/{record_id}    (client token, o'z recordi)
404  {"detail":"Not Found"}
```

Frontend buni chetlab o'tdi: `GET /urgent-advokat/requests/me` allaqachon
**to'liq detail shaklini** qaytaradi (`client`, `lifecycle`, `payload`,
`status_history`, hammasi), shuning uchun mijozning detail ekrani ro'yxatdan
o'qiyapti. Ishlayapti.

Agar keyinchalik `me` ro'yxati qisqartirilsa (masalan sahifalash qo'shilsa),
u holda bu endpoint kerak bo'ladi — shuni yodda tuting.

---

## Tekshirilgan va to'g'ri ishlaydigan narsalar

Bular **o'zgartirish talab qilmaydi** — hujjatga mos, production'da
to'liq ishladi. Ro'yxat to'liqlik uchun:

### Tezkor Advokat lifecycle

`second_opinion_group` bo'yicha to'liq yo'l:

| Qadam | So'rov | Natija |
|---|---|---|
| Yaratish | `POST /urgent-advokat/requests` | `201 open_pool` |
| Detail | `GET /call-center/urgent-advokat/requests/{id}` | `200` |
| Kandidatlar | `GET .../candidates?include_external=true&include_callcenter=true&limit=50` | `200`, birinchisi `direction_match: true`, `score: 75` |
| Olish | `POST .../claim` | `200 claimed`, `secure_chat_room_id` ochildi |
| Guruh (xato) | `POST .../assign-group` 1 ta | `422` (5-bandga qarang) |
| Guruh (xato) | `POST .../assign-group` yo'nalish mos emas | `422 lawyer_direction_mismatch` |
| Guruh (to'g'ri) | `POST .../assign-group` + `scheduled_at` | `200 scheduled`, 2 advokat |
| Uchrashuv | `POST .../meeting` | `201`, 4 ishtirokchi (host/client/lawyer×2), 30 daq |
| Status | `PATCH .../status` `{"status":"in_progress"}` | `200 in_progress` |
| Status (noto'g'ri) | `PATCH .../status` `{"status":"open_pool"}` | `409 "in_progress holatidan open_pool holatiga o'tkazib bo'lmaydi"` |
| Yakunlash | `POST .../complete` | `200 completed` |
| Qayta claim | `POST .../claim` | `409` |

Chat konsultatsiya: `create → claim → complete` — uchalasi ham ishladi
(uchrashuvsiz).

Mijoz tomonidan bekor qilish ham ishladi:

```
POST /call-center/urgent-advokat/requests/{id}/cancel    (client token!)
200  status: "cancelled"
```

Ya'ni callcenter prefiksidagi bu endpoint **o'z recordi bo'lsa mijozga ham
ochiq** — MD da shunday yozilgan va shunday ishlayapti. Yaxshi.

### `lifecycle.next_statuses`

Har bir recordda keladi va aniq. Yakuniy statusda `[]` — frontend shunga
qarab tugmalarni o'chiradi. Bu juda foydali, rahmat.

### `second_opinion_eligible_sources`

Ikkinchi fikr ochilganda `payload` ichida keladi, shakli aniq:

```json
{"type":"service_order","id":"...","status":"paid",
 "service_id":"...","service_title":"Ekspress yuridik konsultasiya (chat)",
 "executor_type":"Юрист","created_at":"..."}
```

Frontend buni **faqat callcenter detailida** ko'rsatyapti (MD da aytilganidek
mijozga ko'rsatilmayapti).

### `GET /call-center/queue`

`type: "urgent_advokat"` qatorlari to'g'ri keladi, barcha kerakli maydonlar
bilan: `service_kind`, `channel`, `directions`, `requested_lawyer_count`,
`operator_user_id`, `claimed_by_user_id`, `source`, va SLA **15 daqiqa**
(lid/order uchun 60). Frontend endi bu qatorlarni alohida ko'rsatyapti.

### `telegram-purchase-request`

```
POST /subscription-plans/7b44bea1-8443-4381-adb0-237ee5141bda/telegram-purchase-request
{"billing_period":"monthly","currency":"UZS"}

200  {"id":"...","status":"pending","payment_id":"...",
      "plan_slug":"lexgo-ai-pro","amount":99000,"currency":"UZS",
      "telegram_sent":true,
      "telegram_results":[{"chat_id":"...","ok":true,"message_id":652}, ... 4 ta chat]}
```

Barcha aktiv paketlar uchun ishlayapti (MD da va'da qilinganidek).
Noto'g'ri muddat yuborilsa foydali 422 keladi:

```
422  {"detail":{"allowed_billing_periods":["monthly","prepaid_yearly","six_month","yearly"]}}
```

Frontend buni o'qiydi va chiplarni shu ro'yxatga qisqartiradi.

> **Eslatma:** test paytida admin Telegram chatlariga **2 ta haqiqiy so'rov**
> yuborildi — `lexgo-ai-pro` (oylik, 99 000) va `biznes-abonent-premium`
> (yillik, 129 600 000). Ikkalasi ham `pending`. Iltimos, ularni rad eting
> yoki e'tiborsiz qoldiring — bu test, haqiqiy xarid emas.

### Tozalangan test recordlari

Tekshiruv davomida `+998900000005` (Client) akkauntida 6 ta Tezkor Advokat
so'rovi yaratildi. **Hammasi yopildi** (`cancelled` yoki `completed`) —
pool'da ochiq test recordi qolmadi.

---

## Xulosa

Tezkor Advokat moduli backend tomonidan **deyarli to'liq** — 13 ta
endpoint'dan 13 tasi ishlayapti, lifecycle to'g'ri, xatolar mazmunli.
Frontend hammasini uladi.

Qolgan asosiy ish — **1-band**: advokat o'ziga biriktirilgan ishni ko'rishi
uchun endpoint. Usiz guruh ikkinchi fikr advokat tomonida yarim ishlaydi:
u uchrashuvga chaqiriladi, lekin nima haqida ekanini bilmaydi.

Paketlar tomonida esa **2-band** (Shaxsiy advokat paketlari ro'yxatda yo'q)
va **3-band** (to'lov provideri) — bu ikkisi hal bo'lmaguncha mijoz paketni
faqat Telegram orqali qo'lda sotib ola oladi.
