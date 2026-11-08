# LexGo — permission actions audit (2026-11-08)

## Report

**Owner law:** if the user has no permission for an action, the action is not shown at all. Every role was audited: superadmin, admin and limited staff, ROP/sales, call-center operator, navbatchi yurist (call_center_lawyer), support, internal HRM staff and managers, Studio roles, client, yurist, advokat, advokat_tashkiloti/org owner, seller.

| Area | Actions audited | Hidden / fixed | Already OK | Backend gaps |
|---|---:|---:|---:|---:|
| Admin | 188 | 73 | 112 | 15 |
| Call center / navbatchi / support | 225 | 69 | 154 | 7 |
| CRM / ROP | 113 | 18 | 95 | 7 |
| Studio | 78 | 42 | 36 | 6 |
| Portal (client, yurist, advokat, org, seller) | 207 | 104 | 102 | 12 |
| Internal HRM / team tasks / live office | 158 | 111 | 46 | 11 |
| Shared (chat, calls, copilot, guide/AI navigation, notifications, marketplace, public) | 127 | 64 | 60 | 8 |
| **Total** | **1096** | **481** | **605** | **66** |

Per-area counts come from the area tables below. A few rows are counted in two columns: an action that was already gated but now also leaves the screen after a 403 is both "OK" and "fixed". On top of these, the lead fixed 9 more actions while merging (call-center console Leads/Clients tabs, search box and no-access state; permission filter on notification links in 3 places; the seller "New orders" KPI link and drill link). Backend gaps are in `docs/LEXGO_FRONTEND_QUESTIONS_PERMISSIONS_2026_11_08.md`. Until the backend answers, those actions are shown and leave the screen after their first 403.

**Behaviour changes worth knowing:**
- Seller pages locked while a seller waits for approval (or blocked by a cabinet `available_actions` flag) are no longer shown with a lock. They are gone from the sidebar, desktop apps and header search.
- Editor sources that are unavailable are hidden rather than greyed. An earlier spec asked for greyed; the owner law wins.
- In the call center, "Assign next seller" needs `orders.manage` (Q D1).
- Internal messages compose needs `internal_hr.manage` until the directory exposes `user_id` (HRM Q9).
- The Superadvokat action is shown only to the primary superadmin (`can_set_superadvokat`).

**Checks:**
- `tsc --noEmit`: clean.
- eslint: clean on all changed files.
- vitest: 58 files, 598 tests passing, including the new `tests/unit/permissions.test.ts` (13 tests for `can()` and the 403 hook).
- Playwright full suite, 360 tests: 350 passed, 5 skipped, and 5 failed in `market-map.spec.ts`. Those 5 fail the same way on the pre-change commit, so they are not caused by this work.
- New `tests/e2e/permissions-hide.spec.ts`: 13 tests, all passing. They cover six areas with and without each permission, plus the 403 safety net.
- Updated `tests/e2e/superadvokat.spec.ts` to match the intended change.

**Screenshots:** `/tmp/lexgo-perms/before/` (the pre-change commit) and `/tmp/lexgo-perms/after/` hold the same 18 file names. They cover 5 restricted roles: call-center operator with only `callcenter.access`, a limited admin with only `users.manage`, a ROP with view-only CRM, an internal employee without `internal_hr.manage`, and an advokat. Regenerate them with `tests/e2e/permissions-shots.spec.ts` (`SHOTS_DIR=…`). That spec is in `testIgnore`, so run it with a config that clears `testIgnore`.

**Commits:** `519d1b50` Hide every action the user has no permission for (code, tests, this report, questions file), plus a follow-up commit that adds this hash.

## How it works now (central layer)

| Piece | Where | What it does |
|---|---|---|
| `can(session, perm \| perm[], { all?, roles? })` | `lib/permissions.ts` | The one gate. Signed out → false; superadmin and the backend `*` wildcard → true; any-of by default, all-of with `all`; `roles` only for roles a contract names as granting the action. Codes come from the session (`/auth/login`, `/auth/me`) and the contracts in `docs/` — none invented. |
| `useCan()` | `lib/useCan.ts` | Hook form for components; re-renders when the session (its permissions) changes. |
| Shared codes | `lib/permissions.ts` `REVIEW_PERMISSION` | `marketplace.experience.review` (verification queues) — no longer imported from a heavy screen. |
| Existing helpers routed through `can()` | `lib/auth.tsx` (`canMakeCalls`, `sessionRoles`/`isCallCenterUser` via `rolesOf`/`hasRole`), `lib/services/leads.ts` `canManageLeads`, `lib/services/internalHrm.ts` `canInternal`, `components/admin/studio/StepMeta.tsx` `useStudioPerms`, `lib/useStaffName.ts`, admin overview/services/call-center pages, `PortalShell` team tasks, meetings history, studio reassign | Same answers as before, one implementation. `crmCan` keeps reading `GET /crm/meta` permissions (the CRM's own contract). |
| 403 safety net | `lib/http.ts` `setForbiddenHandler` + `lib/auth.tsx` `refreshPermissions` | Any 403 that is not a page denial (`role_page_access_denied`, handled by role navigation) re-reads `/auth/me` (once per 10 s burst). If roles/permissions changed, every `can()`-gated action leaves the screen and one notice shows: `common.accessChanged` ("Your access has changed — actions you can no longer use are hidden."). Screens also drop the refused action locally (per-area rows "after-click 403 only" → fixed). Studio re-reads `GET /studio/constructors` roles on a Studio 403 (`components/admin/studio/sx/denied.ts`). |
| Empty containers | `components/ui/Menu.tsx`, call-center console, per-screen toolbars | A menu whose items were all filtered renders nothing (no empty "⋯"); the duty-desk console filters Leads/Clients tabs up front and shows one calm empty state when no section is left; per-area rows list removed empty toolbars/columns. |
| Guide tours, AI navigation, notification links | `lib/guide/access.ts`, `lib/guide/pages/index.ts`, `lib/notifications.ts` `notifLink(..., allows)` | Tours/AI targets for pages and actions the account can't use are dropped; notification links to pages the account can't open are not offered (callers pass `can`). |

Lead follow-ups done while merging (not in the area tables): call-center console tab filtering + no-access state (`components/admin/CallCenterConsole.tsx`, `app/[locale]/admin/call-center/page.tsx`); `notifLink` permission filter wired in `components/portal/NotificationsPanel.tsx`, `components/portal/desk/apps/NotificationsApp.tsx`, `components/internal/ShellParts.tsx`; UI-law fixes found during the audit — audit trail no longer shows raw user/target UUIDs (`app/[locale]/admin/audit-trail/page.tsx`, names via `StaffPerson`), package "misconfigured" banners no longer print raw service codes (`messages/*.json`).

Also from the e2e pass: the seller dashboard "New orders" KPI card stays as a read-only count (no link, no arrow) and the dashboard drill loses its "go to orders" link when the cabinet's `available_actions.accept_orders` is false, matching the hidden sidebar row (`components/portal/dash/SellerHome.tsx`, `components/portal/SellerDashboard.tsx`).

## Admin (superadmin / admin / limited staff pages)

| Screen | Action | Endpoint | Permission / rule | Before | Fix |
|---|---|---|---|---|---|
| Overview (/admin, full-admin page) | Refresh dashboard | GET /admin/dashboard, /admin/ceo-dashboard, quality (read) | page access (full admin) | gated OK | none needed |
| Overview | Demo-mode toggle | local only | — | gated OK | none needed |
| Overview | "Seed demo data" button + confirm | POST /admin/demo-data/seed | no code documented; staging-only (useDemoTools) | after-click 403 only | app/[locale]/admin/page.tsx:182,196,441 — 403 keeps the message and removes the button (seedDenied); backend gap QA1 |
| Overview | Attention: new seller requests (link + count fetch) | GET /admin/seller-requests → /admin/register-requests | users.manage (NAV) | shown ungated (roles:["admin"] let an admin without users.manage see it; page then bounced, fetch 403) | app/[locale]/admin/page.tsx:69-85 — exact NAV code, no admin-role bypass |
| Overview | Attention: unpaid payouts (link + count fetch) | GET /admin/payouts → /admin/payouts | payments.manage (NAV) | shown ungated (same admin-role bypass) | app/[locale]/admin/page.tsx:69-85 |
| Overview | Attention: payments / overdue tasks / quality (open drill) | read-only drill | page access | gated OK | none needed |
| Overview | Drill link "Go to CEO" | /admin/ceo | full-admin page (no NAV perm) | hidden for everyone (PERMS.ceo "" → false, bug) | app/[locale]/admin/page.tsx:73 — shown to full admins (the only accounts on this page) |
| Overview | Drill links "Go to pipeline / leads" | /admin/crm/leads | crm.leads.view (NAV + CRM sections) | shown with wrong code (leads.manage + admin role) | app/[locale]/admin/page.tsx:75 — crm.leads.view |
| Overview | Services chip link | /admin/services | services.manage (NAV) | gated with admin-role bypass | app/[locale]/admin/page.tsx:78 — exact code; chip stays as plain text otherwise |
| Overview | Panel "details" buttons, activity tabs, drill-down "show all" | read-only | page access | gated OK | none needed |
| CEO (/admin/ceo, full-admin page) | Actions menu → Refresh | read | page access | gated OK | none needed |
| CEO | Actions menu → Export Excel | GET CEO export (downloadCeoExport) | page access (full admin); no separate code documented | after-click 403 only | app/[locale]/admin/ceo/page.tsx:381-383,689-704 — 403 keeps message, entry leaves the menu |
| CEO | Funnel drill link "Go to pipeline" | /admin/crm/leads | crm.leads.view | shown ungated | app/[locale]/admin/ceo/page.tsx:596 — canDo("crm.leads.view") |
| CEO | Jump nav, date range, clear range, table view, channel sort/expand | local | — | gated OK | none needed |
| Profile (/admin/profile) | Edit own profile (name, email, photo) | PATCH own profile (updateClientProfile) | own record — always allowed | gated OK | none needed |
| /admin/dashboard, /admin/leads, /admin/plans, layout, loading | redirects / shell only | — | — | gated OK | none needed |
| Call analytics (leads.manage) | Stat tiles → drill | read | page | gated OK | none needed |
| Call analytics | Drill link "Go to call center" | /admin/call-center | NAV leads.manage OR callcenter.access — page already requires leads.manage | gated OK | none needed |
| Retention (leads.manage, hidden page) | "Win back" per at-risk client | POST /retention/queue | no code documented (page needs leads.manage) | after-click 403 only | app/[locale]/admin/retention/page.tsx:37,52,186-188 — 403 keeps message and removes the button; backend gap QA2 |
| Meetings (/admin/meetings) | MeetingLauncher actions | /calls, /admin/calls | meetings.manage / leads.manage | other area (components/chat/MeetingLauncher.tsx) | not in ADMIN slice |
| Team tasks (/admin/team-tasks) | TeamTasksPage actions | /tasks | tasks.view etc. | other area (components/tasks/TeamTasksPage) | not in ADMIN slice |
| B2B (b2b.manage) | "Add client" button + form | POST /b2b/clients, PATCH /b2b/clients/{id} | b2b.manage (page NAV) | gated OK (page) / 403 left button on screen | app/[locale]/admin/b2b/page.tsx:41-44,55,120-127 — 403 keeps message, add leaves |
| B2B | Stage select per client | PATCH /b2b/clients/{id} | b2b.manage | gated OK (page) but 403 swallowed silently | app/[locale]/admin/b2b/page.tsx:46-52,88-94 — 403 now shows the message and the stage becomes a read-only label |
| B2B | Invoice / Contract / Monthly report buttons | POST /b2b/clients/{id}/invoice, /contract, GET /monthly-report | b2b.manage | gated OK (page) / after-click 403 kept buttons | app/[locale]/admin/b2b/page.tsx:72-80,99,175 — 403 hides the document actions |
| B2B | Download generated PDF | GET file_url | same | gated OK | none needed |
| Bootstrap (/admin/bootstrap) | Create first superadmin | POST bootstrap (phone + bootstrap_key) | bootstrap key, not a session code; AdminShell bootstrapOk | gated OK | none needed |
| Test OTPs (/admin/test-otps) | read-only list | GET /admin/test-otps | full admin + demo routes on | gated OK | none needed |
| Integrations (/admin/integrations) | read-only overview | GET integrations overview | full admin | gated OK | none needed |
| AdminShell | Sidebar items + Ctrl+K page search | — | NAV perms + /me/navigation | gated OK | none needed (lead's nav work) |
| AdminShell | HRM header link | /internal | hasInternalAccess (canInternal) | gated OK | none needed |
| AdminShell | Portal link, logout, theme, language, feedback, own profile | own session | — | gated OK | none needed |
| AdminShell | AI assistant launcher | — | — | other area (components/portal/AiSystemAssistant) | not in ADMIN slice |
| Business calendar card (on /admin/policies) | Add holiday (date + title + Add) | POST /admin/calendar/holidays | cases.manage (service comment backend.ts:4578) | shown ungated | components/admin/BusinessCalendarCard.tsx:45-51,122-133 — canDo("cases.manage"); 403 also hides |
| Business calendar card | Remove holiday (× on chip) | DELETE /admin/calendar/holidays/{day} | cases.manage | shown ungated | components/admin/BusinessCalendarCard.tsx:122-124 — hidden without it, chip padding balanced |
| Business calendar card | Simulate deadline | GET /calendar/business-hours?at= | read | gated OK | none needed |
| Rating policy card (on /admin/reviews) | "Edit in Studio" link | /admin/studio/c/{code} | Studio registry for this account (useStudioCatalog.allow) | gated OK | none needed |
| Quality complaints (call-center page) | Refresh / open complaint / status filter | GET /call-center/quality-complaints | list 403 → whole panel hidden | gated OK | none needed |
| Quality complaints | Ruling form (rework / reject / resolve + note + save) | POST /call-center/quality-complaints/{id}/resolve | no separate code documented; record status lock mirrored (settled) | after-click 403 only | components/admin/QualityComplaints.tsx:79,203,350-355,458 — 403 keeps message; form + footer leave for the session; backend gap QA3 |
| Quality complaints | "Open marketplace complaints" link | /admin/call-center?tab=mpComplaints | console tab gate (other area) | gated OK | none needed |
| Call-center console | Tabs (cockpit…clients) | per-tab endpoints | review tabs need marketplace.experience.review (canReview); other tabs drop on 403/empty via report() | gated OK | none needed |
| Call-center console | Client search | read | — | gated OK | none needed |
| Urgent advocate queue (call-center, ccx) | Whole board | GET /call-center/urgent-advokat/requests | 401/403 → board not rendered | gated OK | none needed |
| Urgent queue | Claim (row + drawer primary) | POST …/requests/{id}/claim | object: open_pool / next_statuses incl. "claimed" | after-click 403 only | components/admin/UrgentAdvocateQueue.tsx:432-436,453,680-683,1035 — 403 removes claim for that record (row falls back to "Details"); backend gap QA4 |
| Urgent queue | Admin take-over | POST …/claim on someone else's claim | role admin/superadmin (existing code) | gated OK | none needed |
| Urgent queue | Join meeting | POST join call | status meeting_active | gated OK | none needed |
| Urgent queue | Start meeting (row button, row menu, drawer) | POST …/{id}/meeting | object: working status, not chat | after-click 403 only | components/admin/UrgentAdvocateQueue.tsx:519,700,1005,1047 — 403 removes it for that record |
| Urgent queue | Open secure chat | link to /portal/chat/{room} | room exists on record | gated OK | none needed |
| Urgent queue | Transfer (row menu + drawer) | POST …/{id}/transfer | object: working status | after-click 403 only | components/admin/UrgentAdvocateQueue.tsx:703,987,1050 — 403 removes it for that record; backend gap QA4 |
| Urgent queue | Move status (row menu + drawer) | PATCH …/{id}/status | object: lifecycle.next_statuses | gated OK (status) / 403 kept it | components/admin/UrgentAdvocateQueue.tsx:704,987,1051 |
| Urgent queue | Cancel (row menu + drawer) | POST …/{id}/cancel | object: not finished | after-click 403 only | components/admin/UrgentAdvocateQueue.tsx:706,987,1052 |
| Urgent queue | Complete with summary | POST …/{id}/complete | object: working status | after-click 403 only | components/admin/UrgentAdvocateQueue.tsx:987,1049 |
| Urgent queue | Assign advocate panel (group) | POST …/{id}/assign-group | object: group service, not finished | after-click 403 only | components/admin/UrgentAdvocateQueue.tsx:1053,1259,2120 — 403 removes the panel for that record |
| Lead cards / menus (components/admin/leads, used by LeadDrawer + unrouted LegacyPipeline) | Move / Lost / Delete / Call / Video in "⋯" menu | PATCH/DELETE /admin/leads/{id}, calls | caller passes canX (leads.manage via canManageLeads, canMakeCalls) | shown disabled (a string reason rendered a disabled entry) | components/admin/leads/LeadMenu.tsx:61-66,158-216 — a refusal now hides the entry; separators tidied; empty menu → no "⋯" trigger (line ~228) |
| Lead cards / menus | Assign operator submenu | PATCH /admin/leads/{id} + GET /admin/users | leads.manage + users.manage (operator directory) | shown disabled ("operators unavailable" row when directory 403) | components/admin/leads/LeadMenu.tsx:103-105,175 — directory 403 leaves only "unassign" (if assigned), else the entry is gone |
| Lead stage / operator pickers (LeadStageMenu, LeadOperatorMenu) | Change stage / operator button | PATCH /admin/leads/{id} | caller's canMove / canAssign | shown disabled with reason text | components/admin/leads/LeadMenu.tsx:268-290,316-336 — read-only label instead of a disabled button |
| Lead card quick call / video / operator pill | tel: link, meeting, assign | — | canCall / canVideo (canMakeCalls) / canAssign | gated OK (already hidden on refusal) | none needed |
| Lead meeting hook (useLeadMeeting) | Start video with lead | POST /calls | canMakeCalls | gated OK | none needed |
| Stage tabs / Lead filter bar / Dash filter bar | filters only | — | — | gated OK | none needed |
| Lost-reason dialog | Confirm lost | via caller (LegacyPipeline, unrouted) | caller's canMove | gated OK (caller) | none needed |
| StatDrillModal / StatTile / charts / AdminBits / Modal / navIcons / overview viz | presentational; links come from callers (fixed above) | — | — | gated OK | none needed |
| Services (/admin/services) | Replace professional catalog | POST /admin/services/catalog/replace-professional | services.manage (admin per existing code) | gated OK | + 403 closes dialog and removes all catalog writes (`denied`) — app/[locale]/admin/services/page.tsx:108-109,222-224,287 |
| Services | New service button + create form | POST /admin/services | services.manage | gated OK (page gate only) | rendered only with canManage; 403 closes form + removes writes — services/page.tsx:329,419,447-452 |
| Services | Row: edit | PATCH /admin/services/{id} | services.manage | gated OK (page gate only) | row actions only with canManage (no empty action column) — services/page.tsx:382 |
| Services | Row: soft delete | DELETE /admin/services/{id} | services.manage | gated OK (page gate only); 403 message only | hidden without canManage; 403 closes confirm + removes writes — services/page.tsx:246-248,382,480 |
| Services | Row: reactivate archived | PATCH /admin/services/{id} {is_active:true} | services.manage | gated OK (page gate only); 403 message only | hidden without canManage; 403 removes writes — services/page.tsx:260-261,382 |
| Services | Edit modal: save | PATCH /admin/services/{id} | services.manage | after-click 403 only (message) | 403 → modal closes, page drops edit actions (`onForbidden`) — components/admin/ServiceEditModal.tsx:280; services/page.tsx:468-476 |
| Services | Edit modal: attach/replace DOCX template | POST /admin/services/{id}/document-template | not documented (page: services.manage; creates a document template) | after-click 403 only (message) | 403 → section leaves the form for the visit — ServiceEditModal.tsx:152,368,433; backend gap QB1 |
| Services | "Edit categories in Studio" link (K01) | Studio /admin/studio/c/K01 | Studio access (registry user roles) | shown ungated (catalog presence only) | shown only with useStudioAccess().any — services/page.tsx:100-103 |
| Templates (/admin/templates) | Import DOCX / ZIP | POST /admin/document-templates/import-docx, /import-zip | templates.manage | gated OK (page gate); 403 message only | 403 → modal closes, import/new/toggle/delete leave (`deny`) — app/[locale]/admin/templates/page.tsx:39-48,105,204; components/admin/TemplateImport.tsx (onForbidden) |
| Templates | New Word template (blank / from file) | POST /admin/document-templates/editor-drafts(/upload) | templates.manage | gated OK (page gate); 403 message only | 403 → same `deny` — templates/page.tsx:105,208-210; components/admin/templateEditor/CreateDraftModal.tsx:169 |
| Templates | AI action "open create modal" | (opens create modal) | templates.manage | gated OK | no-op once denied — templates/page.tsx:56-58 |
| Templates | Row: open editor | GET /admin/document-templates/{id}/editor | templates.manage | gated OK | none needed |
| Templates | Row: activate / deactivate | PATCH /admin/document-templates/{id} | templates.manage | gated OK (page gate) | 403 → `deny` — templates/page.tsx:177 |
| Templates | Row: delete (+ confirm) | DELETE /admin/document-templates/{id} | templates.manage | gated OK (page gate) | 403 → `deny`, confirm closes — templates/page.tsx:190 |
| Template editor (/admin/document-templates/{id}/editor) | Autosave draft / "retry save" chip | PUT .../editor/draft | templates.manage | gated OK | none needed |
| Template editor | Replace source file | POST .../editor/source-file | templates.manage | gated OK | none needed |
| Template editor | View file | GET .../editor file | templates.manage | gated OK | none needed |
| Template editor | Preview with answers | POST .../editor/preview | templates.manage | gated OK | none needed |
| Template editor | Versions list / restore | GET .../versions, POST .../versions/{id}/restore | templates.manage | gated OK | none needed |
| Template editor | Validate | POST .../editor/validate | templates.manage | gated OK | none needed |
| Template editor | Publish (+ activate checkbox) | POST .../editor/publish | templates.manage (disabled only for validation state) | gated OK | none needed |
| Template editor | Conflict: take server / keep mine | GET .../editor, PUT draft | templates.manage | gated OK | none needed |
| Template editor | Navigator/Inspector: add/rename/move/delete section & field, insert field, create missing field, delete-section confirm | saved through PUT .../editor/draft | templates.manage | gated OK | none needed |
| Document settings (/admin/document-settings) | New version (editor save) | POST /admin/document-service-settings | templates.manage (page) | gated OK; load-403 already hides page | 403 on save → editor closes, notice, page read-only — components/admin/docsettings/DocumentSettingsPage.tsx:246,465,533,597-608 |
| Document settings | Publish draft version | POST /admin/document-service-settings/{id}/publish | templates.manage (page) | gated OK | 403 → read-only (buttons leave; empty action row not rendered) — DocumentSettingsPage.tsx:503,650 |
| Document settings | Roll back to version | POST /admin/document-service-settings/{id}/rollback | templates.manage (page) | gated OK | same as publish — DocumentSettingsPage.tsx:503,650 |
| Tariffs (/admin/tariffs) | "Promotions" link | page /admin/promotions | ads.manage or subscriptions.manage | gated OK (tariffs needs subscriptions.manage) | none needed |
| Tariffs | "New tariff" (header + empty-state CTA) | Studio /admin/studio/o/new?new=K17 | Studio editor (studio canEdit) | shown ungated (catalog presence only) | only with useStudioAccess().canEdit — components/admin/plans/TariffsAdmin.tsx:41-43 |
| Tariffs | "Benefits in Studio" link | Studio /admin/studio/c/K17 | Studio access | shown ungated | only with useStudioAccess().any — TariffsAdmin.tsx:42 |
| Tariffs | Versions: empty-state "open Studio" | Studio /admin/studio/c/K17 | Studio access | shown ungated | only with useStudioAccess().any — components/admin/plans/PlanVersions.tsx:252-253 |
| Tariffs | Version: change preview | GET /admin/subscription-plan-versions/{id}/preview | subscriptions.manage | gated OK | none needed |
| Tariffs | Draft: edit + save | PATCH /admin/subscription-plan-versions/{id} | subscriptions.manage | gated OK | none needed |
| Tariffs | Draft: validate | POST .../{id}/validate | subscriptions.manage | gated OK | none needed |
| Tariffs | Draft: publish | POST .../{id}/publish | subscriptions.manage (disabled until the backend check passes — not a permission) | gated OK | none needed |
| Tariffs | Draft / old version: archive | POST .../{id}/archive | subscriptions.manage | gated OK | none needed |
| Tariffs | New draft from current | POST /admin/subscription-plans/{id}/drafts | subscriptions.manage | gated OK | none needed |
| Tariffs | Feature registry: add feature | POST /admin/subscription-features | subscriptions.manage | gated OK | none needed |
| Plans (/admin/plans) | (redirect to /admin/tariffs) | — | — | gated OK | none needed |
| Promotions (/admin/promotions) | "New promotion" (header + empty-state CTA) | Studio /admin/studio/o/new?new=MP09 | Studio editor | shown ungated (catalog presence only) | only with useStudioAccess().canEdit — components/admin/promos/PromotionsAdmin.tsx:82-84 |
| Promotions | Card: "Open" in Studio | Studio /admin/studio/o/{id} or /c/MP09 | Studio access | shown ungated | only with useStudioAccess().any; empty actions row not rendered — PromotionsAdmin.tsx:309-311 |
| Promotions | Card: pause (reason dialog) | POST backend `actions.pause` URL (/admin/promotion-campaigns/…) | backend `actions.pause` present + ads.manage (ad promo) / subscriptions.manage (tariff promo) / either (legacy) | shown when backend action present (page opens on either code) | gated by target's code + action URL; 403 → toast, dialog closes, button leaves — PromotionsAdmin.tsx:86-87,301-306,425-431; backend gap QB2 |
| Promotions | Card: resume (reason dialog) | POST backend `actions.resume` URL | same as pause | same as pause | same as pause — PromotionsAdmin.tsx:306 |
| Ads (/admin/ads) | "Promotions" link | page /admin/promotions | ads.manage or subscriptions.manage | gated OK (ads needs ads.manage) | none needed |
| Ads | "Open Studio" (K12-PROMO) | Studio /admin/studio/c/K12-PROMO | Studio access | shown ungated | only with useStudioAccess().any — app/[locale]/admin/ads/page.tsx:72-75 |
| Ads | Readiness: activate / re-activate selling | POST /admin/marketplace/advertising-activation | not documented (page ads.manage; path is /admin/marketplace) | shown ungated (disabled only while conditions unmet — business rule) | 403 → toast, dialog closes, switch leaves card — components/admin/ads/AdsReadiness.tsx:66,112,146,181-185; backend gap QB3 |
| Ads | Readiness: pause selling | POST /admin/marketplace/advertising-pause | same | shown ungated | same — AdsReadiness.tsx; backend gap QB3 |
| Payments (/admin/payments) | Refresh / retry / show more (read only) | GET provider readiness + reconciliation | payments.manage | gated OK | none needed |
| Payouts (/admin/payouts) | Mark payout paid | PATCH /admin/payouts/{id} | payments.manage | gated OK (page gate) | 403 → button leaves every row — app/[locale]/admin/payouts/page.tsx:28,35,94 |
| Marketplace monitor (/admin/marketplace) | Tabs Overview / Orders / Sellers | GET /admin/marketplace/stats, /orders, /sellers | orders.manage (page NAV gate) | gated OK | none needed |
| Marketplace monitor | Refresh button | same GETs | orders.manage (page) | gated OK | none needed |
| Marketplace monitor | Filter bar: period, dates, status, seller/client pickers, reset, chips | GET /admin/marketplace/sellers?q, GET /users/search | orders.manage (page); read-only lookups | gated OK | none needed |
| Marketplace monitor · Overview | KPI tiles (drill to orders by status / sellers tab), table toggle | client-side filter | read | gated OK | none needed |
| Marketplace monitor · Overview | Top sellers row → their orders; "All" links; latest-orders row → order detail | GET /admin/marketplace/orders(/{id}) | orders.manage (page) | gated OK | none needed |
| Marketplace monitor · Orders | Row / work-ID click → order detail modal | GET /admin/marketplace/orders/{id} | orders.manage (page) | gated OK | none needed |
| Marketplace monitor · Order modal | "Their orders" link on client/seller card; phone tel: link | client-side filter | read | gated OK | none needed |
| Marketplace monitor · Sellers | Row / name → seller's orders | client-side filter | read | gated OK | none needed |
| Marketplace monitor · Sellers | "Superadvokat" button on each seller | PUT /admin/marketplace/sellers/{id}/superadvokat (+ GET …/history) | primary superadmin only: /auth/me can_set_superadvokat (403 primary_superadmin_required otherwise) | shown disabled (every superadmin saw it; non-primary got a locked dialog with a disabled form) | components/admin/marketplace/MkmSellers.tsx:66-71,163 — rendered only when session.canSetSuperadvokat; removed after a 403 (superDenied) |
| Marketplace monitor · Superadvokat dialog | Give/take, reason, period, Save | PUT /admin/marketplace/sellers/{id}/superadvokat | primary superadmin | shown disabled (locked fieldset + disabled Save after 403) | components/admin/marketplace/SuperadvokatDialog.tsx:49-54,70-75,98-103,130,158 — on 403 the lock message stays, the form and Save are not rendered, parent drops the button (onDenied) |
| Marketplace monitor | Pager prev/next, retry on load error | GETs | read | gated OK | none needed |
| Policies (/admin/policies) | Readiness checklist retry | GET /admin/compliance/readiness | full admin (page has no NAV perm) | gated OK | none needed |
| Policies · Sections | "History" per section | GET /admin/platform/policies/{section}/history | read | gated OK | none needed (read-only view stays) |
| Policies · Sections | "Edit" per section (opens editor) | PUT /admin/platform/policies/{section} | users.manage (lib/services/catalogOverrides.ts) | shown ungated | app/[locale]/admin/policies/page.tsx:60-66,140,187 — rendered only with can(users.manage); modal can't open without it (code confirmation: backend gap QC2) |
| Policies · Edit modal | Field edits, add/remove row, Save | PUT /admin/platform/policies/{section} | users.manage | after-click 403 only | app/[locale]/admin/policies/page.tsx:187,226-230 — 403 keeps the toast, closes the modal and removes every Edit (saveDenied) |
| Policies · Unverified sellers | Badge / Hidden radio choice | PUT /admin/platform/policies/order (order.catalog.unverified_sellers) | users.manage | shown ungated | app/[locale]/admin/policies/page.tsx:79-83,165-171 — without users.manage only the current mode is shown as a read-only card (no radios); a 403 switches to read-only and drops Retry |
| Policies · Marketplace pricing | Every value field (range, experience tiers, client, regions, seller, sector) | PUT /admin/platform/policies/marketplace_pricing | users.manage | shown ungated | components/admin/policies/MarketplacePricingCard.tsx:144-173,237,313-316,468 — read-only context: inputs readOnly, patch() no-op |
| Policies · Marketplace pricing | Sort tiers, Add tier, Remove tier | (draft, saved by PUT) | users.manage | shown ungated | components/admin/policies/MarketplacePricingCard.tsx:520,559,576 — not rendered when read-only (grid cell kept as empty span) |
| Policies · Marketplace pricing | Add region, Remove region | (draft, saved by PUT) | users.manage | shown ungated | components/admin/policies/MarketplacePricingCard.tsx:642,658 — not rendered when read-only |
| Policies · Marketplace pricing | "Verified experience only" switch | (draft, saved by PUT) | users.manage | shown ungated | components/admin/policies/MarketplacePricingCard.tsx:689 — read-only shows "…: Yes/No" text |
| Policies · Marketplace pricing | Defaults, Reset, Save footer; "save opens soon" note | PUT /admin/platform/policies/marketplace_pricing | users.manage | shown ungated | components/admin/policies/MarketplacePricingCard.tsx:482,713 — footer and note not rendered when read-only; 403 on save calls onDenied (line 381) → whole policies page goes read-only |
| Policies · Pricing history modal | Open history | GET /admin/platform/policies/marketplace_pricing/history | read | gated OK | none needed |
| Policies · Pricing history modal | "Load this version" into the editor | (draft) | users.manage | shown ungated | components/admin/policies/PricingHistoryModal.tsx:36-37,93; MarketplacePricingCard.tsx:741 — onLoad omitted when read-only |
| Policies | Business calendar card (rendered on this page) | components/admin/BusinessCalendarCard.tsx | — | — | audited in the slice that owns components/admin/BusinessCalendarCard.tsx (not this slice) |
| Monitoring (/admin/monitoring) | Range select, custom dates | GET /admin/monitoring/overview, /history | users.manage (page) | gated OK | none needed |
| Monitoring | Refresh, thresholds toggle, error retry | GET overview | users.manage (page) | gated OK | none needed |
| Monitoring | "Take snapshot" | POST /admin/monitoring/snapshots | users.manage (page; no separate code in any contract) | gated OK | none needed (revoked users.manage unmounts the page via the shell + 403 safety net) |
| Monitoring | Integration "Check now", integration pick / close | GET /admin/monitoring/integrations/{key}?refresh=true | users.manage (page) | gated OK | none needed |
| Monitoring | Incident dismiss | local | — | gated OK | none needed |
| Monitoring | Service search / problems filter; history type filter; history pager | GETs | read | gated OK | none needed |
| Monitoring | History Excel export start / download | POST /admin/monitoring/history/exports, GET …/{id}/download | users.manage (page) | gated OK | none needed |
| Mobile testing (/admin/mobile-testing) | Date / usage filters, "Today", device row / link → detail | GET /admin/mobile-testing/dashboard, /installations | primary superadmin (is_primary_superadmin; NAV) | gated OK | none needed (non-primary gets MtmForbidden before any row) |
| Mobile testing · Device detail | Apply / reset period, chart day focus | GET /admin/mobile-testing/installations/{id} | primary superadmin | gated OK | none needed |
| Mobile testing (all tabs) | Live bar Refresh, Retry, pager | GETs | primary superadmin | gated OK | none needed |
| Mobile testing · Releases | "New release" (top bar + empty-state CTA) | POST /admin/mobile-testing/releases | primary superadmin | shown ungated (top bar button rendered for a non-primary superadmin opening the URL, while the list loaded) | components/admin/mobileTesting/MtmReleases.tsx:40-51 — whole view replaced by MtmForbidden unless session.isPrimarySuperadmin |
| Mobile testing · Releases | Row Edit; Stop auto-enrol; Close; Reopen | PATCH /admin/mobile-testing/releases/{id} | primary superadmin | gated OK (rows only after a successful primary-only load) | components/admin/mobileTesting/MtmReleases.tsx:85,129-133 — a 403 now also removes every action (deny → MtmForbidden) |
| Mobile testing · Release form | Save (create / edit) | POST/PATCH /admin/mobile-testing/releases | primary superadmin | after-click 403 only | components/admin/mobileTesting/MtmReleases.tsx:102,280-285 — 403 toasts err.primary, closes the form, page shows MtmForbidden |
| Mobile testing · Reports | Send panel (date + Send) | POST /admin/mobile-testing/reports/{date}/send | primary superadmin | shown ungated (rendered before/while the history loaded) | components/admin/mobileTesting/MtmReports.tsx:37-41,80 — not rendered unless session.isPrimarySuperadmin |
| Mobile testing · Reports | Row Send / Force resend; dialog Send / Force (2-step) | POST /admin/mobile-testing/reports/{date}/send?force= | primary superadmin | gated OK (after a primary-only load) | components/admin/mobileTesting/MtmReports.tsx:63-68 — a 403 closes the dialog, toasts err.primary and removes the actions |
| Live office (/admin/live-office) | Demo switch, reload, retry | GET /admin/audit-trail, GET /admin/users | users.manage (page) | gated OK | none needed |
| Live office | Kind filters, Floor/Classic view toggle, zoom in/out/fit, tray faces | local | read | gated OK | none needed |
| Live office | Pick person (map / floor / feed), person panel "earlier", segment expand, feed "more" | local | read | gated OK | none needed |
| Remote assistance (/admin/remote-assistance) | Refresh; status tabs; filter form + apply; pager; error retry | GET /admin/remote-assistance/monitoring, /admin/remote-assistance/sessions | remote_assist.supervise (backend capability `supervise`) | gated OK | none needed |
| Remote assistance | Row expand → audit timeline | GET /remote-assistance/sessions/{id}/audit | read (supervise / view_audit) | gated OK | none needed; audit-only viewers see "no access" — backend gap QC1 |
| Remote assistance · Live now | "Revoke" on a live session | POST /admin/remote-assistance/sessions/{id}/emergency-revoke | capability `emergency_revoke` (GET /remote-assistance/meta) | gated OK | components/admin/remoteAssist/RemoteAssistAdmin.tsx:58-62 — a 403 now also removes every Revoke |
| Remote assistance · Row | "Revoke" inside an open live session | same | `emergency_revoke` | gated OK | same as above (onRevoke undefined once denied) |
| Remote assistance · Revoke dialog | Reason + confirm Revoke | same | `emergency_revoke` | after-click 403 only | components/admin/remoteAssist/RemoteAssistAdmin.tsx:380,391-396,417,426 — 403 keeps the message, hides reason field and the confirm button, parent drops all Revoke buttons |
| Legal aid (/admin/legal-aid) | Open request detail (eye) | GET /legal-aid/requests/{id} | legal_aid.manage (page) | gated OK | none needed |
| Legal aid | Phone tel: link; detail retry; list retry | — / GETs | read | gated OK | none needed |
| Register requests (/admin/register-requests) | Role filter, date range (FilterBar) | GET /admin/seller-requests | users.manage (page gate) | gated OK | none needed |
| Register requests | Open request detail (eye) | GET /admin/register-requests/{id} | users.manage (page gate) | gated OK | none needed |
| Register requests › detail modal | Expand proof document preview | GET /admin/lawyer-proof-documents/{id}/file | users.manage (page gate) | gated OK | none needed |
| Register requests | Accept | POST /admin/register-requests/{id}/accept | users.manage (page gate); object rule: all four verification steps done (not in list rows) | gated OK (403 swallowed silently) | 403 → common.forbidden notice + decision buttons leave every row: app/[locale]/admin/register-requests/page.tsx:64-96,129,228; four-step state up front: backend gap QD6 |
| Register requests | Reject | POST /admin/register-requests/{id}/reject | users.manage (page gate) | gated OK (403 swallowed silently) | same 403 handling as Accept (register-requests/page.tsx:64-96,129,228) |
| Reviews (/admin/reviews) | Seller-type filter, open review detail | GET /admin/reviews, GET /admin/reviews/{id} | lawyers.verify (page gate) | gated OK | none needed |
| Reviews | Approve / Reject review (pending rows only) | PATCH /admin/reviews/{id}/moderate | lawyers.verify (page gate); status lock: pending only (already mirrored) | gated OK | 403 now also hides moderation buttons: app/[locale]/admin/reviews/page.tsx:113,218 |
| Reviews | Recalculate ratings (+ confirm modal) | POST /admin/marketplace/ratings/recalculate | no code named in any contract | after-click 403 only | message kept, button hidden after 403 (reviews/page.tsx:113,158-163); backend gap QD2 |
| Approvals (/admin/approvals) | Admin approve | POST /approvals/{id}/admin-approve | approvals.manage (page gate); which role may give the admin stamp: not in contract; status lock: open (pending/partial) + stamp not yet given | shown disabled (when stamped) / 403 swallowed | stamped or closed → not rendered; 403 → common.forbidden notice + button leaves all rows; empty action column hidden: app/[locale]/admin/approvals/page.tsx:25-42,83-109; backend gap QD1 |
| Approvals | Manager approve | POST /approvals/{id}/manager-approve | approvals.manage (page gate); manager stamp role not in contract; same status lock | shown disabled (when stamped) / 403 swallowed | same as Admin approve (approvals/page.tsx:25-42,83-109); backend gap QD1 |
| Roles (/admin/roles) | Add role (+ create modal, save) | POST /admin/roles | roles.manage (page gate; admin lacks it → page hidden) | gated OK | 403 → modal closes, Add hidden: app/[locale]/admin/roles/page.tsx:31-33,137-143 + create modal |
| Roles | Assign role panel (user picker + role select + Assign) | GET /admin/users (users.manage) + POST /admin/users/assign-role | users.manage for the user picker (lib/services/users.ts contract) + roles.manage page gate | shown ungated (picker 403s without users.manage) | panel rendered only with users.manage, roles list spans full width otherwise; 403 on assign hides panel: roles/page.tsx:31-33,130,163-215; exact code of assign-role: backend gap QD3 |
| Roles | Permission matrix | GET /admin/roles/permission-matrix | roles.manage (page gate), read-only | gated OK | none needed |
| Notifications (/admin/notifications) | Mode tabs individual / broadcast | — (UI) | notifications.manage (page gate) | gated OK | none needed |
| Notifications | Recipient list, role filter, search, Select all, Clear | GET /admin/users | users.manage | shown ungated (list 403s without users.manage) | rendered (and fetched) only with users.manage; manual recipient field shown open instead: app/[locale]/admin/notifications/page.tsx:51,71-74,249,301-311 |
| Notifications | Send (individual fan-out / role broadcast + confirm) | POST /admin/notifications (sendAdminNotification) | notifications.manage (page gate) | gated OK | 403 (all failed) → message kept, Send button removed and submit blocked: notifications/page.tsx:54,118,364-371 |
| Notifications | Stop sending | — (local) | — | gated OK | none needed |
| Audit trail (/admin/audit-trail) | Anomalies status filter | GET /admin/security-events | users.manage (page gate) | gated OK | none needed |
| Audit trail | Filters (dates, user search, action/target), Apply, Reset | GET /admin/audit-trail, GET /users/search | users.manage (page gate) | gated OK | none needed |
| Audit trail | Export CSV | GET /admin/audit-trail?export=csv | users.manage (page gate) | shown disabled (when log is 403) | hidden while log is 403 and after an export 403: app/[locale]/admin/audit-trail/page.tsx:170-171,323-328 |
| Audit trail | Copy event hash | — (clipboard) | — | gated OK | none needed |
| Legal (/admin/legal) | Docs / Journal tabs, version history, view version | GET /admin/legal/consents | users.manage (page gate, code comment backend.ts:7799) | gated OK | none needed |
| Legal | New document | POST /admin/legal/consents | users.manage page gate (write code not in contract) | after-click 403 only | 403 → message kept, write buttons leave the page, modal closes: app/[locale]/admin/legal/page.tsx:98,134,198,341 ; backend gap QD4 |
| Legal | New version / Publish (per document row) | PATCH /admin/legal/consents/{id} (version_bump) / POST | same as above | after-click 403 only | same (legal/page.tsx:98,157-171,198); empty action cell not rendered; backend gap QD4 |
| Legal › Journal | User search filter, document filter | GET /admin/legal/user-consents, GET /users/search | users.manage (page gate) | gated OK | none needed |
| AI reglaments (/admin/ai-reglaments) | Tabs list/gaps, search, category/status filters, open drawer, version timeline | GET /admin/ai/support/reglaments(/{id}) | full-admin page (no NAV perm → superadmin/admin role only; contract: "Admin endpointlar") | gated OK | none needed |
| AI reglaments | Upload (header + empty-state CTA + AI modal) | POST /admin/ai/support/reglaments/upload | full-admin page; no code in contract | after-click 403 only (disabled only for missing endpoint = OK) | 403 → message kept in modal, Upload hidden everywhere: components/admin/ai/AiReglamentsPage.tsx:67-68,123,222-246,386-387; ReglamentUpload.tsx:30-50,166 ; backend gap QD5 |
| AI reglaments | New reglament (header + empty-state CTA + AI modal) | POST /admin/ai/support/reglaments | same | after-click 403 only | 403 → New hidden everywhere: AiReglamentsPage.tsx:67-68,122,223,261-276; ReglamentEditor.tsx:91-104,229 ; backend gap QD5 |
| AI reglaments | Edit / new version (list row + drawer) | PATCH /admin/ai/support/reglaments/{id} | same | after-click 403 only | 403 → Edit hidden in list and drawer: AiReglamentsPage.tsx:124 (canEdit), ReglamentEditor.tsx:229 ; backend gap QD5 |
| AI reglaments › Gaps | Add answer to gap | POST or PATCH reglaments (editor gap mode) | same | after-click 403 only | hidden once both create and update were refused: AiReglamentsPage.tsx:125 |
| AI reglaments › Upload modal (endpoint missing) | "Use the editor" | opens create editor | same as New | shown ungated | hidden after create 403: ReglamentUpload.tsx:203-213, AiReglamentsPage.tsx:386 |
| AI reglaments › Gaps | Refresh | GET /admin/ai/support/reglaments/gaps | full-admin page | gated OK | none needed |

#### Counts

- Audited: 188 (A 60, B 48, C 48, D 32; 3 rows in A belong to other areas: MeetingLauncher, TeamTasksPage, AiSystemAssistant; C's BusinessCalendarCard row is fixed in A)
- Hidden / fixed by me: 73 (incl. page-gated actions that now also leave the screen after a 403)
- Already OK: 112
- Backend gaps: 15 (QA1–QA4, QB1–QB3, QC1–QC2, QD1–QD6) — see ADMIN-questions.md

#### Part notes
- A: COUNTS audited=60 hidden=25 ok=32 gaps=4 (3 rows belong to other areas: MeetingLauncher, TeamTasksPage, AiSystemAssistant)
- A: FILES app/[locale]/admin/page.tsx, app/[locale]/admin/ceo/page.tsx, app/[locale]/admin/retention/page.tsx, app/[locale]/admin/b2b/page.tsx, components/admin/BusinessCalendarCard.tsx, components/admin/QualityComplaints.tsx, components/admin/UrgentAdvocateQueue.tsx, components/admin/leads/LeadMenu.tsx
- B: COUNTS audited=48 hidden=11 ok=37 gaps=3 (plus 16 page-gated actions that now also leave the screen after a 403)
- B: FILES app/[locale]/admin/services/page.tsx, app/[locale]/admin/templates/page.tsx, app/[locale]/admin/ads/page.tsx, app/[locale]/admin/payouts/page.tsx, components/admin/ServiceEditModal.tsx, components/admin/TemplateImport.tsx, components/admin/templateEditor/CreateDraftModal.tsx, components/admin/docsettings/DocumentSettingsPage.tsx, components/admin/plans/TariffsAdmin.tsx, components/admin/plans/PlanVersions.tsx, components/admin/promos/PromotionsAdmin.tsx, components/admin/ads/AdsReadiness.tsx
- C: COUNTS audited=48 hidden=19 ok=29 gaps=2 (19 "hidden" = 12 hidden before any click + 7 already gated/after-403 rows that now also leave the screen after a 403; BusinessCalendarCard row is owned by another slice)
- C: FILES app/[locale]/admin/policies/page.tsx, components/admin/policies/MarketplacePricingCard.tsx, components/admin/policies/PricingHistoryModal.tsx, components/admin/marketplace/MkmSellers.tsx, components/admin/marketplace/SuperadvokatDialog.tsx, components/admin/mobileTesting/MtmReleases.tsx, components/admin/mobileTesting/MtmReports.tsx, components/admin/remoteAssist/RemoteAssistAdmin.tsx
- D: COUNTS audited=32 hidden=18 ok=14 gaps=6
- D: FILES app/[locale]/admin/register-requests/page.tsx, app/[locale]/admin/approvals/page.tsx, app/[locale]/admin/reviews/page.tsx, app/[locale]/admin/roles/page.tsx, app/[locale]/admin/notifications/page.tsx, app/[locale]/admin/audit-trail/page.tsx, app/[locale]/admin/legal/page.tsx, components/admin/ai/AiReglamentsPage.tsx, components/admin/ai/ReglamentEditor.tsx, components/admin/ai/ReglamentUpload.tsx

#### Files changed
- app/[locale]/admin/page.tsx
- app/[locale]/admin/ceo/page.tsx
- app/[locale]/admin/retention/page.tsx
- app/[locale]/admin/b2b/page.tsx
- components/admin/BusinessCalendarCard.tsx
- components/admin/QualityComplaints.tsx
- components/admin/UrgentAdvocateQueue.tsx
- components/admin/leads/LeadMenu.tsx
- app/[locale]/admin/services/page.tsx
- app/[locale]/admin/templates/page.tsx
- app/[locale]/admin/ads/page.tsx
- app/[locale]/admin/payouts/page.tsx
- components/admin/ServiceEditModal.tsx
- components/admin/TemplateImport.tsx
- components/admin/templateEditor/CreateDraftModal.tsx
- components/admin/docsettings/DocumentSettingsPage.tsx
- components/admin/plans/TariffsAdmin.tsx
- components/admin/plans/PlanVersions.tsx
- components/admin/promos/PromotionsAdmin.tsx
- components/admin/ads/AdsReadiness.tsx
- app/[locale]/admin/policies/page.tsx
- components/admin/policies/MarketplacePricingCard.tsx
- components/admin/policies/PricingHistoryModal.tsx
- components/admin/marketplace/MkmSellers.tsx
- components/admin/marketplace/SuperadvokatDialog.tsx
- components/admin/mobileTesting/MtmReleases.tsx
- components/admin/mobileTesting/MtmReports.tsx
- components/admin/remoteAssist/RemoteAssistAdmin.tsx
- app/[locale]/admin/register-requests/page.tsx
- app/[locale]/admin/approvals/page.tsx
- app/[locale]/admin/reviews/page.tsx
- app/[locale]/admin/roles/page.tsx
- app/[locale]/admin/notifications/page.tsx
- app/[locale]/admin/audit-trail/page.tsx
- app/[locale]/admin/legal/page.tsx
- components/admin/ai/AiReglamentsPage.tsx
- components/admin/ai/ReglamentEditor.tsx
- components/admin/ai/ReglamentUpload.tsx

## Call center, navbatchi yurist, support

Area: components/ccx/**, components/admin/callcenter/**, components/admin/Cc*.tsx, components/admin/CallCenterQueue.tsx, components/support/**, app/[locale]/admin/call-center/**.

| Screen | Action | Endpoint | Permission / rule | Before | Fix |
|---|---|---|---|---|---|
| CCX CRM shell (CcxCrm) | Section tabs (overview/leads/customers/calls/performance/templates/sms) | GET /crm/* | sectionOk() per /crm/meta perms (crm.leads.view, crm.customers.view, crm.calls.start, crm.sms.manage, crm.analytics.self …) | gated OK | none needed |
| CCX CRM shell | Retry meta | GET /crm/meta | CRM access | gated OK | none needed |
| CRM overview (CrmOverviewX) | Take next lead (hero) | POST /crm/leads/{id}/claim | lead.allowed_actions `claim` | gated OK | none needed |
| CRM overview | Open queue / agenda links | — (navigation) | crm.leads.view | gated OK | none needed |
| CRM overview | New lead (hero) | POST /crm/leads | crm.leads.manage | gated OK | none needed |
| CRM overview | "Performance" solo link (no leads view) | GET /crm/me/metrics | crm.analytics.self | shown ungated | hidden without crm.analytics.self — components/ccx/crm/sections/CrmOverviewX.tsx:205 |
| New lead sheet (NewLeadSheet) | Create lead / force-create duplicate | POST /crm/leads | crm.leads.manage | gated OK | none needed |
| New lead sheet | "New customer" in customer picker → create customer | POST /crm/customers | crm.customers.manage | shown ungated | hidden without crm.customers.manage — components/ccx/crm/leads/NewLeadSheet.tsx:198,268,407 |
| CRM leads (CrmLeadsX) | Scope tabs / search / filters / saved views / layout switch | GET /crm/leads (local views only) | crm.leads.view (read) | gated OK | none needed |
| CRM leads | Operator filter | GET /crm/operators | crm.leads.assign | gated OK | none needed |
| CRM leads | New lead | POST /crm/leads | crm.leads.manage | gated OK | none needed |
| CRM leads table (LeadTableX) | Claim row | POST /crm/leads/{id}/claim | allowed_actions `claim` | gated OK | none needed |
| CRM leads | Keyboard `c` claim | POST /crm/leads/{id}/claim | allowed_actions `claim` (checked in claim()) | gated OK | none needed |
| CRM board (LeadBoardX/LeadCard) | Claim card | POST /crm/leads/{id}/claim | allowed_actions `claim` | gated OK | none needed |
| CRM board | Drag card to another status | POST /crm/leads/{id}/status | allowed_actions `change_status` + meta.transitions | gated OK | none needed |
| CRM board | Card ⋯ menu → move to status | POST /crm/leads/{id}/status | allowed_actions `change_status` | shown ungated | status list only with change_status — components/ccx/crm/leads/LeadCard.tsx:71 |
| CRM board | Card ⋯ menu → up/down, drag within column | PATCH /call-center/leads/{id}/move | `change_status` / `move` (no contract code) | gated OK | backend gap A1 |
| CRM board | Reject (reason sheet) | POST /crm/leads/{id}/status | change_status + transition to rejected | gated OK | none needed |
| CRM board | Load more in column | GET /crm/kanban/… | read | gated OK | none needed |
| CRM customers (CrmCustomersX) | New customer | POST /crm/customers | crm.customers.manage | gated OK | none needed |
| CRM customers | Filters / pager / open customer | GET /crm/customers | crm.customers.view | gated OK | none needed |
| Customer page (CrmCustomerX) | New lead | POST /crm/leads | crm.leads.manage | gated OK | none needed |
| Customer page | Edit customer | PATCH /crm/customers/{id} | crm.customers.manage | gated OK | none needed |
| Customer page | Merge customers | POST /crm/customers/merge | crm.customers.merge | gated OK | none needed |
| Customer page | Header action bar when nothing is allowed | — | — | shown ungated | bar hidden when no action — components/ccx/crm/sections/CrmCustomerX.tsx:229 |
| Customer page | Add contact | POST /crm/customers/{id}/contacts | crm.customers.manage | gated OK | none needed |
| Customer page | Make contact primary | PATCH /crm/customers/{id}/contacts/{cid} | crm.customers.manage | gated OK | none needed |
| Customer page | Archive contact | DELETE /crm/customers/{id}/contacts/{cid} | crm.customers.manage (+ last-contact business lock, disabled with reason) | gated OK | none needed |
| Customer page | Edit notes | PATCH /crm/customers/{id} | crm.customers.manage | gated OK | none needed |
| Customer page | Tabs leads/orders/timeline, call (tel:), copy | — | read | gated OK | none needed |
| Lead page head (LeadHead) | Journey step pick → status | POST /crm/leads/{id}/status | change_status + transitions; won locked until paid | gated OK | none needed |
| Lead page "do now" | Claim / call result / set next / forward / order / reopen / submit draft | claim, activities, next-action, status, conversion, reopen | allowed_actions claim / add_activity / set_next_action / change_status / prepare_conversion / reopen∨edit (nextLeadStep) | gated OK | none needed |
| Lead page ⋯ menu | Assign | PATCH /crm/leads/{id}/assign | allowed_actions `assign` | gated OK | none needed |
| Lead page ⋯ menu | Transfer | POST /crm/leads/{id}/transfer | allowed_actions `transfer` | gated OK | none needed |
| Lead page ⋯ menu | Set/change next action | PATCH /crm/leads/{id} | allowed_actions `set_next_action` | gated OK | none needed |
| Lead page ⋯ menu | Prepare order | POST /crm/leads/{id}/prepare-conversion | allowed_actions `prepare_conversion` | gated OK | none needed |
| Lead page ⋯ menu | Edit lead | PATCH /crm/leads/{id} | allowed_actions `edit` | gated OK | none needed |
| Lead page ⋯ menu | AI copilot | POST /crm/leads/{id}/ai-runs | allowed_actions `run_ai` | gated OK | none needed |
| Lead page ⋯ menu | Add / remove watcher | POST/DELETE /crm/leads/{id}/watchers | allowed_actions `manage_watchers` (list stays readable) | gated OK | none needed |
| Lead page ⋯ menu | Other statuses / reject | POST /crm/leads/{id}/status | change_status + transitions | gated OK | none needed |
| Lead page | Next-action card "change" | PATCH /crm/leads/{id} | set_next_action | gated OK | none needed |
| Lead page | Duplicate decide | POST /crm/leads/{id}/resolve-duplicate | resolve_duplicate ∨ edit (same as admin CRM) | gated OK | none needed |
| Lead page | Customer card "open profile" | GET /crm/customers/{id} | crm.customers.view | shown ungated | hidden without crm.customers.view — components/ccx/crm/detail/leadCards.tsx:167,193; components/ccx/crm/sections/CrmLeadX.tsx:260 |
| Lead page (ConvertCard) | Pick service/package/seller, review, create order | POST /crm/leads/{id}/prepare-conversion | prepare_conversion | gated OK | none needed |
| Lead feed (FeedCard) | Pane menu (timeline/history/calls/sms) | GET | read | gated OK | none needed |
| Lead feed composer | Add activity / call note / follow-up reminder / templates | POST /crm/leads/{id}/activities | add_activity (+ set_next_action for reminder) | gated OK | none needed |
| Lead calls pane | Start call | POST /crm/leads/{id}/calls | allowed_actions `start_call` + crm.calls.start | gated OK | none needed |
| Lead calls pane (ActiveCall) | Add transcript line | POST /crm/calls/{id}/transcript | crm.calls.start | shown ungated | hidden without crm.calls.start — components/ccx/crm/detail/leadCalls.tsx:286 |
| Lead calls pane (ActiveCall) | Request live AI assist (checkbox) | POST /crm/calls/{id}/transcript request_ai_assist | crm.ai.use | shown ungated | hidden without crm.ai.use, never sent — components/ccx/crm/detail/leadCalls.tsx:233,315 |
| Lead calls pane (ActiveCall) | End call | POST /crm/calls/{id}/complete | crm.calls.start (owner unknown) | shown ungated | hidden without crm.calls.start — components/ccx/crm/detail/leadCalls.tsx:351; owner rule backend gap A2 |
| Lead calls pane | Play recording | recording_url | crm.calls.recordings.view | gated OK | none needed |
| Lead SMS pane | Draft SMS / edit / approve / retry | POST /crm/leads/{id}/sms, POST /crm/sms/{id}/approve | crm.sms.manage + editable status | gated OK | none needed |
| AI sheet (AiSheet) | Run AI | POST /crm/leads/{id}/ai-runs | run_ai (sheet only opens with it) | gated OK | none needed |
| AI sheet | Apply selected fields | POST /crm/ai/runs/{id}/apply | run_ai (lead write rules unknown) | gated OK | backend gap A3 |
| AI sheet | "Use as SMS" | → SMS composer | crm.sms.manage | shown ungated | hidden without crm.sms.manage — components/ccx/crm/detail/leadAi.tsx:314 |
| CRM calls (CrmCallsX) | Scope mine/all | GET /crm/leads… | crm.leads.view_all | gated OK | none needed |
| CRM calls | Recording / open lead / tel: | — | crm.calls.recordings.view / read | gated OK | none needed |
| CRM SMS (CrmSmsX) | Scope mine/all | GET | crm.leads.view_all | gated OK | none needed |
| CRM SMS | Edit / approve / approve edited / retry send | POST /crm/sms/{id}/approve | crm.sms.manage + status | gated OK | none needed |
| CRM templates (CrmTemplatesX) | New template | POST /crm/operator-templates | crm.templates.manage | gated OK | none needed |
| CRM templates | Copy / view | — | read | gated OK | none needed |
| CRM performance (CrmPerformanceX) | Range / refresh | GET /crm/me/metrics | crm.analytics.self | gated OK | none needed |
| CRM performance | Status rows → open lead list | — (navigation to leads) | crm.leads.view | shown ungated | plain rows without crm.leads.view — components/ccx/crm/sections/CrmPerformanceX.tsx:188,206; misc/misc.css:810 |
| CRM live toasts (CrmLive) | Toast "open" action | — (navigation) | event addressed to the user | gated OK | none needed |
| CCX clients (CcxClients) | Client search | GET /call-center/clients/search | callcenter.access ∨ users.manage; 403 → denied state | gated OK | none needed |
| CCX clients | Profile / calls view tabs | — | read | gated OK | none needed |
| Client profile (ClientProfile) | Log call | POST /call-center/calls | is_call_center_user (callcenter.access / call_center roles) | shown ungated | gated by isCallCenterUser + removed after a 403 on the call list; empty action bar hidden — components/ccx/clients/ClientProfile.tsx:43,68,191,257 |
| Client profile | Call (tel:) / copy referral / retry card / data tabs | GET /call-center/clients/{id}/card | read; 403 → "no access" note | gated OK | none needed |
| Call log (CallLog) | Log call | POST /call-center/calls | is_call_center_user | shown ungated | gated by isCallCenterUser and hidden on 403 — components/ccx/clients/CallLog.tsx:105,140,237 |
| Call log | Refresh | GET /call-center/calls | callcenter.access | shown ungated | tools hidden when denied — components/ccx/clients/CallLog.tsx:126 |
| Call log | Direction filters / show more / open client | — | read | gated OK | none needed |
| Queues (ccx) | Verification lanes load (experience/achievements/licenses) | GET /call-center/marketplace/{experience,achievements,licenses} queues | marketplace.experience.review (docs/LEXGO_ACHIEVEMENTS_PRACTICE_FRONTEND_FINAL_2026_10_29.md) | after-click 403 only (requested for everyone, denied lanes hidden after the 403) | not requested / not rendered without the permission: components/ccx/queues/useQueues.ts:168, CcxQueues.tsx:55 |
| Queues (ccx) | Verify family card, lane tabs, job cards, "do oldest" for verify lanes | (above) | marketplace.experience.review | after-click 403 only | lanes never exist without permission (same fix) |
| Queues (ccx) | Other lanes denied by 403 (queue, escalations, complaints, mp complaints, warranty, cancellations, payouts, recoveries) | /call-center/* lists | call-center role (is_call_center_user) | gated OK (denied lane not rendered) | none needed |
| Queues (ccx) board | "Leads" link (CRM leads) | /admin/call-center?view=crm&s=leads → /crm/leads | crm.leads.view (AdminShell NAV perm) | shown ungated | hidden: QueuesBoard.tsx:92 |
| Queues (ccx) people family | "Leads" card + link | same | crm.leads.view | shown ungated | hidden: CcxQueues.tsx:243 (+ queues.css only-child so clients card takes the row) |
| Queues (ccx) | "Clients" link / recent calls | /call-center/clients | callcenter operator (page already operator-only) | gated OK | none needed |
| Queues (ccx) | Filter / mode / sort / refresh / keyboard Enter & arrows | local | none | gated OK | none needed |
| Job card (queues) | Open panel / tel: call | local / device dialer | none | gated OK | none needed |
| Escalation panel | Pick decision + submit (message, offer_resolution, reassign, cancel, full_refund…) | POST /call-center/marketplace/assignment-escalations/{id}/resolve | object-level `actions` (backend allowed actions) | gated OK by actions; 403 left the form in place | 403 now removes the decision and primary button, shows the reason: EscalationDecide.tsx:140,215,387 |
| Quality complaint panel | Rule (QC_ACTIONS) + note + submit | POST /call-center/quality-complaints/{id}/resolve | call-center role; status lock (settled) | gated OK by status; 403 left the form | 403 removes the form: QualityDecide.tsx:170 (formOpen gains !denied) |
| Quality complaint panel | "Open marketplace queue" link | local | none | gated OK | none needed |
| Quality complaint panel | Retry detail, open file | GET | none | gated OK | none needed |
| Mp complaint panel | Decision choice + submit | POST /call-center/marketplace/complaints/{id}/resolve | object-level `allowed_actions` | gated OK; 403 left the form | 403 removes decision: MpComplaintDecide.tsx:83,169,352 |
| Mp complaint panel | Upload evidence (+ visibility select) | POST …/complaints/{id}/evidence | part of the decision (only inside decision section) | gated OK by actions; 403 left it | 403 removes decision incl. upload: MpComplaintDecide.tsx:144 |
| Mp complaint panel | Download evidence | GET | none | gated OK | none needed |
| Warranty panel | Resolution choice + seller pick + transfer switch + submit | POST /call-center/marketplace/warranty-claims/{id}/resolve | object-level `available_resolutions`; settled lock | shown ungated when available_resolutions is empty (empty choice + live submit) | form + primary hidden unless resolutions offered; 403 removes it: WarrantyDecide.tsx:45,64,84,137,197 |
| Cancellation panel | Resolve (cancel/refund/new_price/reassign/continue…) | POST /call-center/marketplace/cancellation-reviews/{id}/resolve | object-level `resolution_options`, open status | gated OK (403 → terminal hides form) | none needed |
| Cancellation panel | "cancel" option while paid | same | business rule (paid order) | shown disabled with hint (not a permission) | none needed |
| Cancellation chat | Start chat / create | POST …/cancellation-reviews/{id}/discussion | call-center role; open review | after-click 403 only | 403 hides start/create: CancelChat.tsx:64 |
| Cancellation chat | Close chat | POST …/discussion/close | open chat | after-click 403 only | 403 hides close: CancelChat.tsx:87 (empty actions row also hidden) |
| Cancellation chat | Open room / history link | /portal/chat/{room} | participant | gated OK | none needed |
| Cancellation panel | Download result file | GET secure file | none | gated OK | none needed |
| Payout / recovery panel | Mark paid / resolve recovery (+ reference, note) | POST /call-center/marketplace/payouts/{id}/mark-paid, …/payout-recoveries/{id}/resolve | call-center role; actionable status (due/failed/review) filtered in lane | gated OK by status; 403 left the form | 403 removes form + primary, Close only: PayoutDecide.tsx:58,93,104 |
| Verify panel (experience/achievement/license) | Decision (approve/changes/reject) + reason + public text + submit | POST /call-center/marketplace/{experience,achievements,licenses}/{id}/review | marketplace.experience.review; pending status lock | shown disabled when not pending; 403 left it | decision section + primary hidden unless pending; 403 removes them: VerifyDecide.tsx:99,141 |
| Verify panel | Checklist verdicts | (part of submit) | pending | shown disabled when not pending | locked (read-only display) when not decidable — status lock, kept readable |
| Verify panel room | Start review room | POST …/{id}/review-room | pending record | shown disabled when not pending | hidden unless pending; 403 hides: VerifyRoom.tsx:40,51 |
| Verify panel room | Close room | POST …/review-room/close | open room | after-click 403 only | 403 hides: VerifyRoom.tsx:40,51 |
| Verify panel room | Audio/video call | POST /chat/rooms/{room}/calls | meetings.manage (canMakeCalls) + room.callTypes | shown ungated (callTypes only) | gated by canMakeCalls; 403 hides: VerifyRoom.tsx:38,68 (empty actions row hidden) |
| Verify panel room | Go to room / history | link | participant | gated OK | none needed |
| License panel suspensions | Add / edit / archive suspension, upload evidence, remove file | /call-center/marketplace/sellers/{id}/practice/suspensions* | marketplace.experience.review (license queue) | after-click 403 only | 403 hides add/edit/archive, closes form: VerifySuspensions.tsx:41 |
| License panel suspensions | Download evidence | GET | none | gated OK | none needed |
| Verify panel | Retry load, download evidence (RecordCard) | GET | none | gated OK | none needed |
| Now (focus card) | Open CRM (lead job) | /admin/call-center?view=crm&lead= | crm.leads.view (GET /crm/meta; session codes until meta loads) | shown ungated | hidden: NowFocus.tsx:158 |
| Now (focus card) | Claim urgent | POST /call-center/urgent-advokat/requests/{id}/claim | lifecycle (open_pool / next_statuses has claimed, unclaimed) | shown on claimed-elsewhere/non-claimable loaded records | claim only when claimable, else "open board"; 403 removes it: NowFocus.tsx:158,183 |
| Now (focus card) | Assign next seller (order job) | POST /matching/orders/{id}/assign-next | orders.manage (code comment in lib/services/backend.ts) | shown ungated (operators lack orders.manage) | hidden without orders.manage; 403 removes it: NowFocus.tsx:158,183 |
| Now (focus card) | Open queue / open board link | local | none | gated OK | none needed |
| Now (focus card) | Call (tel:) / log call | POST /call-center/calls | call-center role (Now is operator-only) | gated OK | none needed |
| Now (focus card) | Later / next / keyboard c·e·s·n | local | none ("Later" disabled with <2 jobs — not a permission) | gated OK | none needed (hidden actions are skipped by the key handler) |
| Now (focus tabs) | Add note to lead | POST /crm/leads/{id}/activities | lead `allowed_actions` add_activity | shown ungated | gated by leadCan(lead,"add_activity"); 403 hides: NowTabs.tsx:30,67 |
| Now (client 360) | "Full profile" link | /admin/call-center?view=clients | client lookup (403 = denied) | shown when card answered 403 | hidden when card denied: NowClient.tsx:55 |
| Now | Copy code / LexGo ID, refresh, scroll rail | local | none | gated OK | none needed |
| Urgent list card | Claim | POST …/urgent-advokat/requests/{id}/claim | lifecycle (rowAction) | gated OK by lifecycle; 403 left it | 403 removes it (falls back to Open detail): UrgentCard.tsx:42, CcxUrgent.tsx:353 |
| Urgent list card | Start meeting (main + menu) | POST …/requests/{id}/meeting | meetings.manage (canMakeCalls) + working status | shown ungated | gated by canMakeCalls; 403 removes: UrgentCard.tsx:39,42, CcxUrgent.tsx:342,368 |
| Urgent list card | Join meeting | POST /chat/rooms/{room}/calls/{id}/join | participant | gated OK | none needed |
| Urgent list card | Transfer / move status / cancel menu items | open detail step | lifecycle (working / next_statuses / not finished) | gated OK | none needed (detail step enforces refusals) |
| Urgent list card | Open chat / open detail | link / local | participant | gated OK | none needed |
| Urgent list | Tabs, filters, refresh, show more | GET | none | gated OK | none needed |
| Urgent list (duty lawyer) | Assigned-work fallback on 403 | GET /urgent-advokat/requests/assigned | navbatchi_yurist | gated OK | none needed |
| Urgent detail | Claim / take over | POST …/claim | lifecycle; take-over = admin role (was raw role check) | gated OK (role list) | routed through can(session, [], {roles:["admin"]}); 403 removes claim: UrgentDetail.tsx:95,190 |
| Urgent detail | Start / join meeting | POST …/meeting | meetings.manage (canMakeCalls) + working, video channel | shown ungated | gated by canMakeCalls; 403 removes: UrgentDetail.tsx:97,208 |
| Urgent detail | Complete (step + submit) | POST …/complete | working status | gated OK; 403 left it | 403 removes it: UrgentDetail.tsx:190 |
| Urgent detail | Transfer (step + submit) | POST …/transfer | working status | gated OK; 403 left it | 403 removes it: UrgentDetail.tsx:190 |
| Urgent detail | Move status (menu + step) | PATCH …/status | lifecycle next_statuses | gated OK; 403 left it | 403 removes it: UrgentDetail.tsx:190 |
| Urgent detail | Cancel (step + submit) | POST …/cancel | not finished | gated OK; 403 left it | 403 removes it: UrgentDetail.tsx:190 |
| Urgent detail | Assign group / regroup (candidates step) | POST …/assign-group | group kind, not finished | gated OK; 403 left it | 403 removes it: UrgentCandidates.tsx:165 → UrgentDetail onRefused |
| Urgent detail | Footer actions bar | — | — | empty footer could render (fragment always truthy) | footer only when it has an action: UrgentDetail.tsx:400,779 |
| Urgent detail | Open chat, history toggles, sources toggle, copy, retry | local / GET | none | gated OK | none needed |
| Ccx shell | Client search box, search button, Ctrl+K | GET /call-center/clients/search | call_center role or callcenter.access or users.manage (duty lawyer has none) | shown ungated | hidden: CcxShell.tsx:81,155,224,228 |
| Ccx shell | Nav tabs (top + mobile) | pages | AdminShell NAV perms (dock passed in) | gated OK | none needed |
| Ccx shell | HRM link | /internal | AdminShell `hrm` prop | gated OK | none needed |
| Ccx shell | Operator status menu + Shift hotkeys, theme, language, appearance, profile, logout | local | none | gated OK | none needed |
| Ccx shell | Feedback button | (components/internal — other area) | — | — | outside partition |
| CCX Meetings | "New meeting" header CTA | POST /secure-chats + POST /calls (startCall) | meetings.manage (canMakeCalls) | gated OK | none needed |
| CCX Meetings | "New meeting" empty-state CTA | same | meetings.manage (canMakeCalls) | gated OK | none needed |
| CCX Meetings | New-meeting form (title, participants, duration, Start, Clear) | createSecureChat + startCall | meetings.manage | shown disabled (form replaced by a "no permission" note inside a hidden side panel) | NewMeeting returns null without canHost (components/ccx/meetings/NewMeeting.tsx:112); side panel not mounted without canHost (CcxMeetings.tsx:407) |
| CCX Meetings | Quick start by phone | GET /users/search + startCall | meetings.manage | gated OK | moved under the same canHost wrapper (CcxMeetings.tsx:407) |
| CCX Meetings | "All" scope tab | GET /admin/calls | leads.manage | gated OK | none needed (lead's change) |
| CCX Meetings | Call detail (row icon / all-meetings row) | GET /admin/calls/{id} | leads.manage | gated OK | none needed |
| CCX Meetings | Join / rejoin a call | CallRoom (participant token) | participant of the call; time/status lock (can_start_now) | gated OK | none needed (disabled only for time/status lock, with reason text) |
| CCX Meetings | Refresh / show more / tabs | GET /calls/history | own history | gated OK | none needed |
| CCX Tasks | Create task (header + empty-state) | POST /task-management | meta capabilities.create | gated OK | none needed |
| CCX Tasks | Pick assignees while creating | POST /task-management (assignee_user_ids) | meta capabilities.assign | shown ungated | picker hidden and no ids sent without canAssign (components/ccx/tasks/TaskSheet.tsx:51,77; CcxTasks.tsx:587) |
| CCX Tasks | Card move buttons / drag & drop between columns | POST /task-management/{id}/status | task can_change_status + next_statuses | gated OK | none needed |
| CCX Tasks | Card approve (simple flow) | DELETE /task-management/{id} | task can_delete | gated OK | none needed |
| CCX Tasks | Drawer forward/back status buttons | POST …/status | can_change_status + next_statuses | gated OK | none needed |
| CCX Tasks | Drawer Edit / add attachment | PATCH /task-management/{id}, POST …/attachments | task can_edit | gated OK | none needed |
| CCX Tasks | Drawer Assign | PUT …/assignees | task can_assign | gated OK | none needed |
| CCX Tasks | Drawer Delete / Approve & archive | DELETE /task-management/{id} | task can_delete | gated OK | empty "more" group no longer rendered when none of edit/assign/delete (components/ccx/tasks/Drawer.tsx:220) |
| CCX Tasks | Return with reason | POST …/status (in_progress) | can_change_status + next_statuses | gated OK | none needed |
| CCX Tasks | 403 on any task action | — | — | after-click 403 only | none needed: handleError reloads board + detail, whose fresh can_* flags remove the action; global safety net refreshes perms |
| CCX Tasks | Filters, scope, period, load more, attachment download/lightbox | GET /task-management… | read | gated OK | none needed |
| CCX Support | Claim (list row + chat head) | POST /call-center/support/tickets/{id}/claim | support queue access (list 403 → gate page); object: open & unassigned/waiting | gated OK | none needed |
| CCX Support | Transfer | POST …/transfer | own open ticket + assist capabilities.operator_transfer | shown disabled (+ "transfer off" note) | hidden when capability off; note removed (components/ccx/support/Chat.tsx:105) |
| CCX Support | Close | POST …/close | own open ticket | gated OK | none needed |
| CCX Support | Composer (text, quick phrases, Send) | POST …/messages | own open ticket (assignee-only) | shown disabled | not rendered unless writable; read-only note kept (components/ccx/support/Chat.tsx:380) |
| CCX Support | Audio / video call | startSupportCall | own open ticket + capabilities.support_call | gated OK | none needed |
| CCX Support | Remote assistance | remote-assist console | own ticket, active call | gated OK | none needed (disabled only until the call is live) |
| CCX Support | AI modal "transfer"/"close" | same | same as buttons | gated OK | none needed |
| CCX Support | Tabs, only-mine, search, refresh, open first | GET …/tickets | queue access | gated OK | none needed |
| CCX Support / Admin support queue | Assist action tabs (plan, document, marketplace, supplement, urgent) | POST /call-center/support/tickets/{id}/assist/* | assist capabilities.subscription_checkout / document_lawyer_request / marketplace_purchase_request / urgent_advokat_request | shown disabled ("off" tab + "capability off" panel) | only allowed tabs rendered; card hidden when none; keyboard nav over shown tabs (components/support/assist/AssistPanel.tsx:215,274,306) |
| CCX Support / Admin support queue | Assist client-card call buttons | startSupportCall | capabilities.support_call, not view-only | gated OK | none needed |
| CCX Support / Admin support queue | Assist sub-forms (create subscription / document request / purchase / supplement / urgent; submit) | assist endpoints | tab capability; blocks (closed/notAssigned/notClient) lock the panel | gated OK | none needed (ineligible package sellers stay disabled: business eligibility, not permission) |
| CCX Support / Admin support queue | Supervisor watching another operator's ticket | read-only | isSupportSupervisor | gated OK | none needed (view-only, no actions) |
| Admin support queue (/admin/call-center/support) | Claim (row + detail) | …/claim | queue access; open & waiting | gated OK | actions row no longer rendered empty (components/support/SupportQueue.tsx:599) |
| Admin support queue | Transfer | …/transfer | own open + operator_transfer | shown disabled (+ note) | hidden when capability off; note removed (SupportQueue.tsx:610) |
| Admin support queue | Close | …/close | own open ticket | gated OK | none needed |
| Admin support queue | Composer | …/messages | own open ticket | shown disabled | form not rendered without canWrite; read-only banner kept (components/support/SupportChat.tsx:877) |
| Admin support queue | Calls / remote assist | startSupportCall / RA console | canCall = own open + support_call; RA own ticket | gated OK | none needed |
| Client/lawyer/advocate support hub | New chat / operator handoff / send / reopen own ticket | POST /support/tickets, …/messages, …/reopen | own tickets (any signed-in user) | gated OK | composer hidden for a foreign ticket via same SupportChat change |
| CCX Analytics | Period, demo toggle, refresh, drill tiles | GET /calls/analytics | read | gated OK | none needed |
| CCX Profile | Edit own name/email/photo | PATCH /clients/me/profile | own account | gated OK | none needed |
| CCX Profile | Shift status, theme, background, language, logout | local only | none | gated OK | none needed |
| Admin call-center console (page.tsx) | Cockpit tab | GET /call-center/marketplace/cockpit | callcenter.access / call_center roles (isCallCenterUser) | gated OK | none needed |
| Admin call-center console | Queue tab | GET /call-center/queue | isCallCenterUser | gated OK | none needed |
| Admin call-center console | Urgent / quality complaints tabs (UrgentAdvocateQueue, QualityComplaints — outside part D) | /urgent-advokat/*, /call-center/quality-complaints | isCallCenterUser | gated OK | none needed |
| Admin call-center console | Escalations, mpComplaints, warranty, cancellations, payouts tabs | /call-center/marketplace/* | isCallCenterUser (+403 hides tab) | gated OK | none needed |
| Admin call-center console | Experience / achievements / licenses tabs | /call-center/marketplace/{experience,achievements,advocate-licenses} | marketplace.experience.review | gated OK | none needed |
| Admin call-center console | Leads tab (embedded CRM board) | GET /crm/kanban, /crm/meta | crm.leads.view (CRM page code) | shown ungated (denied empty state) | page.tsx:81,140 rendered only with can(crm.leads.view); empty panel → tab removed by CcTabPanel |
| Admin call-center console | Clients tab (client lookup + call log) | GET /call-center/clients/search | callcenter.access or users.manage (contract comment in page) | after-click 403 only | page.tsx:82,143 rendered only for cc or can(users.manage) |
| Admin call-center console | Staff live cards (MarketWatcher) | /ws events | isCallCenterUser | gated OK | none needed |
| Operator / duty workspace routing | ccx views / DutyView fallback | role nav | navbatchi_yurist / call_center_lawyer → urgent only | gated OK | none needed |
| Call-center queue (CallCenterQueue) | Refresh | GET /call-center/queue | callcenter.access; 403 → component null | gated OK | none needed |
| Call-center queue | Assign next seller (order row) | POST /matching/orders/{id}/assign-next | orders.manage (code comment backend.ts:4121) | shown ungated | CallCenterQueue.tsx:48-53 can(orders.manage); 403 → button removed; empty action cell hidden |
| Call-center queue | Open in CRM (lead row) | /admin/crm/leads/{id} | crm.leads.view | shown ungated | CallCenterQueue.tsx:53 can(crm.leads.view); action cell hidden when empty |
| Call-center queue | Open urgent board (urgent row) | anchor #cc-urgent | isCallCenterUser | gated OK | none needed |
| Call-center queue | Show more (pager) | local | — | gated OK | none needed |
| Cockpit (CcFocus) | Refresh / retry | GET /call-center/marketplace/cockpit | callcenter; 403 → component null | gated OK | none needed |
| Cockpit | Prev / next / skip / pick row | local | — | gated OK | none needed |
| Cockpit | Go to queue | tab switch | only tabs the console offers; otherwise a lock note (no button) | gated OK | none needed |
| Escalations (EscalationQueue) | Refresh | GET /call-center/marketplace/assignment-escalations | callcenter; 403 → queue null | gated OK | none needed |
| Escalations | Offer resolution / reassign / message / cancel / full refund | POST /call-center/marketplace/assignment-escalations/{id}/resolve | backend allowed actions per escalation (esc.actions) | gated OK | EscalationQueue.tsx: 403 now removes that action from the row (refused set), message kept |
| Marketplace complaints (MarketplaceComplaints) | Refresh / status filter / pager | GET /call-center/marketplace/complaints | callcenter; 403 → queue null | gated OK | none needed |
| Marketplace complaints | Download evidence | evidence download | visible evidence of the record | gated OK | none needed |
| Marketplace complaints | Resolve (open dialog) + ruling choices | POST /call-center/marketplace/complaints/{id}/resolve | allowed_actions (c.actions) | gated OK | 403 now removes Resolve from the row; fixed `{0 && …}` rendering a stray "0" when actions is empty |
| Marketplace complaints | Add evidence file (dialog) | POST /call-center/marketplace/complaints/{id}/evidence | no per-record flag | after-click 403 only | 403 removes the upload control (message kept); backend gap D3 |
| Warranty (WarrantyQueue) | Refresh / filter / pager | GET /call-center/marketplace/warranty | callcenter; 403 → queue null | gated OK | none needed |
| Warranty | Resolve (replacement / refund / reject) | POST /call-center/marketplace/warranty/{id}/resolve | available_resolutions (claim.resolutions) + unresolved | gated OK | 403 now removes Resolve from the row |
| Payouts (PayoutQueue) | Refresh / filter / view switch / pager | GET /call-center/marketplace/payouts, /payout-recoveries | callcenter; 403 → queue null | gated OK | none needed |
| Payouts | Mark paid / mark recovered | POST …/payouts/{id}/mark-paid, …/payout-recoveries/{id}/resolve | status operator_required/provider_failed/under_review (payoutActionable) | gated OK (status only) | 403 now removes the button from the row; backend gap D2 |
| Cancellations (CancellationQueue) | Refresh / filter / pager / details | GET /call-center/marketplace/cancellation-reviews | callcenter; 401/403 → queue null | gated OK | none needed |
| Cancellations | Resolve (dialog) | POST …/cancellation-reviews/{id}/resolve | open review + backend resolution options | gated OK | ResolveDialog onForbidden → ReviewItem refused hides Resolve; empty `.ccx-acts` no longer rendered |
| Cancellations | Download attachment | file download | record's own files | gated OK | none needed |
| Cancellations | Start discussion chat / create | POST …/cancellation-reviews/{id}/chat | open review; no per-record flag | after-click 403 only | DiscussionChat: 403 removes start/close (message kept); backend gap D4 |
| Cancellations | Close discussion chat | POST …/cancellation-reviews/{id}/chat/close | chat not read-only | after-click 403 only | same as above |
| Cancellations | Open chat room link | /chat link | chat participant | gated OK | none needed |
| Verification screen (VerifyReview; experience, achievements, licenses, /admin/call-center/experience/{id}) | Checklist verdicts + notes | POST …/{kind}/{id}/review | marketplace.experience.review + status pending_review | shown disabled (not pending) / ungated (permission) | VerifyReview.tsx: rendered only when pending && can(review perm); 403 removes them |
| Verification screen | Decide approve / changes / reject + confirm | POST …/{kind}/{id}/review | marketplace.experience.review + pending | shown disabled (not pending) / ungated | whole decision section only when pending && may review; errors still shown outside |
| Verification screen | Start review room | POST …/{kind}/{id}/communication | marketplace.experience.review + pending | shown disabled (not pending) | rendered only when pending && may review; 403 removes |
| Verification screen | Close review room | POST …/{kind}/{id}/communication/close | marketplace.experience.review, room open | shown ungated | gated on review perm; 403 removes |
| Verification screen | Audio / video call in room | POST /secure-chats/{room}/calls | room.call_types (backend) + review perm | gated OK (call_types) | also needs review perm; 403 removes call buttons |
| Verification screen | Open room / history link, download evidence, seller tel link | reads | visible to reviewer | gated OK | none needed |
| Advocate licenses: suspensions | Add / edit / archive suspension, upload evidence | POST/PATCH/DELETE /call-center/marketplace/advocate-practice/{seller}/suspensions[/evidence] | marketplace.experience.review (review queues + details) | shown ungated | AdvocateLicenseReview.tsx: add/edit/archive/form only with can(review perm); 403 removes them and closes the form |
| Advocate licenses: suspensions | Download suspension file | file download | — | gated OK | none needed |
| Experience / achievements / licenses queues | Refresh / filter / kind filter / show more / open row | GET queues | marketplace.experience.review; 403 → queue null | gated OK | none needed |
| Client search (CcClientSearch) | Search | GET /call-center/clients/search | callcenter.access or users.manage | after-click 403 only | 403 keeps the "no access" note and removes the search form; panel itself now gated in page.tsx |
| Client card (CcClientCard) | Open card / tabs | GET /call-center/clients/{id} | same as search; 403 → note | gated OK | none needed |
| Client card | Log call | POST /call-center/calls | isCallCenterUser (canLog) | gated OK | none needed |
| Client card | Calls tab | GET /call-center/calls?client | isCallCenterUser | gated OK | none needed |
| Client card | Call (tel: link) | none | — | gated OK | none needed |
| Call log (CcCallLog) | Refresh / filters | GET /call-center/calls | isCallCenterUser; 403 → null | gated OK | none needed |
| Call log | Log call (CcCallForm) | POST /call-center/calls | isCallCenterUser (rendered only for cc) | gated OK | none needed (403 safety net re-reads callcenter.access and unmounts it) |
| Video meeting button (CcMeetingButton) | Start meeting with client | POST /secure-chats + POST /secure-chats/{id}/calls | meetings.manage / call_center roles (canMakeCalls) | gated OK | 403 now removes the button |
| /admin/call-center/support, /support/{ticketId} | Support queue (SupportQueue) | /call-center/support/* | callcenter.access (AdminShell NAV) | gated OK | none needed (component is components/support, other part) |
| /admin/call-center/experience/{id} | Experience review deep link | GET/POST /call-center/marketplace/experience/{id} | marketplace.experience.review (hidden NAV entry) | gated OK | VerifyReview gates as above |

#### Counts
- Actions audited: 225 (A 71 · B 62 · C 40 · D 52)
- Hidden / fixed by me: 69 (A 13 · B 36 · C 7 + 2 empty containers · D 13), plus 403-removal added to 6 already-gated actions in D
- Already OK: 154 (A 58 · B 26 · C 31 · D 39)
- Backend gaps: 7 (A1–A3, D1–D4) — see CALLCENTER-questions.md

#### Files changed
- app/[locale]/admin/call-center/page.tsx
- components/admin/callcenter/AdvocateLicenseReview.tsx
- components/admin/callcenter/cancellations/CancellationQueue.tsx
- components/admin/callcenter/cancellations/DiscussionChat.tsx
- components/admin/callcenter/cancellations/ResolveDialog.tsx
- components/admin/callcenter/cancellations/ReviewItem.tsx
- components/admin/callcenter/EscalationQueue.tsx
- components/admin/callcenter/MarketplaceComplaints.tsx
- components/admin/callcenter/PayoutQueue.tsx
- components/admin/CallCenterQueue.tsx
- components/admin/callcenter/VerifyReview.tsx
- components/admin/callcenter/WarrantyQueue.tsx
- components/admin/CcClientSearch.tsx
- components/admin/CcMeetingButton.tsx
- components/ccx/CcxShell.tsx
- components/ccx/clients/CallLog.tsx
- components/ccx/clients/ClientProfile.tsx
- components/ccx/crm/detail/leadAi.tsx
- components/ccx/crm/detail/leadCalls.tsx
- components/ccx/crm/detail/leadCards.tsx
- components/ccx/crm/leads/LeadCard.tsx
- components/ccx/crm/leads/NewLeadSheet.tsx
- components/ccx/crm/misc/misc.css
- components/ccx/crm/sections/CrmCustomerX.tsx
- components/ccx/crm/sections/CrmLeadX.tsx
- components/ccx/crm/sections/CrmOverviewX.tsx
- components/ccx/crm/sections/CrmPerformanceX.tsx
- components/ccx/meetings/CcxMeetings.tsx
- components/ccx/meetings/NewMeeting.tsx
- components/ccx/now/NowClient.tsx
- components/ccx/now/NowFocus.tsx
- components/ccx/now/NowTabs.tsx
- components/ccx/panel/panel.css
- components/ccx/queues/CcxQueues.tsx
- components/ccx/queues/decide/CancelChat.tsx
- components/ccx/queues/decide/EscalationDecide.tsx
- components/ccx/queues/decide/MpComplaintDecide.tsx
- components/ccx/queues/decide/PayoutDecide.tsx
- components/ccx/queues/decide/QualityDecide.tsx
- components/ccx/queues/decide/VerifyDecide.tsx
- components/ccx/queues/decide/VerifyRoom.tsx
- components/ccx/queues/decide/VerifySuspensions.tsx
- components/ccx/queues/decide/WarrantyDecide.tsx
- components/ccx/queues/QueuesBoard.tsx
- components/ccx/queues/queues.css
- components/ccx/queues/useQueues.ts
- components/ccx/support/Chat.tsx
- components/ccx/tasks/CcxTasks.tsx
- components/ccx/tasks/Drawer.tsx
- components/ccx/tasks/TaskSheet.tsx
- components/ccx/urgent/CcxUrgent.tsx
- components/ccx/urgent/UrgentCandidates.tsx
- components/ccx/urgent/UrgentCard.tsx
- components/ccx/urgent/UrgentDetail.tsx
- components/support/assist/AssistPanel.tsx
- components/support/SupportChat.tsx
- components/support/SupportQueue.tsx

## CRM / ROP / sales

Area: `components/crm/**`, `components/admin/LeadDrawer*`, `app/[locale]/admin/crm/**`, `app/[locale]/admin/pipeline/**`.
Source of truth: `GET /crm/meta.permissions` via `crmCan(meta, …)` and each lead's `allowed_actions` via `leadCan(lead, …)`
(contracts: CRM handoff 2026-10-29 §20, ROP final handoff 2026-11-04 §3–4, §8, §11, §20–21). Covers operator (call center),
ROP (`sales_head`) and superadmin. Safety net already present: `useCrmError()` (components/crm/bits.tsx) re-reads `/crm/meta`
on any 403, so every meta-gated action leaves the screen after a revoke; lead writes now also re-read the lead (allowed_actions).

| Screen | Action | Endpoint | Permission / rule | Before | Fix |
|---|---|---|---|---|---|
| CRM frame (all CRM pages) | Section menu / page access | — | per section (`sections.ts`) | gated OK | none needed |
| CRM frame | Retry loading CRM settings | `GET /crm/meta` | none (read) | gated OK | none needed |
| CRM frame ⌘K palette | Search leads | `GET /crm/leads` | `crm.leads.view` | gated OK | none needed |
| CRM frame ⌘K palette | Search customers | `GET /crm/customers` | `crm.customers.view` | gated OK | none needed |
| CRM frame ⌘K palette | "New lead" | `POST /crm/leads` | `crm.leads.manage` | gated OK | none needed |
| CRM frame ⌘K palette | "New customer" | `POST /crm/customers` | `crm.customers.manage` | gated OK | none needed |
| CRM frame ⌘K palette | "Export" | `POST /crm/exports` | `crm.exports.create` | gated OK | none needed |
| New-lead sheet | Create lead / "Create anyway" (duplicate) | `POST /crm/leads` | `crm.leads.manage` (sheet only opens from gated entries) | gated OK | none needed |
| New-lead sheet → customer picker | "New customer" row in the picker | `POST /crm/customers` | `crm.customers.manage` | shown ungated | hidden: CustomerPicker.tsx:17,30 (`onNew` optional) + CrmFrame.tsx:392,468,520; help text switches to a pick-only line (CrmFrame.tsx:469, i18n key `crm.newLead.customerHelpPick`) |
| Export tray | Download ready export | `GET /crm/exports/{id}/download` | `crm.exports.create` (only own started jobs appear) | gated OK | none needed |
| Export tray | Dismiss job | local | — | gated OK | none needed |
| Overview (operator) | Header "Export" | `POST /crm/exports` | `crm.exports.create` | gated OK | none needed |
| Overview (operator) | Header "New lead" | `POST /crm/leads` | `crm.leads.manage` | gated OK | none needed |
| Overview (operator) | Queue / Mine / Overdue counters (links to leads) | `GET /crm/leads` | `crm.leads.view` | shown ungated | hidden without leads view: CrmOverview.tsx:172 |
| Overview (operator) | Status donut → leads list | `GET /crm/leads` | `crm.leads.view` | gated OK | none needed |
| Overview (operator) | My performance period chips | `GET /crm/me/metrics` | `crm.analytics.self` | gated OK | none needed |
| Overview (operator) | "Global analytics" link | `GET /crm/analytics` | superadmin session AND `crm.analytics.global` (+ `revenue_visible`) | shown ungated | CrmOverview.tsx:105,283 via `crmGlobalAnalytics` |
| Overview (operator) | Retry lists | `GET /crm/leads` | read | gated OK | none needed |
| ROP overview | KPI cards "All leads"/"Queue"/"Overdue" (links) | `GET /crm/kanban`, `/crm/leads` | `crm.leads.view` | shown ungated | links only with leads view: rop/RopOverview.tsx:130-132 |
| ROP overview | KPI "Live calls" link | `GET /crm/live-calls` | `crm.live_calls.view` | gated OK | none needed |
| ROP overview | "All operators" button | `GET /crm/operators` | section `operators` (`crm.leads.view` + scope `all`) | shown ungated | rop/RopOverview.tsx:163 via `sectionOk` |
| ROP overview | Operator row → their leads | `GET /crm/leads` | `crm.leads.view` (list loads only then) | gated OK | none needed |
| ROP overview | Robot runs / failed runs / drafts "Review" | automation endpoints | `crm.automation.manage` | gated OK | none needed |
| ROP overview | Live call rows / "Open live office" | `GET /crm/live-calls` | `crm.live_calls.view` | gated OK | none needed |
| ROP shell | HRM pill | `/internal` | `hrm` flag from shell (page-level, outside CRM) | gated OK | none needed |
| Leads list | Header "Export" | `POST /crm/exports` | `crm.exports.create` | gated OK | none needed |
| Leads list | Header "New lead" | `POST /crm/leads` | `crm.leads.manage` | gated OK | none needed |
| Leads list | "Manage columns" (table view) | `PUT /crm/kanban/columns` | `crm.automation.manage` (contract 10-29 §6) | gated OK | none needed (confirm code: Q7) |
| Leads list | Row "Claim" button | `POST /crm/leads/{id}/claim` | lead `allowed_actions` `claim`, unassigned | gated OK | column now removed when no row can claim (no empty action column): CrmLeads.tsx:319,499,551 |
| Leads list | Claim refused (403) | — | rule 5 | after-click 403 only | list re-read so `allowed_actions` drop the button; meta re-read by `useCrmError`: CrmLeads.tsx:269 |
| Leads list | Keyboard `c` = claim | `POST /crm/leads/{id}/claim` | `claim` action (guarded in `claim()`) | gated OK | hint no longer advertises `c` without `crm.leads.claim`: CrmLeads.tsx:358 (i18n `crm.leads.keysNoClaim`) |
| Leads list | Operator filter | `GET /crm/operators` | `crm.leads.assign` | gated OK | none needed |
| Leads list | Saved views / filters / tabs / pager | local + `GET /crm/leads` | read | gated OK | none needed |
| Leads list | Empty "Mine" text "Claim one from the queue" | — | `crm.leads.claim` | shown ungated | text omitted without claim: CrmLeads.tsx:484 |
| Kanban board | Drag card to another column / "Move to" menu status items | `POST /crm/leads/{id}/status` | `change_status` + backend transition map | gated OK | none needed |
| Kanban board | Up / Down / drag inside column | `PATCH /call-center/leads/{id}/move` | `change_status` or `move` | gated OK | none needed (confirm: Q6) |
| Kanban board | Reject → reason dialog | `POST /crm/leads/{id}/status` | `change_status` | gated OK | none needed |
| Kanban board | Card "Claim" | `POST /crm/leads/{id}/claim` | `claim` | gated OK | none needed (board re-reads after any failure) |
| Kanban board | Column cog (stage title/colour) | `PUT /crm/kanban/columns` | `crm.automation.manage` | gated OK | none needed |
| Kanban board | "Manage columns" dialog (rename, colour, reorder, save) | `PUT /crm/kanban/columns` | `crm.automation.manage` | gated OK | none needed |
| Kanban board | Load more in column | `GET /crm/kanban/...` | read | gated OK | none needed |
| Call-center embed board | Claim / mine-all / open CRM | as above | `crm.leads.view`, `claim` | gated OK | none needed |
| Lead workspace — glance | Claim (primary) | `POST /crm/leads/{id}/claim` | `claim`, unassigned | gated OK | none needed |
| Lead workspace — glance | Reopen (primary, final status) | `POST /crm/leads/{id}/reopen` | `reopen` or `edit` | gated OK | none needed (Q5) |
| Lead workspace — glance | Call result (primary) | `POST /crm/leads/{id}/activities` | `add_activity` | gated OK | none needed |
| Lead workspace — glance | Move to next status / "Other status" menu | `POST /crm/leads/{id}/status` | `change_status` + transitions | gated OK | none needed |
| Lead workspace — glance | AI Copilot button | `POST /crm/leads/{id}/ai/runs` | `run_ai` | gated OK | none needed |
| Lead workspace — glance | Action row when none of the above | — | layout | shown ungated | row not rendered: LeadGlance.tsx:201 |
| Lead workspace — glance | Set / change next action | `PATCH /crm/leads/{id}` | `set_next_action` | gated OK | none needed |
| Lead workspace — glance | Copy phone / show more facts | local | — | gated OK | none needed |
| Lead workspace — any write | Refused write (403) | any lead write | rule 5 | after-click 403 only | lead re-read so allowed_actions remove the action: CrmLeadPage.tsx:127 |
| Lead workspace — panes | Robots pane tab | `GET /crm/automation/runs?lead=` | `crm.automation.manage` | gated OK | none needed |
| Lead workspace — timeline | Composer (note/call note/…) | `POST /crm/leads/{id}/activities` | `add_activity` | gated OK | none needed |
| Lead workspace — timeline | Follow-up reminder in composer | `PATCH /crm/leads/{id}` | `set_next_action` | gated OK | none needed |
| Lead workspace — timeline | Template slash-picker | `GET /crm/operator-templates` | read | gated OK | none needed |
| Lead workspace — timeline | View timeline | `GET /crm/leads/{id}/timeline` | `view_timeline` | gated OK | none needed |
| Lead workspace — history | Retry | `GET /crm/leads/{id}/history` | read | gated OK | none needed |
| Lead workspace — calls | Start call form | `POST /crm/leads/{id}/calls` | `start_call` + `crm.calls.start` | gated OK | none needed |
| Lead workspace — calls | Active call: speaker, transcript line, send | `POST /crm/calls/{id}/transcript` | `crm.calls.start` | shown ungated | read-only transcript without it: LeadCalls.tsx:233,324 (own-call rule: Q1) |
| Lead workspace — calls | Active call: live AI assist checkbox | `POST /crm/calls/{id}/transcript` (`request_ai_assist`) | `crm.calls.start` + `crm.ai.use` | shown ungated | LeadCalls.tsx:234,270,354 (Q3) |
| Lead workspace — calls | Active call: end as … + summary + "End call" | `POST /crm/calls/{id}/complete` | `crm.calls.start` | shown ungated | LeadCalls.tsx:393 (Q1) |
| Lead workspace — calls | Recording link | `recording_url` | `crm.calls.recordings.view` (mapper drops URL otherwise) | gated OK | none needed |
| Lead workspace — SMS | New SMS draft form | `POST /crm/leads/{id}/sms` | `crm.sms.manage` | gated OK | none needed |
| Lead workspace — SMS | Edit / Approve / Approve edited / Retry send | `POST /crm/sms/{id}/approve` | `crm.sms.manage` + status draft/scheduled/provider-missing | gated OK | none needed |
| Lead workspace — side | Duplicate "Compare" | `POST /crm/leads/{id}/duplicate-resolution` | `resolve_duplicate` or `edit` | gated OK | none needed |
| Lead workspace — side | Edit lead facts | `PATCH /crm/leads/{id}` | `edit` | gated OK | none needed |
| Lead workspace — side | Prepare order (conversion) | `POST /crm/leads/{id}/conversion` | `prepare_conversion` | gated OK | empty button row removed when absent: LeadSide.tsx:177 |
| Lead workspace — side | Assign | `POST /crm/leads/{id}/assign` | `assign` | gated OK | empty button row removed when neither: LeadSide.tsx:207 |
| Lead workspace — side | Transfer | `POST /crm/leads/{id}/transfer` | `transfer`, has operator | gated OK | (same row) LeadSide.tsx:207 |
| Lead workspace — side | Add watcher / remove watcher chip | `POST/DELETE /crm/leads/{id}/watchers` | `manage_watchers` | gated OK | none needed |
| Lead workspace — side | Contact copy / open (tel, t.me, mail) | local | — | gated OK | none needed |
| AI Copilot drawer | Run type chips / language / instruction / Run | `POST /crm/leads/{id}/ai/runs` | `run_ai` (drawer only opens with it) | gated OK | none needed |
| AI Copilot drawer | Select suggestion checkboxes, "Apply n", preview, Apply | `POST /crm/ai/runs/{id}/apply` | lead `edit` (writes lead with lock_version) | shown ungated | read/copy-only without `edit`: CopilotPanel.tsx:54,268,340,379 (Q2) |
| AI Copilot drawer | "Send as SMS" on sms_draft | → SMS pane draft | `crm.sms.manage` | shown ungated | CrmLeadPage.tsx:192 |
| AI Copilot drawer | Copy draft / history runs | local / read | — | gated OK | none needed |
| Status / Reopen / Next-action / Edit / Assign / Watcher / Duplicate / Conversion sheets | Submit | respective lead endpoints | opened only from gated buttons; ReopenSheet operator picker needs `crm.leads.assign` | gated OK | none needed |
| Customers list | "New customer" | `POST /crm/customers` | `crm.customers.manage` | gated OK | none needed |
| Customers list | Empty text "…or add one yourself" | — | `crm.customers.manage` | shown ungated | view-only text: CrmCustomers.tsx:129 (i18n `crm.customers.emptyTextView`) |
| Customers list | Filters / pager / retry | `GET /crm/customers` | read | gated OK | none needed |
| Customer profile | "New lead" for this customer | `POST /crm/leads` | `crm.leads.manage` | gated OK | none needed |
| Customer profile | Edit customer | `PATCH /crm/customers/{id}` | `crm.customers.manage` | gated OK | none needed |
| Customer profile | Merge duplicates | `POST /crm/customers/merge` | `crm.customers.merge` | gated OK | empty action bar removed when none: CrmCustomerPage.tsx:189 |
| Customer profile | Add contact | `POST /crm/customers/{id}/contacts` | `crm.customers.manage` | gated OK | none needed |
| Customer profile | Make contact primary | `PATCH /crm/customers/{id}/contacts/{cid}` | `crm.customers.manage` | gated OK | none needed |
| Customer profile | Archive contact | `DELETE /crm/customers/{id}/contacts/{cid}` | `crm.customers.manage`; last active contact = business lock (disabled with reason, not a permission) | gated OK | none needed |
| Customer profile | Open a current / past lead card | `GET /crm/leads/{id}` | `crm.leads.view` | shown ungated | plain card without leads view: CrmCustomerPage.tsx:68,224,247,372 + crm-customers.css:16 |
| Operators (ROP) | Sort / retry | `GET /crm/operators` | read | gated OK | none needed |
| Operators (ROP) | "Leads" per operator | `GET /crm/leads` | `crm.leads.view` + scope `all` | gated OK | none needed |
| My performance | Period / retry | `GET /crm/me/metrics` | `crm.analytics.self` (section) | gated OK | none needed |
| Global analytics | Period chips | `GET /crm/analytics` | superadmin + `crm.analytics.global` (section) | gated OK | none needed |
| Calls page | Mine/all scope | `GET /crm/leads` + calls | `crm.leads.view_all` | gated OK | none needed |
| Calls page | Open lead (live / to call / recent) | `GET /crm/leads/{id}` | section `crm.calls.start`; feed itself is built from `GET /crm/leads` | gated OK | none needed |
| SMS page | Mine/all scope | `GET /crm/leads` + SMS | `crm.leads.view_all` | gated OK | none needed |
| SMS page | Edit / Approve / Retry send | `POST /crm/sms/{id}/approve` | `crm.sms.manage` + status | gated OK | none needed |
| Live office | Open a live call | `GET /crm/live-calls/{id}` | `crm.live_calls.view` (section) | gated OK | none needed |
| Live office | Recording link | `recording_url` | `crm.calls.recordings.view` | gated OK | none needed |
| Live office | "Open lead" button | `GET /crm/leads/{id}` | `crm.leads.view` | shown ungated | CrmLiveOffice.tsx:27,170,205 |
| Templates | "New template" + create form (type, language, tags, status) | `POST /crm/operator-templates` | `crm.templates.manage` | gated OK | none needed |
| Templates | Empty-state text | — | `crm.templates.manage` | gated OK | none needed |
| Templates | Copy template | local | — | gated OK | none needed |
| Exports page / sheet | Scope buttons (leads / customers / activities) | `POST /crm/exports` | `crm.exports.create` + data view (`crm.customers.view` / `crm.leads.view`) | shown ungated | only readable scopes offered: CrmExports.tsx:56,99 (Q4) |
| Exports page / sheet | Operator filter | `GET /crm/operators` | `crm.leads.view_all` or `crm.leads.assign` | gated OK | none needed |
| Exports page / sheet | Start export | `POST /crm/exports` | `crm.exports.create` (section) | gated OK | none needed |
| Exports page | Download / dismiss jobs | `GET /crm/exports/{id}/download` | `crm.exports.create` | gated OK | none needed |
| Robots (rules) | New robot / from script / smart-script "Make" | `POST /crm/automation/rules` | `crm.automation.manage` (section) | gated OK | none needed |
| Robots (rules) | Edit / dry run / clone / pause / activate / restore / archive / move up-down | `PATCH /crm/automation/rules/{id}`, `POST …/dry-run`, `POST …/rules` | `crm.automation.manage` + rule status | gated OK | none needed |
| Robot builder | Add/remove/reorder conditions & actions, preview, save draft / save active | `POST/PATCH /crm/automation/rules`, `POST …/preview` | `crm.automation.manage` | gated OK | none needed |
| Robot runs | Retry (from step) / Cancel | `POST /crm/automation/runs/{id}/retry` / `…/cancel` | `crm.automation.manage` + run `can_retry` / `can_cancel` | gated OK | none needed |
| Robot runs | Open lead | `GET /crm/leads/{id}` | `crm.leads.view` (every holder of `crm.automation.manage` in the ROP set also holds it) | gated OK | none needed |
| Approval drafts | Approve / approve edited / Reject (+reason) | `POST /crm/automation/drafts/{id}/approve` / `…/reject` | `crm.automation.manage` + status `pending_approval` | gated OK | none needed |
| Lead robots pane | Review drafts / all runs / run rows | automation endpoints | `crm.automation.manage` (pane gated) | gated OK | none needed |
| `/admin/pipeline` | (route) | — | redirects to `/admin/crm/leads?view=board` | gated OK | none needed |
| `LegacyPipeline.tsx` + `components/admin/LeadDrawer.tsx` | All actions (assign, delete, call, note, reminder, video) | `/call-center/leads/*` | — | gated OK | none needed — not routed (dead code; only importer is the unrouted LegacyPipeline); lead may delete both files |

#### Counts
- Actions audited: 113 rows (grouped rows such as the lead sheets and robot rule buttons cover several controls each)
- Hidden / fixed by me: 18 rows (16 `shown ungated` now hidden or made read-only, 2 `after-click 403 only` now re-read so the action leaves) + 4 `gated OK` rows where I removed the empty row/bar/column left behind
- Already OK: 95 rows
- Backend gaps: 7 (CRM-questions.md Q1–Q7; Q1–Q4 sit on rows I fixed with the best signal available today)

#### Files changed
- components/crm/CustomerPicker.tsx — `onNew` optional; no "new customer" row without it
- components/crm/CrmFrame.tsx — lead sheet: new-customer only with `crm.customers.manage`
- components/crm/CrmCustomers.tsx — empty text by permission
- components/crm/CrmLeads.tsx — claim column only when used; key hint/empty text by `crm.leads.claim`; re-read after refused claim
- components/crm/CrmLeadPage.tsx — re-read lead after refused write; "send as SMS" only with `crm.sms.manage`
- components/crm/CopilotPanel.tsx — apply only with lead `edit`
- components/crm/LeadCalls.tsx — active-call controls by `crm.calls.start`, assist by `crm.ai.use`
- components/crm/LeadGlance.tsx — no empty action row
- components/crm/LeadSide.tsx — no empty button rows
- components/crm/CrmCustomerPage.tsx — no empty action bar; lead cards open only with `crm.leads.view`
- components/crm/crm-customers.css — non-link lead card has no hover affordance
- components/crm/CrmOverview.tsx — counters by `crm.leads.view`; analytics link superadmin-only
- components/crm/rop/RopOverview.tsx — KPI links and "All operators" by permission
- components/crm/CrmLiveOffice.tsx — "Open lead" by `crm.leads.view`
- components/crm/CrmExports.tsx — export scopes by view permission
- No mapper change in lib/services/crm.ts. New i18n keys: 3 keys (crm.newLead.customerHelpPick, crm.customers.emptyTextView, crm.leads.keysNoClaim), merged into messages/*.json.

## Studio (constructors, approvals, settings)

Scope: `components/admin/studio/**`, `app/[locale]/admin/studio/**`.
Permission model (no invented codes):
- Studio roles (contract LEXGO_STUDIO_CONSTRUCTORS_FRONTEND_2026_10_07 "Ruxsatlar"): `studio_editor` (create/edit/submit),
  `studio_reviewer` (review), `studio_publisher` (publish/rollback/archive), `studio_admin` + `admin`/`superadmin` (all).
  Read from GET /studio/constructors `user_roles` + session roles via `useStudioAccess()` (lib/services/studio.ts):
  `canEdit`, `canReview`, `canPublish`, `canArchive`, `isAdmin`, `any`.
- Session permission codes: `studio.workflow.manage` (STUDIO_PERM_WORKFLOW), `studio.approval.reassign` (STUDIO_PERM_REASSIGN)
  via `can(session, …)` (already routed: StepMeta.tsx useStudioPerms, StepsTab.tsx, ApprovalsPage.tsx).
- Per-object flags from the backend: `can_edit`/`can_submit`/`can_withdraw`/`can_restore` + action URLs (editor/objectApi.ts
  lifecycleOf), `can_decide`/`can_publish` + step `can_decide` (approvals/model.ts), comment `can_edit`/`can_delete`,
  record `actions.archive/clone/edit/view` URLs (ctorpage), journey `allowed_actions`/`*_url` (journey/journeyApi.ts).
- Page level: SxPage `need` (any/edit/review/admin) + NAV in layout/Page.tsx already hides whole pages.

New shared piece: `components/admin/studio/sx/denied.ts` — `studioDenied(e)`: true on 403 and quietly re-reads
GET /studio/constructors so revoked Studio grants (which /auth/me does not carry, so the global net cannot see them) take
every role-gated action off the screen. Every 403 handler below uses it.

| Screen | Action | Endpoint | Permission / rule | Before | Fix |
|---|---|---|---|---|---|
| Home (/admin/studio) | Excel export button | GET /admin/studio/export.xlsx | isAdmin (studio_admin/admin/superadmin) | gated OK + after-click 403 only | 403 hides it: sx/home/Home.tsx:75,87,93 |
| Home | "Create" (journey) link | → /admin/studio/create | canEdit | gated OK | none needed |
| Home | Need chips / KPI queue links (returned/review/publish) | navigation | canEdit / canReview / canPublish | gated OK | none needed |
| Home | Resume panel "+ create", drafts list | GET /studio/creation-journeys | canEdit | gated OK | none needed |
| Home | Waiting panel rows / "to approvals" | navigation | canEdit/canReview/canPublish per kind | gated OK | none needed |
| Home | Services dialog: wizard links | navigation | canEdit | gated OK | none needed |
| Home | Action items lists | GET /studio/objects, /admin/studio/approvals | role per list (403 → falls back to objects list) | gated OK | none needed |
| Group page (/g/[key]) | New service / New package (StartJourneyButton) | POST /studio/creation-journeys | canEdit | gated OK | none needed |
| Group page | Side panel approvals link, health links | navigation | canReview | gated OK | none needed |
| Group page | Next constructor / records links | navigation | read | gated OK | none needed |
| Constructor page (/c/[code]) | Create (link / StartJourney / AddRule / AddCategory) | POST /studio/objects | canEdit; aria-disabled only for prerequisites (business lock, not permission) | gated OK | none needed |
| Constructor page | Empty-state create CTA | POST /studio/objects | canEdit | gated OK | none needed |
| Constructor page | "Approvals" header link | navigation | canReview | gated OK | none needed |
| Constructor page | "Draft with AI" link | → /admin/studio/ai | canEdit | gated OK | none needed |
| Constructor page | Row: View / Edit | navigation (record actions.view/edit) | edit: canEdit + record edit URL | gated OK | none needed |
| Constructor page | Row: Clone (runtime href) | navigation | canEdit + record clone URL | gated OK | none needed |
| Constructor page | Row: Clone (studio dialog) | POST record actions.clone | canEdit + backend clone URL | gated OK + after-click 403 only | 403 removes it for that row: sx/ctorpage/CloneDialog.tsx:55, RecordTable.tsx:160-163,196,201 |
| Constructor page | Row: Archive | POST record actions.archive | canArchive (publisher+) + backend archive URL | gated OK + after-click 403 only | 403 removes it for that row: RecordTable.tsx:181,197 |
| Constructor page | Reorder toggle + drag/arrow moves | PUT /studio/constructors/{code}/records/reorder | canEdit + reorderable rows | gated OK + after-click 403 only | 403 closes panel, hides toggle: ReorderPanel.tsx:130, RecordTable.tsx:263,331,409 |
| Category tree (K01) | Row: Add child | → editor create | canEdit | gated OK | none needed |
| Category tree | Row clone/archive | as above | as above | gated OK | covered by useRecordActions fix |
| Editor (/o/[id]) | Save (button, menu, Ctrl+S) | POST /studio/objects/{id}/save (or create POST /studio/objects) | lifecycle `can_edit`+save URL, else canEdit; status locks | gated OK + after-click 403 only | 403 removes save, upload, non-contract submit and makes form read-only: model.ts:263,311-315, useEditorState.ts:353,401,404,769,827 |
| Editor | Save with note (menu) | same | same | gated OK | same fix |
| Editor | Submit / Save & submit / Publish-direct (primary) | POST /studio/objects/{id}/submit (+validate) | lifecycle `can_submit`+URL, else canEdit + status | gated OK + after-click 403 only | 403 removes it: useEditorState.ts DENIES submit/validate |
| Editor | Publish (primary + dialog) | POST /admin/studio/objects/{id}/publish | canPublish, status approved, approval-required ctor | gated OK + after-click 403 only | 403 removes it: useEditorState.ts publish catch |
| Editor | Open review (primary) | → review drawer | canReview + status submitted/in_review | gated OK | none needed |
| Editor | Edit (runtime view primary) | → form context edit | canEdit | gated OK | none needed |
| Editor | Unlock live record | local (then save) | editable (lifecycle/canEdit) | gated OK | also off after save 403 (editable) |
| Editor | Clone (menu) | POST /studio/objects/{id}/clone | canEdit | gated OK + after-click 403 only | 403 removes clone + new version |
| Editor | New version (menu) | POST clone | canEdit + layout newVersion | gated OK + after-click 403 only | 403 removes it |
| Editor | Withdraw (menu + locked alert button) | POST /studio/objects/{id}/withdraw | `can_withdraw`+URL; fallback withdraw URL or canEdit | gated OK + after-click 403 only | 403 removes menu item and alert button: useEditorState.ts:792 |
| Editor | Restore (menu / primary) | POST /studio/objects/{id}/restore | `can_restore`+URL; fallback canEdit | gated OK + after-click 403 only | 403 removes it |
| Editor | Archive (menu) | POST /studio/objects/{id}/archive | canArchive, not archived | gated OK + after-click 403 only | 403 removes it |
| Editor | Remote-conflict "Overwrite" | save | can.save | gated OK | follows save fix |
| Editor | Versions tab / Comments tab / Files tab / Steps tab (menu) | GET | read | gated OK | none needed |
| Editor > Versions | Rollback (row + preview dialog) | POST /admin/studio/objects/{id}/rollback | canPublish, version rollbackable | gated OK (aria-disabled only for unsaved edits) + after-click 403 only | 403 removes it |
| Editor > Versions | Export versions xlsx | GET /admin/studio/objects/{id}/versions/export.xlsx | canReview (see Q3) | gated OK + after-click 403 only | 403 hides bar: drawer/VersionsTab.tsx:104,118,140 |
| Editor > Versions | Preview / download version file | GET | read | gated OK | none needed |
| Editor > Files | Upload / drop zone | POST /studio/objects/{id}/file | editable + object saved | gated OK + after-click 403 only | 403 removes drop zone (can.upload) |
| Editor > Files | Download file | GET | read | gated OK | none needed |
| Editor > Comments | Write comment | POST /studio/objects/{id}/comments | any studio role, not archived | gated OK + after-click 403 only | 403 removes composer (deny "comment") |
| Editor > Comments | Edit comment | PATCH …/comments/{cid} | comment `can_edit` else admin or author | gated OK + after-click 403 only | 403 removes it for that comment: useEditorState.ts:1324 (refusedCmt overlay) |
| Editor > Comments | Delete comment | DELETE …/comments/{cid} | comment `can_delete` else admin or author | gated OK + after-click 403 only | 403 removes it for that comment: useEditorState.ts:1344 |
| Editor > Steps | Reassign step | POST approval step reassign | `studio.approval.reassign` | gated OK + after-click 403 only | 403 keeps message in dialog, button gone after: drawer/StepsTab.tsx:74,149,175, ReassignDialog.tsx:87 |
| Inline drawer (refs/rules in forms) | Add / edit inline record, pending chips | POST/save /studio/objects | canEdit (useInlineAccess) | gated OK | none needed |
| Inline drawer | Save button | save | can.save | shown disabled (permission folded into disabled) | rendered only with can.save: sx/inline/InlineDrawer.tsx:282 |
| Inline drawer | Submit button | submit | can.submit | shown disabled | rendered only with can.submit, disabled only while busy: InlineDrawer.tsx:287 |
| Inline drawer | Withdraw (locked alert) | withdraw | same as editor | gated OK | follows editor fix |
| Approvals (/approvals) | Page | GET /admin/studio/approvals | need=review | gated OK | none needed |
| Approvals | "Process overdue" (menu) | POST overdue processing | `studio.approval.reassign` | gated OK + after-click 403 only | 403 removes menu: sx/approvals/ApprovalsPage.tsx:81,203,209 |
| Approvals | Bulk select checkboxes + "Publish selected" | POST /admin/studio/approvals/bulk-publish (fallback per-object publish) | canPublish + row `can_publish` (section mine) | gated OK + after-click 403 only | refused rows no longer pickable: ApprovalsPage.tsx:80,120,334; Bulk.tsx:70,122,164 |
| Review drawer | Approve / Return / Reject | POST /admin/studio/objects/{id}/review | `can_decide` (object/step) else canReview + step role | gated OK + after-click 403 only | 403 removes all three (dialog keeps message, blocks resend): review/ActionDialog.tsx:101, useReview.ts:281-292 |
| Review drawer | Publish | POST publish URL | `can_publish` else canPublish | gated OK + after-click 403 only | 403 removes it |
| Review drawer | Fix (author link) | → editor | changes_requested + canEdit + author | gated OK | none needed |
| Review drawer | Comment composer | POST comments | any, not archived | gated OK + after-click 403 only | 403 removes composer, reason stays as note: useReview.ts:315, review/Comments.tsx |
| Review drawer | Export versions xlsx | GET versions export | isAdmin or canPublish (see Q3) | gated OK + after-click 403 only | 403 removes it: review/ReviewDrawer.tsx:191 |
| Review drawer | Open editor / download file | navigation / GET | read | gated OK | none needed |
| Review drawer | Step reassign (StepsTab reuse) | reassign | `studio.approval.reassign` | gated OK | covered by StepsTab fix |
| Create (/create) | Start journey panel | POST /studio/creation-journeys | canEdit | gated OK | none needed |
| Create | Journey rows: abandon/archive/restore | POST journey action URL | canEdit + journey `allowed_actions`/URLs | gated OK + after-click 403 only | 403 removes that action for that row: journey/CreateHome.tsx:65,96,103,164; JourneyTable.tsx:32,139 |
| Create | Journey rows: resume/view | navigation | read | gated OK | none needed |
| Wizard (/create/[id]) | Page | journey | need=edit | gated OK | none needed |
| Wizard | Menu: abandon/archive/restore; closed-state Restore/Continue | POST journey action URL | canEdit + `allowed_actions` | gated OK + after-click 403 only | 403 removes it: useWizardJourney.ts:221, Wizard.tsx (allowed filter) |
| Wizard | Save & next / Submit / Later | PATCH journey + object save | canEdit + journey `update` | after-click 403 only (then shown disabled) | journey PATCH 403 → next, later and retry leave, message stays: Wizard.tsx:424,430,435,486; useWizardJourney.ts:185 |
| AI agent (/ai) | Page | — | need=edit | gated OK | none needed |
| AI agent | Start job form / confirm | POST /studio/ai/agent-jobs | canEdit (no code in contract) | gated OK + after-click 403 only | 403 replaces form with note: sx/agent/AgentPage.tsx:73,101,123,167 |
| AI agent | Job "Retry" / "Prepare another" | POST agent-jobs | same | gated OK + after-click 403 only | hidden after 403: AgentJobView.tsx (props optional) |
| AI agent | Job refresh / open recent / new | GET / local | read | gated OK | none needed |
| Monitoring (/monitoring) | Page, refresh, filters, more | GET /admin/studio/monitoring | need=admin; read-only | gated OK | none needed |
| Settings (/settings) | Page | — | need=admin | gated OK | none needed |
| Settings > Access | Grant access (button), row Edit/Pause/Resume, row click | POST /admin/studio/access | studio admin; write endpoint present | gated OK + after-click 403 only | 403 drops all write actions + info note: sx/settings/AccessSection.tsx:45,54,91,420,440; GrantDrawer.tsx:173 |
| Settings > Access | Role matrix, filters, refresh | GET | read | gated OK | none needed |
| Settings > Routes | Tab + AI reveal | GET /admin/studio/approval-routes | `studio.workflow.manage` (tab), probe 403 → note | gated OK | none needed |
| Settings > Routes | Edit / Set up (global, groups, constructors), Add override | POST /admin/studio/approval-routes | `studio.workflow.manage` | gated OK + after-click 403 only | 403 removes every edit/setup/add + `settings.routes.noPermission` note: settings/RoutesPanel.tsx:40,100,135,186,236; RouteModal.tsx:163 |
| Settings > Registry | Sync (header + empty state) | POST /admin/studio/constructors/sync | admin | gated OK + after-click 403 only | 403 removes it: sx/settings/RegistrySection.tsx:42,57,194 |
| Settings > Export | All-studio export | GET /admin/studio/export.xlsx | admin | gated OK + after-click 403 only | 403 removes the card: ExportSection.tsx:116,157 |
| Settings > Export | Versions export | GET versions export | admin | gated OK + after-click 403 only | 403 removes the card (both gone → one note): ExportSection.tsx:132,158-190 |
| Kit (/kit) | Component preview | — | dev only (notFound in production) | gated OK | none needed |
| Legacy (ObjectList, GroupFlow, StudioDashboard, StudioMonitoring, StudioShell, dash/*, StepMeta default export) | — | — | not imported by any route | n/a (dead code) | none needed |

#### Counts
- Actions audited: 78 rows
- Hidden by me (new gate, or 403 → removed and not offered again): 42 rows (2 were "shown disabled": inline Save/Submit; wizard next/later/retry were "after-click 403, then disabled"; the rest gated by role/flag already and now also leave on 403)
- Already OK (no change needed): 36 rows
- Backend gaps: 6 (Q1–Q6 in STUDIO-questions.md); none blocks a fix.

#### Files changed
- components/admin/studio/sx/denied.ts (new: studioDenied)
- components/admin/studio/sx/editor/model.ts, sx/editor/useEditorState.ts
- components/admin/studio/sx/editor/drawer/StepsTab.tsx, ReassignDialog.tsx, VersionsTab.tsx
- components/admin/studio/sx/inline/InlineDrawer.tsx
- components/admin/studio/sx/ctorpage/RecordTable.tsx, CloneDialog.tsx, ReorderPanel.tsx
- components/admin/studio/sx/approvals/ApprovalsPage.tsx, Bulk.tsx
- components/admin/studio/sx/approvals/review/useReview.ts, ActionDialog.tsx, ReviewDrawer.tsx, Comments.tsx
- components/admin/studio/sx/settings/AccessSection.tsx, GrantDrawer.tsx, RegistrySection.tsx, ExportSection.tsx
- components/admin/studio/settings/RoutesPanel.tsx, RouteModal.tsx
- components/admin/studio/sx/home/Home.tsx
- components/admin/studio/sx/journey/CreateHome.tsx, JourneyTable.tsx, Wizard.tsx, useWizardJourney.ts
- components/admin/studio/sx/agent/AgentPage.tsx, AgentJobView.tsx
- (pre-existing, from lead: StepMeta.tsx, ApprovalsPage.tsx, StepsTab.tsx can() routing — kept)
No lib/services mapper changes. No new i18n keys (reused studio.sx.editor.err.forbidden, studio.settings.routes.noPermission).

## Portal: client, yurist, advokat, org owner, seller

Area: components/portal/** (incl. desk apps), components/org/**, components/services/**, app/[locale]/portal/** — client, lawyer (yurist), advocate (advokat), org owner (advokat_tashkiloti), seller.

#### Core (shell, orders, milestones, contracts, chat, editor, meetings, urgent, profile)

| Screen | Action | Endpoint | Permission / rule | Before | Fix |
|---|---|---|---|---|---|
| Portal sidebar (lawyer/advocate) | Nav rows of pages locked for a pending seller | — (page links) | cabinet `limited_access` / account_status=pending → only PENDING_ALLOWED pages | shown disabled | locked rows not rendered (empty groups drop) components/portal/PortalShell.tsx:280 |
| Portal sidebar (lawyer/advocate) | "New orders" nav row | POST /orders/{id}/accept\|decline behind it | cabinet `available_actions.accept_orders` | shown disabled | not rendered when false components/portal/PortalShell.tsx:280 |
| Portal sidebar (lawyer/advocate) | "Messages" nav row | secure chat | cabinet `available_actions.secure_chat` | shown disabled | not rendered when false components/portal/PortalShell.tsx:280 |
| Portal sidebar (all roles) | Team tasks nav row | /tasks | `tasks.view` | gated OK | none needed (already can()) |
| Portal header search (all roles) | Page results for locked pages | — | same as sidebar | shown ungated | locked pages filtered components/portal/PortalShell.tsx:437 |
| Desktop mode (DesktopShell apps/start/dock/palette/context menus) | Open locked app (open / new window / new tab / folder entries) | — | same as sidebar | shown disabled | locked apps never passed in components/portal/PortalShell.tsx:268 (menus no longer get a locked app) |
| Desktop page window (DeskApp side list) | Sibling section links that are locked | — | same as sidebar | shown disabled | locked siblings filtered, lock branch removed components/portal/desk/DeskApp.tsx:26 |
| Desktop palette (Ctrl/Cmd+K) | Backend commands with `enabled=false` | GET desktop boot commands | backend `enabled` per command | shown disabled | disabled commands not listed components/portal/desk/Palette.tsx:67 |
| Desktop Work app | "Ask copilot" (button + menu) | copilot | backend `ai.mode` (client_copilot / lawyer_copilot) | shown ungated | onCopilot passed only when aiMode components/portal/desk/DesktopShell.tsx:1107 |
| Desktop widgets | Widget open | — (link) | link present | gated OK | none needed (no link = info tile, not an action) |
| Seller dashboard / marketplace / opportunities (OrderActions) | Accept order | POST /orders/{id}/accept | cabinet `accept_orders`; 403 → reason | shown disabled | not rendered when accept_orders=false components/portal/OrderActions.tsx:88; 403 already replaced buttons with reason |
| Seller dashboard / marketplace / opportunities (OrderActions) | Decline order (+ reason modal) | POST /orders/{id}/decline | same | shown disabled | same components/portal/OrderActions.tsx:88 |
| Desktop Opportunities app | Accept | POST /orders/{id}/accept | 403 → `blocked` | shown disabled | footer not rendered after 403 components/portal/desk/apps/OpportunitiesApp.tsx:202 |
| Desktop Opportunities app | Decline + reason dialog | POST /orders/{id}/decline | same | shown disabled | footer + dialog closed after 403 components/portal/desk/apps/OpportunitiesApp.tsx:202 |
| Desktop Opportunities app | Refresh | GET /orders/open | read | gated OK | none needed |
| Order status history (OrderStatusPanel: client cases, seller CaseManageModal) | Next status buttons + note | PATCH /orders/{id}/status | side + current status (lib/orderStatus nextStatusesFor); 403 | after-click 403 only | status mirror kept; buttons leave after 403 components/portal/OrderStatusPanel.tsx:83; ahead-of-time: backend gap Q9 |
| Client desktop Requests (History) | Next status buttons + note | PATCH /orders/{id}/status | client side + status; 403 | after-click 403 only | buttons leave after 403, state keyed per order components/portal/desk/apps/client/RequestsApp.tsx:360; backend gap Q9 |
| Client cases page / desktop Requests (milestones) | Pay milestone | POST /orders/{id}/milestones/{m}/pay | first unpaid stage only; 403 → readOnly | gated OK | none needed (desk instance keyed per order RequestsApp.tsx:266) |
| Client cases page / desktop Requests (milestones) | Release paid milestone (+ confirm) | POST /orders/{id}/milestones/{m}/release | status paid/held; 403 → readOnly | gated OK | none needed |
| Client desktop Requests | Refund / replacement request dialog | POST refund/replacement module records | own case (client role) | gated OK | none needed |
| Client desktop Requests | Case documents add | POST case document record | own case | gated OK | none needed |
| Client cases page | Refund/replacement, add doc, open milestones/history | same as above | own case | gated OK | none needed |
| Document request (web) ContractSign | Start signing (send code) | POST /contracts/{id}/signature/start | contract signer; 403 | after-click 403 only | controls replaced by lock + reason after 403 components/portal/ContractSign.tsx:154; ahead-of-time: backend gap Q1 |
| Document request (web) ContractSign | Confirm code / resend | POST /contracts/{id}/signature/verify | same | after-click 403 only | same components/portal/ContractSign.tsx:154 |
| Client desktop DeskSign | Start / confirm / resend | /contracts/{id}/signature/start\|verify | same | after-click 403 only | locked row after 403 components/portal/desk/apps/client/DeskSign.tsx:93; backend gap Q1 |
| Desktop Messages (secure chat) | Send text | WS / POST /secure-chat/{room}/messages | room member; 403 | after-click 403 only | composer replaced by "not allowed" footer after 403 (WS + HTTP) components/portal/desk/apps/messages/useChat.ts:154, MessagesApp.tsx:606; backend gap Q10 |
| Desktop Messages | Attach file / voice note | POST upload | same | after-click 403 only | same (403 → denied) useChat.ts, MessagesApp.tsx:606 |
| Desktop Messages | Reply (message menu) | — | writable chat | shown ungated | hidden when finished/denied MessagesApp.tsx:407 |
| Desktop Messages | Resend failed message | WS/POST | writable chat | shown ungated | hidden when finished/denied MessagesApp.tsx:466 |
| Desktop Messages | Audio / video call | POST /calls | canMakeCalls (meetings.manage / call_center) + room open | shown disabled | hidden when chat finished/denied MessagesApp.tsx:492 |
| Desktop Messages | Complete urgent chat | POST urgent complete | staff + not finished | gated OK | none needed |
| Desktop Messages | Auto-delete TTL, delete chat, open order, ask copilot | room settings | room member | gated OK | none needed |
| Advocate document requests inbox | Open editor (card click) | /document-requests/{id}/editor | `can_open_editor` | shown disabled | locked card rendered as a read-only block (reason line kept) components/portal/DocumentRequestsInbox.tsx:380 |
| Advocate document requests inbox (pool) | Claim ("Ishni olish") | POST claim_url | `can_claim`; 403 | shown disabled | not rendered when can_claim=false, leaves after 403; empty action row dropped DocumentRequestsInbox.tsx:513 |
| Advocate document requests inbox | Fulfil upload modal | POST fulfil file | assigned record | gated OK | none needed |
| Document editor workspace (web) | Choose source | PUT editor source | not sent, claimed | shown disabled | not rendered when locked components/portal/DocumentEditorWorkspace.tsx:977 |
| Document editor workspace (web) | Start meeting (toolbar) | POST meeting | meeting_url, not sent, no meeting | shown disabled | rendered only when allowed (busy keeps disabled) DocumentEditorWorkspace.tsx:990 |
| Document editor workspace (web) | Start meeting (meeting pane) | POST meeting | same | shown disabled | same DocumentEditorWorkspace.tsx:1315 |
| Document editor workspace (web) | Finalize / send to client | POST finalize | not sent + editor ready | shown disabled | rendered only when allowed DocumentEditorWorkspace.tsx:1005 |
| Document editor workspace (web) | Start options (upload / client file / AI draft) | editor start | backend `editor_source`, fulfil url, status | shown disabled | only enabled options rendered DocumentEditorWorkspace.tsx:1206 |
| Document editor workspace (web) | Claim and retry | POST claim_url | `can_claim` (needsClaim state) | gated OK | none needed |
| Document editor workspace (web) | Rejoin meeting | join | meeting exists | gated OK | none needed (disabled only while open/busy) |
| Desktop editor (DeskEditor) | Finalize | POST finalize | same as web | shown disabled | rendered only when allowed components/portal/desk/apps/editor/DeskEditor.tsx:167 |
| Desktop editor | Choose source (toolbar) | PUT editor source | same | shown disabled | DeskEditor.tsx:203 |
| Desktop editor | Start meeting (toolbar + inspector) | POST meeting | same | shown disabled | DeskEditor.tsx:210, :619 |
| Desktop editor | Start options | editor start | same | shown disabled | only enabled options DeskEditor.tsx:333 |
| Desktop editor source dialog | Pick unavailable source | PUT editor source | option `available` | shown disabled | unavailable options not listed DeskEditor.tsx:836 |
| Editor source picker (web) | Pick unavailable source | PUT editor source | option `available` | shown disabled | not listed components/portal/EditorSourcePicker.tsx:152 |
| Editor source picker / dialogs | Upload own DOCX | POST upload | assigned record | gated OK | none needed |
| Desktop Meetings | Join / rejoin | LiveKit join | live + `can_start_now`; scheduled time | shown disabled | join only when joinable; time/closed reason shown as a tag components/portal/desk/apps/MeetingsApp.tsx:167 |
| Desktop Meetings | New meeting | POST /calls | canMakeCalls | gated OK | none needed |
| Advocate urgent assigned panel | Join meeting | LiveKit join | meeting created (call_id + room) | shown disabled | button only when joinable; "opens when operator starts it" note otherwise components/portal/UrgentAssignedPanel.tsx:466 (new i18n key) |
| Advocate urgent assigned panel | Open chat | link | room exists | gated OK | none needed |
| Desktop Urgent app | Join meeting | LiveKit join | same | shown disabled | Btn only when joinable, else note tag components/portal/desk/apps/UrgentApp.tsx:174 (new i18n key) |
| Desktop Urgent app | Open chat | link | room exists | gated OK | none needed |
| Client urgent (UrgentAdvocatePanel) | Cancel request / rate | PATCH status / POST rating | `next_statuses` contains cancelled; rating window | gated OK | none needed |
| Seller desktop Orders workspace | Audio / video call | POST /calls | `can_create_call` + `calls_allowed` + not closed; 403 | after-click 403 only | calls leave after 403 components/portal/desk/apps/orders/Workspace.tsx:71 |
| Seller desktop Orders workspace | Complete order | POST complete | `can_complete` + phase; paused work | shown disabled | not rendered while work is paused (paused tag stays) Workspace.tsx:75 |
| Seller desktop Orders workspace | Open/view chat, supplemental payment, start work, negotiation, checklist, cancellation review | marketplace order endpoints | `can_start_chat`/`chat_read_only`, phase, `can_start` | gated OK | none needed |
| Achievements (seller profile) | Add achievement | POST achievements | 403 → denied | after-click 403 only | add + empty-state CTA hidden when denied components/portal/AchievementsPanel.tsx:392, :452; backend gap Q11 |
| Achievements | Revise achievement | POST revision | not pending review; denied | shown disabled | not rendered while pending or denied AchievementsPanel.tsx:479 |
| Advocate practice (licence) | Upload / resubmit certificate | POST licence submit | 403 | after-click 403 only | form closed + button gone after 403 components/portal/AdvocatePracticePanel.tsx:194, :346; backend gap Q11 |
| Experience panel | Add / edit / fix | POST/PUT experience | own record | gated OK | none needed (disabled only while a draft is open) |
| Document constructor (DocFill) | Ask lawyer | POST lawyer request | `can_send_lawyer_request` (held note) | shown disabled | not rendered while held; reason note stays components/portal/DocFill.tsx:847 |
| Document paper (DocPaper) | Ask lawyer | same | same | shown disabled | not rendered while held components/portal/DocPaper.tsx:479 |
| Desktop Profile (security) | Disable 2FA | DELETE /auth/2fa | not for mandatory-2FA roles (403) | after-click 403 only | hidden for mandatory roles, footer says it is required components/portal/desk/apps/ProfileApp.tsx:504 |
| Profile TwoFactorCard (web) | Disable 2FA | DELETE /auth/2fa | same | gated OK | none needed (already `requiresTwoFactor`) |
| Profile / settings (web + desktop) | Telegram link, sessions revoke, notification prefs, profile save, identity verify | own-account endpoints | own account | gated OK | none needed |
| Subscription / plans (web + desktop) | Buy plan, autopay toggle, cancel, consent | subscription endpoints | own account | gated OK | none needed |
| Support (desktop + web) | New ticket, send, reopen | /support tickets | own ticket; 403 → missing view | gated OK | none needed |
| Files (desktop + FileManager) | New folder, rename, star, delete, move, upload | /files | own files; 403 → forbidden screen | gated OK | none needed |
| Notifications (desktop + web) | Mark read / mark all | /notifications | own | gated OK | none needed |
| Incoming call watcher / desk call | Accept / decline / in-call controls | calls | callee only (event addressed to user) | gated OK | none needed |

#### Seller services & promotion

| Screen | Action | Endpoint | Permission / rule | Before | Fix |
|---|---|---|---|---|---|
| Seller services (ServiceManager, lawyer/advocate + org-owner member view) | Load list / blocked state | GET /lawyers/me/services, GET /organizations/{org}/members/{m}/services | seller role; org owner; 403 -> locked view without retry | gated OK | none needed |
| Seller services (ServiceManager) | Add service (hero button) | POST managed services (saveSellerService) | seller role / org owner; 403 -> denied | after-click 403 only | hidden after a 403 (deny flag) components/services/ServiceManager.tsx:469-476 |
| Seller services (ServiceManager) | Add first service (empty-state CTA) | POST managed services | same | after-click 403 only | hidden after a 403 components/services/ServiceManager.tsx:609 |
| Seller services (ServiceManager) | AI-registered add modal (useAiModal form-modal) | POST managed services | same | after-click 403 only | not registered after a 403 components/services/ServiceManager.tsx:166 |
| Seller services (ServiceManager) | Promote profile link | /promotion (POST promotion checkout) | seller only (not org owner); promotion 403 | after-click 403 only | hidden for owner (existing) + after promotion 403 components/services/ServiceManager.tsx:477 |
| Service card (ServiceCard) | Status switch active/paused/inactive | PATCH managed service status | seller/owner; rules gate for "active" (accept rules action kept) | after-click 403 only | foot not rendered when readOnly (403) components/services/ServiceCard.tsx:204; ServiceManager.tsx:358 sets deny |
| Service card | Edit | PUT managed service | catalog service must be active (service.isActive) | shown disabled | hidden when catalog service inactive or readOnly components/services/ServiceCard.tsx:221 |
| Service card | "Add experience note" inline CTA | PUT managed service | isActive + not readOnly | gated OK | also hidden when readOnly components/services/ServiceCard.tsx:176 |
| Service card | Promote | POST promotion checkout | status active + catalog active + not promoted/pending; not after promo 403 | shown disabled | hidden unless promotable; live/pending state stays as the ribbon pill components/services/ServiceCard.tsx:227 |
| Service card | Remove | DELETE managed service | seller/owner; 403 -> deny | after-click 403 only | hidden when readOnly; remove-modal 403 closes + denies components/services/ServiceManager.tsx:383 |
| Service card | Open rules (enable lock) | GET/POST service rules accept | own rules (self only) | gated OK | hidden when readOnly components/services/ServiceCard.tsx:188 |
| Service form modal (ServiceFormModal) | Save (add/edit) | POST/PUT managed service + config | 403 forbidden/pendingAccount | after-click 403 only | onDenied -> parent closes, toasts, removes actions components/services/ServiceFormModal.tsx:379,394; ServiceManager.tsx:637 |
| Promote modal (PromoteModal) | Send promotion request | POST /marketplace/promotions checkout | 403 forbidden/pendingAccount | after-click 403 only | onDenied -> parent removes promote actions components/services/PromoteModal.tsx:337; ServiceManager.tsx:661 |
| Rules drawer / banner (RulesDrawer, RulesBanner) | Accept rule / open rules | POST /marketplace/service-rules/{id}/accept | own rules, self only (owner never sees) | gated OK | none needed |
| Location share (LocationShareCard/Dialog) | Start / stop live location | location share endpoints (own) | self seller only (self && !embedded) | gated OK | none needed |
| Desk Services (ServicesApp) | Toolbar Add | POST managed service | seller/owner; 403 -> denied | after-click 403 only | hidden after 403 components/portal/desk/apps/ServicesApp.tsx:198 |
| Desk Services | Toolbar Promote profile | promotion checkout | seller only, items exist, not after 403 | shown disabled | hidden when no items / owner / denied components/portal/desk/apps/ServicesApp.tsx:199 |
| Desk Services | Toolbar Service rules | rules list/accept | self only | gated OK | none needed |
| Desk Services | Empty-state Add first | POST managed service | same | after-click 403 only | hidden after 403 components/portal/desk/apps/ServicesApp.tsx:212 |
| Desk Services | Row double-click edit | PUT managed service | isActive + not denied | shown ungated | gated components/portal/desk/apps/ServicesApp.tsx:218 |
| Desk Services | Row context menu: edit / pause / activate / promote / remove | managed service endpoints | edit+activate need isActive; promote needs active status; none after 403 | shown disabled | menu built only from allowed items, no menu after 403, no orphan separator components/portal/desk/apps/ServicesApp.tsx:137-153 |
| Desk Services sheet | Pause / Activate / Edit / Promote / Deactivate / Remove | managed service endpoints | activate+edit need isActive; promote needs active; none after 403 | shown disabled | locked ones hidden; whole action row hidden after 403 components/portal/desk/apps/ServicesApp.tsx:313-345 |
| Desk Services | Status change 403 | PATCH status | 403 forbidden/pendingAccount | after-click 403 only | sets denied (actions leave) components/portal/desk/apps/ServicesApp.tsx:113 |
| Desk Services | Remove 403 | DELETE managed service | same | after-click 403 only | sets denied + proper message components/portal/desk/apps/ServicesApp.tsx:124-130 |
| Desk Services dialog | Save service | saveSellerService | 403 | after-click 403 only | onDenied closes dialog, removes actions components/portal/desk/apps/ServicesApp.tsx:439 |
| Desk Services rules dialog | Accept rule | POST rule accept | own rules | gated OK | none needed |
| Desk Services packages | Enable / disable package toggle | POST /lawyers/me/packages/{id}/enable, PATCH .../status | eligibility.eligible to switch on; 403 | shown disabled | toggle hidden when ineligible (reasons banner stays) or after 403; "On" tag kept when enabled components/portal/desk/apps/ServicesApp.tsx:703 |
| Packages tab (SellerPackagesSection) | Enable / Activate / Disable | same | blocked (ineligible) cannot enable/activate; 403 | shown disabled | locked button hidden; all hidden after 403 components/services/SellerPackagesSection.tsx:326 |
| Promote dialog (desk, PromoteDialog) | Submit promotion | promotion checkout | 403 | after-click 403 only | onDenied prop components/portal/desk/apps/promote/PromoteDialog.tsx:121 |
| Desk Promotion (PromotionApp) | Toolbar start promotion | promotion checkout | 403 | after-click 403 only | hidden after 403 components/portal/desk/apps/PromotionApp.tsx:92 |
| Desk Promotion | Placement cards (start) | promotion checkout | 403 | after-click 403 only | rendered as read-only cards (no "start") after 403 components/portal/desk/apps/PromotionApp.tsx:105-140 |
| Promotion page (PromotionPanel) | Placement cards (start) | promotion checkout | 403 | after-click 403 only | read-only cards after 403 components/portal/PromotionPanel.tsx:270-297 |
| Promotion page | "New checkout" after lapse | promotion checkout | 403 | after-click 403 only | hidden after 403 components/portal/PromotionPanel.tsx:230 |
| Promotion page (PromoteServicesSection) | Promote a service row | promotion checkout | active+catalog active+not promoted/pending (already filtered); 403 | after-click 403 only | button hidden after 403 components/services/PromoteServicesSection.tsx:172 |
| Promotion page | Manage services / add links | navigation | page-level | gated OK | none needed |
| Seller profile (SellerProfileEditor) | Edit section / Save | PUT /lawyers/me, PATCH profile, PUT availability | own profile (role) | gated OK | none needed |
| Seller profile | Request verification | POST /lawyers/me/verifications | own; no can_request flag in payload | shown ungated | backend gap Q5 |
| Office location (OfficeLocationCard) | Edit / Save / Remove / use device | office location endpoints (own) | own profile | gated OK | none needed |
| Client services (app/[locale]/portal/client/services) | Create document / pick seller | client flows | client role | gated OK | none needed |
| Client services | Buy package | package purchase | package must have resolved services (unresolved_service_codes empty) | shown disabled | hidden when misconfigured (alert stays) app/[locale]/portal/client/services/page.tsx:567 |
| Org member services pages (app/[locale]/portal/**/members/[memberId]/services) | all | via ServiceManager owner=true | org owner | gated OK | none needed |

#### Organizations, tasks, cases, calendar, clients

| Screen | Action | Endpoint | Permission / rule | Before | Fix |
|---|---|---|---|---|---|
| Seller tasks board (/portal/{lawyer,advocate}/tasks, TaskBoard) | Add task | POST /tasks | own tasks (/tasks/me); no permission code in any contract | after-click 403 only | 403 sets readOnly, button not rendered — components/portal/TaskBoard.tsx:170 |
| Seller tasks board | Edit task (modal save) | PATCH /tasks/{id} | own task | after-click 403 only | 403 → readOnly, modal closed, edit button gone — TaskBoard.tsx:268,~300 |
| Seller tasks board | Move stage (arrows) | PATCH /tasks/{id}/status | own task | after-click 403 only | 403 → whole pipe__actions row not rendered — TaskBoard.tsx:247 |
| Seller tasks board | Drag-and-drop between stages | PATCH /tasks/{id}/status | own task | after-click 403 only | draggable={!readOnly}, drop ignored — TaskBoard.tsx:210-232 |
| Seller tasks board | Toggle blocked | PATCH /tasks/{id}/status | own task | after-click 403 only | hidden with pipe__actions on 403 — TaskBoard.tsx:247 |
| Seller tasks board | Delete task | DELETE /tasks/{id} | own task | after-click 403 only | hidden with pipe__actions on 403 — TaskBoard.tsx:247 |
| Seller tasks board | Search / show-open filter | — (client side) | none | gated OK | none needed |
| Desk Tasks app (TasksApp) | Add (toolbar, quick-add field, column "+ Add") | POST /tasks | own tasks | after-click 403 only | 403 → `ro`; Tool, QuickAdd, ColumnAdd not rendered — components/portal/desk/apps/TasksApp.tsx:216,231,Board |
| Desk Tasks app | Mark done / star important (row) | PATCH /tasks/{id} | own task | after-click 403 only | Check/star not rendered when ro — TasksApp.tsx:210, TaskRow |
| Desk Tasks app | Context menu (done, stage, priority, blocked, delete) | PATCH/DELETE /tasks/{id} | own task | after-click 403 only | menu not opened when ro — TasksApp.tsx:155 |
| Desk Tasks app | Keyboard Delete/Backspace, Space | DELETE / PATCH /tasks/{id} | own task | after-click 403 only | ignored when ro — TasksApp.tsx:168 |
| Desk Tasks app | Board drag between stages | PATCH /tasks/{id} | own task | after-click 403 only | not draggable when ro — TasksApp.tsx Board |
| Desk Tasks app | Details inspector inline edits (title, steps, stage, priority, due, case, blocked, notes, delete) | PATCH/DELETE /tasks/{id} | own task | after-click 403 only | read-only details view when ro — TasksApp.tsx:470 |
| Advocate organizations (OrganizationsPanel) | Create organization (header button, AI modal) | POST /organizations | advocate role (page is advocate-only) | after-click 403 only | 403 → createDenied: button, modal and AI-modal entry gone — components/portal/OrganizationsPanel.tsx:47,116,168,189 |
| Advocate organizations | Manage (owner dashboard link) | GET /organizations/{id}/owner/dashboard | org owner (ownerUserId === me) | gated OK | none needed |
| Advocate organizations | Members (open list) | GET /organizations/{id}/members | listed orgs are own (ownerUserId empty or me) | gated OK | none needed |
| Advocate organizations | Member services link | /organizations/{id}/members/{uid}/services | org owner | gated OK | none needed |
| Advocate organizations | Add member form | POST /organizations/{id}/members | org owner (list already filtered to own orgs) | after-click 403 only | 403 → org id in addDenied, form not rendered — OrganizationsPanel.tsx:87,238 |
| Desk Organization app (OrgApp) | Create organization (sidebar footer, toolbar, empty-state CTA) | POST /organizations | advocate role | after-click 403 only | 403 → createDenied, all three not rendered — components/portal/desk/apps/OrgApp.tsx:88,92,102,148 |
| Desk Organization app | Add member (toolbar + dialog) | POST /organizations/{id}/members | org owner | after-click 403 only | 403 → hidden for that org — OrgApp.tsx:91,149 |
| Desk Organization app | Manage / member services | owner endpoints | ownerUserId === me | gated OK | none needed |
| Desk Organization app | Refresh | GET | none | gated OK | none needed |
| Org owner dashboard (/organization/[orgId], OwnerDashboard; desk OrgDashboard) | KPI tiles, workload link, member rows (navigation) | GET /organizations/{id}/owner/dashboard | org owner; 403 → OrgBlocked lock view | gated OK | none needed (read-only, 403 replaces page) |
| Org owner workload (OwnerWorkload; desk Workload) | Filters, load more, open item | GET /organizations/{id}/owner/workload | org owner; 403 → OrgBlocked | gated OK | none needed |
| Org member page (OrgMemberPage) | Tabs (overview/workload/services) | owner endpoints | org owner; 403 → OrgBlocked | gated OK | none needed (services tab = ServiceManager, other slice) |
| Org member resolver (OrgMemberResolver) | Back link | — | owner orgs only | gated OK | none needed |
| Seller cases (CaseManageModal, opened from SellerCases) | Save status / stage / next action | PATCH /cases/{id} | assigned seller (object-level; no field in payload) | after-click 403 only | 403 → read-only summary, no save button — components/portal/CaseManageModal.tsx:67,95 |
| Seller cases (CaseManageModal) | Order status steps | PATCH /orders/{id}/status | mirrored transitions (lib/orderStatus) | gated OK | OrderStatusPanel is parent slice |
| Desk Cases app (CasesApp) | Status / stage / next-action inline edit, save, revert | PATCH /cases/{id} | assigned seller | after-click 403 only | 403 → case id in denied: Sheet read-only — components/portal/desk/apps/CasesApp.tsx:99,148,190,219 |
| Desk Cases app | Row context menu "Set status" | PATCH /cases/{id} | assigned seller | after-click 403 only | status items dropped for denied case; empty menu not opened — CasesApp.tsx:82-89 |
| Desk Cases app | Row context menu "Open order" | navigation | none | gated OK | none needed |
| Desk Cases app | Order steps (OrderFlow) | PATCH /orders/{id}/status | mirrored seller transitions | after-click 403 only | 403 → steps not rendered, reason shown — CasesApp.tsx:257,269,314 |
| Desk Cases app | AI tools run / keep draft | POST case AI tool | assigned seller | gated OK | none needed (no 403 contract; read output) |
| Desk Work app (WorkApp) | Open, chat, add to desktop | navigation | chat only when chatRoomId; shortcut only when route | gated OK | none needed |
| Desk Work app | Ask copilot (button + menu) | copilot window | backend boot ai.mode (copilot app exists only then) | shown ungated | onCopilot made optional; button/menu hidden without it — components/portal/desk/apps/WorkApp.tsx:80,130 (DesktopShell must pass it only when aiMode — parent) |
| Desk Snippets app | New / edit / delete / copy snippet | /lawyer-desktop snippets | app only when registry has "snippets"; own records | gated OK | none needed |
| Calendar (CalendarPanel, CalendarApp) | Add event, delete, iCal, deadline calculator | POST/DELETE /calendar/events, GET ical, POST deadline | own events (scoped to me); no permission code | gated OK | none needed |
| Clients (ClientsPanel, ClientsApp) | Add client, conflict check, open detail, message, call, copy phone | POST /lawyers/me/clients, POST conflict-check | own client book; no permission code | gated OK | none needed (message button disabled only when no chat room exists — state, not permission) |
| WorkFilterBar | Saved filters | localStorage | none | gated OK | none needed |
| Team tasks (/portal/*/team-tasks) | page | — | tasks.view (PortalShell nav) | gated OK | page delegates to components/tasks/TeamTasksPage (not PORTAL area) |

#### Client screens

| Screen | Action | Endpoint | Permission / rule | Before | Fix |
|---|---|---|---|---|---|
| Client doc constructor result (DocumentRequestPanel) | Ask lawyer review (open form) | POST /document-requests/{id}/lawyer-review (requestDocumentLawyerReviewGated) | object: no lawyer already holding the doc (lawyerHeldNote / can_send_lawyer_request) | shown disabled | hidden while held, reason note stays — components/portal/DocumentRequestPanel.tsx:1139 |
| Client doc constructor result | Send review / cancel | same | form busy | gated OK | none needed |
| Client doc constructor result | Open / download PDF | GET document file | own request; busy only | gated OK | none needed |
| Client doc constructor result | Pay document | payDocumentRequest | own request, payment phase | gated OK | none needed |
| Client doc constructor | Save answers / generate | updateDocumentAnswers | own request; DocFill shows held note | gated OK | none needed |
| Client doc constructor | Sign contract | /contracts/{id}/signature/start | signer only | after-click 403 only | ContractSign (lead) hides on 403; backend gap Q1 |
| Desk request (DeskRequest) | Ask lawyer review | requestDocumentLawyerReviewGated | object: lawyerHeldNote | shown disabled | hidden while held, note stays — components/portal/desk/apps/client/DeskRequest.tsx:225 |
| Desk request | Back to answers / refresh / open PDF | — / GET | busy only | gated OK | none needed |
| Desk fill (DeskFill) | Ask lawyer (toolbar tool) | lawyer request from constructor | object: ask.available, not sent, not held | shown disabled | hidden when sent/held — components/portal/desk/apps/client/DeskFill.tsx:42 |
| Desk fill | Ask lawyer (side panel button) | same | same | shown disabled | sent → confirmation text, held → reason text, else button — DeskFill.tsx:129 |
| Desk seller page (SellerPage) | Buy (hero) | requestMarketplacePurchase | object: not own listing, not a seller account, seller verified & available | shown disabled | hidden when blocked — components/portal/desk/apps/client/SellerPage.tsx:205 |
| Desk seller page | Buy (order box) | same | same | shown disabled | replaced by the block reason — SellerPage.tsx:~367 |
| Desk catalog order (CatalogOrder) | Buy package | requestPackagePurchase | object: package has no unresolved service codes | shown disabled | hidden, misconfigured banner stays — components/portal/desk/apps/client/CatalogOrder.tsx:191 |
| Desk packages (PackagesApp) | Pick seller for package | requestPackagePurchase | object: seller eligibility.eligible && package_purchase_url | shown disabled | ineligible sellers render as read-only rows with reasons, no pick arrow — components/portal/desk/apps/client/PackagesApp.tsx:365 (+ client.css .dxco-pick__off) |
| Desk orders (OrdersApp) | Cancel order | cancelMarketplaceOrder | object: o.canCancel && stage pending | gated OK | none needed |
| Desk orders | Rate order | rateMarketplaceOrder | object: completed && rating.canRate | gated OK | none needed |
| Desk orders | Audio/video call | startCall | object: canCreateCall && callsAllowed && live && roomId | gated OK | none needed |
| Desk orders | Open chat / download file | — | own order | gated OK | none needed |
| Desk quick/urgent (QuickApp) | Create urgent request | createUrgentRequest | client role (app) | gated OK | none needed |
| Desk quick/urgent | Cancel urgent request | cancelUrgentRequest | object: nextStatuses includes cancelled | gated OK | none needed |
| Desk quick/urgent | Rate urgent request | rateUrgentRequest | object: rating window open, not done/closed | gated OK | none needed |
| Desk SOS (SosApp) / sos page | Connect SOS | createSosRequest | client role | gated OK | none needed |
| Desk SOS / sos page | Open chat | — | room exists | gated OK | none needed |
| Desk documents (DocumentsApp) | Send to lawyer | requestDocumentLawyerReviewGated | object: manual && canSendLawyerRequest && not closed | gated OK | none needed |
| Desk documents | Rate document | rateDocumentRequest | object: RATEABLE status | gated OK | none needed |
| Desk documents | Download / continue constructor / chat | GET / — | object: file.ready / constructorAction / room | gated OK | none needed |
| My documents (ClientDocumentRequests) | Download / continue / chat / send to lawyer | GET / requestDocumentLawyerReviewGated | object: ready / canContinue / room / canSend (mode, phase, can_send_lawyer_request) | gated OK | none needed |
| My documents | Load more | GET list | — | gated OK | none needed |
| Service document request (ServiceDocumentRequest) | Start constructor | createServiceDocumentRequest | client; `resumed` is a load state | gated OK | none needed |
| Service document request | Choose lawyer path | lawyer request | can_send_lawyer_request false → opens wait screen with backend reason (no new request) | gated OK | none needed |
| Desk service (DeskService) | Request lawyer / with files | requestServiceDocumentLawyerGated | same object rules | gated OK | none needed |
| New document order (NewDocumentOrder) / DocOrder | Custom draft / existing doc review | requestCustomDraft / requestExistingDocumentReviewGated | client; validation only | gated OK | none needed |
| Doc analysis page / DocAnalysisApp | Quote / run analysis | AI doc analysis | validation (pagesOk/canRun) | gated OK | none needed |
| Doc analysis page / DocAnalysisApp | Hand off to lawyer | requestExistingDocumentReviewGated | busy / "sent" confirmation state | gated OK | none needed |
| Intake page / IntakeApp | Analyze / AI feedback | sendAiFeedback | client; validation | gated OK | none needed |
| Desk AI chat (AiChatApp) | Send message / new chat | createChat / postMessage | plan quota (handled as upgrade message) | gated OK | none needed |
| Client profile page / CProfileApp | Save profile | updateClientProfile | own account | gated OK | none needed |
| Client profile / CProfileApp | Delete family member / payment method | deleteFamilyMember / deletePaymentMethod | own records | gated OK | none needed |
| Client profile page | Toggle share | toggleShare | own account | gated OK | none needed |
| Identity (Identity.tsx) | Start MyID / OneID, verify code | identity endpoints | own account; busy/waiting | gated OK | none needed |
| Gifts (ClientGiftsPanel / GiftsApp) | Send gift | createGift | client; validation | gated OK | none needed |
| Payments (ClientPayments) | Download receipt | GET receipt | own payments; busy | gated OK | none needed |
| Reviews (ClientReviews) / WorksApp | Submit review | submitReview | only targets from GET reviewable | gated OK | none needed |
| Works (ClientWorks / WorksApp) | Open work / load more | GET | own works | gated OK | none needed |
| Document rating (DocRatingBox) | Rate | rateDocumentRequest | object: rating window (renders nothing when closed/rated) | gated OK | none needed |
| Document chat (DocumentRequestChat) | Call advocate | startDocumentRequestAudioCall | busy / call already open | gated OK | none needed |
| Lawyer profile modal (LawyerProfileModal) | Order / checkout | createCheckout | client | gated OK | none needed |
| Plan gates (ManualDocPlanGate / AiPlanUpgradeGate) | Buy plan / Telegram purchase | purchasePlan / requestPlanTelegramPurchase | validation (plan chosen) | gated OK | none needed |
| Packages page | Order package / details | navigation to purchase | client | gated OK | none needed |
| Referrals page | Copy / share code | — (client-side) | own code | gated OK | none needed |
| Client home / specialists (ClientHome, ClientSpecialists) | Shortcuts, toggle area filter | navigation only | — | gated OK | none needed |
| Login / reset password | Sign in, OTP, reset | auth endpoints | public; validation/rate limit | gated OK | none needed |
| AttachmentPicker | Add file | — | max files (validation) | gated OK | none needed |

#### Counts

| Actions audited | Hidden / removed by this pass | Already OK | Backend gap only (no frontend fix possible) | Backend questions |
|---|---|---|---|---|
| 207 | 104 | 102 | 1 | 12 (PORTAL-questions.md) |

Before: gated OK 102 · after-click 403 only 51 · shown disabled 47 · shown ungated 7.

#### Notes for the lead

- Locked seller pages (pending approval, or a cabinet `available_actions` flag the account lacks) are no longer shown as locked rows in the sidebar, header search, desktop apps or desktop page side lists — they are not rendered. The route guard (redirect off a locked route) is unchanged.
- Status/step locks that were greyed buttons are now not rendered: editor finalize/source/meeting/start options, unavailable editor sources (the old MD asked for greyed options — owner law overrides), urgent/meeting join before the meeting exists (a short note shows instead), paused-order Complete, pending achievement Revise, held "Ask lawyer", catalog-inactive service edit.
- New i18n key (PORTAL-i18n.json): `portal.seller.urgent.joinPending`.
- New component props (services slice): ServiceCard `readOnly`, `noPromote`; ServiceFormModal/PromoteModal/PromoteDialog optional `onDenied(msg)`. WorkApp `onCopilot` is now optional (DesktopShell passes it only when the backend names a copilot mode).
- useChat now returns `denied` (403 on send/upload/WS) — MessagesApp consumes it.
- No lib/services mapper changed.
- UI-law issue seen, not a permission item: CatalogOrder / client services page print raw service codes in the `package.misconfigured` banner.

#### Files changed

- app/[locale]/portal/client/services/page.tsx
- components/portal/AchievementsPanel.tsx
- components/portal/AdvocatePracticePanel.tsx
- components/portal/CaseManageModal.tsx
- components/portal/ContractSign.tsx
- components/portal/DocFill.tsx
- components/portal/DocPaper.tsx
- components/portal/DocumentEditorWorkspace.tsx
- components/portal/DocumentRequestPanel.tsx
- components/portal/DocumentRequestsInbox.tsx
- components/portal/EditorSourcePicker.tsx
- components/portal/OrderActions.tsx
- components/portal/OrderStatusPanel.tsx
- components/portal/OrganizationsPanel.tsx
- components/portal/PortalShell.tsx
- components/portal/PromotionPanel.tsx
- components/portal/TaskBoard.tsx
- components/portal/UrgentAssignedPanel.tsx
- components/portal/desk/DeskApp.tsx
- components/portal/desk/DesktopShell.tsx
- components/portal/desk/Palette.tsx
- components/portal/desk/apps/CasesApp.tsx
- components/portal/desk/apps/MeetingsApp.tsx
- components/portal/desk/apps/OpportunitiesApp.tsx
- components/portal/desk/apps/OrgApp.tsx
- components/portal/desk/apps/ProfileApp.tsx
- components/portal/desk/apps/PromotionApp.tsx
- components/portal/desk/apps/ServicesApp.tsx
- components/portal/desk/apps/TasksApp.tsx
- components/portal/desk/apps/UrgentApp.tsx
- components/portal/desk/apps/WorkApp.tsx
- components/portal/desk/apps/client/CatalogOrder.tsx
- components/portal/desk/apps/client/DeskFill.tsx
- components/portal/desk/apps/client/DeskRequest.tsx
- components/portal/desk/apps/client/DeskSign.tsx
- components/portal/desk/apps/client/PackagesApp.tsx
- components/portal/desk/apps/client/RequestsApp.tsx
- components/portal/desk/apps/client/SellerPage.tsx
- components/portal/desk/apps/client/client.css
- components/portal/desk/apps/editor/DeskEditor.tsx
- components/portal/desk/apps/messages/MessagesApp.tsx
- components/portal/desk/apps/messages/useChat.ts
- components/portal/desk/apps/orders/Workspace.tsx
- components/portal/desk/apps/promote/PromoteDialog.tsx
- components/services/PromoteModal.tsx
- components/services/PromoteServicesSection.tsx
- components/services/SellerPackagesSection.tsx
- components/services/ServiceCard.tsx
- components/services/ServiceFormModal.tsx
- components/services/ServiceManager.tsx

## Internal HRM, team tasks, live office

Owner law: an action the user has no permission for is not rendered. Codes via `canInternal(session, code)` / `can()`; object-level via backend `actions`, `capabilities`, `allowed_transitions`, `allowed_actions`.

| Screen | Action | Endpoint | Permission / rule | Before | Fix |
|---|---|---|---|---|---|
| Team tasks (admin/lawyer/advocate/client `team-tasks`) | Create task (header + empty-state CTA) | POST /task-management | meta `capabilities.create` | gated OK | + hidden for the rest of the visit after a create 403 (`createBlocked`) — components/tasks/TeamTasksPage.tsx:86,437,653 |
| Team tasks › create form | Assignee picker in "new task" | POST /task-management `assignee_ids` | meta `capabilities.assign` | shown ungated | picker only with `canAssign` (as ccx TaskSheet does) — components/tasks/TaskForm.tsx:57,88; TeamTasksPage.tsx:653 |
| Team tasks › create/edit form | Attach files (button, drag-drop, paste) | POST /task-management/{id}/attachments | reachable only inside create (`capabilities.create`) / edit (`actions.can_edit`) | gated OK | none needed |
| Team tasks › list row | Status move buttons (start / to testing / ready / return) | PATCH /task-management/{id}/status | `actions.can_change_status` + `actions.next_statuses` (object-level) | gated OK | + 403 removes the moves for that task while its status is unchanged; empty action cell no longer rendered — TeamTasksPage.tsx:87-104,307-318,602 |
| Team tasks › list row (simple-flow account) | Approve & archive | DELETE /task-management/{id} | `actions.can_delete` | gated OK | + 403 removes it (per task/status) — TeamTasksPage.tsx:603 |
| Team tasks › detail drawer | Status move buttons | PATCH /task-management/{id}/status | `actions.can_change_status`/`next_statuses` | gated OK | + 403 removes (via `shown()`) — TeamTasksPage.tsx:632 |
| Team tasks › detail drawer | Edit | PATCH /task-management/{id} | `actions.can_edit` | gated OK | + 403 from the form removes Edit for that task — TeamTasksPage.tsx:653 |
| Team tasks › detail drawer | Assign people | PUT /task-management/{id}/assignees | `actions.can_assign` | gated OK | + 403 from the form removes Assign — TeamTasksPage.tsx:653 |
| Team tasks › detail drawer | Delete (reason dialog) | DELETE /task-management/{id} | `actions.can_delete` | gated OK | + 403 removes Delete — TeamTasksPage.tsx:374 |
| Team tasks › detail drawer (simple flow) | Approve & archive | DELETE /task-management/{id} | `actions.can_delete` | gated OK | + 403 removes — TeamTasksPage.tsx:374 |
| Team tasks › return dialog | Return to in-progress with reason | PATCH /task-management/{id}/status | `next_statuses` contains the return | gated OK | + 403 removes the moves — TeamTasksPage.tsx:374 |
| Team tasks › detail drawer | Actions bar | — | rendered only when any action is allowed and task not deleted | gated OK | none needed |
| Team tasks › attachments | View / download / lightbox zoom / save | GET attachment preview/download URLs | read (backend gives `download_url`/`preview_supported`) | gated OK | none needed |
| Team tasks › page | Whole page | GET /task-management/meta, /task-management | 403 → page shows the denied notice, no actions | gated OK | none needed |
| Team tasks › KPI tiles / alert / period / status filters | Filter shortcuts | GET (filters only) | read | gated OK | none needed |
| Live Office (/internal/live-office) | Refresh board | GET /internal/live-office/board | read; any HRM user | gated OK | none needed (read) |
| Live Office | Status filter chips, search, unit/room/status filters, floor/list toggle | GET /internal/live-office/board?… | read | gated OK | none needed (read) |
| Live Office – my bar | Start busy | POST /internal/live-office/busy/start | own record (any employee) | after-click 403 only | 403 → button removed for the visit, dialog keeps message, submit removed: LiveOfficePage.tsx:224,430; bits.tsx:142,161 |
| Live Office – my bar | Stop my busy | POST /internal/live-office/busy/{id}/stop | own busy; needs busy id | shown disabled | (before: no busy id) hidden when no busy id; 403 → removed: LiveOfficePage.tsx:224-232,445 |
| Live Office – my bar | "Wrong place" correction | POST /internal/live-office/corrections | own record (any employee) | after-click 403 only | 403 in CorrectionForm → every correction entry point removed: LiveOfficePage.tsx:238,415; LiveCorrections.tsx:310 |
| Live Office – my bar | (whole action box) | — | — | shown ungated | (layout) box not rendered when it would be empty: LiveOfficePage.tsx:224 |
| Live Office – tabs | Analytics tab | GET /internal/live-office/analytics | backend scope (no code in contract) | after-click 403 only | 403 → tab + drawer button removed: LiveOfficePage.tsx:258,350,368; LiveAnalytics.tsx:44 |
| Live Office – tabs | Corrections tab | GET /internal/live-office/corrections?mine=true | own requests | gated OK | none needed |
| Live Office – tabs | Settings tab | rooms/memberships/grants/registry | internal_org.manage OR internal_hr.manage (existing canManage) | gated OK | none needed; backend gap Q1 (no live-office code) |
| Live Office – floor | Arrange rooms (drag, arrow keys, auto-arrange, save) | PATCH /internal/live-office/rooms/{id} | canManage | gated OK | now also hidden after a 403 (rooms list or save): LiveOfficePage.tsx:110,127,341; LiveFloor.tsx:165,261 |
| Live Office – floor | Add room (toolbar + empty-state CTA) | POST /internal/live-office/rooms | canManage | gated OK | 403 → removed: LiveOfficePage.tsx:342,398 |
| Live Office – floor | Edit room (arrange mode) | PATCH /internal/live-office/rooms/{id} | canManage | gated OK | 403 → removed: LiveOfficePage.tsx:343 |
| Live Office – floor/list | Open person screen / card | read | read | gated OK | none needed |
| Live Office – person screen | Dress character | PATCH /internal/employees/{id} (profile.live_character) | internal_hr.manage (employee update, LEXGO_INTERNAL_HRM_FRONTEND §Xodimlar) | shown ungated | (before: was org.manage OR hr.manage) now internal_hr.manage only + 403 → removed: LiveOfficePage.tsx:54,280 |
| Live Office – person screen | Open record | read | read | gated OK | none needed |
| Live Office – employee drawer | Analytics button | GET /internal/live-office/analytics | see Analytics tab | after-click 403 only | hidden after analytics 403; footer hidden when empty: LiveEmployeeDrawer.tsx:101; LiveOfficePage.tsx:368 |
| Live Office – employee drawer | Dress character | PATCH /internal/employees/{id} | internal_hr.manage | shown ungated | (before: org.manage sufficed) LiveOfficePage.tsx:378 |
| Live Office – employee drawer | Stop someone's busy | POST /internal/live-office/busy/{id}/stop | own, or canManage | gated OK | 403 → button removed: LiveEmployeeDrawer.tsx:83,286 |
| Live Office – employee drawer | Report timeline item (flag) | POST /internal/live-office/corrections | own record only (isMe) | gated OK | also removed after correction 403: LiveEmployeeDrawer.tsx:216; LiveOfficePage.tsx:376 |
| Live Office – employee drawer | "Wrong place" | POST /internal/live-office/corrections | own record only (isMe) | gated OK | also removed after correction 403: LiveEmployeeDrawer.tsx:268 |
| Live Office – employee drawer | Date range pickers | GET /internal/live-office/employees/{id} | read | gated OK | none needed |
| Corrections tab | New correction | POST /internal/live-office/corrections | own | after-click 403 only | 403 → removed; header actions not rendered when empty: LiveCorrections.tsx:81; LiveOfficePage.tsx:352 |
| Corrections tab | Mine / Review switch | GET /internal/live-office/corrections?status=pending | canManage | gated OK | (before: + 403 hid tab) 403 now also returns to "mine": LiveCorrections.tsx:52 |
| Corrections tab | Review a correction | POST /internal/live-office/corrections/{id}/review | canManage; status pending/returned/new | gated OK | 403 → review tab + buttons removed, back to "mine", modal keeps message, submit removed: LiveCorrections.tsx:123,134,196 |
| Correction form | Send | POST /internal/live-office/corrections | own | after-click 403 only | submit removed on 403: LiveCorrections.tsx:310 |
| Settings – sections | Characters section | PATCH /internal/employees/{id} | internal_hr.manage | shown ungated | (before: org.manage sufficed) section hidden without internal_hr.manage: LiveSettings.tsx:46 |
| Settings – Characters | Dress (per person) | PATCH /internal/employees/{id} | internal_hr.manage | shown ungated | gated via section: LiveSettings.tsx:46 |
| Settings – Rooms | New room | POST /internal/live-office/rooms | canManage | gated OK | (before: tab) 403 on list/save or floor refusal → removed: LiveSettings.tsx:134,146 |
| Settings – Rooms | Edit room (row, + column) | PATCH /internal/live-office/rooms/{id} | canManage | gated OK | (before: tab) 403 → button and empty column removed: LiveSettings.tsx:169,187 |
| Room builder | Create / Save | POST/PATCH /internal/live-office/rooms | canManage | after-click 403 only | save removed on 403, page drops room tools: RoomBuilder.tsx:86; LiveOfficePage.tsx:398 |
| Settings – Memberships | New membership | POST /internal/live-office/memberships | canManage | gated OK | (before: tab) 403 on list/save → removed: LiveSettings.tsx:256,372 |
| Settings – Grants | Give temporary access | POST /internal/live-office/access-grants | canManage | gated OK | (before: tab) 403 → button removed, drawer save removed: LiveSettings.tsx:420,551 |
| Settings – Grants | Revoke grant | POST /internal/live-office/access-grants/{id}/revoke | canManage; active grant only | gated OK | 403 → revoke buttons removed: LiveSettings.tsx:448 |
| Settings – Registry | New rule | POST /internal/activity-registry | canManage | gated OK | (before: tab) 403 on list/save → removed: LiveSettings.tsx:598,742 |
| Character studio | Save look | PATCH /internal/employees/{id} | internal_hr.manage | after-click 403 only | (before: opened for org.manage) entry points gated; save removed on 403: CharacterStudio.tsx:84; LiveOfficePage.tsx:412 |
| Character studio | Random / reset / presets / parts | local only | — | gated OK | none needed |
| Reason dialog (busy/revoke) | Submit | (as caller) | (as caller) | after-click 403 only | submit hidden on 403, onForbidden to caller: bits.tsx:142,161 |
| App-wide heartbeat (components/live/LiveOfficeHeartbeat) | Send heartbeat (no UI) | POST /internal/live-office/heartbeat | any internal user | gated OK | (before: stops on 403/404) none needed |
| components/live/floorKit, floorArt | Pan/zoom only | — | — | gated OK | none needed |
| HRM module screen (/internal/hrm/{domain}, leave, travel, recruiting, onboarding, offboarding, movements, policies, learning, documents, skills) | Header "New / New {type}" | POST /internal/hrm/{domain}/records | record type's permission from the HRM menu (nav.ts: internal_hr/org/time/payroll/execution/kpi/analytics) — open types stay open; Q5 | shown ungated | hidden unless the account may write a type — components/internal/hrm/HrmModuleScreen.tsx:337-347 (+ components/internal/hrm/access.ts) |
| HRM module screen | Empty-state "New" CTA | POST /internal/hrm/{domain}/records | same as above | shown ungated | hidden — HrmModuleScreen.tsx:524 |
| HRM module screen | New-record form: record-type picker | POST /internal/hrm/{domain}/records | only types the account may write | shown ungated | (before: all types) picker lists writable types only — HrmModuleScreen.tsx:562 (types prop), RecordForm Select |
| HRM module screen → record drawer | Edit | PATCH /internal/hrm/{domain}/records/{id} | type permission + status draft/returned (EDITABLE) | shown ungated | (before: status gate only) hidden without type permission; whole footer omitted — HrmModuleScreen.tsx:820-840; Q5 |
| HRM module screen → record drawer | Add child record | POST /internal/hrm/{domain}/records (parent_id) | type permission + type.allow_children | shown ungated | hidden without type permission — HrmModuleScreen.tsx:836 |
| HRM module screen → record drawer | Transition buttons (approve/reject/submit/close/…) | POST /internal/hrm/{domain}/records/{id}/transition | record.allowed_transitions + type permission | gated OK | (before: allowed_transitions) also needs type permission; "no moves" note hidden for read-only viewers — HrmModuleScreen.tsx:341,821,846-862; Q6 |
| Timesheet module (/internal/hrm/timesheet) → record drawer | Reopen a closed timesheet | POST /internal/hrm/{domain}/records/{id}/transition (closed → …) | internal_time.manage AND internal_payroll.manage (10-13 §1.2, 10-14 timesheet row) | shown ungated | (before: allowed_transitions only) hidden unless both codes — HrmModuleScreen.tsx:341 (can(..., {all:true, roles:[admin,superadmin]}) via access.ts canAll) |
| HRM module screen board view | Drag a card to another column | POST …/records/{id}/transition | same moves as the drawer | after-click 403 only | (before: any card draggable) card not draggable unless it has a move the account may make — HrmKanban.tsx canMove prop; HrmModuleScreen.tsx:470 |
| HRM module screen | Reason modal submit (transition) | POST …/transition | follows the drawer/board gate | gated OK | (before: reached only from gated moves) none needed |
| HRM module screen | Refresh, type tabs, filters, views, pager, stat filters | GET only | read | gated OK | none needed |
| HRM hub (/internal/hrm) | Module cards | navigation to module pages | module page permission (nav.ts) | shown ungated | cards (and empty groups) hidden for modules the account cannot open — components/internal/hrm/HrmHub.tsx:24-26,108-118 |
| HRM hub / My records (/internal/me/records) | Open own record | GET | own records | gated OK | none needed |
| Leave module (LeavePanel) | "Team" balances tab | GET /internal/hrm/leave/balances | internal_time.manage or internal_hr.manage | gated OK | 403 now also removes the tab (notice kept) — components/internal/ops/LeaveOps.tsx:24-30,47,80-84 |
| Leave module | New leave request (form) | POST /internal/hrm/leave/records | leave module open to all (menu); leave/check blocks | gated OK | (before: check) none needed |
| Timesheet module (TimesheetsPanel) | "New timesheet" header button | POST /internal/hrm/timesheet/sheets | internal_time.manage (10-13 §1.2) | shown ungated | hidden — components/internal/ops/TimeOps.tsx:194-201 |
| Timesheet module (TimesheetsPanel) | Empty-state "New timesheet" CTA (+ "create one" hint) | POST /internal/hrm/timesheet/sheets | internal_time.manage | shown ungated | hidden — TimeOps.tsx:211 |
| Timesheet module | Open record link | navigation | read | gated OK | none needed |
| Time page (/internal/time) → Today's team | "Manual mark" header button | POST /internal/time/attendance/events/manual | internal_time.manage (10-14 §: HR adds manual marks) | shown ungated | hidden — TimeOps.tsx:54-58,68 |
| Time page → Today's team | Per-person manual mark (pencil) | POST /internal/time/attendance/events/manual | internal_time.manage | shown ungated | hidden — TimeOps.tsx:94 |
| Time page | Check in / break start / break end / check out | POST /internal/time/attendance/events | self (employee_id omitted = own) | gated OK | none needed |
| Scheduling module | Schedule matrix / on duty | GET | read | gated OK | none needed |
| Schedules page (/internal/schedules) | "New schedule" header button | POST /internal/time/schedules | internal_time.manage | shown ungated | hidden — components/internal/InternalSchedulesPage.tsx:36-39,77 |
| Schedules page | Empty-state "New schedule" CTA | POST /internal/time/schedules | internal_time.manage | shown ungated | hidden — InternalSchedulesPage.tsx:119 |
| Execution (/internal/execution) | "New task" header button | POST /internal/execution/tasks | internal_execution.manage | shown ungated | hidden — components/internal/InternalOperationsPages.tsx:177-178,211 |
| Execution | Empty-state "New task" CTA | POST /internal/execution/tasks | internal_execution.manage | shown ungated | hidden — InternalOperationsPages.tsx:295 |
| Execution board | Drag task to another status | PATCH /internal/execution/tasks/{id}/status | internal_execution.manage | shown ungated | no drag without the code — InternalOperationsPages.tsx:253 |
| Execution → task drawer | Status select (any status) | PATCH /internal/execution/tasks/{id}/status | internal_execution.manage | shown ungated | (before: manage hard-coded) shown only with the code; 403 removes it — InternalOperationsPages.tsx:299, components/internal/TaskDrawer.tsx (canMove/refused) |
| My tasks (/internal/me/tasks) → task drawer | Accept / start / send for review / pause | PATCH /internal/execution/tasks/{id}/status | own task (assignee) | gated OK | (before: own list) 403 now removes the buttons — TaskDrawer.tsx (refused) |
| Execution / My tasks → task drawer | Send comment | POST /internal/execution/tasks/{id}/comments | participant of the task (not stated) | shown ungated | backend gap Q7 |
| Execution | View tabs, filters, calendar/gantt/load/projects | GET | read | gated OK | none needed |
| KPI (/internal/kpi) | "New KPI" header button | POST /internal/kpi/metrics | internal_kpi.manage | shown ungated | hidden — InternalOperationsPages.tsx:480-481,502 |
| KPI | Empty-state "New KPI" CTA | POST /internal/kpi/metrics | internal_kpi.manage | shown ungated | hidden — InternalOperationsPages.tsx:541 |
| Payroll (/internal/payroll) | "New entry" header button | POST /internal/payroll/entries | internal_payroll.manage | shown ungated | hidden — InternalOperationsPages.tsx:629-631,649 |
| Payroll | "Calculate" header button | POST /internal/payroll/calculate | internal_payroll.manage | shown ungated | hidden — InternalOperationsPages.tsx:649 |
| Payroll entries | Row "Move to…" status select (+ column) | POST /internal/payroll/entries/{id}/status | internal_payroll.manage | shown ungated | column and cells hidden — InternalOperationsPages.tsx:693,705-726 |
| Payroll entries | Empty-state "New entry" CTA | POST /internal/payroll/entries | internal_payroll.manage | shown ungated | hidden — InternalOperationsPages.tsx:733 |
| Payroll → runs panel | "New run" header button | POST /internal/payroll/runs | internal_payroll.manage | shown ungated | hidden — components/internal/ops/PayrollOps.tsx:37-40,50 |
| Payroll → runs panel | Empty-state "New run" CTA | POST /internal/payroll/runs | internal_payroll.manage | shown ungated | hidden — PayrollOps.tsx:58 |
| Payroll → run drawer | calculate/recalculate/submit/approve/pay/close/cancel | POST /internal/payroll/runs/{id}/{action} | internal_payroll.manage + run.allowed_actions | shown ungated | (before: falls back to a frontend status map) hidden without the code; 403 removes them; "no actions" note only for managers — PayrollOps.tsx:96-99,111,124-131 |
| My payslips (/internal/me/payslips) | Refresh | GET /internal/me/payslips | own | gated OK | none needed |
| Analytics (/internal/analytics) | Export XLSX | GET /internal/analytics/export.xlsx | internal_analytics.view | shown ungated | hidden — InternalOperationsPages.tsx:894,939 |
| Analytics | Overview / HR tabs, date filters | GET | read | gated OK | none needed |
| Approvals inbox (/internal/me/approvals) | Quick approve on card | POST /internal/approvals/{id}/decision | object-level: approval is in my pending list | gated OK | a 403 now drops that approval from the inbox — components/internal/InternalApprovalsPage.tsx:36-39,92-94,106 |
| Approvals inbox → drawer | Approve / Reject | POST /internal/approvals/{id}/decision | object-level (my approvals) | gated OK | a 403 now closes the drawer and drops the approval — InternalApprovalsPage.tsx:76-80 |
| Employee card (EmployeeOps) | Hire / change status / dismiss / reinstate | POST /internal/employees/{id}/{hire, status, dismiss, reinstate} | internal_hr.manage | shown ungated | not rendered without the code — components/internal/ops/EmployeeOps.tsx:LifecycleButtons |
| Employees list (EmployeeOps) | Export XLSX | GET /internal/employees/export.xlsx | internal_hr.manage (HR list export, 10-13 §1.4) | shown ungated | not rendered without the code — EmployeeOps.tsx:ExportEmployeesButton |
| Employee card (EmployeeOps) | Module record counts → open module | navigation | module page permission | shown ungated | count stays, link only for modules the account may open — EmployeeOps.tsx:ModuleCounts |
| Employee card | Readiness checks | GET | read | gated OK | none needed |
| Org page (OrgOps) | Tree: pick unit / whole company | GET | read | gated OK | none needed |
| HrmCalendar / WorkViews / HrmUi | month nav, open item | none (UI) | — | gated OK | none needed |
| HRM record form (HrmFieldInput) | File upload into a field | POST workspace file upload | only inside a gated form | gated OK | none needed |
| Shell (all /internal pages) | Sidebar / mobile tab bar / "More" items | page routes (nav.ts) | per-item `permission` via canInternal; route guard redirects to /internal | gated OK | none needed (InternalShell.tsx:106) |
| Shell | Group accordion toggle, rail fold, burger | none (local UI) | — | gated OK | none needed |
| Shell top bar | "Back to admin" link + App switcher "Admin" entry | /admin | hasAdminAccess(session) | gated OK | none needed (InternalShell.tsx, ShellParts.tsx AppSwitcher) |
| Shell top bar | Feedback (lightbulb) button → create feedback | POST /internal/product-feedback | hasInternalAccess (any internal account may report) | gated OK | none needed (feedback/FeedbackButton.tsx:18) |
| Shell top bar | Notifications bell: open item (mark read), "Mark all read" | POST /internal/notifications/{id}/read, /read-all | own notifications (self) | gated OK | none needed (disabled only when nothing unread) |
| Shell top bar | User menu: profile, shortcuts, theme, logout | none / self | self | gated OK | none needed |
| Shell | Keyboard: Ctrl/⌘+K and "/" open palette, "?" shortcuts dialog | none | navigation only | gated OK | none needed |
| Command palette | Page entries | page routes | built from the shell's permission-filtered groups | gated OK | none needed |
| Command palette | People hits → employee card | GET /internal/employees/{id}/360 (card page) | card page needs internal_hr.manage (nav "employees") | shown ungated | hidden unless the employees page is in the account's menu (CommandPalette.tsx:43,97) |
| Command palette | Candidate hits (server search) → recruiting | GET /internal/hrm/recruiting/records | recruiting page needs internal_hr.manage (nav) | shown ungated | (before: request sent, link bounced) request and hits skipped unless /internal/recruiting is in the menu (CommandPalette.tsx:42,49) |
| Command palette | Course / policy hits (server search) | GET /internal/hrm/lms (or policies)/records | no permission (open pages) | gated OK | none needed (same reach() check keeps them) |
| Dashboard /internal | Refresh | GET /internal/me/today | self | gated OK | none needed |
| Dashboard /internal | Check in / Check out | POST /internal/time/attendance/events | self (10-08 guide: employee may post for self) | gated OK | none needed (disabled only by attendance state) |
| Dashboard /internal | Quick shortcuts (employees, org, execution, analytics) | page routes | internal_hr / internal_org / internal_execution.manage, internal_analytics.view | gated OK | none needed (page.tsx:110) |
| Dashboard /internal | "Open all" tasks / messages links | /internal/me/* | self | gated OK | none needed |
| Dashboard / Today | Attention tiles (team tiles: HR waiting, corrections, feedback) | GET overview/corrections/feedback | manager = internal_hr.manage or internal_org.manage | gated OK | none needed (AttentionTiles.tsx) |
| Today /internal/today | Tiles, "mine" rows, quick links (leave, travel, attendance, policies) | navigation; team tiles from GET /internal/hrm/overview | manager tiles gated by canInternal; quick links open self-service pages | gated OK | none needed |
| Sections /internal/sections | Section tiles, fold/unfold | page routes | NAV permission filter | gated OK | none needed (SectionsPage.tsx:48) |
| Profile /internal/me | Refresh, Live office link | GET /internal/me/profile | self | gated OK | none needed |
| My tasks /internal/me/tasks | Open task → status / comment (TaskDrawer, non-manage mode) | PATCH /internal/execution/tasks/{id}/status, POST …/comments | assignee self; next statuses limited by NEXT map | gated OK | none needed here (TaskDrawer.tsx is another part's file) |
| My attendance /internal/me/attendance | Refresh, month calendar, schedule panel | GET only | self | gated OK | none needed (MySchedulePanel is ops/TimeOps — other part) |
| Messages /internal/me/messages | Send message form | POST /internal/messages | recipients are logins only the employee list (internal_hr.manage) carries | shown disabled | (before: form with send button that could never be enabled) form not rendered when no recipient is available; only the existing "recipient list isn't available to you" note (InternalSelfPages.tsx:490); backend gap Q9 |
| Employees /internal/employees | New employee (header + empty-state CTA) | POST /internal/employees | internal_hr.manage | gated OK | (before: page needs HR) explicit canInternal gate added, create drawer not mounted without it (InternalPeoplePages.tsx:67,195,258,294) |
| Employees | Export | GET /internal/employees/export.xlsx | internal_hr.manage (page) | gated OK | none needed (button is ops/EmployeeOps — other part) |
| Employees | Refresh, sort, filters, page size, pager, saved views (local) | GET /internal/employees | page-level internal_hr.manage | gated OK | none needed |
| Employee card /internal/employees/[id] | Edit button + "Edit" tab | PATCH /internal/employees/{id}, POST /internal/employees/assignments | internal_hr.manage | gated OK | (before: page needs HR) explicit gate; ?tab=edit falls back to overview without it (EmployeeCard.tsx:62-71,96,115) |
| Employee card | Record tabs (personal … offboarding) + "Open module"/"Open" links | GET /internal/hrm/{domain}/records?employee_id= | per-domain read right, not known ahead (catalog has no permission per domain) | after-click 403 only | (before: tab showed an error) on 403 the tab is removed and the card returns to overview (EmployeeCard.tsx:65-71, Records onForbidden); backend gap Q10 |
| Employee card | Lifecycle buttons, readiness, module counts | /internal/employees/{id}/… | internal_hr.manage | shown ungated | EmployeeOps.tsx LifecycleButtons now render nothing without internal_hr.manage (fixed in components/internal/ops/EmployeeOps.tsx, part C); readiness/module counts are read-only |
| Employee card | Live office link | /internal/live-office | open page | gated OK | none needed |
| Employee 360 drawer (org page) | "Edit" tab (profile + assignment save) | PATCH /internal/employees/{id}, POST /internal/employees/assignments | internal_hr.manage | shown ungated | (before: org managers without HR saw it) tab row hidden without HR; edit form never rendered (EmployeeDrawers.tsx:190,211,219) |
| Employee 360 drawer | "Open card" link | /internal/employees/{id} | card page needs internal_hr.manage | shown ungated | (before: bounced to /internal) hidden with the tab row (EmployeeDrawers.tsx:211) |
| Org /internal/org | View tabs (board/tree/list/stats), refresh | GET /internal/org/board, /tree | page-level internal_org.manage | gated OK | none needed |
| Org | New position (header + positions panel), edit position (row pencil) | POST/PATCH /internal/org/positions | internal_org.manage (page) | gated OK | none needed |
| Org | New unit (header, empty-state CTA) | POST /internal/org/units | internal_org.manage (page) | gated OK | none needed |
| Org | Close unit confirm, Undo (toolbar + Ctrl+Z) | PATCH /internal/org/units/{id} | internal_org.manage (page) | gated OK | none needed |
| Org whiteboard | Card: drag-to-reparent, F2 rename, Tab add child, Del close, ⌘D duplicate, +child/+sibling buttons | PATCH/POST /internal/org/units | internal_org.manage (page) | gated OK | none needed |
| Org whiteboard | Context menu: open, rename, edit, add child/sibling/above, duplicate, copy name/link, collapse, chain, branch, close, insert between, add root, fit, expand/collapse all, card mode, minimap, full screen, export PNG/SVG | org units (as above) / local | internal_org.manage (page) | gated OK | none needed |
| Org whiteboard | Context menu "Add employee" | POST /internal/employees (+ assignments) | internal_hr.manage | shown ungated | hidden without HR (OrgWhiteboard.tsx:468; InternalOrgPage.tsx:195) |
| Org whiteboard | Unit side panel: edit unit, add sub-unit | PATCH/POST /internal/org/units | internal_org.manage (page) | gated OK | none needed |
| Org whiteboard | Unit side panel: "Add employee" | POST /internal/employees | internal_hr.manage | shown ungated | hidden without HR (OrgWhiteboard.tsx:1344) |
| Org whiteboard | Toolbar: search, collapse/expand all, full screen, export PNG/SVG, mode, zoom, minimap | local only | — | gated OK | none needed |
| Org list view | Detail panel: edit unit, add sub-unit | PATCH/POST /internal/org/units | internal_org.manage (page) | gated OK | none needed |
| Org list view | Detail panel: "Add employee" | POST /internal/employees | internal_hr.manage | shown ungated | hidden without HR (InternalOrgBoard.tsx:274) |
| Org list view | Employee detail: "Open 360" | GET /internal/employees/{id}/360 | read; edit inside gated (see 360 rows) | gated OK | none needed |
| Org stats | Filters, sort, CSV export (client-side), row → edit unit / open 360 | local / PATCH via unit drawer | internal_org.manage (page) | gated OK | none needed |
| Org unit create dialog | Create (incl. "add above" re-parent) | POST /internal/org/units, PATCH parent | internal_org.manage (page) | gated OK | none needed |
| Org | Employee create dialog (from a unit) | POST /internal/employees | internal_hr.manage | shown ungated | not mounted without HR (InternalOrgPage.tsx:263) |
| Feedback /internal/feedback | New (header + empty-state CTA), Refresh | POST /internal/product-feedback | any internal account | gated OK | none needed |
| Feedback | "All / Mine" tabs | GET /internal/product-feedback | shown to hr/org managers; 403 on "all" already drops the tabs | gated OK | none needed (noAll) |
| Feedback drawer | Triage form (status, assignee, resolution, save) | PATCH /internal/product-feedback/{id} | no contract code; code shows it to internal_hr/org.manage | after-click 403 only | on 403 the message stays and the form is removed for the session (FeedbackPage.tsx:38,136, drawer catch); backend gap Q11 |
| Feedback drawer | "Object" row showed a UUID fragment | — | UI law: no UUIDs | shown ungated | shows the object type only (FeedbackPage.tsx:202) |
| Feedback dialog | Type, steps add/remove, attach file, send | POST /internal/workspace files, POST /internal/product-feedback | any internal account | gated OK | none needed (disabled only by form validation/upload) |
| Pagination (all lists) | Previous / Next | list GETs | — | gated OK | none needed (disabled by position only) |

#### Counts

- Actions audited: 158
- Before: gated OK 97, shown ungated 47, shown disabled 2, after-click 403 only 12
- Hidden / changed by this audit: 111 (includes gated-OK rows that now also leave the screen after a 403)
- Already OK, nothing changed: 46
- Left as backend gap only: 1; total backend questions: 11 (HRM-questions.md)
- i18n: no new keys (no HRM-i18n.json)

#### Files changed
- components/internal/CommandPalette.tsx
- components/internal/EmployeeCard.tsx
- components/internal/EmployeeDrawers.tsx
- components/internal/HrmKanban.tsx
- components/internal/InternalApprovalsPage.tsx
- components/internal/InternalOperationsPages.tsx
- components/internal/InternalOrgBoard.tsx
- components/internal/InternalOrgPage.tsx
- components/internal/InternalPeoplePages.tsx
- components/internal/InternalSchedulesPage.tsx
- components/internal/InternalSelfPages.tsx
- components/internal/OrgWhiteboard.tsx
- components/internal/TaskDrawer.tsx
- components/internal/feedback/FeedbackPage.tsx
- components/internal/hrm/HrmHub.tsx
- components/internal/hrm/HrmModuleScreen.tsx
- components/internal/live/CharacterStudio.tsx
- components/internal/live/LiveAnalytics.tsx
- components/internal/live/LiveCorrections.tsx
- components/internal/live/LiveEmployeeDrawer.tsx
- components/internal/live/LiveFloor.tsx
- components/internal/live/LiveOfficePage.tsx
- components/internal/live/LiveSettings.tsx
- components/internal/live/RoomBuilder.tsx
- components/internal/live/bits.tsx
- components/internal/ops/EmployeeOps.tsx
- components/internal/ops/LeaveOps.tsx
- components/internal/ops/PayrollOps.tsx
- components/internal/ops/TimeOps.tsx
- components/tasks/TaskForm.tsx
- components/tasks/TeamTasksPage.tsx
- components/internal/hrm/access.ts

## Shared: chat & calls, copilot, guide/AI navigation, notifications, marketplace, public pages

Backend gap numbering: rows say `backend gap Qn` with their section's local number; in SHARED-questions.md core Q1 = Q1, chat Q1–Q4 = Q2–Q5, marketplace Q1–Q3 = Q6–Q8.

#### Copilot, guide/AI navigation, onboarding, notification links, shared UI, public sections, routes

| Screen | Action | Endpoint | Permission / rule | Before | Fix |
|---|---|---|---|---|---|
| AI copilot panel (CopilotPanel) | Composer (textarea + send) after the copilot is refused for the account | POST /api/ai/copilot | backend 403 `*_copilot_role_required` → state.denied | shown disabled | hidden while denied; deny card stands alone — components/copilot/CopilotPanel.tsx:501 |
| AI copilot panel | Retry on a failed turn while denied | POST /api/ai/copilot | same | shown disabled | not rendered while denied (new `denied` prop) — components/copilot/CopilotAnswer.tsx:~440, CopilotPanel.tsx:467 |
| AI copilot panel | Suggested prompt chips / intro prompts | POST /api/ai/copilot | GET /api/ai/capabilities `tools` (prompts.ts NEEDS_TOOL) + hidden when denied | gated OK | none needed |
| AI copilot answer | "Open <page>" navigation button | client route | GET /me/navigation role policy (isPathHidden) | shown ungated (click silently ignored by go()) | not rendered for a hidden page — components/copilot/CopilotAnswer.tsx:423 |
| AI copilot answer | Action card "Open" link | client route | isPathHidden | shown ungated | route dropped → no Open button — CopilotAnswer.tsx:491 |
| AI copilot answer | Source chips that open a page | client route | isPathHidden | shown ungated | rendered as plain text chip when hidden — CopilotAnswer.tsx:504 |
| AI copilot answer | Save draft / Confirm action | POST /api/ai/copilot/actions/execute | backend `saveable` + `confirmation_required` per action preview | gated OK | none needed |
| AI copilot answer | Rate / useful feedback | POST /api/ai/copilot/feedback | own answer | gated OK | none needed |
| AI copilot drafts tab | Reload / copy / expand | GET drafts (read-only) | own drafts | gated OK | none needed |
| AI copilot launcher (CopilotHost/Launcher) | Open copilot | GET /api/ai/capabilities | status denied → available=false → launcher not rendered | gated OK | none needed |
| AI action confirm (AiActionConfirm) | Confirm (Yes) when backend preview `can_execute=false` | POST instructor action confirm | preview.canExecute | shown disabled | not rendered; only Close + backend reason — components/guide/AiActionConfirm.tsx:66,186 |
| AI action confirm | Confirm/Retry after a 403 from confirm | POST instructor action confirm | 403 | after-click 403 only (Retry offered again) | 403 counts as blocked → Confirm leaves, Close stays — AiActionConfirm.tsx:66 |
| AI action confirm | Fill-form Yes/No | local DOM fill | only rendered targets | gated OK | none needed |
| Guide tours (GuideHost, lib/guide/pages) | Staff page tours (26 admin pages + staff support) | — | page perms mirrored from AdminShell NAV (leads.manage, services.manage, orders.manage, …; full-admin pages → admin role) | shown ungated (tour/targets offered for pages the account can't open) | page filtered out of pageFor/registryTargets — new lib/guide/access.ts, lib/guide/pages/index.ts:27 |
| Guide tours | Step "New lead" / "Auto-assign" (admin_pipeline) | POST /leads, POST /leads/auto-assign | leads.manage (roles admin) = canManageLeads | shown ungated (cross-page AI target) | step dropped — lib/guide/access.ts STEP_GATES |
| Guide tours | Step "Create meeting" (admin_meetings) | POST /calls | canMakeCalls (meetings.manage / call-centre role) | shown ungated | step dropped — lib/guide/access.ts STEP_GATES |
| Guide tours | Current-page steps whose element is not rendered | — | DOM presence | gated OK (flexible tours skip missing targets) | none needed |
| AI instructor cross-page targets (lib/ai/destinations.ts crossPageTargets) | Targets on other pages | — | guideHref → isPathHidden + backend allowedRoutes; registryTargets now permission-filtered | partly gated | registryTargets filtered (see above); no change needed in destinations.ts |
| AI commands (lib/ai/commands.ts) | navigate / guided purchase / support ticket / preview-confirm | various | guideHref (isPathHidden) + backend contract allowedRoutes + preview can_execute | gated OK | none needed |
| Onboarding tour (OnboardingHost, lib/onboarding/tour.ts) | Steps pointing at nav rows | — | nav rows are role/permission-gated by PortalShell; missing element skipped | gated OK | none needed |
| Notification links (lib/notifications.ts notifLink) | Click-through to a page | client route | isPathHidden; admin targets: /admin/call-center/support (callcenter.access / cc roles), /admin/call-center (leads.manage / callcenter.access / call_center_lawyer), /admin/marketplace (orders.manage) | shown ungated | hidden pages never linked; optional `allows` (useCan) arg drops admin links the session lacks — lib/notifications.ts:183-205. Callers in PORTAL/HRM must pass `canDo` (see report) |
| /tasks redirect (app/[locale]/tasks/page.tsx) | Deep link to team tasks | — | tasks.view (nav gates team-tasks on it) | shown ungated (landed on a page the account can't use) | sends to own home without tasks.view — app/[locale]/tasks/page.tsx:15 |
| Shared Menu (components/ui/Menu.tsx) | Kebab/menu trigger whose items were all filtered out | — | — | empty kebab menu left behind | Menu renders nothing when no item remains — components/ui/Menu.tsx:631 |
| Public lawyers section (LawyersSection) | "Choose" (order with this advocate) | /portal/client/services | client portal only (route is /portal/client) | shown ungated to signed-in lawyers/advocates/staff | rendered only for guests (→ login) and clients — components/sections/LawyersSection.tsx:345 |
| Public lawyers section | "Private chat" (paid) | POST /payments/checkout target_type=private_chat | no contract names who may buy | shown | backend gap Q1 |
| Public subscription section | "Buy" → /portal/{role}/subscription | — | own role's subscription page | gated OK | none needed |
| Public contact / legal-aid / B2B / academy sections | Send lead / legal-aid request | POST /leads (public), POST /legal-aid | public endpoints | gated OK | none needed |
| Finder / landing / AIChatDock / OpenChatButton / MobileTabBar / Navbar | Navigate / open public AI chat | public | public | gated OK | none needed |
| ContractCard | Download contract | GET contract file | own contract | gated OK | none needed |
| Register flow / consent gate / cookie consent | Register, accept consents | public / own | public / own | gated OK | none needed |
| Gift landing (app/[locale]/gift/[code]) | Claim gift | POST /gifts/{code}/claim | signed-in; guests get Login | gated OK | none needed |
| Account deletion page | mailto request | — | public | gated OK | none needed |

#### Chat, calls/meetings (CallRoom host controls), complaints, remote assist

| Screen | Action | Endpoint | Permission / rule | Before | Fix |
|---|---|---|---|---|---|
| Meeting room (CallRoom) | Mute / unmute participant | PATCH /secure-chats/{room}/calls/{call}/participants/{user} {mic_enabled} | call `permissions.can_mute` (per call) | gated OK | 403 now drops canMute locally → buttons leave: components/chat/CallRoom.tsx:1795-1804 |
| Meeting room (CallRoom) | Remove participant | same, {status:"removed"} | `permissions.can_kick` | gated OK | 403 drops canKick + reloads roster: CallRoom.tsx:1806-1813 |
| Meeting room (CallRoom) | Invite people (picker + send) | POST …/calls/{call}/participants | `permissions.can_invite` | gated OK | 403 drops canInvite, clears picks, no retry offered: CallRoom.tsx:1815-1836 |
| Meeting room (CallRoom) | Free extension (+3 min) | POST …/calls/{call}/free-extension | `permissions.can_end` + time-limited call + free extension available | gated OK | 403 drops canEnd: CallRoom.tsx:1682 |
| Meeting room (CallRoom) | Paid extension (bar + phone sheet + dialog) | POST …/extension-payment-request | `permissions.can_end` + time limit | gated OK | 403 drops canEnd, closes dialog: CallRoom.tsx:1699 |
| Meeting room (CallRoom) | Pause / resume meeting | POST …/pause, …/resume | `permissions.can_end` && staff/advocate (iApprove) | gated OK | 403 → pauseGone (control leaves): CallRoom.tsx:1763 |
| Meeting room (CallRoom) | Record (bar + phone sheet) | local recorder; client asks POST …/recording-request | browser canRecord(); client needs approver consent (request flow, not a permission) | gated OK | none needed |
| Meeting room (CallRoom) | Approve/deny client recording request | POST …/recording-permission | iApprove (canMakeCalls / advocate / lawyer) — card only shown to approvers | gated OK | none needed |
| Meeting room (CallRoom) | End for all / leave (main bar + PiP bar) | POST end (room) / leave | caller = host ends, others leave; always allowed | gated OK | none needed |
| Meeting room (CallRoom) | Mic toggle disabled while host-muted | LiveKit | state (muted by host), not a permission | gated OK | none needed |
| Secure chat header | Audio / video call buttons | GET/POST /secure-chats/{room}/calls | canMakeCalls(session) + room not closed + calls enabled | gated OK | 403 → `refused.call` hides both: components/chat/SecureChat.tsx:965-970, 1791 |
| Secure chat header | Complete consultation (urgent) | POST /urgent-requests/{id}/complete | staff only (client is 403'd) — isStaffSession | gated OK | 403 → `refused.complete` hides button + closes summary form: SecureChat.tsx:931-938, 1803 |
| Secure chat kebab | Auto-delete TTL options | PATCH /secure-chats/{room}/auto-delete | participant (no code in contracts) | after-click 403 only | 403 → TTL group leaves menu: SecureChat.tsx:989-994, 1830 |
| Secure chat kebab | Delete chat | DELETE /secure-chats/{room} | participant (no code in contracts) | after-click 403 only | 403 → item leaves; whole kebab hidden when both TTL+delete refused (no empty menu, no orphan separator): SecureChat.tsx:1012, 1822-1854 |
| Secure chat | Rate urgent consultation | POST /urgent-requests/{id}/rating | object: rating window open (ratingOpen/deadline), client side | gated OK | 403 → card closes + one notice: SecureChat.tsx (UrgentRating send) |
| Secure chat | Composer send / attach / voice | WS send, POST upload | object: room `read_only` / finished hides composer; WS 403 may be content filter | gated OK | none needed (403 frame keeps message; can't tell refusal from filter — see Q1) |
| Secure chat | Copilot button | client copilot | useCopilotAvailable | gated OK | none needed |
| Secure chat (staff, unmounted component) | Request content reveal | POST /secure-chats/{room}/content-reveal/request | staff with reveal permission (no code named) | shown ungated | shown only when nothing pending; 403 removes it: components/chat/ContentRevealBar.tsx:61, 44 |
| Secure chat (staff, unmounted component) | Approve content reveal | POST …/content-reveal/approve | a pending request, by another staff member than requester | shown ungated (even with nothing pending) | only when pending and requester ≠ me; 403 removes it: ContentRevealBar.tsx:62 |
| Meetings page (MeetingLauncher, rich + plain) | Create meeting form / "New meeting" CTA / how-to | POST /secure-chats + POST …/calls | canMakeCalls(session) | shown disabled (locked alert in place of the form) | form, header section and how-to not rendered without the right; plain layout drops the column (pgrid2); 403 on start → hostRefused hides it: components/chat/MeetingLauncher.tsx:323, 551, 619, 834-883, 958-978, 1206 |
| Meetings page | Empty-history "New meeting" CTA | — | canHost | gated OK | follows canHost (now incl. 403) |
| Meetings page | All-platform history tab + call detail | GET /admin/calls | can(session,"leads.manage") (lead's change) | gated OK | none needed |
| Meetings page | Join / rejoin | LiveKit join | object: live + can_start_now; disabled with reason for time, not permission | gated OK | none needed |
| AI chat page / widget | New chat, send, suggestions | POST /chats, /chats/{id}/messages | everyone; quota (402/429) handled by plan cards | gated OK | none needed |
| AI chat | Agent follow-ups / retry / copy | same | everyone | gated OK | none needed |
| Messenger list | Refresh, filters, search | GET /secure-chats | read-only | gated OK | none needed |
| Chat file preview / lightbox | Download | GET signed file | participant | gated OK | none needed |
| Call background picker | Upload / remove custom background | local storage | local only | gated OK | none needed |
| Client complaints (portal client profile) | "New complaint" (head + empty-state) + AI modal opener | POST /complaints | client (page gated); no code | after-click 403 only | 403 → canFile=false hides both buttons, the modal and the AI modal opener: components/complaints/ClientComplaints.tsx:114, 326, 365, 499, 562-574; NewComplaintForm.tsx:55-65, 134 |
| Client complaints | Open row / detail, filters, retry | GET | read-only | gated OK | none needed |
| Remote assist — client bar | Pause | POST /remote-assist/sessions/{id}/pause | session `capabilities.can_pause` | shown disabled | not rendered without it; 403 hides: components/remoteAssist/RaClient.tsx:690, 794-806 |
| Remote assist — client bar | Resume | POST …/resume | `can_resume` | shown disabled | not rendered without it; 403 hides: RaClient.tsx:691 |
| Remote assist — client bar | End session | POST …/end | `can_end` | gated OK | 403 also hides: RaClient.tsx:692 |
| Remote assist — client bar | Stop access (revoke) | POST …/revoke | client's own consent withdrawal — kept always (safety: client must always be able to cut access) | gated OK | none needed (deliberate) |
| Remote assist — client | Allow / deny consent | POST …/consent | only the addressed client receives the pending request | gated OK | none needed |
| Remote assist — client bar | Share / stop share tab | LiveKit screen share | own device | gated OK | none needed |
| Remote assist — operator console | Request session form | POST /tickets/{id}/remote-assist | meta `capabilities.request` | gated OK (shows permission note) | 403 / remote_assist_permission_required / assigned_operator_required → form replaced by the existing note: components/remoteAssist/RaConsole.tsx:331, 495 |
| Remote assist — operator console | Open page for client (page picker) | POST …/commands route.navigate | `can_command` + granted scope `route.navigate` | shown disabled (whole button list) | without them only "client is on X" status renders: RaConsole.tsx (RaPagePicker canOpen), RaPagePicker.tsx:14-16, 40 |
| Remote assist — operator console | Element actions (highlight, fill, tooltip…) + inline fill form | POST …/commands | `can_command` + granted scopes (raElementActions) | shown disabled | action column not rendered without can_command; 403 → refused.command: RaConsole.tsx:347, 411, element list |
| Remote assist — operator screen | Draw tools / colours / clear | LiveKit data channel marks | `can_command` | shown disabled | toolbar not rendered without it (tools prop): RaScreen.tsx:286; picture stays viewable |
| Remote assist — operator console | End / cancel request (2 places) | POST …/end | `can_end` | gated OK | 403 also hides: RaConsole.tsx:348, 449 |
| Remote assist — operator console | Retry command (network) | POST …/commands | transient | gated OK | none needed |

#### Marketplace (client + seller order flows, directory, purchase)

| Screen | Action | Endpoint | Permission / rule | Before | Fix |
|---|---|---|---|---|---|
| Order detail (client/seller) › Actions panel | Open chat / View chat | link `/portal/chat/{room}` | `can_start_chat` && `contact_unlocked` (mapper `canStartChat`); read-only view when `chat_read_only` | gated OK | none needed |
| Order detail › Actions panel | Audio / Video call | POST `/secure-chat/rooms/{id}/calls` (startCall) | `can_create_call` && `calls_allowed` && not closed; `allowed_call_types` | after-click 403 only | 403 → `markRefused(call)`, buttons hidden — OrderActions.tsx:66,87 |
| Order detail › Actions panel (client) | Contact advocate menu (chat + call options) | startCall | same as above; calls switched off/closed/unavailable | shown disabled | call options not rendered unless ok / pending payment / loading; 403 → local `refused` — ContactAdvocate.tsx:58-71,112; callers pass `unavailable` when refused (OrderActions.tsx:189, MarketOrders.tsx:539) |
| Order detail › Actions panel (seller) | Request extra payment (supplemental) | POST `/marketplace/me/orders/{id}/additional-payment-request` | seller view, paid/in_progress, not paused, has service/package (no backend flag) | after-click 403 only | 403 or `additional_payment_not_allowed` → `markRefused(supplemental)`; entry + submit hidden — OrderActions.tsx:67, SupplementalDialog.tsx:105,197; backend gap Q1 |
| Order detail › Actions panel (seller) | Complete order | POST complete_url | `can_complete` + `complete_url` | gated OK | 403 → `markRefused(complete)`; entry + confirm hidden — OrderActions.tsx:67, CompleteOrderDialog.tsx:161,293 |
| Order detail › Actions panel | Cancel order | POST cancel_url | `can_cancel` + `cancel_url` | after-click 403 only | 403 → `markRefused(cancel)`; button + dialog confirm hidden, dialog keeps reason — OrderActions.tsx:68,112,163 |
| Order detail › Actions panel | (panel itself) | — | — | gated OK | panel returns null when no action left; a dialog that just got refused stays up to show why — OrderActions.tsx:70-73,182 |
| Order detail › Start work (seller) | Start work + confirm | POST start_url | `can_start` + `start_url`, phase paid | after-click 403 only | 403 → dialog closes, one toast, `markRefused(start)`, panel gone — StartWork.tsx:55-56,105-111 |
| Order detail › Negotiation (client) | Propose price / Propose again | POST negotiations_url | `can_negotiate` (+ `negotiation_available`) | gated OK | 403 → local `refused`: propose/accept/reject/counter all hidden, message kept — NegotiationPanel.tsx:129-135 |
| Order detail › Negotiation (client) | Accept / Reject counter-offer | POST `/marketplace/negotiations/{id}/respond` | negotiation `available_actions` / current proposer turn | gated OK | empty actions row not rendered; 403 → hidden — NegotiationPanel.tsx (client countered block) |
| Order detail › Negotiation (seller) | Accept / Counter / Reject | POST respond | `available_actions` / turn | gated OK | empty row not rendered; 403 → hidden — NegotiationPanel.tsx (seller proposed block) |
| Order detail › Checklist (seller) | Act / Edit item, attach file/image, save | PATCH checklist item; upload evidence | seller view && phase in_progress | after-click 403 only | 403 → toast + `markRefused(checklist)`: edit buttons + editor gone, list read-only — OrderChecklist.tsx:182,191,433,684 |
| Order detail › Checklist | Attach button | uploadChecklistEvidence | file count limit | gated OK | none needed |
| Order detail › Problem / cancellation review (seller) | Report a problem + submit | POST cancellation_review_url | `can_request_cancellation` + url (fallback seller paid/in_progress) | after-click 403 only | 403 → dialog closes, toast, `markRefused(cancellationReview)` — CancellationRequest.tsx:70,118-124 |
| Order detail › Problem review | Open group chat | link | group room id present | gated OK | none needed |
| Order detail › Warranty (client) | Request warranty + submit | POST warranty url | `warranty.url` present + remedies; client view; not pending/cancelled | after-click 403 only | 403 → dialog closes, toast, `markRefused(warranty)` — WarrantyPanel.tsx:60,104-110 |
| Order detail › Resolution (client) | Choose reassign / refund + confirm | POST resolution choose | `resolution.can_choose` && offer && not chosen | after-click 403 only | 403 → dialog closes, toast, `markRefused(resolution)` — ResolutionPanel.tsx:173,248-254 |
| Order detail › Second opinion promo (client) | Open group offer / dismiss | GET promotion; track | `promotion.visible` (backend) | gated OK | none needed |
| Order detail › Group opinion dialog | Get quote / Send request | POST quote / POST create | backend eligibility (402 `previous_lexgo_*_required` → blocked) | shown disabled | quote/submit not rendered when blocked; 403 treated like "unavailable": dialog + card leave, one toast — GroupPromotion.tsx:183,228,315,324 |
| Order detail › Second opinion list | View seller | link | — | gated OK | none needed |
| Order detail › Documents | Open document / editor | link per `docRouteOf` | view (client chat / seller editor) | gated OK | none needed |
| Order detail › Cancelled (client) | Find another lawyer | link `/portal/client/lawyers` | client view only | gated OK | none needed |
| Order detail › Retain (client) | Warranty info link | link `/portal/client/warranty` | client view only | gated OK | none needed |
| Order detail › Route card (client) | Route to lawyer | link | `navigation.available` + client | gated OK | none needed |
| Order detail › Seller assignment (seller) | Accept / Decline request | components/portal/OrderActions.tsx | assignment window | gated OK | listed for PORTAL owner |
| Order detail › Header | Copy id / Refresh / Back | — | none | gated OK | none needed |
| My orders list (client/seller) | Open chat | link | `canStartChat` | gated OK | none needed |
| My orders list | Contact menu / Audio / Video call | startCall | `canCreateCall` && `callsAllowed` && not closed | after-click 403 only | 403 → `markRefused(call)` — MarketOrders.tsx:428,546 |
| My orders list (seller) | Extra payment | additional-payment-request | as detail | after-click 403 only | `!refusedFor(supplemental)` — MarketOrders.tsx:562 |
| My orders list (seller) | Complete | complete_url | `canComplete`, active | after-click 403 only | `!refusedFor(complete)` — MarketOrders.tsx:568 |
| My orders list (client) | Cancel + confirm dialog | cancel_url | `canCancel`, pending | after-click 403 only | 403 → `markRefused(cancel)`; card button + dialog confirm hidden — MarketOrders.tsx:335-343,574,702 |
| My orders list (seller) › New request card | Accept / Decline | components/portal/OrderActions.tsx | assignment | gated OK | listed for PORTAL owner |
| My orders list | Detail link / Refresh / tabs / search | — | none | gated OK | none needed |
| My orders list (empty, client) | Browse lawyers | link | client view only | gated OK | none needed |
| Order card › Complaint (client) | File complaint + send | POST complaint | `complaint.available` (can_complain) | after-click 403 only | 403 → `markRefused(complaint)`: form/button gone, reason kept — OrderExtras.tsx:206,231 |
| Order card › Rating (client) | Stars + submit | POST rating | `rating.can_rate` + window | after-click 403 only | 403 → `markRefused(rating)`: stars/submit gone, reason kept — OrderExtras.tsx:314,335 |
| Order card › Result files | Download | GET secure file | file has url | gated OK | none needed |
| Seller profile (public + portal) | Buy (service row) | opens PurchaseDialog | not own profile, client (not seller/staff), seller verified & available | shown disabled | not rendered when blocked; block note explains — SellerParts.tsx (`canBuy`), SellerProfile.tsx:270 |
| Seller profile › buy box | Buy / Log in to buy | opens PurchaseDialog / login | same | shown disabled | not rendered when blocked (price + note stay) — SellerProfile.tsx:~372 |
| Seller profile › buy box | Open my order (bought) | link | own open order | gated OK | none needed |
| Seller profile | ?buy= auto-open, AI modal | — | same `blocked` check | gated OK | none needed |
| Purchase dialog | Submit purchase / match / package purchase | POST purchase / match / package purchase_url | backend | after-click 403 only | 403 → local `refused`: submit + provider fallback hidden, reason shown — PurchaseDialog.tsx:199,221-223 |
| Purchase dialog | Choose myself / Telegram fallback | — | provider down | gated OK | hidden when refused |
| Purchase dialog › Intake | Add file / Record voice | POST workspace upload | backend | after-click 403 only | 403 → hook `refused`, attach bar hidden — IntakeAttachments.tsx:87,127 (hook now also returns `refused`) |
| Package sellers dialog | Pick seller | — (choose) | `eligibility.eligible` | shown disabled | not rendered for ineligible seller; reasons stay — PackageSellersDialog.tsx |
| Private chat button | Open paid private chat | GET/POST private chat, checkout | backend | after-click 403 only | 403 → button hidden, reason kept — PrivateChatButton.tsx:67 (component is not imported anywhere today) |
| Directory (public/portal) | Ask support (empty AI search) | link `/portal/client/support` | client page | shown ungated | shown only to guests (→ login) and clients; empty acts row not rendered — MarketDirectory.tsx |
| Directory | Search / filters / reset / load more / seller cards | GET list | public | gated OK | none needed |
| Map / nearby | Buy service (map card) | link `?buy=` | `service_action.can_purchase` | gated OK | none needed |
| Map / nearby | Route build / follow / open in navigator / pick on map | POST navigation | signed in (login CTA otherwise) | gated OK | none needed |
| Hero / promo surfaces / seller card | Open seller / promo CTA / slides | promo click tracking | public | gated OK | none needed |
| Public achievements | Load more | GET | public | gated OK | none needed |
| MarketWatcher toasts | Go to order / notifications | link `/portal/{role}/…` | session role | gated OK | none needed |
| Price options / supplemental options | Retry options / quote | GET | — | gated OK | none needed |

#### Counts

| Section | Audited | Hidden/fixed by SHARED | Already OK | Backend gaps |
|---|---|---|---|---|
| Copilot/guide/notifications/UI/public/routes | 32 | 14 | 17 | 1 |
| Chat/calls/complaints/remote assist | 41 | 21 | 20 | 4 |
| Marketplace | 54 (2 live in PORTAL files) | 29 | 23 | 3 |
| **Total** | **127** | **64** | **60** | **8** |

#### Files changed

- components/chat/CallRoom.tsx, SecureChat.tsx, MeetingLauncher.tsx, ContentRevealBar.tsx
- components/complaints/ClientComplaints.tsx, NewComplaintForm.tsx
- components/remoteAssist/RaClient.tsx, RaConsole.tsx, RaPagePicker.tsx, RaScreen.tsx
- components/copilot/CopilotAnswer.tsx, CopilotPanel.tsx
- components/guide/GuideHost.tsx, AiActionConfirm.tsx
- components/ui/Menu.tsx (empty menu renders nothing)
- components/sections/LawyersSection.tsx
- components/marketplace/order/refused.ts (new), order/OrderActions.tsx, StartWork.tsx, NegotiationPanel.tsx, OrderChecklist.tsx, CancellationRequest.tsx, WarrantyPanel.tsx, ResolutionPanel.tsx, GroupPromotion.tsx, ContactAdvocate.tsx
- components/marketplace/MarketOrders.tsx, CompleteOrderDialog.tsx, SupplementalDialog.tsx, OrderExtras.tsx, PurchaseDialog.tsx, IntakeAttachments.tsx, PrivateChatButton.tsx, SellerParts.tsx, SellerProfile.tsx, PackageSellersDialog.tsx, MarketDirectory.tsx
- lib/guide/access.ts (new), lib/guide/pages/index.ts
- lib/notifications.ts (notifLink: hides role-hidden pages; new optional 7th arg `allows`)
- app/[locale]/tasks/page.tsx

No service mappers changed. No new i18n keys.

#### For other areas (not edited by SHARED)

- PORTAL: components/portal/NotificationsPanel.tsx:399, components/portal/desk/apps/NotificationsApp.tsx:90 — pass `canDo` (useCan()) as the 7th arg of `notifLink` so staff links to admin pages without the permission are dropped.
- HRM: components/internal/ShellParts.tsx:201 — same `notifLink(..., canDo)`.
- PORTAL: components/portal/AiSystemAssistant.tsx — uses pageFor/registryTargets/crossPageTargets; now permission-filtered centrally, nothing to change.
- PORTAL: components/portal/OrderActions.tsx (seller accept/decline) 403 handling; desk/apps/client/Purchase.tsx can read `useIntakeAttachments(...).refused`; desk/apps/orders/dialogs.tsx can use `markRefused/useRefused` from components/marketplace/order/refused.ts.
- Command palettes to verify in their owners' files: components/admin/AdminShell.tsx (Ctrl+K = visibleNav, pages only — OK), components/portal/desk/Palette.tsx + DesktopShell.tsx (PORTAL), components/internal/CommandPalette.tsx + nav.ts (HRM), components/ccx/CcxShell.tsx + ccx/crm/sections/CrmLeadsX.tsx (CALLCENTER), components/crm/CrmLeads.tsx + bits.tsx (CRM), app/[locale]/admin/pipeline/LegacyPipeline.tsx (ADMIN).
