# LexGo: frontend questions on achievements, advocate practice and pre-advocate employment

Date: 2026-10-29
From: Frontend
Status: answered by the backend in `LEXGO_ACHIEVEMENTS_PRACTICE_FRONTEND_CONTRACT_2026_10_29.md` (backend commit 69c11a6). The frontend now reads only the canonical fields from that contract. What is still open is in `LEXGO_FRONTEND_FOLLOWUP_ACHIEVEMENTS_PRACTICE_2026_10_29.md`.
Applies to: `LEXGO_FRONTEND_ADVOCATE_ACHIEVEMENTS_PRACTICE_2026-10-29.md`

The frontend for this contract is built (Parts A–E). The OpenAPI types every answer below as a free-form object (`additionalProperties: true`). We could not read the real answers either:

- the superadmin account gets `403 advocate_role_required` on the config and practice endpoints;
- the advocate test accounts need 2FA;
- the production queues are empty.

So the readers are defensive. Under each question, **"What the frontend reads now"** lists the names it accepts. Please confirm them or send the real shape, so we can remove the guesses.

Frontend UI rule that affects several answers: **the UI never shows a UUID, a raw code or raw JSON.** Wherever only a code is available, we need a human label next to it (ideally `label` + `label_i18n` with `uz_latn`, `ru`, `en`).

---

## 1. Achievement config — `GET /marketplace/me/achievements/config`

**1.1 Response shape.** The contract lists the values but not the keys. Please send one real example response.

What the frontend reads now:
- Stages: `process_stages` or `stages`. Each item is `{ value | key | code, label | title, hint?, label_i18n? }`, or the whole thing is a `{ key: label }` map.
- Results: `result_scopes` or `results`, in the same forms.
- Evidence rules: under `evidence` (or `evidence_rules` / `files`):
  - `required`
  - `min_files | minimum | min`
  - `max_files | maximum | max`
  - `max_file_size_bytes | max_size_bytes | max_file_size`, or `max_file_size_mb | max_size_mb`
  - `allowed_mime_types | mime_types`
  - `allowed_extensions | extensions | formats`
- Description limits: `description.min_length` / `description.max_length`. Otherwise the frontend uses the schema's 5–5000.
- Warning: `warning | warning_text | submit_warning | notice`, as a string or as `{ text, text_i18n }`, plus an optional `warning_i18n`.

**1.2 Labels per language.** Are the stage and result labels Uzbek only, or is there a `label_i18n` for ru/en? Today ru/en use the frontend's own translations of the 4 + 2 known keys.

**1.3 Warning per language.** Is the warning text available in ru/en?

## 2. Advocate's own achievements — `GET /marketplace/me/achievements`

**2.1 Software-analysis state.** Which field holds it on each record, and what are its values?
- Read now: `ai_analysis_status | ai_status | ai_analysis.status`.
- Values understood:
  - running: `pending`, `queued`, `processing`, `running`, `in_progress`;
  - handed to an operator: `failed`, `error`, `manual_review`, `manual_review_required`, `skipped`, `unavailable`;
  - anything else is read as "done".

**2.2 Operator reason.** Which field holds the reason for a `rejected` / `changes_requested` record?
- Read now: `rejection_reason | review_reason | reason`.

**2.3 Category name.** Is `category_title` on every record, or only on public items? Without it the frontend looks the name up in `/service-categories`.

**2.4 Grouping.** Does the list ever return `groups` (as experience does), or only flat `items` grouped by `root_id` on the frontend? A page may split one root's revisions across pages. Is that acceptable, or should the list be paged by root?

**2.5 Revision `source_id`.** For a new version, should `source_id` be the latest record's id (for example a `changes_requested` one) or the currently approved one? The frontend sends the latest record's id.

## 3. Public achievements — `GET /marketplace/lawyers/{seller_user_id}/achievements`

**3.1 Public text field.** Is the safe text `description`, or `public_description`? Read now: `public_description ?? description`.

**3.2 Record id.** Do public items carry an `id`? Items without one are keyed by stage + date.

## 4. Call-center achievement review

**4.1 AI analysis object.** Where is it in `GET /call-center/marketplace/achievements/{id}`?
- Read now: `ai_analysis` at the top level, else `record.ai_analysis`, else `ai`.

**4.2 Value formats.** Please confirm the type of each field:
- `document_readable`, `claim_supported`, `stage_matches`, `result_scope_matches`: read as booleans.
- `authenticity_confidence`: a share 0–1, or a percent 0–100? Both are accepted now.
- `manipulation_risk`, `ai_generated_risk`: a level (`low` / `medium` / `high`), a number, or `{ level, score }`? All three are accepted now.
- `risk_level`: `low | medium | high`? (`moderate` and `critical` are also mapped.)
- Signature detection: read as `signature_detected`, `seal_detected`, `electronic_signature_detected | e_signature_detected`, or under `signature_detection { signature, seal, electronic_signature }`. Which is it?
- `pii_detected`: a boolean, or a list of found kinds?
- `operator_notes`: a string, or a list?

**4.3 `risk_codes` vocabulary.** Please send the full list of codes, or send each code as `{ code, label, label_i18n }`.
- The frontend has guessed labels for: `low_quality_scan`, `date_mismatch`, `stage_mismatch`, `result_mismatch`, `missing_signature`, `missing_seal`, `possible_edit`, `possible_ai_generated`, `pii_present`, `unreadable`.
- Any other code shows as "Boshqa xavf belgisi" (other risk sign).

**4.4 Checklist labels.** Does the achievement checklist carry `label` / `hint` / `label_i18n`, as experience does? Today the frontend translates the 6 known keys itself.

**4.5 Review history.** Does the detail return past `reviews`, and with which decision words: `approve` / `reject`, or `approved` / `rejected`?

**4.6 Evidence location.** Is `evidence` inside `record`, or at the top level of the detail? Both are read now.

## 5. Advocate certificate — `/marketplace/me/advocate-license/*`

**5.1 Upload and state response.** Which key holds the values the software read?
- Read now: `extracted | extracted_fields | suggested | suggestions | ai_analysis.extracted | ai_analysis.extracted_fields`.
- Field names read inside it: `holder_name | full_name`, `certificate_number`, `license_number`, `issuing_authority`, `advocate_status_started_at | status_started_at | issued_at`.

**5.2 State field.** Read now: `status | state | ai_analysis.status`. Values: `processing | analyzed | manual_review_required`.

**5.3 Accepted files.** Which file types and sizes does the certificate upload accept? The frontend limits it to PDF/JPG/PNG. Please confirm, or add these rules to a config endpoint.

**5.4 Realtime payload.** Does `marketplace.advocate_license_evidence_analyzed` carry the `evidence_id` and the extracted values? Today it only triggers a re-read of the evidence state.

**5.5 Resubmission.** After `rejected` / `changes_requested`, does the advocate upload a new file and submit again, or is there a revision link (like `source_id`)?

## 6. Advocate practice — `GET /marketplace/me/advocate-practice`

**6.1 Verification status values.**
- Read now: `none | unverified | not_submitted` → not verified; `pending | pending_review | submitted | ai_analysis_pending` → in review; `approved | verified` → verified; `rejected`; `changes_requested`.
- Please send the real list.

**6.2 Latest verification.** Where is the last verification's operator reason?
- Read now: `latest_verification | verification | pending_verification` → `.reason | .rejection_reason`, or `rejection_reason` at the top level.

**6.3 `active_experience_years`.** Is it a whole number or a decimal (for example `6.3`)? The frontend shows it exactly as sent.

**6.4 `legal_basis`.** Is it a string, an object (`{ text | title }`), or a list?

**6.5 Suspension items.** Do they carry `days`? Read now: `id, started_at, ended_at, reason, days | suspended_days`.

## 7. Call-center certificate queue — `/call-center/marketplace/advocate-licenses`

**7.1 Detail shape.**
- Read now: `record | verification`, `seller`, `checklist`, `reviews`, `diff`, `ai_analysis`, `practice`, `previous_approved_verification | previous_approved_revision`.
- Inside the AI object: `confidence | authenticity_confidence`, `operator_notes | notes`, `mismatched_fields | mismatches`.
- Please confirm.

**7.2 Practice in the detail.** Does the detail include the seller's `practice`, so the operator sees the tenure before changing suspensions? If not, which endpoint should the call center read it from?

**7.3 Review error codes.** Which `detail.code` values can `POST …/{id}/review` return? Expected now: `advocate_license_ai_analysis_pending`, `advocate_license_already_reviewed`, and checklist / reason codes like the ones for achievements.

**7.4 Review chat.** There is no `communication` endpoint for certificates. Is that by design?

## 8. Suspensions — `/call-center/marketplace/advocate-practice/{seller_user_id}/suspensions`

**8.1 Evidence.** `evidence_ids` is in the body, but there is no upload endpoint for suspension evidence. Which upload should the call center use? Today it always sends `[]`.

**8.2 Response shape.** Is the answer the practice object itself, or `{ practice: … }`? Both are read now.

**8.3 Delete.** Can a wrong suspension be deleted, or only edited (`ended_at`, `reason`)?

## 9. Pre-advocate employment

**9.1 Queue filter.** `GET /call-center/marketplace/experience` has no `experience_kind` filter. The frontend's kind filter therefore only narrows the rows already loaded. Can you add `experience_kind=` to the query?

**9.2 Kind on old records.** Do older experience records return `experience_kind: "category_experience"`, or is the field missing? A missing kind is read as category experience.

**9.3 Detail fields.** Please confirm the names `changed_fields` (a list of field names) and `history` (a list of revisions, or `{ items }`).

## 10. General lawyer profile — `PUT /lawyers/me`

**10.1 Omitted fields.** For advocates the frontend no longer sends `experience_years` or `license_number`. Does the upsert keep omitted fields as they are, or reset them to defaults? If it resets them, please ignore them for advocates on the backend instead.

**10.2 Public payloads.** Do the public seller payloads (`/marketplace/lawyers`, `/marketplace/lawyers/{id}`, promotions) carry `advocate_active_experience_years`? The frontend prefers it over `experience_years` wherever it is present.

## 11. Realtime payloads

**11.1 Queue events.** Do the `role:call_center` queue events carry the record id and its new status, or the whole record?
- Events: `marketplace.achievement_submitted`, `achievement_queue_updated`, `advocate_license_submitted`, `advocate_license_queue_updated`, `experience_submitted`, `experience_queue_updated`.
- With a record, the frontend can patch one row instead of re-reading the loaded rows. Today it re-reads once per burst of events.

**11.2 Experience events.** Do `marketplace.experience_reviewed` / `experience_review_chat_opened` carry `experience_kind`? The frontend uses it to decide which panel shows the toast.

## 12. Test access

**12.1 Test account.** Can we get a test advokat account without 2FA, or with a TOTP secret for the test environment? We need it to check the real config, practice and certificate answers before release. Without it, every shape above stays a guess.
