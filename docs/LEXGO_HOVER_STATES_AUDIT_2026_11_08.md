# LexGo: hover, focus and disabled states audit (2026-11-08)

## Report

**Owner report:** hovering the teal "Qo'ng'iroq / Call" pill (`.opx-pbtn--call`, CRM customer card header in the call center) made it unreadable. In dark theme the teal gradient turned into navy glass while the label stayed dark (#032623), so contrast went from 5.52:1 to 1.04:1. In light theme the fill did not change at all. The button is fixed. The rest of the app was then swept for the same kinds of bugs: unreadable hover, lost fill/border/radius, layout shift, single-theme hover colours, disabled buttons that still react, missing keyboard focus rings, and icons that stop following the text colour.

| | Count |
|---|---:|
| Screens probed (mocked, light + dark, 1440 px) | 24 × 2 = 48 |
| Interactive elements hovered and measured | 1026 |
| Flagged before the fix | 92 |
| Real issues among them (rows / distinct issues) | 44 / 14 |
| Extra real issues from the static CSS scan, not on a probed screen | 3 |
| Fixed | 17 of 17 |
| Flagged after the fix | 48, all false positives (explained below) |

**Root causes**
1. **Variants that paint but have no hover of their own.** The shared base rule `.opx-pbtn:hover` painted `--opx-glass-3` plus a blue border. `--call` and `--blue` had no hover rule, so they fell through to that glass. `--main.is-danger` fell through to `--main:hover` and turned teal. In light theme, `html[data-opx-theme=light] .opx-pbtn--main/--call` had higher specificity and froze the fill. The same pattern showed up in contextual overrides that repaint a variant without repainting its hover: the glass header buttons on solid bars (`.bar.on`, `.ptop .lang`), and the meeting "remove" action.
2. **Hover states not scoped to enabled buttons.** The shared `.btn--*` variants, `.opx-pbtn` and `.lh-round` reacted while `:disabled` or `aria-disabled="true"`.
3. **Single-theme ink.** The sales-head CRM mapped `--crm-acc`, which the CRM uses as a text colour, to `--lx-blue`. That is a fill blue and reads at about 2.6:1 on the dark card.
4. **Hover that changes layout.** The marketplace card CTA grew its `gap` on hover, so the button got 4 px wider. The seller-card CTA swapped its gradient for a flat colour.
5. **Overrides that remove the focus ring.** The Now card's action-pill row set `box-shadow: none`, which beat `.opx-act:focus-visible`, so keyboard focus showed nothing.
6. **Plain controls with no hover:** CRM filter chips, ROP pill links, the org-board legend, and the header user pill.

**Fix approach:**
- `.opx-pbtn` now runs on tokens: `--pb-bg`, `--pb-bg-h`, `--pb-ink`, `--pb-ink-h`, `--pb-bd`, `--pb-bd-h`, `--pb-shadow`, `--pb-shadow-h`. Only the base rule and its `:hover`, `:active`, `:focus-visible` and `:disabled` states paint. Every variant, every contextual override (detail, urgent, queues, tasks) and the light theme only set tokens. A variant can no longer inherit another variant's hover, and the hover is gated on `:not(:disabled, [aria-disabled="true"])`.
- The shared `.btn--*` hovers in `globals.css` are gated with `:where(:not(:disabled,[aria-disabled="true"]))`, which keeps specificity unchanged, so no existing override changes.
- Transitions collapse under `prefers-reduced-motion`: the global rule at `globals.css:88`, plus an explicit block for `.opx-pbtn`.
- Hover effects use colour, shadow and transform only, so nothing shifts layout.

**Screenshots:**
- `/tmp/lexgo-hover-audit/before/` (taken at `3f45edbf`, before any CSS change) and `/tmp/lexgo-hover-audit/after/` hold the same file names, 76 per side.
- 22 cases are each shot in light and dark at desktop 1440 and mobile 390, with the element hovered. Mobile emulates hover with `page.hover`.
- `ccx-act-later-focus-*` shows the keyboard focus ring instead of hover.
- 6 mobile shots are skipped on both sides because those controls are not rendered at 390 px: the admin sidebar link, the header language button, and the audit filter "Apply" button.

**Probe:**
- Script: `tests/e2e/hover-probe.spec.ts`. It is in `testIgnore`; run it with a config that clears `testIgnore`.
- Probe mode: `HP_OUT=<file>`. Shot mode: `HP_MODE=shots SHOTS_DIR=<dir>`.
- Results: `/tmp/lexgo-hover-audit/probe-before.json` and `probe-after.json`.
- For each element it reads colour, background colour and image, border, radius, opacity, shadow, transform, filter, box and rect before and after `page.mouse` hover. Transitions are turned off for the measurement.
- It flags:
  - text-vs-effective-background contrast below 3:1 (effective background = the element's own fill or first gradient stop, composited over its ancestors)
  - lost gradient, fill or border, or a changed radius
  - a size change, or a position change not explained by a transform on the element or an ancestor
  - a disabled element whose paint changes
  - an icon that stops following the text colour
  - a filled, unselected control with no hover change at all
  - no visible `:focus-visible` ring

**Checks:**
- eslint is clean on the changed TS files.
- `tsc --noEmit` is clean.
- vitest: 58 files, 598 tests passed.
- e2e: 53/53 passed (details at the end of this file).

## Fixed issues

| Component / selector | What was broken (theme) | Root cause | Fix (file:line) |
|---|---|---|---|
| `.opx-pbtn--call` "Qo'ng'iroq" (CRM customer card, `.opx-party`, urgent sheet) | **Dark:** hover turned the teal pill into navy glass under the dark label (5.52 → 1.04:1). **Light:** no hover change at all | Variant had no hover; base hover painted glass; light rule out-specified hover | Token system: `components/ccx/panel/panel.css:755` (base), `:788` (hover), `:821` (teal variants), `:877` (light) |
| `.opx-pbtn--main.is-danger` | Both themes: hover turned the red "danger" button teal | Fell through to `.opx-pbtn--main:hover` | `components/ccx/panel/panel.css:842`, light `:887`. The duplicate light rule in `queues.css` was removed |
| `.opx-pbtn--blue`, `--ghost`, `--rose` | Dark: blue gradient became glass on hover; rose had no hover of its own | No variant hover | `components/ccx/panel/panel.css:852-875`, light blue `:895` |
| `.opx-pbtn` disabled ("Qo'shish" in the lead composer) | Both: disabled button still lit up on hover | Hover not scoped to enabled | `components/ccx/panel/panel.css:788`, `:805` |
| `.opx-pbtn` contextual variants (`.opx-cd-btn-warn`, `-reject`, `.opx-cd-ai`, `.is-on`, `.opx-ug-cancel`, `.opx-board2__quiet`, `.opx-tk-back`) | Hover depended on stylesheet order; warn and AI buttons lost their tint on hover | Painted `background`/`border` directly against the base hover | Converted to tokens: `components/ccx/crm/detail/detail.css:275, 283, 1299`; `components/ccx/urgent/urgent.css:1076, 1227, 1931`; `components/ccx/queues/queues.css:1232`; `components/ccx/tasks/tasks.css:1619` |
| Now card action pills `.opx-focus .opx-acts > .opx-act` ("Keyinroq") | Both: no keyboard focus ring; "later" pill had no hover fill | `box-shadow: none` and `background: none` (0,3,0 / 0,4,0) beat `.opx-act:focus-visible` and `--later:hover` | `components/ccx/now/now.css:1884` (hover), `:1894` (focus ring) |
| Shared `.btn--pri/--grad/--soft/--line/--glass/--ghost/--danger` (e.g. disabled "Qo'llash" in the admin audit filter) | Both: disabled buttons still changed fill, shadow or shine on hover | Hovers not scoped to enabled | `app/globals.css:113-121`, `:573` (shine), `:1670`, `:3879`, plus `cursor: not-allowed` at `:128` |
| Portal header language button `.ptop .lang .btn--glass` (admin, call center, org, portals) | Both: no hover feedback | Contextual repaint (0,3,0) outranked `.btn--glass:hover` | `app/globals.css:960` |
| Solid site header glass buttons `.bar.on .btn--glass` (theme, language, "Kirish") | Both: no hover feedback | Same as above | `app/globals.css:162` |
| Marketplace seller card CTA `.mk-show__go` "Maslahat olish" | Both: hover replaced the gradient with a flat blue | Hover set `background: var(--b700)` | `app/globals.css:12335`: deeper gradient + shadow, arrow slides |
| Marketplace card CTA `.mk-card__go` "Batafsil" | Both: button grew 4 px on hover (layout shift) | Hover animated `gap` | `app/globals.css:11078`: arrow `translateX` instead of gap |
| Org header user pill `.hn-user` | Both: no hover, no focus ring | No rules | `app/globals.css:19332` |
| Org board legend chips `.ob-legend button` | Both: no hover, no focus ring | No rules | `app/globals.css:17647` |
| Landing carousel arrow `.lh-round[aria-disabled]` | Both: disabled arrow still grew on hover | Hover not scoped | `components/landing/landing.css:244` |
| ROP CRM accent `--crm-acc` (composer type chips, "+ sarlavha", active chips, links) | **Dark:** accent text at 2.6–3.0:1 on the card; "+ sarlavha" hover dropped from 7.3 to 3.0:1 | Mapped to the fill blue `--lx-blue` | `components/crm/rop/rop.css:24`: dark theme uses `--lx-link`, the same as the CRM default `--dk-acc` |
| CRM filter chips `.crm-chip`, composer type buttons | Both: no hover feedback | No hover rule | `components/crm/crm-leads.css:28`, `components/crm/crm-lead.css:76` |
| ROP pill links `a.rop-pill` | Both: no hover, no focus ring | No rules | `components/crm/rop/rop.css:25-27` |
| Meeting participant "Remove" `.mtg__pact--danger` (static scan; needs a live call, so no shot) | Both: hover replaced the red tint with white glass | Shared `.mtg__pact:hover` declared earlier, same specificity | `app/globals.css:4441` |

## False positives (still flagged after the fix: 48 rows)

| Rows | Element | Why it is not a bug |
|---:|---|---|
| 30 | Admin sidebar `a.psb__link` ("icon stops following text") | By design: the icon sits in its own tile, which turns accent-blue on hover while the label turns ink. Both stay readable (shot `admin-side-link-*`) |
| 4 | CRM lead step track `li > button` (Taklif, Qaror kutilmoqda) | By design: the step circle's icon turns aqua on hover; the label is unchanged (shot `crm-status-item-*`) |
| 1 | Client AI launcher `.cpl-launch--button` ("fill lost", dark) | The hover tint is translucent (`--dk-tint-blue`) over the panel. It is visible and the label stays at 9:1 (shot `client-ai-launch-*`) |
| 2 | Onboarding `.obd__skip` ("contrast 1:1") | White text over the onboarding scrim, which is a sibling layer, not an ancestor, so the probe cannot see it. Real contrast is high. Not hover-related |
| 5 | Public home: header glass buttons and `.lh-btn--glass` over the hero; the plan `.switch` button | The background is a hero image, or a sliding indicator that is a sibling element. Visually readable (shots `home-bar-glass-*`, `home-war-glass-*`, `home-plan-switch-*`). Same value before and after hover |
| 6 | `span.lx-chip--role`, `span.mcard__chip` | Not interactive: static labels matched by the `[class*=chip]` selector |

**Static scan (`/tmp/lexgo-hover-audit/static-variants.txt`, 110 candidates):**
- 7 are the `.opx-pbtn` family; all were converted to tokens.
- 71 are selected states (`.on`, `.is-on`, `.sel`, …). They are declared after their base `:hover` with equal or higher specificity, so the selected paint wins on hover, which is intended.
- 32 others were reviewed:
  - `mtg__pact--danger` was fixed.
  - `svc__act--*` is unused CSS: no `.tsx` references it.
  - Skeleton and ghost placeholders (`--sk`, `--ghost`, `tcard--ghost`, `tcat__cat--ghost`, `sx-rk-row--ghost`) are not interactive.
  - The remaining candidates (`opx-cl-mini--ghost`, `opx-ug-menu__item.is-danger`, `ntitem--unread`, `idv__prov--main`, `lxs-kpi--pri`, `rop-kpi--pri`, `lxs-month__d.*`, …) keep readable text on their hover fill in both themes, or their own rule is declared later and wins.

## Tests

- eslint: `tests/e2e/hover-probe.spec.ts`, `playwright.config.ts`: clean.
- `npx tsc --noEmit`: clean.
- `npx vitest run`: 58 files, 598 tests passed.
- e2e (Playwright, mocked backend, workers=1, against the running dev server): `crm`, `rop`, `ccx-locale-switch`, `permissions-hide`, `design-shell`, `market-by-service`, `keyboard`: **53 passed, 0 failed** (15.1 min, 2026-11-09).
