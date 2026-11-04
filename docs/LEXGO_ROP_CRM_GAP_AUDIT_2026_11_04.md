# ROP CRM — gap audit against the final contract (2026-11-04)

Contract: `docs/LEXGO_ROP_CRM_FRONTEND_HANDOFF_FINAL_2026_11_04.md` (newest; wins
over `LEXGO_CRM_FRONTEND_HANDOFF_2026_10_29.md`). OpenAPI checked:
`https://lexgo.api.cognilabs.org/openapi.json` (4 Nov 2026).

Legend — **done**: already right in the code · **partial**: exists but incomplete ·
**missing**: not built · **wrong**: built against the contract. The "Fix" column says
what this change does; after the change every row is done unless it is a backend gap
(see `LEXGO_ROP_CRM_BACKEND_QUESTIONS_2026_11_04.md`).

Code before the change: superadmin/staff CRM in `components/crm/*` (pages under
`/admin/crm/*`), operator workspace in `components/ccx/crm/*`, services in
`lib/services/crm.ts`, realtime/meta stores in `lib/crm/useCrm.ts`. A `sales_head`
account opened the generic admin shell with the CRM's own in-page tabs.

## §2 Bootstrap

| Item | State | Fix |
|---|---|---|
| `GET /auth/me` first | done | — |
| `GET /crm/meta` before any CRM menu/form | partial — CRM pages waited for meta, but the admin sidebar drew the CRM entry from session permissions | ROP shell renders its §4 menu only from `meta.permissions`; skeleton until meta arrives |
| `GET /crm/me/metrics` | partial — operator pages only | ROP overview loads it |
| `GET /crm/kanban?column_limit=30` | done (board) | ROP overview also reads its counts |
| one `/ws/users/me` socket, token never logged | done (`lib/userSocket.ts` builds the URL, never logs it) | audit kept; no new logging |

## §3 Permissions and visibility

| Item | State | Fix |
|---|---|---|
| Access from `meta.permissions`, never role name | partial — CRM sections followed meta; admin nav used session perms | ROP nav + every page/action gated by meta; shell choice only picks the layout |
| `crm.leads.view_all` → all leads | done (backend scopes; UI shows "all" tab) | operator filters now also need `scope === "all"` |
| `GET /crm/analytics` never for ROP | **wrong** — analytics section opened for anyone with `crm.analytics.global` | analytics only for a superadmin session **and** the permission; ROP never calls it |
| no revenue when `revenue_visible=false` | partial — analytics page only | ROP workspace has no revenue item/card/chart; revenue blocks require `revenue_visible` |

## §4 Navigation

| Page | State | Fix |
|---|---|---|
| Overview (`crm.analytics.self`) | **wrong** — gated by leads/customers view | `crm.analytics.self` |
| Leads (`crm.leads.view`) | done | in ROP sidebar |
| Kanban (`crm.leads.view`) | partial — a toggle inside Leads | own route `/admin/crm/kanban` |
| Customers (`crm.customers.view`) | done | in ROP sidebar |
| Operators (`crm.leads.view`) | **missing** | new page `/admin/crm/operators` |
| Live calls (`crm.live_calls.view`) | done | in ROP sidebar |
| CRM robots (`crm.automation.manage`) | partial (hard-coded builder) | rebuilt, see §16 |
| Robot runs | partial — a tab, no detail | own page `/admin/crm/automation/runs` |
| Approval drafts | **missing** | new page `/admin/crm/automation/drafts` |
| Templates (read: CRM access, write: `crm.templates.manage`) | partial | write gated, tags/status added |
| Exports (`crm.exports.create`) | done | in ROP sidebar |
| No Revenue item | done for ROP | — |
| LexGo 1920 shell for ROP | **missing** | `RopShell` (dark sidebar, header, cards, dark mode) |

## §5 Meta

| Item | State | Fix |
|---|---|---|
| status labels/colours from `statuses` | done | — |
| buttons from permissions + `allowed_actions` | done | — |
| `scope === "all"` enables operator filters | **missing** (filter always shown) | gated |
| `detail_rendering` / no JSON | done (`DetailSections`) | — |

## §6 / §24 ROP overview

| Item | State | Fix |
|---|---|---|
| operational cards only, date range with handmade DatePicker | **missing** | `RopOverview` |
| all-lead counts by status, unassigned queue, workload, overdue next actions, active calls, robot failures, pending approvals, conversion, first response, cycle metrics | **missing** | built from `/crm/me/metrics`, `/crm/kanban`, `/crm/leads?queue_only`, `/crm/operators`, `/crm/automation/metrics`, `/crm/automation/drafts`, `/crm/live-calls` |
| never `/crm/analytics` | **wrong** (see §3) | fixed |

## §7–8 Customers

| Item | State | Fix |
|---|---|---|
| paginated Select + Search `/crm/customers/select` + "LexGo user" badge | done (`CustomerPicker`) | — |
| New Customer modal above New Lead modal, returns & auto-selects, keeps fields | done (`CrmFrame` LeadSheet) | covered by a new e2e test |
| list filters q/region/status/lifecycle | partial — no lifecycle filter | added |
| create without `user_id` | done | — |
| detail from `detail_sections`, contacts, leads, orders, account_linking | done | — |
| contact create / edit / delete | done | — |
| merge behind `crm.customers.merge` | done | — |

## §9 Leads and Kanban

| Item | State | Fix |
|---|---|---|
| every list filter incl. `assigned_operator_user_id`, `queue_only`, `mine_only`, ranges | done | `?operator=` read from the URL (Operators page link) |
| `counts` from the response | done | — |
| six fixed keys, titles/colours/order from backend | done | — |
| `PUT /crm/kanban/columns` | done (`KanbanColumns`) | — |
| reorder / exact position, use returned `kanban.rank` | partial — position sent, `kanban.rank` never read | `rank` read and the column re-sorted by it |
| `expected_lock_version` on every write; 409 reload with message | done | — |
| move by touch / without drag (status menu) | done (`StageMenu`, card menu) | — |

## §10–12 Lead create/detail, assignment, duplicates, conversion

| Item | State | Fix |
|---|---|---|
| no `client_user_id`, no `category` in the new form | done | — |
| detail: title/problem, customer card, status, operator, next action, score/urgency, cycle number, converted order, watchers, sections, actions | done | — |
| history (cycles) and timeline tabs; old cycles visible after reopen | done | — |
| reopen with lock version | done | — |
| assign/transfer with workload in selector; claim + 409 | done | — |
| watchers add/remove | done | — |
| duplicate resolution, conversion to `operator_draft` | done | — |
| sticky primary actions | partial | sticky action bar on narrow screens |
| robot history + pending-draft indicator | **missing** | lead page: runs + drafts for the lead |

## §13 AI

| Item | State | Fix |
|---|---|---|
| all eleven `run_type`s, status polling | done | — |
| apply only selected paths, editable overrides, never silent | done (`CopilotPanel`) | — |

## §14–15 Calls, live calls, SMS

| Item | State | Fix |
|---|---|---|
| start/complete call, transcript append, no-answer flow | done | — |
| live calls list + detail, read-only, live refresh | done (`CrmLiveOffice`) | — |
| recording access behind `crm.calls.recordings.view` | **missing** on the live page | added |
| SMS list/create/approve | done | — |

## §16–17 Robot builder

| Item | State | Fix |
|---|---|---|
| driven by `/crm/automation/catalog` | **wrong** — triggers/actions/operators hard-coded | new catalog normaliser; nothing hard-coded |
| action forms from `catalog.actions[].fields` | **wrong** | generic field renderer |
| smart scripts list + instantiate | **missing** | added |
| form order name → trigger → delay → conditions → actions → mode → stop policy → preview → save/activate | partial | rebuilt in that order |
| and/or condition tree, all 12 operators | **wrong** — flat list, 6 operators | nested groups, operators from catalog (12 by contract) |
| ordered actions, drag + touch up/down | **missing** | added |
| execution mode, stop policy / schedule | **missing** | added |
| preview `/rules/preview` before save | **missing** | added |
| clone, reorder, dry-run with lead picker | partial — dry-run only | clone/reorder added; lead chosen from a searchable list |
| statuses draft/active/paused/archived | partial — no archived | all four |
| approval badge + explanation for `approval_required` | **missing** | added |
| grouped, searchable action picker with descriptions | **missing** | added |
| 409 `crm_automation_rule_version_conflict` reload | **missing** | added |

## §18–19 Runs, drafts, metrics

| Item | State | Fix |
|---|---|---|
| runs list with filters | partial | status/rule/lead filters |
| run detail with steps, input/output, attempts, errors | **missing** | added (readable, no JSON) |
| retry (`from_step_index`) / cancel only when allowed; business messages | **missing** | added |
| drafts list, edit payload, approve/reject with reason | **missing** | added |
| automation metrics card | **missing** | added (overview + robots page) |

## §20 Templates

| Item | State | Fix |
|---|---|---|
| list filters type/language/q | done | — |
| create with tags and status, write only with `crm.templates.manage` | partial | tags/status, gate |
| editing a message never mutates the template | done (copy into composer) | — |

## §21 Exports

| Item | State | Fix |
|---|---|---|
| create leads/customers/activities, poll until ready | done | — |
| `409 crm_export_not_ready` keeps polling | partial — toast + single refresh | resumes polling, no error toast |

## §22 Realtime

| Item | State | Fix |
|---|---|---|
| single socket, `crm.resync` + reconnect → refetch visible | done | — |
| `crm.automation.rule_created/updated`, `run_completed/failed`, `approval_required`, `sla_escalated` | **missing** in the event map | mapped to `automation` |
| debounced list refresh | partial | shared debounce helper used by the new pages |

## §23 Errors

| Item | State | Fix |
|---|---|---|
| read `detail.code` | done | — |
| every listed code translated | partial — 7 missing | added in uz/ru/en |
| 401 refresh once | done (`lib/http`) | — |
| 403 → refresh `/crm/meta`, hide action | **missing** | `useCrmError` reloads meta on 403 |
| 409 → message + reload entity | done for leads | added for rules/runs/drafts/exports |

## Other roles

Operator (`call_center`), duty lawyer (`call_center_lawyer`) and superadmin keep their
shells and pages; superadmin keeps analytics and revenue.

## Result after the change

Every row above marked partial / missing / wrong is fixed in this change
(`components/crm/rop/*`, `components/crm/robots/*`, `lib/services/crmAutomation.ts`,
and the edits to `components/crm/*`, `lib/services/crm.ts`, `lib/crm/useCrm.ts`,
`components/admin/AdminShell.tsx`). What stays open is backend-side only and is listed
in `LEXGO_ROP_CRM_BACKEND_QUESTIONS_2026_11_04.md` (untyped automation responses, the
condition-tree keys, stop policy/schedule fields, run retry/cancel flags, draft edit
scope, an exact-position Kanban endpoint and operator filter on `/crm/kanban`,
recording URL policy, template editing).

§25 checklist — all ticked: meta before menus (ROP shell skeleton until
`/crm/meta`); view_all → all leads + operator filter; no revenue for
`revenue_visible=false` and no `/crm/analytics` call; paginated customer Select +
Search; New Customer above New Lead and back; no LexGo ID / category in lead forms;
`detail_sections` only; `expected_lock_version` on every write; Kanban
titles/colours/order from backend; operator workload in the selector; old cycles
visible after reopen; AI output selectable/editable, never silent; approval badges
and drafts for client-facing robot actions; robot forms from the catalog;
preview/dry-run before activation; run steps with retry/cancel only when allowed;
live calls and recordings permission-gated; resync on reconnect; exports polled until
ready; dedicated 401/403/409 handling; no token or client data in logs.

Tests: `tests/unit/crmAutomation.test.ts` (new), `tests/unit/crm.test.ts` (updated),
`tests/e2e/rop.spec.ts` (new), `tests/e2e/crm.spec.ts` (rewritten for the ROP
workspace and re-enabled).
