# LexGo Civil Court Catalog Fix

Project: LexGo

## Nima tuzatildi

Fuqarolik sud hujjatlari oldin `document-fields` orqali ishlayotgan edi, lekin real katalogda ko'rinmayotgan edi. Sabab: 36 ta xizmatda `document_template_id` bor, lekin `catalog_code` metadata yo'q edi. `/services` esa faqat katalog metadata bor xizmatlarni qaytaradi.

Endi 36 ta fuqarolik sud hujjati real `/services` katalogida ko'rinadi.

## Qilingan ishlar

- 36 ta `civil-court-doc-*` xizmatga `catalog_code` berildi.
- Har biriga katalog metadata ulandi.
- `document_template_id` saqlandi.
- `/services` javobida bu 36 ta xizmat endi ko'rinadi.
- `/services/{id}/document-fields` real katalogdagi shu IDlar bilan ishlaydi.
- Test/demo xizmatlar inactive qilindi:
  - `Civil court test`
  - `T1BTEST-*`
  - `test`
- `/services/search` faqat katalog metadata bor active xizmatlarni qaytaradigan qilindi.
- `/services/search?q=tes&limit=50` endi test/demo xizmatlarni qaytarmaydi.

## Frontend uchun muhim holat

Frontend document generation flow o'zgarmaydi.

Katalog:

```http
GET /services
```

Tanlangan xizmat fieldlari:

```http
GET /services/{service_id}/document-fields
```

Preview:

```http
POST /services/{service_id}/document-preview
```

Generate:

```http
POST /services/{service_id}/document-generate
```

## Tekshirilgan real IDlar

```text
Meros bo'lgan mol-mulkni bo'lish to'g'risida
e6291b5a-79b7-4386-88b6-46f6f81291d4

Jinoyat natijasida yetkazilgan zararni undirish haqida
c193ef8b-ead8-44a2-83e2-11e3a22e3254

Aliment bo'yicha qarzdorlikni to'lashdan ozod etish bo'yicha
2a389cc1-8ff9-40e2-8cdd-95f5338d037a

Ish haqini undirish to'g'risida
59c8931c-8c29-4476-88bf-0f39a9af133c
```

## Production test natijasi

- `GET /services` -> 185 ta katalog xizmati
- `GET /services` ichida `document_template_id` bor xizmatlar -> 36 ta
- `test_like` xizmatlar -> 0 ta
- `GET /services/search?q=tes&limit=50` -> 0 ta natija
- Yuqoridagi 4 ta real ID uchun `document-fields` -> 200
- Yuqoridagi 4 ta real ID uchun `document-preview` -> 200
- `can_generate=true`
- Eski `ТЎЛДИРИЛГАН МАЪЛУМОТЛАР` bloki yo'q
- Dublikat token yo'q
- Almashtirilmagan `{{...}}` token qolmagan
