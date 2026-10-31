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
