# LexGo: backend work still open after the 2026-10-31 answers

Date: 2026-10-31
From: Frontend
Answers to: `LEXGO_FRONTEND_QUESTIONS_ALL_TASKS_2026_10_30.md`, in `LEXGO_BACKEND_ANSWERS_ALL_TASKS_2026_10_31.md`.

Everything marked READY in the answers is now built into the frontend. The list below is what still needs the backend, a provider or a key. The frontend does not imitate any of it. Where a screen needs one of these, it shows an honest "not available yet" state, or leaves the action out.

Please never send test accounts without 2FA or TOTP secrets.

## External blockers

| # | What | Frontend meanwhile |
|---|---|---|
| E1 | **Yandex Geocoder key.** The provider answers 403 (§7.1). | Address search and reverse lookup show "Address search is unavailable right now — pick the point on the map". The map and point picking still work. |
| E2 | **Payme / Click production.** Contracts, credentials, webhooks, reconciliation and refund testing (§1.4, §1.8). | A provider shows as enabled only when `provider_enabled` and readiness are both true. Refunds read as processed manually by an operator. |

## Backend gaps

| # | § | Needed |
|---|---|---|
| G1 | 1.1 | A candidates endpoint with ranking, and an optional `seller_user_id` on `assignment-escalations/{id}/resolve`. Until then, "Reassign" lets the backend choose. |
| G2 | 1.2 | An escalation-specific chat room (operator + client/seller) and a call in it. |
| G3 | 1.5 | A `rework` warranty resolution, `warranty_eligible_kinds` on the order, and a warranty KPI endpoint. |
| G4 | 1.7 | `Idempotency-Key` on payout mark-paid, payout-recovery resolve and complaint resolve; typed settlement. |
| G5 | 2.2 | An admin consent-history endpoint for subscriptions. |
| G6 | 2.3 | An activation gate, so a K17 plan version isn't sold before its developer task is accepted. |
| G7 | 2.4 | A persisted `is_test` on advertisement accounts and purchases. |
| G8 | 3.1 | A nested `reviewer: {id, name}` on experience review history. Only `reviewed_by_user_id` comes today, and the UI never shows an id. |
| G9 | 3.4 | A typed evidence-access audit trail (view / download / upload / delete). |
| G10 | 3.5 | `experience_dates_overlap` within one workplace, if that rule is wanted. The frontend does not check overlaps. |
| G11 | 4.4 | An `audience` filter and field on `GET /marketplace/service-rules`. |
| G12 | 4.5 | A nested `published_by: {id, name}` on document global settings. Only `published_by_user_id` comes today. |
| G13 | 4.6 | A typed K36 coefficient preview. |
| G14 | 5.1 | A secure-chat reaction model, API and event. |
| G15 | 5.3 | `/admin/marketplace/sellers/{id}/rating` and a rating-policy version history. |
| G16 | 5.4 | GET/PUT monitoring thresholds, and temporary monitoring-access grants. |
| G17 | 5.5 | A background CEO export job; date filters on `/quality/overview`; complete acceptance / contact-SLA quality values. |
| G18 | 5.6 | A payment-provider webhook sandbox. |
| G19 | 7.4 | A public `avatar_url` on map markers and nearby results. Cards show initials until then. |

## Questions found while integrating

| # | § | Question |
|---|---|---|
| Q1 | 1.10 | Under which key does the financials snapshot carry the planned stages? The frontend reads `payout_plan`, `payout_stages`, `planned_stages` or `stages`. Please confirm and type it. |
| Q2 | 1.5 | Do the client's runtime capabilities expose `warranty.available_resolutions`? The client form reads it when present; otherwise it uses the replacement/refund on-off flags. |
| Q3 | 1.6 | The public profile's "how the price is formed" lists the service's runtime pricing factors (`config.pricing.factors`) with their percent or fixed amount. Are those factors client-public? If not, please leave them out of the public runtime response, and the frontend will stop listing them. |
| Q4 | 3.3 | The exact names of the experience category/subcategory validation codes, and optionally `GET /marketplace/me/experience/config` (the 20 MB limit and file types are hard-coded from the answer). |
| Q5 | 4.1 | Does `rule_title_exists` come with HTTP 409 or 422? Both are handled. |
| Q6 | 7.5 | Which values can the office `source` take? The frontend puts the ones it recognizes into words and hides any it doesn't. |
| Q7 | 7.3 | What is `service_action.purchase_url`: a page or an API path? The frontend keeps it but buys through the profile's own purchase dialog. |
| Q9 | 2.1 | There is no PATCH/DELETE on `/admin/subscription-features`, so `/admin/tariffs` can only add features. Should editing and retiring a feature be possible? |
| Q10 | 2.1 | The backend still returns 5 legacy seeded plans as active, and the frontend hides them by slug. Please retire them (inactive or hidden). |
| Q11 | 2.5 | Does the plan quote include the verified-seller 50% discount? The frontend no longer applies it locally, but the gift banner still advertises it. |
| Q12 | 5.6 | `/payments/{id}/demo-confirm` is gone from OpenAPI, but a build configured with a demo provider still calls it. Is it retired? |
| Q8 | 7.1 | `maps_loader_url` is always `lang=uz_UZ`, so ru/en users see Uzbek map labels. Could the config take the locale (or return a loader per locale)? |

## OpenAPI typing still flexible (PARTIAL)

Contact SLA fields (§1.3), settlement (§1.7), `client_price_reasons` (§3.9), client checklist items (§4.3), Studio dashboard cards (§4.8), task attachments (§5.2), monitoring nested objects (§5.4), geocoder items (§7.2) and the office object (§7.5). The frontend reads them defensively, using only the fields named in the answers.

## Legal documents in uz / ru / en: resolved (backend eecebb9, `LEXGO_LEGAL_DOCUMENT_LANGUAGES_FRONTEND_FINAL_2026_11_01.md`)

The four findings from 2026-11-01 (backend e0e60ee) are answered by the final contract, and the frontend follows it:

| # | Finding | Status | What the frontend does now |
|---|---|---|---|
| L1 | The English Privacy Policy body was one line (47 characters) | Resolved: full English text (13,070 characters) | Shown as returned (`lang="en"`, no note) |
| L2 | Missing translations came back as Uzbek copies labelled `language: "en"` | Resolved: honest fallback (`language: "uz"`, `requested_language`, `translation_fallback: true`, only real keys in the maps) | Text marked `lang` from `language`; a small localized note "shown in Uzbek because the English/Russian translation is not published yet"; "In Uzbek" tag in the list and the sign-up checklist |
| L3 | The admin endpoints had no language support | Resolved: `GET /admin/legal/consents?lang=`, POST / PATCH with `title_i18n` / `body_i18n`, typed 422s | `/admin/legal`: Uzbek / Russian / English tabs, pair validation, one request, version list with languages, archived versions read-only, omission warning, both 422 codes on the right tab |
| L4 | Footer Terms / Disclaimer opened "not found" | Resolved: `terms` → `user_offer`, `disclaimer` / `legal_disclaimer` → `platform_rules` (`aliases`, `/legal/consents/by-slug/{slug}`) | `/legal/terms` and `/legal/disclaimer` open the canonical documents (via the list's `aliases`, else by-slug) |

Content still to come from the backend/legal team (no frontend work needed; it appears automatically when published): reviewed English translations of the 10 documents other than the Privacy Policy, and the Russian remote-assistance consent.

**Still open for the backend (Studio K07, 2026-11-01).**
- K1: The Studio K07 legal-document editor now has Uzbek / Russian / English tabs and sends `title_i18n.en` / `body_i18n.en` (with `uz_latn` or `uz_cyrl` and `ru`) in one submit. The K07 constructor schema we could see lists only `uz_latn`, `uz_cyrl` and `ru` under `title_i18n` / `body_i18n`. Please add `en` to the K07 schema and publish it into the legal document. Until then, Studio may drop the English text; `/admin/legal` saves it through `POST`/`PATCH /admin/legal/consents`.
- K2: Please confirm that Studio validate, submit and publish return `legal_uz_translation_required` / `legal_translation_pair_required` in the contract's `detail` shape. The editor handles that shape and an `errors` list.
