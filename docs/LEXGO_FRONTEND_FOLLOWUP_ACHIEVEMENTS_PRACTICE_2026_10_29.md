# LexGo: frontend follow-up on the final achievements and practice contract

Date: 2026-10-29
From: Frontend
Status: partially answered. The backend checked items 1, 2, 3, 5, 7, 9 and 10 against production on 2026-10-29. Items 4, 6, 8 and 11 are not checked yet.
Applies to: `LEXGO_ACHIEVEMENTS_PRACTICE_FRONTEND_CONTRACT_2026_10_29.md` (backend commit 69c11a6)

The frontend reads only the canonical fields from the final contract. Under each item:

- **Backend check**: what the backend confirmed or will fix.
- **What the frontend does now**: how the frontend handles it today.

---

**1. Decision words in `reviews[]` history.**
- Backend check 2026-10-29: **fix pending.** Achievement and certificate history uses `approve | reject | changes_requested`; experience history uses `approved | rejected | changes_requested`. The backend will make these the same.
- What the frontend does now: one temporary helper reads both forms as the stored decision. It goes away once the backend has normalized the words.

**2. Stage and result labels on records.**
- Backend check 2026-10-29: **fix pending.** Records don't return labels yet; the labels exist only in the advocate-only config. The backend will add them.
- What the frontend does now:
  - it already reads `process_stage_label` + `process_stage_label_i18n` and `result_scope_label` + `result_scope_label_i18n` (the same pattern as `warning` / `warning_i18n`), so the screens switch over by themselves;
  - until then, the public profile and the call center use the frontend's own names for the 4 stages and 2 results;
  - a value without a label is left out.
- Please use that field shape, or tell us the one you choose.

**3. Certificate field mismatches.**
- Backend check 2026-10-29: **fix pending.** There is no `mismatched_fields[]`; `extracted_fields`, risk data and the revision diff exist. The backend will add `mismatched_fields[]`.
- What the frontend does now: it compares `record` with `ai_analysis.extracted_fields` and marks the differences. It waits for `mismatched_fields[]` and doesn't guess its shape. Please send one example when it ships.

**4. `risk_items[]` item shape.**
- Backend check: **not checked yet.**
- What the frontend does now: it reads `{ code, label, label_i18n }` from `risk_items` and `risk_catalog`.
- Do `risk_items` carry more, for example severity?

**5. Seller fields on queue rows.**
- Backend check 2026-10-29: **confirmed.** `seller: { id, lexgo_id, name, phone, role, account_status }`.
- What the frontend does now:
  - it reads only that object; `seller.id` is the seller's user id;
  - the row shows the name, the LexGo ID and phone under it, and the role and account state as words.

**6. Timestamps on records.**
- Backend check: **not checked yet.**
- What the frontend does now: it reads `submitted_at` and `reviewed_at`. Please confirm these names for achievement, certificate and history records.

**7. `ai_analysis_status` values.**
- Backend check 2026-10-29: **confirmed:** exactly `pending | completed | manual_review_required`.
- Also a **bug, fix pending:** a freshly created item that is still `pending` can come back as `manual_review_required`.
- What the frontend does now:
  - `pending` → running; `completed` → done; `manual_review_required` → left to the operator;
  - any other value is also left to the operator, never shown as done;
  - there is no frontend workaround for the bug.

**8. Certificate rejection reason on the record.**
- Backend check: **not checked yet.**
- What the frontend does now: the advocate's card uses `latest_verification.reason`; a certificate review record reads `rejection_reason`, as achievements do. Please confirm.

**9. Experience review decision words.**
- Backend check 2026-10-29: **confirmed:** `approved | rejected | changes_requested`.
- What the frontend does now: it sends exactly these. No change.

**10. Experience review permission.**
- Backend check 2026-10-29: **fix pending.** There is no permission code yet. Access depends on the call_center / admin / manager role or `approvals.manage`. The backend will add one, for example `marketplace.experience.review`.
- What the frontend does now: a `403` from the queue hides its tab. It doesn't gate on role names, and it won't gate on a permission until the backend names it.

**11. Suspension evidence file names.**
- Backend check: **not checked yet.**
- What the frontend does now: suspension items carry `evidence_ids` only, so the operator sees "Document 1, 2, …". Can suspension items carry `evidence[]` with `file_name`, like achievements?
