# LexGo HRM: backenddan so'raladigan endpointlar

Sana: 2026-10-13
Muallif: frontend
Kontekst: HRM (`/internal`) dizayni va oqimlari MedControl HR bilan tenglashtirildi. Frontend endi mavjud endpointlar (`/internal/*`, `/internal/hrm/*` katalogi, `/notifications`) ustida ishlaydi. Quyida MedControl'da bor, lekin bizning backendda yo'q imkoniyatlar ko'rib chiqilgan va **LexGo uchun haqiqatan kerakligi** bo'yicha ajratilgan.

Asosiy mezon: LexGo ichki jamoasi hozir ~14 xodim, keyin o'sadi; call center smena bilan ishlaydi; ish haqi tizimda hisoblanadi. MedControl klinika uchun yozilgan — uning ba'zi qismlari bizga kerak emas.

---

## 1-ustuvorlik — hozir kerak

### 1.1. Xodimlar ro'yxati: sahifalash, saralash, bitta xodim

**Muammo (tekshirildi 2026-10-13):**

- `GET /internal/employees?limit=2&offset=5` — `limit` va `offset` e'tiborsiz, har doim hamma xodimlar qaytadi.
- `sort` parametri yo'q.
- `GET /internal/employees/{id}` — `405 Method Not Allowed`. Xodim kartasi hozir `/360` orqali o'qiladi.

14 xodimda sezilmaydi, lekin 100+ xodimda har sahifa ochilishi butun ro'yxatni yuklaydi. Frontend hozir saralash va sahifalashni brauzerda qiladi (vaqtinchalik).

**So'rov:**

```http
GET /internal/employees?q=&status=&org_unit_id=&sort=display_name|-display_name|hire_date|-hire_date|employee_code&limit=25&offset=0
```

Javob — boshqa ro'yxatlar kabi:

```json
{ "items": [], "total": 140, "limit": 25, "offset": 0 }
```

```http
GET /internal/employees/{id}
```

`/360` dagi `employee` obyekti bilan bir xil shakl (assignment ichida).

**Frontend:** javobda `total` kelganda server sahifalashiga o'tadi; `sort` URL'da allaqachon bor (`?sort=hire&dir=desc`).

### 1.2. Tabel (ish vaqti hisobi): oylik jadval va eksport

**Nega kerak:** ish vaqtini hisobga olish ish beruvchining majburiyati va ish haqi hisobi tabelga tayanadi. Katalogda `timesheet` moduli bor (`code`, `day`, `period`), lekin bu alohida yozuvlar — HR uchun oyni bitta jadvalda ko'rish, tuzatish va chop etish imkoni yo'q. `GET /internal/hrm/timesheet/export.xlsx` — `404`.

**So'rov:**

```http
GET /internal/hrm/timesheet/grid?period=2026-10&org_unit_id=
```

```json
{
  "period": "2026-10",
  "status": "draft | submitted | approved | closed",
  "days": ["2026-10-01", "..."],
  "codes": [{ "code": "Я", "title": "Ish kuni", "hours": 8 }],
  "rows": [
    {
      "employee_id": "...",
      "employee_name": "...",
      "cells": { "2026-10-01": { "code": "Я", "hours": 8, "source": "attendance | manual", "corrected": false } },
      "totals": { "days": 21, "hours": 168, "by_code": { "Я": 21 } }
    }
  ]
}
```

```http
PATCH /internal/hrm/timesheet/grid/cell
{ "employee_id": "...", "date": "2026-10-05", "code": "Б", "hours": 0, "comment": "Kasallik varaqasi" }

POST /internal/hrm/timesheet/periods/{period}/transition
{ "to": "submitted | approved | closed", "comment": "" }

GET /internal/hrm/timesheet/export.xlsx?period=2026-10&org_unit_id=
```

Qoidalar:

- Hujayra davomatdan (`/internal/me/attendance`, live office) to'ldiriladi; qo'lda tuzatish `corrected: true` bilan audit'ga yoziladi.
- `closed` davrni faqat `internal_time.manage` + `internal_payroll.manage` qayta ochadi.
- `internal_time.manage` ruxsati.

### 1.3. Hisob-varaqa (payslip) va "Mening ish haqim"

**Nega kerak:** `/internal/payroll/entries` bor (masalan `entry_type: "kpi_bonus"`, `amount`), lekin xodim o'z oyligining tarkibini (oklad, bonus, jarima, avans, ushlanmalar) ko'ra olmaydi. Buxgalteriyaga "qancha va nega" degan savollarni kamaytiradi.

**So'rov:**

```http
GET /internal/me/payslips?year=2026
→ { "items": [{ "period": "2026-10", "net": 9800000, "currency": "UZS", "status": "approved | paid", "acknowledged_at": null }] }

GET /internal/me/payslips/{period}
→ { "period": "2026-10", "lines": [{ "entry_type": "salary", "title": "Oklad", "amount": 10300000 }, { "entry_type": "advance", "title": "Avans", "amount": -2000000 }], "gross": ..., "deductions": ..., "net": ..., "currency": "UZS" }

GET /internal/me/payslips/{period}.pdf
POST /internal/me/payslips/{period}/acknowledge

GET /internal/payroll/payslips/{employee_id}/{period}.pdf   # HR uchun, internal_payroll.manage
```

Xodim faqat o'zinikini ko'radi; summalar yaxlit so'mda.

**Frontend:** "Mening" bo'limiga "Ish haqim" sahifasi va xodim kartasidagi "Ish haqi" tabiga PDF tugmasi qo'shiladi.

### 1.4. Xodimlar ro'yxati eksporti (XLSX)

`GET /internal/employees/export.xlsx` — `405`. HR va rahbariyat hisobotlari uchun kerak (shtat ro'yxati). Ro'yxat bilan bir xil filtrlar:

```http
GET /internal/employees/export.xlsx?q=&status=&org_unit_id=
```

Ustunlar: kod, F.I.Sh., lavozim, bo'lim, rahbar, bandlik turi, ishga kirgan sana, telefon, holat. Fayl nomi `Content-Disposition` da (analytics eksporti kabi).

---

## 2-ustuvorlik — call center va jamoa o'sganda kerak

### 2.1. Smena grafigi jadvali (roster) va "hozir kim ishda"

**Nega:** call center operatorlari smena bilan ishlaydi. Katalogda `scheduling` (`shift`, `schedule`, `roster`, `staffing_requirement`) bor, lekin hafta/oyni xodim × kun jadvalida ko'rish va bir necha kunni bir yo'la to'ldirish yo'q.

```http
GET  /internal/hrm/scheduling/roster?from=2026-10-01&to=2026-10-31&org_unit_id=
POST /internal/hrm/scheduling/roster/fill/preview   { "employee_ids": [], "shift_id": "...", "from": "...", "to": "...", "weekdays": [1,2,3,4,5] }
POST /internal/hrm/scheduling/roster/fill           { ...xuddi shu..., "preview_hash": "..." }
GET  /internal/hrm/scheduling/on-duty?at=2026-10-13T14:00:00+05:00&org_unit_id=
```

`preview` to'qnashuvlarni qaytaradi (ta'til, boshqa smena, `staffing_requirement` dan kam odam).

### 2.2. Tashkilot tuzilmasi o'zgarishlari auditi

Tashkilot boardida bo'limni sudrab ko'chirish va bekor qilish (undo) qo'shildi — `PATCH /internal/org/units/{id}` `{ "parent_id": ... }`. Kim, qachon, qayerdan qayerga ko'chirgani saqlanishi kerak:

- `PATCH /internal/org/units/{id}` dagi `parent_id`, `name`, `status` o'zgarishlarini mavjud `/admin/audit-trail` ga yozish (yangi endpoint shart emas).
- Ixtiyoriy: `GET /internal/org/units/{id}/history`.

---

## Kerak emas (hozircha) — sababi bilan

| MedControl imkoniyati | Qaror | Sabab |
|---|---|---|
| Biometrika, MedControl profili | Kerak emas | Klinikaga xos; LexGo'da biometrik terminal yo'q, davomat live office orqali. |
| Global "as of" sana, tuzilmaning sanaga ko'ra ko'rinishi, ikki sanani solishtirish | Kerak emas | 14–50 kishilik jamoaga ortiqcha murakkablik; audit (2.2) yetarli. |
| Shtat rejasi, grade, unit type tartibi | Kerak emas | Lavozimlar (`/internal/org/positions`) va katalogdagi `people.assignment` yetadi. Bo'sh lavozimlar HR panelida hisoblanadi. |
| Litsenziyalar | Bor | Katalog: `people.credential` (malaka va litsenziya). |
| 360 baholash, 9-box, IDP, 1-on-1 | Kerak emas | Katalogda yo'q; KPI (`/internal/kpi`) hozirgi hajmga yetarli. |
| LMS pleyer, test, baholash | Kerak emas | Katalogda `lms` (kurs, test, urinish, sertifikat) yozuv sifatida bor; kontent pleyeri keyinroq. |
| Reglamentni o'qish + test | Kerak emas | `policies.acknowledgement` yozuvi bilan tanishishni qayd etish yetadi. |
| Rekruting voronkasi metrikalari | Kerak emas | `recruiting` moduli va uning doska ko'rinishi (holatlar bo'yicha) bor. |
| Hisobot yaratish va jadval bo'yicha yuborish | Kerak emas | `/internal/analytics/export.xlsx` va HR paneli yetadi. |
| Rollar, qurilmalar, audit | Bor | LexGo admin: ruxsatlar va `/admin/audit-trail`. |
| Xodimni ishdan bo'shatish / qayta tiklash | Bor | `PATCH /internal/employees/{id}` `employment_status: terminated | active`; jarayon — `offboarding` moduli. |

---

## Qisqacha

| # | Endpoint | Ustuvorlik |
|---|---|---|
| 1.1 | `/internal/employees` sahifalash, `sort`, `total`; `GET /internal/employees/{id}` | 1 |
| 1.2 | `/internal/hrm/timesheet/grid` + cell, transition, `export.xlsx` | 1 |
| 1.3 | `/internal/me/payslips` (+ `.pdf`, acknowledge), HR uchun payslip PDF | 1 |
| 1.4 | `/internal/employees/export.xlsx` | 1 |
| 2.1 | `/internal/hrm/scheduling/roster` (+ fill preview/fill), `on-duty` | 2 |
| 2.2 | Org o'zgarishlarini `/admin/audit-trail` ga yozish | 2 |

Har bir endpoint tayyor bo'lganda frontend o'z ekranini ulaydi; hozirgi ekranlar mavjud ma'lumot bilan ishlab turadi.
