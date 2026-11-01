# LexGo launch compliance audit

Date: 2026-11-01
Source: the owner's "before you launch an app" video checklist (Instagram reel DfKH360zRG4, 35 items). Not legal advice.
Backend requests: `LEXGO_LAUNCH_COMPLIANCE_BACKEND_REQUESTS_2026_11_01.md` (R1–R14), also summarised in `LEXGO_FRONTEND_QUESTIONS_OPEN_2026_10_31.md`.

Status words: **DONE before** (already in the code), **BUILT NOW** (built in this task), **BACKEND NEEDED** (the frontend can't do it alone; never faked), **NOT APPLICABLE** (with the reason).

## The 35 items

| # | Item | Status | Where / what |
|---|---|---|---|
| 1 | Privacy policy | DONE before + BACKEND NEEDED (R1) | Backend `privacy` document in uz/ru/en, `app/[locale]/legal/[slug]/page.tsx`, linked in `components/Footer.tsx`. The text still has blank company details. |
| 2 | Terms of service | DONE before + BACKEND NEEDED (R1) | `user_offer` document (alias `terms`), linked in the footer. Same blanks. |
| 3 | Cookie banner | BUILT NOW | `components/legal/CookieConsent.tsx` (mounted in `app/[locale]/layout.tsx`), `lib/consent.ts`, `lib/useConsent.ts`: Reject all / Accept all / Settings, with necessary, functional, analytics and marketing categories. The choice is versioned, dated, asked again after 12 months, shared across tabs, and reopened from the footer's "Cookie settings". Server log: R12. |
| 4 | Unsubscribe in marketing emails | DONE before (in app) + BACKEND NEEDED (R5) | Marketing switch in `components/portal/NotificationPrefsCard.tsx`. Emails and SMS are sent by the backend. |
| 5 | Data retention limits | DONE before (text) + BACKEND NEEDED (R6) | Privacy §8 table. Browser referral/UTM tags expire after 90 days (`lib/referral.ts`, `lib/attribution.ts`). |
| 6 | Colour contrast | BUILT NOW | Colour variables in `app/globals.css` meet WCAG AA 4.5:1 in light and dark. axe: 0 serious/critical on every checked page (`tests/e2e/a11y.spec.ts`, 53 tests). |
| 7 | No fake countdown timers | NOT APPLICABLE (checked) | Every countdown is real: OTP resend, or a backend deadline (seller acceptance, complaint and rating windows, contact SLA). |
| 8 | Alt text | BUILT NOW | Every image checked; decorative images use `alt=""`. The admin proof image got alt text and a translated label (`components/admin/RegisterRequestDetail.tsx`). `tests/unit/licenses.test.ts` fails on any image without alt. |
| 9 | Keyboard navigation | DONE before + BUILT NOW | Shared `--focus` ring colour; Select/TimePicker/MonthPicker/DatePicker announce their value; `lib/useDialogFocus.ts` moves focus into the image viewer and chat file preview, traps it and returns it on close (the AI chat dock gets focus handling without a trap, as it isn't modal); the shared Modal and the cookie settings dialog trap focus and close on Esc. `tests/e2e/keyboard.spec.ts`. |
| 10 | No customer logos without permission | NOT APPLICABLE | No customer or partner logos exist in `public/` or any component. |
| 11 | Image / font / code licences | BUILT NOW | See "Licences" below; `scripts/gen-licenses.mjs` → `lib/licenses/notices.json`. |
| 12 | Data access + deletion requests | BUILT NOW + BACKEND NEEDED (R2, R3) | `components/portal/AccountDataCard.tsx` in the client and seller profile Security tab and the desktop Profile app: "Download my data" (not available yet, support link), "Delete my account" (opens the real `/legal/account-deletion` page). |
| 13 | No dark patterns | BUILT NOW | The three cookie buttons look the same; nothing optional is pre-ticked; Esc saves nothing. Auto-renew is unticked and opt-in; cancelling is one button plus one confirmation; no package is highlighted by position. |
| 14 | Label AI-generated content | BUILT NOW | `components/ui/AiLabel.tsx` ("AI-generated · Not legal advice — check with a lawyer", uz/ru/en) on LexAI chat, copilot answers and drafts, support-chat AI messages, both AI assistants, the platform assistant, AI-drafted documents, document analysis, intake and case AI tools. |
| 15 | Checkbox to accept privacy + terms | DONE before + BUILT NOW | `components/legal/ConsentChecklist.tsx`: one unticked box per live document; "Get code" is blocked until all are ticked. The `age_18` document now reads "I confirm I am 18 or older…". |
| 16 | Refund policy | BUILT NOW + BACKEND NEEDED (R13) | Footer link and checkout review both open `/legal/payment-refund-warranty`. No English text yet. |
| 17 | Subscriptions easy to cancel | BUILT NOW | `components/portal/MyPlanCard.tsx`: a renewal row and one "Cancel subscription" button → app dialog → `PATCH /subscriptions/{id}/auto-renew {auto_renew:false}`. The paid period stays. |
| 18 | No unnecessary data collection | DONE (reviewed, nothing removed) | See "Data collected" below. Every field is used by the backend. |
| 19 | No fake reviews | BUILT NOW | Hard-coded testimonials removed (`SocialProofSection` deleted, quotes cut from `SubscriptionExtras`); fake "live activity" ticker deleted (`Ticker.tsx`). |
| 20 | No unsupported claims | BUILT NOW | Removed or reworded: home counters (`Stats.tsx` deleted), "1,240+ / 14 regions", lawyer-page figures (1,240+, 63,000+, 4.8), sign-in stats, "join thousands", "trusted by clients", "AI trained on Uzbek law", "Most chosen". "Best value" marks only the package that is really cheapest per day (`lib/planCheckout.ts`). Kept because true: "200+ templates" (989 exist), "first 5 AI requests free". "24/7" left for the owner to confirm. |
| 21 | Parental consent | DONE before + BACKEND NEEDED (R11) | No age or birth date is collected; the 18+ confirmation is required. Family members under 18 need a backend rule. |
| 22 | Record acceptance of terms | DONE before | `lib/consents.ts` keeps document id, slug, version and time, then posts `POST /legal/consents/{id}/accept`. The backend logs time and IP (`/admin/legal/user-consents`). |
| 23 | Open-source licence obligations | BUILT NOW | `app/[locale]/legal/licenses/page.tsx` (uz/ru/en): packages by licence with copyright lines and full texts, fonts with the OFL 1.1 text, artwork origins. Linked from `/legal` and the footer. |
| 24 | Separate marketing consent | BACKEND NEEDED (R4) | No sign-up field exists, so no fake checkbox was added. |
| 25 | No false SOC2 / certification claims | NOT APPLICABLE (checked) | No SOC2, ISO or "certified" claim anywhere; `tests/unit/launchCompliance.test.ts` guards against them. |
| 26 | Copyright notice-and-takedown | BACKEND NEEDED (R10) | No takedown process exists to link. |
| 27 | No AI training on user data | BACKEND NEEDED (R7) | The Privacy Policy covers masking before foreign AI models, not training. |
| 28 | Disclose auto-renewal | BUILT NOW | `components/portal/PlanPurchaseTerms.tsx`: before any payment, a review shows the tariff, period, amount due now and an unticked "Renew automatically" box with price and period, and with a promotion what later periods cost. Used by `PlansPanel.tsx`, `desk/apps/SubscriptionApp.tsx` and `AiPlanUpgradeGate.tsx`. Before, buying sent `auto_renew: true` silently. |
| 29 | Audit third-party SDKs / analytics | BUILT NOW | See "Third-party scripts" below. No analytics, pixel or error-tracking script exists. |
| 30 | Data processing agreements | BACKEND NEEDED (R8) | Contracts are outside the frontend. |
| 31 | Block trackers until consent | BUILT NOW | Yandex Maps (`components/marketplace/map/ymaps.ts`, `MapConsentGate.tsx`) waits for "Functional" consent and is unloaded when it is withdrawn. Referral/UTM tags and promotion memory wait for "Marketing" and are deleted when it is turned off. `tests/e2e/cookie-consent.spec.ts` proves the Yandex script is not requested before consent. |
| 32 | Sub-processors list | BACKEND NEEDED (R9) | Privacy §6.2 lists only categories. |
| 33 | Realistic uptime commitments | NOT APPLICABLE (frontend) | No uptime percentage or SLA promise in the UI (R14). |
| 34 | No hidden fees | BUILT NOW | The purchase review states the full amount and that LexGo adds nothing on top; the wrong "Payments via ATMOS" text was reworded. |
| 35 | Business contact details | BACKEND NEEDED (R1) | No endpoint gives them and the legal texts are blank, so none are shown. The hotline number is hard-coded from the design (`Footer.tsx`, `lib/contact.ts`, `components/support/contact.ts`) and needs confirmation. |

## Third-party scripts and how each is handled

| Script / SDK | Category | Handling |
|---|---|---|
| Yandex Maps JS API 2.1 (`api-maps.yandex.ru`, sets Yandex cookies) | Functional (off by default) | Loads only after consent; a card in the map's place offers "Allow and show the map", "Cookie settings", "Show the list instead". |
| Fonts Inter, Onest, Poppins (`next/font`) | Necessary | Bundled and served from our own server; no request to Google. |
| LiveKit | Necessary | Connects only to the backend's call server, only when the user joins a call. |
| OnlyOffice | Necessary | Loads from the backend's document server, only when an editor is opened. |
| MediaPipe (call backgrounds) | Necessary | Self-hosted; CDN fallback only if that fails and only after the user picks an effect; no cookies. |
| three / react-three / gsap | Necessary | Bundled; local models. |
| First-party referral code, UTM tags, promotion memory | Marketing | Wait for consent; deleted when marketing is turned off. |
| Session, language, theme, layout, drafts, device ids | Necessary | Kept; needed for the service the visitor asked for. |

## Data collected (item 18)

- Client sign-up: first, last and optional middle name, region, phone, password. All sent in `RegisterRequest`.
- Lawyer/advocate sign-up: licence number, specialisation, practice areas, regions, languages, hourly price. All feed the lawyer profile.
- Profile: optional email.
- Family members: name, phone, relation. This is third-party data; the Privacy Policy should mention it (R11).
- Saved cards: brand, last 4 digits, expiry, kept as profile records. These should go once ATMOS card binding replaces the manual form.

## Licences (item 11)

| Item | Licence | Finding |
|---|---|---|
| 141 production npm packages | MIT 100, Apache-2.0 22, ISC 7, BSD-3 4, 0BSD, mixed | Fine; attribution on `/legal/licenses`. |
| @img/sharp-libvips (inside sharp, used by next/image) | LGPL-3.0-or-later | Copyleft, but server-only and never shipped to browsers; no duty today. |
| jszip | MIT OR GPL-3.0 | Used under MIT. |
| gsap | GSAP "Standard no-charge" licence (not open source) | Allowed for LexGo; owner to confirm it isn't a paid product competing with Webflow. |
| caniuse-lite | CC-BY-4.0 | Build-time data; credited. |
| pako | MIT AND Zlib | Fine. |
| webgl-constants | No licence field; file is MIT | Treated as MIT. |
| @bufbuild/protobuf | Apache-2.0 AND BSD-3 | No licence file in the package; the page links its terms. |
| Inter, Onest, Poppins | SIL OFL 1.1 | Licence text is on the page. |
| DejaVu Sans (`public/fonts`) | Bitstream Vera | `public/fonts/LICENSE.txt` served beside it. |
| MediaPipe wasm + models | Apache-2.0 | Fine. |
| 21 PNGs in `public/img`, `law-login.jpg` | Unclear: AI-generated (C2PA shows OpenAI/ChatGPT and Google) | Owner to confirm commercial-use terms; the page says some art was made with AI tools. |
| `public/models/lexgo-robot*.glb` | Unclear: Tripo AI, rigged with Mixamo | Owner to confirm the Tripo plan (free plan = CC BY 4.0, already credited). |
| `public/models/cute+robot+3d+model.glb`, `photo_2026-09-29_21-40-25.jpg` | Unknown | Not used by the code; suggest deleting. |
