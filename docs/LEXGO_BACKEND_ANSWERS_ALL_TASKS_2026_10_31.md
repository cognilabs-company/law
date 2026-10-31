# LexGo Backend Answers — All Frontend Tasks

Date: 2026-10-31  
Recipient: Abdurahmon  
Environment: current `main` / production API

## Status legend

- **READY** — implemented and can be integrated now.
- **PARTIAL** — core behavior exists, but a documented field, typed OpenAPI schema, endpoint, or edge case is still missing.
- **BACKEND GAP** — requested behavior is not implemented yet; frontend should not simulate it.
- **EXTERNAL BLOCKER** — code support exists, but a third-party contract, credential, or provider setup is required.
- **OWNER DECISION** — the product decision is already fixed and frontend should follow it.

## 1. Marketplace money flows

### 1.1 Operator-selected seller during reassignment

**Status: BACKEND GAP**

Current endpoint:

`POST /call-center/marketplace/assignment-escalations/{escalation_id}/resolve`

Current request fields are:

```json
{
  "action": "reassign",
  "message": null,
  "reason": null,
  "target": null,
  "deadline_minutes": 30
}
```

There is currently no `seller_user_id` field and no candidates endpoint. The backend chooses a suitable seller automatically when `action=reassign` is used.

Required backend addition before the operator can choose manually:

- candidates endpoint with ranking/explanation;
- optional `seller_user_id` in the resolve request;
- validation that the selected seller is eligible, active, available, and allowed for the service;
- a new 30-minute acceptance deadline for the selected seller.

The resolve operation already supports `Idempotency-Key` for resolution actions such as reassignment, cancellation, full refund, and resolution offers.

### 1.2 Escalation chat and call

**Status: BACKEND GAP**

There is no escalation-specific endpoint that creates an operator/client/seller room directly from an assignment escalation. The existing `message` resolution action sends notifications and writes audit data, but it is not a chat-room creation API.

Generic secure-chat calls work only after an eligible secure room already exists. Frontend must not invent a room ID.

### 1.3 Contact SLA

**Status: READY, OpenAPI typing is PARTIAL**

Accepted purchase values:

- `within_15_min`
- `within_1_hour`
- `today`
- `tomorrow`

Order responses expose:

- `contact_speed`
- `contact_speed_label`
- `contact_deadline_at`
- `contact_started_at`

The correct field name is `contact_started_at`; there is no canonical `first_contact_at` field.

Realtime events:

- `marketplace.contact_started`
- `marketplace.contact_sla_breached`

The escalation reason is `seller_contact_sla_breach`.

Frontend may integrate these fields now, but the response is still partly flexible in OpenAPI.

### 1.4 Real provider refund

**Status: EXTERNAL BLOCKER**

The backend has Payme/Click provider refund hooks. For a provider-backed payment it attempts the provider refund first; when provider readiness is unavailable, it falls back to the operator/manual process.

Production merchant credentials, contracts, and verified webhook configuration are not complete, so real automatic refunds must currently be treated as manual/operator-controlled.

### 1.5 Warranty workflow

**Status: PARTIAL**

Current warranty kinds:

- `no_response`
- `sla_breach`
- `abandoned`
- `not_delivered`
- `seller_restricted`

Current resolution values:

- `replacement`
- `full_refund`
- `rejected`

Queue, detail, and resolve APIs exist. The following requested items do not exist yet:

- `rework` resolution;
- `warranty_eligible_kinds` on the order response;
- dedicated warranty KPI endpoint.

Frontend should use only the values returned by `available_resolutions` and must not hard-code `rework` yet.

### 1.6 Client price explanation, Superadvokat, and commission

**Status: PARTIAL**

The order pricing snapshot supports:

- catalog/base price;
- seller price adjustment;
- selected option adjustment;
- rounding adjustment;
- localized client-safe price reasons, including experience, rating, Superadvokat/seller premium, and seller discount reasons.

For the client response, private coefficients, internal pricing components, platform commission, and seller net income are intentionally removed.

Commission remains available only in seller/staff financial data. It is not a client-visible price component.

There is no separate public numeric `superadvokat` component. Frontend should display only `client_price_reasons[].text` or localized `text_i18n`, never reconstruct internal coefficients.

### 1.7 Payout and complaint idempotency; settlement typing

**Status: PARTIAL**

Payout `mark-paid` and recovery resolve operations are state-idempotent: repeating an already completed operation returns an idempotent result instead of creating a second payout/recovery. Complaint resolution also replays the same resolution safely.

However, these operations do not consistently accept an explicit `Idempotency-Key` header. Settlement data exists in staff financial responses, but parts of the OpenAPI response are still flexible dictionaries.

Frontend should prevent duplicate button submissions now. Explicit idempotency-header support and fully typed settlement schemas remain backend work.

### 1.8 Click and Payme production readiness

**Status: EXTERNAL BLOCKER**

Provider adapters and readiness reporting exist. Production operation still requires:

- signed merchant contracts;
- production merchant credentials;
- callback/webhook registration;
- provider-side reconciliation testing;
- refund testing with real provider transactions.

Frontend must use the backend readiness response and must not show an enabled provider when `provider_enabled=false` or readiness is false.

### 1.9 Fifteen-minute rating and complaint window

**Status: READY**

After service completion, both rating and complaint deadlines are set to 15 minutes. After the deadline:

- rating is closed;
- complaint submission is rejected with `detail.code=complaint_window_closed`;
- seller rating is recalculated from accepted ratings;
- settlement may proceed when no hold exists.

Frontend should rely on backend deadline/capability fields and backend errors, not only a local timer.

### 1.10 30/30/40 payout stages

**Status: READY with contract clarification**

The order financial snapshot records the planned stages:

1. acceptance — 30%;
2. first checklist — 30%;
3. completion — 40%.

The LexGo commission is deducted during the completion stage according to the stored financial snapshot.

Rules:

- acceptance stage is created when the eligible acceptance condition is reached;
- first-checklist stage is created only after every `first_checklist` item is either `done` or `skipped_with_reason`;
- if no first-checklist items exist, that stage is not automatically triggered;
- `skipped_with_reason` counts as completed and its reason remains auditable;
- completion payout is created after the 15-minute rating/complaint window closes and no settlement hold exists.

Events include:

- `marketplace.payout_created`
- `marketplace.payout_paid`
- `marketplace.payout_required` for call-center workflows

`GET /marketplace/me/orders/{order_id}/financials` returns the immutable snapshot, actual payouts, actual payout-stage rows, and settlement state. Planned stages and actual created payout rows are separate concepts.

## 2. Tariffs, advertisements, and promotions

### 2.1 K17 feature limits

**Status: READY with migration note**

The backend feature registry and subscription-plan versions support unavailable, limited, and unlimited entitlements. Limited usage periods reset every 30 days, including multi-month subscriptions.

Relevant APIs are under:

- `/admin/subscription-features`
- `/admin/subscription-plans/.../versions`
- `/subscriptions/me/features`

K17 Studio content is intended for customer-facing benefits and developer delivery metadata. Runtime feature limits come from the backend feature registry/version contract, not arbitrary K17 text fields.

The old `/admin/plans` UI can be removed only after the frontend fully uses subscription features and versioned subscription-plan APIs.

### 2.2 Renewal consent audit and rollback

**Status: PARTIAL**

Available:

- `GET /subscriptions/{id}/contract`
- renewal-consent operation for changed next-cycle terms;
- immutable subscription snapshot for the current paid cycle;
- changes applied on the next renewal, not retroactively.

Consent records are stored, but a complete typed admin consent-history endpoint is not currently exposed. Frontend can show the current contract/consent state; full historical audit UI needs an additional backend endpoint.

### 2.3 Developer task and publication approval

**Status: PARTIAL**

When a K17 object containing `developer_note` is published, the backend can create a LexTask for developers, with a default seven-day deadline when none is supplied. Studio approval information and task information are returned.

Current limitation: Studio publication itself can activate/publish the plan version before the developer task is completed. If the business rule is “never sell until developer implementation is accepted,” an additional activation gate is still required.

### 2.4 Advertisement test-data readiness

**Status: PARTIAL**

Advertisement readiness checks exist and current filtering excludes obvious test/demo records through record-content checks. There is no canonical persisted `is_test` field across all related advertisement accounts and purchases, and the OpenAPI response remains partially flexible.

Frontend should use backend readiness flags, but durable test-data labeling remains backend work.

### 2.5 Promotion atomicity and non-negative price

**Status: READY**

Promotion application is revalidated during payment approval under locking. Expiry and usage limits are checked again, exhausted campaigns are rejected, and the final amount is never allowed below zero.

Frontend must display the backend-calculated amount and must not calculate promotion exhaustion locally.

## 3. Experience, achievements, and Superadvokat

### 3.1 Reviewer history

**Status: PARTIAL**

History data includes:

- `reviewed_by_user_id`
- `reviewed_at`
- `checklist`
- `decision`
- `decision_action`

A normalized nested object such as `reviewer: {id, name}` is not consistently returned. Frontend can use the reviewer ID now; a typed reviewer summary remains backend work.

### 3.2 Required review checklist items

**Status: READY with clarification**

The review checklist contract returns `key`, `label`, `hint`, and localized labels. There is no separate `required` field because all current checklist items are mandatory for approval.

If optional checklist items are introduced later, the schema must add an explicit `required` flag. Frontend should currently treat every returned checklist item as required.

### 3.3 Experience evidence configuration and validation errors

**Status: PARTIAL**

There is no separate `GET /marketplace/me/experience/config` endpoint.

Current evidence limits:

- maximum file size: 20 MB;
- accepted: PDF, JPEG, PNG, WebP, DOC, DOCX.

Current error codes:

- `experience_evidence_too_large` with HTTP 413;
- `experience_evidence_type_not_allowed` with HTTP 415;
- `experience_dates_invalid`;
- `experience_future_date`;
- category/subcategory validation codes.

There is no current `experience_dates_overlap` error code. Frontend must use the codes above, not undocumented `evidence_file_*` names.

### 3.4 Evidence access audit

**Status: PARTIAL**

Evidence access is permission-protected for the owner and authorized reviewer. Upload/download/view activity is not yet exposed as a dedicated complete evidence-access audit trail. `/admin/audit-trail` exists but its contract is still flexible and does not replace a typed evidence audit contract.

### 3.5 Overlapping employment periods

**Status: BACKEND GAP for rejection behavior**

Current behavior:

- overlapping position intervals inside one workplace are merged for duration calculations;
- parallel employment at different workplaces is allowed;
- overlap is not rejected with `experience_dates_overlap`.

If frontend acceptance criteria require a hard validation error within one workplace, backend validation must be added first.

### 3.6 Achievement types

**Status: OWNER DECISION / READY**

The approved current model is stage-result achievements, not a free-form `achievement_type` catalog.

One achievement contains:

- one `process_stage`: `pre_investigation`, `inquiry`, `preliminary_investigation`, or `court`;
- one `result_scope`: `full` or `partial`;
- category;
- achievement date;
- description;
- at least one evidence file.

This workflow is currently for advocates. Frontend should not add a separate achievement-type selector.

### 3.7 Superadvokat policy

**Status: PARTIAL**

Available:

- K37 rating policy;
- Superadvokat manual override and override history;
- Superadvokat as a criterion in the advocate/lawyer price-coefficient constructor.

There is no independent standalone typed “Superadvokat policy” resource separate from rating policy, coefficient configuration, and manual override. Frontend should read the existing policy/configuration endpoints instead of creating local rules.

### 3.8 Public seller profile privacy

**Status: READY for privacy**

The public lawyer profile is designed to exclude private fields such as license number, education details, and internal verification status. It exposes a simple public `is_verified` flag.

Frontend must not infer or display hidden professional documents. Some list/detail OpenAPI surfaces may remain flexible, but private data must not be read or displayed even if an older cached response contains empty legacy keys.

### 3.9 Typed client price reasons

**Status: READY functionally, OpenAPI typing is PARTIAL**

Localized client-safe price reasons are generated and private coefficients/components are removed from client responses. The dedicated nested schema is not yet fully represented in every OpenAPI order response.

Frontend should safely read:

- `code`
- `text`
- `text_i18n`

It should never calculate or reveal internal coefficient details.

## 4. Studio

### 4.1 K31 duplicate rule title

**Status: contract correction required**

The current backend validation code is:

`rule_title_exists`

The validation payload may also contain:

- `existing_rule_id`
- `existing_rule_key`

There is no canonical `rule_title_duplicate` code. Frontend should support `rule_title_exists` unless backend is later changed consistently.

### 4.2 Multiple executor types

**Status: PARTIAL**

Studio K02 and runtime configuration support multiple executor types through `executor_types`. However, some older legal-service schemas still expose only singular `executor_type`.

Frontend should prefer runtime `executor_types` where returned. Full OpenAPI migration of all service create/read schemas remains backend work.

### 4.3 Checklist evidence privacy

**Status: READY functionally, OpenAPI typing is PARTIAL**

Client checklist responses remove hidden comments, images, files, and other evidence that is not marked client-visible. This is enforced server-side.

Frontend should still render only fields returned to the client and must not reuse seller-side checklist objects in the client UI.

### 4.4 Service-rule audience filtering

**Status: PARTIAL / BACKEND GAP on list filter**

Runtime service configuration separates client and executor rules. However, the general `GET /marketplace/service-rules` list endpoint does not currently support an `audience` query filter and may omit the audience value in its compact items.

Use runtime service configuration for purchase/execution screens. A typed audience filter is still required for a generic rule-management selector.

### 4.5 Document global settings actor and snapshot

**Status: PARTIAL**

Publication stores:

- `published_by_user_id`
- `published_at`

Orders/quotes preserve a document-policy/settings snapshot and version. The response is not yet consistently typed as a nested `published_by` user object.

Frontend should display the publisher ID/time when present and use the immutable order snapshot for historical orders.

### 4.6 K36 preview

**Status: BACKEND GAP for dedicated typing**

Studio has the generic preview operation:

`POST /studio/constructors/{code}/preview`

There is no dedicated typed K36 preview schema. Frontend can call the generic preview now, but rich coefficient-specific preview typing remains backend work.

### 4.7 Removed constructors cleanup

**Status: READY by backend startup synchronization**

The backend creates an immutable snapshot of removed constructor data and removes obsolete constructor versions, objects, runtime access/routes, and constructor definitions during synchronization. Frontend must not keep links to constructors absent from the current constructor catalog.

### 4.8 Studio dashboard cards

**Status: READY functionally, OpenAPI typing is PARTIAL**

Dashboard entity cards provide counts and navigation metadata, including total, active, inactive, incomplete, and list URLs. The card list is still represented as a flexible nested structure in parts of OpenAPI.

## 5. Secure chat, tasks, rating, monitoring, and CEO analytics

### 5.1 Chat reactions and unread/last-message behavior

**Status: BACKEND GAP for reactions**

There is no secure-chat reaction endpoint yet. Current unread and last-message calculations operate on messages; they do not have a separate reaction entity to exclude.

Frontend should not emulate persistent reactions as normal messages. A dedicated reaction model/API/event contract is required.

### 5.2 Task attachment previews

**Status: READY functionally, OpenAPI typing is PARTIAL**

Task details return attachments with fields such as:

- `preview_supported`
- `preview_url`
- `inline_url`
- `download_url`

Frontend can render previews now. The overall task-detail response remains partly flexible in OpenAPI.

### 5.3 Rating policy, factors, and history

**Status: PARTIAL**

Rating V3 uses these default factor weights:

- client reviews — 45%;
- completion — 15%;
- response speed — 10%;
- acceptance — 10%;
- verified experience — 15%;
- verified achievements — 5%.

Substantiated complaints and refund outcomes produce penalties.

Current policy endpoint:

`GET /admin/marketplace/ratings/policy`

Missing:

- a dedicated seller-specific admin rating-detail endpoint such as `/admin/marketplace/sellers/{id}/rating`;
- version-history endpoint for rating policy.

Frontend must not calculate rating independently.

### 5.4 Monitoring

**Status: READY for core monitoring, PARTIAL for administration**

Monitoring includes:

- CPU/load;
- memory;
- disk;
- network/process data;
- request count and RPS;
- error rate;
- latency p50/p95/p99;
- queues;
- users and realtime state;
- database, Redis, OpenAI, LiveKit, OnlyOffice, Telegram, push, Payme, Click, and Atmos integration states;
- history pagination/type filtering;
- background Excel export.

Current limitations:

- some nested responses are still flexible in OpenAPI;
- alert thresholds are currently backend defaults rather than GET/PUT-managed settings;
- there is no dedicated temporary monitoring-access grant endpoint.

Only safe health/status information is returned; secrets must never be displayed.

### 5.5 CEO analytics

**Status: PARTIAL**

`GET /analytics/ceo` supports:

- `date_from`
- `date_to`
- timezone

It returns revenue, users, orders, funnel, channels, trend, growth, and subscription MRR-related values.

Current gaps:

- CEO Excel export is synchronous, not a background job;
- quality overview does not yet consistently accept the same date filters;
- some quality values remain aggregate/default-style and do not provide complete acceptance/contact SLA reporting.

### 5.6 Health and payment testing

**Status: health READY; payment sandbox GAP**

`GET /health` is stable and returns HTTP 200 with:

```json
{
  "status": "ok",
  "time": "ISO-8601 timestamp"
}
```

There is no full internal payment-provider webhook simulator/sandbox contract. Real provider verification remains dependent on provider test/production credentials.

## 6. Confirmed product decisions

1. The old plan-management UI may be removed only after the versioned subscription-plan and feature-registry UI is complete.
2. Achievements use process stage plus full/partial result; no additional achievement-type catalog is required now.
3. Backend returns machine-readable `detail.code`. Frontend must localize known codes and show a safe generic localized message for unknown codes; raw backend codes should not be shown to users.

## 7. Yandex Maps contract

### 7.1 Yandex Maps API version

**Status: READY — use API 2.1**

The backend is currently configured for Yandex Maps API `2.1`, not v3.

Frontend must call:

`GET /marketplace/map/config`

Then use the returned:

- `api_version`
- `maps_loader_url`

Do not hard-code a v3 loader. Current Maps 2.1 provider health is successful. The current Geocoder key returns provider HTTP 403, so geocoder search/reverse must show a safe fallback/error state until a valid key is installed.

### 7.2 Geocoder response

**Status: READY functionally, OpenAPI item typing is PARTIAL**

Normalized geocoder items contain:

```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "formatted_address": "string",
  "latitude": 41.0,
  "longitude": 69.0,
  "precision": "string",
  "kind": "string",
  "country_code": "string",
  "components": {}
}
```

Top-level metadata includes `count`, `found`, `provider`, `cached`, `rate_limit_remaining`, and `coordinate_order=longitude_latitude`.

The item schema is not fully typed in OpenAPI yet.

### 7.3 `service_action`

**Status: READY**

The current compact action shape is:

```json
{
  "id": "service-id",
  "title": "Service title",
  "price": 100000,
  "currency": "UZS",
  "can_purchase": true,
  "purchase_url": "/..."
}
```

Use `id` as the service ID. Do not wait for a duplicate `service_id` field.

### 7.4 Seller avatar on map

**Status: BACKEND GAP**

Map marker/nearby responses do not currently provide a canonical `avatar_url`. Frontend should use a generated initials/avatar fallback until this field is added.

### 7.5 Seller office location

**Status: READY functionally, OpenAPI typing is PARTIAL**

Office location data includes:

- `latitude`
- `longitude`
- `formatted_address`
- `source`
- `public_navigation_enabled`
- `confirmed_at` / `geocoded_at`
- `record_id`

The delete operation is available and should be presented as “Remove office”. After deletion the response reports that office location is no longer configured.

### 7.6 Map error envelope

**Status: READY for map-specific errors**

Map/geocoder validation and provider failures use:

```json
{
  "detail": {
    "code": "machine_readable_code"
  }
}
```

Examples include:

- `geocoder_rate_limit_exceeded`
- `yandex_geocoder_not_configured`
- `yandex_geocoder_key_invalid`
- `yandex_geocoder_unavailable`
- `seller_type_invalid`

General authentication/framework errors outside this map domain may still use a string detail, so the frontend error parser should support both object and string forms.

### 7.7 Realtime seller coordinates

**Status: READY with privacy clarification**

Public map updates may contain an approximate marker, never an unrestricted exact live coordinate. Public precision is approximately 500 metres. Exact live navigation is available only to the authenticated client for the seller assigned to an active paid order.

Frontend may refetch map data after `marketplace.seller_location_updated`; this is the safest behavior. It must never expose exact coordinates from internal/private payloads on the public marketplace map.

## Frontend integration priority

### Integrate now

- contact SLA fields/events;
- 15-minute rating/complaint window;
- 30/30/40 financial stages;
- subscription feature/version APIs;
- promotion backend-calculated totals;
- achievement stage/result model;
- checklist client-evidence privacy;
- task attachment preview fields;
- monitoring/history/export;
- Yandex Maps 2.1 using backend `maps_loader_url`;
- geocoder normalized fields with 403 fallback;
- service action using `service_action.id`;
- office-location remove flow;
- safe map privacy rules.

### Do not emulate on frontend; wait for backend

- manually selected reassignment seller and candidates API;
- escalation-specific chat creation;
- warranty `rework` and warranty KPI;
- explicit idempotency-key support on all payout/complaint operations;
- full consent history;
- developer-task sale activation gate;
- evidence-access audit;
- overlap rejection code;
- generic service-rule audience filter;
- dedicated typed K36 preview;
- secure-chat reactions;
- seller-specific rating-detail/history API;
- configurable monitoring thresholds/access grants;
- async CEO export;
- payment webhook sandbox;
- map `avatar_url`.

### External dependencies

- valid production Payme/Click contracts and credentials;
- verified provider webhooks and reconciliation;
- valid Yandex Geocoder key. The current geocoder provider check returns 403.

## Final backend position

This document distinguishes existing runtime behavior from missing contracts. Frontend may safely integrate all **READY** items. For **PARTIAL** items, use only the explicitly listed fields and keep defensive parsing. For **BACKEND GAP** items, do not add local business logic or fake data; those require a backend change first.
