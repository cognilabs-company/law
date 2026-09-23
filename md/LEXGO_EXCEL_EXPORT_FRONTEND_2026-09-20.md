# LexGo Excel Export API Update

Project: LexGo

## Nima qo'shildi

SuperAdmin/Admin panel, CEO analytics, lead kanban, call-center kanban va payouts sahifalari uchun Excel yuklab olish APIlari qo'shildi.

Hamma endpoint `.xlsx` fayl qaytaradi.

Base URL:

```text
https://lexgo.api.cognilabs.org
```

Authorization:

```http
Authorization: Bearer <access_token>
```

## 1. Admin Dashboard Excel

```http
GET /admin/dashboard/export.xlsx
```

Filterlar:

```text
region optional
date_from optional YYYY-MM-DD
date_to optional YYYY-MM-DD
```

Misol:

```http
GET /admin/dashboard/export.xlsx?region=tashkent&date_from=2026-09-01&date_to=2026-09-20
```

Excel sheetlari:

- Summary
- Users
- Orders
- Cases
- Leads
- Payments
- Tasks
- B2B
- Reviews

## 2. CEO Analytics Excel

```http
GET /analytics/ceo/export.xlsx
```

Filterlar:

```text
date_from optional YYYY-MM-DD
date_to optional YYYY-MM-DD
```

Misol:

```http
GET /analytics/ceo/export.xlsx?date_from=2026-09-01&date_to=2026-09-20
```

Excel sheetlari:

- KPI
- Channels
- Revenue Trend

## 3. Admin Leads Kanban Excel

```http
GET /admin/leads/kanban/export.xlsx
```

Filterlar:

```text
status optional
score optional
source optional
q optional
region optional
assigned_operator_user_id optional
date_from optional YYYY-MM-DD
date_to optional YYYY-MM-DD
```

Misol:

```http
GET /admin/leads/kanban/export.xlsx?region=tashkent&date_from=2026-09-01&date_to=2026-09-20
```

Excel sheetlari:

- Summary
- Leads

## 4. Call-Center Leads Kanban Excel

```http
GET /call-center/leads/kanban/export.xlsx
```

Filterlar admin kanban bilan bir xil:

```text
status optional
score optional
source optional
q optional
region optional
assigned_operator_user_id optional
date_from optional YYYY-MM-DD
date_to optional YYYY-MM-DD
```

Excel sheetlari:

- Summary
- Leads

## 5. Payouts Excel

```http
GET /admin/payouts/export.xlsx
```

Filterlar:

```text
status optional
seller_user_id optional
date_from optional YYYY-MM-DD
date_to optional YYYY-MM-DD
```

Misol:

```http
GET /admin/payouts/export.xlsx?status=pending&date_from=2026-09-01&date_to=2026-09-20
```

Excel sheetlari:

- Summary
- Payouts

## Frontendda qanday yuklash kerak

Fetch response blob qilib olinadi:

```ts
const response = await fetch(`${API_URL}/admin/dashboard/export.xlsx?date_from=2026-09-01&date_to=2026-09-20`, {
  headers: { Authorization: `Bearer ${token}` }
});

const blob = await response.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "lexgo-dashboard.xlsx";
a.click();
URL.revokeObjectURL(url);
```

## Test natijasi

Productionda tekshirildi:

- `/admin/dashboard/export.xlsx` -> 200, valid XLSX, 9 sheet
- `/analytics/ceo/export.xlsx` -> 200, valid XLSX, 3 sheet
- `/admin/leads/kanban/export.xlsx` -> 200, valid XLSX, 2 sheet
- `/call-center/leads/kanban/export.xlsx` -> 200, valid XLSX, 2 sheet
- `/admin/payouts/export.xlsx` -> 200, valid XLSX, 2 sheet
