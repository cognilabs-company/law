# LexGo: backend work still open after the 2026-10-31 and 2026-11-01 answers

Date: 2026-10-31, updated 2026-11-01
From: Frontend
Answers to: `LEXGO_FRONTEND_QUESTIONS_ALL_TASKS_2026_10_30.md`, in `LEXGO_BACKEND_ANSWERS_ALL_TASKS_2026_10_31.md`, and to this file, in `LEXGO_BACKEND_ANSWERS_OPEN_2026_11_01.md`.

Everything marked READY in the answers is built into the frontend. The frontend does not imitate anything partial, missing or blocked. Where a screen needs one of these, it shows an honest "not available yet" state, or leaves the action out.

Please never send test accounts without 2FA or TOTP secrets.

## Still open (short list)

- **N2** `today` contact speed means accepted + 12 hours, not end of day: product/backend should rename the label or change the rule. The UI shows the exact deadline in Tashkent time.
- **N1** Please confirm the order field that carries the first contact's channel (`chat` / `chat_file` / `audio` / `video`). The frontend reads `contact_started_channel` and shows nothing when it is absent.
- **N4** Add `en` to the Studio K07 schema. **N5** Expose the `legal_*` codes the same way in validate, submit and publish.
- **Q2** Type `warranty.available_resolutions` in runtime capabilities. **Q4** `GET /marketplace/me/experience/config` (evidence size and types). **Q8** Map loader locale. **Q10** Product-approved slug list or a retire workflow for the five legacy plans (they now show, as the backend returns them active).
- **Launch compliance R1–R14** (company details, data export, account deletion request, marketing consent, unsubscribe, retention, no AI training statement, DPAs, sub-processors, takedown, parental consent, cookie consent log, English refund rules, uptime): see the section below.
- **Mobile test monitoring M1–M3** (untyped response field names, "already sent" code, iOS): see the section below.
- **G1–G19** as listed below (G1, G4, G15, G16, G17 partial; the rest not delivered). **E1** Yandex Geocoder key, **E2** Payme / Click production. **C1** reviewed English legal texts and the Russian remote-assistance consent. **T1** typing of the nested contracts.

## New questions (N1–N5), answered 2026-11-01

| # | Answer (one line) | What the frontend did |
|---|---|---|
| N1 | Contact = the seller's first chat text (`chat`), file (`chat_file`) or audio/video call in the paid room; phone, accept or start don't count. | `ContactSla` explains it when no contact is recorded ("Work has started, but no message or call to the client is recorded yet" when `started_at` is set) and shows the first contact's channel in words when the backend sends it. Nothing is inferred locally. |
| N2 | UTC timestamps; `today` = accepted + 12 h (acknowledged as misleading). | Every SLA time is shown in Tashkent time with the zone named; the speed row points to the exact deadline. Nothing is recomputed. Label: still open. |
| N3 | Legacy order snapshot items have no `payout_stage`; they fall back to the final 40% group. | Kept; the final stage now says how many items have no payout stage and that they count toward the final payout. |
| N4 | K07 schema has no `en` yet — backend gap. | The English tab in Studio warns that Studio may not keep English while the schema lacks it, and links to Legal documents, where English is published. |
| N5 | validate 200 `ok=false` + field errors; submit 422 `studio_submit_invalid` + `detail.errors[]`; publish 409 `studio_publish_failed`. | `translation_required` lands on the right tab and part in words; nested submit errors land on fields; a publish failure that names fields marks them and the dialog says so; a backend sentence with a code is never shown. |

## Questions found while integrating, answered 2026-11-01

| # | Answer (one line) | What the frontend did |
|---|---|---|
| Q1 | The plan is `snapshot.payment.payout_stages` only; top-level `payout_stages` are actual records. | Reads only that key; the made-up 30/30/40 default and the other key guesses are gone. A snapshot without a plan shows only the created payouts and says the plan is not recorded. |
| Q2 | Capabilities expose only warranty booleans; `available_resolutions` is on claim payloads. | The client form uses the replacement / full-refund flags; the call center uses the claim's list. The capabilities list is no longer read. |
| Q3 | `pricing.factors` stays in the public runtime configuration. | No change: the profile keeps listing them. |
| Q4 | Exact codes listed; 413 / 415 for evidence; no config endpoint yet. | Every code has its own words in uz/ru/en; a 413 / 415 without a code reads as file too large / type not allowed. Limits stay as answered until a config endpoint exists. |
| Q5 | `rule_title_exists` comes inside validate 200 `ok=false` and submit 422 `detail.errors[]`, never 409. | Read in both shapes (name field + "open the existing rule" note); the 409 reading is removed. |
| Q6 | Updates accept `foreground` / `background` / `manual` / `office`; map display uses `live` / `office` / `profile_region`. | Typed accordingly; the browser sends `foreground`; display words only for the three display sources. |
| Q7 | `purchase_url` is an API path (`POST …/purchase-request`). | No change: it is never used as a link; buying goes through the purchase dialog, which posts. |
| Q8 | Map loader fixed to `lang=uz_UZ`. | No change; still open. |
| Q9 | No PATCH/DELETE for subscription features; not planned. | No change: `/admin/tariffs` only lists and adds; no edit/delete buttons. |
| Q10 | 11 active plans; no safe rule or retire endpoint for the five legacy ones. | The frontend's own slug list that hid them is removed; plans show exactly as the backend marks them active. Retiring: still open. |
| Q11 | No verified-seller 50% discount in the quote. | The hard-coded 50% and every "50% off for lawyers" claim (AI nudge, AI page, chat answer) are removed. |
| Q12 | Demo confirmation is retired for production frontend flows. | `/payments/{id}/demo-confirm` is no longer called anywhere; milestone payments go through the provider. |

## External blockers

| # | What | Backend 2026-11-01 | Frontend meanwhile |
|---|---|---|---|
| E1 | **Yandex Geocoder key** (provider 403, §7.1). | Still blocked, no date. | Address search says it is unavailable; points are picked on the map. |
| E2 | **Payme / Click production** (§1.4, §1.8). | Still blocked, no date. | A provider shows as enabled only when `provider_enabled` and readiness are both true. Refunds read as processed manually. |
| C1 | Reviewed English legal texts (10 documents) and the Russian remote-assistance consent. | Content blocked. | Nothing to do; they appear when published (Uzbek fallback is labelled). |

## Backend gaps

| # | § | Needed | Backend 2026-11-01 | Frontend |
|---|---|---|---|---|
| G1 | 1.1 | Ranked candidates and an optional `seller_user_id` on escalation resolve. | Partial: `GET /matching/candidates` exists; resolve has no `seller_user_id`. | "Reassign" lets the backend choose; no seller pick on escalations. |
| G2 | 1.2 | An escalation chat room and call. | Not delivered. | No escalation chat/call button. |
| G3 | 1.5 | `rework`, `warranty_eligible_kinds`, warranty KPI. | Not delivered. | Only replacement / full refund / rejected; no KPI. |
| G4 | 1.7 | `Idempotency-Key` on payout mark-paid, recovery, complaint resolve; typed settlement. | Partial. | Header sent where supported; the rest guarded against double clicks; settlement only read. |
| G5 | 2.2 | Admin consent history. | Not delivered. | Only the latest consent is shown. |
| G6 | 2.3 | K17 activation gate on the developer task. | Not delivered. | The task is shown; publishing does not pretend to wait. |
| G7 | 2.4 | Persisted `is_test` on ad accounts and purchases. | Not delivered. | No test marks on ads; Studio test marks now come only from a backend `is_test` (the frontend's name guess is removed). |
| G8 | 3.1 | Nested `reviewer: {id, name}`. | Not delivered. | Name when sent, else the word "reviewer"; never an id. |
| G9 | 3.4 | Evidence-access audit trail. | Not delivered. | No audit UI. |
| G10 | 3.5 | `experience_dates_overlap`. | Not delivered. | No local overlap check. |
| G11 | 4.4 | `audience` filter and field on service rules. | Not delivered. | No audience filter is sent. |
| G12 | 4.5 | Nested `published_by: {id, name}`. | Not delivered. | Name when sent; never an id. |
| G13 | 4.6 | Typed K36 coefficient preview. | Not delivered. | Generic preview only; no local coefficient math. |
| G14 | 5.1 | Secure-chat reactions. | Not delivered. | The chat offers none. |
| G15 | 5.3 | Seller rating detail and policy history. | Partial. | Only recalculation, status and active policy are shown. |
| G16 | 5.4 | Monitoring thresholds GET/PUT and grants. | Partial. | Read-only, fixed backend thresholds. |
| G17 | 5.5 | Background CEO export; date filters and full values on `/quality/overview`. | Partial. | Export is synchronous with a busy state; the admin dashboard no longer sends period/region filters to `/quality/overview` and says the quality figures cover the whole platform. |
| G18 | 5.6 | Payment webhook sandbox. | Not delivered. | Nothing built. |
| G19 | 7.4 | `avatar_url` on map markers and nearby results. | Not delivered. | Initials. |

## OpenAPI typing still flexible (T1, PARTIAL)

Contact SLA fields (§1.3), settlement (§1.7), `client_price_reasons` (§3.9), client checklist items (§4.3), Studio dashboard cards (§4.8), task attachments (§5.2), monitoring nested objects (§5.4), geocoder items (§7.2) and the office object (§7.5). Backend 2026-11-01: still partial. The frontend reads them defensively, using only the fields named in the answers.

## Legal documents in uz / ru / en: resolved (backend eecebb9, `LEXGO_LEGAL_DOCUMENT_LANGUAGES_FRONTEND_FINAL_2026_11_01.md`)

The four findings from 2026-11-01 (backend e0e60ee) are answered by the final contract, and the frontend follows it:

| # | Finding | Status | What the frontend does now |
|---|---|---|---|
| L1 | The English Privacy Policy body was one line (47 characters) | Resolved: full English text (13,070 characters) | Shown as returned (`lang="en"`, no note) |
| L2 | Missing translations came back as Uzbek copies labelled `language: "en"` | Resolved: honest fallback (`language: "uz"`, `requested_language`, `translation_fallback: true`, only real keys in the maps) | Text marked `lang` from `language`; a small localized note "shown in Uzbek because the English/Russian translation is not published yet"; "In Uzbek" tag in the list and the sign-up checklist |
| L3 | The admin endpoints had no language support | Resolved: `GET /admin/legal/consents?lang=`, POST / PATCH with `title_i18n` / `body_i18n`, typed 422s | `/admin/legal`: Uzbek / Russian / English tabs, pair validation, one request, version list with languages, archived versions read-only, omission warning, both 422 codes on the right tab |
| L4 | Footer Terms / Disclaimer opened "not found" | Resolved: `terms` → `user_offer`, `disclaimer` / `legal_disclaimer` → `platform_rules` (`aliases`, `/legal/consents/by-slug/{slug}`) | `/legal/terms` and `/legal/disclaimer` open the canonical documents (via the list's `aliases`, else by-slug) |

Content still to come from the backend/legal team (no frontend work needed; it appears automatically when published): reviewed English translations of the 10 documents other than the Privacy Policy, and the Russian remote-assistance consent.

**Studio K07 (answered 2026-11-01 as N4 / N5, see above).**
- K1 = N4: gap confirmed — the K07 schema still lists only `uz_latn`, `uz_cyrl`, `ru`. Still open for the backend: add `en` to the K07 `title_i18n` / `body_i18n` schema and publish it into the legal document.
- K2 = N5: answered — validate is 200 `ok=false` with field errors, submit is 422 `studio_submit_invalid` with `detail.errors[]`, publish is 409 `studio_publish_failed`; the `legal_*` codes are not yet consistent across the three. Still open for the backend: expose `legal_uz_translation_required` / `legal_translation_pair_required` the same way in all three operations.

## Launch compliance 2026-11-01

Full audit: `LEXGO_LAUNCH_COMPLIANCE_AUDIT_2026_11_01.md`. Standalone handoff: `LEXGO_LAUNCH_COMPLIANCE_BACKEND_REQUESTS_2026_11_01.md` (R1–R14). Short version:

| # | Need from the backend | Frontend already did |
|---|---|---|
| R1 | Real company details (legal name, address, email, phone, INN) via an endpoint or filled legal texts; confirm the hotline +998 78 777 00 00 | Shows nothing it can't prove; footer links every legal document |
| R2 | `GET /users/me/export` — download my data | "Download my data" shown as not available yet, with a support link |
| R3 | `POST /users/me/deletion-request` with status | "Delete my account" opens the real account-deletion page |
| R4 | Optional `marketing_consent` at sign-up, stored with time, in `/auth/me`; documented `marketing` key in `/notifications/preferences` | No fake marketing checkbox; privacy/terms boxes separate and unticked |
| R5 | One-click unsubscribe in marketing emails/SMS | Marketing switch in profile notifications |
| R6 | Confirm retention jobs enforce Privacy §8 | Browser referral/UTM tags expire after 90 days |
| R7 | "No AI training on user data" in the Privacy Policy + provider contracts | Every AI output labelled "AI-generated · not legal advice" |
| R8 | Confirm DPAs with every processor | — |
| R9 | Published sub-processors list | Footer will link it |
| R10 | Copyright notice-and-takedown process + contact | — |
| R11 | Parental consent rule for family members under 18 | 18+ confirmation required at sign-up |
| R12 | Server log of cookie choices (`POST /legal/cookie-consents`); theme settings as strictly necessary | Banner stores a versioned, dated choice in the browser |
| R13 | English text of the refund/warranty rules | Uzbek fallback with a note |
| R14 | Uptime commitment only with a real SLA | No uptime claim in the UI |

## Mobile test monitoring 2026-11-01 (contract `LEXGO_SUPERADMIN_MOBILE_TEST_MONITORING_FRONTEND_2026_11_01.md`)

The section is built and tested with mocked responses only (no primary-superadmin login was available; no release was created or closed and no Telegram report was sent). Please confirm:

- **M1** The detail, releases, reports and send responses are untyped in OpenAPI. The frontend reads: detail `date_from` / `date_to`; session `started_at`, `ended_at`, `last_heartbeat_at`, `foreground_seconds`; report `first_telegram_message_id`, `attempt_count`; send response `{report}`. Please type them or confirm the names.
- **M2** The error code returned when a report was already sent and `force=false`. The frontend treats any 409 or `*already_sent*` code as "already sent".
- **M3** Only Android is in the contract, so the release form offers only Android. Say if iOS is coming.

## Smaller findings 2026-11-01

- The client packages list still hides packages whose code or title contains "test" (a name guess, like G7). Please send a persisted `is_test` flag for packages so the guess can go.
- Checkout uses the payment provider set at build time, not the backend's list of enabled providers. Please confirm `GET` of enabled providers is the source of truth for checkout so the frontend can switch to it.
