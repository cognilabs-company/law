# LexGo backend answers to remaining frontend questions

Date: 1 November 2026  
Source of truth: production backend code, production database and the currently deployed API

## 1. New questions

### N1 — Contact SLA: what starts contact

`contact_started_at` is set only by the assigned seller's first real communication in the paid marketplace service room:

- first text message: `channel=chat`;
- first uploaded file/message attachment: `channel=chat_file`;
- first created audio or video call: `channel=audio` or `channel=video`.

Opening the client's phone number, merely opening the chat, accepting the order, or starting the work does not set it. Therefore the described order can be in progress while `contact_started_at` is still empty. The frontend is correct to use the backend fields and must not infer contact locally.

### N2 — Contact SLA: `today`

Current production behaviour is duration-based, not end-of-calendar-day:

- `within_15_min`: accepted time + 15 minutes;
- `within_1_hour`: accepted time + 60 minutes;
- `today`: accepted time + 12 hours;
- `tomorrow`: accepted time + 36 hours.

Dates are stored as timezone-aware UTC ISO timestamps. The UI should display them in `Asia/Tashkent`. The example is therefore expected under the current implementation: 30 Oct 15:57 Tashkent + 12 hours = 31 Oct 03:57 Tashkent. The label `today` is semantically misleading; this is an acknowledged backend/product-contract gap, not a frontend calculation issue.

### N3 — 30% / 40% checklist stages

Production order `878ccf8a-fe39-40bb-8c72-9bbb5d33eef5` contains four persisted checklist items, but none of those four items contains `payout_stage`. The two item names containing `30%` therefore cannot be classified by contract and the frontend correctly falls back to the final 40% group.

For new correctly configured services, order checklist items use:

- `payout_stage=first_checklist` for the first 30% stage;
- `payout_stage=final_completion` for the final 40% stage.

The service checklist is copied into the order and then persisted as the order snapshot. Later service changes do not rewrite an existing order. The named production order is a legacy/incomplete snapshot and remains unchanged.

### N4 — Studio K07 English

Gap confirmed. Runtime legal documents already support English, but the current K07 constructor's `title_i18n` and `body_i18n` nested schema still advertises only `uz_latn`, `uz_cyrl` and `ru`. `en` is not yet present in that Studio schema, so it is not a frontend issue.

### N5 — Studio K07 error contract

No. Current behaviour is:

- `POST /studio/constructors/K07/validate` returns HTTP 200 with `ok=false` and field-level errors such as `translation_required`;
- `POST /studio/objects/{id}/submit` returns HTTP 422 with `detail.code=studio_submit_invalid` and nested `detail.errors[]`;
- publish can wrap runtime sync failures as HTTP 409 with `detail.code=studio_publish_failed`.

The legal endpoint errors `legal_uz_translation_required` and `legal_translation_pair_required` are not yet consistently exposed by all three Studio operations.

## 2. Integration questions

### Q1 — Planned payout stages key

The immutable financial snapshot uses `payment.payout_stages`. Each element has `stage`, `gross_percent`, `gross_amount`, `commission_deducted`, and for completion also `seller_amount`.

The financials response also has a top-level `payout_stages`, but that is the list of actual payout records and is not the planned snapshot. For the plan, use only `snapshot.payment.payout_stages`.

### Q2 — Warranty available resolutions

`GET /marketplace/runtime-capabilities` currently exposes warranty booleans but does not expose `warranty.available_resolutions`. Claim/list payloads do contain `available_resolutions`, normally `replacement` and `full_refund`. Runtime capability typing is still missing.

### Q3 — Public service pricing factors

Yes. `GET /marketplace/services/{service_id}/runtime-configuration` currently returns `pricing.factors`. They have not been removed. This is the current public contract.

### Q4 — Experience validation and config

There is no `GET /marketplace/me/experience/config` endpoint yet. Current exact validation codes are:

- `experience_category_required`;
- `experience_category_invalid`;
- `experience_subcategory_invalid`;
- `experience_positions_required`;
- `experience_dates_invalid`;
- `experience_future_date`;
- `experience_kind_revision_mismatch`;
- `experience_revision_already_pending`;
- `experience_evidence_too_large` with HTTP 413;
- `experience_evidence_type_not_allowed` with HTTP 415.

The current evidence limit and MIME list are backend constants and are not yet published through an experience config endpoint.

### Q5 — `rule_title_exists`

Constructor validation returns HTTP 200 with `ok=false` and `errors[].code=rule_title_exists`. Object submission returns HTTP 422 with `detail.code=studio_submit_invalid`, while `rule_title_exists` is inside `detail.errors[]`. It is not a direct HTTP 409 response.

### Q6 — Location source values

Seller location updates accept `foreground`, `background`, `manual`, and `office`. Public map items can additionally describe resolved display sources such as `live`, `office`, or `profile_region`; those are output semantics, not accepted update values.

### Q7 — `service_action.purchase_url`

It is an API path, not a page route. Call it as `POST /marketplace/lawyers/{seller_user_id}/services/{service_id}/purchase-request`.

### Q8 — Map loader locale

Current map config is fixed to `lang=uz_UZ`. It does not accept locale and does not return per-locale loader URLs yet.

### Q9 — Subscription feature editing/deletion

No PATCH or DELETE exists. The feature registry is intentionally backend-managed today; admin can list the registry and create only pre-approved backend keys. Editing or retiring arbitrary keys is not currently planned in the active contract.

### Q10 — Legacy plans

Production currently has 11 active plans. There is no safe automatic rule that identifies and retires the five referred legacy plans, and there is no dedicated retire endpoint. They remain active until a product-approved slug list is provided or a plan retirement workflow is implemented.

### Q11 — Verified-seller 50% discount in plan quote

No. Subscription plan quote currently applies the normal user/referral quote and an active promotion campaign. There is no verified-seller 50% discount component in the quote.

### Q12 — Demo payment confirmation

The endpoint still exists in code but is included in OpenAPI only when `DEMO_MODE` is enabled. Production OpenAPI hiding means it must be treated as retired/unavailable for production frontend flows.

## 3. Backend gap status

### G1 — Ranked candidates and explicit seller assignment

Partial. Ranked candidates are available through `GET /matching/candidates`. The escalation resolve body does not yet accept `seller_user_id`; its `reassign` action selects the next candidate automatically.

### G2 — Escalation chat and call

Not delivered as a dedicated escalation contract. Generic secure chat and secure-chat call APIs exist, but the assignment escalation itself does not expose a typed room/create-chat action or persist a dedicated escalation room.

### G3 — Warranty rework and KPI

Not delivered. Current resolutions are `replacement`, `full_refund`, and `rejected`. There is no `rework`, no order-level `warranty_eligible_kinds`, and no warranty KPI endpoint.

### G4 — Idempotency and typed settlement

Partial. Assignment resolution and client resolution choice require `Idempotency-Key`. Payout mark-paid, payout recovery, and complaint resolution do not yet have the complete requested header contract. Settlement responses remain partly flexible/dict-based rather than fully typed.

### G5 — Admin subscription consent history

Not delivered. The user contract exposes only the latest renewal consent; no admin history endpoint exists.

### G6 — K17 developer-task activation gate

Not delivered. Developer tasks are created and exposed, but publishing a plan version does not currently block on the linked task being accepted/ready.

### G7 — Persisted advertisement test flag

Not delivered. Some Studio list output derives `is_test` heuristically from names, but advertisement accounts and purchases do not have the requested persisted `is_test` contract.

### G8 — Nested experience reviewer

Not delivered consistently. Review history contains reviewer user IDs but does not consistently return `reviewer: {id, name}`.

### G9 — Evidence access audit

Not delivered. Evidence upload/download authorization exists, but there is no typed view/download/upload/delete audit trail API.

### G10 — Experience overlap rule

Not delivered. Position date order and future dates are validated; overlapping intervals inside one workplace are merged for duration calculation rather than rejected with `experience_dates_overlap`.

### G11 — Service-rule audience filtering

Not delivered. `GET /marketplace/service-rules` has no `audience` query parameter and does not expose the audience field in each returned item.

### G12 — Nested publisher for document settings

Not delivered. Publisher IDs are stored, but global document settings do not consistently return `published_by: {id, name}`.

### G13 — Typed K36 preview

Not delivered as a dedicated typed coefficient preview contract. Generic Studio preview exists.

### G14 — Secure-chat reactions

Not delivered. There is no persisted reaction model, reaction API, or reaction realtime event.

### G15 — Seller rating admin detail/history

Partial. Rating recalculation, status, and active policy endpoints exist. There is no `GET /admin/marketplace/sellers/{id}/rating`, and policy version history is not exposed.

### G16 — Monitoring thresholds and grants

Partial. Monitoring uses fixed backend thresholds. Temporary monitoring grants exist for Live Office, but monitoring threshold GET/PUT and a dedicated monitoring-grant contract are absent.

### G17 — CEO export and quality filters

Partial. A synchronous CEO Excel export exists. It is not a background job. `/quality/overview` has no date filters and currently returns simplified quality values rather than the complete acceptance/contact SLA dataset.

### G18 — Payment webhook sandbox

Not delivered.

### G19 — Map avatars

Not delivered in runtime map payloads. Schemas mention avatar fields in some places, but public markers and nearby results currently do not populate `avatar_url`.

## 4. External blockers and content

### E1 — Yandex Geocoder

Externally blocked. The configured provider key still receives HTTP 403. Backend fallback can show non-geocoded/list data, but a working provider key must be supplied. No reliable delivery date can be given by backend.

### E2 — Payme / Click production

Externally blocked. Production contracts, credentials, webhook registration, settlement/refund credentials and provider-side sandbox/production approval have not been supplied. No backend date can be committed until those are available.

### C1 — Remaining legal text translations

Content blocked. English translation support exists, but reviewed English content for the remaining ten legal documents and reviewed Russian remote-assistance consent have not been supplied/published. There is no frontend work required until content is approved.

### T1 — OpenAPI typing

Partial. Several recently added top-level response classes exist, but the listed nested contracts are not all fully typed. In particular, settlement, `client_price_reasons`, client checklist items, monitoring nested objects, geocoder items and office payloads still use flexible dictionaries in parts of OpenAPI. Frontend should continue using the documented runtime fields and an honest unavailable state for the missing contracts.

## Frontend rule

Do not emulate any item marked partial, missing, or externally blocked. Use backend capability flags and URLs when present, and show “not available yet” when the required typed capability is absent.
