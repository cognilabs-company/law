# LexGo: frontend questions for the backend team

Date: 2026-10-28
From: Frontend
Status: answered in `LEXGO_BACKEND_ANSWERS_FOR_FRONTEND_2026_10_28.md` (backend, 2026-10-28); the frontend now reads the real field names, and the marked backend gaps stay open.
Applies to:

- `LEXGO_MARKETPLACE_ENTERPRISE_FRONTEND_FINAL_2026_10_27.md`
- `LEXGO_CRM_CUSTOMER_LEAD_FRONTEND_2026_10_27.md`
- the team tasks below

Every task below is built on the frontend. The readers are defensive: where a field name is not in OpenAPI or the brief, the frontend accepts the names listed under "What the frontend reads now". Please confirm those names or send the real ones, so we can remove the guesses.

Frontend UI rule that affects several answers: **the UI never shows a UUID, a raw code or raw JSON**. Wherever only an id or a code is available, we need a human label, name or code (`TSK-…`, `LEAD-…`, `ORD-…`, `CRM-…`) next to it.

---

## 1. Payments: Click / Payme (TSK-664399)

**1.1 Provider list for checkout.**
- Is there an endpoint that lists which providers are enabled right now for the client checkout?
- Today the frontend hard-codes `telegram_manual | payme | click` and falls back to Telegram when the answer is `payment_provider_not_configured` or `payment_provider_unavailable`.
- Wanted: `GET …` → `[{ provider, enabled, label }]`.

**1.2 Single payment status.**
- After the client returns from the Payme/Click page, the frontend polls `GET /payments` (the whole history list) to see if the payment became `paid` or `failed`.
- Is there, or can there be, a `GET /payments/{payment_id}`, so we can poll one row instead of the list?

**1.3 Reconciliation rows.**
- `GET /admin/payments/reconciliation-v2` mismatch rows: do they carry the order's `work_id` (or another human code)?
- Today we can only key them by `payment_id`, which we are not allowed to display.

**1.4 Provider readiness shape.**
- Please confirm `GET /admin/payments/provider-readiness`:
  - is the list key `items` or `providers`?
  - the full set of `state` values (we handle `ready`, `configured`, `disabled`, `error`, plus `mode: feature_flagged_until_contracts`).

## 2. 100% payment and seller acceptance (TSK-900422)

**2.1 Answered by the brief, no action:** `payment_provider` is sent at the top level of the purchase body.

**2.2 Reassignment, seller side.**
- When an order is taken from seller A and given to seller B, how does seller B's order response say so?
- Today the frontend reads `reassignments[]` (`previous_seller` / `old_seller`, `new_seller` / `replacement_seller`, `reassigned_by`, `reassigned_at`) or `waiting_replacement`.
- Please confirm the field names, and whether the new seller receives `reassignments[]` at all.

## 3. Payouts 30 / 30 / 22 (TSK-906326)

No typed schema exists in OpenAPI for these yet.

**3.1 Payout row shape** for `GET /call-center/marketplace/payouts` and `…/payout-recoveries`:

| What | Names the frontend reads now |
| --- | --- |
| Stage | `stage` / `stage_key` / `payout_stage` / `kind` (values like `seller_accept_30`, `first_checklist_complete`, `completion_40`) |
| Percent | `stage_percent` / `percent` / `gross_percent` |
| Order code | `work_id` / `order_work_id` |
| Service | `service_title` |
| Seller | `seller{ id, name }` |
| Recovery reason | `client_visible_reason` / `reason_text` / `reason` |

Please send the real schema and the full list of `status` values.

**3.2 Seller's own view.**
- In `GET /marketplace/me/orders/{id}/financials`, which key holds the payout stages?
- The frontend reads `payouts`, `payout_stages`, `settlement.stages` or `settlement.payouts`.
- Is a "held" state (15-minute window or open complaint) a field, or should we derive it?

**3.3 mark-paid / resolve body.**
- Confirm `{ transfer_reference, evidence_file_id?, note? }`.
- Is `transfer_reference` the only required field?

## 4. Tariffs K17 v3 (TSK-342697 / TSK-692647)

**4.1 `/admin/plans`.**
- The brief (§21) says the old plans screen is replaced by K17.
- Can the frontend remove `/admin/plans` completely, or is anything still using it?
- *This also needs a product decision from Abdurahmon.*

**4.2 Developer task and approval fields** on a plan version:
- The frontend reads `developer_task{ task_code | code, title, status, deadline_at | developer_deadline_at, assignees[] }`.
- It also reads `approval` / `superadmin_approval{ status }`.
- Please confirm the names and the `status` values for both.

## 5. Diplomatic price, client view (TSK-787056)

**5.1 Client-safe reasons field.**
- Which field holds the client-safe "why the price changed" lines?
- The frontend tries, in order:
  - `pricing.client_reasons`
  - `pricing.client_safe_reasons`
  - `pricing.client_explanation`
  - `details.client_price_explanation`
  - `client_price_explanation`
  - `pricing.price_explanation_client`
- Each line can be a string or `{ text | label }`. Please name the one field and its item shape.

## 6. Experience and achievements review (TSK-415946 / 920636 / 493303 / 100467 / 874927 / 365169)

**6.1 Checklist labels.**
- `/review` takes `checklist_keys` such as `position_2_dates` or `evidence_3_readable`.
- The detail response does not always carry a label per key, so the frontend builds one from the key.
- Can the detail include `checklist: [{ key, label, hint }]` in the operator's language?

**6.2 `/communication` and `/communication/close`.**
- Confirm the request body. The frontend sends `{}`.
- Confirm the response. The frontend reads `room_id` / `chat_room_id` / `room.id`, `status`, `read_only`, `closed_at`.
- Does a closed room stay readable for both sides?

**6.3 Diff.**
- For a changed revision, is there a `diff` / `changes` array (`{ field, label, before, after }`)?
- Today the frontend computes it locally when none is sent.

## 7. Operator cockpit (TSK-635882)

**7.1 Titles contain ids.**
- `GET /call-center/marketplace/cockpit` item titles sometimes include raw UUIDs.
- The frontend ignores `title` and rebuilds each line from the item's own fields.
- Could each item carry a ready human `title` without ids, plus `work_id`?

## 8. Superadvokat (TSK-460646)

**8.1 Who is the primary superadmin?**
- The frontend only learns it from a 403 `primary_superadmin_required` after trying to save.
- Can `/auth/me` (or the seller row) carry `is_primary_superadmin: true` or `can_set_superadvokat: true`, so other superadmins see a locked dialog up front?

**8.2 History shape** of `GET /admin/marketplace/sellers/{id}/superadvokat/history`:
- The frontend reads `changed_by` / `actor` / `created_by { name }`.
- It also reads `old_value` / `before` and `new_value` / `after` (boolean or `{ active, starts_at, ends_at }`), plus `reason`, `starts_at`, `ends_at`, `created_at`.
- Please confirm the names.

## 9. CRM customer / lead (contract 2026-10-27)

Built exactly to the contract. Questions found while testing against production:

**9.1 `detail_sections` still contains raw values.** Seen on production:
- `value` holds raw codes: `uz_latn`, `active`, `contacted`, `warm`, `normal`, `ai_classify`.
- Labels are mechanical: "Crm id", "Lexgo user", "Lead count".
- The `additional → kanban` group includes "Moved by user id" with a UUID, and "Moved at" as an ISO string with `value_type: text`.

Today the frontend translates known keys, formats ISO dates and drops UUID-like values and `*_id` keys. Could the backend:

- send translated `value` labels for codes (or a `display_value` beside `value`);
- send `value_type: datetime` for dates;
- leave internal bookkeeping (`kanban`, `*_user_id`) out of `detail_sections`?

**9.2 Existing customer returned by `POST /crm/customers`.**
- §4.4 says the backend may reuse an existing customer when the contact already belongs to one.
- The response looks the same as a new customer, so the frontend guesses "reused" from `lead_count > 0` or an old `created_at`.
- Can the response carry `reused: true` (or HTTP 200 vs 201)?

**9.3 Order draft (`POST /crm/leads/{id}/conversion`).**
- The old form had raw `service_id` / `package_id` / `seller_user_id` text inputs. The frontend now picks them by name from:
  - `GET /services?catalog_only=true&q=&limit=30&offset=`
  - `GET /marketplace/lawyers?service_id=&q=&verified=true`
  - `GET /service-packages`
- Can call-center operators call these three endpoints?
- `GET /service-packages` is empty on production. What is the item shape (`id`, `title`, …)? Can it be filtered by service?
- What does the conversion response return? We need the order's human code (`order.work_id`?) to show the operator, not its id.

**9.4 `crm_customer_account_required`.**
- Now that linking is automatic by verified phone, what should the operator do when conversion fails with this error?
- The frontend now says: "add the phone the client uses on LexGo to the profile and it links automatically". Is that correct?
