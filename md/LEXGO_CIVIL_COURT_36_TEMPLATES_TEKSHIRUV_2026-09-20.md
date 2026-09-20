# 36 ta shablon — katta yutuq bor, lekin bitta yangi, aniq nuqson qoldi (barcha 36 tasida)

**Sana:** 2026-09-20
**Kimga:** backend dasturchi
**Asos:** bugun yuborilgan `LEXGO_CIVIL_COURT_36_TEMPLATES_FIXED_2026-09-20.md`

Productionga mustaqil so'rov yuborib, barcha 36 ta hujjatni skript bilan va 2 tasini (Meros, Jinoyat) to'liq qo'lda o'qib tekshirdim.

## ✅ Bu safar haqiqatan katta yutuq bor — tasdiqlandi

- `GET /services` — 185 ta, 36 tasida `document_template_id` (o'zgarmagan, ishlayapti).
- **36/36 hujjatda endi xom `________` chiziq YO'Q** va **begona/dublikat shablon parchasi YO'Q** — bugun avtomatik skript bilan hammasini tekshirdim, natija: `36 clean, 0 dirty` (kechagi tekshiruvda 12 tasida muammo bor edi).
- **Asosiy matn endi chindan mazmunli va grammatik to'g'ri.** Masalan Jinoyat hujjatida endi: *"Зарар етказилган ҳодиса {{incident_date}} санада {{incident_place}} жойда содир бўлган. Зарар тавсифи: {{damage_description}}. Зарар миқдори: {{damage_amount}} сўм."* — bu safar har bir field o'ziga mos joyda, avvalgi "dalillar ro'yxati summa o'rnida" kabi xatolar yo'q. Bu — oldingi ikkita hisobotimda ko'rsatilgan eng jiddiy muammoning haqiqatan tuzatilgani.

Rahmat — bu qism uchun qo'shimcha ish kerak emas.

## ❌ Yangi, universal muammo: har bir hujjatda fieldlarning 60–80% i asosiy matnga emas, faqat oxiridagi "yorliq: qiymat" ro'yxatiga tashlab qo'yilgan

Yangi yozuv usuli shunday: hujjat boshida (sud/da'vogar/javobgar) va o'rtada qisqa, 4–7 ta fieldli **haqiqiy, mazmunli abzats** bor (yaxshi!) — lekin undan keyin hujjat oxirida **hamma qolgan eski fieldlar** oddiy ro'yxat qilib tashlab qo'yilgan:

```text
...
Ariza sanasi: {{application_date}}.
Suddan so'ralayotgan talab: {{claim_request}}.
Vafot etgan sana: {{death_date}}.
Merosxo'rlar haqida ma'lumot: {{heirs_info}}.
Muddat o'tkazib yuborilgan sabab: {{missed_deadline_reason}}.
Notarial hujjat rekvizitlari: {{notary_document_details}}.
Notarial idora nomi: {{notary_office}}.
Meros mulk manzili: {{property_address}}.
Meros ulushlarini bo'lish talabi: {{share_distribution_request}}.
Vasiyatnoma rekvizitlari: {{will_details}}.
```

(Bu — CIV-011 "Meros" hujjatining oxiri, so'zma-so'z.) Bu safar hech biri grammatik jihatdan buzuq emas (har biri to'g'ri gap), lekin bu **sudga topshiriladigan hujjat emas, texnik ma'lumotlar varag'iga** o'xshaydi — 10 qatorlik "Yorliq: qiymat." ro'yxati bilan tugaydigan ariza professional ko'rinmaydi.

Men buni skript bilan **barcha 36 ta hujjatda** tekshirdim — **36/36 tasida** xuddi shu naqsh bor:

| Kod | Jami field | Shundan "oxirgi ro'yxat"da | Asosiy matnda ishlatilgan |
|---|---|---|---|
| CIV-004 (Ish haqini undirish) | 33 | **26** | 7 |
| CIV-008 (Ishga tiklash) | 37 | **26** | 11 |
| CIV-011 (Meros) | 29 | **23** | 6 |
| CIV-009 (Jinoyat) | 21 | **16** | 5 |
| CIV-013 (Mol-mulkka zarar) | 20 | **15** | 5 |
| ...va qolgan 31 tasi | | o'rtacha ~75% | ~25% |

To'liq raqamlar (barcha 36 ta) skratchpadimda saqlangan, kerak bo'lsa yuboraman.

### Bundan ham jiddiyrog'i: ba'zi "oxirgi ro'yxat"dagi fieldlar asosiy matnda ALLAQACHON ishlatilgan fieldning DUBLIKATI

CIV-011 "Meros" hujjatida buni aniq ko'rish mumkin — field ro'yxatining o'zida ikkita alohida field bor:

- `deceased_death_date` ("Вафот этган сана") — asosiy matnda to'g'ri ishlatilgan: *"Мерос қолдирувчи {{deceased_full_name}} {{deceased_death_date}} санада вафот этган."*
- `death_date` ("Vafot etgan sana") — bu **xuddi o'sha ma'lumot**, lekin alohida field sifatida oxirgi ro'yxatga tashlab qo'yilgan: *"Vafot etgan sana: {{death_date}}."*

Xuddi shunday: `claim_requests` (asosiy matnda) va `claim_request` (oxirgi ro'yxatda) — ikkalasi ham "suddan so'ralayotgan talab" degani, faqat biri ko'plik, biri birlik nomlangan. Natijada **mijoz bitta haqiqatni ikki marta, ikkita boshqa-boshqa maydonga yozishi kerak bo'ladi** — bu chalkashtiradi va formani keraksiz uzaytiradi.

## Kerak bo'lgan narsa (bu safar ancha kichik va mexanik ish)

Har bir 36 ta hujjat uchun:

1. **Dublikat fieldlarni birlashtiring.** Agar oxirgi ro'yxatdagi field asosiy matndagi biror fieldning ma'nosi bilan bir xil bo'lsa (masalan `death_date` ↔ `deceased_death_date`, `claim_request` ↔ `claim_requests`) — dublikatni field ro'yxatidan butunlay olib tashlang, faqat bittasini qoldiring.
2. **Qolgan, haqiqatan kerakli, lekin oxirgi ro'yxatda qolib ketgan fieldlarni asosiy matn ICHIGA, mos gapga joylashtiring** — ro'yxat qilib emas (xuddi `incident_date`/`damage_description` uchun bu safar to'g'ri qilingani kabi). Masalan CIV-011da `notary_office`, `notary_document_details`, `property_address`, `heirs_info`, `will_details`, `missed_deadline_reason`, `share_distribution_request` — bularning har biri meros arizasida haqiqatan kerakli ma'lumotlar, ular uchun asosiy matnda tabiiy gap tuzilishi kerak (masalan: *"Мерос мулки {{property_address}} манзилида жойлашган. {{notary_office}} {{notary_document_details}} рекизитли ҳужжат берган. Меросхўрлар: {{heirs_info}}."* kabi).
3. Agar biror field haqiqatan ortiqcha bo'lsa (hech qanday ma'noga ega bo'lmasa) — uni field ro'yxatidan olib tashlang, "Label: {{field}}." qatorini emas.

Bu safar ish ancha kichik: grammatikani qayta yozish shart emas (asosiy matn allaqachon to'g'ri), faqat **oxirgi "ro'yxat" qismini olib tashlab, undagi haqiqatan kerakli fieldlarni asosiy matn ichiga ko'chirish**, dublikatlarni esa butunlay o'chirish kifoya.

## Tekshirish uchun tayyor skript

```bash
# Har bir hujjatda "Label: {{field}}." ko'rinishidagi tashlab qo'yilgan qatorlar sonini hisoblaydi — 0 bo'lishi kerak.
for id in <36 ta service_id>; do
  curl -s "https://lexgo.api.cognilabs.org/services/$id/document-template" \
    | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s);const t=j.template.template_text;const n=(t.match(/^[^\n{]{3,60}:\s*\{\{\w+\}\}\.?$/gm)||[]).length;console.log('$id dumpLines=',n)})"
done
```

## Frontend holati

O'zgarishsiz. Bu butunlay backend/kontent ishi — frontend `fields` massivini o'zgarishsiz oladi va formani chizadi, qaysi fieldlar borligi va matn ichida qanday joylashgani frontendga bog'liq emas.
