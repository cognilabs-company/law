# LexGo CRM: frontend questions for the backend team

Date: 2026-10-29
From: Frontend
Status: open
Applies to: `LEXGO_CRM_FRONTEND_HANDOFF_2026_10_29.md` (release `13cb257`)

All twelve steps of §24 are built (the checklist is at the end). The questions below are only real gaps: places where the contract names a field or a flow without its shape.

Live checks: the superadmin account was used for read-only GET calls (`/crm/meta`, `/crm/kanban`, a lead, history, calls, SMS, automation, live calls, metrics, analytics). Operator and ROP behaviour could not be checked live because those accounts need 2FA, so the frontend relies on the contract and on test mocks for them.

---

## 1. Kanban

**1.1 Reorder inside a status.** `POST /crm/leads/{id}/status` has no position field, yet `reorder_supported=true`.
- The frontend now sends an in-column reorder to `PATCH /call-center/leads/{id}/move` with the same `column_key`, `position` and `expected_lock_version`.
- Is that the intended endpoint, or should `/status` accept `position`?

**1.2 "Load more" in a column.** `GET /crm/kanban` takes `column_limit` but no offset per column.
- The frontend pages a column with `GET /crm/leads?status=<key>&offset=…`.
- Is that list in exactly the same rank order as the board?

**1.3 A legacy status on production data.** Production still has leads whose status is `duplicate`: `/crm/analytics` shows `status_counts.duplicate=4`, and a customer's lead list returns it, although §6 fixes six statuses.
- Will these leads be migrated? Or should the board show them somewhere?
- Today they appear in no column.

## 2. Locking

**2.1 Stale-version code.** §3 and §22 say a stale `expected_lock_version` is a 409, but no code is named.
- The frontend treats `crm_lead_version_conflict`, or any 409 whose code mentions `version`, `stale` or `lock`, as a conflict.
- What is the exact code?

**2.2 Reopen availability.** Which `allowed_actions` key allows `POST /crm/leads/{id}/reopen`?
- The frontend shows Reopen on a final-status lead whose actions include `reopen` or `edit`.

## 3. Realtime

**3.1 `crm.lead.moved` payload.** The frontend reads `lead_id`, `to` (or `to_status` / `status`) and `position`. Please confirm these names.

**3.2 Live-calls channel.** §21 says supervisors also consume `crm:live-calls`.
- How does the browser subscribe to it on the existing user socket?
- Until we know, the Live Office follows call events and polls (every 15 s for the list, 5 s for the open call).

## 4. Calls

**4.1 Consent text.** §14 says the Uzbek recording-consent text is inside the call's `metadata`, but not under which key.
- Read now: `recording_consent_text`, `consent_text`, or `recording_consent` / `consent` as `{text_uz | uz | text}` or a plain string.

**4.2 Transcript response.** Does `POST /crm/calls/{id}/transcript` return the updated call, or only `ai_run_id`? Read now: `ai_run_id` or `ai_run.id`, plus an optional `call`.

**4.3 A list of calls.** There is no list of calls across leads.
- The Calls section therefore gathers calls from up to 30 of the operator's open leads, which costs one request per lead.
- Is a list endpoint (for example `GET /crm/calls?mine_only=&status=`) planned?

## 5. SMS

**5.1 Retry after the provider is configured.** §15 asks for "a retry option".
- Is the retry `POST /crm/sms/{id}/approve` again on a `provider_configuration_required` SMS, or a different endpoint?

**5.2 Recipient and origin.** Which fields hold the recipient's phone and the SMS's origin (the automatic no-answer SMS vs an operator or AI draft)?
- Read now: `phone | to | recipient | contact.value`, and `source | origin | metadata.source | metadata.trigger`.

**5.3 A list of SMS.** There is no list of SMS across leads. The SMS section has the same per-lead workaround as 4.3. Is a list endpoint planned?

## 6. AI Copilot

**6.1 Paths that can be applied.** Which output paths does `POST /crm/ai/runs/{id}/apply` accept?
- The frontend offers `summary`, `category`, `subcategory`, `urgency`, `next_action`, `next_action.at` and `next_action.note`.
- Is `suggested_status` applicable, or only advice?

**6.2 Active run.** On `409 crm_ai_run_active` the frontend reads the run from `detail.run_id`. Please confirm.

## 7. Automation

**7.1 Action settings.** §16 names the action types but not their settings. The frontend sends:
- `send_sms {body, language}`
- `send_notification {message, recipient: "assigned_operator" | recipient_user_id}`
- `create_task {title, due_in_minutes}`
- `change_status {status}`
- `assign_owner {operator_user_id}`
- `add_tags {tags: []}`
- `escalate {reason}`

Each action is sent as `{type, …settings}`. Please send the exact shape for each type.

**7.2 Dry-run input and output.**
- Which `trigger_context` keys does each trigger expect? The frontend sends `{previous_status, status}` for `status_changed` and `{}` for every other trigger.
- The answer is read as `matched`, `matched_context` and `proposed_actions`. Please confirm these names.

**7.3 Run statuses.** The run status values aren't listed. The frontend filters by `scheduled | running | completed | failed | skipped | cancelled`.

## 8. Live Office

**8.1 Item and detail shape.** Production returned no live calls, so the shape is unknown.
- Read now: `call` (or the item itself) with `id`, `status`, `started_at`, `transcript`; then `operator`, `lead`, `customer`.
- AI suggestions are read from `ai_suggestions | live_ai | ai_run.output | latest_ai_run.output`.
- Please send one example.

## 9. Orders and exports

**9.1 Converted order.** What is the shape of `converted_order`? Read now: `id`, `work_id`, `status`, `payment_status | payment_state`.

**9.2 Export list.** There is no `GET /crm/exports` list, so the Exports page shows the jobs started in the current session. Is a list of the operator's own exports planned?

---

## Contract checklist (frontend, release 13cb257)

Legend: ✅ done, with the code and the test that covers it.

| § | Item | Status | Code | Test |
|---|---|---|---|---|
| 2 | Customer and lead are separate; one customer, many leads | ✅ | `CrmCustomerPage.tsx` (current and past leads) | e2e "customer profile" |
| 2 | Lifecycle: prospect until a paid purchase, then customer | ✅ | `crmCustomerOf` (`lifecycle`, `becameCustomerAt`), `CrmCustomerPage.tsx`, `CrmCustomers.tsx` | unit "customers" |
| 2 | No editable LexGo ID; IDs from the backend | ✅ | customer and lead forms have no id field | e2e "new lead" |
| 2 | Lead cycles; old cycles keep their final status | ✅ | `LeadHistory.tsx`, `getLeadHistory` | e2e "reopens as a new cycle", unit "cycles" |
| 3 | `expected_lock_version` on every lead mutation; replace the lead with the answer | ✅ | `leadWrite` in `crm.ts`, `write` in `CrmLeadPage.tsx` | e2e "lead workspace" |
| 3 | Stale write → refetch + non-destructive dialog | ✅ | `ConflictDialog` in `CrmLeadPage.tsx` | e2e "lead workspace" |
| 3 | detail_sections, never raw JSON | ✅ | `DetailSections.tsx` (lead, customer) | e2e "lead details" |
| 4 | `/crm/meta` read once and kept for the session | ✅ | `lib/crm/useCrm.ts` (`loadCrmMeta`) | e2e "no page refetches by itself" |
| 4 | Menus and buttons from meta flags | ✅ | `sections.ts`, `crmCan`, `leadCan` | unit "sections by permission" |
| 5 | The eleven sections | ✅ | `sections.ts` + one page each under `app/[locale]/admin/crm/*` | unit "sections by permission" |
| 6 | Six fixed statuses; no contacted / in_progress | ✅ | `CRM_STATUSES`, `STATUS_ICON` (icon per status), console queue opens the CRM | unit "meta"; e2e "kanban: GET" |
| 6 | Kanban from `GET /crm/kanban` (column_limit, q, mine_only, has_more) | ✅ | `getCrmKanban`, `LeadBoard.tsx`, `CrmBoardEmbed.tsx` | e2e "kanban: GET", "load more" |
| 6 | Reorder inside a status and move between statuses | ✅ | `reorderCrmLead`, `changeLeadStatus` in `LeadBoard.tsx` (see question 1.1) | e2e "kanban: GET" |
| 6 | Rejected needs a reason | ✅ | `RejectSheet` (board), `StatusSheet` | e2e "kanban: GET" |
| 6 | Won without a paid order snaps back with the reason | ✅ | `changeStatus` in `LeadBoard.tsx` (the card moves only after the backend confirms) | e2e "kanban: GET" |
| 6 | Column settings: title, colour, order; six keys fixed; `crm.automation.manage` | ✅ | `KanbanColumns.tsx`, `StageMenu.tsx`, `saveKanbanColumns` | e2e "load more … status settings", "without crm.automation.manage" |
| 6 | Paginated list with every filter | ✅ | `CrmLeads.tsx`, `leadQuery.ts` (status, score, source, region, q, operator, queue_only, mine_only, next_action range, created range) | e2e "queue claim" |
| 7 | Create with customer_id or a new customer; no client_user_id / category fields | ✅ | `LeadSheet` in `CrmFrame.tsx`, `leadCreateBody` | e2e "new lead" |
| 7 | reuse_similar / force_create; a reopened inquiry is announced | ✅ | `leadCreateBody`, `CrmFrame.tsx` | e2e "new lead" |
| 7 | Manual reopen; duplicate resolution | ✅ | `ReopenSheet`, `DuplicateSheet` | e2e "reopens as a new cycle" |
| 8 | Paginated customer select; nested customer modal; back to the lead form with the new customer chosen | ✅ | `CustomerPicker.tsx`, `NewCustomerModal` | e2e "new lead" |
| 8 | Customer detail: contacts, leads, orders, lifecycle, linking, notes, detail_sections | ✅ | `CrmCustomerPage.tsx` | e2e "customer profile" |
| 8 | Contacts add / edit / archive; last active contact cannot be archived | ✅ | `ContactRow` (`archiveBlocked`), `canArchiveContact` | unit "customers" |
| 9 | Lead page: summary, customer, cycle, operator and watchers, next action, sections, order/payment, timeline, history, calls, SMS, AI, actions from `allowed_actions` | ✅ | `CrmLeadPage.tsx`, `LeadSide.tsx`, panes | e2e "lead workspace", "calls", "SMS" |
| 10 | Claim, assign, transfer; searchable operator list | ✅ | `AssignSheet`, `claimCrmLead`, `CrmBoardEmbed` | e2e "queue claim", "lead workspace" |
| 11 | Watchers add / remove | ✅ | `WatcherSheet`, `removeLeadWatcher` | e2e "lead workspace" |
| 12 | Conversion; `crm_customer_account_required` | ✅ | `ConversionSheet` | e2e "draft order" |
| 13 | All eleven run types; 202 → completed/failed → fetch | ✅ | `AI_RUN_TYPES`, `CopilotPanel.tsx` | e2e "AI copilot" (both) |
| 13 | Single paths, editable, no apply-all | ✅ | `CopilotPanel.tsx`, `aiApplyBody` | e2e "AI copilot: 202" |
| 13 | 409 `crm_ai_run_active` opens the running run | ✅ | `run()` in `CopilotPanel.tsx` | e2e "AI copilot: all eleven" |
| 14 | Start with a phone contact; consent text shown | ✅ | `LeadCalls.tsx` | e2e "calls" |
| 14 | Live transcript; no overlapping assist | ✅ | `ActiveCall` in `LeadCalls.tsx` | e2e "calls" |
| 14 | Complete: completed / no_answer / failed / cancelled + summary | ✅ | `completeCall` | e2e "calls", unit "calls and SMS" |
| 14 | Live Office, read-only and audited, `crm.live_calls.view` | ✅ | `CrmLiveOffice.tsx` | e2e "live office", "hidden section" |
| 15 | Draft → edit/approve → status; provider not configured with a retry, never shown as sent | ✅ | `LeadSms.tsx`, `CrmSmsPage.tsx` | e2e "SMS", unit "calls and SMS" |
| 15 | Automatic 180-second no-answer SMS and its cancellation explained | ✅ | `LeadSms.tsx`, `LeadCalls.tsx` | e2e "calls", "SMS" |
| 16 | Robots: trigger, conditions with pickers, actions; draft / active / paused | ✅ | `CrmAutomation.tsx`, `ruleBody` | e2e "robots", unit "automation" |
| 16 | Dry run required before activation; plain-word result | ✅ | `DryRunDialog`, `tested` gate | e2e "robots" |
| 16 | Run history: status, attempts, times, context, result, error | ✅ | `Runs` in `CrmAutomation.tsx` | e2e "robots" |
| 17 | Templates; create only with `crm.templates.manage`; uz_latn / uz_cyrl / ru | ✅ | `CrmTemplates.tsx` | e2e "no page refetches by itself" |
| 18 | My performance without revenue; cycle metrics | ✅ | `CrmPerformance.tsx` | e2e "operator mission control" |
| 18 | Global analytics with `crm.analytics.global`, UZS, cycle metrics | ✅ | `CrmAnalytics.tsx` | e2e "superadmin" |
| 19 | Export: scopes and filters; queued / running / ready / failed / expired; download with auth; `crm.export.ready` | ✅ | `CrmExports.tsx`, `useCrm.ts` (polling) | e2e "superadmin … export" |
| 20 | Permissions win over roles; operator / ROP / superadmin | ✅ | `sections.ts`, `crmCan` | unit "sections by permission" |
| 21 | Events by lead / customer / call / run; refetch after mutation events | ✅ | `crmEventOf`, `useCrmEvents` | e2e "realtime" |
| 21 | Move cards live, then reconcile | ✅ | `moveLocal` + `schedule` in `LeadBoard.tsx` | e2e "realtime" |
| 21 | Animated top-right notification that opens the page | ✅ | `CrmNotifier` in `CrmFrame.tsx` | e2e "realtime" |
| 21 | Reconnect with backoff; indicator; refetch after reconnect | ✅ | `lib/userSocket.ts`, `LiveDot`, `crm.resync` | e2e "realtime" |
| 22 | Every error code with uz/ru/en text; detail.field by its field | ✅ | `CRM_ERROR_CODES`, `crm.err.*`, field marks in forms | unit "meta" |
| 23 | Skeleton, empty with an action, retry, no-access, job progress, pending buttons disabled; no clearing on refetch; no success before the backend confirms | ✅ | every CRM page | e2e (all CRM tests) |
