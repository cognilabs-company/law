# LexGo: frontend follow-up on the final achievements and practice contract

Date: 2026-10-29
From: Frontend
Status: open
Applies to: `LEXGO_ACHIEVEMENTS_PRACTICE_FRONTEND_CONTRACT_2026_10_29.md` (backend commit 69c11a6)

The frontend now reads only the canonical fields from the final contract. The alias guessing is removed. A few points are still not covered by the contract, or could be read two ways. For each one, the frontend took the safest reading, listed under **"What the frontend does now"**. Please confirm it or send the exact answer.

---

**1. Decision words in `reviews[]` history.**
- The contract names the request words (`approve`, `reject`, `changes_requested`) and the stored status words (`approved`, `rejected`, `changes_requested`). It does not say which ones `reviews[].decision` carries.
- What the frontend does now: it reads both forms as the stored decision.
- Please confirm the exact values.

**2. Stage and result labels outside the config.**
- `process_stage` / `result_scope` labels come only from `GET /marketplace/me/achievements/config`. That endpoint is advocate-only, so a superadmin gets `403 advocate_role_required`.
- The public profile (`/marketplace/lawyers/{id}/achievements`) and the call-center queue and detail have no config. They cannot show the stage or result in the user's language.
- What the frontend does now: those two screens fall back to the frontend's own names for the 4 stages and 2 results. A value without a name is left out.
- Can public items and review records carry `process_stage_label` / `result_scope_label` with `label_i18n`? Or can the config be readable without the advokat role?

**3. Certificate field mismatches.**
- `mismatched_fields` is gone from the contract.
- What the frontend does now: it compares `record` with `ai_analysis.extracted_fields` field by field and marks the differences for the operator. It also shows `risk_items` / `risk_catalog`.
- Is that the intended source, or will `diff[]` / `risk_items` carry explicit mismatches?

**4. `risk_items[]` item shape.**
- The contract says labels come in `risk_catalog` and/or `risk_items` but doesn't show one item.
- What the frontend does now: it reads `{ code, label, label_i18n }` from both.
- Do `risk_items` carry more, for example severity?

**5. Seller fields on queue rows.**
- The queues (`/call-center/marketplace/achievements`, `/advocate-licenses`, `/experience`) return `PaginatedContractOut.items[]`, but the contract doesn't name the seller fields on a row.
- What the frontend does now: it reads `seller_user_id` and `seller.name`.
- Please confirm, or send the field names.

**6. Timestamps on records.**
- §4 says "timestamps and review metadata when available".
- What the frontend does now: it reads `submitted_at` and `reviewed_at`.
- Please confirm these names for achievement, certificate and history records.

**7. `ai_analysis_status` values.**
- The record status is `ai_analysis_pending`, and the normalized analysis has `status: "completed"`. The values of the separate `ai_analysis_status` field are not listed.
- What the frontend does now:
  - `pending` / `processing` / `queued` / `running` → running;
  - `failed` / `manual_review_required` / `skipped` → left to the operator;
  - anything else → done.
- Please send the list.

**8. Certificate rejection reason on the record.**
- `latest_verification.reason` is used on the advocate's card.
- What the frontend does now: on a certificate review record it reads `rejection_reason`, as on achievements.
- Please confirm.

**9. Experience review decision words.**
- §6 and §11 give `approve` / `reject` / `changes_requested` for achievements and certificates. §13 doesn't list the words for `POST /call-center/marketplace/experience/{id}/review`.
- What the frontend does now: it still sends `approved` / `rejected` / `changes_requested` there, as the earlier contract did.
- Should experience switch to `approve` / `reject` too?

**10. Experience review permission name.**
- §1: review screens must use the marketplace experience-review permission, not the role name, but the permission isn't named.
- What the frontend does now: anyone who opens the call-center page sees the three review tabs. A `403` from the queue hides the tab.
- If you send the permission name, the tabs can be hidden before the request.

**11. Suspension evidence download name.**
- Suspension items carry `evidence_ids` only, so the operator sees "Document 1, 2, …".
- Can suspension items carry `evidence[]` with `file_name`, like achievements?

**12. Test advocate account (question 12.1, still open).**
- We need an advokat test account without 2FA, or with a test-environment TOTP secret. Then we can check the real config, practice and certificate answers before release.
