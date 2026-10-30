# LexGo: what the frontend still needs from the backend (all partial tasks)

Date: 2026-10-30
From: Frontend
Status: open.
Checked against: backend OpenAPI of 2026-10-30 and frontend `main`.

The frontend side of every task below is built and tested. What is left needs the backend: a missing endpoint, field or enum, a server rule, or provider credentials. Each point says what the frontend does meanwhile. The UI never fakes the missing part and never promises it.

Questions already sent are not repeated here. They are referenced as:

- **Q-10-28**: `LEXGO_FRONTEND_QUESTIONS_FOR_BACKEND_2026_10_28.md` (answered or closed, except where noted below)
- **Q-ACH**: `LEXGO_FRONTEND_QUESTIONS_ACHIEVEMENTS_PRACTICE_2026_10_29.md`
- **F-ACH**: `LEXGO_FRONTEND_FOLLOWUP_ACHIEVEMENTS_PRACTICE_2026_10_29.md`
- **Q-CRM**: `LEXGO_FRONTEND_QUESTIONS_CRM_2026_10_29.md`

Please never send test accounts without 2FA or TOTP secrets. We don't need them.

---

## 1. Marketplace money flows

**1.1 The operator picks the new lawyer (TSK-131840, TSK-635882).**
- Missing: `AssignmentEscalationResolvePayload` has only `action, message, reason, target, deadline_minutes`.
- Needed: `seller_user_id` (optional) on `POST /call-center/marketplace/assignment-escalations/{id}/resolve` with `action=reassign`. Plus a list of eligible sellers for that order, for example `GET /call-center/marketplace/assignment-escalations/{id}/candidates` → `[{ seller_user_id, name, rank, rating, region }]`.
- Meanwhile: "Reassign" lets the backend pick the best eligible external specialist. The hint says so. The operator can also offer the client a choice, or write to the client or the previous seller.

**1.2 Operator chat and call per escalation (TSK-635882).**
- Missing: there is no chat or call endpoint for an assignment escalation, like `cancellation-reviews/{id}/chat` has. `POST /call-center/calls` only logs a call.
- Needed: `POST /call-center/marketplace/assignment-escalations/{id}/chat` (a protected room with the seller or the client, `{ target }`) and a call-start in that room, as review rooms have (`call_types`).
- Meanwhile: the operator sends a message to the client or the previous seller (`action=message`, `target`). That is kept in the audit.

**1.3 Contact-SLA data (TSK-635882).**
- Missing: `contact_speed`, the contact deadline, the breach reason and the `marketplace.contact_sla_*` events are in no schema. The frontend sends `contact_speed` on purchase (Q-10-28 did not ask this).
- Needed: on the order and the escalation, `contact_speed`, `contact_deadline_at`, `first_contact_at`; the escalation `reason=contact_sla_breached`; the realtime event name and payload.
- Meanwhile: the queue and the focus screen re-read on any `marketplace.contact_sla_*` event, and the reason reads "The client wasn't contacted in the chosen time". Covered by `escalation.spec` (live event test).

**1.4 Real provider refund (TSK-714433, TSK-783253).**
- Missing: `provider_enabled` is false, so every refund is manual. Provider settlement and the feature flag of TSK-783253 are not done.
- Needed: provider refund through Click/Payme with an idempotency key, and its `status` values on the order (`refund.status`).
- Meanwhile: the client and the operator see "processed manually". Refund is asked once (idempotency key, tested).

**1.5 Warranty: redo and eligible cases (TSK-714974).**
- Missing:
  - `MarketplaceWarrantyResolution` = `replacement | full_refund | rejected` only. No "redo the work" remedy.
  - `warranty_eligible_kinds` is not in the order schema.
  - No warranty KPI or audit endpoint.
- Needed: a `rework` resolution; `warranty_eligible_kinds: string[]` on the client order; `GET /admin/marketplace/warranty/kpis` (counts by kind and remedy, time to resolve).
- Meanwhile: the form offers the cases the order names, or all five when it names none (tested in `warranty.spec`).

**1.6 "Why this price": Superadvokat and commission lines (TSK-728950).**
- Missing: no `superadvokat` or `commission` factor code in the order pricing snapshot. The pricing response is untyped.
- Needed: those two codes in `pricing_snapshot.components` (seller view only for commission), with `explanation` per language.
- Meanwhile: an unknown part reads "Another part", never its code (tested in `order-pricing.spec`).

**1.7 Payout and complaint idempotency (TSK-906326, TSK-344069).**
- Missing: `POST /call-center/marketplace/payouts/{id}/mark-paid`, `/payout-recoveries/{id}/resolve` and `/call-center/marketplace/complaints/{id}/resolve` take no `Idempotency-Key`. Settlement hold and release are not typed.
- Needed: `Idempotency-Key` support on those three; a typed `settlement { status, held_amount, hold_reason, release_after }`.
- Meanwhile: double clicks send one request (same-tick guard), but a lost answer can't be retried safely.

**1.8 Click / Payme production (TSK-664399).** Already asked in Q-10-28 §1. Still missing: merchant contracts, credentials and the webhook paths (none in OpenAPI). The frontend is ready and tested with the provider list and single-payment polling.

**1.9 15-minute window and rating (TSK-661119).** Server rules only: the window is enforced by the server, and the rating counts in the marketplace rating. Nothing to add on our side; please confirm both are live.

---

## 2. Tariffs, ads and promotions

**2.1 K17 has no per-feature limits (TSK-490457 vs TSK-342697).**
- The two tasks disagree. TSK-490457 (23 Oct) wants features picked from a registry with unavailable / limited / unlimited, limit, reset period and sale state. TSK-342697 (27 Oct, newer) removes the per-feature toggles and keeps one list of client-facing benefit lines.
- By the owner's rule the newer task wins. The frontend follows K17 v3 (no feature toggles, benefit lines 1-2-3, audiences instead of a type).
- Missing for the part that still holds ("limits renew every 30 days"): K17 has no limit fields, so the 30-day reset can't be set or shown in Studio.
- Needed: confirm that limits come only from the registry on the plan version (`/admin/subscription-plan-versions/*`), and that they renew every 30 days on the server. If K17 should carry them, add `entitlements[]` (`feature_key`, `mode`, `limit`, `reset_period`) to the K17 schema.
- Meanwhile: the old `/admin/plans` screen (hidden from the menu) still edits the registry with handmade controls.

**2.2 Consent audit and rollback (TSK-206603).**
- Missing: `/subscriptions/{id}/contract` and `/renewal-consent` are untyped. There is no audit endpoint for consents, and no promise that a tariff rollback leaves old snapshots alone.
- Needed: typed responses; `GET /admin/subscriptions/{id}/consents` (who, when, which version, what changed).
- Meanwhile: the subscriber sees the new version's features and price before agreeing (tested in `my-plan.spec`).

**2.3 Developer task and approval (TSK-692647).** Field names asked in Q-10-28 §4.2. Still missing: the real task creation on publish, and "an unapproved tariff never goes on sale" as a server rule. Studio K17 shows every revision's task and approval (tested in `studio-k17.spec`).

**2.4 Ads readiness (TSK-202681).**
- Missing: no `is_test` flag on purchases or accounts; the readiness response is untyped.
- Needed: `is_test` on ad purchases and accounts, excluded from analytics on the server; test or blocked accounts never shown in ads.
- Meanwhile: readiness, activation with a reason and pause work and are tested.

**2.5 Promotions (TSK-537634).** Server rules only: the use limit goes down atomically, and the final price is never negative. Please confirm.

---

## 3. Experience, achievements, Superadvokat

**3.1 Reviewer on past reviews (TSK-100467, TSK-874927).**
- Missing: `ReviewDetailOut.reviews[]` and `/marketplace/me/experience/{id}/history` are untyped. The final contract lists only `decision` and `decision_action`.
- Needed: `reviewer { id, name }`, `reviewed_at` and `checklist[] { key, verdict, note }` on each past review.
- Meanwhile: the frontend reads `reviewer.name / reviewed_by.name / reviewer_name` when present (tested with them present).

**3.2 Mandatory checklist items (TSK-100467, TSK-659111).**
- Missing: `checklist[]` has no `required` flag, so the frontend treats every item as mandatory.
- Needed: `required: boolean` per checklist item.

**3.3 Experience file rules and codes (TSK-920636).**
- Missing: the upload body has only `file`, and the response is untyped. There is no experience config like `AchievementConfigOut.evidence`. The codes `evidence_file_too_large`, `evidence_file_type_not_allowed`, `experience_dates_overlap` appear nowhere.
- Needed: `GET /marketplace/me/experience/config` → `{ evidence: { max_bytes, mime_types, extensions } }`, and these codes documented.
- Meanwhile: the frontend allows PDF/DOC/DOCX/JPEG/PNG/WebP up to 20 MB and reads the three codes in words (tested).

**3.4 Evidence access audit (TSK-712239, TSK-427872).**
- Missing: no audit of who viewed or downloaded evidence, no incident log. `/admin/audit-trail` is untyped.
- Needed: an audit entry per view / download / upload / delete of evidence and marketplace files; `GET /admin/audit-trail` typed, with a filter by object.

**3.5 Date overlap (TSK-712239 AC2).** Please confirm the server checks overlapping positions inside one workplace (parallel workplaces are allowed by TSK-415946). The frontend blocks an end before a start and future dates.

**3.6 Achievement types (TSK-493303).**
- The board task asks for award, certificate, scientific work, mediation and social project types. The owner's rules of 2026-10-30 (F-ACH) narrow achievements to stage results. `AchievementSubmission` has `process_stage` and `result_scope`, no type.
- The frontend follows the owner's newer rules.
- Owner decision needed: keep stage results only, or add `achievement_type` (with `label_i18n`). Lawyer (yurist) access is F-ACH §7.

**3.7 Superadvokat criteria (TSK-460646).**
- Missing: only a free-form `/admin/marketplace/policies/{section}` exists; there is no Superadvokat section or schema.
- Needed: a typed Superadvokat policy (criteria, thresholds, version, who changed it) or a Studio constructor for it.
- Meanwhile: the manual override (primary superadmin only, reason, period, history with before → after) is built and tested. The history shape was asked in Q-10-28 §8.2.

**3.8 Public seller payloads (TSK-260704).**
- Missing: `/marketplace/lawyers` and `/marketplace/lawyers/{id}` are untyped, so we can't confirm the serializer drops licence number, university and private fields.
- Needed: typed public schemas without those fields.
- Meanwhile: the public profile never shows them, even if sent (tested).

**3.9 Client price reasons (TSK-787056).** Asked in Q-10-28 §5.1 and answered (`client_price_reasons`). Still untyped in OpenAPI; please type it. The public profile's "how the price is formed" now explains in words only (no coefficients or percentages).

---

## 4. Studio

**4.1 409 for a duplicate rule name (TSK-602765).**
- Missing: no operation declares a 409. `rule_title_duplicate`, `existing_rule_id` and `existing_title` are not documented.
- Needed: document the 409 body on K31 save: `{ detail: { code: "rule_title_duplicate", existing_rule_id, existing_title } }`.
- Meanwhile: the form reads exactly that and offers the existing rule (unit-tested).

**4.2 Several executor types at runtime (TSK-656862).**
- Missing: `LegalServiceOut` / `LegalServiceCreate` have only `executor_type` (one string).
- Needed: `executor_types: string[]` on the runtime service.
- Meanwhile: Studio saves `executor_types` in the K02 payload.

**4.3 Hidden checklist evidence for the client (TSK-732568).**
- Missing: `ChecklistResponse.items` is untyped. `client_title`, `executor_title`, `show_comment_to_client`, `show_images_to_client`, `show_files_to_client` aren't documented.
- Needed: typed items, and the server must strip hidden comments, images and files from the client's checklist.
- Meanwhile: the client's page hides them too (unit-tested), but only the server can make it safe.

**4.4 Rules by audience (TSK-206001).**
- Missing: `GET /marketplace/service-rules` has no `audience` filter and an untyped response.
- Needed: `?audience=client|performer` and a typed `audience` field.
- Meanwhile: the browser filters by the rule's own audience.

**4.5 Document settings actor and snapshot (TSK-136097).**
- Missing: `/admin/document-service-settings*` responses are untyped; `published_by`, `activated_by` aren't documented; no document-order schema carries the settings version.
- Needed: those fields, and `settings_version` on the document order.

**4.6 Coefficient preview (TSK-331025).**
- Missing: no preview endpoint for K36 coefficients; `POST /studio/constructors/{code}/preview` is untyped.
- Needed: a typed preview: given a service, a region and a seller, the coefficients that apply and the resulting price.

**4.7 Removed constructors (TSK-615032).** The DB delete migration and the backup can't be checked from the frontend. Please confirm they ran.

**4.8 Studio dashboard counts (TSK-195678).** `StudioSummaryResponse.entity_cards` is untyped. Please document `active_count` / `incomplete_count`.

---

## 5. Chat, tasks, rating, monitoring, CEO

**5.1 Chat reactions (TSK-637367).**
- Missing: no reaction endpoint. A reaction is sent as a message with `message_type: "reaction"`, so the server may count it in `unread_count` and `last_message`.
- Needed: `POST/DELETE /secure-chats/{room_id}/messages/{message_id}/reactions`, and reactions left out of `unread_count` / `last_message`.
- Meanwhile: the list never shows a reaction as the last line (tested in `chat-list.spec`).

**5.2 Task attachment previews (TSK-323073).**
- Missing: `preview_url`, `download_url`, `preview_supported` aren't documented; `/task-management/{task_id}` is untyped.
- Needed: document them on each attachment (we use them as signed-in API paths).

**5.3 Rating factors (TSK-332221).**
- Missing: no rating-policy keys for category experience, court and investigation results, SLA breaches, cancellations and no-answers. No decay, no fraud / self-review rules, no policy history. Weights and penalties come only from `/marketplace/me/rating`, not for an admin looking at a seller.
- Needed: those factors in `GET /admin/marketplace/ratings/policy`; `GET /admin/marketplace/sellers/{id}/rating` with weights and penalties; a policy version history.
- Meanwhile: the admin sees the policy, its status and each seller's public breakdown from a review (tested).

**5.4 Monitoring (TSK-670563, TSK-762684).**
- Missing: `/admin/monitoring/overview` and `/integrations/{key}` are untyped. Not documented: `uptime_percent`, process / container state, `requests.rps`, `latency_ms`, `status_4xx`, `status_5xx`, `database`, `redis`, `workers`; SMS / push / email / storage / worker nodes; no promise that no secrets are returned; no endpoint for alert thresholds; no access grants for platform monitoring.
- Needed: typed responses with those fields; `GET/PUT /admin/monitoring/thresholds`; a grant endpoint like live-office's.
- Meanwhile: uptime is shown from `uptime_percent` when sent, otherwise from the loaded snapshots, and the screen says so. Thresholds are kept in the browser. Error codes show as "HTTP 502" or in words; an unknown code is left to the error text (UI rule).

**5.5 CEO KPIs (TSK-328538).**
- Missing: `/analytics/ceo` is untyped. No completion rate or acceptance SLA. Rating, response-on-time and complaints exist only in `/quality/overview`, which has no date filter. Export is synchronous only.
- Needed: those KPIs in `/analytics/ceo` for the chosen period; `date_from` / `date_to` on `/quality/overview`; `POST /analytics/ceo/exports` as a background job, like monitoring history exports.
- Meanwhile: the CEO page shows quality as "all time" and says the period filter doesn't apply (tested).

**5.6 Health and payment testing (TSK-961148).**
- `/health` is typed as a map with no named keys. Please confirm `{ status: "ok" }` is stable; the post-release smoke check relies on it.
- There is no payment sandbox or webhook simulation, so a production smoke test can't run a test transaction without real money. Click/Payme itself is Q-10-28 §1.

---

## 6. Owner decisions (not backend)

- **TSK-490457 vs TSK-342697**: the newer task wins (§2.1). Please confirm the old per-feature limits screen (`/admin/plans`) can be removed (asked in Q-10-28 §4.1).
- **TSK-493303**: achievement types, see §3.6.
- **TSK-670563**: the board asks to show the error code; the UI rule forbids raw codes. The frontend shows HTTP codes and known codes in words, and never an unknown raw code.
