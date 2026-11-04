# Task: LexGo 1920 redesign — dashboards 1:1, every other page in the same shell (2026-11-04)

Owner's words (Uzbek): "Lex dagi boshqaruv paneli 2ta role client va advokat/yurist uchun bir xil bo'lishi lozim! Bir xil bo'lmaguncha ishni to'xtatmasin va ishni chala qilmasin! Barcha device'larda yaxshi ko'rinishi lozim! Qolgan page'larda dizayn o'zgarmadi va figmadan copy olinmadi! Qolgan page'larda rangi bilan header, sidebar, button'lar figmadagidek qilinishi lozim! Ishni oxirgacha tugatmaguncha to'xtamasin, hamma joyini to'g'ri o'zgartirganiga ishonch hosil qilib keyin push qilsin!"

## Design source (read the images first)
Claude Design file "LexGo 1920.dc.html", full-page screenshots in this folder:
- `1a_mijoz_boshqaruv.png` — client dashboard (Boshqaruv paneli)
- `1b_mijoz_advokatlar.png` — client "Advokat va yuristlar"
- `1c_mijoz_xato_takliflar.png` — client "Xato va takliflar"
- `2a_advokat_boshqaruv.png` — advocate dashboard
- `2b_yurist_boshqaruv.png` — lawyer (yurist) dashboard
- `2c_advokat_xato_takliflar.png` — advocate "Xato va takliflar"
Open each with the Read tool and zoom by cropping (python PIL) where needed to read exact spacing, colors, radii, icons.

## Part 1 — dashboards must be identical to the design
1. Client dashboard = 1a; advocate dashboard = 2a; lawyer (yurist) dashboard = 2b. Same layout, sections, order, card shapes, typography, colors, icons, badges, buttons, empty states — match until a side-by-side screenshot is indistinguishable apart from real data.
2. All data is real (existing lib/services calls and backend endpoints). Design sample names/numbers (Malika, Sardor, MP-10427, 4 200 000 so'm…) are only examples. If a block has no backend source, find the closest real endpoint already used in the app; only a true backend gap goes into a questions doc in `docs/` — never fake data, never hide the block silently (show a designed empty state).
3. Category images (Mehnat huquqi, Oila huquqi, …): use real images (existing assets or free Unsplash-licensed images saved under `public/`), not grey placeholders.

## Part 2 — every other page gets the design shell
Every remaining page of client, advocate and lawyer (and other roles that share the same shell) must use the design's: dark navy sidebar (logo + role badge, grouped sections with uppercase labels, active item blue pill, user card at bottom, count badges), header (date/breadcrumb line, big title, search pill, Yordam, bell with red count, language select, avatar menu), page background, card style (white, large radius, soft border), color palette, and buttons (primary blue, dark/navy, outlined white, link-blue) — exactly as in the screenshots. Pages 1b/1c/2c must match their screenshots fully. Do this through shared tokens/components (theme variables, shell, Button) so the whole app changes consistently; then walk every route and fix anything that still looks old. Dark mode must stay coherent.

## Laws (from CLAUDE.md / owner)
- Read `AGENTS.md` and the Next.js docs in `node_modules/next/dist/docs/` before code.
- UI law: handmade DatePicker/Select/CheckBox only; no raw backend JSON/codes, no UUIDs/ids in UI; no layout bugs (no double scrollbars, no horizontal overflow, nothing hidden behind sticky header); stepper circles always carry icons.
- Every device: check 360px, 768px, 1024px, 1440px, 1920px. On phone the sidebar becomes a drawer; grids collapse sensibly; touch works.
- Keep uz/ru/en translations for all new text.
- Respect role navigation (`/me/navigation`, hidden_pages) — the redesign must not show pages a role can't open.
- Completion law: finish every single item fully — no partial work, stubs, TODOs, placeholders. Before calling it done, take Playwright screenshots of each dashboard and of every sidebar page for client, advocate and lawyer at desktop and phone width, compare against the design images item by item, fix differences, repeat until identical.
- Run `npx tsc --noEmit`, `npm run lint`, and the existing unit/e2e tests; all must pass.
- Then commit (clear message) and push: `git push git@github.com:cognilabs-company/law.git main:main` then `git fetch origin` (HTTPS origin has no creds). Never force-push.
- Write a short report at `reference/design-lexgo-1920/REPORT.md`: what changed, screenshots paths, any backend gaps.
