# LexGo — Backend endpoints the frontend still needs

This document lists every endpoint the backend must add (or extend) to light up
UI that already exists but currently shows an empty state or a dead button. It is
written for the backend team.

Everything here is derived from a full frontend audit against the live OpenAPI
(`https://lexgo.api.cognilabs.org/openapi.json`, 66 paths at time of writing).
The frontend is already wired to **64 of 66** existing endpoints. The gaps below
are the *other* direction: screens/controls that are blocked because no endpoint
exists yet.

---

## 0. Conventions (match the existing API)

Follow the same shape the current endpoints already use, so the frontend
normalizers keep working without special-casing:

| Aspect | Convention | Example (from live `/subscription-plans`) |
|---|---|---|
| Auth | `Authorization: Bearer <token>` | same as all authed routes |
| Field naming | `snake_case` | `monthly_price`, `is_active`, `created_at` |
| IDs | UUID strings | `"86102a14-7e49-4477-840f-0d09d192680a"` |
| Timestamps | ISO-8601 UTC with `Z` | `"2026-09-02T13:14:27.172406Z"` |
| Money | integer, so'm (UZS), no decimals | `monthly_price: 22500` |
| Currency | `"UZS"` unless stated | — |
| List responses | bare JSON array **or** `{ "items": [...] }` | `/subscription-plans` returns a bare array |
| Errors | `{ "detail": "..." }` with proper HTTP status | FastAPI default |

The frontend list reader accepts any of `items` / `data` / a bare array / a
resource-named key (`orders`, `plans`, …), so any of those is fine for lists.

Priority key: **P1** = a control is visibly dead right now · **P2** = screen shows
a permanent empty state · **P3** = enhancement / cleaner than the current
work-around.

---

## Summary

| # | Endpoint(s) | Unblocks | Priority |
|---|---|---|---|
| 1 | `POST /orders/{id}/accept`, `POST /orders/{id}/decline` | Accept/Decline buttons on lawyer dashboard, marketplace, advocate opportunities | **P1** |
| 2 | `GET /document-templates/{id}/file` | Download button on lawyer documents | **P1** |
| 3 | `GET /lawyers/me/stats` | "Today" KPIs (lawyer), "Profile performance" (advocate) | **P2** |
| 4 | `GET /lawyers/me/clients` | Lawyer → Clients screen | **P2** |
| 5 | `GET/POST /calendar-events` | Lawyer → Calendar & deadlines | **P2** |
| 6 | `GET /promotions/me`, `GET /promotions/analytics`, `POST /promotions/checkout` | Promotion analytics + real purchase (lawyer & advocate) | **P2** |
| 7 | `POST /gifts`, `GET /gifts` | Client → Gifts screen | **P2** |
| 8 | `GET/PUT /clients/me`, `…/payment-methods`, `…/family-members` | Client → Profile (email, card, family, "Add family") | **P2** |
| 9 | `GET /payments`, `GET /payments/{id}/receipt` | Real payment/receipt history (currently proxied via `/orders`) | **P3** |
| 10 | `GET /notifications`, `POST /notifications/{id}/read` | User-facing notification inbox (admin can already send) | **P3** |

---

## 1. Order lifecycle — accept / decline  **(P1)**

**Problem.** Lawyer dashboard (`/portal/lawyer`), marketplace
(`/portal/lawyer/marketplace`) and advocate opportunities
(`/portal/advocate/opportunities`) all list open requests from the existing
`GET /orders`, and render **Accept / Decline** buttons — but the buttons have no
endpoint to call, so they do nothing.

```
POST /orders/{order_id}/accept
  → the authed lawyer/advocate claims the request.
  Response 200: the updated order (same shape as GET /orders items),
                status advanced (e.g. "accepted"/"in_progress"),
                and ideally a created case:
  {
    "id": "…", "status": "accepted",
    "lawyer_user_id": "…",
    "case": { "id": "…", "case_number": "…", "status": "open" }  // optional
  }

POST /orders/{order_id}/decline
  → hide this request for the current lawyer (soft, per-user).
  Response 200: { "id": "…", "status": "declined" }
  Errors: 409 if already taken by someone else.
```

Notes: the order item shape the UI already reads (from `GET /orders`) includes
`id, status, payment_status, details.question|title, service.name, region,
price|amount, created_at, lawyer.name`. Keep accept/decline returning the same
item so the list can update in place.

---

## 2. Document template download  **(P1)**

**Problem.** Lawyer documents (`/portal/lawyer/documents`) lists templates from
the existing `GET /document-templates` and shows a **Download** icon per row with
no endpoint behind it.

```
GET /document-templates/{template_id}/file
  → the template file for download.
  Either:
    (a) 200 with the binary + Content-Disposition: attachment; filename="…"
        Content-Type: application/pdf | .docx | …
  Or:
    (b) 200 JSON { "file_url": "https://…", "filename": "…", "mime": "…" }
        (frontend then opens/redirects to file_url)
```

Option (b) is simplest if files live in object storage. Note this is distinct
from `/contracts/{id}/download` (which is for *generated* contracts from a
document-request, not blank templates).

---

## 3. Seller stats / performance  **(P2)**

**Problem.** Lawyer dashboard "Today" panel and advocate dashboard "Profile
performance" panel both show a permanent empty state. There is no per-user stats
endpoint (only `/admin/dashboard`, admin-only).

```
GET /lawyers/me/stats
  Response 200:
  {
    "workload": {
      "active_cases": 4,
      "open_orders": 7,
      "unread_messages": 2,
      "deadlines_today": 1
    },
    "finance": {
      "earnings_month": 3200000,
      "currency": "UZS",
      "pending_payout": 450000
    },
    "performance": {
      "profile_views": 1280,
      "search_appearances": 340,
      "profile_clicks": 96,
      "contact_requests": 12,
      "rating": 4.8,
      "response_rate": 0.94,
      "avg_response_minutes": 35
    }
  }
```

The `performance` block also feeds the promotion analytics cards (see #6); if you
prefer, expose it once here and reuse.

---

## 4. Lawyer's clients list  **(P2)**

**Problem.** `/portal/lawyer/clients` shows a permanent empty state. The UI
already has copy for a conflict-of-interest flag and a per-client case count.

```
GET /lawyers/me/clients
  Response 200 (list):
  [
    {
      "id": "…",                 // client user id
      "name": "Aziz R.",
      "phone": "+998…",
      "cases_count": 3,
      "has_conflict": false,     // drives "Possible conflict of interest" alert
      "last_active_at": "2026-09-01T10:00:00Z"
    }
  ]
```

Scope: clients the authed lawyer has (or had) a case/order/chat with.

---

## 5. Calendar & deadlines  **(P2)**

**Problem.** `/portal/lawyer/calendar` shows a permanent empty state. UI supports
event types: `hearing`, `investigative`, `meeting`, `deadline`.

```
GET /calendar-events?from=2026-09-01&to=2026-09-30
  Response 200 (list):
  [
    {
      "id": "…",
      "type": "hearing",                 // hearing|investigative|meeting|deadline
      "title": "Tashkent city court",
      "case_id": "…",                    // optional link to a case
      "starts_at": "2026-09-12T09:00:00Z",
      "ends_at": "2026-09-12T10:00:00Z", // optional
      "location": "…"                    // optional
    }
  ]

POST /calendar-events
  Body: { type, title, case_id?, starts_at, ends_at?, location? }
  Response 201: the created event.

PATCH /calendar-events/{id}   // optional
DELETE /calendar-events/{id}  // optional
```

Alternative if you don't want a new table: derive `deadline` events from
`cases.deadline_at` and only add hearings/meetings later. But a dedicated
endpoint is cleaner.

---

## 6. Promotion — status, analytics, purchase  **(P2)**

**Problem.** The promotion page (`/portal/lawyer/promotion`,
`/portal/advocate/promotion`) is now wired to `GET /ads/products` for the package
catalog (currently returns `[]`), and a "buy" writes a `promo_request` record via
`POST /ads/products`. That is a stop-gap. Two things are missing: (a) a real
purchase/checkout with payment, and (b) the reach-analytics cards
(impressions / search appearances / profile clicks / contact requests) the UI has
copy for.

First: **seed `/ads/products`** with real promo packages (they use the module
record shape — `title`, `price`, `currency`, `status`, `payload`). Put
`days` and `reach` in `payload` so the cards render correctly:

```json
{ "record_type": "package", "title": "Top of search — 7 days",
  "price": 149000, "currency": "UZS", "status": "active",
  "payload": { "days": 7, "reach": 3 } }
```

Then add:

```
GET /promotions/me
  → the caller's active promotion (or null).
  { "active": true, "package_id": "…", "days_left": 5, "ends_at": "…" }

GET /promotions/analytics
  → reach numbers for the analytics cards + a 14-day series for the sparkline.
  {
    "impressions": 1280,
    "search_appearances": 340,
    "profile_clicks": 96,
    "contact_requests": 12,
    "series": [ { "date": "2026-09-01", "impressions": 90 }, … ]  // 14 points
  }

POST /promotions/checkout
  Body: { "package_id": "…", "days": 7 }
  Response: a payment result in the SAME shape as the existing demo purchases
            (/orders/demo-purchase, /subscription-plans/{id}/demo-purchase):
  { "payment": { "id": "…", "status": "pending", "payment_url": "https://…" } }
```

Once `/promotions/checkout` exists, the frontend swaps the `promo_request`
work-around for the real purchase (same pattern as `demoPlanPurchase`).

---

## 7. Gifts (gift a subscription)  **(P2)**

**Problem.** `/portal/client/gifts` shows a permanent empty state. The
subscription section already advertises a "gift a subscription" flow, and some
plans are already `is_giftable: true` in `/subscription-plans`.

```
POST /gifts
  Body: {
    "plan_id": "…",              // a plan where is_giftable = true
    "recipient_phone": "+998…",
    "term_months": 6,
    "message": "…"               // optional
  }
  Response 201: {
    "id": "…", "status": "pending",
    "gift_code": "LX-XXXX",       // optional, redeemable code
    "payment": { "id": "…", "status": "pending", "payment_url": "https://…" }
  }

GET /gifts
  → gifts the caller sent or received.
  [
    {
      "id": "…",
      "direction": "sent",             // sent|received
      "recipient_phone": "+998…",
      "plan_name": "Premium",
      "term_months": 6,
      "status": "sent",                // pending|sent|activated
      "created_at": "…"
    }
  ]
```

Reuse the existing payment machinery (return a `payment.payment_url` like the
demo-purchase endpoints) so the frontend can open the checkout screen.

---

## 8. Client profile (self)  **(P2)**

**Problem.** `/portal/client/profile` can only show `name`/`phone` from the
login session. Email and card show `—`, the subscription block is static text,
and the **"Add family"** button is dead. There is no client-facing profile
endpoint (only `PUT /lawyers/me` exists, for sellers).

```
GET /clients/me
  { "name": "…", "phone": "+998…", "email": "…", "avatar_url": "…",
    "subscription": { "plan_name": "Premium", "status": "active", "renews_at": "…" } }

PUT /clients/me
  Body: { "name"?, "email"?, "avatar_url"? }   // phone change likely needs OTP
  Response 200: the updated profile.

# Payment methods
GET  /clients/me/payment-methods         → [ { "id", "brand": "uzcard", "last4": "1234", "expires": "05/28", "is_default": true } ]
POST /clients/me/payment-methods         → add (tokenized card)
DELETE /clients/me/payment-methods/{id}

# Family members (drives "Add family")
GET  /clients/me/family-members          → [ { "id", "name", "phone", "relation": "spouse" } ]
POST /clients/me/family-members          → Body: { name, phone, relation } → 201 created
DELETE /clients/me/family-members/{id}
```

At minimum, `GET/PUT /clients/me` + the family endpoints unblock the visible
screen; payment-methods can follow when card storage is ready.

---

## 9. Payments / receipts history  **(P3)**

**Problem.** `/portal/client/payments` and the billing-history sub-panels
(inside the subscription `PlansPanel`) currently reuse `GET /orders` as a
stand-in for payment history. That works but has no receipts and no
subscription/gift/promotion payments — only service orders.

```
GET /payments
  → all payments for the caller (orders, subscriptions, gifts, promotions, private-chat).
  [
    {
      "id": "…",
      "amount": 249000, "currency": "UZS",
      "status": "paid",                 // paid|pending|failed|refunded
      "method": "payme",
      "kind": "subscription",           // service|subscription|gift|promotion|private_chat
      "description": "Premium — 6 months",
      "order_id": "…",                  // optional back-reference
      "created_at": "…",
      "receipt_url": "https://…"        // optional, for the Download/receipt link
    }
  ]

GET /payments/{payment_id}/receipt     // optional, PDF/file
```

When this ships, the frontend switches the payments page and the billing-history
panels from `/orders` to `/payments`.

---

## 10. User-facing notifications inbox  **(P3)**

**Problem.** Admins can already send notifications (`POST /admin/notifications`),
but there is no endpoint for a user to **read** their notifications, so there is
no notification bell/inbox on the user side.

```
GET /notifications
  → the caller's notifications, newest first.
  [ { "id", "title", "body", "kind": "system", "read": false, "created_at": "…" } ]

POST /notifications/{id}/read          → mark one read
POST /notifications/read-all           → mark all read   // optional
GET  /notifications/unread-count       → { "count": 3 }  // optional, for a badge
```

This is P3 only because there is no notifications screen in the UI yet; it would
need a small frontend addition too.

---

## Not needed (already covered)

For completeness — these existed as questions but need **no** new endpoint:

- **AI chat / consultations & contracts** — fully wired via
  `/clients/{id}/chats*` and `/contracts/*`.
- **Secure chat** — `/secure-chats*` + `/ws/secure-chats/{room}`.
- **Documents flow** — `/document-templates`, `/document-requests*`.
- **Organizations** — `/organizations*`.
- **Academy / B2B / Ads / Case-documents / Legal-aid / Seller-onboarding /
  Refund / Replacement** — all wired to their module endpoints.
- `POST /auth/register` and `/auth/register/direct` — intentionally unused; the
  app uses the 2-step OTP flow (`/auth/register/start` + `/auth/register/verify`).

---

### Suggested build order

1. **#1 accept/decline** and **#2 template download** — dead buttons, small.
2. **#6 promotion** (seed `/ads/products` first) and **#3 stats** — high-visibility dashboards.
3. **#7 gifts**, **#8 client profile**, **#4 clients**, **#5 calendar** — new screens.
4. **#9 payments** and **#10 notifications** — enhancements.
