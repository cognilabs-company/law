# LexGo — frontend questions for backend: permissions (2026-11-08)

From the permission-actions audit (`docs/LEXGO_PERMISSION_ACTIONS_AUDIT_2026_11_08.md`). Owner law: an action the user may not do is not shown. Where the backend gives no way to know ahead of time, the frontend today shows the action and removes it after the first 403 (and re-reads `/auth/me`). Each row names the endpoint and the exact field we need so the action can be hidden up front.

Question ids are per area (e.g. `CRM Q1`).

## Admin (superadmin / admin / limited staff pages)

| endpoint | what we need (exact field) | why |
|---|---|---|
| QA1 POST /admin/demo-data/seed | the permission code it checks (or a `can_seed_demo` flag on /auth/me) | full admins see the "Seed demo data" button on staging; which admins may run it is not documented, so today it is only hidden after a 403 |
| QA2 POST /retention/queue | the permission code it checks (leads.manage? a retention.* code?) | the Retention page needs leads.manage; if the queue POST checks something else the "Win back" button is offered and then refused |
| QA3 POST /call-center/quality-complaints/{id}/resolve | the permission code, or `allowed_actions` / `can_resolve` on each complaint in GET /call-center/quality-complaints | anyone who can read the queue sees the ruling form; if ruling needs more than reading, we only learn it from the 403 |
| QA4 GET /call-center/urgent-advokat/requests and /{id} | `allowed_actions` per record for the current user (claim, meeting, transfer, status, cancel, complete, assign_group) | lifecycle.next_statuses says where the record can go, not whether THIS operator (claimer vs other operator vs admin) may do it; today a refusal is only known from a 403 |
| QB1 POST /admin/services/{service_id}/document-template | the permission code it checks (services.manage, templates.manage, or both) — or `can_attach_document_template: bool` on GET /admin/services rows | the upload creates a document template on a services.manage page; we show it with services.manage and only hide it after a 403 |
| QB2 GET /studio/constructors/MP09/records → `actions.pause` / `actions.resume` | confirm these URLs are present only when the caller may run them (ads.manage for advertising, subscriptions.manage for subscription promotions), or add `allowed_actions: ["pause","resume"]` per record | the page opens on either code; we mirror target→code client-side, which is our inference, not a contract |
| QB3 POST /admin/marketplace/advertising-activation, /advertising-pause | the permission code they check, or `can_change_mode: bool` in GET /admin/marketplace/advertising-readiness | the switch sits on the ads page (ads.manage) but the endpoint lives under /admin/marketplace (orders.manage area); today it is only hidden after a 403 |
| QC1 GET /remote-assistance/meta | `capabilities.view_audit: boolean` (true for holders of remote_assist.view_audit) | The admin nav lets remote_assist.view_audit holders into /admin/remote-assistance, but the page only knows `supervise` / `emergency_revoke`, so an audit-only reviewer is shown "no access" instead of the read-only session list + audit timeline. |
| QC2 PUT /admin/platform/policies/{section} | Confirm the required permission code in a contract (frontend gates on `users.manage`, taken from a code comment, not a doc) | The Policies page has no NAV permission (full admins); its Edit / unverified-mode / marketplace-pricing controls are now hidden without users.manage. If admins lacking users.manage may save, the code must be named. |
| QD1 GET /approvals (+ POST /approvals/{id}/admin-approve, /manager-approve) | per row `allowed_actions: ["admin_approve","manager_approve"]` (or `can_admin_approve` / `can_manager_approve`), or the permission/role code each stamp requires | Which stamp this account may give is unknown ahead of time; today a wrong stamp is only learned from the 403 |
| QD2 POST /admin/marketplace/ratings/recalculate | the permission code it checks | Recalculate button sits on the Reviews page (lawyers.verify); no contract names the code, so it can only disappear after a 403 |
| QD3 POST /admin/users/assign-role | the permission code it checks (roles.manage, users.manage, or both) | Assign panel is now shown only with users.manage (needed for the user picker); the write's own code is unconfirmed |
| QD4 POST /admin/legal/consents, PATCH /admin/legal/consents/{id} | the permission code (is it users.manage like the GET?) | New document / New version / Publish rely on the page's users.manage gate; only a 403 removes them today |
| QD5 POST/PATCH /admin/ai/support/reglaments, POST …/upload | a permission code (e.g. in /auth/me) or `capabilities: {create, update, upload}` on GET /admin/ai/support/reglaments | Page is full-admin only with no code; secondary admins can only learn a refusal after the click |
| QD6 GET /admin/seller-requests items | `four_steps_complete` (or `can_accept`) per item | Accept is offered on every pending row; the four-step check only runs after the click (extra detail fetch) |

## Call center, navbatchi yurist, support

| # | endpoint | what we need (exact field) | why |
|---|---|---|---|
| A1 | PATCH /call-center/leads/{id}/move (CRM in-column reorder) | which `allowed_actions` entry on the CRM lead grants it (e.g. `reorder`), or confirm `change_status` covers it | the board offers up/down and drag-within-column on `change_status`/`move`; no contract names the code |
| A2 | POST /crm/calls/{id}/transcript, POST /crm/calls/{id}/complete | `operator_user_id` (or `can_write` / `allowed_actions`) on each call in GET /crm/leads/{id}/calls | only the call's operator should get "add line"/"end call"; today we can only gate on crm.calls.start |
| A3 | POST /crm/ai/runs/{id}/apply | confirm the lead action that allows applying (`edit`? `run_ai`?) or `can_apply` on the run | apply is offered to anyone with `run_ai`; a lead they may not edit may answer 403 |
| D1 | GET /call-center/queue (order rows) / POST /matching/orders/{id}/assign-next | per-row `allowed_actions: ["assign_next"]`, or confirm the permission is `orders.manage` only (not callcenter.access) | Assign-next is now shown only with orders.manage (the code comment's code); if call-center operators without it are allowed, they lose the button. |
| D2 | GET /call-center/marketplace/payouts, /payout-recoveries | per-row `allowed_actions` (`mark_paid` / `resolve`) or the permission code that guards mark-paid/resolve | Today only the status decides; a reader without the right still sees "Mark paid" until a 403. |
| D3 | GET /call-center/marketplace/complaints (row) | `allowed_actions` to include `upload_evidence` (or `can_upload_evidence`) | The evidence upload control can only be removed after a 403. |
| D4 | GET /call-center/marketplace/cancellation-reviews (row/detail) | `allowed_actions` with `open_chat` / `close_chat` (or `discussion.can_close`) | Start/close discussion can only be removed after a 403. |

## CRM / ROP / sales

| # | Endpoint | What we need (exact field) | Why |
|---|---|---|---|
| Q1 | `GET /crm/leads/{lead_id}/calls` (items) and `POST /crm/leads/{lead_id}/calls` | `operator_user_id` of the call (or `allowed_actions: ["append_transcript","complete"]` per call) | The active-call panel (transcript input, "end call" form) is now shown only with `crm.calls.start`, but a ROP/second operator who also holds it still sees the controls for a call another operator is running. Only the call's own operator should get them; today the call object does not say whose call it is. |
| Q2 | `POST /crm/ai/runs/{run_id}/apply` | Name the permission / lead action it requires — ideally add `"apply_ai"` to the lead's `allowed_actions` | No contract names it. The frontend offers "apply" only when the lead's `allowed_actions` has `"edit"` (it writes lead fields with `expected_lock_version`). Confirm or give the exact action. |
| Q3 | `POST /crm/calls/{call_id}/transcript` with `request_ai_assist=true` | Confirm `crm.ai.use` is required for `request_ai_assist` | The live-assist checkbox is shown only with `crm.calls.start` + `crm.ai.use`; without `crm.ai.use` the frontend always sends `request_ai_assist=false`. |
| Q4 | `POST /crm/exports` | Either confirm the scope rule (`customers` → `crm.customers.view`; `leads`, `activities` → `crm.leads.view`) or return `export_scopes: [...]` in `GET /crm/meta` | `crm_export_scope_denied` exists but no contract says which scope needs what. The form now offers only the scopes matching the viewer's view permissions. |
| Q5 | `POST /crm/leads/{lead_id}/reopen` | Add `"reopen"` to the lead's `allowed_actions` (contract action list has no `reopen`) | The "Reopen" button shows on `allowed_actions` `"reopen"` or `"edit"`; a dedicated action removes the guess. |
| Q6 | `PATCH /call-center/leads/{lead_id}/move` (same-column reorder on the board) | Confirm which lead action allows it: `"move"` or `"change_status"` (add `"move"` to `allowed_actions` if it is separate) | The board offers drag / up / down when the lead has `"change_status"` or `"move"`. |
| Q7 | `PUT /crm/kanban/columns` | Confirm the permission: CRM handoff 2026-10-29 says `crm.automation.manage`; ROP final handoff only says "ROP can configure" | Column/stage settings (board cog, "Manage columns") are gated by `crm.automation.manage`. If a dedicated code exists (e.g. `crm.kanban.manage`) we need its name. |

## Studio (constructors, approvals, settings)

Frontend now hides every Studio action by role/flag and removes any action the backend refuses with 403 (and re-reads
GET /studio/constructors user_roles). These are the places where the frontend still cannot know ahead of time:

| # | Endpoint | What we need (exact field) | Why |
|---|---|---|---|
| Q1 | GET /studio/objects/{id} | Always send `can_edit`, `can_submit`, `can_withdraw`, `can_restore`, `can_archive`, `can_publish`, `can_rollback`, `can_clone` (booleans, for the signed-in user) | Today only some objects carry `can_edit`/`can_submit` (the "lifecycle contract"); without them the editor falls back to Studio role (studio_editor/publisher) and cannot see object-level rules (author-only withdraw, constructor-scoped grants via `constructor_codes`), so the first click can still 403. |
| Q2 | GET /studio/objects (list) and GET /studio/constructors/{code}/records | Per row `allowed_actions: ["edit","clone","archive","reorder",…]` (or the matching `*_url` only when allowed) | Row menus use Studio role + `actions.*` URLs; if the URL is present for users who may not use it (constructor-scoped grant), Archive/Clone/Reorder 403 after click. Reorder has no per-row/per-constructor flag at all. |
| Q3 | GET /admin/studio/objects/{id}/versions/export.xlsx | Which role may export: contract names none. Editor shows it to `studio_reviewer`+, review drawer to `studio_publisher`/admin only. Please state the role, or send `can_export_versions` on the object | Two screens disagree; we kept both as they were (no invented rule) and remove the button on 403. |
| Q4 | GET /studio/objects/{id}/comments and GET /admin/studio/approvals | `can_comment` on the object (and keep `can_edit`/`can_delete` on every comment) | Comment composer is shown to any Studio role on a non-archived object; if commenting is narrower, it 403s on send (now removed after the first 403). |
| Q5 | POST /studio/ai/agent-jobs | The role/permission that may start an AI agent job (contract has none), or `can_start` on GET /studio/ai/agent-jobs | Page is shown to `studio_editor`+ (need=edit) by our assumption; on 403 the form is replaced by a note. |
| Q6 | POST /admin/studio/access, POST /admin/studio/constructors/sync, GET /admin/studio/export.xlsx | Confirm `studio_admin` (not only admin/superadmin) may call these; or expose `permissions` for them in /auth/me | Settings page opens for studio_admin too (need=admin = studio_admin/admin/superadmin); if these are admin-only, studio_admin sees buttons that 403 once (now removed after the first 403). |

## Portal: client, yurist, advokat, org owner, seller

| # | Endpoint | What we need (exact field) | Why |
|---|---|---|---|
| Q1 | GET /contracts/{id} | `can_sign` (boolean) or `signer_user_id` | The client document screens (DocumentRequestPanel, DeskRequest) show "Sign the contract" to whoever opens the request. A non-signer only finds out from the 403 after pressing it. |
| Q2 | GET /lawyers/me/services (and /organizations/{org}/members/{m}/services) | top-level `can_manage: bool` (or `allowed_actions: ["create","update","status","delete","promote"]`) per list and per item | today a seller/owner learns a change is forbidden only from a 403 after the click; with the flag the add/status/edit/remove/promote actions are never rendered |
| Q3 | GET /lawyers/me/packages | per item `can_enable: bool` (beyond eligibility) | 403 on enable/status is only known after the click |
| Q4 | GET /marketplace/promotions/status (promotion status) | `can_request: bool` | promotion checkout 403 (e.g. pending account) only shows after the click |
| Q5 | GET /lawyers/me (or cabinet) | `can_request_verification: bool` (false when already verified or a request is open) | the "Request verification" button is always shown, even when a request is open or the profile is verified |
| Q6 | GET /cases/me (and case detail) | `can_edit: boolean` (or `allowed_actions: ["update_status","update_stage"]`) per case | Status/stage edit is object-level (assigned seller, closed/archived locks); today the UI only learns after a 403 on PATCH /cases/{id} |
| Q7 | GET /tasks/me | `can_edit` / `can_delete` per task (or a top-level `permissions` for the seller task list) | Own-task board shows add/move/delete; only a 403 tells us it is not allowed |
| Q8 | GET /organizations | `my_role` (owner/member) and `can_add_members: boolean` per organization; `can_create_organization` on /auth/me or /lawyers/me/cabinet | Org list filters by owner_user_id; orgs with no owner_user_id are treated as own and add-member/create are only known after a 403 |
| Q9 | PATCH /orders/{id}/status (order detail / GET /orders/{id}/status-history) | `allowed_next_statuses: string[]` for the calling user | Next steps are mirrored from lib/orderStatus.ts by side + status; whether this account is a party allowed to move this order is only known from a 403 after the click (the buttons now leave after it) |
| Q10 | GET /secure-chat/rooms/{room} (room payload) | `can_send: bool`, `can_call: bool` for the calling user | The composer and call buttons are hidden for finished rooms and after a 403 on send/upload; a muted/removed member still sees them until the first refused message |
| Q11 | GET /advocate/practice (licence) and GET /achievements/me | `can_submit: bool` / `can_create: bool` | Upload/resubmit and Add are hidden only after a 403 on submit; the list GET does not say whether this account may submit |
| Q12 | GET /lawyers/me/cabinet `available_actions` | document `calls` (already returned) and add `document_requests` / `editor` | `calls` is parsed but no contract says which screens it governs, so call buttons use canMakeCalls + per-order `can_create_call`; a cabinet flag for document requests would let the inbox hide claim/editor before the per-record flags load |

## Internal HRM, team tasks, live office

| # | Endpoint | What we need (exact field) | Why |
|---|---|---|---|
| Q1 | GET /internal/live-office/catalog (or /auth/me) | the permission code(s) that guard rooms, memberships, access-grants, activity-registry, corrections review and stopping another person's busy (e.g. `capabilities: {manage_rooms, manage_memberships, manage_grants, manage_registry, review_corrections, stop_others_busy}`) | no contract names a live-office code; the frontend uses internal_org.manage OR internal_hr.manage (+admin/superadmin), so a user with only one of them may still meet a 403 |
| Q2 | GET /internal/live-office/analytics | which permission is needed / whether a plain employee gets own-scope data (or `capabilities.analytics` in catalog) | the Analytics tab is shown to everyone and only removed after a 403 |
| Q3 | GET /internal/live-office/corrections | `can_review` per row (or a capability flag) | the review tab is shown to canManage and hidden only after a 403 |
| Q4 | GET /internal/live-office/board people[] | `can_stop_busy` per person | stopping another person's busy is shown to canManage without knowing the backend scope (own unit vs all) |
| Q5 | GET /internal/hrm/catalog (record_types[]) and GET /internal/hrm/{domain}/records items | `can_create` per record type; `can_edit` per record | No contract names who may create/edit catalog records per domain/type. The frontend now uses the permission the HRM menu puts on each module/type (nav.ts); modules open to everyone (leave, travel, learning, policies, documents, skills, hamkor) still offer New/Edit to all. Per-type `can_create` and per-record `can_edit` would make this exact. |
| Q6 | GET /internal/hrm/{domain}/records/{id} | confirm `allowed_transitions` is already filtered by the caller's permissions (or add `allowed_actions` per user) | Moves are offered from `allowed_transitions`; if it is the workflow's list, not the caller's, a user can still be refused after clicking (e.g. approve on someone else's request). |
| Q7 | GET /internal/execution/tasks (+ /internal/me/tasks) | `can_comment`, `can_change_status`, `next_statuses` per task | Who may comment or move a task outside internal_execution.manage is not stated; My tasks uses a frontend next-status map. |
| Q8 | GET /internal/payroll/runs | `allowed_actions` always present (also when empty) | When `allowed_actions` is missing the drawer falls back to a frontend status map; an explicit list per user would remove the guess. |
| Q9 | GET /internal/employees/directory | `user_id` on each person (or a `can_message: bool`) | Messages can only be sent to a login; today only accounts with internal_hr.manage get logins (from GET /internal/employees), so every other employee has no recipient list and the compose form is hidden for them. |
| Q10 | GET /internal/hrm/catalog | per domain `permissions: { read: bool, write: bool }` (or the required code) for the current account | Employee card record tabs and their "Open module" links read /internal/hrm/{domain}/records; whether the account may read a domain is only known after a 403, so the tab is removed on 403 instead of up front. |
| Q11 | PATCH /internal/product-feedback/{id} | the permission code that grants feedback triage (or `can_triage` on GET /internal/product-feedback items) | No contract names who may set status/assignee/resolution; the frontend shows the triage form to internal_hr.manage / internal_org.manage holders and removes it after a 403. |

## Shared: chat & calls, copilot, guide/AI navigation, notifications, marketplace, public pages

| # | endpoint | what we need (exact field) | why |
|---|---|---|---|
| Q1 | POST /payments/checkout (target_type=private_chat) + GET /marketplace sellers | `can_buy_private_chat` (or a contract naming the buyer roles) | public lawyers section offers paid private chat to any signed-in account; no contract says lawyers/staff may not buy |
| Q2 | WS /secure-chats/{room}/ws send → `{event:"error",status_code:403}` | a `code` on the frame (e.g. `chat_send_forbidden` vs `platform_contact_blocked`) | can't tell "may not write here" (hide composer) from a content-filter refusal (keep composer) |
| Q3 | GET /secure-chats (room row) | `can_delete`, `can_set_auto_delete` per room | delete/auto-delete are hidden only after a 403; no way to know ahead |
| Q4 | GET /secure-chats/{room}/content-reveal/status | `can_request`, `can_approve` | request/approve reveal rights aren't in the session or the status payload |
| Q5 | GET /remote-assist sessions (pending) | `capabilities.can_consent`/`can_revoke` documented in a contract | mapper reads them but no contract says what false means; client consent/revoke kept always visible |
| Q6 | GET `/marketplace/me/orders` and `/marketplace/me/orders/{id}` (seller view) | `can_request_additional_payment: boolean` (or `additional_payment_url`) | Q1: the "Request extra payment" button is shown on every active seller order; only the POST tells whether this seller/order may ask. |
| Q7 | GET `/marketplace/me/orders/{id}` (seller view) | `can_update_checklist: boolean` | Q2: checklist edit is inferred from view + phase `in_progress`; a reassigned/co-seller or locked step can only be learned from the 403. |
| Q8 | GET `/marketplace/sellers/{id}` (+ services) | `can_purchase: boolean` per service (as the map's `service_action.can_purchase`) with a reason code | Q3: the profile decides "may buy" from role/own/verified/available on the client; the backend's own rule would replace it. |
