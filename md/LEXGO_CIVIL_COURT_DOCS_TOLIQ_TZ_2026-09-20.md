# Fuqarolik-sud hujjatlari (36 ta) — ishlashi uchun kerak bo'lgan TO'LIQ va YAKUNIY ish ro'yxati

**Sana:** 2026-09-20
**Kimga:** backend dasturchi
**Bu hujjat oldingi 3 ta hisobotni (`..._FIELDS_KERAK`, `..._FIELDS_QISMAN_TOGRI`, `..._HAQIQIY_KATALOGDA_YOQ`, `..._CATALOG_FIX_TEKSHIRUV`) almashtiradi** — ularni qayta o'qish shart emas, hammasi shu yerda birlashtirilgan, yakuniy holatda.

Frontendda hech narsa qilinmaydi/qilinmaydi. Bu 100% backend/kontent ishi. Maqsad: shu hujjatdagi ro'yxat bajarilgach, muammo **butunlay yopiladi**.

---

## 1. Hozirgi holat (bugun, productionda mustaqil tekshirilgan)

✅ **Ulanish muammosi hal qilingan.** `GET /services` endi 185 ta xizmat qaytaradi, ulardan 36 tasida (`CIV-001`...`CIV-036`) `document_template_id` va `catalog_code` bor, hammasi `is_active:true`. Test/demo xizmatlar `/services` va `/services/search`dan yo'qolgan. **Bu qismni qayta qilish shart emas — ishlayapti.**

❌ **Hali qolgan yagona muammo — 36 ta hujjatning matni (`template_text`) ichidagi kontent sifati.** Har bir hujjatda `fields` massivi to'g'ri (bo'sh emas, backend tomonidan aniqlangan), lekin **fieldlarning matn ICHIDAGI joylashuvi** ikkita alohida nuqson bilan buzilgan:

### Nuqson A — "Xom chiziqlar" (avtomatik tekshirib bo'ladi)

Asl hujjat matnida bo'lgan qo'lda-to'ldirish chiziqlari (`________`, `19___йил`, `___-сонли` va h.k.) ayrim joylarda hali ham **fieldga aylantirilmagan** — xuddi eski, xom holicha qolgan. Bugun productionda skript bilan barcha 36 tasini tekshirdim:

```text
JAMI: 36 ta hujjat
Xom chiziq YO'Q (avtomatik test o'tdi): 24 ta
Xom chiziq BOR yoki begona parcha BOR: 12 ta
```

| Kod | Hujjat | Xom chiziq soni | Begona parcha (pastga qarang) |
|---|---|---|---|
| CIV-006 | Ishdan bo'shagandan so'ng berilmagan mehnat daftarasi... | 0 | ✅ bor |
| CIV-009 | Jinoyat natijasida yetkazilgan zararni undirish haqida | 1 | — |
| CIV-011 | Meros bo'lgan mol-mulkni bo'lish to'g'risida | **42** | ✅ bor |
| CIV-014 | Mol-mulkni meros tarkibiga kiritish to'g'risida | 4 | — |
| CIV-015 | Nikoh haqiqiy emas deb topilganligi sababli zarar qoplash | 6 | — |
| CIV-016 | Nikoh tuzilganligi va bekor qilinganligini haqiqiy emas deb topish | 2 | — |
| CIV-018 | Noloyiq merosxo'r deb topish to'g'risida | 2 | — |
| CIV-019 | Onalik (otalik) huquqini tiklash to'g'risida | 5 | — |
| CIV-026 | Turmush o'rtoqi boshqa nikohda bo'lgani sababli... | 11 | — |
| CIV-031 | Vasiyatnoma bo'yicha merosga bo'lgan huquq guvohnomasini haqiqiy emas deb topish | 11 | — |
| CIV-032 | Vasiyatnomani haqiqiy emas deb topish to'g'risida | **46** | ✅ bor |
| CIV-033 | Voyaga yetmagan shaxs tomonidan yetkazilgan zararni undirish | 7 | — |

Qolgan 24 tasida bu avtomatik test (xom chiziq yo'qligi) o'tdi — **lekin bu ularning to'liq to'g'ri ekanini KAFOLATLAMAYDI**, chunki quyidagi B-nuqson avtomatik aniqlanmaydi (pastga qarang).

### Nuqson B — "Semantik noto'g'ri joylashuv" (faqat o'qib tekshirish bilan aniqlanadi)

Field texnik jihatdan matn ichida bor (avtomatik test buni ko'rmaydi), lekin **mazmuniga mos kelmaydigan joyga** qo'yilgan — natijada mijoz formani to'ldirsa ham, chiqadigan hujjat matni **grammatik/mazmuniy jihatdan buzuq** bo'lib chiqadi. Bu hozircha faqat 2 ta hujjatda qo'lda tekshirilgan (CIV-009, CIV-011) va ikkalasida ham topilgan — demak **34 ta qolganini ham qo'lda, o'qib chiqib tekshirish shart**, faqat avtomatik testga ishonib bo'lmaydi.

---

## 2. Ikkita to'liq ishlangan misol — QANDAY BO'LISHI KERAKLIGINING namunasi

### 2.1 — CIV-009 "Jinoyat natijasida yetkazilgan zararni undirish haqida" (`c193ef8b-ead8-44a2-83e2-11e3a22e3254`)

**Hozirgi (noto'g'ri) matn**, muammoli joylar belgilangan:

```text
Жавобгар билан илгаридан ўзаро келишмовчиликларимиз мавжуд эди. Жавобгар
{{incident_date}} куни {{incident_place}}да, {{damage_description}} маҳалласи   ← (1)
ички йўлида мени ҳеч бир сабабсиз турмуш ўртоғи билан иккаласи уришди.
...
Жавобгар шу куни содир этган ҳаракати учун {{criminal_case_details}}          ← (2)
ҳукмига асоан Ўзбекистон Республикаси ЖКнинг 109-моддаси...
...
...жиноят натижасида етказилган {{damage_amount}} сўм ва {{evidence_list}}    ← (3)
сўм маънавий зарар ундириб беришингизни сўрайман.
...
{{claim_request}}{{claimant_email}} {{defendant_email}} йил.                  ← (4)
Даъвогар (вакили):
{{application_date}}/____________________________/                           ← (5)
```

Nuqsonlar:
1. `{{damage_description}}` (zarar tavsifi — bir necha jumlali matn) mahalla NOMI o'rniga qo'yilgan — bu joyga mahalla nomi kerak, zarar tavsifi emas.
2. `{{criminal_case_details}}` — asl matnda bu yerda IKKITA bo'sh joy bor edi (tuman sudi nomi + hukm sanasi), ikkalasi ham bitta fieldga siqilgan.
3. `{{evidence_list}}` (dalillar RO'YXATI — hujjatlar sanog'i) pul SUMMASI o'rnida — mutlaqo mos emas.
4. `{{claim_request}}{{claimant_email}} {{defendant_email}}` — uchta bog'liqsiz field bir joyga, sana yozilishi kerak bo'lgan qatorga, probelsiz ketma-ket yopishtirilgan.
5. `{{application_date}}` — imzo qatoriga (F.I.Sh. yozilishi kerak bo'lgan joyga) qo'yilgan.

**To'g'ri bo'lishi kerak bo'lgan matn** (field nomlari backend allaqachon belgilagani bilan bir xil, 17 ta field hammasi ishlatilgan):

```text
Жавобгар билан илгаридан ўзаро келишмовчиликларимиз мавжуд эди. Жавобгар
{{incident_date}} куни {{incident_place}}да мени ҳеч бир сабабсиз турмуш
ўртоғи билан иккаласи уришди. Жавобгар мени сочимдан ушлаб, ўзи миниб келган
велосипеди темирга куч билан уриши натижасида бошимнинг уч жойидан ёрилиб,
икки жойига тикиш тушди. {{damage_description}}
Жавобгар доимий равишда кўчада мени кўрса уриб, ҳақоратлаб келади. Жавобгар шу
куни содир этган ҳаракати учун {{criminal_case_details}} ҳукмига асоан
Ўзбекистон Республикаси ЖКнинг 109-моддаси 2-қисми билан жиноий жавобгарликка
тортилган. Жавобгар менга етказган тан жароҳати натижасида ўзим даволандим.
Тергов ҳамда судга қатнаб моддий зарар кўрдим. Бундан ташқари жавобгарнинг
хатти-ҳаракатлари натижасида маънавий азобландим.
Юқордигиларга кўра, Ўзбекистон Республикаси Фуқаролик кодексининг ҳамда
Ўзбекистон Республикаси Фуқаролик процессуал кодексининг 189 ва 191-моддаларига
асосан
С Ў Р А Й М А Н:
Жавобгар (Ф.И.Ш.) томонидан жиноят натижасида етказилган {{damage_amount}} сўм
маънавий зарар ундириб беришингизни сўрайман. {{claim_request}}
Илова:
1. Даъво ариза нусхаси,
2. Паспорт нусхаси,
3. ЖИБ судининг ҳукми,
4. Мутахассис хулосаси нусхаси,
5. Яшаш жойдан маълумотнома ва далолатнома,
6. {{evidence_list}}
"__"___________ {{application_date}} йил.
Даъвогар (вакили):
_____________/{{claimant_full_name}}/
(имзо)             (Ф.И.Ш.)
```

Izoh: `{{claimant_email}}`/`{{defendant_email}}` uchun matnda hech qanday tabiiy o'rin yo'q (bu ariza matnida email umuman zikr etilmaydi — u faqat sarlavhadagi kontakt ma'lumotlarida bo'lishi kerak, sarlavha qismi allaqachon to'g'ri). Shuning uchun bu ikki field asosiy qism ichida ishlatilmasligi kerak — ular sarlavhada (`Манзил: ... E-mail: {{claimant_email}}` va h.k.) qo'shilsin, asosiy matn ichiga zo'rlab tiqishtirilmasin.

### 2.2 — CIV-011 "Meros bo'lgan mol-mulkni bo'lish to'g'risida" (`e6291b5a-79b7-4386-88b6-46f6f81291d4`)

Bu hujjatda ikkita alohida jiddiy muammo bor:

**(a) Matn oxirida butunlay begona, aloqasiz ikkinchi shablon parchasi yopishib qolgan.** Hozirgi `template_text`ning oxirida shu qism bor:

```text
...даъвогар: {{claimant_full_name}} (Ф.И.Ш)________Имзо 20____ й ____кун
-----------------------
Фуқаролик ишлари бўйича {{court_name}} туманлараро судига Даъвогар:
_______________________ Ф.И.Ш Манзил: {{claimant_address}} телефон:
{{claimant_phone}} E-mail: {{claimant_email}} Жавобгар: {{defendant_full_name}}
Манзил: {{defendant_address}} телефон: {{defendant_phone}} E-mail:
{{defendant_email}} Юридик шахс:_____________________ (юридик шахс хисоб рақам
ва бошқалар)
манзил: {{claimant_address}} Телефон____________E-mail___________
```

`"-----------------------"` dan keyingi **butun blok** — bu Meros ariza matnining davomi emas, mutlaqo boshqa (umumiy sarlavha) shabloni. **Bu blokni butunlay o'chirib tashlash kerak.** `{{claimant_address}}` bu yerda ham ikki marta ishlatilgan (yana bir sabab — bu begona blok).

**(b) Asosiy matnning o'zida fieldlar ota-onaning tug'ilgan/vafot sanalari o'rniga tasodifiy tartibda joylashtirilgan**, va 42 ta xom chiziq hali ham qolgan:

```text
Мен даъвогар (Ф.И.Ш) {{deceased_full_name}}йилда туғилганман. Отам
{{death_date}}(Ф.И.Ш){{inheritance_property}}19___йил {{property_address}}да
туғилиб, 20{{notary_office}} йил {{notary_document_details}}да, онам
{{heirs_info}}(Ф.И.Ш){{missed_deadline_reason}} 19___йил {{will_details}}да
туғилиб, 20{{share_distribution_request}} йил {{claim_request}}да вафот
этганлар. ...
```

Bu qism to'liq qayta yozilishi kerak — quyidagicha mazmunda (aniq sana/manzil o'rniga field, ota-onaning F.I.Sh./tug'ilgan-vafot sanalari uchun matnda tabiiy joy YO'Q, chunki asl andozada bu ma'lumotlar "meros qoldiruvchi" (bitta) haqida, ikkita ota-ona haqida emas — demak backendda field-modelini ham qayta ko'rib chiqish kerak: hozirgi 21 ta field orasida faqat BITTA "meros qoldiruvchi" bor (`deceased_full_name`, `death_date`), lekin asl matn "ota" va "ona" ikkalasi haqida alohida gapiradi. Eng oddiy yechim — matnni "meros qoldiruvchi" (bitta shaxs, `deceased_full_name`+`death_date`) haqida so'zlaydigan qilib qisqartirish, "ota" va "onam" degan ikkinchi qatorlarni matndan olib tashlash (chunki ularga mos alohida field yo'q va ular hozir tasodifiy fieldlar bilan to'ldirilgan holda ma'nosiz chiqmoqda):

```text
Мен даъвогар (Ф.И.Ш) {{claimant_full_name}} {{deceased_full_name}} мендан
{{death_date}} санада вафот этган. Меросга қолган мулк: {{inheritance_property}},
манзили: {{property_address}}. {{notary_office}} нинг {{notary_document_details}}
рекизитли ҳужжати мавжуд. Меросхўрлар ҳақида маълумот: {{heirs_info}}.
Меросни қабул қилиш муддати ўтказиб юборилган сабаби: {{missed_deadline_reason}}.
Васиятнома реквизитлари (агар бўлса): {{will_details}}.
...
С Ў Р А Й М А Н: {{claim_request}} {{share_distribution_request}}
```

(Bu — taklif qilingan qayta yozish, so'z-ma-so'z majburiy emas; muhimi — **har bir field mazmuniga mos, tabiiy joyda, va oldingi begona/tasodifiy joylashuv qolmasligi**.)

---

## 3. Backend uchun aniq TOPSHIRIQ (checklist)

Har bir 36 ta hujjat uchun, birma-bir:

1. **`template_text`ni oxirigacha o'qib chiqing** (avtomatik emas — inson o'qishi shart, chunki B-nuqson faqat o'qib aniqlanadi).
2. Har bir `{{field}}`ni **mazmuniga mos, o'sha ma'lumot tabiiy ravishda yozilishi kerak bo'lgan joyga** ko'chiring (2-bo'limdagi ikki misol namuna sifatida).
3. Qolgan barcha xom `________`, `19___йил`, `___-сонли` kabi chiziqlarni yo mos fieldga aylantiring, yo (agar unga mos field yo'q bo'lsa va matn mantiqan kerak bo'lmasa) shu jumlani/qismni matndan olib tashlang.
4. Agar matn ichida **bitta hujjatga aloqasi yo'q boshqa shablon parchasi** (masalan CIV-011 dagi `"-----------------------"` dan keyingi qism, yoki CIV-006 dagi shunga o'xshash belgi) bo'lsa — butunlay o'chiring.
5. Agar biror field matn ichida tabiiy o'rniga ega bo'lmasa (masalan email manzili ariza matnida hech qachon tilga olinmaydi, faqat sarlavhada bo'ladi) — uni **sarlavha/rekvizit qismiga** qo'ying, asosiy matn ichiga zo'rlab joylashtirmang.
6. Tuzatgandan keyin har bir hujjat uchun o'zingiz `document-preview`ni **barcha fieldlarga real qiymat berib** chaqiring va `final_text`ni oxirigacha o'qib chiqing — grammatik/mazmuniy jihatdan tushunarli, sudga topshirsa bo'ladigan matn chiqishi kerak.

### Tezkor o'z-o'zini tekshirish (avtomatik, lekin yetarli emas — faqat A-nuqsonni ko'radi)

```bash
for id in <36 ta service_id>; do
  curl -s "https://lexgo.api.cognilabs.org/services/$id/document-template" \
    | python3 -c "import sys,json,re; d=json.load(sys.stdin); t=d['template']['template_text']; \
      print(id, 'raw_blanks=', len(re.findall(r'_{3,}', t)), 'has_separator=', bool(re.search(r'-{5,}', t)))"
done
```

Bu skript "0 raw_blanks, false separator" bersa ham, **B-nuqson (semantik joylashuv) uchun baribir qo'lda o'qish shart** — CIV-009 aynan shu holatda (rawBlanks=1, ammo mazmuni butunlay noto'g'ri).

---

## 4. Tekshirilishi kerak bo'lgan 36 ta hujjat (to'liq ro'yxat)

| Kod | service_id | Holat |
|---|---|---|
| CIV-001 | 2a389cc1-8ff9-40e2-8cdd-95f5338d037a | qo'lda tekshirish kerak |
| CIV-002 | 72935606-c0a0-43be-a976-9ca67fe3f17a | qo'lda tekshirish kerak |
| CIV-003 | 386d38e2-e186-431b-b1f8-7c00f211bb6d | qo'lda tekshirish kerak |
| CIV-004 | 59c8931c-8c29-4476-88bf-0f39a9af133c | qo'lda tekshirish kerak |
| CIV-005 | 7142bab1-5598-4459-933e-cb6c7494e9f0 | qo'lda tekshirish kerak |
| CIV-006 | 285bf7ee-340f-4bd2-a75f-e7017d255e56 | ❌ begona parcha topildi |
| CIV-007 | 3361014a-491c-455f-abfb-b30e9d3c77a4 | qo'lda tekshirish kerak |
| CIV-008 | 8ebdb457-9930-4100-aa4b-b7943232dac5 | qo'lda tekshirish kerak |
| CIV-009 | c193ef8b-ead8-44a2-83e2-11e3a22e3254 | ❌ tekshirildi, 2.1-bo'limda tuzatish ko'rsatilgan |
| CIV-010 | 28e9931c-7311-4f1e-9ee5-42a249b65c12 | qo'lda tekshirish kerak |
| CIV-011 | e6291b5a-79b7-4386-88b6-46f6f81291d4 | ❌ tekshirildi, 2.2-bo'limda tuzatish ko'rsatilgan |
| CIV-012 | ffe3ab35-f022-4cf9-a5ed-f7afd1f68a38 | qo'lda tekshirish kerak |
| CIV-013 | e0ad2eb2-441b-4ada-b6cb-cd2a0bcf4c6b | qo'lda tekshirish kerak |
| CIV-014 | ec961d28-4854-48f7-abf5-2b396c758854 | ❌ 4 ta xom chiziq |
| CIV-015 | 03cafca2-a713-4be1-b191-bd3c22e088b7 | ❌ 6 ta xom chiziq |
| CIV-016 | e3c7ae36-746f-41bd-9dcb-6f02ea4160a7 | ❌ 2 ta xom chiziq |
| CIV-017 | 54cb1335-9ac4-4686-994c-80c6a1e87254 | qo'lda tekshirish kerak |
| CIV-018 | d4f2099e-c032-4d7f-9303-6cff237886fb | ❌ 2 ta xom chiziq |
| CIV-019 | 3935474b-2666-4730-9054-b023fc424ef5 | ❌ 5 ta xom chiziq |
| CIV-020 | 2faac2fe-786c-42ef-8ef2-94c723ba73b2 | qo'lda tekshirish kerak |
| CIV-021 | a1c9419f-ac44-447d-b4d7-9b71e7eedecc | qo'lda tekshirish kerak |
| CIV-022 | 42c5575f-fb6c-49f3-b5bc-a7d3f4886088 | qo'lda tekshirish kerak |
| CIV-023 | 0adffd78-3e18-421a-9ae8-1c9fe729cb2d | qo'lda tekshirish kerak |
| CIV-024 | 8814cd2f-ce39-43d9-86d9-1c4e160700fa | qo'lda tekshirish kerak |
| CIV-025 | 76af246c-b642-4408-936c-71cb693ffefa | qo'lda tekshirish kerak |
| CIV-026 | f14eeea4-10b3-4c35-8c1b-f7db9cd27304 | ❌ 11 ta xom chiziq |
| CIV-027 | 72d3bc59-0b0b-48bc-80c2-8ad773988e16 | qo'lda tekshirish kerak |
| CIV-028 | 4db64b0c-b809-4df7-941a-14b5e9c0a6f8 | qo'lda tekshirish kerak |
| CIV-029 | e0d7ceab-126e-48a0-8fc7-b2be44b4dbd1 | qo'lda tekshirish kerak |
| CIV-030 | 1317c17a-afc8-4b15-bd3b-c2a6c3759069 | qo'lda tekshirish kerak |
| CIV-031 | e3ebfeeb-3ad4-403a-93bb-af08f106f30d | ❌ 11 ta xom chiziq |
| CIV-032 | a6b05aab-9060-4ad9-b0a3-47d5d5466533 | ❌ 46 ta xom chiziq + begona parcha |
| CIV-033 | 9e080628-27b8-4362-92e8-ce00d09c5913 | ❌ 7 ta xom chiziq |
| CIV-034 | a4343926-c993-4d18-bd88-1a2dcb682fce | qo'lda tekshirish kerak |
| CIV-035 | 474546ac-9ed7-4ad6-9928-55448b762c73 | qo'lda tekshirish kerak |
| CIV-036 | 5d245e04-5af5-4800-8306-810a2b9c1e67 | qo'lda tekshirish kerak |

"qo'lda tekshirish kerak" deb belgilanganlar avtomatik testdan o'tgan (xom chiziq/begona parcha topilmagan), lekin CIV-009 misolida ko'rsatilganidek, bu ularning semantik jihatdan to'g'ri ekanini KAFOLATLAMAYDI — ularni ham o'qib chiqish shart.

## 5. Bajarilgan deb hisoblash mezoni (Definition of Done)

Quyidagilarning HAMMASI to'g'ri bo'lgandagina bu vazifa yopiladi:

- [ ] Barcha 36 ta hujjatning `template_text`i boshidan oxirigacha inson tomonidan o'qib chiqilgan (faqat avtomatik test emas).
- [ ] Hech birida xom `________`/`___йил` kabi chiziq qolmagan (yoki ular field bilan almashtirilgan, yoki keraksiz bo'lsa matndan olib tashlangan).
- [ ] Hech birida boshqa/begona shablon parchasi yo'q.
- [ ] Har bir field o'zi tegishli bo'lgan ma'lumot yoziladigan JOYDA turibdi (sana o'rnida sana, summa o'rnida summa, ism o'rnida ism — aralashmagan).
- [ ] Har bir hujjat uchun `document-preview` real qiymatlar bilan sinovdan o'tkazilgan va natija matn odam o'qiganda mantiqiy, sudga topshirsa bo'ladigan ko'rinishda.

Shu ro'yxat bajarilgach, frontendda (mening tarafimda) hech narsa qilinmaydi — mavjud fill-in forma/preview/generate oqimi avtomatik ishlab ketadi.
