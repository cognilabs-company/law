# Fuqarolik sud hujjatlari — `fields` yo'q, to'ldirish formasi ochilmayapti

**Sana:** 2026-09-19
**Kimga:** backend dasturchi
**Asos:** `LEXGO_CIVIL_COURT_DOCS_FRONTEND.md` — 36 ta fuqarolik-sud hujjati (`civil-court-family/housing/labor/other`).

## Muammo

Frontend tomon tayyor: xizmat → kategoriya → hujjat bosilganda, agar shablonda `fields` bo'lsa, mijozga **chap tomonda ketma-ket savollar, o'ng tomonda real-time to'ldiriladigan hujjat ko'rinishi** ochiladi (LegalZoom uslubida — sinovdan o'tgan, ishlaydi).

Lekin hozir productiondagi barcha 36 ta hujjatda `template.fields = []`. Tekshirilgan namunalar:

```http
GET /services/2a389cc1-8ff9-40e2-8cdd-95f5338d037a/document-template
→ "Aliment bo'yicha qarzdorlikni to'lashdan ozod etish bo'yicha" — fields: []

GET /services/59c8931c-8c29-4476-88bf-0f39a9af133c/document-template
→ "Ish haqini undirish to'g'risida" — fields: []

GET /services/54cb1335-9ac4-4686-994c-80c6a1e87254/document-template
→ "Nikohdan ajratish to'g'risida" — fields: []
```

`fields` bo'sh bo'lgani uchun frontend, `LEXGO_CIVIL_COURT_DOCS_FRONTEND.md`ning o'zida yozilgan qoidaga aynan amal qilib ("Agar fields bo'lmasa, preview va generate tugmalari active bo'lishi mumkin"), formani ko'rsatmasdan **to'g'ridan-to'g'ri generatsiya qiladi** — mijoz hech narsa to'ldirmasdan, bo'sh chiziqlar bilan tayyor PDF oladi.

Lekin `template_text`ning o'ziga qaralsa, bu hujjatlar aslida **to'ldirilishi kerak bo'lgan aniq joylarga ega** — shunchaki `fields` sifatida ajratilmagan:

```text
Фуқаролик ишлари бўйича
                        _________________ туманлараро (туман) судига
                                                        (суд номи)

                        Даъвогар:
                        _______________________________
                              (Ф.И.Ш. тўлиқ)
                        манзили: ______________________________,
                        телефон: ____________________________

                        Жавобгар: ____________________
                        Манзил:_________________________
                        тел:____________________________
                        E-mail:__________________________
```

Har bir `_______` chizig'i ostida yoki yonida qavs ichida nima yozilishi kerakligi ko'rsatilgan (`(суд номи)`, `(Ф.И.Ш. тўлиқ)`, `манзили:`, `телефон:` va h.k.) — bular aynan `fields` bo'lishi kerak bo'lgan joylar.

## Kerak bo'lgan narsa

Shu 36 ta shablonning har biriga `fields` massivini to'ldirish — har bir blank uchun (`FRONTEND_DOCUMENT_GENERATION.md`da yozilgan format bilan bir xil):

```json
{
  "name": "court_name",
  "key": "court_name",
  "label": "Sud nomi (tumanlararo)",
  "type": "text",
  "required": true,
  "placeholder": ""
}
```

Yuqoridagi "Aliment bo'yicha qarzdorlikni to'lashdan ozod etish" hujjatining boshidan ko'rinib turgan maydonlarga misol (to'liq ro'yxat emas, faqat naqadar ko'p ekanini ko'rsatish uchun):

| Matndagi joy | Taklif qilingan `name` | `label` |
|---|---|---|
| `_________________ туманлараро судига` | `court_name` | Sud nomi |
| `Даъвогар: _______________________` | `plaintiff_name` | Da'vogar F.I.Sh. |
| `Манзил: ...` (da'vogar) | `plaintiff_address` | Da'vogar manzili |
| `тел: ...` (da'vogar) | `plaintiff_phone` | Da'vogar telefoni |
| `E-mail: ...` (da'vogar) | `plaintiff_email` | Da'vogar emaili |
| `Жавобгар: ____________________` | `defendant_name` | Javobgar F.I.Sh. |
| `Манзил: ...` (javobgar) | `defendant_address` | Javobgar manzili |
| `тел: ...` (javobgar) | `defendant_phone` | Javobgar telefoni |
| `(ФХДЁ бўлими)` | `registry_office` | FHDYo bo'limi (nikoh ro'yxatga olingan) |

**Placeholder matnini `{{name}}` bilan almashtirish shart emas** — agar `template_text`dagi asl `_______` chiziqni almashtirib bo'lmasa (chunki u mustache token emas, oddiy chiziq), `fields`ni belgilab, preview/generate endpointida shu joylarni pozitsiyasi bo'yicha (yoki regexp bilan) to'ldirish kerak bo'lishi mumkin — bu backend tomonning ichki ishi, frontendga faqat `fields` massivi va ishlaydigan preview kifoya.

## Frontend holati

Frontend tayyor va sinovdan o'tgan — `fields`li bitta haqiqiy shablonda (71 maydonli, `Mijoz-advokat shartnoma shabloni`, hozir productiondan olib tashlangan) to'liq ishlagan: bosqichma-bosqich (1 maydon/qadam) forma, real-time preview, progress foizi, generate, PDF/DOCX yuklab olish — hammasi tasdiqlangan. `fields` to'ldirilishi bilan bu 36 ta hujjatda ham avtomatik ishlaydi, frontendda hech narsa o'zgartirish shart emas.
