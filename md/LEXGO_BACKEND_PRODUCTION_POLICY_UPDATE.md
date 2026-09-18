# LexGo Backend Update

## Nima qo'shildi

Backend production policy/config, compliance va secure chat confidentiality qismlari kuchaytirildi.

## Frontend uchun yangi endpointlar

### Public policy
`GET /platform/policies`

Login talab qilmaydi. Frontend order/payment/document/workspace qoidalarini backenddan oladi.

Qaytadigan asosiy keys:
- `order.advance_percent`
- `order.final_percent`
- `order.confirmation_window_minutes`
- `payment.platform_commission_percent`
- `document_analysis.review_fee_ranges`
- `workspace.scan_required`
- `workspace.allowed_extensions`
- `notifications.cascade`

### Admin policy
`GET /admin/platform/policies`
`PUT /admin/platform/policies/{section}`
`GET /admin/platform/policies/{section}/history`

Admin token kerak. Sectionlar:
- `order`
- `payment`
- `document_analysis`
- `workspace`
- `security`
- `notifications`

### Compliance readiness
`GET /admin/compliance/readiness`

Admin panelda production tayyorgarlik checklist ko'rsatish uchun.

Statuslar:
- `production_ready`
- `needs_external_integrations`
- `needs_review`

### Secure chat content reveal
`POST /secure-chats/{room_id}/content-reveal/request`
`POST /secure-chats/{room_id}/content-reveal/approve`
`GET /secure-chats/{room_id}/content-reveal/status`

Muhim: admin/staff odatiy holatda chat matnini ko'rmaydi. Dispute bo'lsa reveal request + approve orqali vaqtinchalik ochiladi.

## Existing endpointdagi o'zgarishlar

### `GET /secure-chats/{room_id}/messages`
Agar user client/seller bo'lmasa va active reveal yo'q bo'lsa:
- `content = "[metadata_only]"`
- `filtered_content = "[metadata_only]"`

### Workspace upload
Workspace file payload ichida endi `scan` metadata bor:
- `scan_required`
- `scan_status`
- `scan_engine`
- `issues`
- `scanned_at`

Frontend file cardda scan status ko'rsatsa bo'ladi.

### Document analysis quote
Narx qoidalari endi backend policy orqali keladi. Frontend hardcode qilmasin, `pricing_rule` va `/platform/policies`dan foydalansin.

## Test natijasi

Productionda tekshirildi:
- `/health` 200
- `/docs` public 404
- `/platform/policies` 200
- admin policy endpointlari 200
- compliance readiness 200
- yangi secure chat reveal route'lar OpenAPI ichida bor

## Backend URL
Production backend URL o'sha-o'sha ishlaydi.
