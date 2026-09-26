# LexGo × OnlyOffice Document Server — ulash bo'yicha topshiriq

Advokat hujjatni tizim ichida tahrirlashi uchun nima kerak.
Frontend tayyor: u `onlyoffice` obyektini o'zgartirmasdan editorga uzatadi.

## Hozirgi holat

`GET /lawyers/me/document-requests/{record_id}/editor`

- HTTP **200 OK** — endpoint ishlayapti, xato yo'q
- `onlyoffice.configured` = **false**
- `onlyoffice.document_server_url` = **""** (bo'sh)

Natija: frontend spetsifikatsiya bo'yicha fallback ekranni ko'rsatadi —
*"Online Word editor hali ulanmagan"* + DOCXni ochish / yuklab olish tugmalari.

Bu frontend xatosi emas. Document Server ulanib, shu ikki maydon to'ldirilishi
bilan Word editor o'zi ochiladi — frontendga qayta tegish shart emas.

---

## 1. Document Server'ni ko'tarish

OnlyOffice Docs Community Edition bepul, lekin bir vaqtda **20 ta ulanish**
cheklovi bor. Undan ortiq bo'lsa Enterprise litsenziya kerak.

```bash
# JWT_SECRET — istalgan uzun tasodifiy satr, backend bilan bir xil bo'lishi shart
docker run -d --name lexgo-onlyoffice --restart always \
  -p 8080:80 \
  -e JWT_ENABLED=true \
  -e JWT_SECRET="<uzun-tasodifiy-secret>" \
  -e JWT_HEADER=Authorization \
  -v /srv/oo/data:/var/www/onlyoffice/Data \
  -v /srv/oo/logs:/var/log/onlyoffice \
  -v /srv/oo/pgsql:/var/lib/postgresql \
  -v /srv/oo/rabbitmq:/var/lib/rabbitmq \
  onlyoffice/documentserver
```

- Oldiga nginx qo'yib **HTTPS** bilan chiqariladi, masalan `https://office.lexgo.uz`.
  Sayt HTTPS bo'lgani uchun DS HTTP bo'lsa, brauzer *mixed content* deb
  skriptni bloklaydi va editor umuman ochilmaydi.
- Volume'lar shart: ularsiz konteyner restart bo'lganda barcha tahrir
  sessiyalari yo'qoladi.

**Tekshirish:** `curl https://office.lexgo.uz/healthcheck` → `true`,
va `/web-apps/apps/api/documents/api.js` JavaScript qaytarsin.

---

## 2. Backend env

```
ONLYOFFICE_DOCUMENT_SERVER_URL=https://office.lexgo.uz
ONLYOFFICE_JWT_SECRET=<yuqoridagi bilan aynan bir xil>
# DS konteyner backendga qaysi manzil orqali murojaat qiladi
# (bir Docker network'da bo'lsa — ichki nom, tashqi URL emas)
ONLYOFFICE_INTERNAL_API_BASE=http://lexgo-api:8000
```

Nomlar ixtiyoriy — muhimi, bu uch qiymat konfiguratsiyadan olinsin.

---

## 3. Editor endpoint javobi

Hozirgi tuzilish saqlanadi, faqat belgilangan maydonlar qo'shiladi.

```json
{
  "record_id": "…",
  "session_id": "…",
  "provider": "onlyoffice",
  "onlyoffice": {
    "configured": true,                                  // ← hozir false
    "document_server_url": "https://office.lexgo.uz",    // ← hozir ""
    "documentType": "word",
    "type": "desktop",
    "document": {
      "fileType": "docx",
      "key": "req7f3c-v4",                               // ← pastdagi shartga qarang
      "title": "ariza.docx",
      "url": "http://lexgo-api:8000/document-editor/sessions/…",
      "permissions": { "edit": true, "download": true,
                       "print": true, "review": true, "comment": true }
    },
    "editorConfig": {
      "mode": "edit",
      "lang": "uz",
      "callbackUrl": "http://lexgo-api:8000/document-editor/onlyoffice/callback/…",
      "user": { "id": "…", "name": "…" },
      "customization": { "autosave": true, "forcesave": true,
                         "comments": true, "compactToolbar": false }
    },
    "token": "<HS256 JWT — 4-bo'lim>"
  }
}
```

> **`document.key` — eng ko'p uchraydigan xato manbai.**
> Faqat `0-9 a-z A-Z . = _ -` belgilari, maksimum 128 ta.
> **Hujjat har safar o'zgarganda key ham o'zgarishi shart** — aks holda
> Document Server o'z keshidan eski nusxani beradi va advokat o'zgarishlarini
> ko'rmaydi.

---

## 4. Konfiguratsiyani imzolash (JWT)

DS 7.2 dan beri JWT sukut bo'yicha yoqilgan. Backend `onlyoffice` obyektini
(`token` maydonisiz) HS256 bilan imzolab, natijani `token` ichiga qo'yadi.

```python
import jwt
payload = {k: v for k, v in config.items() if k != "token"}
config["token"] = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
```

Document Server backendga yuboradigan so'rovlar (callback, command service) ham
imzolangan bo'ladi — `Authorization: Bearer <jwt>` sarlavhasida keladi va
backend ularni **tekshirishi** kerak.

> **Diqqat:** imzo konfiguratsiyaning aynan o'ziga bog'langan. Shuning uchun
> frontend `token` mavjud bo'lsa obyektga umuman tegmaydi — `type` yoki
> `customization` ni ham o'zgartirmaydi. Demak **desktop/mobile tanlash va
> autosave/forcesave flaglari backend tomonida, imzolanadigan payload ichida
> to'g'ri qo'yilishi kerak.**

---

## 5. Callback handler

`POST /document-editor/onlyoffice/callback/{session_id}`
Buni **Document Server chaqiradi, frontend emas.**

| status | Ma'nosi | Backend nima qiladi |
|--------|---------|---------------------|
| 1 | Tahrir qilinmoqda | Hech narsa, faqat javob |
| 2 | Saqlashga tayyor (hamma chiqdi) | `body.url` dan DOCX'ni yuklab olib saqlaydi |
| 3 | Saqlashda xatolik | Log + alert |
| 4 | O'zgarishsiz yopildi | Hech narsa |
| 6 | Force-save (autosave) | `body.url` dan yuklab olib saqlaydi |
| 7 | Force-save xatoligi | Log + alert |

Har qanday holatda javob **albatta** shunday bo'lishi kerak:

```
HTTP/1.1 200 OK
Content-Type: application/json

{ "error": 0 }
```

Boshqa javob (500, bo'sh body, HTML) — DS saqlashni muvaffaqiyatsiz deb
hisoblaydi va advokatning ishi yo'qoladi.

`body.url` — DS'dagi **vaqtinchalik** manzil. Uni saqlab qo'yib bo'lmaydi;
callback kelgan zahoti faylni yuklab olish kerak.

Saqlangandan keyin frontendga `document_request.editor_saved` event yuborilsa,
advokatga "Saqlangan" belgisi chiqadi (frontend buni allaqachon tinglayapti).

---

## 6. Tarmoq — eng ko'p adashadigan joy

`document.url` va `callbackUrl` ni **brauzer emas, Document Server konteyneri**
ochadi. Shuning uchun:

- Ikkalasi ham DS konteyneridan **erishiladigan** bo'lishi kerak. Bir Docker
  network'da bo'lsa, ichki nom (`http://lexgo-api:8000/…`) ma'qul.
- Ichidagi `?token=…` muddati tahrir sessiyasidan uzunroq bo'lsin (kamida
  24 soat), aks holda uzoq sessiyada autosave 401 bilan yiqiladi.
- Firewall: **DS → backend** yo'nalishi ochiq bo'lsin. Faqat backend → DS
  ochilishi yetarli emas.

---

## Xatoliklar lug'ati

| Ekranda | Haqiqiy sabab |
|---------|---------------|
| The document security token is not correctly formed | JWT secret backend va DS'da har xil, yoki payload imzolangandan keyin o'zgartirilgan |
| Download failed / error `-4` | DS `document.url` ni ocholmayapti — tarmoq yoki muddati o'tgan token |
| Editor ochiladi, lekin o'zgarishlar saqlanmaydi | callbackUrl DS'dan erishilmayapti, yoki handler `{"error":0}` qaytarmayapti |
| Eski matn ko'rinyapti | `document.key` yangi versiyada o'zgarmagan |
| Oq ekran, konsolda skript xatosi | DS HTTP orqali berilyapti, sayt HTTPS — mixed content bloklangan |
| Editor umuman chiqmaydi, fallback turibdi | `configured` hamon `false` yoki `document_server_url` bo'sh |

---

## Qabul qilish sharti

1. `https://office.lexgo.uz/healthcheck` → `true`
2. Editor endpoint `configured: true` va to'ldirilgan `document_server_url` qaytaradi
3. Advokat sahifani ochganda Word editor iframe ichida ochiladi
4. Matn kiritilganda DS callback (`status: 6`) yuboradi, backend draft'ni saqlaydi
5. Sahifa qayta yuklanganda saqlangan matn joyida turadi
6. "Mijozga yuborish" bosilganda `file_ready` bo'ladi va mijoz DOCX'ni yuklab oladi
7. Telefonda ham editor ochiladi (`type: "mobile"` backend tomonidan qo'yiladi)

---

Manba: `LEXGO_FRONTEND_WORD_EDITOR_DESIGN_GUIDE.md` — *"Lekin production target:
`configured=true`"*. Frontend tomon to'liq tayyor va shu spetsifikatsiyaga mos;
ushbu ro'yxatdagi ishlar bajarilgach qo'shimcha frontend o'zgarishi talab
qilinmaydi.
