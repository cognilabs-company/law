# Fuqarolik sud hujjatlariga `fields` qo'shildi, lekin matn ichiga ulanmagan — 2 ta aniq nuqson bor

**Sana:** 2026-09-20
**Kimga:** backend dasturchi
**Asos:** kecha yozilgan `LEXGO_CIVIL_COURT_DOCS_FIELDS_KERAK_2026-09-19.md` ("36 ta fuqarolik-sud hujjatida `fields=[]`, forma ochilmayapti").

## Xushxabar

Bugun (2026-09-20) tekshirilganda, kamida quyidagi ikkita xizmatda `fields` massivi endi bo'sh emas:

```http
GET /services/e6291b5a-79b7-4386-88b6-46f6f81291d4/document-fields
→ "Meros bo'lgan mol-mulkni bo'lish to'g'risida" — field_count: 21

GET /services/c193ef8b-ead8-44a2-83e2-11e3a22e3254/document-fields
→ "Jinoyat natijasida yetkazilgan zararni undirish haqida" — field_count: 17
```

Demak kimdir kechagi so'rovga javoban shu ikkitasini (va ehtimol boshqalarini ham) qayta ishlay boshlagan — rahmat. Frontend darhol `fields` mavjudligini to'g'ri aniqlaydi va forma (LegalZoom uslubidagi bosqichma-bosqich savol + real-time preview) ko'rsatiladi — bu qism ishlaydi.

## Muammo: `fields` qo'shilgan, lekin `template_text` ichiga ulanmagan

`GET /services/{id}/document-template` orqali ikkala hujjatning **xom matnini** o'qib chiqdim. Ikkalasida ham bir xil naqsh takrorlanadi:

1. Hujjat boshiga **alohida, ariza matnining bir qismi bo'lmagan** "ТЎЛДИРИЛГАН МАЪЛУМОТЛАР" (to'ldirilgan ma'lumotlar) degan ro'yxat qo'shilgan — shu yerda har bir `{{field}}` bir marta ishlatilgan (fields ro'yxati aynan shu yerdan hisoblanayotganga o'xshaydi).
2. **Lekin arizaning haqiqiy matni (pastda, asl matn) o'zgarishsiz qolgan** — o'sha joylardagi qo'lda-to'ldirish chiziqlari (`________`) hali ham chiziq bo'lib turibdi, hech biriga `{{field}}` qo'yilmagan.

### Misol — "Jinoyat natijasida yetkazilgan zarar" (`template_id=5ce0cab9-e10a-480a-8dc5-fbd107de0033`)

Hozirgi `template_text` (qisqartirilgan, muhim joylar ko'rsatilgan):

```text
Фуқаролик ишлари бўйича {{court_name}} туманлараро судига
даъвогар: {{claimant_full_name}} {{claimant_full_name}} (Ф.И.Ш.)     ← 1-nuqson: token 2 marta
Манзил: {{claimant_address}} ,
...

ТЎЛДИРИЛГАН МАЪЛУМОТЛАР                                              ← 2-nuqson: bu ro'yxat
Hodisa sanasi: {{incident_date}}                                        arizaning haqiqiy
Yetkazilgan zarar tavsifi: {{damage_description}}                       matniga ULANMAGAN,
Zarar summasi: {{damage_amount}}                                        alohida osilib qolgan
...

(Жиноят натижасида етказилган зарарни ундириш ҳақида)
Жавобгар билан илгаридан ўзаро келишмовчиликларимиз мавжуд эди. Жавобгар
________ куни кеч соат ________ ларда ________ тумани, "_______"           ← bular hali ham
маҳалласи ички йўлида мени ҳеч бир сабабсиз... уришди.                      xom chiziq, {{...}}
...жиноят ишлари бўйича __________туман судининг __________ кунги            ga almashtirilmagan
ҳукмига асоан...
...жиноят натижаси етказилган __________ сўм ва _________ сўм
маънавий зарар ундириб беришингизни сўрайман.
```

**Natija:** mijoz formani to'liq to'ldirsa ham, `POST /services/{id}/document-preview` va `POST /services/{id}/document-generate` chiqargan yakuniy hujjatda — sudga topshiriladigan **asosiy ariza matnida** — voqea sanasi, joyi, summa kabi eng muhim joylar hamon bo'sh chiziq bo'lib qoladi (faqat sahifa boshidagi "ТЎЛДИРИЛГАН МАЪЛУМОТЛАР" ro'yxati to'ladi). Bu real foydalanish uchun yaroqsiz — mijoz sudga bo'sh joyli ariza topshiradi.

"Meros bo'lgan mol-mulkni bo'lish" hujjatida (`template_id=4f51c374-8e12-4f90-a280-fe29712400db`) ham aynan shu ikkala nuqson bor (`{{claimant_full_name}}` 2 marta, va asl matndagi `19___йил`, `________(Ф.И.Ш)________` kabi barcha chiziqlar hamon xom holda).

## Kerak bo'lgan narsa

1. **Takrorlangan tokenni olib tashlash**: `{{claimant_full_name}} {{claimant_full_name}}` → bitta `{{claimant_full_name}}`.
2. **"ТЎЛДИРИЛГАН МАЪЛУМОТЛАР" ro'yxatini butunlay olib tashlash** (bu faqat vaqtinchalik/texnik yordamchi bo'lib qolib ketgan ko'rinadi, ariza matniga tegishli emas) — **va uning o'rniga har bir `{{field}}`ni ariza matnining ICHIGA, aynan o'sha ma'lumot yozilishi kerak bo'lgan joyga qo'yish**. Ya'ni eski `________` chiziqlarning har birini mos `{{field_name}}` bilan almashtirish, ro'yxat qilib emas.

Masalan, "Jinoyat" hujjatining asosiy qismi shunday bo'lishi kerak (taklif, field nomlari allaqachon backend belgilagani bilan bir xil):

```text
Жавобгар билан илгаридан ўзаро келишмовчиликларимиз мавжуд эди. Жавобгар
{{incident_date}} куни {{incident_place}}да мени ҳеч бир сабабсиз... уришди.
{{damage_description}}
...{{criminal_case_details}}...
...жиноят натижасида етказилган {{damage_amount}} сўм маънавий зарар
ундириб беришингизни сўрайман. {{claim_request}}
```

3. Xuddi shu 2 ta nuqsonni (token takrori + matn ichiga ulanmaganlik) qolgan ~34 ta hujjatda ham tekshirib chiqish kerak — ehtimol ularga ham xuddi shu avtomatik/yarim-tayyor jarayon qo'llanilgan.

## Frontend holati

O'zgarishsiz — tayyor va sinovdan o'tgan (qarang: `LEXGO_DOCUMENT_GENERATION_FE_HOLATI_2026-09-19.md`). `fields` va `template_text` to'g'ri ulangach, frontendda hech narsa o'zgartirish shart emas — forma avtomatik ishlab ketadi.
