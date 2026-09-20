# Katalog ulanish muammosi haqiqatan tuzatilgan — lekin kontent nuqsonlari hali ham 100% o'zgarishsiz

**Sana:** 2026-09-20
**Kimga:** backend dasturchi
**Asos:** bugun yuborilgan `LEXGO_CIVIL_COURT_CATALOG_FIX_2026-09-20.md`, javoban `LEXGO_CIVIL_COURT_DOCS_HAQIQIY_KATALOGDA_YOQ_2026-09-20.md`ga.

Productionga to'g'ridan-to'g'ri (autentifikatsiyasiz) so'rovlar bilan mustaqil tekshirdim.

## ✅ Tasdiqlangan — bu qism haqiqatan tuzatilgan

`GET /services` endi **185 ta** xizmat qaytaradi, va ulardan **36 tasida** `document_template_id` bor hamda haqiqiy `catalog_code` (`CIV-001`...`CIV-036` uslubida) biriktirilgan — kecha bu 36 tasi butunlay boshqa, katalogdan tashqari "shadow" yozuvlar edi, endi haqiqiy, faol katalogning bir qismi:

```bash
GET /services  → 185 ta, document_template_id bor: 36 ta, hammasi is_active:true, catalog_code bor
GET /services/search?q=tes&limit=50  → 0 ta natija (test/demo tozalangan)
```

Bu — mijoz "Xizmatlar → kategoriya → xizmat" orqali bosganda endi HAQIQIY shu 36 ta hujjatga chiqishi mumkinligini anglatadi. Katta, real muammo hal bo'ldi — rahmat.

## ❌ Tasdiqlanmadi — kontent nuqsonlari BAYTMA-BAYT o'zgarishsiz qolgan

Hisobotda "Almashtirilmagan `{{...}}` token qolmagan" deyilgan. Bu **texnik jihatdan to'g'ri** (mustache tokenlari hammasi joyida), lekin bu hujjat matni **to'g'ri/o'qilishi mumkin** degani emas. Men avvalgi hisobotimda (`..._HAQIQIY_KATALOGDA_YOQ_...md`) saqlab qo'ygan xom matn bilan bugungisini solishtirdim — ikkalasi ham **so'zma-so'z bir xil**:

```bash
diff meros_text_kecha.txt meros_text_bugun.txt   → IDENTICAL (0 farq)
diff jinoyat_text_kecha.txt jinoyat_text_bugun.txt → IDENTICAL (0 farq)
```

Ya'ni `template_text`ning o'ziga kecha hisobot yozganimdan beri **hech qanday o'zgartirish kiritilmagan** — faqat ularni katalogga ulash ishlangan. Demak avvalgi ikkita aniq nuqson ham hali productionda turibdi:

1. **Meros hujjatida ("Meros bo'lgan mol-mulkni bo'lish", `e6291b5a-...`):**
   - Matn ichida hali **42 ta xom `________` chiziq** bor (`opam ________(Ф.И.Ш)____________`, `19___йил ______да` va h.k.) — bularning hech biri `{{field}}`ga aylantirilmagan.
   - `"-----------------------"` chizig'idan keyin **butunlay boshqa, aloqasiz ikkinchi bir shablon parchasi** hali ham matnga yopishib turibdi (umumiy sarlavha andozasi — "Фуқаролик ишлари бўйича {{court_name}}... Юридик шахс:...").
   - Fieldlar semantik jihatdan hali ham noto'g'ri joylarda: masalan `{{deceased_full_name}}` (marhumning ismi) da'vogarning O'ZINING tug'ilgan yili yoziladigan joyga qo'yilgan ("Мен даъвогар (Ф.И.Ш) {{deceased_full_name}}йилда туғилганман").
2. **Jinoyat hujjatida ("Jinoyat natijasida yetkazilgan zarar", `c193ef8b-...`):** `{{evidence_list}}` (dalillar ro'yxati) pul summasi yozilishi kerak bo'lgan joyda, `{{damage_description}}` voqea joyi (mahalla nomi) o'rnida, `{{claim_request}}{{claimant_email}} {{defendant_email}}` esa sana/imzo qatorida ketma-ket yopishtirilgan holda chiqmoqda.

To'liq misollar va tavsiya qilingan to'g'ri matn tuzilishi avvalgi ikkita hisobotda (`LEXGO_CIVIL_COURT_DOCS_FIELDS_QISMAN_TOGRI_2026-09-20.md` va `LEXGO_CIVIL_COURT_DOCS_HAQIQIY_KATALOGDA_YOQ_2026-09-20.md`) bor — ular hali ham to'liq amal qiladi, chunki matn o'zgarmagan.

**Men faqat 2 tasini (Meros, Jinoyat) qayta tekshirdim** — qolgan 34 tasi ham xuddi shu avtomatik jarayon bilan yaratilgani sababli, ularda ham xuddi shu ikki turdagi nuqson (xom chiziqlar + semantik noto'g'ri joylashuv) bor deb taxmin qilish o'rinli, lekin bu tasdiqlanmagan — hammasini birma-bir tekshirish kerak.

## Kerak bo'lgan narsa

Katalog ulanishi endi tayyor — qolgan yagona ish avvalgi ikkita hisobotda ko'rsatilgan **kontent** tuzatishini haqiqatan amalga oshirish: har bir `{{field}}`ni mazmuniga mos joyga qo'yish, qolgan xom `________` chiziqlarni fieldga aylantirish yoki olib tashlash, va Merosdagi begona ikkinchi shablon parchasini butunlay o'chirish. Bu barcha 36 ta hujjatda (nafaqat 2 tasida) qilinishi kerak.

## Frontend holati

O'zgarishsiz — tayyor va sinovdan o'tgan. Katalog ulanishi tufayli endi frontend haqiqatan shu 36 ta hujjatga real foydalanuvchi orqali yetib boradi (bu ijobiy yangilik), lekin hujjat matni tuzatilmaguncha, mijoz sudga topshiradigan yakuniy hujjatda hamon bo'sh chiziqlar va noto'g'ri joylashtirilgan ma'lumotlar chiqaveradi.
