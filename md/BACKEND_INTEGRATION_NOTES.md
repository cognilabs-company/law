# LexGo — Backend integratsiya eslatmalari

Bu hujjat **frontend'da qilingan barcha o'zgarishlar** bo'yicha backend jamoasi
uchun. Har bir bo'limda: **nima** qo'shildi, **qanday** (endpoint / payload /
javob shakli), **nega** kerak bo'lgani yozilgan.

Belgilar:
- 🟢 **Mavjud endpoint** — frontend allaqachon chaqiryapti, backend'da bor (yoki bo'lishi kerak).
- 🔴 **YANGI endpoint kerak** — frontend chaqiradi, backend'da hozircha yo'q. `fail-soft` (xatoni yutadi), lekin ishlashi uchun backend qo'shishi shart.
- 🔵 **Biznes qoida** — backend tomonda ham majburlash (enforce) kerak.

Server: `https://lexgo.api.cognilabs.org`
Frontend proxy: `/api/backend/*` → yuqoridagi origin (faqat HTTP, WebSocket'ni upgrade qilmaydi — WS to'g'ridan-to'g'ri backendga ulanadi).

---

## 1. Auth va Registratsiya

### 1.1. Ism / Familiya alohida
**Nima:** Registratsiyada ism va familiya ikkita alohida input bo'ldi.
**Nega:** Foydalanuvchi ma'lumotini toza (structured) saqlash.

🟢 `POST /auth/register/start` — endi qo'shimcha `first_name` va `last_name` yuboriladi:
```json
{
  "role": "client | yurist | advokat",
  "name": "Alisher Karimov",
  "first_name": "Alisher",
  "last_name": "Karimov",
  "phone": "+998901234567",
  "password": "……"
}
```
- `name` = `first_name + " " + last_name` (moslik uchun saqlab qoldik).
- `first_name`/`last_name` faqat to'ldirilgan bo'lsa yuboriladi.
- **So'rov:** backend `first_name`/`last_name` ni alohida ustunlarga yozsin.

### 1.2. Telefon formati
**Nima:** Barcha telefon inputlari avtomatik `+998` bilan boshlanadi va
`+998 90 123 45 67` ko'rinishida mask qilinadi. API'ga **doim toza E.164**
yuboriladi: `+998XXXXXXXXX` (9 raqam).
**Nega:** Bir xil format, validatsiya oson.
- Login (`POST /auth/login`) va register — hammasi `+998XXXXXXXXX`.

### 1.3. 🔵 Sotuvchi (yurist/advokat) registratsiyasi — CRM tasdiqisiz
**Nima (so'ralgan):** Yurist yoki advokat ro'yxatdan o'tganda CRM/admin
tasdig'i **shart bo'lmasin** — darrov kirsin.
**Hozirgi holat:** `POST /auth/register/verify` sotuvchi rollari uchun token
qaytarmasa (yoki `status: "pending"` / `request_id` qaytarsa), frontend
"admin tasdig'i kutilmoqda" ekranini ko'rsatadi.
**So'rov:** agar tasdiq kerak bo'lmasa, backend `verify` da **darrov
`access_token` + `user`** qaytarsin. Shunda frontend to'g'ridan-to'g'ri
portalga kiritadi (kod tayyor).

---

## 2. Yurist / Advokat profili — `PUT /lawyers/me`

🟢 `upsertMyLawyer` endi quyidagi **yangi/o'zgargan maydonlarni** yuboradi:
```json
{
  "seller_type": "yurist | advokat | advokat_tashkiloti",
  "region": "tashkent",
  "district": "",
  "license_number": "ADV-2015-4821",
  "bar_association": "",
  "advocate_structure": "byuro | firma | hayat",   // YANGI
  "organization_name": "…",                          // YANGI (tuzilma nomi / manzil)
  "experience_years": 7,                             // = ADVOKAT sifatidagi yillar
  "lawyer_experience_years": 3,                      // YANGI = YURIST sifatidagi yillar
  "specializations": ["family-divorce", "court-lawsuit", …], // katalog kalitlari (5-bo'lim)
  "languages": [],
  "bio": "",
  "education": "",
  "wins_count": 78,          // = TO'LIQ yutilgan ishlar (ilgari casesWon edi)
  "partial_wins_count": 30,  // = QISMAN yutilgan ishlar (aybi yengillashtirilgan)
  "base_hourly_price": 0
}
```

O'zgarishlar sababi:
- **`advocate_structure` + `organization_name`** — advokat qaysi tuzilmada
  ishlashini (byuro / firma / hay'at) va uning nomini so'raymiz.
- **`experience_years` + `lawyer_experience_years`** — bitta "Tajriba (yil)"
  o'rniga **ikkita** tajriba: advokat bo'lib va yurist bo'lib ishlagan yillar.
- **`wins_count` / `partial_wins_count`** — "Yutilgan ishlar" ikkiga bo'lindi:
  to'liq yutilgan va qisman yutilgan (jinoiy ishda aybi yengillashtirilgan yoki
  talab qisman qanoatlantirilgan). 6-bo'limga qarang.
- **`bar_association` — endi so'ralmaydi** (formadan olib tashlandi). Bo'sh
  yuborilishi mumkin; backend uni ixtiyoriy qilsin.
- **Yurist registratsiyasi soddalashtirildi** — yurist faqat ism/familiya +
  viloyat + parol beradi; litsenziya/foto/ta'lim/bio **so'ralmaydi**. Bularni
  keyin profil orqali to'ldiradi.

---

## 3. Yuridik xizmatlar katalogi (advokat vs yurist)

**Nima:** Frontend'da 17 kategoriya / 155 ta ichki xizmatdan iborat
trilingual (uz/ru/en) katalog bor: `lib/legalServices.ts`. Advokat
registratsiyasida "Yo'nalishlar" bosqichida shu katalogdan tanlaydi
(ixtiyoriy). Tanlangan kalitlar `specializations` sifatida yuboriladi
(2-bo'lim).

**Kalit formati:** kategoriya-prefiksli kebab, masalan `family-divorce`,
`court-lawsuit`, `criminal-defense`. Global unikal.

### 🔵 3.1. Advokat-only kategoriyalar
Quyidagi 3 kategoriya **faqat advokatlar** uchun — **yurist ularni
tanlay/taklif qila olmaydi**:
- `court` — Sud va nizolar
- `criminal` — Jinoyat ishlari
- `administrative` — Ma'muriy ishlar

Frontend UI'da ular "Faqat advokatlar" belgisi bilan va yurist uchun
qulflangan. **So'rov:** backend ham `seller_type = yurist` bo'lganda bu
kategoriyalardagi xizmatlarni taklif qilishga ruxsat bermasin (server-side
validatsiya).

> Katalog to'liq ro'yxati `lib/legalServices.ts` faylida (kalit + uz/ru/en
> nomlari). Backend o'z xizmat katalogiga map qilishi yoki kalitlarni satr
> sifatida saqlashi mumkin.

---

## 4. Directory — advokat/yurist ajratish

**Nima:** Mijozga advokatlar va yuristlar **alohida** ko'rsatiladi (filtr:
Hammasi / Advokatlar / Yuristlar) va har bir kartada rol belgisi bor.
**Nega:** Mijoz kim bilan ishlayotganini bilishi kerak.

🟢 `GET /lawyers` — frontend `seller_type` maydoniga qarab ajratadi
(`advokat*` → advokat, aks holda → yurist). **So'rov:** `seller_type` har doim
to'g'ri qaytsin.

---

## 5. Advokat statistikasi

**Nima:** Statistika bosqichi qayta ishlandi (majburiy emas):
- olib tashlandi: *amaliyot yillari*, *vakillik qilingan mijozlar*;
- "Yutilgan ishlar" → **to'liq yutilgan** (`wins_count`) va **qisman
  yutilgan** (`partial_wins_count`), har biriga qisqa izoh;
- muvaffaqiyat foizi = `(to'liq + qisman) / jami` (frontend hisoblaydi).

Backend: `PUT /lawyers/me` da `wins_count` / `partial_wins_count` (2-bo'lim).

> Eslatma (so'ralgan): statistika bosqichini **registratsiyadan butunlay
> chiqarib**, profilga ko'chirish taklif qilingan — bu hali kelishilmagan,
> hozircha registratsiyada. Qaror qabul qilingach yangilanadi.

---

## 6. Qo'ng'iroqlar (audio / video) va Zoom

### 6.1. 🔵 Faqat call-center advokatlari qo'ng'iroq boshlaydi
**Nima:** Video/audio qo'ng'iroqni **faqat call-center'da o'tirgan
advokatlar** boshlay oladi. Qolganlar (mijoz, oddiy yurist/advokat) faqat
qabul qila/ulanа oladi.
Frontend `roles` da `call_center` (yoki `call_center_lawyer`) bo'lsagina
boshlash tugmalarini ko'rsatadi.
**So'rov:** backend ham `POST /secure-chats/{roomId}/calls` ni faqat
call-center rollariga ruxsat bersin.

### 6.2. 🔴 Zoom qo'ng'irog'i — YANGI endpoint
**Nima:** Call-center advokatlariga chatда "Zoom" tugmasi qo'shildi. Bosilganda
Zoom meeting yaratiladi, host (advokat) uchun ochiladi va join havolasi chatga
xabar sifatida tashlanadi.
**Nega:** Video suhbatni Zoom orqali o'tkazish.

🔴 `POST /secure-chats/{roomId}/zoom`  (body: `{}`)
Javob:
```json
{
  "join_url": "https://zoom.us/j/…",
  "start_url": "https://zoom.us/s/…",   // host uchun
  "meeting_id": "…"
}
```
- Backend Zoom API orqali meeting yaratsin (server-to-server OAuth).
- `start_url` — advokatga (host), `join_url` — ikkinchi tomonga.
- Frontend `join_url` ni chatga yuboradi; **Zoom havolalari kontakt
  filtridan ozod** (8.1 ga qarang).

---

## 7. Chat — kontakt filtri, saqlash muddati, o'chirish

### 7.1. 🔵 Username / kontakt bloklash
**Nima:** Chatда username'lar, telefon raqamlar, ijtimoiy tarmoq havolalari
va tashqi linklar **maskalanadi** (`•••`), platformadan tashqari kontakt
almashinmasligi uchun.
**Hozir:** backend allaqachon `filtered_content`, `is_blocked`, `block_reason`
qaytaradi — frontend shularni ishlatadi + qo'shimcha display-mask qo'yadi.
**So'rov:** backend ham server tomonda kontakt almashinishni bloklasin. **Zoom
havolalari (`zoom.us`) bundan mustasno** — ular ruxsat etilgan.

### 7.2. 🔴 Chat auto-o'chirish sozlamasi — YANGI endpoint
**Nima:** Foydalanuvchi xabarlar qancha vaqtda o'chishini tanlaydi:
o'chmasin / 24 soat / 7 kun / 30 kun.

🔴 `PATCH /secure-chats/{roomId}/settings`
```json
{ "auto_delete_hours": 0 }   // 0 = o'chmasin, 24, 168 (7 kun), 720 (30 kun)
```

### 7.3. 🔴 Chatni o'chirish (arxiv) — YANGI endpoint
**Nima:** Foydalanuvchi chatni o'chira oladi. **Bizning bazada 1 oy arxivda**
saqlanishi kerak (tiklash imkoni bilan).

🔴 `DELETE /secure-chats/{roomId}`
- Soft-delete: ~30 kun arxivda qolsin, keyin butunlay o'chsin.

---

## 8. Sovg'alar — xizmatni ham sovg'a qilish

**Nima:** Ilgari faqat obuna (tarif) sovg'a qilinardi. Endi **xizmat turini
ham** sovg'a qilsa bo'ladi (UI'da Tarif / Xizmat toggle).

🟢 `POST /gifts` — endi `plan_id` **yoki** `service_id` yuboriladi:
```json
// Tarif sovg'asi:
{ "plan_id": "…", "recipient_phone": "+998…", "term_months": 6, "message": "…", "provider": "demo_payme" }

// Xizmat sovg'asi:
{ "service_id": "…", "recipient_phone": "+998…", "message": "…", "provider": "demo_payme" }
```
- `GET /gifts` javobida frontend `plan_name` **yoki** `service_name` ni o'qiydi.
- **So'rov:** backend `service_id` bilan sovg'ani qo'llab-quvvatlasin.

---

## 9. Oila a'zolari — tarifdan ulashilgan foydalanish

**Nima:** Egasi faol tarif sotib olgan bo'lsa, **ruxsat berilgan oila
a'zolari** undan foydalana oladi. Har bir a'zoga "ruxsat berish" toggle'i
qo'shildi.

🟢 `GET /clients/me/family-members` — javobga **`shared_access`** (bool)
qo'shilsin (yoki `can_use_plan`).

🔴 `PATCH /clients/me/family-members/{id}`
```json
{ "shared_access": true }
```
- **Biznes qoida:** `shared_access = true` va egada faol tarif bo'lsa → o'sha
  a'zo tarif imkoniyatlaridan foydalana oladi. Backend shu ruxsatni tekshirsin.

---

## 10. 🔴 Foydalanuvchi faoliyat loglari — YANGI endpoint

**Nima:** Profilда "Faoliyat tarixi" paneli qo'shildi — foydalanuvchi o'z
harakatlarini ko'radi.

🔴 `GET /users/me/activity`
Javob (ro'yxat):
```json
{
  "items": [
    {
      "id": "…",
      "action": "login | logout | payment | subscription | gift | document | chat | …",
      "detail": "qisqa tavsif",
      "ip": "1.2.3.4",
      "created_at": "2026-09-05T12:00:00Z"
    }
  ]
}
```
- **So'rov:** backend foydalanuvchi harakatlarini (kirish, to'lov, sovg'a,
  obuna, hujjat, chat va h.k.) log qilsin va shu endpoint orqali qaytarsin.
- Frontend `action` ni tarjima qiladi (noma'lum bo'lsa xom ko'rsatadi).

---

## 11. Sotuv voronkasi (CRM pipeline)

**Nima:** Yangi admin sahifa `/admin/pipeline` — lidlar kanban bo'ylab:
**Yangi → Aloqa qilingan → Malakali → Yutildi / Yo'qotildi**. Kartada bosqichni
o'zgartirish tugmalari.

🟢 Mavjud endpointlardan foydalanadi:
- `GET /admin/leads` — lidlar ro'yxati.
- `PATCH /admin/leads/{id}` `{ "status": "…" }` — bosqichni o'zgartirish.

Frontend bosqich (status) qiymatlari: `new`, `contacted`, `qualified`, `won`,
`lost`. Eski qiymatlar map qilinadi: `in_progress → contacted`,
`converted → won`, `rejected → lost`.
**So'rov:** backend shu status satrlarini qabul qilsin; ideal holda pipeline
bosqichlarini standartlashtirsin.

---

## 12. UI-only o'zgarishlar (backend'ga ta'sirsiz)

Bularni faqat kontekst uchun sanaymiz — backend o'zgarishi shart emas:
- "AI" → **"Sun'iy intellekt"** (uz), "ИИ" (ru) — brend "LexGo.AI" saqlangan.
- Telefon +998 avto-mask; login/register **Orqaga** tugmasi.
- Yurist/Advokat **ikonlari** yangilandi.
- Advokat paneli: "Biznes" → **"Loyiha boshqaruv paneli"**.
- Registratsiyada **til tanlash** (gaplashadigan tillar) olib tashlandi.
- Mijoz kartasi matnlari: "mutaxassis" → "advokat/yurist", "Sifat standartlari
  asosida xizmat ko'rsatuvchi yurist va advokatlar".
- Mutaxassislik **dropdown**: jinoiy-ma'muriy / iqtisodiy-fuqaroviy / ikkalasi.
- Mijoz "Hujjatlar" sahifasi → **"Hujjat namunalari"** + yangi tavsif
  ("Bizning professional advokatlar tomonidan tayyorlangan hujjat
  namunalaridan bemalol foydalanishingiz mumkin"). Frontend `visibility ==
  "client"` shablonlarni ko'rsatadi (backend o'zgarishsiz).

---

## 13. Hali qilinmagan (kelishilishi kerak)

- ⏳ **AI filtr → call-center lead:** mijoz muammoni tavsiflaganda AI uni
  filtrlaydi va **call-center'ga lead** sifatida uzatadi (operator gaplashadi).
  Backend: AI intake → lead yaratish + call-center'ga marshrutlash oqimi kerak.
- ⏳ **OneID / MyID integratsiyasi:** davlat e-ID orqali kirish/tasdiqlash.
  Backend: OAuth/OneID provayder integratsiyasi kerak.

---

## 14. YANGI endpointlar — qisqa checklist (backend)

| Metod | Path | Maqsad |
|---|---|---|
| POST | `/secure-chats/{id}/zoom` | Zoom meeting yaratish (join/start URL) |
| PATCH | `/secure-chats/{id}/settings` | Chat auto-o'chirish (`auto_delete_hours`) |
| DELETE | `/secure-chats/{id}` | Chatni o'chirish (~1 oy arxiv) |
| PATCH | `/clients/me/family-members/{id}` | `shared_access` toggle |
| GET | `/users/me/activity` | Foydalanuvchi faoliyat loglari |

**Mavjud endpointlarga qo'shimchalar:**
- `POST /auth/register/start` — `first_name`, `last_name`.
- `POST /auth/register/verify` — sotuvchilarga darrov token (tasdiqsiz, agar kelishilса).
- `PUT /lawyers/me` — `advocate_structure`, `organization_name`,
  `lawyer_experience_years`, `wins_count`, `partial_wins_count`.
- `GET /lawyers` — `seller_type` ishonchli qaytishi.
- `POST /gifts` — `service_id` qo'llab-quvvatlash.
- `GET /clients/me/family-members` — `shared_access` qaytarish.
- `PATCH /admin/leads/{id}` — pipeline status qiymatlari.

**Server-side majburlash kerak (biznes qoidalar):**
- Advokat-only kategoriyalar (`court`, `criminal`, `administrative`) — yurist offer qila olmasin.
- Qo'ng'iroq boshlash — faqat call-center advokatlari.
- Chat kontakt filtri (Zoom bundan mustasno).
- Oila `shared_access` + faol tarif → tarifdan foydalanish.

---

## 15. Law Marketplace modullari — yangi endpointlar (2-sessiya)

CIMS project 14 modul kartalari uchun UI qurildi. Quyidagi endpointlar frontend tomonidan chaqiriladi (hozircha **fail-soft**; backend qo’shishi kerak). Hammasi `Authorization: Bearer` bilan.

| Modul | Metod | Path | Izoh |
|---|---|---|---|
| SOS / shoshilinch | POST | `/sos` | `{category,description,phone?}` → `{id,status,duty_lawyer{name},chat_room_id}` |
| Referral | GET | `/referrals/me` | `{code,link,invited_count,joined_count,reward_balance,items[]}` |
| Reviews | GET | `/reviews/pending` | baholanmagan ishlar `[{id,case_id,lawyer_user_id,lawyer_name,service,completed_at}]` |
| Reviews | POST | `/reviews` | `{case_id?,lawyer_user_id?,rating,comment?}` |
| Reviews | GET | `/reviews/me` | `[{id,lawyer_name,rating,comment,created_at}]` |
| Complaints | GET/POST | `/complaints` | POST `{category,subject,description,case_id?}` |
| Complaints (admin) | GET | `/admin/complaints` | admin ko’rinishi |
| Warranty | GET/POST | `/warranty/claims` | POST `{case_id?,reason,kind:"replacement"}` |
| Academy | GET | `/academy/courses/catalog` | `[{id,title,category,lessons_count,duration_min,level,progress,cover_url}]` |
| Tasks | GET | `/tasks/me` | `[{id,title,status,priority,due_date,case_title}]` |
| Tasks | PATCH | `/tasks/{id}/status` | `{status: todo|doing|done}` |
| Matching | GET | `/matching/me` | `[{lawyer_user_id,name,area,region,rating,match_pct,reason,seller_type}]` |
| Call analytics | GET | `/calls/analytics` | `{total,answered,missed,avg_duration_sec,by_day[],top_agents[]}` |
| CEO dashboard | GET | `/analytics/ceo` | `{revenue,revenue_delta_pct,mrr,users,active_users,conversion_pct,funnel[],channels[],revenue_trend[]}` |
| Quality | GET | `/quality/overview` | `{avg_rating,response_sla_pct,complaint_rate,resolved_pct,flagged[]}` |
| B2B | GET | `/b2b/clients` | `[{id,name,industry,contact,stage,value}]` |
| Retention | GET | `/retention/overview` | `{at_risk,churned_this_month,retained_pct,at_risk_clients[],upsell[]}` |
| AI classify | POST | `/ai/classify` | `{text}` → `{category,urgency,summary,recommended_service,confidence,lead_id,routed_to}` (call-center’ga lead) |
| AI doc analysis | POST | `/ai/document-analysis` | `{text}` → `{summary,risks[{level,text}],recommendations[]}` |
| AI assistant | POST | `/ai/assistant` | `{prompt,context?}` → `{answer}` |

Pipeline (mavjud `/admin/leads`, `PATCH /admin/leads/{id}`) status qiymatlari: `new,contacted,qualified,won,lost` (+ `re-engage` = lost→new).
To’liq reja va holat: `LAW_MARKETPLACE_PLAN.md`.
