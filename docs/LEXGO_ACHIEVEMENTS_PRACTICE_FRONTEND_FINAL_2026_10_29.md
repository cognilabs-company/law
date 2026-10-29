# LexGo Achievements, Practice and Verification — Final Frontend Contract

Date: 2026-10-29  
Backend commit: `0829278daeb579d82b87482789995a907bbf91b0`  
Status: deployed and verified in production

## 1. Canonical integration rules

- Use the typed OpenAPI schemas. The relevant queue and detail responses are no longer free-form contracts.
- Never render UUIDs, raw enum values, or raw JSON. Render the supplied human labels and `label_i18n`.
- Seller-side `/marketplace/me/*` endpoints require an advocate/seller account. A superadmin receiving `403 advocate_role_required` from these self-service endpoints is expected; staff must use the `/call-center/marketplace/*` review endpoints.
- Staff access for all three review queues and details is controlled by `marketplace.experience.review`.
- `approvals.manage` remains accepted by the backend only as a legacy compatibility permission. New frontend permission checks must use `marketplace.experience.review`.
- A call-center lawyer is intentionally denied these operator review workflows.

## 2. Achievement configuration

### Endpoint

`GET /marketplace/me/achievements/config`

The response is typed as `AchievementConfigOut`:

```json
{
  "process_stages": [
    {
      "value": "pre_investigation",
      "label": "Tergovga qadar tekshiruv",
      "title": "Tergovga qadar tekshiruv",
      "label_i18n": {
        "uz_latn": "Tergovga qadar tekshiruv",
        "uz_cyrl": "Терговга қадар текширув",
        "ru": "Доследственная проверка",
        "en": "Pre-investigation review"
      }
    }
  ],
  "result_scopes": [
    {
      "value": "full",
      "label": "To‘liq ijobiy natija",
      "title": "To‘liq ijobiy natija",
      "label_i18n": {
        "uz_latn": "To‘liq ijobiy natija",
        "uz_cyrl": "Тўлиқ ижобий натижа",
        "ru": "Полный положительный результат",
        "en": "Full positive result"
      }
    }
  ],
  "evidence": {
    "required": true,
    "min_files": 1,
    "max_files": 20,
    "max_file_size_bytes": 20971520,
    "allowed_mime_types": [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png"
    ],
    "allowed_extensions": [".docx", ".jpg", ".pdf", ".png"]
  },
  "description": {"min_length": 5, "max_length": 5000},
  "warning": "Localized Uzbek warning",
  "warning_i18n": {
    "uz_latn": "...",
    "uz_cyrl": "...",
    "ru": "...",
    "en": "..."
  },
  "public_fields": [
    "process_stage",
    "result_scope",
    "category",
    "year",
    "public_description",
    "lexgo_verified"
  ],
  "workflow": [
    "evidence_upload",
    "submission",
    "ai_advisory_analysis",
    "operator_review",
    "public_profile"
  ],
  "ai_analysis_statuses": ["pending", "completed", "manual_review_required"]
}
```

The complete stage enum is:

- `pre_investigation`
- `inquiry`
- `preliminary_investigation`
- `court`

The complete result enum is:

- `full`
- `partial`

Every option contains `label`, `title`, and `label_i18n` for `uz_latn`, `uz_cyrl`, `ru`, and `en`.

## 3. Advocate achievements

### List

`GET /marketplace/me/achievements?status=&limit=&offset=`

Pagination is by achievement root, not by individual revision. The response contains:

- `items`: all revisions belonging to the roots on the current page;
- `groups`: root-level rows with `root_id`, `current`, `pending_revision`, `latest`, and `revision_count`;
- `total`: total roots;
- `total_records`: total physical revisions;
- `count`, `limit`, `offset`, `has_more`.

Use `groups` for the page UI. This prevents one root's revisions from being split across pages.

Each private achievement item contains canonical fields:

- `id`, `root_id`, `source_id`, `version`, `status`;
- `process_stage`, `process_stage_label`, `process_stage_label_i18n`;
- `result_scope`, `result_scope_label`, `result_scope_label_i18n`;
- `category_id`, `category_title`;
- `achieved_at`, `description`;
- `ai_analysis_status`;
- `ai_analysis`;
- `rejection_reason`;
- `evidence[]` with `id`, `file_name`, `mime_type`, `size`, `download_url`;
- timestamps.

The only valid `ai_analysis_status` values are:

- `pending`
- `completed`
- `manual_review_required`

Do not keep aliases such as `queued`, `running`, `failed`, or `done` in new frontend logic.

### Revision submission

For a new revision, send the selected latest record's `id` in `source_id`. The backend resolves its stable `root_id`, increments `version`, and keeps the approved revision active until the replacement is approved.

`POST /marketplace/me/achievements`

```json
{
  "source_id": "optional-latest-revision-id",
  "process_stage": "court",
  "result_scope": "full",
  "category_id": "category-id",
  "achieved_at": "2026-10-29",
  "description": "What was achieved and how",
  "evidence_ids": ["uploaded-evidence-id"]
}
```

## 4. Public achievements

`GET /marketplace/lawyers/{seller_user_id}/achievements?limit=&offset=`

Public items always include `id`. The safe public text is supplied in both `public_description` and `description`; use `public_description` as canonical. Raw private evidence and private text are not exposed.

Public items include localized stage/result labels, `category_title`, `year`, `achieved_at`, `lexgo_verified`, and `verified_at`.

## 5. Operator achievement review

### Queue

`GET /call-center/marketplace/achievements?status=pending_review&seller_user_id=&limit=&offset=`

The response is `PaginatedReviewQueueOut`. Every queue item contains:

```json
{
  "id": "record-id",
  "status": "pending_review",
  "seller_user_id": "user-id",
  "seller": {
    "id": "user-id",
    "lexgo_id": "LG...",
    "name": "Seller name",
    "phone": "+998...",
    "role": "advokat",
    "account_status": "active"
  }
}
```

The top-level response also contains `total`, `count`, `limit`, `offset`, `has_more`, `realtime_channel`, `realtime_event`, and `required_permission`.

### Detail

`GET /call-center/marketplace/achievements/{achievement_id}`

Canonical locations:

- AI analysis: top-level `ai_analysis`;
- evidence: `record.evidence`;
- previous approved item: `previous_approved_revision`;
- comparison: `diff[]`;
- revision history: `history[]`;
- decision audit: `reviews[]`;
- risk display: `risk_catalog[]` and `ai_analysis.risk_items[]`;
- localized checklist: `checklist[]`;
- permission: `required_permission`.

Canonical AI types:

- `document_readable`, `claim_supported`, `stage_matches`, `result_scope_matches`: boolean;
- `authenticity_confidence`: number from 0 to 1;
- `manipulation_risk`, `ai_generated_risk`: number from 0 to 1;
- `risk_level`: string;
- `risk_codes`: string array;
- `risk_items`: `{code, label, label_i18n}[]`;
- `signature_detection`: `{signature, seal, electronic_signature}` booleans;
- `pii_detected`: string array;
- `operator_notes`: string array;
- `public_safe_summary`: string;
- `final_decision`: `operator_required`.

AI is advisory only. The operator makes the final decision.

### Review request and history vocabulary

Submit action words:

- `approve`
- `reject`
- `changes_requested`

History and resulting statuses use:

- `approved`
- `rejected`
- `changes_requested`

Every `reviews[]` entry returns both:

```json
{
  "decision": "approved",
  "decision_action": "approve"
}
```

This resolves the `approve` versus `approved` ambiguity. `decision` is a stored status; `decision_action` is the action submitted by the operator.

## 6. Advocate certificate and practice

### Certificate config

`GET /marketplace/me/advocate-license/config`

Use this endpoint as the only source for file rules, states, verification statuses, decisions, extracted fields, realtime events, and mismatch fields.

Accepted evidence:

- maximum 20 MB;
- PDF, DOCX, JPG/JPEG, PNG;
- error `413` with `detail.code=advocate_license_evidence_too_large`;
- error `415` with `detail.code=advocate_license_evidence_type_not_allowed`.

### Evidence state

`GET /marketplace/me/advocate-license/evidence/{evidence_id}`

Canonical response keys:

- `id`, `status`, `file_name`, `mime_type`, `size`;
- `extracted_fields`;
- `ai_analysis`;
- `final_decision`.

Canonical evidence states are `processing`, `analyzed`, and `manual_review_required`.

The evidence-analyzed realtime event includes the evidence identifier. Re-read the evidence state after receiving it; this remains the supported consistency flow.

After rejection or `changes_requested`, upload new evidence and submit a new verification with the previous verification id in `source_id`.

### Certificate mismatch display

`GET /call-center/marketplace/advocate-licenses/{verification_id}` returns mismatches in both:

- top-level `mismatched_fields[]`;
- `ai_analysis.mismatched_fields[]`.

Each item is:

```json
{
  "field": "certificate_number",
  "submitted_value": "submitted text",
  "extracted_value": "recognized text",
  "matches": false
}
```

The config endpoint also returns the complete `mismatch_fields` list.

### Practice

`GET /marketplace/me/advocate-practice`

Canonical verification statuses:

- `not_submitted`
- `pending_review`
- `approved`
- `rejected`
- `changes_requested`

`active_experience_years` is a decimal and must be displayed as supplied. `legal_basis` is an object. `latest_verification` contains the latest status and operator reason. Suspension rows contain `id`, `started_at`, `ended_at`, `reason`, `days`, `evidence_ids`, and `created_at`.

### Suspension evidence and corrections

- Upload: `POST /call-center/marketplace/advocate-practice/{seller_user_id}/suspensions/evidence`
- Download: `GET /call-center/marketplace/advocate-practice/{seller_user_id}/suspensions/evidence/{evidence_id}`
- Create: `POST /call-center/marketplace/advocate-practice/{seller_user_id}/suspensions`
- Edit: `PATCH /call-center/marketplace/advocate-practice/{seller_user_id}/suspensions/{suspension_id}`
- Delete wrong row: `DELETE /call-center/marketplace/advocate-practice/{seller_user_id}/suspensions/{suspension_id}`

Create/edit responses include the updated practice state in `practice`.

## 7. Certificate review queue and communication

- Queue: `GET /call-center/marketplace/advocate-licenses?status=&limit=&offset=`
- Detail: `GET /call-center/marketplace/advocate-licenses/{verification_id}`
- Review: `POST /call-center/marketplace/advocate-licenses/{verification_id}/review`
- Open chat/call: `POST /call-center/marketplace/advocate-licenses/{verification_id}/communication`
- Close communication: `POST /call-center/marketplace/advocate-licenses/{verification_id}/communication/close`

The detail has typed `seller`, `seller_profile`, `practice`, evidence, AI analysis, mismatches, previous approved verification, diff, history, reviews, localized checklist, and communication URLs. Audio and video calls are supported. Only the operator closes the review chat; closing makes it read-only.

Review actions are `approve`, `reject`, and `changes_requested`. The backend returns explicit structured codes for not found, already reviewed, incomplete checklist, required reason, and pending analysis conditions.

## 8. Pre-advocate employment and category experience

### Queue filtering

`GET /call-center/marketplace/experience`

Supported filters:

- `status`
- `seller_user_id`
- `category_id`
- `experience_kind=category_experience|pre_advocate_employment`
- `limit`
- `offset`

Old records without an explicit kind are normalized as `category_experience`.

### Detail

`GET /call-center/marketplace/experience/{experience_id}`

Use:

- `record` for the submitted revision;
- `seller` and `seller_profile` for reviewer context;
- `previous_approved_revision` for comparison;
- `diff[]` for field-level before/after values;
- `revision.changed_fields[]` for highlighting;
- `history[]` for all revisions;
- `reviews[]` for decisions;
- `actions` for currently allowed actions and URLs;
- `communication` for chat/call URLs.

Canonical review actions are `approve`, `reject`, and `changes_requested`. For backward compatibility only, `approved` and `rejected` are accepted by this endpoint. New frontend code must submit canonical action words.

The same record carries `experience_kind`, and `marketplace.experience_reviewed` plus `marketplace.experience_review_chat_opened` include `experience_kind`.

## 9. General profile preservation

When advocates update `PUT /lawyers/me` without `experience_years` or `license_number`, backend-owned verified values remain unchanged. The client must not send empty placeholder values for those fields.

Public marketplace seller payloads expose `advocate_active_experience_years` as the authoritative advocate-practice duration. Prefer it over legacy `experience_years` when present.

## 10. Realtime contract

Queue events are sent to `role:call_center` and now include the complete patchable queue `record`, not only an id.

Events:

- `marketplace.achievement_submitted`
- `marketplace.achievement_queue_updated`
- `marketplace.advocate_license_submitted`
- `marketplace.advocate_license_queue_updated`
- `marketplace.experience_submitted`
- `marketplace.experience_queue_updated`

The nested `record` has the same seller fields as the HTTP queue. Upsert by `record.id`; remove or move the row when `record.status` no longer matches the active queue filter. Re-fetch only if an older server event lacks `record`.

Seller events include:

- `marketplace.achievement_reviewed`
- `marketplace.advocate_license_reviewed`
- `marketplace.experience_reviewed`
- review chat-opened events.

Experience review and chat events include `experience_kind`.

## 11. Frontend implementation checklist

1. Generate API types from the current production OpenAPI.
2. Gate review navigation with `marketplace.experience.review`.
3. Use `groups` for the seller achievement list.
4. Render stage/result names from item-level `*_label_i18n`; do not maintain a separate frontend enum table.
5. Treat `ai_analysis_status` as a strict three-value enum.
6. Submit review actions; display review statuses.
7. Read `seller` directly from each queue row.
8. Highlight experience edits from `revision.changed_fields` and `diff`.
9. Render certificate mismatches from top-level `mismatched_fields`.
10. Use the returned `communication` URLs for review chat and calls.
11. Patch queues from realtime `record` payloads.
12. Do not expose evidence, raw AI analysis, certificate numbers, or private profile data in public views.

## 12. Backend verification

- Production commit: `0829278daeb579d82b87482789995a907bbf91b0`
- Dedicated permission is seeded: `marketplace.experience.review`
- Targeted contract tests: 13 passed
- Full production-server regression: 361 passed
- Production health: HTTP 200 / status `ok`
- OpenAPI verified for typed queue, seller, canonical review enum, AI statuses, mismatch fields, and required permission
- No new production error was found after deployment

