# LexGo — unstyled UI audit (2026-11-08)

## Report

**Owner report:** on the call-center CRM customer card, the "Leads · LexGo orders · Customer timeline" tabs rendered as raw browser buttons: `.opx-cd-tabs` had no CSS anywhere. That page is fixed, and the same class of bug was then audited across the whole app: every `className` used in a `.tsx` file that has no rule in any `.css`/`.scss` file. The scan covered 306 class names in 230 files (`/tmp/missing_css.py`, extended to list every class, not just the first 12 per file). Each class was judged harmless or fixed, with a reason. The audit also checked each file for native `select`/checkbox/radio/date inputs, tabs and segments with no selected state, icons stacked above text, elements with no gap, single-theme colors, and raw codes or UUIDs shown as text.

| Group | Classes checked | Harmless | Unstyled → fixed | Other issues fixed |
|---|---:|---:|---:|---:|
| CRM customer card (owner report) | 8 | 6 | 2 (`opx-cd-tabs`, `opx-cd-tag`) | 1 (raw language code) |
| Admin | 104 | 102 | 2 (`psb__count`, `ccx__body`) | 2 (raw payout status, raw audit outcome code) |
| Portal / services / org | 63 | 59 | 4 (`promo__pend`, `promo__pendamt`, `drate--shut`, `docup__note`) | 3 (Telegram-sent line colors, a UUID in the service picker, raw codes on the org member page) |
| Call center / CRM / support / chat / tasks / HRM / live office | 120 | 120 | 0 | 1 (CRM lead pane menu had no checked state) |
| Marketplace / landing / legal / register / shared UI / public | 58 | 57 | 1 (`mmman__ic` + `mmman__head`, the map's manual-pick header) | 1 (`.rf__benefit` border was light-only in dark theme) |
| **Total** | **353** | **344** | **9** | **8** |

"Harmless" covers: BEM modifiers on styled bases, JS/test hooks, wrappers styled by a parent selector (verified to exist), SVG groups colored by their children, dead code, and scan noise (variable names picked up by the regex). Every row gives its reason.

**Native controls:** no browser-default `select`, date or time input is left in the app. Every native checkbox and radio is hidden behind the handmade control. One native range slider remains (refund amount, `MpComplaintDecide.tsx`), colored with `accent-color`.

**Checks:** `tsc --noEmit` is clean. eslint is clean on the changed files. vitest passes: 58 files, 598 tests. Related e2e specs pass: 46/46 (`crm`, `rop`, `ccx-locale-switch`, `promotions-admin`, `permissions-hide`).

**Screenshots:** `/tmp/lexgo-design-audit/before/` (commit `8eabf3ee`) and `/tmp/lexgo-design-audit/after/` hold the same file names. There are 11 page states, each in uz/ru/en × desktop 1440 / mobile 390 × light/dark, so 132 per side. They are produced by `tests/e2e/design-audit-shots.spec.ts`, which is in `testIgnore`; run it with a config that clears `testIgnore` and set `SHOTS_DIR`. The states are:
- CRM customer tabs
- CRM customer "LexGo orders" tab
- CRM lead pane menu
- Call-center cancellations queue (admin with `callcenter.access`)
- Admin payouts status
- Admin audit outcome
- Seller promotion "waiting for approval" card
- Client document rating "window closed"
- Doc-analysis hand-off note
- Map manual-pick header
- Register advocate tenure card

Not screenshotted, with the reason:
- `psb__count` sits on the admin sidebar's Call-center link for call-center operators. Today operators always get the separate call-center workspace, which has its own "Hozir N" counter, so no current role can see the admin sidebar pill. The CSS is in place for that code path.
- The service-picker UUID fix and the org-member raw-code fix are text fallbacks for rare backend data, verified in code.

## CRM customer card (owner report)

| File | Class / element | Verdict | Why / fix (css file:line) |
|---|---|---|---|
| components/ccx/crm/sections/CrmCustomerX.tsx | `opx-cd-tabs` (Leads / LexGo orders / Customer timeline tab bar) | **fixed** (owner report) | No rule anywhere → native grey buttons, icon stacked over label, no selected state, no gap. Now: `.opx-cd-tabs` hairline bar (scrolls sideways when narrow), `.opx-cd-tab` text tabs with inline icon + count pill, aqua underline + `is-on`/`aria-selected` selected state, hover, focus-visible ring, arrow/Home/End keys, `role=tab`/`tabpanel` wiring, light+dark via opx tokens, icons drop under 380px — components/ccx/crm/detail/detail.css (end of file, "Customer card" block) |
| components/ccx/crm/sections/CrmCustomerX.tsx | `opx-cd-tag` (region / language chips in the header) | **fixed** | Rendered as bare inline text glued to the pills. Now a neutral pill matching `.opx-cd-pill` (icon inline) — detail.css "Region / language chips" block. Also: an unknown language code is no longer shown raw (UI law) |
| components/ccx/crm/sections/CrmCustomerX.tsx | `opx-cd--customer` | harmless | Modifier on the styled `.opx-cd` root; no customer-specific style needed |
| components/ccx/crm/sections/CrmCustomerX.tsx | `opx-cd-col--main`, `opx-cd-col--side` | harmless | Modifiers on the styled `.opx-cd-col` grid columns (detail.css `.opx-cd-col`) |
| components/ccx/crm/sections/CrmCustomerX.tsx | `opx-cd-feed` | harmless | Extra class on a `.opx-cd-card` section; its body `.opx-cd-feed__body` is styled |
| components/ccx/crm/sections/CrmCustomerX.tsx | `opx-cd-linkcard`, `opx-cd-notes` | harmless | Passed to `Card` (components/ccx/crm/detail/kit.tsx), which renders a styled `.opx-cd-card` root; their contents (`.opx-cd-linkstate`, `.opx-cd-notes__text`) are styled |

## Admin (components/admin, app/[locale]/admin)

Legend: **H** = harmless, **FIX** = unstyled, fixed. "css" = app/globals.css unless noted. Line numbers are from 2026-11-08 after the edits; other groups are editing globals.css at the same time, so they may move by a few lines.

| File | Class / element | Verdict | Why / fix (css file:line) |
|---|---|---|---|
| components/admin/liveOffice/Character.tsx | lo-ch__arms | H | SVG `<g>` group; fills/strokes are inline SVG attributes, so the class is only a name. Not a missing style |
| components/admin/liveOffice/Character.tsx | lo-ch__eyes | H | SVG group/ellipse with inline `fill` |
| components/admin/liveOffice/Character.tsx | lo-ch__hand | H | SVG circles with inline `fill={look.skin}` |
| components/admin/liveOffice/Character.tsx | lo-ch__hands | H | SVG `<g>` wrapper |
| components/admin/liveOffice/Character.tsx | lo-ch__head | H | SVG `<g>`; position comes from the inline `transform` |
| components/admin/liveOffice/Character.tsx | lo-ch__sip | H | SVG `<g>` wrapper (static drawing) |
| components/admin/liveOffice/Character.tsx | lo-ch__steam | H | SVG path with inline stroke |
| components/admin/liveOffice/Character.tsx | lo-desk | H | SVG `<g>` wrapper |
| components/admin/liveOffice/Character.tsx | lo-dk | H | SVG `<g>` wrapper |
| components/admin/liveOffice/Character.tsx | lo-screen__ui | H | SVG `<g>` wrapper |
| components/admin/UrgentAdvocateQueue.tsx | s | H | Bad scan match (the letter in a comment or variable name) |
| components/admin/UrgentAdvocateQueue.tsx | uad__vnote | H | Extra class on VoiceNotePlayer; its root `.vnote` gets its look from `.uad__files .vnote` (css:17251) |
| components/admin/UrgentAdvocateQueue.tsx | uadf | H | Modal footer slot; base `.ccslot` is styled |
| components/admin/UrgentAdvocateQueue.tsx | uamenu__sheet | H | Extra class on `.dsel__sheet`, which is styled (css + sx-core.css) |
| components/admin/UrgentAdvocateQueue.tsx | uaq | H | Extra class on a `.ppanel` section |
| components/admin/UrgentAdvocateQueue.tsx | want | H | Bad scan match (variable `want`) |
| components/admin/liveOffice/OfficePlan.tsx | lo-floorlogo | H | SVG `<g>`, inline fills |
| components/admin/liveOffice/OfficePlan.tsx | lo-furn | H | SVG `<g>`, inline fills |
| components/admin/liveOffice/OfficePlan.tsx | lo-hall | H | SVG rect with inline `fill="url(#lo-p-hall)"` |
| components/admin/liveOffice/OfficePlan.tsx | lo-r | H | SVG room `<g>` (also `data-room`); nothing to style |
| components/admin/liveOffice/OfficePlan.tsx | lo-sign | H | SVG `<g>` wrapper |
| components/admin/liveOffice/OfficeFloor.tsx | focus | H | Bad scan match (variable `focus` in a ternary) |
| components/admin/liveOffice/OfficeFloor.tsx | lf-decor | H | SVG `<g>`, inline fills |
| components/admin/liveOffice/OfficeFloor.tsx | lf-ground | H | SVG `<g>` with an inline transform |
| app/[locale]/admin/page.tsx | aov-act | H | Extra class on `<Panel>` (`.aov-panel` is styled); the grid does not place panels by this class |
| app/[locale]/admin/page.tsx | aov-rev | H | Same as above; its children `.aov-rev__head` and others are styled |
| app/[locale]/admin/reviews/page.tsx | n | H | Bad scan match (`Stars({ n })` prop) |
| app/[locale]/admin/reviews/page.tsx | rvw__st | H | Hook on `.creq__badge`; the `rvw__st--{status}` tones exist (css:3169-3171) |
| app/[locale]/admin/audit-trail/page.tsx | audit__chain | H | Hook on `.creq__badge`; the `audit__chain--{state}` tones exist (css:4019-4021) |
| app/[locale]/admin/audit-trail/page.tsx | audit__outcome | H | Hook on `.creq__badge`; the `audit__outcome--ok/--bad` tones exist (css:4189-4190) |
| app/[locale]/admin/ceo/page.tsx | ceo-ch__pt--end | H | Modifier; the base `.ceo-ch__pt` dot is styled (css:18739) and its position is inline |
| app/[locale]/admin/ceo/page.tsx | null | H | Bad scan match (`null` in a ternary) |
| app/[locale]/admin/services/page.tsx | svcadm | H | Extra class on `.ppanel`; its children (`svcadm__hint`, `__scope`, `__filters`) are styled |
| app/[locale]/admin/services/page.tsx | svcadm__grid | H | Extra class on `.agrid` (css:2588) |
| components/admin/studio/settings/RouteModal.tsx | m | H | Bad scan match (map variable) |
| components/admin/studio/settings/RouteModal.tsx | s | H | Bad scan match (map variable) |
| app/[locale]/admin/pipeline/LegacyPipeline.tsx | dragId | H | Bad scan match (state variable). The whole file is dead code: pipeline/page.tsx redirects to /admin/crm/leads and does not import it |
| app/[locale]/admin/pipeline/LegacyPipeline.tsx | lstg | H | Extra class on `.cform` (css:721). Dead code |
| components/admin/mobileTesting/MtmOverview.tsx | mtm-date__tz | H | `<small>` inside `.mtm-date__txt`, styled by `.mtm-date__txt small` (mtm.css:39) |
| components/admin/mobileTesting/MtmOverview.tsx | mtm-split--off | H | Modifier; `.mtm-split` is styled and the colour comes from the card's `data-tone="off"` (mtm.css:12,74) |
| components/admin/mobileTesting/MtmReports.tsx | mtm-dlg--warn | H | Modifier on the styled `.mtm-dlg` (mtm.css:275); its children `.mtm-warn`/`.mtm-muted` carry the tone |
| components/admin/mobileTesting/MtmReports.tsx | mtm-table--rep | H | Modifier on the styled `.mtm-table`; also a test hook |
| components/admin/studio/GroupFlow.tsx | stu-groups | H | Paired with the styled `stu-groups--v2` (css:19648). Dead code: its only importers (StudioDashboard, ObjectList) are not imported anywhere |
| components/admin/studio/GroupFlow.tsx | stu-journeys | H | Section wrapper; `.stu-sec-h` has margin-bottom and `.stu-journeys__list` is styled. Dead code (see above) |
| components/admin/studio/StudioMonitoring.tsx | k | H | Bad scan match (variable) |
| components/admin/studio/StudioMonitoring.tsx | stu-mon | H | Extra class on `.stu-card`. Dead code: the route uses sx/monitoring/Monitoring |
| components/admin/studio/sx/approvals/QueueSection.tsx | sx-ap2-all__t | H | Label text span inside the styled `.sx-ap2-all` pick box (sx-ap2.css:224-250) |
| components/admin/studio/sx/approvals/QueueSection.tsx | sx-ap2-for | H | Extra class on `.sx-vh` (visually hidden) |
| components/admin/studio/sx/ctorpage/RecordTable.tsx | sx-cp-panel | H | Extra class on `SxPanel` (`.sx-panel` is styled; `.sx-cp-blank` is styled) |
| components/admin/studio/sx/ctorpage/RecordTable.tsx | sx-cp-view | H | Extra class on `SxSegmented`, which has its own selected state |
| components/admin/studio/sx/inline/InlineDrawer.tsx | sx-inl-dw__form | H | Wrapper inside `.sx-inl-dw` (grid, gap 16, sx-inline.css:107); SchemaForm lays itself out |
| components/admin/studio/sx/inline/InlineDrawer.tsx | sx-inl-dw__sk | H | Extra class on `.sx-ed__sk` (sx-editor.css; InlineDrawer imports it) |
| components/admin/liveOffice/Feed.tsx | lo-away | H | Extra class on `HrmPanel` (`.hrm-panel`, css:985) |
| components/admin/liveOffice/Feed.tsx | lo-feed | H | Same as above |
| app/[locale]/admin/notifications/page.tsx | nsend__results | H | Block wrapper; children are `.ppanel__h` (inline margin), `.alist`/`.aitem`, `.advmuted` |
| app/[locale]/admin/payouts/page.tsx | payout__st | H | Hook on `.creq__badge`; the `payout__st--{status}` tones exist (css:3172-3175). See the raw-status row below |
| app/[locale]/admin/policies/page.tsx | m | H | Bad scan match (map variable). Its native radio is hidden (`.unvmode__opt input`, css:5358) behind a custom `.unvmode__dot` |
| components/admin/StaffProfile.tsx | cprof__av | H | Grid cell of `.cprof`; the avatar is styled by `.cprof .phup` / `.phup__av` (css:3786-3787) |
| components/admin/AdminShell.tsx | psb__count | **FIX** | The open-work count on the "Call center" nav link was a bare bold number glued to the label, with no pill and no right alignment. Added a pill pushed to the end of the row, in the red "hot" tone of `.ccon__n--hot`, plus a white-on-gradient version for the active link (css:15968-15969) |
| components/admin/QualityComplaints.tsx | a | H | Bad scan match (letter `a` in a comment); the native radios use `.ccpick__in`, hidden (css:17263) |
| components/admin/CallCenterConsole.tsx | ccon__panels | H | Block child of the flex column `.ccon` (css:16572) that holds the styled panels |
| components/admin/mobileTesting/MtmDetail.tsx | mtm-table--daily | H | Modifier on the styled `.mtm-table`; also a test hook |
| components/admin/templateEditor/PreviewModal.tsx | tpe-prev__form | H | Paired with the styled `.tpe-form` |
| components/admin/templateEditor/Navigator.tsx | tpe-nav | H | Wrapper inside `.tpe-pane`; the sticky `.tpe-pane__h` and the lists are styled (css:17728-17731) |
| components/admin/studio/guide.tsx | stu-guide__card--what | H | Modifier on the styled `.stu-guide__card`. guide.tsx is imported only by the dead ObjectList.tsx |
| components/admin/studio/StepMeta.tsx | open_ | H | Bad scan match (variable `open_`) |
| components/admin/studio/sx/StatusRail.tsx | sx-rail__text | H | Text span inside `.sx-rail__label` (sx-rail.css:47) |
| components/admin/studio/sx/editor/EditorDialogs.tsx | sx-dlg__warns | H | Extra class on `.sx-dlg__sec` (sx-editor-panels.css, imported) |
| components/admin/studio/sx/approvals/Bulk.tsx | sx-ap2-run__bar | H | Extra class on `SxProgress` |
| components/admin/studio/sx/approvals/review/Comments.tsx | sx-rv-cmt | H | Paired with `.sx-ed-cmt` (sx-editor-panels.css, imported by this file) |
| components/admin/studio/sx/approvals/review/StepList.tsx | sx-rv-steps | H | Paired with `.sx-ed-steps` (sx-editor-panels.css, imported) |
| components/admin/studio/sx/approvals/review/ActionDialog.tsx | sx-rv-dlg | H | Paired with `.sx-dlg__form` (sx-editor-panels.css, imported) |
| components/admin/studio/sx/journey/JourneyStatusPill.tsx | sx-jr-status | H | Extra class on `StatusPill` |
| components/admin/studio/sx/journey/WizardReview.tsx | sx-jr-review__name | H | Text span in the inline-flex `.sx-jr-review__step` chip, which has a gap (sx-journey.css:201) |
| components/admin/studio/sx/journey/CreateHome.tsx | sx-jr-start | H | Extra class on `SxPanel` |
| components/admin/studio/sx/monitoring/ActivityChart.tsx | sx-mon-chart | H | Paired with `.sx-mon-card` (sx-monitoring.css) |
| components/admin/studio/sx/monitoring/Monitoring.tsx | sx-mon-refresh | H | Paired with `.sx-ibtn` |
| components/admin/studio/sx/monitoring/Lanes.tsx | sx-mon-lanes | H | Paired with `.sx-mon-card` |
| components/admin/studio/sx/ctorpage/CategoryTreeTable.tsx | sx-cp-panel | H | Extra class on `SxPanel` |
| components/admin/studio/sx/ctorpage/ReorderPanel.tsx | sx-cp-panel | H | Extra class on `SxPanel` (with the styled `.sx-cp-ro`) |
| components/admin/studio/sx/ctorpage/RecordCards.tsx | sx-cp-cgroup__title | H | Text span inside the flex `.sx-cp-cgroup__head` (gap 8, sx-ctorpage.css:526) |
| components/admin/studio/sx/agent/AgentJobView.tsx | sx-ag-flowcard | H | Paired with `.sx-ag-card` (sx-agent.css) |
| components/admin/studio/sx/inline/ManagePanel.tsx | sx-inl-add | H | Extra class on `SxButton` |
| components/admin/studio/sx/inline/RefInline.tsx | sx-inl-add | H | Extra class on `SxButton` |
| components/admin/studio/sx/home/Overview.tsx | sx-hov__kpis | H | Paired with `.sx-kpis` (sx-kpi.css, imported) |
| components/admin/studio/sx/home/GroupCard.tsx | sx-gcard__map | H | Extra class on `StepMap` |
| components/admin/studio/sx/layout/Table.tsx | sx-table__acol | H | `<col>` for the actions column; it needs no width (cells size themselves) |
| components/admin/studio/sx/layout/Page.tsx | sx-page__notice | H | Grid item of `.sx-page` (grid, gap 20, sx-layout.css:8); its only content is the styled `SxNote` (RetiredNote) |
| components/admin/studio/sx/layout/Outline.tsx | sx-outline__item | H | `<li>` in `.sx-outline__list` (list-style none, grid); the link is styled |
| components/admin/studio/sx/layout/Guide.tsx | sx-guide__btn | H | Paired with `.sx-ibtn` |
| components/admin/studio/sx/settings/ExportSection.tsx | sx-st-ex__step | H | Extra class on `Field`; the wrapper `.sx-st-ex__steps` grid and `.sx-st-ex__n` are styled (sx-settings.css:1141-1146) |
| components/admin/studio/sx/schema/fields.tsx | sx-sf__objhead | H | Extra class on `SxSectionHeader` |
| components/admin/studio/sx/schema/DraftPages.tsx | active | H | Bad scan match (prop `active`) |
| components/admin/studio/sx/schema/legal/LegalText.tsx | sx-lg__src | H | Grid item of `.sx-lg` (gap 12); its child `.sx-lg__parts` is styled |
| components/admin/studio/sx/form/Switch.tsx | sx-switch__label | H | Text in the inline-flex `.sx-switch` button (gap 10, sx-form.css:310) |
| components/admin/studio/sx/form/Repeater.tsx | sx-rep__remove | H | `querySelector` hook, paired with `.sx-ibtn` |
| components/admin/studio/dash/ObjectRows.tsx | stu-orow__as | H | Styled by `.stu-orow__meta span` (css:14987). ObjectRows.tsx is dead code (not imported) |
| components/admin/ai/ReglamentList.tsx | flashId | H | Bad scan match (prop) |
| components/admin/ai/ReglamentDrawer.tsx | viewing | H | Bad scan match (variable) |
| components/admin/callcenter/PayoutQueue.tsx | pyq | H | Extra class on `.ppanel.esc` (escalations.css, imported) |
| components/admin/callcenter/cancellations/CancellationQueue.tsx | ccx__body | **FIX** | The body under the queue head (range line, stale `SxNote`, list or empty state, pager) had no layout, so the warning note sat glued to the first card. Made it a grid with gap 12; the pager's margin is reduced to 4px so total spacing stays the same (cancellations.css:66-74) |
| components/admin/liveOffice/OfficeMap.tsx | scale | H | Bad scan match (state `scale` in a ternary) |
| components/admin/marketplace/MkmSellers.tsx | mkm-td--rev | H | Paired with `.num` (`.mkm-table .num`, css:11708) |
| components/admin/plans/PlanVersions.tsx | trf-ent | H | Fieldset inside `.trf-edit`; the fieldset reset and legend style come from `.trf-edit fieldset/legend` (tariffs.css:23-24) and `.trf-ent__row` is styled |
| app/[locale]/admin/payouts/page.tsx | payout status text (other issue) | **FIX** | UI law: an unknown backend status was shown raw (`p.status`, e.g. `on_hold`). It now falls back to `t("statusOther")` (guarded with `t.has`), else "—". New key in A-i18n.json |
| app/[locale]/admin/audit-trail/page.tsx | outcome badge text (other issue) | **FIX** | UI law: an unknown backend outcome was shown raw (`a.outcome`, e.g. `auth_failed`). It now shows "Failed" (the existing `outcome.failed` key) for failure-like codes; otherwise `t("outcomeOther")` (guarded), else "—". New key in A-i18n.json |
| components/admin + app/[locale]/admin (all) | native `<select>` / checkbox / radio / date | checked | No native `<select>` or date/time input. Every checkbox/radio is visually hidden behind a custom control: `.lrsn__chip input`, `.ccpick__in`, `.mpp__sw input`, `.nrcp__row input`, `.unvmode__opt input`, `sx-vh` (ChoiceCards, GrantDrawer). The `LegacyPipeline` colour radio is dead code. Nothing to fix |

#### Counts
- Classes checked: **104** (all rows from scan-A.txt)
- Harmless: **102** (of these, 20 are bad scan matches and 7 sit in dead code: LegacyPipeline, GroupFlow, StudioMonitoring, ObjectRows, guide.tsx)
- Unstyled, fixed: **2** (`psb__count`, `ccx__body`)
- Other issues fixed: **2** (raw payout status, raw audit outcome code)

#### Changed files
- app/globals.css (new `.psb__count` rules after `.psb--admin .psb__link.on:focus-visible`, ~line 15968)
- components/admin/callcenter/cancellations/cancellations.css (`.ccx .ccx__body`, `.ccx .ccx__body > .ccx-pager`)
- app/[locale]/admin/payouts/page.tsx (status fallback)
- app/[locale]/admin/audit-trail/page.tsx (outcome fallback)
- /tmp/lexgo-design-audit/A-i18n.json (2 new keys for the lead: admin.payouts.statusOther, admin.audit.outcomeOther)

## Portal, seller services, organizations

| File | Class / element | Verdict | Why / fix (css file:line) |
|---|---|---|---|
| components/portal/PromotionPanel.tsx | `promo` | harmless | Plain wrapper div; children (`.promo__hero`, `.ppanel`, …) are fully styled (app/globals.css:2054+). |
| components/portal/PromotionPanel.tsx | `promo__hero-t` | harmless | Text column inside the flex `.promo__hero` (globals.css:2054); kick/h2/lead/`.promo__boost` all styled (promoCheckout.css:23). |
| components/portal/PromotionPanel.tsx | `promo__pend` | **unstyled → fixed** | "Waiting for approval" card had no surface; `<b><IconClock/>…</b>` stacked the 1em block svg above the title. Added a card in the `.promo__lapse` pattern (blue tint/border via `--dk-tint-blue`/`--dk-bd-blue`, inline icon, grid gap, `.wid` wraps) — components/services/promoCheckout.css:45-56 (loaded via PromoteModal, imported by PromotionPanel). |
| components/portal/PromotionPanel.tsx | `promo__pendamt` | **unstyled → fixed** | Amount was bare text; now a tabular-nums pill — promoCheckout.css:52. |
| components/portal/dash/ClientHome.tsx | `cdwho__c--adv` | harmless | Modifier; base `.cdwho__c` + `.cdwho__stage` fully styled (globals.css:7540-7570); only the AI variant needs a different stage tint. |
| components/portal/dash/ClientHome.tsx | `cx-row--top` | harmless | Modifier of styled `.cx-row` (dash1920.css:6). |
| components/portal/dash/ClientHome.tsx | `cx-svcs` | harmless | Section wrapper inside `.cx` grid (gap 24px, dash1920.css:5); `.cx-head`, `.cx-svcs__grid`, `.cx-svc` styled (dash1920.css:8,160-180). |
| components/services/bits.tsx | `psk--banner` / `psk--profile` / `psk--service` (3) | harmless | Modifiers of styled `.psk` sketch; all inner parts (`.psk__hero/__bar/__tiles/__grid`) styled (globals.css:13989-14004). |
| components/portal/TaskBoard.tsx | `dragId`, `s` (2) | harmless | Scan artifacts — JS variables inside `${…}` ternaries. |
| components/portal/SellerProfileEditor.tsx | `cprof--seller` | harmless | Modifier of styled `.cprof` (globals.css:3784). |
| components/portal/SellerProfileEditor.tsx | `cprof__av` | harmless | Grid-cell wrapper; the avatar is styled through `.cprof .phup` / `.cprof .phup__av` (globals.css:3786-3787, mobile 3810). |
| app/[locale]/portal/client/intake/page.tsx | `intake__matches` | harmless | Wrapper; `.intake__resh`, `.advpick*` styled (globals.css:3131). |
| app/[locale]/portal/client/intake/page.tsx | `intake__res` | harmless | Extra hook on `.ppanel`. |
| components/org/OrgMemberPage.tsx | `k` | harmless | Scan artifact (`tab === k`). |
| components/org/OrgMemberPage.tsx | `omem__who` | harmless | Text cell in `.omem__card` grid `auto minmax(0,1fr) auto` (globals.css:13907); all children styled (13909-13917). |
| components/portal/DocRatingBox.tsx | `drate--shut` | **unstyled → fixed** | "Rating window closed" line inherited `.drate` = column grid → the clock svg (display:block) sat ABOVE the text. Added `.drate--shut{display:flex;align-items:center;gap:8px…}` muted, + svg size — app/globals.css:7868-7871. |
| components/portal/DocRatingBox.tsx | `shown` | harmless | Scan artifact (variable). |
| components/portal/UrgentAdvocatePanel.tsx | `rShown` | harmless | Scan artifact (variable). |
| components/portal/UrgentAdvocatePanel.tsx | `ua__st` | harmless | Base is `.creq__badge` (globals.css:2412); per-status colours `.ua__st--*` exist (6248, 7159-7169). |
| components/portal/desk/apps/DashboardApp.tsx | `dxh-panel--launch` | harmless | Modifier of styled `.dxh-panel` (dashboard.css:28-36,71-82); `.dxh-launch` grid styled (55). |
| components/portal/desk/apps/DashboardApp.tsx | `is-task` | harmless | Row styled by `.dxh-agenda li` / `time svg` (dashboard.css:40-43). |
| components/portal/desk/DesktopShell.tsx | `m` | harmless | Scan artifact (`barMenu === m`). |
| app/[locale]/portal/client/sos/page.tsx | `key` | harmless | Scan artifact (`cat === key`). |
| app/[locale]/portal/client/profile/page.tsx | `cprof__av` | harmless | Same as SellerProfileEditor — `.cprof .phup*` (globals.css:3786-3787). |
| app/[locale]/portal/client/doc-analysis/page.tsx | `docup__note` | **unstyled → fixed** | Hand-off note / error `<p>` became a flex item of `.docup` (flex-wrap row) and got squeezed beside the action buttons. Added `.docup__note{flex-basis:100%}` — app/globals.css:4116 (colours come from `.dgate__note` / `.svc__err`). |
| components/portal/desk/apps/TasksApp.tsx | `s` | harmless | Scan artifact. |
| components/portal/CaseAiTools.tsx | `k` | harmless | Scan artifact (`tool === k`, btn--pri/btn--line). |
| components/portal/dash/FeedbackPage.tsx | `k` | harmless | Scan artifact (`kind === k`). |
| components/services/ServicePicker.tsx | `cur` | harmless | Scan artifact (`i === cur`). |
| components/portal/MyPlanCard.tsx | `myplan__price` | harmless | Row styled by `.myplan__next li/b/del/ins` (myPlan.css:12-16). |
| components/portal/AccountDataCard.tsx | `accdata` | harmless | Hook on `.ppanel`; children styled (accountData.css:2-7). |
| components/portal/BusinessHoursBadge.tsx | `bhours__sch` | harmless | Plain text span inside inline-flex `.bhours` with gap (globals.css:4037). |
| components/portal/UrgentAssignedPanel.tsx | `uasg` | harmless | Hook on `.ppanel`; children styled (globals.css:7334-7340). |
| components/portal/PortalShell.tsx | `lx-chip--role` | harmless | Modifier of styled `.lx-chip` (shell1920.css:162-166). |
| components/portal/OpenDocumentWork.tsx | `odw` | harmless | Hook on `.ppanel`; children styled (globals.css:6418-6424). |
| components/portal/AttachmentPicker.tsx | `docpick__add` | harmless | Hook on `.btn.btn--line.btn--sm`. |
| components/portal/ClientReviews.tsx | `value` | harmless | Scan artifact (`n <= value`). |
| components/portal/AttachmentPreview.tsx | `dprev--file` | harmless | Modifier of styled `.dprev` (globals.css:7982-7991). |
| components/portal/AiSystemAssistant.tsx | `ains__ai--guide` | harmless | Modifier of styled `.ains__ai` bubble (globals.css:13062). |
| components/portal/MiniCalendar.tsx | `minical` | harmless | Wrapper; `.minical__title/__wd/__grid/__d` styled (globals.css:2187-2192). |
| components/portal/OfficeLocationCard.tsx | `mmo__edit` | harmless | Wrapper; `.mmo__lead/__grid/__pick/__row` styled (marketMap.css:69-78, imported by the file). |
| components/portal/AchievementsPanel.tsx | `ach` | harmless | Hook on `.ppanel.exp`; `.ach__*` styled (experience.css:210+). |
| components/portal/desk/OsPicker.tsx | `current` | harmless | Scan artifact (prop name). |
| components/portal/desk/apps/SubscriptionApp.tsx | `is-gift` | harmless | State on styled `.dxs2-plan` (subscription.css:12-39); gift card intentionally plain. |
| components/portal/desk/apps/ClientsApp.tsx | `dxk-sec` | harmless | Per-letter section wrapper; `.dxk-letter` sticky header + `.dxk-row` styled (clients.css:6-19). |
| components/portal/desk/apps/FilesApp.tsx | `p` | harmless | Scan artifact (`place === p`). |
| components/portal/desk/apps/WorkApp.tsx | `group` | harmless | Scan artifact. |
| components/portal/desk/apps/client/DeskService.tsx | `is-lawyer` | harmless | State on styled `.dxcr-card` (client.css:897-902). |
| components/portal/desk/apps/client/Purchase.tsx | `dxcp-att` | harmless | Hook on `.dx-field`; `.dxcp-att__bar/__list` styled (client.css:321-326). |
| components/portal/desk/apps/client/OrdersApp.tsx | `dxco-sheet` | harmless | Hook on styled `.dxcw-insp` inspector (client.css:34-45); desktop app only. |
| components/portal/desk/apps/client/SosApp.tsx | `dxcz-form` | harmless | Hook on styled `.dxcz-box` (client.css:371-375). |
| components/portal/desk/apps/messages/MessagesApp.tsx | `dxm-row-wrap` | harmless | Block wrapper per message; `.dxm-day/.dxm-note/.dxm-msg` styled (messages.css:86-104). |
| components/portal/shell/LxHeaderTools.tsx | `at` | harmless | Scan artifact (`i === at`). |
| components/portal/dash/SellerHome.tsx | `urgent` | harmless | Scan artifact. |
| components/services/PriceField.tsx | `cap` | harmless | Scan artifact (`n === cap`). |
| components/services/SellerPackagesSection.tsx | `tick` | harmless | Scan artifact. |
| components/services/ServiceFormModal.tsx | `svcfg-negsec` | harmless | Hook on styled `.svform__sec` (globals.css:13738); switch inside styled by `.svcfg-sw` (config.css:1-4). |
| components/services/PromoteServicesSection.tsx | `svps` | harmless | Hook on `.ppanel`; `.svps__*` styled (globals.css:13887-13891). |
| components/services/LegacyServicePicker.tsx | `svprices` | harmless | Wrapper; `.svprice*` rows styled (globals.css:5007-5013). |
| components/services/ServiceManager.tsx | `svm__hero-t` | harmless | Text cell of `.svm__hero` grid `minmax(0,1fr) auto` (1 col ≤900px, globals.css:13624,13933); title/lead styled. |
| **Other issues found** | | | |
| components/portal/PromotionPanel.tsx | `promo__tgok` / `promo__tgbad` (ternary, missed by scan) | **unstyled → fixed** | Telegram-sent status line was plain default `<small>`; now ok/err coloured — promoCheckout.css:53-55. |
| components/services/LegacyServicePicker.tsx:137 | price row title `s?.name ?? id` | **raw UUID → fixed** | Showed the service UUID while the catalog was loading / service missing; now `s?.name \|\| "—"`. |
| components/org/OrgMemberPage.tsx:101,105 | member tags fall back to raw `sellerType` / `verification` code | **raw backend code → fixed** | Fallback now `humanizeSlug(code)` (lib/lawyers.ts) instead of e.g. `pending_review`. |
| group-wide | native `<select>` / checkbox / radio / date | checked, none visible | Every native checkbox/radio in the group (`.vac`, `.svform__policy`, `.svrc__o`, `.lfb-kind`) is visually hidden with a handmade control; `range` in desk voice player is custom-styled (messages.css:138-140). No `<select>`/date inputs. |
| components/portal/desk/apps/DashboardApp.tsx | `dxh-panel--wide` (template, missed by scan) | harmless | Dead modifier — no caller passes `wide=true`. |

**Counts:** classes checked 63 · harmless 59 · fixed 4 (`promo__pend`, `promo__pendamt`, `drate--shut`, `docup__note`) · other issues fixed 3 (`promo__tgok/tgbad` styling, UUID in LegacyServicePicker, raw codes in OrgMemberPage).

**Changed files**
- /home/abdurahmon/Desktop/law/components/services/promoCheckout.css
- /home/abdurahmon/Desktop/law/app/globals.css (two small insertions: after `.docup__act`, after `.drate__done em`)
- /home/abdurahmon/Desktop/law/components/services/LegacyServicePicker.tsx
- /home/abdurahmon/Desktop/law/components/org/OrgMemberPage.tsx

eslint on the two changed .tsx files: clean.

## Call center, CRM, support, chat, tasks, internal HRM, live office

| File | Class / element | Verdict | Why / fix (css file:line) |
|---|---|---|---|
| components/live/floorArt.tsx | `lf-bean` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-bench` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-board` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-booth` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-clock` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-counter` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-easel` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-fig` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.); `.lf-fig__torso/leg/arms/ring` styled (globals.css:17535-17543) |
| components/live/floorArt.tsx | `lf-goods` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-holo` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-lockers` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-meet` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-pic` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.); `.lf-pic--1/2 .lf-pic__a/b` + `.lf-pic__frame` style children (globals.css:17513) |
| components/live/floorArt.tsx | `lf-plant` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-printer` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-rack` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-rtable` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-shelf` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-siren` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-sofa` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-stool` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-tv` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-wall-x` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-wall-y` | harmless | SVG `<g>` group wrapper (no default rendering); every drawn child has its own rule in app/globals.css ~16965-17550 (`.lf-shadow`, `.lf-f0..2`, `.lf-m-*` materials etc.) |
| components/live/floorArt.tsx | `lf-fig__hand` | harmless | SVG circle with `fill={look.skin}` attr; animation via `.lf-fig__arms.is-typing .lf-fig__hand--0/1` (globals.css:17538) |
| components/ccx/icons.tsx | `opx-i--chart` | harmless | per-icon hook modifier on the `.opx-i` svg (size inline, strokes via `.opx-i__t/__a`) |
| components/ccx/icons.tsx | `opx-i--clock` | harmless | per-icon hook modifier on the `.opx-i` svg (size inline, strokes via `.opx-i__t/__a`) |
| components/ccx/icons.tsx | `opx-i--console` | harmless | per-icon hook modifier on the `.opx-i` svg (size inline, strokes via `.opx-i__t/__a`) |
| components/ccx/icons.tsx | `opx-i--layers` | harmless | per-icon hook modifier on the `.opx-i` svg (size inline, strokes via `.opx-i__t/__a`) |
| components/ccx/icons.tsx | `opx-i--look` | harmless | per-icon hook modifier on the `.opx-i` svg (size inline, strokes via `.opx-i__t/__a`) |
| components/ccx/icons.tsx | `opx-i--meet` | harmless | per-icon hook modifier on the `.opx-i` svg (size inline, strokes via `.opx-i__t/__a`) |
| components/ccx/icons.tsx | `opx-i--now` | harmless | per-icon hook modifier on the `.opx-i` svg (size inline, strokes via `.opx-i__t/__a`) |
| components/ccx/icons.tsx | `opx-i--pipe` | harmless | per-icon hook modifier on the `.opx-i` svg (size inline, strokes via `.opx-i__t/__a`) |
| components/ccx/icons.tsx | `opx-i--support` | harmless | per-icon hook modifier on the `.opx-i` svg (size inline, strokes via `.opx-i__t/__a`) |
| components/ccx/icons.tsx | `opx-i--tasks` | harmless | per-icon hook modifier on the `.opx-i` svg (size inline, strokes via `.opx-i__t/__a`) |
| components/internal/live/RoomBuilder.tsx | `n` | harmless | bad scan (ternary/map var); the `is-on` quick buttons are styled by `.lfb__quick button(.is-on)` globals.css:20174-20176, type buttons by `.lfb__type` |
| components/internal/live/RoomBuilder.tsx | `null` | harmless | bad scan (ternary/map var); the `is-on` quick buttons are styled by `.lfb__quick button(.is-on)` globals.css:20174-20176, type buttons by `.lfb__type` |
| components/internal/live/RoomBuilder.tsx | `x` | harmless | bad scan (ternary/map var); the `is-on` quick buttons are styled by `.lfb__quick button(.is-on)` globals.css:20174-20176, type buttons by `.lfb__type` |
| components/chat/MeetingLauncher.tsx | `mhist` | harmless | modifier on `.ppanel` (styled); children `.mhist__h/__tabs/__end` styled globals.css:18565-18573 |
| components/chat/MeetingLauncher.tsx | `mhist__body` | harmless | plain tabpanel wrapper div; its list `.mlist` is styled |
| components/chat/MeetingLauncher.tsx | `mnew` | harmless | modifier on `.ppanel`; `.mnew__head/__grid/__side` styled globals.css:19064-19068 |
| components/ccx/profile/WorkPrefs.tsx | `opx-pf-work__bgs` | harmless | extra hook on `.opx-look__bgs` (ccx.css) and styled via `.opx-pf-work .opx-look__bgs` profile.css:500/933 |
| components/ccx/profile/WorkPrefs.tsx | `b` | harmless | bad scan (map variable inside template className) |
| components/ccx/CcxAppearance.tsx | `b` | harmless | bad scan (map variable inside template className) |
| components/ccx/profile/WorkPrefs.tsx | `th` | harmless | bad scan (map variable inside template className) |
| components/ccx/CcxAppearance.tsx | `th` | harmless | bad scan (map variable inside template className) |
| components/ccx/analytics/AnaChart.tsx | `opx-an-hover` | harmless | SVG `<g>` wrapper; children `.opx-an-cross/.opx-an-focus/.opx-an-xpill` styled analytics.css:579-590 |
| components/ccx/analytics/AnaChart.tsx | `opx-an-series` | harmless | SVG `<g data-tone>` wrapper; tone via `.opx-an-plot [data-tone]` analytics.css:17-24; `.opx-an-line/area/dot` styled |
| components/ccx/analytics/AnaChart.tsx | `opx-an-x` | harmless | axis `<text>` styled by `.opx-an-plot text` analytics.css:510 |
| components/ccx/analytics/CcxAnalytics.tsx | `opx-an-agents` | harmless | modifier on styled `.opx-an-card` (also used as aria id) |
| components/ccx/analytics/CcxAnalytics.tsx | `opx-an-split` | harmless | modifier on styled `.opx-an-card`; inner `.opx-an-split__pct/__bar/__keys` styled analytics.css:653-706 |
| components/ccx/crm/detail/leadCards.tsx | `opx-cd-dupcard` | harmless | extra class passed to `<Card>` which always renders `.opx-cd-card` + header (detail.css:63-91); tone via `data-tone` |
| components/ccx/crm/detail/leadCards.tsx | `opx-cd-needcard` | harmless | extra class passed to `<Card>` which always renders `.opx-cd-card` + header (detail.css:63-91); tone via `data-tone` |
| components/ccx/crm/detail/leadCards.tsx | `opx-cd-shist` | harmless | extra class passed to `<Card>` which always renders `.opx-cd-card` + header (detail.css:63-91); tone via `data-tone` |
| components/ccx/crm/detail/convert.tsx | `opx-cd-conv` | harmless | extra class passed to `<Card>` which always renders `.opx-cd-card` + header (detail.css:63-91); tone via `data-tone` |
| components/ccx/crm/detail/leadFeed.tsx | `opx-cd-feed` | harmless | extra class passed to `<Card>` which always renders `.opx-cd-card` + header (detail.css:63-91); tone via `data-tone` |
| components/ccx/crm/sections/CrmLeadX.tsx | `opx-cd-col--main` | harmless | modifier on `.opx-cd-col` (detail.css:42-49) |
| components/ccx/crm/sections/CrmLeadX.tsx | `opx-cd-col--side` | harmless | modifier on `.opx-cd-col` (detail.css:42-49) |
| components/ccx/crm/detail/kit.tsx | `invalid` | harmless | bad scan (prop name in `${error || invalid ? ...}`) |
| components/ccx/crm/detail/kit.tsx | `opx-cd-dt` | harmless | modifier on `.opx-field` (panel.css:646); content is the handmade CrmDateTime |
| components/ccx/crm/sections/CrmCustomersX.tsx | `opx-cd--list` | harmless | modifier on `.opx-cd` (detail.css:1) |
| components/ccx/crm/leads/NewLeadSheet.tsx | `active` | harmless | bad scan (state var); options use `.opx-ld-opt.is-on` |
| components/ccx/crm/leads/NewLeadSheet.tsx | `opx-ld-pick__search` | harmless | hook on styled `.opx-search` (ccx.css:716-755) |
| components/chat/SecureChat.tsx | `mxr__cop` | harmless | modifier on `.mxr__ib` (messenger.css:309-322) |
| components/chat/SecureChat.tsx | `shown` | harmless | bad scan (rating var); stars use `.drate__s.on/.set` |
| components/chat/CallRoom.tsx | `extLeft` | harmless | bad scan (state var) |
| components/chat/CallRoom.tsx | `mtgpip__time` | harmless | text span inside `.mtgpip__meta` (flex, font-size, tabular-nums; globals.css:21055) |
| components/ccx/CcxSearch.tsx | `cur` | harmless | bad scan (index var) |
| components/ccx/CcxSearch.tsx | `opx-search__ic` | harmless | icon sized inline (size=19) inside flex `.opx-search` with gap (ccx.css:716) |
| components/ccx/clients/ClientProfile.tsx | `opx-cl-shim-rows` | harmless | `.opx-shim` skeleton, sized by `.opx-cl-data--wait .opx-shim:last-child` clients.css:767 |
| components/ccx/clients/ClientProfile.tsx | `opx-cl-shim-tabs` | harmless | `.opx-shim` skeleton, sized by `.opx-cl-data--wait .opx-shim:first-child` clients.css:763 |
| components/internal/ShellParts.tsx | `hn-bell` | harmless | modifier on styled `.hn-ib` (globals.css:19281-19284) |
| components/internal/ShellParts.tsx | `hn-notif` | harmless | wrapper inside styled `.hn-pop__layer`; children `.hn-notif__h/__list/__i/__none/__sk` styled globals.css:19295+ |
| components/internal/hrm/HrmModuleScreen.tsx | `hrmc` | harmless | modifier on `.hrm-page` (globals.css:969); `.hrmc-top/-stats/-donut/-types` styled 17429+ |
| components/internal/hrm/HrmModuleScreen.tsx | `true` | harmless | bad scan (boolean in ternary) |
| components/internal/hrm/HrmFieldInput.tsx | `c` | harmless | bad scan (map var); swatches `.hrmf-swatch.on` |
| components/internal/hrm/HrmFieldInput.tsx | `true` | harmless | bad scan (`value === true` in switch ternary; `.stu-sw.on` styled) |
| components/internal/OrgStats.tsx | `h` | harmless | bad scan (map var); `.ost-chipbtn.is-on` and `.ost-seg button.on` styled globals.css:20132-20134 |
| components/support/SupportChat.tsx | `supassist__sum` | harmless | pill styled by `.supassist__meta span` (globals.css:13549) |
| components/support/assist/AssistSupplemental.tsx | `sasst__manual` | harmless | modifier on `.sasst__f` (column flex + input styling, globals.css:13433-13437) |
| components/ccx/CcxStatus.tsx | `s` | harmless | bad scan (map var); `.opx-st__opt.is-on` styled ccx.css:967 |
| components/ccx/urgent/UrgentCandidates.tsx | `want` | harmless | bad scan (number var); `.opx-ug-picked.is-ok` |
| components/internal/InternalPeoplePages.tsx | `k` | harmless | bad scan (map var); selected state `.hrm-sort.is-on` exists |
| components/ccx/now/NowTabs.tsx | `k` | harmless | bad scan (map var); selected state `.opx-ntab.is-on` exists |
| components/ccx/clients/ProfileData.tsx | `k` | harmless | bad scan (map var); selected state `.opx-cl-tab.is-on` exists |
| components/ccx/support/CcxSupport.tsx | `k` | harmless | bad scan (map var); selected state `.opx-sx-tab.is-on` exists |
| components/internal/live/LiveFloor.tsx | `lf-ground` | harmless | SVG `<g>` wrapper for floor; children styled (`.lf-carpet`, `.lf-wood`, `.lf-rug`) |
| components/chat/ChatPage.tsx | `activeId` | harmless | bad scan (state var); `.lxai__item.on` |
| components/chat/CallBackgroundPicker.tsx | `mtg__bgopt--none` | harmless | modifier; base `<Opt>` always renders `.mtg__bgopt` (globals.css:11900-11905) |
| components/chat/AgentAnswer.tsx | `ag-p` | harmless | paragraph styled by `.ag p{margin:0}` + `.ag` font/line-height (globals.css:11952-11953) |
| components/ccx/CcxShell.tsx | `locale` | harmless | bad scan (var); `.opx-me__lang.is-on` |
| components/ccx/clients/CallLog.tsx | `freshId` | harmless | bad scan (var); `.opx-cl-log__row.is-fresh` |
| components/ccx/panel/bits.tsx | `opx-psec--tl` | harmless | modifier; `<Section>` always renders `.opx-psec` (panel.css:375/413) |
| components/ccx/queues/decide/VerifyRecord.tsx | `opx-vrf-diff` | harmless | modifier on styled `.opx-psec` |
| components/ccx/queues/decide/MpComplaintDecide.tsx | `opx-qsel` | harmless | modifier on `.opx-field`, flex inline-styled (VIS); contains handmade `<Select>` |
| components/ccx/queues/decide/VerifyAi.tsx | `opx-vrf-ai` | harmless | modifier on styled `.opx-psec` |
| components/ccx/queues/decide/VerifySuspensions.tsx | `opx-vrf-susp` | harmless | modifier on styled `.opx-psec` |
| components/ccx/now/CcxNow.tsx | `opx-now-msg--calm` | harmless | modifier on styled `.opx-now-msg` (now.css:1265-1320) |
| components/ccx/crm/CcxCrm.tsx | `view` | harmless | bad scan (var); `.opx-crm__tab.is-on/.is-parent` |
| components/ccx/crm/sections/CrmOverviewX.tsx | `opx-ov-solo` | harmless | modifier on `.opx-ov-row` (flex card, leads.css:2159); time/who/go children styled; 3 children lay out fine in flex |
| components/ccx/urgent/CcxUrgent.tsx | `opx-ug-filterbtn` | harmless | modifier on styled `.opx-pbtn` |
| components/ccx/meetings/Timeline.tsx | `state` | harmless | bad scan (var used in data-state/data-tone) |
| components/crm/CrmLiveOffice.tsx | `crm-lo__detail` | harmless | modifier on styled `.crm-card` (crm.css:156) |
| components/crm/rop/RopOperators.tsx | `rop-ops` | harmless | modifier on `.rop-list` (rop.css:95, list-style none, grid gap) |
| components/crm/robots/RobotRuns.tsx | `rb-filters__lead` | harmless | grid-cell wrapper in `.rb-filters` (robots.css:128/147); LeadPicker button is width:100% `.crm-picker` |
| components/tasks/TaskFilePicker.tsx | `ttk-up__kinds` | harmless | inline span inside styled `.ttk-up__t small` (tasks.css:2459) |
| components/tasks/ReasonDialog.tsx | `ttk-form` | harmless | modifier on `.cform` (globals.css:721-725) + `.ttk-scope` |
| components/tasks/TaskForm.tsx | `ttk-form` | harmless | modifier on `.cform` + `.ttk-scope` |
| components/tasks/TaskLightbox.tsx | `ttk-lb__state--err` | harmless | modifier on styled `.ttk-lb__state` (tasks.css:1815-1850) |
| components/internal/EmployeeCard.tsx | `hrm-card` | harmless | modifier on `.hrm-page` |
| components/internal/InternalSelfPages.tsx | `hrm-profile` | harmless | extra class on `<HrmPanel>` (renders `.hrm-panel`, globals.css:1330) |
| components/internal/InternalOperationsPages.tsx | `hrm-clock-panel` | harmless | extra class on `<HrmPanel>` |
| components/internal/InternalShell.tsx | `internal-shell` | harmless | hook next to `.portal` + `.hn-shell` (globals.css:16622/18152) |
| components/internal/feedback/FeedbackDialog.tsx | `x` | harmless | bad scan (map var); `.fb-type--*` / `.fb-type.on` |
| components/internal/hrm/HrmHub.tsx | `hrmc` | harmless | modifier on `.hrm-page` |
| components/internal/live/bits.tsx | `lv-reason` | harmless | modifier on styled `.hrm-form` (globals.css:1077) |
| components/internal/live/CharacterStudio.tsx | `v` | harmless | bad scan (map var); `.chs__sw.is-on`/`.chs__opt.is-on` |
| components/internal/live/LiveOfficePage.tsx | `lv` | harmless | modifier on `.hrm-page`; `.lv-*` children styled globals.css:16396+ |
| components/internal/live/LiveOfficePage.tsx | `s` | harmless | bad scan (map var); `.lv-stat.on` |
| components/internal/ops/TimeOps.tsx | `ops-grid--plan` | harmless | modifier on styled `.ops-grid` table (globals.css:19936-19942) |

#### Other issues found (beyond the scan list)

| File | Class / element | Verdict | Why / fix (css file:line) |
|---|---|---|---|
| components/ccx/crm/detail/leadFeed.tsx:181-196 (`.opx-cd-pop` pane menu, role=menuitemradio) | pane switcher (Timeline / Status history / Calls / SMS) | **unstyled -> fixed** | no checked state: the current pane looked identical to the others. Added `.opx-cd-pop > button[aria-checked="true"]` (teal-soft bg + aqua inset ring + aqua icon, hover) in an appended, commented block at the END of components/ccx/crm/detail/detail.css (after the lead's rules). Uses opx vars defined for both themes (ccx.css:23/94); focus-visible already from detail.css:335. |

#### Extra sweeps done (no further problems)
- Deep scan of template-literal / ternary className strings in every group .tsx (scan-C misses those): only real class names without CSS were `opx-emblem` (svg root, children styled ccx.css:1358-1370), `opx-cd-select` (modifier on `.opx-field`), `mx-tag--st` (modifier; `.mx-tag` + `.mx-tag--done/cancelled…` styled messenger.css:162-183), `ttk-up__th--file`, `ttk-lb__btn--info` (modifiers of styled bases), `hrm-av--t*`/`lf-room--t*`/`lfb__tint--t*` (template prefixes, styled per index). All harmless.
- Every button/link with role=tab/radio/option/menuitemradio, aria-pressed/selected/checked/current in the group was checked for a selected-state rule (own class or parent selector). Only miss: the leadFeed pane menu above (fixed). `.ttk-preset.is-on`, `.crm-picker__list > button[aria-selected]`, `.crm-palette [aria-selected]`, `.opx-tk-pp__opt[data-on]`, `.opx-tk-lb__fi[data-on]`, `.opx-ug-card.is-on`, `.supitem.is-on`, `.mx-row--on`, `.ob-menu__ck`, `.hn-menu__ck` all exist.
- Every class-less `<button>/<ul>/<ol>/<h1-6>/<table>/<fieldset>` was checked for a parent-selector rule (e.g. `.ost-seg button`, `.opx-cd-pop > button`, `.crm-glance h1`, `.crm-palette ul`, `.ob-find button`, `.opx-qcard--link h3`) — all present.
- Native controls: every `<input type=checkbox|radio>` in the group is a visually hidden input behind a handmade switch/radio (`.opx-look__switch input` ccx.css:1759, `.opx-wsw input` WcDecide.css:291, `.opx-sp__row input` WcDecide.css:112, `.opx-choice__opt input` panel.css:604, `.supnew__urgent input` globals.css:12679). No native `<select>`, date or time inputs. One native `<input type=range>` (MpComplaintDecide.tsx:273, refund amount slider) is themed with `accent-color: var(--opx-aqua)`; range is not in the UI-law list, left as is.
- Inline hard-coded colours: only `CrmCustomerPage.tsx:165` (white badge on the coloured `.crm-lhead` hero — correct in both themes).

#### Counts
- Classes checked (scan rows): 120
- Harmless: 120
- Fixed (scan list): 0
- Other issues fixed: 1 (leadFeed pane menu checked state)

#### Changed files
- components/ccx/crm/detail/detail.css (appended block "Audit group C" at end of file; no existing line edited)

## Marketplace, landing, legal, register, shared UI, public routes

| File | Class / element | Verdict | Why / fix (css file:line) |
|---|---|---|---|
| components/marketplace/order/CancellationRequest.tsx | `mcr` | harmless | Hook class on `SxPanel` (sx-core.css styles `.sx-panel`, imported by OrderDetailPage.tsx:3). Its children `.mcr-group/-quote/-meta/-actions/...` are styled in deal.css (imported at :3). |
| components/marketplace/order/CancellationRequest.tsx | `mcr-resolved` | harmless | State modifier on the same SxPanel; the panel look comes from `.sx-panel`, and nothing extra is needed. |
| components/marketplace/order/CancellationRequest.tsx | `mcr-review` | harmless | State modifier on SxPanel, same as above. |
| components/TimePicker.tsx | `h` | harmless (scan noise) | The variable `h` in `{ h, m }`, not a class. |
| components/TimePicker.tsx | `m` | harmless (scan noise) | The variable `m`, not a class. |
| components/register/RegisterFlow.tsx | `advPos` | harmless (scan noise) | A JS variable inside the template className `rf__stepper-i${i === advPos ? " on" : ""}`. |
| components/register/RegisterFlow.tsx | `rf__tenure` | harmless | Modifier on `.rf__benefit`, fully styled at globals.css:3338-3342 (card, bold title with inline icon gap:7px, 16px svg). The dark-border issue is listed below. |
| components/ui/ScrollArrows.tsx | `sarr__b--prev` | harmless | `.sarr__b` styled at globals.css:17914-17918; placement comes from `.sarr__rail{justify-content:space-between}` (:17913). |
| components/ui/ScrollArrows.tsx | `sarr__b--next` | harmless | Same as above. |
| components/marketplace/NearbySellers.tsx | `mmman__ic` (+ its parent `.mmman__head`, which had only a `b` descendant rule) | **unstyled -> fixed** | The `IconTarget` svg has no width/height. Global `svg{display:block;max-width:100%}` (globals.css:81) blew it up to the full panel width and pushed the title under it. Fixed at components/marketplace/map/mapPanel.css:150-153: the head is a flex row with gap 10px; the icon sits in a 32px rounded tint tile using `--mm-tint`/`--mm-acc` with `--dk-*` fallbacks (theme-aware); svg is 17px; the title wraps with `overflow-wrap:anywhere`. |
| components/marketplace/NearbySellers.tsx | `mmnote--login` | harmless | Modifier on `.mmnote`, fully styled at mapPanel.css:118-130 (`>svg` 16px, `__txt`, `__acts`, `__act--main`). |
| components/marketplace/order/WarrantyPanel.tsx | `mcr` | harmless | SxPanel hook. `mcr-meta`/`mcr-quote` children are styled in deal.css (imported at :3). |
| components/marketplace/order/WarrantyPanel.tsx | `mcr-review` | harmless | SxPanel state modifier. |
| components/marketplace/order/OrderDetailPage.tsx | `mod-sec` | harmless | Always paired with `.mod-sec--legacy` (order.css). Section anchors are also styled through `.mod .mod__main > [id]` (order.css:278). |
| components/marketplace/order/OrderDetailPage.tsx | `mod-sk__aside` | harmless | Second grid column of the skeleton `.mod__grid` (order.css:255). Its only child `.mod-sk__panel` is styled (order.css:420-424). |
| components/marketplace/order/SecondOpinion.tsx | `mso` | harmless (scan noise) | No element uses bare `mso`. The `mso-card*` classes are styled in side.css:47-90 (imported at :3). |
| components/marketplace/order/SecondOpinion.tsx | `mso-card__verified` | harmless | Hook on `sx-pill` (sx-core.css, `data-tone="published"`). Placed in the flex-column card at side.css:47. |
| components/marketplace/order/OrderDocuments.tsx | `mdoc` | harmless | SxPanel hook. The wrapper `.mdoc-wrap` and the children `__body/__icon/__lead/__open` are styled in side.css:2-150. |
| components/marketplace/order/OrderDocuments.tsx | `mdoc-chip` | harmless | Hook on `sx-pill` with data-tone/data-size, styled by sx-core.css. |
| components/marketplace/map/NavigatorBlock.tsx | `mnv__dist--route` | harmless | Modifier on `.mnv__dist`, styled at sellerDetail.css:55-58 (flex baseline, `b` 1.32rem). |
| components/marketplace/map/NavigatorBlock.tsx | `yandexFirst` | harmless (scan noise) | A JS boolean inside a template className. |
| app/[locale]/legal/account-deletion/page.tsx | `legal` | harmless | Block root next to `.sec`. `legal__in/__body/__act/...` are styled in globals.css. |
| components/legal/LegalDocsFallback.tsx | `legal` | harmless | Same block root. |
| components/legal/LegalDocument.tsx | `legal` | harmless | Same block root. |
| app/[locale]/legal/licenses/page.tsx | `legal` | harmless | Same block root, with `.lic` (licenses.css, imported at :4). |
| components/legal/LegalDocList.tsx | `legal` | harmless | Same block root. |
| components/VerifiedBadge.tsx | `vbadge__t` | harmless | Text span inside the inline-flex `.vbadge` (globals.css:12366, gap 5px, font/color inherited). |
| components/sections/LawyersSection.tsx | `advcard__badge--promo` | harmless | Base `.advcard__badge` is fully styled (globals.css:324, lawyers.css:337). The promo badge uses the base accent pill. |
| components/sections/AiSection.tsx | `rvx` | harmless (JS hook) | Selector of the reveal observer in components/RevealOnScroll.tsx:7. |
| components/register/ProfilePreview.tsx | `ppv__id` | harmless | Block column inside the flex `.ppv__head` (globals.css:1955). Its children `__name/__spec/__meta` are styled. |
| components/landing/LandingManifesto.tsx | `at` | harmless (scan noise) | A state variable `at`, not a class. |
| components/remoteAssist/RaMarks.tsx | `ra-mk__ptr` | harmless | An svg `<g>` positioned with the transform attribute. Its circles `.ra-mk__halo/.ra-mk__dot` are styled (remoteAssist.css:117-118). |
| components/landing/LandingWarranty.tsx | `lh-war__track` | harmless (JS-sized) | Scroll-distance wrapper. Its height is set inline by motion/hold.ts:24, and `.lh-war__pin` inside it is styled. |
| components/landing/LandingHero.tsx | `lh-hero__tags` | harmless | Always paired with `.hero__tags`, styled at globals.css:193 and hero.css:169-189 (`.lh-hero .hero__tags`). |
| components/landing/LandingProblem.tsx | `lh-prob__track` | harmless (JS-sized) | Same hold() track pattern (motion/hold.ts). |
| components/landing/LandingSubscription.tsx | `lh-sub__track` | harmless (JS-sized) | Same hold() track pattern. |
| components/marketplace/PrivateChatButton.tsx | `mk-side__alt` | harmless | Hook on `btn btn--line btn--sm` (globals.css `.btn`, `.btn svg` 18px). |
| components/marketplace/SupplementalDialog.tsx | `mks` | harmless | Paired with styled `.mk-act` (globals.css:11470). `.mks__rules` is styled. |
| components/marketplace/PurchaseDialog.tsx | `mk-receipt__note` | harmless | The `<p>` is styled by `.mk-receipt p` (globals.css:11327). |
| components/marketplace/MarketplacePreview.tsx | `mkpv--wait` | harmless | Empty aria-busy placeholder. `.mkpv` gives it min-height:100vh (globals.css:13954). |
| components/marketplace/PublicAchievements.tsx | `mk-ach` | harmless | Paired with `.mk-panel` (globals.css:11112). The `mk-ach__*` children are in checkout.css, which SellerProfile.tsx:38 (the only importer of this component) loads. |
| components/marketplace/IntakeAttachments.tsx | `mk-att__voice` | harmless | The `<li>` is styled by `.mk-att__list li`, `li>svg`, `audio`, `small` and `button` (globals.css:21010-21018). |
| components/marketplace/PriceOptions.tsx | `qErr` | harmless (scan noise) | A state variable. The native checkbox in this file (`.pxo__opt input`) is visually hidden (globals.css:11220) behind the handmade `.pxo__box`, with focus-visible and is-on states, so it does not show the browser look. |
| components/marketplace/SellerProfile.tsx | `mk-prof` | harmless | Paired with `.mk`. The `mk-prof__*` children are styled in globals.css. |
| components/marketplace/OrderExtras.tsx | `remain` | harmless (scan noise) | A local variable. |
| components/marketplace/order/OrderFacts.tsx | `mod-facts` | harmless | SxPanel hook. Children `__row/__who/__ava/__list` are styled in order.css and orderLook.css. |
| components/marketplace/order/SellerAssignment.tsx | `mcr` | harmless | SxPanel hook with `.mod-assign`. `mcr-quote/-meta` are styled in deal.css. |
| components/marketplace/order/OrderPricing.tsx | `mod-price--client` | harmless | Modifier. `.mod .mod-price ...` is styled in pricing.css (imported at :3). |
| components/marketplace/order/OrderActions.tsx | `mod-actions` | harmless | SxPanel hook. `__list/__calls` are styled in order.css and orderLook.css. |
| components/marketplace/order/NegotiationPanel.tsx | `mng` | harmless (scan noise) | No bare `mng` element. `mng-chip/-expiry/...` are styled in deal.css. |
| components/marketplace/order/GroupPromotion.tsx | `msog-dlg__blocked` | harmless | Hook on `SxNote tone="warn"` (sx-core). Spaced by the parent `.msog-dlg{display:grid;gap:16px}` (secondOpinion.css:97). |
| components/marketplace/order/OrderHeader.tsx | `mod-head__rating` | harmless | Passed to RatingCountdown, whose root is `.mko__left.mko-rc` (globals.css:11399-11401). |
| components/marketplace/order/StartWork.tsx | `mod-start__confirm` | harmless (query hook) | `initialFocus=".mod-start__confirm"` targets it. The button is a styled `SxButton`. |
| components/marketplace/map/SellersYandexMap.tsx | `ymk-stage--wait` | harmless | `.ymk-stage` is styled (sellersMap.css:6-8). The veil and spinner children are styled. |
| components/marketplace/runtime/FactorList.tsx | `mkrt-fx` | harmless | Wrapper. `__base/__list/__row/__t` are styled in runtime.css:57-62 (imported at :8). |
| components/marketplace/runtime/RequirementsNote.tsx | `mkrt-req` | harmless | Wrapper. `__chips` is styled in runtime.css:64-66. |
| components/marketplace/runtime/ChecklistPreview.tsx | `mkrt-ck` (+ `mkrt-ck--{tone}`) | harmless | Wrapper. `__list/__t/__req/__proof` are styled in runtime.css:41-46 and :96. |
| components/marketplace/runtime/UsageSteps.tsx | `mkrt-ck` | harmless | Same wrapper as above. |
| **Other issues** | | | |
| components/register/RegisterFlow.tsx (`.rf__benefit` / `.rf__tenure` / `rf__next` cards) | light-only border color | **fixed** | The border was hard-coded `#bcd4ff` while the background `--b50` turns dark navy in dark theme, so a glaring light-blue outline showed in dark mode. Now `border:1px solid var(--dk-bd-blue, #bcd4ff)` (globals.css:3338). Light theme is unchanged. |
| Group D (215 .tsx files) | native select / checkbox / radio / date / time | checked | No native `<select>` or date/time input. The only native checkbox is PriceOptions `.pxo__opt input`, which is visually hidden behind the handmade box (see the qErr row). CookieConsent uses the handmade `CheckBox`. |
| Group D | tabs / segments without a selected state | checked | Every `aria-pressed`/`role=tab` control has a selected rule: mk-seg__b, mknb-mode__b, mksv__cats, `.switch`, ra-tabs `.on`, svcard/chip/lsp__opt `.on`, msog-chip, mk-pay__opt, mseg. |
| Group D | classes styled only as an ancestor (subject never styled) | checked | Extra pass with my own script. Hits: mk-buy__main, mkc__blocked/pending, mko__ratec, ckc-cat__cbx, tl__c, mck-panel, mod-rules, mrs-tl, mnv__modes, mod-price, lh-prob__h3--split, rvseq, ymk--full, ymk-stage--pick, ra-mk__draft, lic. All are wrappers whose children carry the look. Only `.mmman__head` was broken, and it is fixed above. |

**Counts:** 58 classes checked / 57 harmless / 1 fixed (`mmman__ic` + `mmman__head`) / 1 other issue fixed (`.rf__benefit` dark-theme border).

**Changed files**
- components/marketplace/map/mapPanel.css (lines 150-153)
- app/globals.css (line 3338)

No .tsx was changed, so there was nothing to eslint.
