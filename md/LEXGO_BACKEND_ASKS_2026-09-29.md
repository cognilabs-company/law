# LexGo — Backendda qilinishi kerak bo'lgan ishlar (2026-09-29)

Project: LexGo
Date: 2026-09-29
Oldingi ro'yxat: `LEXGO_BACKEND_ASKS_2026-09-26.md` (o'sha bandlar hali yopilmagan
bo'lsa, ular ham kuchda)

Bu ro'yxat GM bergan oxirgi tasklar (Huquqiy hujjatlar konstruktori, Tezkor
advokat, nomlardagi buglar, "Call center advokat" so'zi) bo'yicha frontend
ishlayotganda chiqdi. **Har bir band bugun production'da
(`https://lexgo.api.cognilabs.org`) real so'rov bilan o'lchandi** — raqamlar
taxmin emas, o'lchov. Test akkaunt: klient `+998900000005`.

Frontend tomonidan qilinadigan hamma narsa qilindi. Quyidagilar — frontend
o'zi hal qila olmaydigan, **faqat backendda** yopiladigan masalalar.

---

## Muhimlik bo'yicha tartib

| # | Masala | Ta'sir | Muhimlik |
|---|---|---|---|
| 1 | Bitta hujjatga bir nechta advokat so'rovi yuborilaveradi | GM so'ragan "qayta so'rov yubora olmasin" qoidasi faqat brauzerda; API orqali aylanib o'tiladi | **Yuqori** |
| 2 | Advokat akkauntining ismi mijozga "LexGo **Call Center** Lawyer" bo'lib chiqadi | GM: "Call center advokat so'zi mutlaqo ishlatilmasligi kerak" | **Yuqori** |
| 3 | Katalogdagi nomlar iflos (nuqta, `_`, `.docx`, UUID, `(1)`, lotin-kirill aralash) | Mijoz buzuq nom ko'radi, qidiruv ishlamaydi, yuklangan fayl nomi buzuq | **Yuqori** |
| 4 | `GET /document-requests` ro'yxatida `document_type` yo'q | Frontend advokat so'rovini konstruktor so'rovidan faqat status orqali ajratadi | **Yuqori** |
| 5 | `GET /document-requests/{id}` da `assigned_lawyer` / `lawyer_request` yo'q | Mijoz kim ishlayotganini ko'rmaydi (ekrandagi qator o'lik) | O'rta |
| 6 | `catalog_code` — 497 ta kodda 339 xil shakl | GM aytgan "bir xil fayllarda har xil kodlar" aynan shu | O'rta |
| 7 | `service-flow` `total` `mode` bo'yicha filtrlanmaydi | Paginatsiya noto'g'ri sahifa soni beradi | O'rta |
| 8 | `service-flow` `status_label` bir qismi tarjimasiz keladi | `open_pool`, `closed`, `rated` xom holda | O'rta |
| 9 | Hujjat statusi hech qachon `claimed` bo'lmaydi | Kontrakt hujjatlashtirilmagan | Past |
| 10 | `requested_document_type` javoblarda qaytmaydi | Yuborilgan, lekin o'qib bo'lmaydi | Past |
| 11 | Mijoz uchun fayl yuklash route'i yo'q | `files[{file_id}]` shaklini hosil qilib bo'lmaydi | Past |
| 12 | `source_file_url` mijozga 403 | Faqat `clean_source_file_url` ishlaydi | Past |
| 13 | `GET /secure-chats/{id}` — 405 | Suhbatdagi ishtirokchilar sonini olib bo'lmaydi | Past |
| 14 | `urgent-advokat/catalog` da tartib maydoni yo'q | Kartalar tartibi frontendda qattiq yozilgan | Past |
| 15 | `/services/{id}` va `/services/{id}/document-template-file` — 404 | Kutilgan route yo'q | Past |
| 16 | `region` urgent kontraktda qolgan, lekin hech qachon qaytmaydi | O'lik maydon | Past |
| 17 | Advokat talab qiladigan 24 ta xizmatdan 23 tasi katalog daraxtidan ochilmaydi | Eng qimmat xizmatlar mijozga amalda ko'rinmaydi | **Yuqori** |

---

## 1. Bitta hujjat bo'yicha bir nechta advokat so'rovi yuborilaveradi

**Muhimlik: yuqori.** GM taski, aynan:

> "Bir document advokatga yo'naltirilgandan keyin, uning statusi yakunlandi
> bo'lmaguncha, o'sha document bo'yicha advokatga qayta so'rov yubora olishi
> kerak emas. Ya'ni men 'konstruktordan foydalanaman' deb, keyin yana
> 'advokat yordamidan foydalanaman' desam, 'sen allaqachon zayavka
> bergansan' degan xabar chiqishi kerak."

### Production'da tekshirildi

```
GET /document-requests/service-flow?mode=lawyer&limit=50
→ 200, 16 ta qator
```

Bitta shablon (`74118141-6844-491b-9dac-7925ce6f8843`), bitta mijoz:

```
file_ready, lawyer_review, lawyer_review
```

Ya'ni **ayni paytda ikkita advokat so'rovi tirik**. Backend ikkinchisini rad
etmadi.

Yana: `POST .../document-lawyer/request` har safar **yangi** `DocumentRequest`
yozuvi yaratadi (`document_type: "lawyer_assisted_service_document"`,
`status: "open_pool"`), eski konstruktor yozuvini o'zgartirmaydi. Shu sababli
bitta shablonga 3 tagacha yozuv yig'iladi:

```
b9cca37d-3007-4ce5-bc82-d3ed3a56f2b3
  2026-09-28T17:32:28Z  open_pool      lawyer_assisted_service_document
  2026-09-28T13:16:48Z  questionnaire  legal-doc-economic
  2026-09-28T13:14:52Z  file_ready     legal-doc-economic
```

### Kerak

`POST /services/{id}/document-lawyer/request` va
`POST /services/{id}/document-lawyer/request-with-files` shu mijoz + shu
shablon uchun **tirik** advokat so'rovi bo'lsa, **409** qaytarsin. Tirik
degani — statusi `open_pool`, `claimed` yoki `lawyer_review`.

Javob shaklida quyidagilar bo'lsin (frontend shularni ko'rsatadi):

```json
{
  "detail": "Bu hujjat bo'yicha so'rovingiz allaqachon advokatga berilgan.",
  "code": "document_lawyer_request_already_open",
  "request": {
    "id": "...",
    "work_id": "LGD-20260928-F9D03095",
    "status": "lawyer_review"
  }
}
```

`POST /document-requests/{id}/lawyer-review` uchun ham xuddi shunday.

> Frontend tomonda bu qoida **allaqachon qo'yildi** — mijoz so'rov yuborilgan
> hujjatda advokat tugmasini bosa, "allaqachon yuborilgan" xabari chiqadi.
> Lekin bu faqat brauzerda. API'ga to'g'ridan-to'g'ri so'rov yuborilsa,
> qoidani hech narsa ushlab turmaydi. Shuning uchun serverda ham kerak.

---

## 2. Advokat akkauntining ismi mijozga "LexGo Call Center Lawyer" bo'lib chiqadi

**Muhimlik: yuqori.** GM taski:

> "Call center advokat so'zi mutlaqo ishlatilishi kerak emas, uning o'rniga
> **Navbatchi advokat** degan so'z ishlatilishi kerak."

Frontendda bu so'z qatnashgan hamma matn tuzatildi. Lekin bitta joy frontend
qo'lida emas — **advokatning o'z ismi ma'lumotlar bazasida shunday yozilgan**:

```
GET /document-requests/service-flow?mode=lawyer&limit=50
→ assigned_lawyer.name = "LexGo Call Center Lawyer"
→ assigned_lawyer.name = "LexGo Advokat"
```

Birinchisi mijozga ko'rinadi: hujjat kutish ekranida, Tezkor advokat
suhbatida, xabarnomalarda.

### Kerak

`+998900000003` akkauntining (va shu qolipda yaratilgan boshqa xizmat
akkauntlarining) `name` maydoni **"LexGo Navbatchi advokat"** ga
o'zgartirilsin. Rol kaliti (`call_center_lawyer`) o'zgarmasin — u kontrakt,
faqat ko'rinadigan ism o'zgarsin.

Iltimos, bazadagi barcha akkauntlar nomi `call.?cent` bo'yicha tekshirib
chiqilsin.

---

## 3. Katalogdagi nomlar iflos

**Muhimlik: yuqori.** GM taski:

> "Nomdagi buglarni ham check qilish kerak. Bir xil fayllar nomida har xil
> kodlar turibdi."

Nomlar DOCX fayl nomlaridan import qilingan va fayl tizimining axlati
qolgan. Bugun o'lchandi — **497 ta xizmat** va **988 ta shablon**:

| Nuqson | Xizmat nomi | Shablon nomi | Manba fayl nomi |
|---|---|---|---|
| `_` bilan boshlanadi | 12 | 12 | 12 |
| Oxirida ortiqcha nuqta | 47 | 165 | — |
| Ikkilangan bo'shliq | 4 | 22 | 22 |
| Uzilmas bo'shliq (NBSP) | 0 | 1 | 1 |
| Nomida `.docx` bor | 0 | 3 | — |
| `(1)` / `(2)` qo'shimchasi | 11 | 24 | 24 |
| Nom o'rnida faqat UUID | 2 | 2 | 0 |
| Butunlay BOSH HARF | 3 | 3 | — |
| Kirill so'z ichida lotin harfi | 4 | 4 | 4 |
| Kengaytmadan oldin bo'shliq (`ариза .docx`) | — | — | 21 |
| Ikki nuqtali kengaytma (`ариза..docx`) | — | — | 165 |
| Deyarli bir xil nomlar guruhi | 11 guruh / 23 nom | 27 guruh / 56 nom | 28 guruh / 58 nom |
| Aynan bir xil nom (ikki xil id) | 1 juft | 1 juft | 0 |

Haqiqiy misollar:

```
"_Далилларни номақбул деб топиш тўғрисида илтимоснома."
"Кассация  шикоятидан воз кечиш  тўғрисида ариза."
"Трасология экспертиза тайинлаш тўғрисида.docx"
"756b8bb0-a0ab-48ed-8980-6a1f3ad68f0e"
"Cуд мажлисини бошқа кунга қолдириш тўғрисида илтимоснома"   ← C lotincha
"АЛОҲИДА ТУРДАГИ ВА КОМПЛEКСДАГИ ..."                        ← E lotincha
```

Deyarli bir xil nomlar (GM aytgan holat):

```
"Болани овқатлантириш учун танаффус бериш тўғрисида буйруқ"
"Болани овқатлантириш учун танаффус бериш тўғрисида буйруқ (1)"
"Болани овқатлантириш учун танаффус бериш тўғрисида буйруқ (2)"

"Даъвогар жавобгар, учинчи шахснинг иштирокисиз кўриш бўйича илтимоснома"
"Даъвогар, жавобгар, учинчи шахснинг иштирокисиз кўриш бўйича илтимоснома"

"Автотранспорт воситасини тасарруф этишга эр хотиннинг розилик аризаси .docx"
"Автотранспорт воситасини тасарруф этишга эр хотиннинг розилик аризаси.docx"
```

### Frontend nimani o'z zimmasiga oldi

`lib/docTitle.ts` da tozalagich bor va u ekranda quyidagilarni yashiradi:
boshidagi `_`, oxiridagi ortiqcha nuqta (qisqartmalarni saqlagan holda —
`va h.k.` nuqtasini olmaydi), ikkilangan bo'shliq va NBSP, oxiridagi
`.docx`, faqat UUID'dan iborat nom, kirill so'z ichidagi lotin harfi.

### Kerak — bu ekranda emas, bazada tuzatilishi kerak

1. **`(1)` / `(2)` ni frontend ataylab olib tashlamadi.** O'lchov ko'rsatdiki
   o'sha juftliklar **bir xil hujjat emas** — maydonlari soni va matni har
   xil. Belgini olib tashlasak, katalogda bir xil nomli ikkita karta qoladi,
   bu GM aytgan chalkashlikni yomonlashtiradi. Ularga **haqiqiy, farqli nom**
   berilishi kerak (masalan "… (ish beruvchi uchun)" / "… (xodim uchun)").
2. Aynan bir xil nomli ikki xizmat (`8d2cf631…` va `b7181ba5…`,
   "Автотранспорт воситасини тасарруф этишга эр хотиннинг розилик аризаси")
   — bittasi o'chirilsin yoki nomi farqlansin.
3. Nomi UUID bo'lib qolgan 2 ta xizmat va 2 ta shablon — importda nomini
   yo'qotgan haqiqiy hujjatlar (19 maydon, 1863 belgi). Nomi tiklansin.
4. `source_file_name` — 165 tasi `..docx` bilan, 21 tasi kengaytmadan oldin
   bo'shliq bilan tugaydi. Bu **yuklab olinadigan faylning haqiqiy nomi**:
   mijoz `_Далилларни номақбул деб топиш тўғрисида илтимоснома..docx` degan
   fayl oladi. Bazada tozalansin.
5. Migratsiya bir marta yurgizilsa yaxshi bo'lardi: `TRIM`, ikkilangan
   bo'shliqni bittaga, oxirgi nuqtani olib tashlash, lotin homoglifni
   kirillga o'girish.

---

## 4. `GET /document-requests` ro'yxatida `document_type` yo'q

**Muhimlik: yuqori.**

```
GET /document-requests?limit=5
item keys: id, template_id, title, status, price, price_tiyin, currency, created_at
```

`GET /document-requests/{id}` esa `document_type` ni qaytaradi
(`"lawyer_assisted_service_document"`).

Natijada frontend "bu qator advokatnikimi yoki konstruktornikimi" degan
savolga ro'yxatdan javob ololmaydi — har bir qator uchun alohida `GET`
qilish kerak bo'ladi (bir mijozda 114 ta qator). Hozir frontend buni
**statusdan** taxmin qilyapti (`open_pool` / `claimed` / `lawyer_review` —
advokatniki), bu ishlaydi, lekin kontrakt emas.

### Kerak

Ro'yxat qatoriga `document_type` (va mumkin bo'lsa `mode`: `manual` | `ai` |
`lawyer`) qo'shilsin.

---

## 5. `GET /document-requests/{id}` da `assigned_lawyer` / `lawyer_request` yo'q

**Muhimlik: o'rta.**

```
GET /document-requests/f9d03095-...   → 200
  assigned_lawyer: yo'q
  lawyer_request : yo'q
  document_type  : "lawyer_assisted_service_document"
```

Holbuki `service-flow` o'sha yozuv uchun ikkalasini ham beradi:

```
lawyer_request  = { id: "241aabe3-…", status: "claimed", owner_user_id: "ff265799-…" }
assigned_lawyer = { name: "LexGo Call Center Lawyer", role: "advokat", phone: "+998900000003" }
```

Frontendda mijozning kutish ekrani advokat ismini shu detail'dan o'qiydi, shu
sababli o'sha qator **hech qachon ko'rinmaydi** — kod tirik, ma'lumot yo'q.

### Kerak

`GET /document-requests/{id}` javobiga `assigned_lawyer` va `lawyer_request`
qo'shilsin — `service-flow` dagi shaklda.

---

## 6. `catalog_code` — 497 ta kodda 339 xil shakl

**Muhimlik: o'rta.** GM: "Bir xil fayllar nomida har xil kodlar turibdi."

```
497 ta kod, 339 xil shakl
  129x  A99                                e.g. B01
   20x  AA-999                             e.g. FX-003
    4x  AAA-AAAAAAAAAAAAA-AAAAAA-99A999    e.g. DOC-AVTOTRANSPORT-VOSITA-34C490
    2x  AAA-AAAAAAAAAA-AAAAA-AAA-A9999A    e.g. DOC-ISTEMOLCHI-LARGA-ICH-F5474A
    …
```

Ya'ni to'rtta mos kelmaydigan sxema aralashgan: `B02` (3 belgi), `FX-015`
(6), `ADM-HUQUQBUZ-ARIZA` (18), `DOC-BOLANI-OVQATLANTIRIS-6EB89D` (31).
Oxirgi shakl hech qanday tartib bermaydi — oxiridagi 6 belgi UUID
bo'lagidan olingan, ya'ni deyarli har bir xizmatda o'ziga xos.

Kod mijozga "Kod" deb ko'rsatiladi
(`components/portal/ServicePassport.tsx`).

### Kerak

Bitta sxema tanlansin va migratsiya qilinsin. Bu ma'lumot masalasi —
frontend kodlarni normallashtirmaydi (normallashtirsa, mijoz aytgan kod
bilan bazadagi kod mos kelmay qoladi).

---

## 7. `service-flow` `total` `mode` bo'yicha filtrlanmaydi

**Muhimlik: o'rta.**

```
GET /document-requests/service-flow?mode=lawyer&limit=50  → items = 16,  total = 114
GET /document-requests/service-flow?limit=50              → items = 50,  total = 114
```

`mode=lawyer` faqat 16 ta qator beradi, lekin `total` hamon 114 — filtrsiz
umumiy son. Paginatsiya `total` ga ishonsa, mavjud bo'lmagan sahifalarni
ko'rsatadi.

Qo'shimcha: `?tab=` parametri tanilmaydi (e'tiborsiz qoldiriladi) —
`?mode=` ishlaydi. Agar `tab` qo'llab-quvvatlanmasa, hujjatda shunday
yozilsin.

### Kerak

`total` qo'llanilgan filtrlarga mos hisoblansin.

---

## 8. `service-flow` `status_label` bir qismi tarjimasiz keladi

**Muhimlik: o'rta.**

```
open_pool      → "open_pool"                        ← xom
lawyer_review  → "Advokat hujjatni tayyorlamoqda"   ← to'g'ri
questionnaire  → "Ma'lumotlar to'ldirilmoqda"       ← to'g'ri
rated          → "rated"                            ← xom
closed         → "closed"                           ← xom
file_ready     → "Hujjat tayyor"                    ← to'g'ri
```

Frontend o'z tarjimasini ishlatadi, shuning uchun mijoz buni ko'rmaydi —
lekin `status_label` ni ishonchli deb hisoblagan har qanday boshqa
iste'molchi (bot, hisobot, Telegram) xom qiymat chiqaradi.

### Kerak

Uchala status uchun ham `status_label` to'ldirilsin, yoki maydon butunlay
olib tashlanib, tarjima mijozga qoldirilsin.

---

## 9. Hujjat statusi hech qachon `claimed` bo'lmaydi

**Muhimlik: past (hujjatlashtirish).**

Advokat ishni olganda `lawyer_request.status` `claimed` bo'ladi, lekin
`document_request.status` `lawyer_review` bo'lib qoladi. Frontend
`stageFor()` da `claimed` shoxi bor va u production'da **hech qachon
ishlamaydi**.

### Kerak

Yo `document_request.status` ham `claimed` ga o'tsin, yo hujjatda aniq
yozilsin: "hujjat statusi `claimed` bo'lmaydi, advokat olgani
`lawyer_request.status` dan o'qiladi".

---

## 10. `requested_document_type` javoblarda qaytmaydi

**Muhimlik: past.**

`POST .../document-lawyer/request` va `request-with-files`
`requested_document_type` ni qabul qiladi
(`GET /document-services/request-document-types` ro'yxat beradi), lekin:

```
GET /document-requests/{id}                       → requested_document_type: yo'q
GET /document-requests/service-flow?mode=lawyer   → 5 qatordan 0 tasida bor
```

Ya'ni mijoz qaysi turdagi hujjat so'raganini **hech kim qayta o'qiy
olmaydi** — advokat ham, mijozning o'zi ham.

### Kerak

201 javobida, detail'da va `service-flow` qatorida `requested_document_type`
va `requested_document_type_is_custom` qaytarilsin.

---

## 11. Mijoz uchun fayl yuklash route'i yo'q

**Muhimlik: past.**

```
404  GET /uploads
404  GET /files
404  GET /media/upload
404  GET /attachments
```

Ba'zi hujjatlarda `files: [{file_id}]` shakli kutiladi, lekin mijoz
`file_id` ni oladigan joy yo'q. Hozir frontend multipart
(`request-with-files`) orqali yuboradi — ishlaydi, lekin ikki xil yo'l
qolgan.

### Kerak

Yo mijoz uchun umumiy upload route'i ochilsin, yo `file_id` kutadigan
joylar hujjatdan olib tashlansin.

---

## 12. `source_file_url` mijozga 403

**Muhimlik: past.**

```
403  source_file_url            /services/{id}/document-template/source
403  source_file_inline_url     /services/{id}/document-template/source?inline=1
200  clean_source_file_url      /services/{id}/document-template/clean
403  template_source_file_url   /document-templates/{id}/source-file
```

To'rttadan bittasi ishlaydi. Frontend `clean_*` ga o'tgan, shuning uchun
ishlaydi — lekin `document-fields` javobi mijozga ochilmaydigan uchta URL
yuborib turibdi.

### Kerak

Yo uchalasi ham mijozga ochilsin, yo `document-fields` javobida mijozga
umuman yuborilmasin.

---

## 13. `GET /secure-chats/{id}` — 405

**Muhimlik: past.**

```
405  GET /secure-chats/{id}                → Method Not Allowed
200  GET /secure-chats/{id}/messages       → ishlaydi
404  GET /secure-chats/{id}/participants   → Not Found
```

`GET /secure-chats` ro'yxat beradi, lekin bitta suhbatni o'qib bo'lmaydi.
Natijada suhbat sarlavhasida ishtirokchilar sonini ko'rsatib bo'lmaydi.

### Kerak

`GET /secure-chats/{id}` ochilsin (ishtirokchilar ro'yxati bilan), yoki
ro'yxat qatoriga `participant_count` qo'shilsin.

---

## 14. `urgent-advokat/catalog` da tartib maydoni yo'q

**Muhimlik: past.**

```
service item keys: key, title, delivery, meeting_minutes, price,
                   supports_chat, supports_files, supports_voice, variant
sort_order / position / order / weight / rank: YO'Q
```

GM "Chat orqali konsultatsiya YTX o'rniga, 2-chi bo'lsin" dedi. Tartib
maydoni yo'qligi uchun frontend tartibni **o'zida qattiq yozdi**. Bu ishlaydi,
lekin tartibni o'zgartirish uchun har safar frontend relizi kerak bo'ladi.

### Kerak

`services[]` elementlariga `sort_order` (butun son) qo'shilsin. Shunda
tartib admin paneldan boshqariladi.

---

## 15. `/services/{id}` va `/services/{id}/document-template-file` — 404

**Muhimlik: past.**

```
404  GET /services/c8900ed5-4628-459a-8f2e-5bd75b67a410
404  GET /services/c8900ed5-4628-459a-8f2e-5bd75b67a410/document-template-file
404  GET /services/categories          ← to'g'ri yo'l: /service-categories
```

Xizmat ro'yxatdan olinadi, lekin bittasini id bo'yicha o'qib bo'lmaydi.

### Kerak

Yo `GET /services/{id}` ochilsin, yo hujjatdan olib tashlansin.
`/services/categories` esa hujjatda `/service-categories` deb tuzatilsin.

---

## 16. `region` urgent kontraktda qolgan, lekin hech qachon qaytmaydi

**Muhimlik: past.** GM: "Hudud olib tashlash kerak tezkor advokatda."

```
GET /urgent-advokat/requests/me → 40 ta yozuv
  region kaliti bor: YO'Q (hech qaysisida)
```

Frontend tomonda hudud maydoni ham, o'lik shoxi ham olib tashlandi.
Backendda `region` hali ham `POST /urgent-advokat/requests` tanasida qabul
qilinadi.

### Kerak

`region` kontraktdan olib tashlansin (yoki ataylab qoldirilgan bo'lsa,
hujjatda shunday yozilsin).

---

## 17. Advokat talab qiladigan 24 ta xizmatdan 23 tasi katalogdan topilmaydi

**Muhimlik: yuqori.** Frontendda shu xizmatlarga "Advokat bilan" lentasi
qo'yildi (3-band bilan bir xil ma'lumot asosida). Lekin o'lchov ko'rsatdiki,
mijoz ularni **katalog daraxti orqali ocha olmaydi**.

### Production'da tekshirildi

```
GET /services?limit=500     → 24 ta xizmatda advokat_required = true
GET /service-categories     → 4 ta umumiy yo'nalish

Har bir umumiy yo'nalish ichidagi advokatli xizmatlar soni:
  Fuqarolik   625 qator / 0 ta advokatli
  Iqtisodiy   335 qator / 0 ta advokatli
  Ma'muriy     23 qator / 0 ta advokatli
  Jinoiy        6 qator / 1 ta advokatli
```

Ya'ni 24 tadan faqat **1 tasi** yo'nalish bo'yicha ochilganda ko'rinadi.
Qolgan 23 tasining category_id si `GET /service-categories` qaytarmaydigan
barg kategoriyalarga ishora qiladi (masalan "B. Оила ва никоҳ
муносабатлари", "Юқори инстанция"). Ular faqat **qidiruv** orqali topiladi.

### Kerak

Yo o'sha barg kategoriyalar 4 ta umumiy yo'nalishga biriktirilsin, yo o'sha
23 ta xizmatning category_id si umumiy yo'nalishga o'zgartirilsin. Hozircha
eng qimmat 24 ta xizmat mijozga amalda ko'rinmayapti.

---
## 18–23. MD auditidan chiqqan qo’shimcha so’rovlar

Yettala MD ni har bir talabi bo’yicha kodga solishtirib chiqish natijasida
frontend o’zi yopa olmaydigan **26 ta** masala chiqdi. Har biri bugun
production’da read-only so’rov bilan tekshirilgan.

### 18. To’lov darvozasi (payment gate) (4 ta)

- A GET THAT RETURNS THE PAYMENT GATE. Verified read-only on production 2026-09-29 with the test client: GET /document-requests/{id} answers 26 fields (answers, auto_confirm_payment, client_user_id, contract_file, contract_id, created_at, currency, document_type, id, order_id, paid, payment_id, payment_status, price, price_tiyin, questionnaire, rating, rating_available, rating_deadline_at, rating_submitted, requires_payment, status, template_id, title, updated_at, work_id) and carries NO payment_gate, NO payment_required, NO page_count and NO lawyer_request; the list rows are thinner still (id, template_id, title, status, price, price_tiyin, currency, created_at). Consequence: after one reload the client cannot see the amount they are being asked to pay, how it was computed, or whether the Telegram request was even sent. Needed shape, on GET /document-requests/{id} (and ideally echoed on the list row as a boolean): "payment_required": true, "payment_gate": { "id": str, "status": "pending"|"approved"|"cancelled", "payment_id": str, "amount": int (so'm), "currency": "UZS", "page_count": int, "included_pages": int, "extra_pages": int, "telegram_sent": bool, "created_at": iso }. Same keys the POST already returns (MD L93-111) — the frontend reads it through one normaliser, so an identical shape costs us nothing.

- NAME THE REALTIME EVENT AND ACTUALLY SEND IT. MD L140-154 promises document_request.pool_created (backend) and document_request.sent (client) after an approval, and says nothing at all about the reject path. Measured: 300 notifications on this account carry 15 distinct data.event values — document_lawyer_request_sent/claimed/ready, document_request_created/file_ready/meeting_created, meeting_invite, subscription_purchase_rejected and the urgent_advokat.* family — and NOT ONE gate event, under either the dotted or the underscored spelling. The socket filter now accepts document_request.sent, .pool_created and .payment_cancelled; please confirm those three names (and add a cancel event if none exists), otherwise the client only leaves the waiting screen via the 15s poll or the manual refresh button.

- TELL US WHAT page_count THE BACKEND ACTUALLY USED. When the client leaves the field empty on review-existing the backend derives the count itself (MD L81-84), but neither the request record nor the gate response tells the client which number was used — so a 20-page DOCX quoted from a 2500-chars-per-page estimate is a bill with no explanation. page_count in the gate response covers the gated case; please also expose the derived count when NO gate opens.

- IS THERE A WAY TO RESTART A CANCELLED PAYMENT? MD L167 says a 're-open the payment' button 'may' be offered, but no endpoint exists for it, so the cancelled card only offers a fresh send of the whole request. If a restart endpoint is intended, name it and we will wire it to that card.

### 19. Konstruktor va advokat ushlagan hujjat (4 ta)

- Send `document_constructor_continue_prompt` with `service_id` in `data`, the way `document_lawyer_request_sent` already does. §6 L144-155 lists document_request_id, lawyer_request_id, template_id and the four constructor URLs but no service_id — and the page that opens the constructor is keyed on the service, so without it the frontend has to resolve the service from template_id via /services/search. One field removes two round trips per tap.

- Confirm (or open) the write side of the held row's constructor: is PATCH /document-requests/{id}/answers — and POST …/generate — accepted while that row's status is lawyer_review and a lawyer_request is active? §3 hands the client those URLs, but they cannot be exercised read-only and a refusal there would leave the "Ha" path filling a form that cannot be saved.

- The held row's `answers` is the advocate-request envelope ({mode, need, answers:{}, language}) rather than a field map, while the constructor's own rows store answers flat. The frontend unwraps it, but one shape for one field would remove the guesswork.

- Consider putting lawyer_request_active / can_send_lawyer_request / lawyer_request_block_reason / constructor_action on GET /document-requests/{id} too: every screen that resumes a single request has to page the service-flow list just to learn whether an advocate holds that one row.

### 20. Tezkor advokat — fayl va ovoz (2 ta)

- A client-facing upload route for urgent attachments (MD L42, "kerak bo'lsa file va voice message"). POST /urgent-advokat/requests already accepts files[] / voice_messages[] as [{name, url, size, content_type, duration_seconds}], but a client cannot produce `url`: /workspace/files is 403 for role client ("Workspace faqat advokat va yuristlar uchun") and there is no other upload endpoint a client token can reach (probed GET-only: /files/upload, /uploads, /media/upload, /urgent-advokat/uploads, /document-services/uploads all 404). Either (a) POST /urgent-advokat/uploads, multipart, fields `files` and `voice_files`, open to role client, answering [{id, name, url, size, content_type, duration_seconds}] ready to paste into the request body — the same objects the record echoes back in payload.files today; or (b) let POST /urgent-advokat/requests itself take multipart/form-data with `files` and `voice_files` parts beside the JSON fields, exactly as /document-services/requests/custom already does (that route is what AttachmentPicker + lib/voiceRecorder feed today). Either one and the picker drops straight into the configurator.

- Please also set supports_files / supports_voice on second_opinion_group in GET /urgent-advokat/catalog — it is the one service MD L42 is written about, and it is currently the only consultation kind whose catalog entry declares neither, so the client screen has nothing to key the affordance off.

### 21. Guruh chat (5 ta)

- A secure-chat room cannot say who is in it. GET /secure-chats/{id} → 405, GET /secure-chats/{id}/participants → 404, and the /secure-chats rows carry only client_user_id / seller_user_id / order_id / case_id / status / auto_delete_hours / archived_until. MD L255 asks the header for "participantlar soni", so the frontend has to fetch the urgent record and count people. Please put participants (or at least a count) on the room row.

- MD L203-207 says the room goes `completed` when the chat is completed. It does not: room f43fa109-14dc-4c74-a107-d885a523e5d6 still reads status "active" although records 77ada6f5 (second_opinion_group) and eba06e95 (chat_consultation) are both `completed`. Either flip the room, or tell us the room is deliberately shared and the record is the only authority — the frontend currently assumes the latter.

- One room hosts many records: fifteen of this test client's urgent requests point at room f43fa109. Nothing on the room says which record is the live one, so the inbox has to guess (we prefer a record that is not in a final status, then the newest). Please expose the urgent record id — or the list of them — on the secure-chat row, and ideally create a dedicated room per group panel as the MD's flow describes.

- Confirmation needed that completing a chat BROADCASTS its closing `result` message on /ws/secure-chats/{room_id}. The message is certainly created (captured in the history: message_type "result", meta.urgent_advokat_request_id, meta.source "tezkor_advokat"), and the client's open tab now listens for exactly that frame to learn the consultation ended; if it is not broadcast, the client only finds out on reload or on a 409.

- POST /auth/login for the shared test client (+998900000005) answers 429 "Urinishlar limiti tugadi" after a handful of logins and stayed locked for ~5 minutes. Every headless verification run logs in once, so parallel workpackages lock each other out. A test-only exemption, or a longer-lived token for the QA accounts, would make verification runs reliable.

### 22. Qo’ng’iroq sifati va to’lovli uzaytirish (5 ta)

- THE BLOCKER for C8: there is no client-facing endpoint to answer a paid extension. Please add one — e.g. PATCH /secure-chats/{room_id}/calls/{call_id}/extension-payment-request with a CLIENT token and body {"approved": true|false} (or {"request_id": "<pending_extension_request.id>", "approved": bool}), returning the updated CallSessionOut: on approve paused=false with a new auto_end_at, on reject paused=false with the original remaining time. Proved absent read-only on 2026-09-29: .../extension-payment-request answers 405 Allow: POST (host only) while every candidate answer path 404s (list in `verification`). LEXGO_MEETING_EXTENSION_FRONTEND_UPDATE.md L79 confirms the answer is a Telegram inline callback today. Until this exists the client's Tasdiqlash/Rad etish button cannot settle the payment — see notDone.

- Confirm that `pending_extension_request` actually carries `expires_at`. The five-minute countdown FULL_DOCS §23 asks for reads it first and falls back to `pause_expires_at`; neither could be observed, because reaching a paused call needs a POST. If `expires_at` is absent the clock silently falls back, and if both are absent it is hidden.

- A realtime frame for the client's answer — e.g. `call.payment_extension_client_answered` on /ws/users/me with {call_id, request_id, approved}. Today the client's in-app answer reaches the advocate only over the LiveKit data channel, so it misses an advocate who is mid-reconnect or has the room closed.

- Put a payment URL or Telegram deep link on `pending_extension_request` (e.g. `payment_url` / `telegram_url`). The client's confirm button currently has to TELL them to go find the bot; with a link it could take them straight to the payment, which is the difference between a 5-minute window met and missed.

- Minor, but it cost time: /openapi.json, /api/openapi.json, /docs and /redoc are all 404 on lexgo.api.cognilabs.org, so the only read-only way to tell a missing route from an existing one is 404-vs-405 probing. Exposing the schema (even behind auth) would make this kind of verification cheap.

### 23. Advokat muharriri (6 ta)

- §14 has NO endpoint. editor_mode is a CLIENT request-creation field (POST /services/{id}/document-lawyer/request etc.); there is nothing an advocate can call to say 'open this one from my upload / from the client's file / from an AI draft'. Please add e.g. POST /lawyers/me/document-requests/{record_id}/editor/source {"editor_source": "blank|uploaded_docx|client_file|ai_draft"} and document the accepted values. Until it exists the chooser routes locally and sends nothing.

- Publish the REAL editor_mode / editor_source enums. Production has only ever stored editor_mode "lawyer_editor" and "ai_draft" (measured over the 50 newest requests, 2026-09-29); §14 L537-545's "Tavsiya enum" [upload_file, client_file, ai_draft] does not match, and an earlier pass in this repo already got 422s sending client_file/upload_file. Either accept the documented values or correct §14.

- editor_source is invisible to the frontend. lexgo_frontend_custom_doc_flows.md L32/L61-65 says the backend sets lawyer_request.editor_source=blank|uploaded_docx, but it is absent from every client-readable payload (all 50 requests checked) and it is not on the service-flow lawyer_request block. Please expose it on GET /lawyers/me/document-requests and on the editor response so the chooser can name which file the editor will actually hold instead of inferring it from answers.editor_mode.

- Expose editor_block_reason and system_editor_supported on GET /lawyers/me/document-requests (list AND detail), not only inside the editor response. Today the list has no reason at all, so a locked inbox row can only show a generic sentence; and reading them for the single-record workspace costs an extra raw GET of the detail endpoint (see notDone).

- Say whether GET /lawyers/me/document-requests/{id}/editor is idempotent. If a second GET mints a new session_id / OnlyOffice document key, several fields §15 lists (system_editor_supported, file.public_editor_url) are effectively unreadable by any client that already fetched the session once. If it IS idempotent, say so and I will read them from a second call.

- There is no advocate-side 'give me an AI draft now' endpoint. §14 option 3 can only ever be an accomplished fact set by the client at request time. If the advocate is supposed to be able to ask for one, that endpoint needs to exist.

---


## Bugun tekshirilgan va to'g'ri ishlaydigan narsalar

Bular **ishlaydi**, shuning uchun tegilmasin:

| Endpoint | Holat |
|---|---|
| `POST /auth/login` (klient, 2FA'siz) | 200 |
| `GET /urgent-advokat/catalog` | 200 — 6 xizmat, 1 guruh (`second_opinion`) |
| `GET /urgent-advokat/requests/me` | 200 — 40 yozuv |
| `GET /services?catalog_only=true&limit=500` | 200 — 497 xizmat |
| `GET /document-templates?limit=500` | 200 — 988 shablon |
| `GET /service-categories` | 200 — 4 kategoriya |
| `GET /services/{id}/document-fields` | 200 — `ai_flow` va `lawyer_flow` bilan |
| `GET /services/{id}/document-template/clean` | 200 |
| `GET /document-requests` | 200 — 114 yozuv |
| `GET /document-requests/{id}` | 200 |
| `GET /document-requests/service-flow?mode=…&status=…` | 200 — `mode` va `status` filtrlari ishlaydi |
| `GET /secure-chats` | 200 — 22 suhbat |
| `GET /secure-chats/{id}/messages` | 200 |
| `GET /document-services/request-document-types` | 200 |

Eslatma: `service-flow` da `limit=200` → **422**. Maksimal limit 50 ga
o'xshaydi; hujjatda aniq yozilsa yaxshi bo'lardi.

---

## Xulosa

Eng muhim uchtasi:

1. **Bir hujjatga ikkita advokat so'rovi** — GM so'ragan qoida serverda yo'q
   (1-band). Frontend uni brauzerda qo'ydi, lekin API ochiq.
2. **"LexGo Call Center Lawyer"** — GM "bu so'z mutlaqo ishlatilmasin" dedi,
   lekin u advokat akkauntining bazadagi ismi (2-band).
3. **Katalog nomlari** — ekranda yashirildi, lekin bazada iflosligicha
   qolyapti; `(1)`/`(2)` juftliklariga haqiqiy nom kerak (3-band).

Qolganlari frontendni to'sib turmaydi — ishlaydi, lekin kontrakt
noaniqligicha qolyapti.
