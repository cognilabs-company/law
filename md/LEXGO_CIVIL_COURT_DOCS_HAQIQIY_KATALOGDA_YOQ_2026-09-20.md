# "36 ta hujjat tuzatildi" — lekin haqiqiy katalogga ulanmagan + matn ichida hali ham xato joylashgan

**Sana:** 2026-09-20
**Kimga:** backend dasturchi
**Asos:** bugun yuborilgan `LEXGO_CIVIL_COURT_DOCS_FIELDS_FIX_2026-09-20.md` ("36 ta real fuqarolik-sud document template qayta tekshirildi... Productionda tekshirildi... Frontend tarafdan qo'shimcha kod o'zgartirish shart emas").

Bu xabarga ishonib, **productionga jonli, autentifikatsiyasiz so'rovlar bilan to'liq tekshirib chiqdim** (login ma'lumotlarim yo'q, shuning uchun frontend orqali emas, to'g'ridan-to'g'ri API orqali). Natija: ikkita alohida, jiddiy muammo bor — biri "qayerda" (reachability), biri "nima" (kontent sifati).

## Muammo 1 (asosiy): Tuzatilgan 36 ta hujjat haqiqiy, mijozlarga ko'rinadigan katalogga umuman ulanmagan

`GET /services` (frontend `getServices()` xuddi shuni chaqiradi, boshqa hech qanday parametrsiz) hozir **149 ta xizmat** qaytaradi — va ularning **bittasida ham** `document_template_id` bo'sh emas:

```bash
curl -s "https://lexgo.api.cognilabs.org/services" | # 149 ta element
# document_template_id qiymatlari: hammasi null (0 ta boshqacha)
```

Bundan tashqari, `document-fields` orqali fieldlari to'g'ri qaytayotgan xizmatlarni (`FIELDS_FIX` hujjatida ko'rsatilgan misollar) `/services/{id}` orqali to'g'ridan-to'g'ri ochishga urinsam — **404**:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  "https://lexgo.api.cognilabs.org/services/e6291b5a-79b7-4386-88b6-46f6f81291d4"
→ 404

curl -s "https://lexgo.api.cognilabs.org/services/e6291b5a-79b7-4386-88b6-46f6f81291d4/document-fields"
→ 200, field_count: 21   (o'zi ishlaydi, lekin xizmat sifatida "yo'q")
```

Bu holat men tekshirgan barcha 4 ta namunada bir xil (Meros, Jinoyat, Aliment, Ish haqi undirish):

| Xizmat | ID | `/services/{id}` | `document-fields` |
|---|---|---|---|
| Meros bo'lgan mol-mulkni bo'lish | `e6291b5a-...` | 404 | 200, 21 field |
| Jinoyat natijasida yetkazilgan zarar | `c193ef8b-...` | 404 | 200, 17 field |
| Aliment qarzdorlikdan ozod etish | `2a389cc1-...` | 404 | 200, 18 field |
| Ish haqini undirish | `59c8931c-...` | 404 | 200, 23 field |

`document-preview`ning javobidagi ichki `service` obyektiga qarasam, sabab aniq bo'ldi: bu 4 tasining hammasi **bir xil sekundda, ayni bir seed skriptida yaratilgan test yozuvlari**, va **hozirgi haqiqiy katalogda mavjud bo'lmagan kategoriyalarga** tegishli:

```json
"service": {
  "id": "e6291b5a-79b7-4386-88b6-46f6f81291d4",
  "created_at": "2026-09-19T12:35:22.979551Z",
  "category_title": "Oilaviy va meros nizolari",
  "category_id": "314aade6-6311-4081-af65-70f26e44df9a",
  "is_active": true
}
```

- Barcha 4 tasi `created_at`: `2026-09-19T12:35:22.9...Z` — **bir soniya farq bilan**, ya'ni qo'lda emas, bitta bulk-seed skripti bilan yaratilgan.
- Kategoriyalari (`Oilaviy va meros nizolari`, `Mehnat nizolari`, `Boshqa fuqarolik nizolari`) hozirgi haqiqiy `/services` javobidagi **31 ta kategoriyaning hech birida yo'q** (haqiqiy katalogda: `D. Мерос`, `C. Меҳнат ҳуқуқи`, `A. Фуқаролик ҳуқуқи`, `I. Суд ишлари` va h.k. — boshqa nomlar, boshqa ID'lar).
- `category_id=314aade6-...` bo'yicha filtrlab so'rasam ham (`/services?category_id=314aade6-...`) — **0 ta natija**.

**Xulosa:** kecha (2026-09-19) fields muammosi haqida xabar berilgach, kimdir buni tuzatish uchun **alohida, izolyatsiya qilingan test to'plami** (yangi 36 ta "shadow" xizmat + yangi kategoriyalar) yaratgan, o'sha yerda ishlagan va bugun **o'sha test to'plamini** "production" deb tekshirib chiqqan. Lekin haqiqiy, mijozlar `Xizmatlar → kategoriya → xizmat` orqali ko'radigan asl 36 ta xizmat (masalan asl "Aliment bo'yicha qarzdorlikni to'lashdan ozod etish bo'yicha" — kechagi xabardagi original ID) hamon `document_template_id = null` holida qolmoqda — men buni asl ID orqali ham qayta tekshirdim, hozir ham 404/bog'lanmagan.

Bu **aynan kecha frontendda ko'rilgan xatoning o'zi qaytadan takrorlanishi**: mijoz productionda xizmatni bossa, hech narsa o'zgarmagan — chunki tuzatish real xizmat yozuviga emas, faqat testda yaratilgan nusxaga tegishli bo'lib qoldi. ("bu test-ku, haqiqiy hujjatda sinalishi kere" — aynan shu holat yana takrorlandi, endi butun bir soxta kategoriya darajasida.)

## Muammo 2: hatto shu test nusxalarining o'zida ham matn ichidagi joylashuv ko'p joyda mazmunan noto'g'ri

Bu ikkinchi, mustaqil muammo — birinchisi hal qilinganda ham bu qoladi.

`document-preview`ga barcha 21 ta Meros fieldini haqiqiy qiymat bilan to'ldirib yuborilgan natija (`final_text`, qisqartirilgan):

```text
Мен даъвогар (Ф.И.Ш) Karim Valiyevйилда туғилганман. Отам
2025-01-15(Ф.И.Ш)3-xonali kvartira19___йил Toshkent sh., Chilonzor, 12-uyда туғилиб,
205-sonli notarial idora йил Guvohnoma No. 123да, онам
Ali va Vali(Ф.И.Ш)Chet elda bo'lgan 19___йил Vasiyatnoma yo'qда туғилиб, ...
```

Muammolar:

1. **Fieldlar mazmunan mos kelmaydigan joylarga qo'yilgan.** "Мен даъвогар (Ф.И.Ш) ___йилда туғилганман" (da'vogarning tug'ilgan yili) o'rniga `{{deceased_full_name}}` (marhumning F.I.Sh.) qo'yilgan. Otasi/onasining tug'ilgan/vafot yillari o'rniga `death_date`, `inheritance_property`, `notary_office`, `notary_document_details`, `heirs_info`, `missed_deadline_reason`, `will_details`, `share_distribution_request`, `claim_request` kabi butunlay bog'liq bo'lmagan fieldlar tasodifiy tartibda joylashtirilgan — natijada butun paragraf o'qib bo'lmaydigan holga kelgan.
2. **Matn oxirida boshqa bir hujjatning qismi ulanib qolgan.** `"-----------------------"` chizig'idan keyin butunlay yangi, ikkinchi bir andoza boshlanadi ("Фуқаролик ишлари бўйича {{court_name}} туманлараро судига Даъвогар: ...") — bu Meros ariza matnining davomi emas, alohida umumiy sarlavha shabloni bo'lib, tasodifan bitta `template_text`ga qo'shilib ketgan ko'rinadi.
3. **Ko'plab xom `________` chiziqlar hali ham o'zgarishsiz qolgan** — masalan "опам ________(Ф.И.Ш)____________", "укам _________(Ф.И.Ш)_________", "__________нафар фарзанд", "________ туман ҳокимининг ________даги ____-сонли қарори" va yana o'nlab joylar. Bularning hech biri fieldga aylantirilmagan (`FIELDS_FIX` hujjatida "matnda ishlatilmagan fieldlar ham mazmunli qo'shildi" deyilgan edi — aslida ko'p joy hali xom chiziq bo'lib qolmoqda).
4. Xuddi shu naqsh "Jinoyat natijasida yetkazilgan zarar" hujjatida ham bor (kichikroq ko'lamda): `{{damage_description}}` (zarar tavsifi) voqea joyi ("___ маҳалласи") o'rnida, `{{evidence_list}}` (dalillar ro'yxati) pul summasi o'rnida, `{{claim_request}}{{claimant_email}} {{defendant_email}}` esa sana/imzo qatorida ketma-ket yopishtirilgan holda chiqadi.

To'liq preview javobi (barcha 21 field, `final_text`, `placeholder_mapping`) skratchpadda saqlangan — kerak bo'lsa yuboraman.

## Kerak bo'lgan narsa

1. **Ulash (reachability):** tuzatilgan `template_text`larni yangi test-kategoriyadagi xizmatlarga emas, **haqiqiy, `/services` javobida ko'rinadigan, mijozlar ishlatadigan asl 36 ta xizmat yozuviga** (`document_template_id` ustuni orqali) ulash. Eng oson yo'l — shu ishlangan `template_text`larni asl template ID'lariga (masalan "Aliment..." uchun kechagi xabardagi asl ID) ko'chirish, yangi test xizmat/kategoriyalarni esa production'dan o'chirib tashlash.
2. **Kontent sifati:** har bir field mazmunan mos keladigan joyga qayta joylashtirilishi kerak (mexanik/tasodifiy emas — semantik moslikka qarab). Meros hujjatidagi `"-----------------------"`dan keyingi begona qism olib tashlanishi kerak. Qolgan xom `________` chiziqlar ham yo fieldga aylantirilishi, yo umuman olib tashlanishi kerak.
3. Bu safar tekshiruv **haqiqiy `/services` ro'yxatida ko'rinadigan ID orqali** qilinishi kerak (`curl https://lexgo.api.cognilabs.org/services` natijasida `document_template_id` bo'sh bo'lmagan qatorlar chiqishi kerak) — testga alohida yaratilgan nusxa orqali emas.

## Frontend holati

O'zgarishsiz — tayyor va sinovdan o'tgan. Bu safargi muammoning ikkalasi ham (ulash + kontent) butunlay backend/ma'lumotlar tarafida; frontendda hech narsa o'zgartirish shart emas.
