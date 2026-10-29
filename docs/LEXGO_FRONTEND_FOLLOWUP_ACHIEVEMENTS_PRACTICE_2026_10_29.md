# LexGo: what the frontend still needs from the backend (achievements, certificates, practice, experience)

Date: 2026-10-29
From: Frontend
Status: open
Applies to: `LEXGO_ACHIEVEMENTS_PRACTICE_FRONTEND_CONTRACT_2026_10_29.md` (backend commit 69c11a6)

The frontend for this contract is finished and reads only its canonical fields. This list holds only what is still missing in production, or still needs an answer. Production was checked on 2026-10-29:

- the OpenAPI is unchanged since 69c11a6;
- none of the promised fixes below are live yet.

---

## Missing in production (backend fix needed)

**1. `seller` on experience queue rows.**
- `GET /call-center/marketplace/experience` rows have no `seller` object and no `seller_user_id`. All 8 rows in production were checked.
- Only the detail returns `seller { id, lexgo_id, name, phone, role, account_status }`. Because of this, the operator's queue cannot show who submitted each row.
- Please add the same `seller` object to every row in the experience, achievement and certificate queues. The achievement and certificate queues are empty in production, so we could not check them.

**2. Stage and result labels on achievement records.**
- Records carry only `process_stage` / `result_scope` codes. The labels exist only in the advocate-only config.
- The public profile and the call center therefore cannot show them in the user's language.
- Please add the labels to private, public and review records. The frontend already reads this shape:
  - `process_stage_label` (string) and `process_stage_label_i18n` (`{ uz_latn, uz_cyrl, ru, en }`);
  - `result_scope_label` and `result_scope_label_i18n`.
- If you choose a different shape, tell us the field names.

**3. `mismatched_fields[]` on certificate review.**
- Not in production yet.
- Please send one real example of the item shape when it ships, for example `{ field, label, label_i18n, submitted, extracted }`.

**4. One set of decision words in `reviews[].decision`.**
- Achievement and certificate history uses `approve | reject | changes_requested`. Experience history uses `approved | rejected | changes_requested`.
- Please make them the same everywhere and tell us which set you chose.

**5. Pending analysis returned as `manual_review_required`.**
- A freshly created achievement whose software analysis is still running can come back with `ai_analysis_status: "manual_review_required"`. The advocate is then told an operator will check it by hand.
- Please fix it so the record stays `pending` until the analysis finishes.

**6. Experience-review permission code.**
- Review access depends on the call_center / admin / manager role or `approvals.manage`. There is no permission code yet.
- Please add one (for example `marketplace.experience.review`), include it in the user's permissions, and tell us its name.
- Until then, a `403` from a queue hides that tab.

**7. Suspension evidence file names.**
- Suspension items carry `evidence_ids` only, so the operator sees "Document 1, 2, …".
- Please return `evidence[]` with `{ id, file_name, mime_type, size, download_url }`, as achievements do.

## Questions (answer needed)

**8. `risk_items[]` item shape.** The frontend reads `{ code, label, label_i18n }` from `risk_items` and `risk_catalog`. Is that the full shape, or is there more, for example severity?

**9. Timestamps on achievement and certificate records.** Experience records use `submitted_at` and `reviewed_at`. Do achievement records, certificate records and their `history[]` items use the same two names?

**10. Certificate rejection reason.** On a certificate review record, is the operator's reason in `rejection_reason`, as on achievements? The advocate's card uses `latest_verification.reason`.
