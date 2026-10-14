# LexGo HRM = MedControl HR: backend uchun to'liq endpoint ro'yxati

Sana: 2026-10-14
Muallif: frontend
Qaror: HRM (`/internal`) MedControl HR bilan **birma-bir** bir xil bo'ladi; faqat rang va brending LexGo'niki. Avval backend tayyorlanadi, keyin frontend har bir ekranni ulaydi.

Bu hujjat `LEXGO_HRM_BACKEND_REQUESTS_2026_10_13.md` ni **to'ldiradi**. U yerdagi 1.1–2.2 bandlari shu ro'yxatga kirgan. U yerdagi "Kerak emas (hozircha)" jadvali endi **bekor**: 360 baholash, 9-box, IDP, 1-on-1, LMS pleyeri, reglament testi, rekruting metrikalari, hisobot jadvallari, shtat rejasi, grade va tarixiy ko'rinish — barchasi kerak.

Manba: MedControl web (`web/src/modules/*/api.ts`, 22 modul, 154 marshrut, ~580 chaqiruv) va MedControl backend (`backend/hrm/<modul>/{urls,views,serializers,services}.py`). Aniq javob shakllari va biznes qoidalari uchun shu fayllarga qarang. Ular `medcontrol-hrm-main.zip` arxivida.

---

## 0. Hozirgi holat (tekshirildi 2026-10-14)

`GET /internal/hrm/parity` javobi:

```json
{ "source": "medcontrol_hrm", "expected_models": 208, "covered_models": 208, "catalog_coverage_percent": 100.0, "missing": [] }
```

Ya'ni MedControl'ning 208 ta modeli LexGo katalogida **yozuv turi** sifatida bor (29 domen). Har bir tur uchun quyidagilar ishlaydi:

| Endpoint | Vazifasi |
|---|---|
| `GET /internal/hrm/catalog` | domenlar, yozuv turlari, maydonlar, workflow |
| `GET /internal/hrm/{domain}/schema` | bitta domen sxemasi |
| `GET/POST /internal/hrm/{domain}/records` | ro'yxat (`record_type`, `employee_id`, `org_unit_id`, `status`, `q`, `date_from`, `date_to`, `limit`, `offset`) va yaratish |
| `GET/PATCH /internal/hrm/{domain}/records/{id}` | bitta yozuv |
| `POST /internal/hrm/{domain}/records/{id}/transition` | holat o'tishi (`{status, reason}`) |
| `POST /internal/hrm/{domain}/validate` | yaratishdan oldin tekshirish |
| `GET /internal/hrm/{domain}/summary` | domen bo'yicha soni/holatlar |

Shuning uchun **ma'lumotni saqlash** bor. MedControl ekranlarida yetishmayotgani:

1. **Hisoblovchi va agregat ko'rinishlar** — tabel jadvali, smena matritsasi, qoldiqlar, voronka, 9-box panjarasi, ish haqi hisobi, hisobotlar.
2. **Biznes amallari** — oddiy holat o'zgarishi emas, yon ta'siri bor: hisoblash, generatsiya, ko'chirish, nusxa olish, qayta hisoblash, yopish.
3. **"Mening" ko'rinishlari** — xodim faqat o'zinikini ko'radigan endpointlar.
4. **Fayl eksport/import** — XLSX, PDF, DOCX.

Quyida faqat shu yetishmayotganlar so'raladi. Katalogning oddiy CRUD bilan qoplanadigan resurslari har modul oxirida bir qatorda sanab o'tilgan — ular uchun ish shart emas.

Belgilar: **Bor** — LexGo'da ishlaydi; **Katalog** — `/internal/hrm/{domain}/records` bilan qoplanadi; **Yangi** — qilinishi kerak; **Qisman** — bor, lekin MedControl ekraniga yetmaydi.

Ustuvorlik: **P1** — kundalik HR ishi (xodimlar, tuzilma, davomat, tabel, ta'til, smena, ish haqi, inbox); **P2** — kadrlar jarayonlari (rekruting, onboarding, offboarding, buyruqlar, reglamentlar, KPI va baholash, analitika); **P3** — LMS, xizmat safari, loyihalar, admin.

---

## 1. Umumiy talablar (barcha modullar uchun)

Bular bajarilmasa, alohida endpointlar ham MedControl kabi ishlamaydi.

### 1.1. Ro'yxat konverti, saralash, filtr

Barcha ro'yxatlar (katalog va maxsus) bir xil:

```http
GET ...?q=&sort=-field,field&limit=25&offset=0&filter[field]=value&filter[field]=v1,v2&as_of=2026-10-14
→ { "items": [], "total": 140, "limit": 25, "offset": 0 }
```

- `sort` — vergul bilan bir nechta maydon, `-` kamayish tartibi. Katalogda har qanday maydon bo'yicha.
- `filter[<maydon>]` — katalogdagi istalgan maydon bo'yicha (reference, select, date oraliq: `filter[date][gte]=`).
- `as_of` — muddatli yozuvlar (tayinlash, lavozim, bo'lim versiyasi, komponent) uchun sana bo'yicha holat.
- `/internal/employees` hozir `limit/offset` ni e'tiborsiz qoldiradi (10-13 hujjati, 1.1).

### 1.2. Tasdiq talab qiluvchi ogohlantirishlar (409)

MedControl'da deyarli har bir yozish amali qoidalarni tekshiradi va `409` qaytaradi:

```json
{
  "code": "confirmation_required",
  "message": "...",
  "details": {
    "findings": [
      { "level": "block | warn", "code": "leave.min_staffing", "message": "...", "params": {}, "override_permission": "internal_leave.override" }
    ]
  }
}
```

- `block` — davom ettirib bo'lmaydi; `override_permission` bo'lsa, shu ruxsatli foydalanuvchi `override_reason` bilan o'tkaza oladi.
- `warn` — foydalanuvchi ko'rib chiqadi va `acknowledged_warnings: ["leave.min_staffing"]` bilan qayta yuboradi.
- Shu qoida katalogdagi `POST records`, `PATCH`, `transition` va quyidagi barcha amallar uchun.
- Override kim, qachon, qaysi sabab bilan qilgani audit'ga yoziladi.

### 1.3. Xodim tanlagich (directory)

MedControl'da 10 ta modul `GET /people/directory` ni ishlatadi — yengil, tez, ruxsatga qarab cheklangan ro'yxat:

```http
GET /internal/employees/directory?q=&org_unit_id=&position_id=&status=active&limit=20
→ { "items": [{ "id": "...", "display_name": "...", "employee_code": "...", "position": "...", "org_unit": "...", "avatar_url": null }] }
```

### 1.4. Holat o'tishining yon ta'siri

MedControl'da `/{resource}/{id}/{action}` amallari (submit, approve, return, close, cancel, launch, publish…) ko'pincha yon ta'sirga ega. Katalogdagi `transition` ham shu ta'sirlarni bajarishi kerak. Har modulda "Yon ta'sir" qatorida ko'rsatilgan.

### 1.5. Fayllar

- Yuklash: mavjud workspace fayli (`file`/`files` maydonlari) yetadi.
- Eksport: `Content-Disposition` da fayl nomi (analytics eksporti kabi). Format `?format=xlsx|pdf`.
- PDF/DOCX generatsiyasi kerak bo'lgan joylar alohida ko'rsatilgan.

### 1.6. Inbox (tasdiqlashlar)

MedControl'da bitta inbox: `GET /workflow/inbox`, `POST /workflow/tasks/{id}/decide`.

- **Bor:** `GET /internal/me/approvals`, `POST /internal/approvals/{id}/decision`.
- **Kerak:** `approval` workflow'idagi barcha katalog yozuvlari (ta'til, buyruq, ish haqi hisobi, reglament versiyasi, xizmat safari…) `pending` bo'lganda shu inboxga tushishi kerak. Har bir element: `{ id, kind, domain, record_type, record_id, title, requested_by, requested_at, due_at, step, can_decide }`.
- Qaror: `approve | reject | return` + `comment`.
- Delegatsiya: `GET/POST /internal/hrm/workflow/delegations`, `POST .../{id}/cancel` — ta'til vaqtida tasdiqlash huquqini boshqaga berish. Delegatsiya katalogda bor; inbox uni hisobga olishi **Yangi**.

### 1.7. Bildirishnomalar

- **Bor:** `GET /internal/me/notifications`.
- **Yangi (tekshirilsin):** `POST /internal/me/notifications/{id}/read`, `POST /internal/me/notifications/read-all`.
- Shablonlar: `notifications.notification_template` katalogda — **Katalog**.

---

## 2. Xodimlar (people) — P1

Ekranlar: ro'yxat, yangi xodim, xodim kartasi (tablar: umumiy, tayinlash, hujjatlar, ta'lim, malaka, uskunalar, intizom, ma'lumot muammolari, tarix, ilova faolligi).

| MedControl | LexGo taklif | Holat | Izoh |
|---|---|---|---|
| `GET /people/employees` | `GET /internal/employees` | Qisman | 1.1: sahifalash, `sort`, `total`, `filter[status]`, `filter[org_unit_id]`, `filter[position_id]`, `filter[employment_type]`, `filter[data_issues]=open\|blocking\|none` |
| `GET /people/employees/{id}` | `GET /internal/employees/{id}` | Yangi | hozir `405`; `/360` bilan bir xil shakl |
| `GET /people/employees/export` | `GET /internal/employees/export.xlsx` | Yangi | hozir `405` (10-13, 1.4) |
| `POST /people/employees/{id}/hire` | `POST /internal/employees/{id}/hire` | Yangi | `hiring → active`; tayinlash `planned → active`, onboarding boshlanadi |
| `POST /people/employees/{id}/status` | `POST /internal/employees/{id}/status` | Yangi | ruxsat etilgan o'tishlar: `hiring→active\|terminated`, `active→suspended\|terminating`, `suspended→active\|terminating`, `terminating→terminated\|active`, `terminated→hiring` |
| `POST /people/employees/{id}/dismiss` | `POST /internal/employees/{id}/dismiss` | Yangi | sana + sabab kodi; ochiq tayinlashlarni yopadi, offboarding ochadi |
| `POST /people/employees/{id}/reinstate` | `POST /internal/employees/{id}/reinstate` | Yangi | qayta tiklash |
| `GET /people/employees/{id}/readiness` | `GET /internal/employees/{id}/readiness` | Yangi | ishga chiqishga tayyorlik: majburiy hujjatlar, shartnoma, tayinlash, o'qitish — har biri `ok/missing` |
| `GET /people/data-issues/summary` | `GET /internal/employees/data-issues/summary` | Yangi | to'liq bo'lmagan profillar soni, turlari bo'yicha |
| `POST /people/employees/{id}/data-issues/{id}/resolve` | `POST /internal/employees/{id}/data-issues/{issue_id}/resolve` | Yangi | `employee_data_issue` ni yopadi |
| `POST /people/assignments/{id}/transfer` | `POST /internal/employees/assignments/{id}/transfer` | Yangi | eskisini yopadi, yangisini ochadi, buyruq loyihasi |
| `POST /people/assignments/{id}/change-fte` | `POST /internal/employees/assignments/{id}/change-fte` | Yangi | `fte: 1\|0.75\|0.5\|0.25`, sanadan |
| `POST /people/assignments/{id}/close` | `POST /internal/employees/assignments/{id}/close` | Yangi | sabab: `transfer\|termination\|restructure\|contract_end\|correction` |
| `POST /people/documents/{id}/verify` | `POST /internal/hrm/people/records/{id}/verify` | Yangi | hujjatni HR tasdiqlaydi (kim, qachon) |
| `GET /people/app-usage/summary`, `/rows`, `/export` | `GET /internal/employees/app-usage/summary\|rows\|export.xlsx` | Yangi | xodimlarning tizimdan foydalanishi (`iam.usage_session` dan) |

Katalog: `employee_profile`, `assignment`, `additional_duty`, `document`, `document_type`, `credential`, `education`, `equipment`, `conduct`, `skill`, `employee_skill`, `profile_change_request`.

MedControl'ga xos (`/medcontrol/link`, `/unlink`, `/seat-assignments/*` biometrika bilan bog'liq qismi) — 9-bo'limga qarang.

---

## 3. Tashkiliy tuzilma (org) — P1

Ekranlar: tuzilma boardi (+ chop etish), shtat jadvali, lavozimlar, grade, o'zgarish rejalari, litsenziyalar, bo'lim turlari.

| MedControl | LexGo taklif | Holat | Izoh |
|---|---|---|---|
| `GET /org/board` | `GET /internal/org/board` | Bor | |
| `POST /org/board/clone`, `/discard` | `POST /internal/org/board/draft`, `DELETE /internal/org/board/draft` | Yangi | boardning qoralama nusxasi; o'zgarishlar qoralamada, keyin reja sifatida tasdiqlanadi |
| `POST/PATCH /org/board/units`, `/units/{id}/close\|discard\|relink\|undo-add-parent` | `POST /internal/org/board/draft/units`, `PATCH .../{id}`, `POST .../{id}/{close\|discard\|relink\|undo}` | Yangi | qoralamadagi bo'lim amallari |
| `POST/PATCH /org/board/links` | `POST/PATCH /internal/org/board/draft/links` | Yangi | qo'shimcha (matritsa) bo'ysunish chiziqlari, `org_unit_link` |
| `GET /org/tree` | `GET /internal/org/tree?as_of=` | Yangi | hozir `404`; daraxt + har tugunda shtat/band soni |
| `GET /org/diff` | `GET /internal/org/diff?from=&to=` | Yangi | ikki sana orasidagi tuzilma farqi |
| `GET /org/units/{id}/history` | `GET /internal/org/units/{id}/history` | Yangi | hozir `404` (10-13, 2.2) |
| `POST /org/units/{id}/move` | `POST /internal/org/units/{id}/move` | Qisman | hozir `PATCH parent_id`; sana bilan versiya yaratishi va audit kerak |
| `POST /org/units/{id}/close` | `POST /internal/org/units/{id}/close` | Yangi | ichida faol shtat bo'lsa `409 block` |
| `GET /org/headcount` | `GET /internal/org/headcount?org_unit_id=&as_of=` | Yangi | reja/fakt/bo'sh shtat birligi |
| `GET /org/stats`, `/stats/export` | `GET /internal/org/stats`, `/stats/export.xlsx` | Yangi | bo'limlar bo'yicha statistika |
| `GET/POST /org/staff-units`, `/{id}/change-fte`, `/{id}/close` | `GET/POST /internal/org/staff-units`, `POST .../{id}/change-fte\|close` | Yangi | shtat birligi (`staff_unit`) amallari |
| `GET /people/unit-seats`, `GET /people/seat-candidates`, `POST /people/seats/{id}/assign` | `GET /internal/org/units/{id}/seats`, `GET /internal/org/seats/{id}/candidates`, `POST /internal/org/seats/{id}/assign` | Yangi | shtat jadvalida bo'sh o'rinni to'ldirish |
| `POST /people/seat-assignments/{id}/release\|replace\|void\|correct-start` | `POST /internal/org/seat-assignments/{id}/{action}` | Yangi | |
| `GET/POST /org/plans`, `/plans/{id}/items`, `/plans/{id}/{submit\|approve\|apply\|cancel}` | `GET/POST /internal/hrm/org/records?record_type=org_change_plan` + `POST /internal/org/plans/{id}/apply` | Qisman | reja va bandlari — Katalog; **apply** (tuzilmaga qo'llash) — Yangi |
| `POST /org/unit-types/reorder` | `POST /internal/org/unit-types/reorder` | Yangi | `{ ids: [] }` |
| `GET /org/licences/summary`, `/licences/{id}/files/*`, `/licences/{id}/{renew\|suspend\|revoke}` | `GET /internal/org/licences/summary` + transition | Qisman | muddati tugayotgan litsenziyalar soni — Yangi; eslatma (`branch_licence_reminder`) cron |
| `GET/PATCH /org/positions`, `/{id}/archive` | `GET/PATCH /internal/org/positions/{id}` | Bor | arxivlash — transition |

Katalog: `org_unit_type`, `grade`, `position`, `staff_unit`, `org_change_plan`, `org_change_item`, `branch_licence`, `work_calendar`, `calendar_day`.

---

## 4. Davomat (attendance) — P1

Ekranlar: bugun (jamoa), hodisalar, qo'lda kiritish, tushuntirishlar, ortiqcha ish, mening davomatim.

| MedControl | LexGo taklif | Holat | Izoh |
|---|---|---|---|
| `GET /attendance/my/today` | `GET /internal/me/attendance` | Bor | |
| `GET /attendance/my/month` | `GET /internal/me/attendance?month=2026-10` | Qisman | kunlar bo'yicha: kelish, ketish, kech qolish, erta ketish, ortiqcha, holat |
| `GET /attendance/team/today` | `GET /internal/hrm/attendance/team/today?org_unit_id=` | Yangi | hozir `404`; ishda / kechikkan / kelmagan / ta'tilda / smena yo'q — guruhlab. `live-office/board` qisman o'xshaydi |
| `GET /attendance/days`, `GET /attendance/day/{id}` | `GET /internal/time/attendance/days` | Bor | bitta kun tafsiloti (hodisalar, smena, tushuntirish) — tekshirilsin |
| `POST /attendance/days/{id}/confirm-checkout` | `POST /internal/time/attendance/days/{id}/confirm-checkout` | Yangi | chiqish belgilanmagan kunni HR yopadi |
| `GET /attendance/events/pending`, `/suspicious` | `GET /internal/time/attendance/events?state=pending\|suspicious` | Yangi | shubhali hodisalar (joylashuv, takror, vaqt) |
| `POST /attendance/events/{id}/correct`, `/{approve\|reject}` | `POST /internal/time/attendance/events/{id}/{correct\|approve\|reject}` | Qisman | `live-office/corrections` bor; MedControl'dagi kabi hodisa darajasida kerak |
| `POST /attendance/manual` | `POST /internal/time/attendance/events/manual` | Yangi | HR qo'lda kelish/ketish kiritadi, sabab majburiy |
| `GET/POST /attendance/explanations`, `/{id}/{approve\|reject}` | Katalog `attendance_explanation` + transition | Katalog | yon ta'sir: tasdiqlansa kun holati va tabel hujayrasi yangilanadi |
| `GET/POST /attendance/overtime` | Katalog `overtime_approval` | Katalog | yon ta'sir: tasdiqlangan soat tabel va ish haqiga tushadi |

Katalog: `attendance_terminal`, `attendance_incident`, `attendance_alert`.

---

## 5. Tabel (timesheet) — P1

Ekranlar: tabellar ro'yxati, tabel jadvali (xodim × kun), kodlar, mening tabelim.

10-13 hujjatidagi 1.2 bandi shu yerga kiradi. MedControl modeli: tabel **bo'lim + oy** bo'yicha alohida hujjat.

| MedControl | LexGo taklif | Holat | Izoh |
|---|---|---|---|
| `GET/POST /timesheets` | `GET/POST /internal/hrm/timesheet/sheets?year=&month=&org_unit_id=` | Yangi | yaratishda kunlar davomat + smena + ta'tildan avtomatik to'ldiriladi |
| `GET /timesheets/{id}` | `GET /internal/hrm/timesheet/sheets/{id}` | Yangi | jadval: `days[]`, `rows[{employee, cells{date:{code,hours,source,corrected}}, totals}]` |
| `GET /timesheets/{year}/{month}` | `GET /internal/hrm/timesheet/periods/{yyyy-mm}` | Yangi | oy bo'yicha barcha bo'limlar holati |
| `POST /timesheets/{id}/{submit\|approve\|return\|close\|reopen}` | `POST /internal/hrm/timesheet/sheets/{id}/{action}` | Yangi | `closed` — ish haqi hisobiga ochiladi; qayta ochish faqat `internal_time.manage` + `internal_payroll.manage` |
| `POST /timesheets/days/{id}/correct` | `POST /internal/hrm/timesheet/days/{id}/correct` | Yangi | `{code, hours, comment}`; audit |
| `GET /timesheets/days/{id}/corrections` | `GET /internal/hrm/timesheet/days/{id}/corrections` | Yangi | hujayra tuzatish tarixi |
| `GET/POST /timesheets/{id}/retro-corrections` | `GET/POST /internal/hrm/timesheet/sheets/{id}/retro-corrections` | Yangi | yopilgan oy uchun keyingi oyda tuzatish; ish haqida qayta hisob |
| `GET /timesheets/my` | `GET /internal/me/timesheet?year=&month=` | Yangi | |
| `GET /timesheets/{id}/export` | `GET /internal/hrm/timesheet/sheets/{id}/export?format=xlsx\|pdf` | Yangi | T-13 shakliga o'xshash |
| `GET/PATCH /timesheets/codes` | Katalog `timesheet_code` | Katalog | |

---

## 6. Smena grafigi (scheduling) — P1

Ekranlar: roster (matritsa), to'ldirish ustasi, hozir navbatchilikda, smenalar, grafiklar, mening grafigim.

10-13 hujjatidagi 2.1 bandi shu yerga kiradi va P1 ga ko'tariladi.

| MedControl | LexGo taklif | Holat | Izoh |
|---|---|---|---|
| `GET /scheduling/matrix` | `GET /internal/hrm/scheduling/matrix?from=&to=&org_unit_id=` | Yangi | xodim × kun, har hujayrada smena/ta'til/dam olish; kun bo'yicha `staffing_requirement` bilan solishtirish |
| `GET /scheduling/matrix/export` | `GET /internal/hrm/scheduling/matrix/export.xlsx` | Yangi | |
| `GET /scheduling/days`, `POST /scheduling/days/bulk` | `GET /internal/hrm/scheduling/days`, `POST .../days/bulk` | Yangi | bir nechta hujayrani bir yo'la o'zgartirish |
| `POST /scheduling/batches/preview`, `POST /scheduling/batches` | `POST /internal/hrm/scheduling/fill/preview`, `POST .../fill` | Yangi | 10-13, 2.1; `preview_hash` bilan |
| `GET /scheduling/batches`, `POST /scheduling/batches/{id}/undo` | `GET /internal/hrm/scheduling/fill/batches`, `POST .../{id}/undo` | Yangi | to'ldirishni bekor qilish |
| `POST /scheduling/batches/sheet/parse`, `GET .../sheet/template` | `POST /internal/hrm/scheduling/fill/sheet/parse`, `GET .../sheet/template.xlsx` | Yangi | Excel'dan grafik import |
| `POST /scheduling/schedules/generate`, `/copy-month` | `POST /internal/hrm/scheduling/schedules/generate\|copy-month` | Yangi | shablon bo'yicha oy generatsiyasi, oldingi oydan nusxa |
| `POST /scheduling/rosters`, `/{id}/submit`, `/{id}/{approve\|return}` | Katalog `roster_period` + transition | Katalog | yon ta'sir: tasdiqlangach xodimlarga bildirishnoma, tanishish so'raladi |
| `POST /scheduling/rosters/{id}/acknowledge`, `GET .../acknowledgements` | `POST /internal/me/schedule/{roster_id}/acknowledge`, `GET /internal/hrm/scheduling/rosters/{id}/acknowledgements` | Yangi | |
| `POST /scheduling/withdraw` | `POST /internal/hrm/scheduling/withdraw` | Yangi | tasdiqlangan grafikni qaytarib olish |
| `GET /scheduling/on-duty`, `/who-works` | `GET /internal/hrm/scheduling/on-duty?at=`, `GET .../who-works?date=` | Yangi | hozir `404` |
| `GET /scheduling/staff-picker` | `GET /internal/hrm/scheduling/staff-picker?date=&shift_id=` | Yangi | shu kunga bo'sh xodimlar (ta'til/smena to'qnashuvisiz) |
| `GET /scheduling/my-schedule` | `GET /internal/me/schedule?from=&to=` | Yangi | |

Katalog: `shift`, `work_schedule`, `staffing_requirement`, `calendar`, `schedule_acknowledgement`.

---

## 7. Ta'til (leave) — P1

Ekranlar: mening ta'tilim, arizalar, kalendar, turlar, minimal shtat qoidalari.

| MedControl | LexGo taklif | Holat | Izoh |
|---|---|---|---|
| `GET /leave/balances/my` | `GET /internal/me/leave/balances` | Yangi | tur bo'yicha: berilgan, ishlatilgan, rejada, qoldiq |
| `GET /leave/balances` | `GET /internal/hrm/leave/balances?org_unit_id=&year=` | Yangi | hozir `404` |
| `POST /leave/balances/recompute` | `POST /internal/hrm/leave/balances/recompute` | Yangi | ish stajidan qayta hisob |
| `POST /leave/balances/{id}/adjust` | `POST /internal/hrm/leave/balances/{id}/adjust` | Yangi | `{days, reason}`; audit |
| `POST /leave/requests/check` | `POST /internal/hrm/leave/requests/check` | Yangi | yuborishdan oldin: kunlar soni, qoldiq, minimal shtat, to'qnashuv — 1.2 dagi `findings` |
| `GET /leave/requests/calendar` | `GET /internal/hrm/leave/calendar?from=&to=&org_unit_id=` | Yangi | hozir `404` |
| `POST /leave/requests/{id}/certificate` | Katalog fayl maydoni | Katalog | kasallik varaqasi |
| `GET/POST /leave/requests`, `/{id}/{submit\|approve\|reject\|cancel}` | Katalog `leave_request` + transition | Katalog | yon ta'sir: tasdiqlansa qoldiqdan yechadi (`leave_balance_debit` bor), grafik va tabelga yozadi; bekor qilinsa qaytaradi |

Katalog: `leave_type`, `minimum_staffing_rule`.

---

## 8. Ish haqi (payroll) — P1

Ekranlar: mening hisob-varaqalarim, hisob-varaqa, hisoblashlar (run), avanslar, jarimalar, formulalar (muharrir + sinov), analitika, stavkalar.

10-13 hujjatidagi 1.3 bandi shu yerga kiradi.

| MedControl | LexGo taklif | Holat | Izoh |
|---|---|---|---|
| `GET/POST /payroll/runs` | `GET/POST /internal/payroll/runs` | Yangi | hozir `404`; hozirgi `POST /internal/payroll/calculate` run hujjatisiz |
| `GET /payroll/runs/{id}` | `GET /internal/payroll/runs/{id}` | Yangi | holat, davr, bo'limlar, jami, xatolar |
| `POST /payroll/runs/{id}/{calculate\|recalculate\|submit\|approve\|pay\|close}` | `POST /internal/payroll/runs/{id}/{action}` | Yangi | hisoblash yopilgan tabelga tayanadi |
| `POST /payroll/runs/{id}/decide`, `/cancel` | `POST /internal/payroll/runs/{id}/decide\|cancel` | Yangi | |
| `GET /payroll/runs/{id}/lines`, `/calculations`, `/summaries` | `GET /internal/payroll/runs/{id}/lines\|calculations\|summaries` | Yangi | xodim bo'yicha qatorlar, formula izi (qaysi o'zgaruvchi qancha), bo'lim jami |
| `GET /payroll/runs/{id}/export` | `GET /internal/payroll/runs/{id}/export.xlsx` | Yangi | bank uchun ham |
| `GET /payroll/payslips`, `/{id}`, `/{id}/pdf`, `/{id}/acknowledge` | `GET /internal/me/payslips`, `/{period}`, `/{period}.pdf`, `POST .../acknowledge` | Yangi | hozir `404` (10-13, 1.3); HR uchun `GET /internal/payroll/payslips?employee_id=` |
| `GET/POST /payroll/advance-runs`, `/{id}/calculate\|approve`, `/{id}/payments` | `/internal/payroll/advance-runs/...` | Yangi | avans hisoblash va to'lovlar |
| `GET/POST /payroll/penalties`, `/{id}/cancel` | Katalog `penalty` + transition | Katalog | |
| `GET/POST /payroll/objections`, `/{id}/decide` | Katalog `penalty_objection` + transition | Katalog | yon ta'sir: qabul qilinsa jarima bekor |
| `GET/POST /payroll/formulas`, `/{id}`, `/{id}/versions`, `/{id}/revise`, `/{id}/archive` | Katalog `formula` + `formula_version` | Qisman | `revise` — yangi versiya, eskisi sanagacha amal qiladi — Yangi |
| `POST /payroll/formulas/validate` | `POST /internal/payroll/formulas/validate` | Yangi | sintaksis va o'zgaruvchilar |
| `POST /payroll/formulas/sandbox` | `POST /internal/payroll/formulas/sandbox` | Yangi | formulani xodim + davr uchun sinab ko'rish, yozmasdan |
| `GET /payroll/formulas/variables` | `GET /internal/payroll/formulas/variables` | Yangi | foydalanish mumkin bo'lgan o'zgaruvchilar (tabel soatlari, KPI, staj…) |
| `GET/POST /payroll/components`, `/{id}/change`, `/{id}/close` | Katalog `compensation_component` | Qisman | `change` — sanadan yangi qiymat (muddatli) — Yangi |
| `GET /payroll/policies`, `/policies/current` | Katalog `payroll_policy` + `GET /internal/payroll/policies/current` | Qisman | |
| `GET /payroll/analytics/overview\|fund\|trend` | `GET /internal/payroll/analytics/overview\|fund\|trend` | Yangi | `/internal/payroll/summary` bor, lekin trend va fond tarkibi yo'q |

Katalog: `payment_details`, `bonus`, `manual_adjustment`, `retro_adjustment`.

---

## 9. MedControl'ga xos modullar — qaror kerak

Bular klinika va MedControl tizimiga bog'langan. Birma-bir nusxa uchun LexGo'da **ekvivalent ma'lumot manbai** kerak:

| MedControl | Nima qiladi | LexGo ekvivalenti — taklif |
|---|---|---|
| Biometrika (`/biometrics/*`, 4 chaqiruv) | yuz va imzo ro'yxatdan o'tkazish, terminal | Ekran nusxalanadi, ma'lumot `live-office` dan. Kerak: `GET /internal/hrm/biometrics/summary`, `GET .../employees/{id}`, `POST .../employees/{id}/reset`. Agar terminal bo'lmasa — ekran olib tashlanadi. |
| MedControl profili (`/people/employees/{id}/medcontrol*`) | MedControl hisobini xodimga bog'lash | LexGo'da bunga mos narsa — xodimning LexGo foydalanuvchi hisobi. `POST /internal/employees/{id}/account/link\|unlink`, `GET .../account/search?q=` |
| SSO (`/auth/sso/medcontrol`) | MedControl'dan kirish | Kerak emas — HRM LexGo sessiyasida ishlaydi |
| Hamkor (`hamkor` domeni) | tashqi hamkor davomati | Katalogda bor; ekrani yo'q, faqat integratsiya |

---

## 10. Vazifalar (tasks — chek-list va nazorat) — P2

Ekranlar: mening vazifalarim, tasdiqlash, shablonlar, tekshiruvlar (spot check), ishonchlilik, hisobotlar.

Bu `/internal/execution/tasks` dan farqli: takrorlanuvchi shablon, dalil (foto/geo), tekshiruv va ishonchlilik bali.

| MedControl | LexGo taklif | Holat |
|---|---|---|
| `GET /tasks/instances/my`, `/awaiting-approval`, `/awaiting-confirmation` | `GET /internal/me/checklists`, `GET /internal/hrm/tasks/instances?queue=approval\|confirmation` | Yangi |
| `POST /tasks/instances/{id}/start\|complete\|confirm\|decide` | `POST /internal/hrm/tasks/instances/{id}/{action}` | Yangi (dalil talablari, muddat, eskalatsiya) |
| `POST /tasks/instances/{id}/proofs` | `POST /internal/hrm/tasks/instances/{id}/proofs` | Yangi (fayl + geo + vaqt) |
| `POST /tasks/templates/{id}/generate` | `POST /internal/hrm/tasks/templates/{id}/generate` | Yangi (jadval bo'yicha nusxalar) |
| `POST /tasks/templates/from-document` | `POST /internal/hrm/tasks/templates/from-document` | Yangi (reglamentdan shablon) |
| `POST /tasks/templates/{id}/{publish\|pause\|archive}` | transition | Katalog |
| `GET /tasks/spot-checks`, `POST /{id}/decide` | Katalog `spot_check` + transition | Katalog |
| `GET /tasks/reliability`, `/{id}` | `GET /internal/hrm/tasks/reliability`, `/{employee_id}` | Yangi (bal va hodisalar) |
| `GET /tasks/reports/completion\|late-trend\|most-missed\|reliability-drops\|spot-checks\|ceo-summary` | `GET /internal/hrm/tasks/reports/{name}` | Yangi (6 ta hisobot) |

Katalog: `task_template`, `escalation_rule`, `proof_point`.

---

## 11. Loyihalar va ishlar (workitems) — P3

Ekranlar: mening ishlarim, ro'yxat, doska, kalendar, Gantt, jamoa yuklamasi, loyihalar.

`/internal/execution/tasks` (+ `comments`, `status`) qisman qoplaydi.

| MedControl | LexGo taklif | Holat |
|---|---|---|
| `GET /workitems/items`, `/{id}`, `PATCH /{id}` | `GET/PATCH /internal/execution/tasks` | Bor |
| `GET .../my` | `GET /internal/me/tasks` | Bor |
| `GET .../team-load` | `GET /internal/execution/team-load?from=&to=&org_unit_id=` | Yangi |
| `POST .../{id}/move` | `POST /internal/execution/tasks/{id}/move` | Yangi (doskada ustun + tartib) |
| `GET .../{id}/history` | `GET /internal/execution/tasks/{id}/history` | Yangi |
| `GET/POST .../{id}/time-entries` | `GET/POST /internal/execution/tasks/{id}/time-entries` | Yangi |
| `GET/POST .../{id}/attachments` | `GET/POST /internal/execution/tasks/{id}/attachments` | Yangi |
| `POST .../{id}/accept-request\|decline-request` | `POST /internal/execution/tasks/{id}/accept\|decline` | Yangi |
| `GET/POST/PATCH /workitems/projects` | `/internal/execution/projects` | Yangi (yoki Katalog `project`) |

---

## 12. KPI va baholash (kpi, performance) — P2

Ekranlar: mening KPI, natijalar, davrlar, ko'rsatkichlar, shablonlar, baholash tsikllari, mening baholashlarim, 1-on-1, IDP, 9-box.

| MedControl | LexGo taklif | Holat |
|---|---|---|
| `GET /kpi/definitions`, `/templates`, `/periods` | `/internal/kpi/metrics` + Katalog `kpi_template`, `kpi_period` | Qisman |
| `POST /kpi/periods/{id}/calculate` | `POST /internal/hrm/kpi/periods/{id}/calculate` | Yangi |
| `POST /kpi/periods/{id}/close` | `POST /internal/hrm/kpi/periods/{id}/close` | Yangi (yon ta'sir: bonus ish haqiga — `kpi_bonus` entry) |
| `POST /kpi/results/manual`, `/target` | `POST /internal/hrm/kpi/results/manual\|target` | Yangi |
| `GET /kpi/results/overview`, `/trend`, `/network-average` | `GET /internal/hrm/kpi/results/overview\|trend\|average` | Yangi |
| `GET/POST /performance/cycles`, `/{id}/launch\|close` | Katalog `review_cycle` + `POST .../launch` | Qisman (launch — formalarni generatsiya qiladi: o'zi, rahbar, hamkasb) |
| `GET /performance/forms`, `POST /{id}/submit` | `GET /internal/me/reviews`, `POST /internal/hrm/kpi/reviews/{id}/submit` | Yangi |
| `GET /performance/reviews` | `GET /internal/hrm/kpi/reviews?cycle_id=` | Yangi (yig'ma ball) |
| `GET/POST /performance/meetings`, `/{id}/record\|cancel` | Katalog `one_on_one_meeting` + transition | Katalog |
| `GET/POST /performance/idps`, `/{id}/goals`, `/idp-goals/{id}/progress` | Katalog `development_plan`, `development_goal` | Katalog |
| `GET /performance/nine-box/grid`, `POST /performance/nine-box` | `GET /internal/hrm/kpi/nine-box?cycle_id=&org_unit_id=`, `POST ...` | Yangi (hozir `404`) |

---

## 13. Rekruting (recruiting) — P2

Ekranlar: bo'sh o'rinlar (seats), vakansiyalar (+ voronka), nomzodlar, intervyular, mening intervyularim, takliflar, metrikalar, sozlamalar.

| MedControl | LexGo taklif | Holat |
|---|---|---|
| `GET /recruiting/vacant-staff-units` | `GET /internal/hrm/recruiting/vacant-seats` | Yangi (org shtatidan) |
| `GET /recruiting/vacancies/{id}/pipeline` | `GET /internal/hrm/recruiting/vacancies/{id}/pipeline` | Yangi (bosqichlar bo'yicha arizalar) |
| `POST /recruiting/vacancies/{id}/{open\|pause\|close}` | transition | Katalog |
| `POST /recruiting/applications/{id}/move` | `POST /internal/hrm/recruiting/applications/{id}/move` | Yangi (`stage_history` ga yozadi) |
| `POST /recruiting/applications/{id}/reject` | transition + `rejection_reason` | Katalog |
| `POST /recruiting/applications/{id}/convert` | `POST /internal/hrm/recruiting/applications/{id}/convert` | Yangi (nomzoddan xodim: `hiring`, tayinlash, onboarding) |
| `GET /recruiting/applications/{id}/history`, `/scorecard` | `GET .../applications/{id}/history\|scorecard` | Yangi |
| `POST /recruiting/interviews/{id}/feedback` | Katalog `interview_feedback` | Katalog |
| `GET /recruiting/offers/{id}/preview` | `GET /internal/hrm/recruiting/offers/{id}/preview.pdf` | Yangi (shablondan) |
| `GET /recruiting/metrics` | `GET /internal/hrm/recruiting/metrics?from=&to=` | Yangi (hozir `404`; time-to-hire, konversiya, manba, xarajat) |
| `GET /recruiting/costs` | Katalog `recruiting_cost` | Katalog |

Katalog: `vacancy`, `candidate`, `application`, `interview`, `offer`, `offer_template`, `pipeline_stage`, `scorecard_criterion`, `talent_pool`.

---

## 14. Onboarding — P2

Ekranlar: jarayonlar, dasturlar, sinov muddati, mezonlar, mentorlik, mening onboardingim.

| MedControl | LexGo taklif | Holat |
|---|---|---|
| `POST /onboarding/instances` | `POST /internal/hrm/onboarding/instances` | Yangi (dasturdan bosqich va vazifalarni generatsiya) |
| `GET /onboarding/instances/{id}` | `GET .../instances/{id}` | Yangi (progress, bosqichlar, vazifalar) |
| `POST .../instances/{id}/mentor`, `/cancel` | `POST .../instances/{id}/mentor\|cancel` | Yangi |
| `POST /onboarding/tasks/{id}/complete\|skip\|reopen` | transition | Katalog |
| `GET /onboarding/me` | `GET /internal/me/onboarding` | Yangi |
| `GET /onboarding/mentoring` | `GET /internal/me/mentees` | Yangi |
| `POST /onboarding/probation-evaluations/{id}/decide`, `/mentor-review` | `POST .../probation-evaluations/{id}/decide\|mentor-review` | Yangi (yon ta'sir: o'tdi — holat; o'tmadi — offboarding) |

Katalog: `onboarding_program`, `onboarding_stage`, `onboarding_item`, `probation_criterion`.

---

## 15. Offboarding — P2

Ekranlar: ishlar, navbat (clearance), kadrlar qo'nimsizligi, chiqish suhbati xulosasi, shablonlar, mening ishim.

| MedControl | LexGo taklif | Holat |
|---|---|---|
| `POST /offboarding/cases` | `POST /internal/hrm/offboarding/cases` | Yangi (shablondan clearance bandlarini generatsiya) |
| `POST /offboarding/cases/{id}/{submit\|approve\|complete}`, `/cancel` | transition | Katalog (yon ta'sir: `complete` — xodim `terminated`, tayinlash yopiladi, kirish o'chiriladi) |
| `GET /offboarding/cases/{id}/clearance` | `GET .../cases/{id}/clearance` | Yangi |
| `GET /offboarding/clearance-items?mine=1`, `POST /{id}/decide` | `GET /internal/me/clearance-items`, `POST .../clearance-items/{id}/decide` | Yangi |
| `GET/POST /offboarding/cases/{id}/exit-interview` | Katalog `exit_interview` | Katalog |
| `GET /offboarding/exit-interviews/summary` | `GET .../exit-interviews/summary` | Yangi |
| `GET /offboarding/turnover` | `GET /internal/hrm/offboarding/turnover?from=&to=&org_unit_id=` | Yangi |
| `POST /offboarding/my` | `POST /internal/me/resignation` | Yangi (xodim o'zi ariza beradi) |
| `GET /core/reason-codes` | `GET /internal/hrm/core/records?record_type=reason_code` | Katalog |

---

## 16. Kadrlar buyruqlari (movements) — P2

Ekranlar: buyruqlar, yangi buyruq, shablonlar (DOCX), mening buyruqlarim.

| MedControl | LexGo taklif | Holat |
|---|---|---|
| `GET /movements/orders/prefill` | `GET /internal/hrm/movements/orders/prefill?type=&employee_id=` | Yangi (xodim ma'lumotlaridan) |
| `POST/PUT /movements/orders`, `/{id}/{submit\|approve\|sign\|register}`, `/cancel` | Katalog `personnel_order` + transition | Katalog (yon ta'sir: `register` — raqam beradi, buyruq turiga qarab tayinlash/maosh/holatni o'zgartiradi) |
| `GET /movements/orders/{id}/pdf` | `GET .../orders/{id}.pdf` | Yangi |
| `POST /movements/orders/{id}/signed-scan` | fayl maydoni | Katalog |
| `GET /movements/my-orders`, `/{id}/acknowledge`, `/{id}/pdf` | `GET /internal/me/orders`, `POST .../{id}/acknowledge`, `GET .../{id}.pdf` | Yangi |
| `POST /movements/templates/upload-docx`, `GET /{id}/docx`, `/{id}/new-version` | `POST /internal/hrm/movements/templates/upload-docx` va h.k. | Yangi |
| `POST /movements/templates/preview`, `/{id}/preview`, `/{id}/preview-pdf` | `POST .../templates/{id}/preview` | Yangi |
| `GET /movements/template-variables` | `GET .../templates/variables` | Yangi |

---

## 17. Reglamentlar (policies) — P2

Ekranlar: mening reglamentlarim, tanishish (o'qish + video + test), hujjatlar (papkalar), versiyani ko'rib chiqish, shablonlar, muvofiqlik.

| MedControl | LexGo taklif | Holat |
|---|---|---|
| `GET /policies/folders/items` | `GET /internal/hrm/policies/folders/{id}/items` | Yangi (papka + hujjat aralash daraxt) |
| `POST /policies/folders/{id}/move`, `/documents/{id}/move`, `/template-files/{id}/move` | `POST .../{kind}/{id}/move` | Yangi |
| `POST /policies/documents/import` | `POST .../documents/import` | Yangi (DOCX/PDF dan) |
| `POST /policies/documents/{id}/instantiate` | `POST .../documents/{id}/instantiate` | Yangi (shablondan) |
| `POST /policies/documents/{id}/versions`, `PATCH /versions/{id}`, `/versions/{id}/submit\|publish\|retire` | Katalog `policy_version` + transition | Katalog (yon ta'sir: `publish` — tanishish talablari bo'yicha `acknowledgement` yaratadi) |
| `POST /policies/versions/resolve-route` | `POST .../versions/resolve-route` | Yangi (kim tasdiqlaydi) |
| `GET /policies/versions/{id}/review`, `/sources`, `/export` | `GET .../versions/{id}/review\|sources\|export.pdf` | Yangi |
| `GET /policies/acks/my`, `/acks/{id}`, `/acks/{id}/content` | `GET /internal/me/policy-acks`, `/{id}`, `/{id}/content` | Yangi (hozir `404`) |
| `POST /policies/acks/{id}/video-progress`, `/quiz-start`, `/quiz-submit`, `/confirm` | `POST /internal/me/policy-acks/{id}/{action}` | Yangi (ball, urinishlar soni) |
| `POST /policies/acks/{id}/waive`, `/remind` | `POST .../acks/{id}/{action}` | Yangi |
| `GET /policies/acks/overdue`, `/compliance` | `GET .../acks/overdue`, `GET .../compliance?org_unit_id=` | Yangi |

---

## 18. LMS — P3

Ekranlar: kurslar (muharrir), yozilishlar, qoidalar, baholash, sertifikatlar, hisobotlar, wiki, mening kurslarim, kurs pleyeri.

| MedControl | LexGo taklif | Holat |
|---|---|---|
| `GET /lms/my-courses` | `GET /internal/me/courses` | Yangi (hozir `404`) |
| `GET /lms/courses/{id}/content`, `/enrollments/{id}/content` | `GET .../courses/{id}/content`, `GET /internal/me/courses/{enrollment_id}/content` | Yangi (modul → dars → test daraxti, progress bilan) |
| `POST /lms/enrollments/{id}/complete-lesson` | `POST /internal/me/courses/{id}/lessons/{lesson_id}/complete` | Yangi |
| `POST /lms/attempts`, `/{id}/submit` | `POST /internal/me/quiz-attempts`, `POST .../{id}/submit` | Yangi (savollar aralashadi, javoblar kalitsiz) |
| `POST /lms/attempts/{id}/grade` | `POST .../attempts/{id}/grade` | Yangi (ochiq savollar) |
| `POST /lms/enrollments/skill-gap`, `GET /lms/skill-gaps` | `GET .../skill-gaps`, `POST .../enrollments/skill-gap` | Yangi (lavozim talab qilgan ko'nikmalar) |
| `POST /lms/rules/{id}/apply` | `POST .../rules/{id}/apply` | Yangi (qoidaga mos xodimlarni yozadi) |
| `POST /lms/courses/{id}/{publish\|archive}`, `/enrollments/{id}/{cancel\|extend}` | transition | Katalog (yon ta'sir: tugatilsa sertifikat) |
| `GET /lms/reports/compliance\|courses\|overdue` | `GET .../reports/{name}` | Yangi |

Katalog: `course`, `course_module`, `lesson`, `quiz`, `question`, `training_rule`, `certificate`, `article`, `article_category`.

---

## 19. Xizmat safari va rotatsiya (travel) — P3

Ekranlar: rotatsiya, safarlar, shablonlar, kelayotganlar, balans, qayta rejalash.

| MedControl | LexGo taklif | Holat |
|---|---|---|
| `GET/POST /travel/rotation` | `GET/POST /internal/hrm/travel/rotation?from=&to=` | Yangi (filiallar bo'yicha kim qachon qayerda) |
| `POST /travel/rotation-templates/{id}/expand` | `POST .../rotation-templates/{id}/expand` | Yangi (shablondan safarlar) |
| `GET /travel/incoming` | `GET .../incoming?org_unit_id=` | Yangi |
| `GET /travel/balance` | `GET .../balance` | Yangi |
| `GET /travel/people` | `GET .../people` | Yangi |
| `GET /travel/reschedule-tasks`, `POST /{id}/resolve` | Katalog `reschedule_task` + transition | Katalog |
| `POST /travel/trips/{id}/{submit\|approve\|start\|finish\|cancel}` | transition | Katalog (yon ta'sir: grafik va tabelga "safar" kodi) |

Katalog: `business_trip`, `rotation_template`, `branch_distance`.

---

## 20. Analitika va hisobotlar — P2

Ekranlar: rahbar paneli, HR paneli, filial paneli, hisobotlar (konstruktor), jadval bo'yicha yuborish.

| MedControl | LexGo taklif | Holat |
|---|---|---|
| `GET /analytics/dashboards/{ceo\|hr}` | `GET /internal/analytics/dashboard?kind=ceo\|hr` | Qisman (hozirgi javob 308 bayt; MedControl panellari uchun bloklar kerak: shtat, qo'nimsizlik, davomat, ta'til, ish haqi fondi, rekruting) |
| `GET /analytics/dashboards/branch/{id}` | `GET /internal/analytics/dashboard?org_unit_id=` | Yangi |
| `GET /analytics/employees/{id}/360` | `GET /internal/employees/{id}/360` | Bor |
| `GET /analytics/reports`, `/{code}`, `/{code}/export` | `GET /internal/analytics/reports`, `/{code}?params`, `/{code}/export.xlsx` | Yangi (tayyor hisobotlar katalogi + parametrlar) |
| `GET/POST/PATCH /analytics/saved-reports`, `/{id}/archive` | Katalog `saved_report` | Katalog |
| `GET/POST/PATCH /analytics/schedules`, `/{id}/run-now` | Katalog `report_schedule` + `POST .../run-now` | Qisman (cron + email/telegram yuborish — Yangi) |
| `GET /analytics/deliveries/{id}/download` | `GET .../deliveries/{id}/download` | Yangi |

---

## 21. Admin — P3

Ekranlar: rollar, vaqtinchalik huquqlar, foydalanuvchilar, qurilmalar, workflow'lar, delegatsiyalar, bildirishnoma shablonlari, audit.

| MedControl | LexGo taklif | Holat |
|---|---|---|
| `/iam/roles`, `/iam/permissions`, `/iam/users` | LexGo admin rollari va ruxsatlari | Bor |
| `POST /iam/grants`, `/{id}/revoke` | `POST /internal/hrm/iam/grants`, `/{id}/revoke` | Yangi (muddatli maxfiy ma'lumotga kirish, `sensitive_access_grant`) |
| `/iam/devices`, `/{id}/{approve\|revoke}` | Katalog `device` + transition | Katalog |
| `/workflow/definitions`, `/{id}` | Katalog `process_definition` | Katalog (muharrir: bosqich, shart, tasdiqlovchi) |
| `/workflow/delegations` | 1.6 | Katalog |
| `/notifications/templates` | Katalog `notification_template` | Katalog |
| `GET /audit`, `/audit/export` | `GET /admin/audit-trail`, `+ /export.xlsx` | Qisman (HRM yozuvlari ham tushishi kerak; eksport — Yangi) |

---

## 22. Bugun va "Mening" bo'limi — P1

| MedControl | LexGo | Holat |
|---|---|---|
| `/today` (bir nechta moduldan yig'ilgan) | `GET /internal/me/today`, `GET /internal/hrm/me/overview` | Bor (yuqoridagi `me/*` endpointlar paydo bo'lishi bilan to'ldiriladi: smena, ta'til qoldig'i, tanishish kerak bo'lgan reglamentlar, kurslar, vazifalar) |
| `/me/profile`, `/me/documents` | `GET /internal/me/profile`, `GET /internal/me/records` | Bor |
| `profile_change_request` | Katalog | Katalog (xodim o'z ma'lumotini o'zgartirishni so'raydi, HR tasdiqlaydi) |

---

## Qisqacha

| Bo'lim | Modul | Yangi endpointlar (taxm.) | Ustuvorlik |
|---|---|---|---|
| 1 | Umumiy: konvert, 409 findings, directory, yon ta'sirlar, inbox | 6 | P1 |
| 2 | Xodimlar | 15 | P1 |
| 3 | Tuzilma | 20 | P1 |
| 4 | Davomat | 6 | P1 |
| 5 | Tabel | 9 | P1 |
| 6 | Smena grafigi | 15 | P1 |
| 7 | Ta'til | 6 | P1 |
| 8 | Ish haqi | 20 | P1 |
| 22 | Bugun / Mening | 0 | P1 |
| 9 | MedControl'ga xos | 3–5 | qaror |
| 10 | Vazifalar (chek-list) | 14 | P2 |
| 12 | KPI va baholash | 10 | P2 |
| 13 | Rekruting | 8 | P2 |
| 14 | Onboarding | 7 | P2 |
| 15 | Offboarding | 8 | P2 |
| 16 | Buyruqlar | 9 | P2 |
| 17 | Reglamentlar | 13 | P2 |
| 20 | Analitika | 6 | P2 |
| 11 | Loyihalar | 7 | P3 |
| 18 | LMS | 9 | P3 |
| 19 | Xizmat safari | 5 | P3 |
| 21 | Admin | 3 | P3 |

Jami: ~200 yangi endpoint. Qolgan MedControl chaqiruvlari (~380) katalog yoki mavjud LexGo endpointlari bilan qoplanadi.

## Ish tartibi

1. Backend avval 1-bo'limni (umumiy talablar) qiladi — usiz boshqa ekranlar MedControl kabi ishlamaydi.
2. Keyin P1 modullar, modulma-modul. Har modul tayyor bo'lganda frontend uning ekranlarini MedControl'dan birma-bir ko'chiradi (LexGo ranglari bilan) va ulaydi.
3. Frontend shell (sidebar, top bar, buyruqlar palitrasi, klaviatura yorliqlari) va UI to'plamini (kartalar, maydonlar, jadvallar, tablar) backendni kutmasdan tayyorlaydi.
4. 9-bo'lim bo'yicha qaror mahsulot egasidan kerak.
