# Tezkor Himoya frontend → backend: Executive HRM, Live Office, realtime AI va CEO analitika (2026-11-13)

Javob hujjati: `TEZKOR_HIMOYA_EXECUTIVE_HRM_LIVE_AI_FRONTEND_2026_11_13.md`.

Hujjatdagi 8 ta yo'nalishning hammasi frontendda qilindi va production'ga chiqdi (`https://law-two-tau.vercel.app`, oxirgi commit `406e5589`). Hammasi **mock backend** bilan tekshirildi. Haqiqiy akkaunt bilan tekshirilmadi, chunki MD'da bir nechta javobning aniq JSON shakli yo'q edi. Frontend shu javoblarning bir nechta mumkin bo'lgan kalit nomini o'qiydi va hech qachon o'zi raqam o'ylab chiqarmaydi: kelmagan qiymat `—` bo'lib chiqadi, `not_connected` esa "Ulanmagan" deb.

Quyida har bo'lim uchun: frontend nima yuboradi va nima o'qiydi, keyin **savol** yoki **iltimos**. Eng muhimlari ⚠️ bilan belgilangan.

---

## 0. Umumiy

### 0.1 ⚠️ Test akkauntlari

Haqiqiy javoblarni tekshirish uchun staging yoki production'da quyidagi test akkauntlari kerak. Parollarni xavfsiz kanal orqali bering.

| Rol | Nima tekshiriladi |
|---|---|
| CEO (`executive.analytics.view`) | CEO paneli → "Platforma va ilovalar" |
| IT bo'limi rahbari (ruxsatsiz, faqat rahbar sifatida) | HRM → IT monitoring |
| `it.monitoring.view` ruxsati bor xodim | HRM → IT monitoring |
| Sotuv bo'limi rahbari (unit head) | HRM → Mening bo'limim, jadvallar |
| ROP (`sales_scripts.manage`) | CRM → Sotuv skriptlari |
| Operator (`realtime_ai.use`) | Qo'ng'iroqdagi AI paneli |
| Navbatchi yurist (`call_center_lawyer` + `realtime_ai.use`) | AI qoralama, qo'ng'iroqdagi AI |

### 0.2 Ruxsat kodlari `/auth/me` da keladimi?

Frontend menyu va tugmalarni `/auth/me` → `permissions[]` bo'yicha ko'rsatadi. Quyidagi kodlar u yerda aynan shu nom bilan keladimi?

- `executive.analytics.view`
- `it.monitoring.view`
- `sales_scripts.manage`
- `realtime_ai.use`
- `realtime_ai.manage`

Navbatchi yurist `roles[]` ichida `call_center_lawyer` bilan keladimi?

### 0.3 403 kodlari

Har bir endpoint uchun 403 da qaysi `detail.code` qaytadi? MD'da faqat `it_monitoring_permission_required`, `department_schedule_scope_denied`, `department_schedule_employee_scope_denied`, `duty_lawyer_ai_required` va `lawyer_ai_cross_owner_access_denied` bor. Quyidagilar uchun kod kerak:

- `GET /analytics/ceo/platform` — CEO emas;
- `GET /internal/department/dashboard` — bo'lim rahbari emas;
- `/internal/sales-scripts/*` — `sales_scripts.manage` yo'q;
- `/internal/realtime-ai/*` — `realtime_ai.use` yo'q.

---

## 1. Mahsulot analitikasi (§3) — veb-sayt

**Frontend nima qiladi:**

- Foydalanuvchi cookie oynasida "Analitika"ga rozilik bermaguncha hech narsa yubormaydi va qurilmada hech narsa saqlamaydi. Rozilik qaytarib olinsa, ID'lar o'chiriladi.
- `GET /analytics/product/config` ni bir marta o'qiydi. `enabled=false` bo'lsa yoki `platforms` ichida `web` bo'lmasa, yubormaydi. Ro'yxatda yo'q `event_name` yuborilmaydi.
- `POST /analytics/product/events`: 8 soniyada bir partiya (100 tagacha). Sahifadan chiqishda `fetch(keepalive)` bilan yuboradi.
- Yuborilmagan hodisalar keyingi sahifada qayta yuboriladi, shuning uchun bir xil `event_id` ikki marta kelishi mumkin. Hujjatga ko'ra bu xavfsiz (dublikat).
- Login bo'lsa `Authorization: Bearer`. Token eskirib 401 kelsa, o'sha partiyani tokensiz (anonim) qayta yuboradi.

**Maydonlar:**

| Maydon | Qiymat |
|---|---|
| `anonymous_id` | `install-<uuid v4>` (brauzerda saqlanadi) |
| `session_id` | `session-<uuid v4>`; 30 daqiqa harakatsizlikdan keyin yangi sessiya |
| `platform` | `"web"` |
| `app_version` | `"web-0.1.0"` |
| `screen` | yo'ldan olinadi, til va ID'larsiz: `/uz/lawyers/<id>` → `lawyers_id`, `/` → `home` |

**Hodisalar:**

- `app_opened`, `session_started`, `session_ended`, `screen_viewed`
- `register_started`, `phone_entered`, `otp_started`, `otp_succeeded`
- `lawyer_viewed`, `service_viewed`
- `purchase_started` (har `POST /payments` dan oldin)
- `payment_page_opened`
- `payment_succeeded` / `payment_failed` (to'lovdan qaytganda, `GET /payments/{id}` holati bo'yicha)

**`properties` da faqat shular boradi:** `lawyer_id` (seller user id), `surface`, `service_id`, `target_type`, `provider`, `amount`, `payment_id`, `channel` (OTP kanali), `resend`, `account_type`. Telefon, email, ism va pasport yuborilmaydi. Frontend ham ularni kalit nomi va qiymati bo'yicha qo'shimcha filtrlaydi.

**Savollar:**

1. `app_version` veb uchun `web-0.1.0` mos keladimi? Yoki deploy SHA kerakmi (masalan `web-406e5589`)?
2. Veb `app_installed` yubormaydi (store o'rnatish emas). To'g'rimi?
3. `session_ended` vebda **keyingi sessiya boshlanganda** yuboriladi. Bunda `occurred_at` = oxirgi faollik vaqti, `duration_ms` = haqiqiy davomiylik. Tab yopilganda brauzer buni ishonchli yubora olmaydi. Shu yondashuv qabul qilinadimi?
4. Yuqoridagi `properties` kalitlaridan birortasi `analytics_pii_property_forbidden` ga tushadimi? Ayniqsa `lawyer_id` va `payment_id`.
5. `app_crashed` vebda hozircha yuborilmaydi. Veb uchun kerakmi? Kerak bo'lsa, `properties` da nima bo'lishi kerak (xato turi, sahifa)?

---

## 2. CEO paneli — `GET /analytics/ceo/platform` (§4)

**Frontend:** `?timezone=Asia/Tashkent`. Davr tanlanganda `date_from` va `date_to` ham yuboriladi. Sahifa faqat `executive.analytics.view` yoki `is_primary_superadmin=true` ga ko'rinadi. Oddiy superadmin'ga ko'rinmaydi.

### 2.1 ⚠️ Javob namunasi kerak

Iltimos, to'liq JSON namunasini yuboring. Frontend hozir quyidagi shaklni kutadi va bir nechta muqobil nomni ham o'qiydi:

```json
{
  "period": { "date_from": "2026-10-15", "date_to": "2026-11-13", "timezone": "Asia/Tashkent" },
  "previous_period": { "date_from": "2026-09-15", "date_to": "2026-10-14" },
  "summary": {
    "unique_users": { "value": 1840, "previous": 1520, "change_pct": 21.05 },
    "sessions": { "value": 5230, "previous": 4410 },
    "avg_session_duration_ms": { "value": 312000, "previous": 290000 },
    "orders": { "value": 212, "previous": 230 },
    "paid_revenue": { "value": 48250000, "previous": 39100000 },
    "ai_runs": { "value": 3120, "previous": 2600 },
    "calls": { "value": 640, "previous": 610 }
  },
  "installs": { "android": { "status": "not_connected" }, "ios": { "installs": 3 } },
  "connectors": { "google_play": { "status": "not_connected" }, "app_store": { "status": "not_connected" }, "uztelecom_sip": { "status": "not_connected" } },
  "platform_usage": [ { "platform": "web", "unique_users": { "value": 1500, "previous": 1300 }, "sessions": { "value": 4100 }, "events": { "value": 22000 } } ],
  "retention": { "d1": 41.2, "d7": 22.5, "d30": 11.8 },
  "app_versions": [ { "platform": "android", "app_version": "1.2.0", "users": 180, "share_pct": 81.8 } ],
  "crash_free_pct": 99.4,
  "funnel": [ { "step": "register_started", "count": 820 }, { "step": "phone_entered", "count": 760, "conversion_pct": 92.7 } ],
  "calls": { "inbound": { "value": 420 }, "outbound": { "value": 220 }, "answered": { "value": 560 }, "missed": { "value": 80 }, "status": "connected" },
  "ai": { "completed": { "value": 3050 }, "failed": { "value": 70 } },
  "hrm": { "present": 34, "active_employees": 41 },
  "event_comparison": [ { "event_name": "app_opened", "count": 9800, "previous": 8100, "change_pct": 21.0 } ],
  "generated_at": "2026-11-13T15:10:00Z"
}
```

### 2.2 Aniqlashtirish

1. **Birliklar.**
   - O'rtacha sessiya millisoniyadami yoki soniyadami?
   - `paid_revenue` butun so'mdami (tiyin emasmi)?
   - `retention` va `crash_free_pct` 0–100 foizdami yoki 0–1 ulushdami?
2. **O'zgarish foizi.** `change_pct` har metrikada keladimi? Kelmasa, frontend uni `value` va `previous` dan o'zi hisoblaydi.
3. **Ulanmagan manbalar.** `status: "not_connected"` qaysi bloklarda bo'lishi mumkin: installs, connectors, calls (SIP)? Ulanmagan bo'lsa, `value` `null` keladimi yoki 0? Frontend `not_connected` ko'rsa, qiymatni baribir ko'rsatmaydi.
4. **Voronka.** Qadamlar tartibi backend'dan qanday keladimi, shundaymi? `conversion_pct` oldingi qadamga nisbatanmi yoki birinchi qadamgami?
5. **Noto'g'ri davr.** `date_from > date_to` yoki juda uzun davr uchun 422 kodi va maydon nomi qanday?

---

## 3. IT monitoring — `GET /internal/it/monitoring/overview` (§5)

**Frontend:** HRM → "Rahbariyat" → "IT monitoring". Har daqiqada yangilaydi. Menyu bandi `it.monitoring.view` bo'lsa darhol chiqadi. Ruxsat bo'lmasa, frontend endpointni bir marta so'raydi: 200 bo'lsa (IT rahbari) chiqadi, 403 bo'lsa yashirinadi.

1. ⚠️ **Javob namunasi kerak.** Frontend kutadigan shakl:

   ```json
   {
     "snapshot": { "captured_at": "2026-11-13T15:20:00Z" },
     "connectors": {
       "database": { "status": "ok", "latency_ms": 4 },
       "redis": { "status": "ok" },
       "websocket": { "status": "ok" },
       "workers": { "status": "degraded", "detail": "..." },
       "ai": { "status": "ok" },
       "payments": { "status": "ok" },
       "sip": { "status": "not_connected" }
     },
     "open_incidents": [ { "id": "...", "title": "...", "severity": "high", "status": "open", "component": "workers", "opened_at": "..." } ]
   }
   ```

2. **`status` lug'ati qanday?**
   - Frontendda yashil: `ok`, `healthy`, `up`, `connected`, `running`.
   - Sariq: `degraded`, `slow`.
   - Kulrang: `not_connected`, `not_configured`.
   - Qolgan hammasi qizil.
3. **Severity qiymatlari** qanday (`critical`, `high`, `medium`, `low`)?
4. **Realtime.** Yangi hodisa yoki connector holati o'zgarganda WebSocket event keladimi? Kelmasa, 60 soniyalik yangilash yetadimi?

---

## 4. Bo'lim rahbari (§6)

**Frontend:** HRM → "Rahbariyat" → "Mening bo'limim".

- Sahifada xodimlar soni, hozir tizimdagilar, jadvallar soni, bo'lim va guruhlar ro'yxati, xodimlar ro'yxati va jadvallar bor.
- Oylik va moliya ko'rsatilmaydi.
- Menyu bandi `GET /internal/department/dashboard` 200 qaytarsagina chiqadi.

1. ⚠️ **Guruh nomlari.** Dashboard faqat unit ID'larini beradi. Rahbar odatda `GET /internal/org/units` ni o'qiy olmaydi (`internal_org.manage` yo'q). Shuning uchun xodimi yo'q guruh "Nomsiz guruh" bo'lib chiqyapti. **Iltimos:** dashboard javobiga `units: [{ "id", "name", "parent_id" }]` qo'shing.
2. ⚠️ **Jadvallar ro'yxati.** MD'da faqat yaratish bor. Frontend `GET /internal/department/schedules` ni so'raydi: bo'lsa, ro'yxatni ko'rsatadi; 404 bo'lsa, faqat sonini. **Iltimos:**
   - ro'yxat endpointini qo'shing (scope bo'yicha, `limit` va `offset` bilan, unit va xodim filtri bilan);
   - jadvalni o'zgartirish va o'chirish (yoki nofaol qilish) endpointlari ham kerak.
3. **Xodimlar.** Ro'yxat `GET /internal/employees/directory` dan olinib, dashboard'dagi unit ID'lari bo'yicha filtrlanadi. Har bir xodimning hozirgi holatini (onlayn yoki oflayn) beradigan bo'lim endpointi bormi? Dashboard'da faqat umumiy `online_count` bor.
4. **Hafta kunlari.** `weekday` raqamlari: `0` = dushanba … `6` = yakshanba. To'g'rimi?
5. **Takroriy jadval.** Xodimda allaqachon faol jadval bo'lsa, yangisi nima bo'ladi: eskisi almashadimi, 409 qaytadimi yoki ikkalasi ham turadimi?

---

## 5. Live Office (§7)

**Frontend:**

- `room_type: "remote"` yoki `meta.outside_office: true` bo'lgan xona ofis rejasiga chizilmaydi. Xarita ko'rinishida unda o'tirganlar rejaning ostidagi alohida "Masofaviy ish" lavhasida chiqadi. Ro'yxat ko'rinishida ular "Ofisdan tashqarida" guruhida turadi.
- Heartbeat faqat ichki xodimlar uchun ketadi. Chiqishda va sahifa yopilganda sessiya `/internal/live-office/sessions/{id}/end` bilan yopiladi.

1. ⚠️ **Xodim masofaviy xonaga qanday tushadi?** Heartbeat'da frontend `room_id: null` yuboradi.
   - Backend uni a'zolik (membership) bo'yicha o'zi qo'yadimi?
   - Yoki frontend xodimga "Masofaviy ishlayapman" tugmasini berib, heartbeat'da `room_id: <remote room id>` yuborishi kerakmi?
2. Masofaviy xona `org_unit_id` siz keladimi yoki biror bo'limga bog'langanmi?

---

## 6. Sotuv skriptlari (§8)

**Frontend:** `/admin/crm/scripts`. U `sales_scripts.manage` uchun admin menyusida ham, ROP ish joyida ham ko'rinadi.

Sahifada:
- holat bo'yicha filtr;
- skript kartasi: kirish so'zi, savollar, e'tirozlarga javoblar;
- versiyalar tarixi;
- yangi skript, yangi versiya va versiyani e'lon qilish.

1. ⚠️ **Bitta skriptni o'qish.** `GET /internal/sales-scripts/{id}` bormi? Frontend uni so'raydi, 404 bo'lsa ro'yxatdagi qatorni ishlatadi.
2. ⚠️ **Versiyalar.** Ro'yxatdagi har bir skriptda `versions[]` (raqam, holat, `content`, `change_note`, `created_at`, `published_at`) keladimi? Yoki faqat joriy versiyami? Javob namunasi kerak.
3. **Qiymatlar.** `audience` uchun qaysi qiymatlar ruxsat etilgan? Frontend `call_center`, `sales` va `duty_lawyer` ni taklif qiladi. `language`: `uz_latn`, `uz_cyrl`, `ru`. `service_scope` erkin matnmi yoki ro'yxatdanmi?
4. **`code`.** Takrorlanganda 409 qaytadimi va qaysi kod bilan? Format qoidasi qanday? Frontend `[a-z0-9_]` ga keltiradi.
5. **Arxiv.** Arxivdagi versiyani qayta e'lon qilish mumkinmi?
6. **Operator ko'rinishi.** `sales_scripts.manage` siz operator e'lon qilingan skriptni qo'ng'iroqda o'qishi kerakmi? Kerak bo'lsa, qaysi endpoint orqali? Hozir skript faqat AI orqali ishlatiladi.

---

## 7. Qo'ng'iroqdagi realtime AI (§9)

**Frontend:** LiveKit qo'ng'iroq oynasida `realtime_ai.use` (yoki `.manage`) uchun "AI" paneli.

1. Operator "Yoqish" ni bosadi → `POST /internal/realtime-ai/sessions` ketadi:
   - `call_id` = qo'ng'iroq sessiyasining ID'si (`/secure-chats/{room}/calls/{call_id}` dagi);
   - `source_type: "livekit"`, `language: "auto"`.
2. Keyin `WS /internal/realtime-ai/ws/{id}?token=` ochiladi. Uzilsa, backoff bilan qayta ulanadi.
3. **Transkript** ikki manbadan keladi:
   - **LiveKit `TranscriptionReceived` hodisalari.** `segment_key = "lk-<segment.id>"`. O'z qatnashchisi → `operator` (navbatchi yurist bo'lsa `lawyer`), boshqalar → `client`. Oraliq segment `is_final:false, generate_suggestions:false`, yakuniy segment `true`.
   - **Operator qo'lda yozgan qator** (Mijoz yoki Men tanlanadi).
4. Kartalar: ko'pi bilan 3 ta, priority 1 belgilangan. "Ishlatdim", "Tahrirlash" va "Yopish" → `/suggestions/{id}/decision`.
5. "To'xtatish", "Davom etish" va "Tugatish" bor. Qo'ng'iroq yopilganda `end` avtomatik yuboriladi.
6. `provider_unavailable` kelsa, kichik ogohlantirish chiqadi, qo'ng'iroq davom etadi.
7. Tugagandan keyin `GET /timeline` dan vaqt bo'yicha ro'yxat ko'rsatiladi.

**Savollar:**

1. ⚠️ **Nutq matnga kim aylantiradi?** LiveKit xonasida transkripsiya agenti ishlaydimi va `TranscriptionReceived` ni xonaga yuboradimi? Agar yo'q bo'lsa, AI faqat operator qo'lda yozgan gaplarni oladi. Backend ovozni serverda o'zi matnga aylantirsa, frontend transkript yubormasligi kerakmi? Shuni aniq yozing.
2. ⚠️ **`call_id`.** Bu secure-chat qo'ng'iroq sessiyasining ID'simi yoki LiveKit xona nomimi?
3. **Vaqt hisobi.** `start_ms` va `end_ms` nimadan boshlab sanaladi?
   - LiveKit segmentida vaqt bo'lsa, frontend o'shani yuboradi.
   - Bo'lmasa, AI sessiya boshlangandan beri o'tgan millisoniyani.
   - Qo'ng'iroq yozuvidagi pozitsiya bilan moslashishi uchun asos nima bo'lishi kerak?
4. **`entity_type` va `entity_id`.** Umumiy qo'ng'iroq oynasida frontend ularni yubormaydi. Tezkor so'rov, murojaat (support ticket) yoki CRM lid qo'ng'irog'i uchun qaysi qiymatlar kerak? (`support_ticket`, `urgent_advokat_request`, `lead`?)
5. **Avtomatik yoqish.** Hozir operator "Yoqish" ni o'zi bosadi. Har bir qo'ng'iroqda avtomatik yoqilishi kerakmi?
6. **Pauza.** Pauza paytida frontend transkriptni `generate_suggestions:false` bilan yuborishda davom etadi. Backend buni qabul qiladimi yoki `session_not_active` / 409 qaytaradimi?
7. **WebSocket hodisalari.** `realtime_ai.suggestions` dan boshqa xabarlar ham bormi (sessiya to'xtadi yoki tugadi)? Bo'lsa, `type` nomlari qanday?
8. **Javob shakllari.** `decision` javobi va `timeline` javobining namunasi kerak. Frontend `timeline` dan `transcript[]` + `suggestions[]` yoki bitta `timeline[]` ni o'qiydi.
9. **Yozuv bilan sinxronlash.** Qo'ng'iroq yozuvining URL'i qayerdan olinadi? Uni bilsak, xronologiyani pleer bilan sinxronlaymiz.
10. **CRM va SIP.**
    - CRM lid qo'ng'iroqlarida hozir eski `/crm/calls/{id}/transcript` + `request_ai_assist` ishlaydi. Ular yangi realtime-ai'ga o'tishi kerakmi (`source_type: "crm"`, `call_id` = CRM call id)?
    - SIP ulanganda frontendga nima o'zgaradi?
11. **`realtime_ai.manage`.** Bu ruxsat uchun qanday boshqaruv sahifasi kutilmoqda? Sessiyalar tarixi uchun `GET /internal/realtime-ai/sessions` (filtrlar bilan) bormi?

---

## 8. Navbatchi yurist AI qoralamasi (§10)

**Frontend:** navbatchi yuristning "Hozir" sahifasi → tezkor so'rov → "Tafsilotlar" → "AI qoralama" bloki. U faqat `roles` ichida `call_center_lawyer` bo'lganlarga ko'rinadi, tashqi advokatlarga ko'rinmaydi.

`POST /internal/lawyer-ai/drafts`:

```json
{
  "entity_type": "urgent_advokat_request",
  "entity_id": "<urgent request id>",
  "task_type": "legal_response",
  "instruction": "Mijozga javob qoralamasini va yetishmayotgan savollarni tayyorlang.",
  "context": {
    "urgent_request": { "id": "...", "code": "ADV-...", "service_kind": "...", "service": "...", "need": "...", "directions": [], "region": "...", "status": "...", "meeting_note": "" },
    "documents": []
  },
  "language": "uz_latn"
}
```

Kontekstga mijozning telefoni va kontaktlari qo'shilmaydi.

Keyin yurist qoralamani tahrirlaydi va `/confirm` (approve yoki reject + izoh) yuboradi. Tasdiqlangandan keyin frontend **hech narsa yubormaydi**: yurist matnni nusxalab, o'zi yuboradi.

**Savollar:**

1. ⚠️ **`entity_type`.** `urgent_advokat_request` qabul qilinadimi? Ruxsat etilgan `entity_type` ro'yxatini bering.
2. ⚠️ **Buyurtmalar.** MD misolida `service_order`. Navbatchi yurist xizmat buyurtmasini qayerda ko'radi (qaysi endpoint, qaysi sahifa)? Hozir uning ish stolida faqat tezkor so'rovlar bor, shuning uchun buyurtmalar uchun qoralama ulanmagan.
3. **`task_type`.** `legal_response` dan boshqa qiymatlar bormi?
4. ⚠️ **Javob shakli.** Qoralama matni qaysi maydonda keladi (`content`, `draft_text` yoki `output.content`)? Yetishmayotgan savollar-chi (`missing_questions`)?
5. **Asinxron yaratish.** Qoralama darhol tayyor keladimi yoki `status: "generating"` bilan keladimi? Ikkinchisida polling yoki WebSocket kerak.
6. **Qayta ochish.** Sahifa yangilansa, qoralama yo'qoladi. Entity bo'yicha qoralamalar ro'yxati (`GET /internal/lawyer-ai/drafts?entity_type=&entity_id=`) kerak.
7. **Yuborish va audit.** Tasdiqlangan matnni yurist mijozga chat orqali yuborsa, buni qoralama bilan bog'lash (audit) uchun endpoint bormi (masalan, `POST .../drafts/{id}/executed`)? Yoki secure-chat xabariga `draft_id` qo'shish kerakmi?

---

## 9. Frontend kutayotgan narsalar (qisqa ro'yxat)

| # | Nima kerak | Nega |
|---|---|---|
| 1 | Test akkauntlari (0.1) | Haqiqiy javob bilan tekshirish |
| 2 | `/analytics/ceo/platform` JSON namunasi (2.1) | Raqamlar to'g'ri joyga tushishi uchun |
| 3 | `/internal/it/monitoring/overview` JSON namunasi (3.1) | Ulanishlar va hodisalar |
| 4 | Dashboard'da `units[].name` (4.1) | "Nomsiz guruh" o'rniga nom |
| 5 | Bo'lim jadvallari ro'yxati, tahrirlash va o'chirish (4.2) | Hozir faqat yaratish bor |
| 6 | Masofaviy xonaga qanday tushiladi (5.1) | Xodimni masofaviy xonaga qanday o'tkazish |
| 7 | `GET /internal/sales-scripts/{id}` va versiyalar shakli (6.1–6.2) | Versiyalar tarixi |
| 8 | LiveKit transkripsiya agenti va `call_id` ma'nosi (7.1–7.2) | AI qo'ng'iroqni o'zi eshitishi uchun |
| 9 | Ruxsat etilgan `entity_type` va qoralama javobi shakli (8.1, 8.4) | AI qoralama |
| 10 | Navbatchi yurist buyurtmalari qayerda (8.2) | `service_order` qoralamasi |
