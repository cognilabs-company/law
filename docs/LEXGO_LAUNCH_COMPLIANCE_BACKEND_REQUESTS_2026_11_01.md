# LexGo launch compliance: what the backend needs to do

Date: 2026-11-01
From: Frontend
Audit: `docs/LEXGO_LAUNCH_COMPLIANCE_AUDIT_2026_11_01.md` (35-item checklist from the owner's "before you launch an app" video)

The frontend has built everything it can on its own (see the audit). The items below need the backend or the legal team. Until they are delivered, the frontend shows an honest "not available yet" state or leaves the thing out. It never fakes data.

| # | Checklist item | What we need, in plain English | What the frontend already does |
|---|---|---|---|
| R1 | 35 Business contact details | Give us the real company details: legal name, address, email, phone and INN. Either add a public endpoint (e.g. `GET /public/company-details`) or fill the blanks in the legal texts. The Privacy Policy and the User Offer still have blanks: ООО «____», INN ____, address ____, the data protection officer's name and contacts, the state register number and phone "+998 (__) ___-__-__". Also confirm whether the hotline "+998 78 777 00 00" (hard-coded from the original design) is real. | Shows no company details it can't prove. The footer links every legal document. |
| R2 | 12 Data access (export) | Add `GET /users/me/export` (or an export job), which gives the user a downloadable copy of all their data. | "Download my data" is in the profile's Security tab, disabled with a "not available yet" note and a link to support. |
| R3 | 12 Account deletion | Add `POST /users/me/deletion-request` with a status the user can see (and a cancel option during any grace period). Today deletion works only through the email process on the `account-deletion` legal page. | "Delete my account" in the profile opens the real `/legal/account-deletion` page. |
| R4 | 24 Separate marketing consent | Add an optional `marketing_consent` boolean (default false) to `/auth/register/start`. Store it with a timestamp, return it from `/auth/me`, and document a `marketing` key in `/notifications/preferences` that marketing sends actually respect. The profile already has a "marketing" switch that writes an undocumented key; confirm the backend honours it. | No marketing checkbox at sign-up (it would be fake without a field). The privacy and terms checkboxes are separate and unticked. |
| R5 | 4 Unsubscribe | Put a one-click unsubscribe link in every marketing email, and an opt-out in every marketing SMS or Telegram message. Both should write to the same notification preference. | Users can turn marketing off in the profile's notifications tab. |
| R6 | 5 Data retention | Confirm that automatic deletion or anonymisation jobs really enforce the periods in the Privacy Policy §8 table. | Referral and UTM tags in the browser expire after 90 days and are deleted when marketing consent is withdrawn. |
| R7 | 27 No AI training on user data | Add to the Privacy Policy (uz/ru/en) that user data and documents are not used to train AI models. Confirm that the AI provider contracts forbid training on LexGo data. | Every AI answer is labelled "AI-generated · not legal advice". |
| R8 | 30 Data processing agreements | Confirm that a DPA is actually signed with every processor (SMS, payments, biometrics, IP telephony, AI model providers, Yandex), as Privacy §6.3 says. | — |
| R9 | 32 Sub-processors list | Publish a named list of sub-processors (provider, purpose, country, data shared), for example as a legal document with its own slug. | The footer will link it as soon as it exists. |
| R10 | 26 Copyright takedown | Add a copyright notice-and-takedown section with a contact address to a legal document (`platform_rules` §9 covers only general violation reports). | No takedown link until the process exists. |
| R11 | 21 Parental consent | Sign-up already needs the 18+ confirmation (`age_18` document). Say what happens to family members under 18 added via `/clients/me/family-members`, and whether parental consent is needed for their data. | No age or birth date is collected; the 18+ box is required. |
| R12 | 3 / 31 Cookie consent log | The Cookie policy §4.5 says every cookie choice is logged on the server, but there is no endpoint. Add one, e.g. `POST /legal/cookie-consents` with categories, policy version and time. Also move the theme and interface settings the visitor picks by hand from "functional, needs consent" (§2.2) to "strictly necessary". | The banner stores the choice (versioned, dated, asked again after 12 months) in the browser only. |
| R13 | 16 Refund policy in English | The `payment_refund_warranty` document has no English text yet. | English readers see the Uzbek text with the "shown in Uzbek" note. |
| R14 | 33 Uptime | No uptime promise appears in the UI. If the business wants one, it must come with a real, measured SLA from the backend team. | "24/7" wording is left for the owner to confirm. |

Owner / product decisions (not backend code):
- Confirm the "24/7" service claims are true, or we reword them.
- Confirm the GSAP "standard no-charge" licence fits (LexGo must not be a paid product that competes with Webflow).
- Confirm the commercial terms of the AI tools used for the images in `public/img` and the Tripo AI plan for the 3D robot models (free-plan output is CC BY 4.0, which we already credit).
