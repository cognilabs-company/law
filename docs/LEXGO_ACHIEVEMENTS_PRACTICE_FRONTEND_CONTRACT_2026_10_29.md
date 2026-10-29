# LexGo Achievements, Advocate License, Practice and Experience — Final Frontend Contract

Date: 2026-10-29  
Backend commit: `69c11a687d104868d60625f5165abdd55730ad4c`  
Production API: `https://lexgo.api.cognilabs.org`  
Status: deployed and server-tested

This document replaces frontend fallbacks and guessed field aliases for achievements, advocate license verification, advocate practice and pre-advocate employment. The backend is now the source of truth for labels, workflow states, evidence rules, review checklists, revision grouping, risk labels and realtime payloads.

## 1. Authentication and access

- Advocate self-service endpoints require an authenticated `advokat` account.
- Review endpoints require a user with marketplace experience-review permission. Call-center operators with the configured review permission are supported; the UI must not infer access only from the raw role name.
- A `403 { "detail": { "code": "advocate_role_required" } }` is expected when a superadmin tries to open an advocate-only self-service endpoint. Superadmin review screens must use `/call-center/marketplace/...` endpoints.
- Use the normal bearer token header: `Authorization: Bearer <access_token>`.

## 2. Achievement configuration

### `GET /marketplace/me/achievements/config`

The response is typed as `AchievementConfigOut` in OpenAPI:

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
  "description": { "min_length": 5, "max_length": 5000 },
  "warning": "Uzbek Latin warning text",
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
  ]
}
```

Do not hardcode stage/result labels. Select `label_i18n[currentLanguage]`, falling back to `label`.

Supported stage values:

- `pre_investigation`
- `inquiry`
- `preliminary_investigation`
- `court`

Supported result values:

- `full`
- `partial`

## 3. Achievement submission and revisions

### Upload evidence

`POST /marketplace/me/achievements/evidence` as `multipart/form-data`, field name `file`.

Errors:

- `413`, `detail.code=achievement_evidence_too_large`
- `415`, `detail.code=achievement_evidence_type_not_allowed`

### Submit

`POST /marketplace/me/achievements`

```json
{
  "source_id": null,
  "process_stage": "court",
  "result_scope": "full",
  "category_id": "category-uuid",
  "achieved_at": "2026-10-20",
  "description": "What was achieved and how it is supported by the decision.",
  "evidence_ids": ["evidence-uuid"]
}
```

- For a new record, omit `source_id` or send `null`.
- For a revision, send the latest record ID in `source_id`. Backend preserves the common `root_id` and increments `version`.
- Only one pending revision is allowed for a source.
- A future `achieved_at` returns `422 achievement_future_date`.
- Invalid category returns `422 achievement_category_invalid`.
- Duplicate pending revision returns `409 achievement_revision_already_pending`.

Initial state is `ai_analysis_pending`; the background analysis then moves it to `pending_review`. AI analysis is advisory. Only the operator can approve, reject or request changes.

## 4. Advocate's achievement list

### `GET /marketplace/me/achievements?status=&limit=&offset=`

Pagination is by revision root, not by individual record. Use `groups` as the primary UI structure:

```json
{
  "items": [],
  "groups": [
    {
      "root_id": "uuid",
      "current": {},
      "pending_revision": {},
      "latest": {},
      "revision_count": 2
    }
  ],
  "total": 1,
  "total_records": 2,
  "count": 1,
  "limit": 50,
  "offset": 0,
  "has_more": false
}
```

- `total` counts roots.
- `total_records` counts every revision.
- `count` counts groups in this page.
- `current` is the approved revision, if one exists.
- `pending_revision` is the pending AI/operator review revision, if one exists.
- `latest` is the highest version.

Every private item includes:

- `id`, `root_id`, `source_id`, `version`, `status`
- `process_stage`, `result_scope`, `category_id`, `category_title`
- `achieved_at`, `description`, `public_description`
- `evidence[]`
- `ai_analysis_status`
- normalized `ai_analysis`
- `rejection_reason`
- timestamps and review metadata when available

Status values used by this workflow:

- `ai_analysis_pending`
- `pending_review`
- `approved`
- `rejected`
- `changes_requested`
- `superseded`

## 5. Public achievement profile

### `GET /marketplace/lawyers/{seller_user_id}/achievements?limit=&offset=`

Only approved records are returned. Every item has an `id`. Use `public_description` as the safe public text. `description` may also be present for compatibility, but it must not be preferred by the public UI.

The backend removes contact details and common personal identifiers from the operator-approved public summary. The UI must never display evidence files, raw AI data or private description on a public profile.

## 6. Achievement review queue and detail

### Queue

`GET /call-center/marketplace/achievements?status=pending_review&seller_user_id=&limit=50&offset=0`

The response is `PaginatedContractOut` and includes `total`, `count`, `limit`, `offset`, `has_more`, `realtime_channel=role:call_center` and `realtime_event=marketplace.achievement_submitted`.

### Detail

`GET /call-center/marketplace/achievements/{achievement_id}`

Use these exact top-level fields:

- `record`
- `seller`
- `previous_approved_revision`
- `diff[]`
- `history[]`
- `reviews[]`
- `ai_analysis`
- `risk_catalog[]`
- `checklist_keys[]`
- `checklist[]`
- `communication`
- `ai_advisory_only=true`
- `final_decision_by=operator`

Evidence is available as `record.evidence[]`.

The review decision request is:

`POST /call-center/marketplace/achievements/{achievement_id}/review`

```json
{
  "decision": "approve",
  "reason": "",
  "public_description": "Safe public summary without personal data.",
  "checklist": [
    { "key": "type_and_date", "verdict": "approved", "note": "" }
  ]
}
```

Decision values are `approve`, `reject`, `changes_requested`. Stored status values are `approved`, `rejected`, `changes_requested`.

Errors:

- `404 achievement_not_found`
- `409 achievement_already_reviewed`
- `409 achievement_ai_analysis_pending`
- `422 achievement_checklist_incomplete`
- `422 achievement_reason_required`
- `422 achievement_public_description_required`
- `422 achievement_public_description_contains_pii`

## 7. Normalized AI analysis contract

The same normalized shape is used for achievement and advocate-license analysis:

```json
{
  "status": "completed",
  "analysis_type": "achievement",
  "document_readable": true,
  "claim_supported": true,
  "stage_matches": true,
  "result_scope_matches": true,
  "authenticity_confidence": 0.92,
  "manipulation_risk": 0.04,
  "ai_generated_risk": 0.03,
  "risk_level": "low",
  "risk_codes": [],
  "risk_items": [],
  "signature_detection": {
    "signature": true,
    "seal": true,
    "electronic_signature": false
  },
  "pii_detected": [],
  "operator_notes": [],
  "public_safe_summary": "...",
  "extracted_fields": {},
  "final_decision": "operator_required",
  "reason": ""
}
```

Confidence and risk numbers are normalized floats. `pii_detected` and `operator_notes` are always arrays. Signature information is always under `signature_detection`.

Known risk codes are returned with labels in `risk_catalog` and/or `risk_items`:

- `low_quality_scan`
- `date_mismatch`
- `stage_mismatch`
- `result_mismatch`
- `missing_signature`
- `missing_seal`
- `possible_edit`
- `possible_ai_generated`
- `pii_present`
- `unreadable`

Always render backend `label_i18n`; do not show a raw risk code.

## 8. Review checklist contract

Each detail response includes a ready-to-render checklist:

```json
{
  "key": "evidence_supports_claim",
  "label": "Dalillar ma’lumotni tasdiqlaydi",
  "hint": "Dalillar ma’lumotni tasdiqlaydi",
  "label_i18n": {
    "uz_latn": "...",
    "uz_cyrl": "...",
    "ru": "..."
  }
}
```

Use the returned array. Do not maintain a separate frontend checklist dictionary.

## 9. Advocate license evidence and submission

### Config

`GET /marketplace/me/advocate-license/config`

OpenAPI type: `AdvocateLicenseConfigOut`.

- Evidence: 1–20 files, maximum 20 MB per file.
- Accepted: PDF, JPG/JPEG, PNG, DOCX.
- Evidence states: `processing`, `analyzed`, `manual_review_required`.
- Verification states: `not_submitted`, `pending_review`, `approved`, `rejected`, `changes_requested`.
- Review decisions: `approve`, `reject`, `changes_requested`.
- Extracted fields: `holder_name`, `certificate_number`, `license_number`, `issuing_authority`, `advocate_status_started_at`, `issue_date`.

### Upload

`POST /marketplace/me/advocate-license/evidence`, multipart field `file`.

Errors:

- `413 advocate_license_evidence_too_large`
- `415 advocate_license_evidence_type_not_allowed`

### Read analysis state

`GET /marketplace/me/advocate-license/evidence/{evidence_id}`

```json
{
  "id": "uuid",
  "status": "analyzed",
  "file_name": "license.pdf",
  "mime_type": "application/pdf",
  "size": 12345,
  "extracted_fields": {},
  "ai_analysis": {},
  "final_decision": "operator_required"
}
```

### Submit verification

`POST /marketplace/me/advocate-license/submit`

```json
{
  "source_id": null,
  "evidence_id": "uuid",
  "holder_name": "Full name",
  "certificate_number": "...",
  "license_number": "...",
  "issuing_authority": "...",
  "advocate_status_started_at": "2020-01-10"
}
```

For a resubmission after rejection or requested changes, upload a new file and send the latest verification record ID in `source_id`. The backend maintains `root_id`, increments `version`, keeps full history and supersedes the old approved revision only after the new revision is approved.

Realtime event `marketplace.advocate_license_evidence_analyzed` contains:

- `evidence_id`
- `status`
- `extracted_fields`
- `ai_analysis`

The frontend may patch the evidence card immediately; a follow-up GET remains acceptable for recovery.

## 10. Advocate practice

### `GET /marketplace/me/advocate-practice`

OpenAPI type: `AdvocatePracticeOut`.

```json
{
  "seller_user_id": "uuid",
  "status_started_at": "2020-01-10",
  "verification_status": "approved",
  "verified_at": "2026-10-29T12:00:00Z",
  "active_experience_days": 2300,
  "active_experience_years": 6.3,
  "suspended_days": 15,
  "suspensions": [
    {
      "id": "uuid",
      "started_at": "2024-01-01",
      "ended_at": "2024-01-15",
      "reason": "...",
      "days": 15,
      "evidence_ids": []
    }
  ],
  "certificate_number": "...",
  "issuing_authority": "...",
  "latest_verification": {
    "id": "uuid",
    "status": "approved",
    "reason": "",
    "reviewed_at": "...",
    "version": 2
  },
  "legal_basis": {
    "code": "advocate_status_begins_on_certificate_issue",
    "text": "...",
    "suspension_excluded": true
  }
}
```

`active_experience_years` is decimal. Display it as returned. The backend subtracts overlapping suspension periods without double-counting days.

## 11. Call-center advocate-license review

### Queue

`GET /call-center/marketplace/advocate-licenses?status=pending_review&limit=50&offset=0`

### Detail

`GET /call-center/marketplace/advocate-licenses/{verification_id}`

The detail contains:

- `record`
- `seller`
- `seller_profile`
- `practice`
- `evidence`
- `ai_analysis`
- `previous_approved_verification`
- `diff[]`
- `history[]`
- `reviews[]`
- `checklist_keys[]`
- `checklist[]`
- `communication`
- `ai_advisory_only=true`
- `final_decision_by=operator`

### Review

`POST /call-center/marketplace/advocate-licenses/{verification_id}/review`

Decision values: `approve`, `reject`, `changes_requested`.

Errors:

- `404 advocate_license_verification_not_found`
- `409 advocate_license_already_reviewed`
- `422 advocate_license_checklist_incomplete`
- `422 advocate_license_reason_required`
- submission may return `409 advocate_license_ai_analysis_pending`
- submission may return `409 advocate_license_verification_pending`

### Communication

`POST /call-center/marketplace/advocate-licenses/{verification_id}/communication`

Returns:

```json
{
  "idempotent": false,
  "room_id": "uuid",
  "messages_url": "/secure-chats/{room_id}/messages",
  "calls_url": "/secure-chats/{room_id}/calls",
  "call_types": ["audio", "video"],
  "close_by_operator_only": true
}
```

Repeated calls reuse the active room and return `idempotent=true`.

Close with `POST /call-center/marketplace/advocate-licenses/{verification_id}/communication/close`. Closed review rooms become read-only.

## 12. Suspension evidence and corrections

- Upload: `POST /call-center/marketplace/advocate-practice/{seller_user_id}/suspensions/evidence`, multipart `file`.
- Download: `GET /call-center/marketplace/advocate-practice/{seller_user_id}/suspensions/evidence/{evidence_id}`.
- Create: `POST /call-center/marketplace/advocate-practice/{seller_user_id}/suspensions`.
- Edit: `PATCH /call-center/marketplace/advocate-practice/{seller_user_id}/suspensions/{suspension_id}`.
- Archive a wrong suspension: `DELETE /call-center/marketplace/advocate-practice/{seller_user_id}/suspensions/{suspension_id}`.

The delete operation is audit-safe: the record is archived rather than physically erased, then active practice is recalculated. Create, edit and archive responses return the current practice object directly, not `{ practice: ... }`.

Suspension evidence accepts PDF, JPG/JPEG, PNG, WEBP, DOC and DOCX, maximum 20 MB.

## 13. Experience and pre-advocate employment

### Seller list

`GET /marketplace/me/experience?status=&category_id=&limit=&offset=`

The response contains `groups[]`:

```json
{
  "root_id": "uuid",
  "current": {},
  "pending_revision": {},
  "latest": {},
  "revision_count": 2
}
```

`experience_kind` is always normalized. Legacy records without this field are returned as `category_experience`.

Valid kinds:

- `category_experience`
- `pre_advocate_employment`

### Submit

`POST /marketplace/me/experience`

For pre-advocate employment:

```json
{
  "source_id": null,
  "experience_kind": "pre_advocate_employment",
  "category_id": null,
  "subcategory_id": null,
  "workplace": "Organization",
  "positions": [
    {
      "title": "Legal counsel",
      "started_at": "2018-01-01T00:00:00Z",
      "ended_at": "2020-06-30T00:00:00Z",
      "is_current": false,
      "description": "..."
    }
  ],
  "description": "Overall verified experience description",
  "evidence_ids": ["uuid"]
}
```

### Call-center queue

`GET /call-center/marketplace/experience?status=pending_review&seller_user_id=&category_id=&experience_kind=pre_advocate_employment&limit=50&offset=0`

`experience_kind` is a backend filter, not a client-side-only filter.

### Detail

`GET /call-center/marketplace/experience/{experience_id}` includes:

- `record`
- complete `seller` and `seller_profile`
- `previous_approved_revision`
- `diff[]` with changed fields, labels, before and after values
- `history[]`
- `reviews[]`
- evidence files
- checklist labels
- communication URLs

Communication:

- create/reuse: `POST /call-center/marketplace/experience/{experience_id}/communication`
- close: `POST /call-center/marketplace/experience/{experience_id}/communication/close`
- secure chat call types: audio and video
- only the operator closes the review chat

## 14. Profile update compatibility

`PUT /lawyers/me` preserves omitted advocate verification fields. The frontend must not send guessed `experience_years` or `license_number` values for advocates. Verified license/practice data is managed by the dedicated verification workflow.

Public marketplace seller payloads prefer `advocate_active_experience_years` when available. Use legacy `experience_years` only as a compatibility fallback.

## 15. Realtime event payloads

Queue and review events now carry stable IDs, status/version metadata and, where applicable, the changed `record`:

- `marketplace.achievement_submitted`
- `marketplace.achievement_queue_updated`
- `marketplace.achievement_reviewed`
- `marketplace.advocate_license_submitted`
- `marketplace.advocate_license_queue_updated`
- `marketplace.advocate_license_reviewed`
- `marketplace.experience_submitted`
- `marketplace.experience_queue_updated`
- `marketplace.experience_reviewed`

Experience events include `experience_kind`. Chat-opened events include the record ID, `room_id`, and experience kind where relevant.

Recommended frontend behavior:

1. Patch a loaded row when `record` is present.
2. If the row is not loaded or the payload is incomplete, debounce one queue refetch.
3. Never issue one refetch per event burst.

## 16. OpenAPI and verification result

The following named schemas are present in generated OpenAPI:

- `AchievementConfigOut`
- `AdvocateLicenseConfigOut`
- `AdvocatePracticeOut`
- `PaginatedContractOut`
- `ReviewDetailOut`

Server verification completed after deployment:

- targeted contract/regression suite: passed
- full server regression: 358/358 passed
- production health: HTTP 200
- production commit: `69c11a687d104868d60625f5165abdd55730ad4c`
- no new production traceback/error after deployment

Frontend should now remove broad alias guessing for the exact contracts documented above and use the canonical fields directly.
