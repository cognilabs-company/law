# Hujjat generatsiyasi (document_template_id) — frontend holati, 2026-09-19

**Asos:** `FRONTEND_DOCUMENT_GENERATION.md`, `LEXGO_DOCUMENT_GENERATION_DONE.md` (backend dasturchi hujjatlari).

## Nima qurilgan va ishlaydi (jonli production'da bosib tekshirildi)

`GET /services/{id}/document-template` → `POST /services/{id}/document-requests` → `POST /document-requests/{id}/preview` (real-time, 400ms debounce) → `PUT …/answers` → `GET …/unlock-policy` → `POST …/generate` → `GET …/file` / `GET …/docx` — to'liq oqim ishlaydi. Kod:

- `lib/services/backend.ts` — `BackendService.documentTemplateId`, `getServiceDocumentTemplate()`, `createServiceDocumentRequest()`, `previewDocumentRequest()`.
- `components/portal/DocumentRequestPanel.tsx` — javob/to'lov/generatsiya/yuklab olish umumiy komponenti.
- `components/portal/ServiceDocumentRequest.tsx` — "Davom etish" → hujjat oqimi.
- `components/portal/DocWizard.tsx` — real-time preview paneli, `completion_percent`.

Client → Xizmatlar sahifasida: agar biror xizmat kartasi `document_template_id` bilan kelsa (oddiy kategoriya orqali topilgan), uni bosganda mijoz avtomatik hujjat oqimiga tushadi (advokat tanlash o'rniga). Bu qism **saqlanib qoldi**.

## Nima olib tashlandi (2026-09-19, ushbu sessiyada)

Boshida Xizmatlar sahifasining tepasida alohida **"Hujjat tayyorlash"** bo'limi qo'shilgan edi — `catalog_only=false` bilan BARCHA `document_template_id`li xizmatlarni alohida ro'yxatlab ko'rsatardi (hujjatda buyicha ogohlantirilgan: "catalog_only=true bunday xizmatlarni chiqarib tashlashi mumkin, chunki ularda catalog metadata bo'lmasligi mumkin").

Test paytida production'da bu ro'yxatga **10 ta huquqiy hujjat** (Cookie siyosati, Maxfiylik siyosati, Foydalanuvchi ofertasi va h.k. — `LEXGO_DOCUMENT_GENERATION_DONE.md`dagi "Legal Consent Import" ro'yxati) ham `document_template_id` bilan chiqib, mijozga xuddi sotib olinadigan xizmatdek ko'rsatildi. Bu noto'g'ri ko'rinish edi — platformaning o'z huquqiy hujjatlari (Cookie siyosati kabi) mijozga "buyurtma qiling" shaklida taqdim etilmasligi kerak.

**Qaror:** bu alohida-kashf-qiladigan bo'lim frontenddan olib tashlandi (`app/[locale]/portal/client/services/page.tsx`). Sabab: qaysi `document_template_id`li "xizmatlar" haqiqatan mijozga umumiy ro'yxatda ko'rsatilishi kerak (masalan, "Shartnoma tayyorlash" xizmati) va qaysilari faqat ichki/huquqiy hujjat sifatida qolishi kerak (Cookie siyosati, Maxfiylik siyosati) — bu backend/PM tarafidan hal qilinishi kerak bo'lgan **mazmun** masalasi, frontend darajasida ishonchli ajratib bo'lmaydi (ikkalasi ham bir xil maydon bilan keladi).

## Keyingi qadam (backend/PM bilan)

Agar kelajakda "Hujjat tayyorlash" kabi alohida ro'yxat kerak bo'lsa, backend quyidagilardan birini taklif qilishi kerak:
- alohida flag (masalan `document_service_visibility: "catalog" | "legal_only"`) — faqat `catalog`larni ro'yxatlashga bo'ladi;
- yoki `catalog_only=true`da ham document-xizmatlarning to'g'ri (huquqiy hujjatlar bo'lmagan) qismini qaytarish, hozirgi ogohlantirilgan `catalog_only=false` zarurati bekor bo'ladi.

Shu vaqtgacha: mijoz faqat **kategoriya orqali topgan** `document_template_id`li xizmatga kirganda hujjat oqimini ko'radi — bu xavfsiz, chunki backend/admin qaysi xizmatlarni qaysi kategoriyaga qo'yishni allaqachon nazorat qiladi.
