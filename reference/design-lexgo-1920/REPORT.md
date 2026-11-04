# LexGo 1920 redesign — report (2026-11-04)

Task: `TASK.md` in this folder. Design: the six screenshots here (1a, 1b, 1c,
2a, 2b, 2c).

## What changed

### Shell — every client, advocate and lawyer page
`components/portal/PortalShell.tsx`, `components/portal/portalNav.ts`,
`components/portal/shell/*`.

- **Sidebar**: floating dark-navy panel (16 px margin, 24 px radius), white
  logo tile + "LexGo" + role badge, grouped sections with uppercase labels
  (client: Yordam olish / Mening ishlarim / Hisob; advocate & lawyer:
  Buyurtmalar / Ish maydoni / Muloqot / Xizmatlar va o'sish / Hisob — the last
  two collapsible, remembered per device), active item as a blue pill, SOS in
  red, count badges (new orders from `listOpenOrders`, unread secure-chat
  messages from `/secure-chats`), user card with avatar, name, role and the
  collapse button at the bottom. On ≤900 px it is a drawer with a close
  button and a scrim.
- **Header** (scrolls with the page, so nothing hides behind it): date line
  ("Juma, 30-oktabr 2026 · Boshqaruv paneli · 2 ta ish jarayonda") or, on the
  client's inner pages, the breadcrumb; the big title (dashboards greet by
  first name via `useLxHeader`); for sellers the chips row (role, verified,
  rules nudge, location pill); the search pill (jumps to sections, then
  searches specialists for the client or cases — `?q=` — for sellers),
  "Yordam" (the existing support menu), the bell with its red count, the
  language select and the avatar menu (profile, theme, desktop mode, admin,
  log out).
- **Tokens / primitives** (`shell1920.css`): the design palette (`#1668F0`
  blue, `#0A1526` navy, `#F5F9FF` page, `#E4EBF5` lines), cards (white, 24 px
  radius, soft border, no shadow — `.ppanel` and `.lx-card`), buttons
  (primary blue, `btn--dark` navy, outlined white, `btn--link`), filled-blue
  checkboxes, and flat navy/blue/red banners instead of gradients. Old
  tokens (`--b600`, `--grad`, `--rl` …) are re-pointed inside the cabinet, so
  every existing page follows. Dark mode has its own values for all of them.
- Role navigation is respected: rows hidden by `GET /me/navigation` are not
  drawn, the pending-seller lock and the action gates still apply, team
  tasks appear for `tasks.view`. Pages with no sidebar row (notifications,
  packages, referrals, promotion, AI chat…) stay reachable and titled.

### Dashboards
- **Client (1a)** — `components/portal/dash/ClientHome.tsx`: legal areas
  with real Unsplash photos (`public/img/areas/`, credits in `CREDITS.md`)
  and the search bar (→ "Advokat va yuristlar" with `q`/`region`/`area`);
  cases in progress (`/marketplace/me/orders`, 4-step progress, status pill,
  specialist, chat); quick question (→ AI); six priced services (prices from
  `/urgent-advokat/catalog`); two specialists (`/marketplace/lawyers`); the
  gift card with the referral count (`/referrals/me`).
- **Advocate (2a) and lawyer (2b)** — `components/portal/dash/SellerHome.tsx`,
  one component for both roles: KPI row (cabinet stats), "Sizdan kutilmoqda"
  (open orders with answer-deadline bar, client question, accept / decline
  through the existing `OrderActions`), month calendar and deadline tabs
  (`/calendar-events`), Hisob-kitob (cabinet finance + the seller's orders
  table), rating card (`/marketplace/me/rating` + review counts), latest
  notifications, today's tasks (deadlines, unaccepted rules, 2FA, tasks due),
  quick actions, services banner. Advocate shows "Tashkilot", lawyer
  "Hujjat namunalari", as in the design. The advocate-license reminder is
  kept above the KPIs while a license is still needed.

### Pages drawn in the design
- **1b Advokat va yuristlar** — `ClientSpecialists.tsx`: search + area +
  region, area checklist, Barchasi/Advokat/Yurist switch, specialist cards
  with facts, tags, own services and prices; "Konsultatsiya buyurtma qilish"
  opens the existing purchase dialog.
- **1c / 2c Xato va takliflar** — `FeedbackPage.tsx`, new routes
  `/portal/{client,advocate,lawyer}/feedback`: type cards, section select,
  subject, details with counter, screenshot drop zone, notify checkbox, sent
  requests with status, tips card. Sent as support tickets (see gaps).

All new text is in uz/ru/en (`lxShell`, `lxClient`, `lxSeller`, `lxSpec`,
`lxFeedback` namespaces, written with `scripts/lx-i18n.mjs`).

## Screenshots
`shots/` — taken with the mocked backend (`tests/e2e/design1920/data.ts`,
`tests/e2e/design-shell.spec.ts`):
- `shell-<role>-<page>-desktop.jpg` and `-phone.jpg` — every sidebar page of
  the client (15), advocate (20) and lawyer (20) at 1920 and 360 px; the
  dashboards, 1b and 1c/2c full length.
- `adhoc-*` — extra captures: tablet (768) and laptop (1440) dashboards of
  all three roles, dark mode, and the phone drawer.

Checked at 360, 768, 1024, 1440 and 1920 px: no horizontal overflow inside
the page (only the intended horizontal tab rails scroll), drawer on phones.

## Backend gaps
`docs/LEXGO_1920_BACKEND_QUESTIONS.md`: feedback endpoint for these roles and
ticket attachments, specialist photos, consultation format, a legal-area
taxonomy, "from" prices for documents / analysis, rating distribution.

## Other behaviour kept
- "Xizmatlar bo'yicha" and "Yaqin atrofda" (the service browser and the map)
  stay on "Advokat va yuristlar" behind the same mode switch (`?mode=`).
- The seller rating breakdown moved from the dashboard to Profil → Ish
  (`?tab=work#rating`); the dashboard's rating card links to it and reads
  "Hali baholanmagan" for an unrated seller.
- Logout, theme, desktop mode and the admin link live in the avatar menu.
- Header search: `?q=` filters the seller's cases list.

## Checks (2026-11-04)
- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- `npm test` — 52 files, 535 tests passed
- `npx playwright test` — 311 passed, 2 skipped (the env-gated screenshot
  helpers in `tests/e2e/design1920/`), 0 failed. Tests updated for the new
  UI: `role-navigation.spec.ts` (logout via the avatar menu; referrals is no
  longer a sidebar row), `tasks-oct24.spec.ts` (rating breakdown on the
  profile). New: `design-shell.spec.ts` walks every sidebar page of all
  three roles and asserts the shell and no horizontal overflow.
