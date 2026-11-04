# LexGo ROP CRM — Final Frontend Integration Contract

Date: 4 November 2026  
Recipient: Abdurahmon  
Backend base URL: `https://lexgo.api.cognilabs.org`

## 1. Purpose

This document defines the complete frontend behavior for the ROP (sales/call-center supervisor) CRM workspace.

ROP is a supervisor role. It is not a second superadmin dashboard. The ROP workspace is designed to:

- see all CRM leads and unassigned queue items;
- assign or transfer leads to operators;
- control the Kanban workflow;
- inspect lead and customer history;
- monitor operators and live calls;
- configure and monitor CRM robots;
- review AI and automation drafts before they affect a client;
- create exports;
- use operational metrics without exposing company revenue.

The frontend must never hard-code access from the visual role name alone. It must use the authenticated user's backend permissions and the `/crm/meta` response.

## 2. Authentication and initial bootstrap

All REST requests use:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

Internal staff accounts require the existing LexGo two-factor authentication flow. Do not create or use a frontend-only bypass.

After login, load these requests in this order:

1. `GET /auth/me`
2. `GET /crm/meta`
3. `GET /crm/me/metrics`
4. `GET /crm/kanban?column_limit=30`
5. connect to `wss://lexgo.api.cognilabs.org/ws/users/me?token=<access_token>`

The access token in a WebSocket URL must never be logged, persisted in analytics, or shown in an error message.

## 3. ROP permissions and visibility

The backend role is `sales_head`. The current ROP permission set includes:

- `sales.access`
- `leads.manage`
- `packages.approve`
- `crm.customers.view`
- `crm.customers.manage`
- `crm.customers.merge`
- `crm.leads.view`
- `crm.leads.view_all`
- `crm.leads.manage`
- `crm.leads.claim`
- `crm.leads.assign`
- `crm.analytics.self`
- `crm.ai.use`
- `crm.calls.start`
- `crm.calls.recordings.view`
- `crm.live_calls.view`
- `crm.sms.manage`
- `crm.automation.manage`
- `crm.exports.create`
- `crm.templates.manage`

Always treat `GET /crm/meta.permissions` as the runtime source of truth. A superadmin may grant or revoke individual permissions later.

Important visibility rules:

- ROP can see all leads because it has `crm.leads.view_all`.
- ROP can see all operators and filter leads by operator.
- ROP can manage CRM robots.
- ROP can see live calls and recordings because it has the required permissions.
- ROP must not see platform revenue, operator income, commission, salary, or company financial totals.
- `GET /crm/analytics` is intentionally superadmin-only, even if a non-superadmin receives a similarly named permission.
- For ROP, show operational statistics from `GET /crm/me/metrics`, lead counts, operator workloads, Kanban counts, automation metrics, and live-call data.
- Do not show a Revenue menu, revenue card, or financial chart when `/crm/meta.revenue_visible` is `false`.

## 4. Recommended ROP navigation

Show the following CRM navigation items only when the required permission exists:

| Page | Permission | Primary API |
|---|---|---|
| Overview | `crm.analytics.self` | `GET /crm/me/metrics` |
| Leads | `crm.leads.view` | `GET /crm/leads` |
| Kanban | `crm.leads.view` | `GET /crm/kanban` |
| Customers | `crm.customers.view` | `GET /crm/customers` |
| Operators | `crm.leads.view` | `GET /crm/operators` |
| Live calls | `crm.live_calls.view` | `GET /crm/live-calls` |
| CRM robots | `crm.automation.manage` | `GET /crm/automation/rules` |
| Robot runs | `crm.automation.manage` | `GET /crm/automation/runs` |
| Approval drafts | `crm.automation.manage` | `GET /crm/automation/drafts` |
| Templates | CRM access; write requires `crm.templates.manage` | `GET /crm/operator-templates` |
| Exports | `crm.exports.create` | `POST /crm/exports` |

Do not expose raw JSON pages. Every CRM detail response provides frontend-friendly fields and, for details, `detail_sections`.

## 5. CRM metadata

### `GET /crm/meta`

Use this response to configure labels, filters, forms, menus, and capabilities.

Important fields:

```json
{
  "statuses": [],
  "scores": ["cold", "warm", "hot"],
  "languages": ["uz_latn", "uz_cyrl", "ru"],
  "contact_types": ["phone", "telegram", "email"],
  "sources": ["manual", "web", "telegram", "phone", "support", "marketplace", "document", "ai"],
  "customer_lifecycles": ["prospect", "customer"],
  "permissions": [],
  "scope": "all",
  "revenue_visible": false,
  "telephony": {},
  "forms": {},
  "kanban": {},
  "automation": {},
  "detail_rendering": {
    "field": "detail_sections",
    "raw_json_forbidden": true
  }
}
```

Frontend requirements:

- Build status labels and colors from `statuses`; do not translate status keys independently.
- Build buttons from `permissions` and each lead's `allowed_actions`.
- If `scope` is `all`, enable operator filters.
- If `revenue_visible=false`, omit all revenue UI.
- Render `detail_sections`; never dump `details` as JSON.

## 6. ROP overview

### `GET /crm/me/metrics?date_from=<ISO>&date_to=<ISO>`

Show:

- total assigned leads;
- active leads;
- won leads;
- closed/rejected leads;
- conversion percentage;
- average first-response time;
- overdue next actions;
- counts by status;
- cycle metrics for repeat customer inquiries.

The response intentionally contains `revenue_visible: false` and no income amount.

Additional supervisor cards may be built from:

- `GET /crm/kanban` for all lead counts;
- `GET /crm/operators` for operator workload;
- `GET /crm/automation/metrics` for robot health;
- `GET /crm/live-calls` for active calls.

Do not call `GET /crm/analytics` for ROP. It is superadmin-only and returns `403 crm_global_analytics_superadmin_only`.

## 7. Customers and leads are different entities

A customer is created once. The same customer can have many independent lead cycles over time.

- First inquiry: create or match a customer, then create a lead.
- Later similar inquiry: reopen the existing lead as a new cycle.
- Later unrelated inquiry: create another lead for the same customer.
- A CRM prospect becomes a customer only after a confirmed purchase/payment.
- LexGo account linkage is automatic by a verified phone number.
- Do not show or ask for a LexGo user ID in customer or lead forms.

### Customer selection

Use:

```http
GET /crm/customers/select?q=<name_or_phone_or_crm_id>&limit=30&offset=0
```

This must be a paginated Select + Search component, not a plain search input.

Each option includes:

- `id`
- `public_id`
- `name`
- `region`
- `primary_phone`
- `is_lexgo_user`
- `lexgo_user_label`
- `lexgo_id`
- `lead_count`
- `display_label`

When `is_lexgo_user=true`, show a small “LexGo user” badge inside the option.

### New customer from lead modal

When the user selects “New customer” inside the New Lead modal:

1. Open the New Customer modal above it.
2. Create the customer through `POST /crm/customers`.
3. Close only the customer modal.
4. Return to the still-open lead modal.
5. Automatically select the newly created customer.
6. Preserve all previously entered lead fields.

## 8. Customer APIs

### List

```http
GET /crm/customers?q=&region=&status=active&lifecycle=&limit=50&offset=0
```

### Create

```http
POST /crm/customers
```

```json
{
  "name": "Customer name",
  "preferred_language": "uz_latn",
  "region": "Toshkent",
  "source": "manual",
  "notes": "Optional internal note",
  "contacts": [
    {
      "contact_type": "phone",
      "value": "+998901234567",
      "label": "Main",
      "is_primary": true,
      "is_verified": false,
      "source": "manual"
    }
  ]
}
```

Never send `user_id` from the frontend. The backend owns account matching.

### Detail and edit

- `GET /crm/customers/{customer_id}`
- `PATCH /crm/customers/{customer_id}`
- `GET /crm/customers/{customer_id}/timeline`
- `POST /crm/customers/{customer_id}/contacts`
- `PATCH /crm/customers/{customer_id}/contacts/{contact_id}`
- `DELETE /crm/customers/{customer_id}/contacts/{contact_id}`

Render customer detail from `detail_sections`, `contacts`, `leads`, `orders`, and `account_linking`.

### Merge duplicates

```http
POST /crm/customers/merge
```

```json
{
  "source_customer_ids": ["duplicate-id-1", "duplicate-id-2"],
  "target_customer_id": "canonical-id",
  "reason": "Confirmed duplicate by phone and identity"
}
```

The merge button requires `crm.customers.merge`.

## 9. Lead list and Kanban

### Lead list

```http
GET /crm/leads
```

Supported filters:

- `status`
- `score`
- `source`
- `category` (legacy filter only; do not show category in the new create form)
- `region`
- `q`
- `assigned_operator_user_id`
- `queue_only`
- `mine_only`
- `next_action_from`
- `next_action_to`
- `created_from`
- `created_to`
- `limit`
- `offset`

The response returns `items`, `total`, `limit`, `offset`, and unfiltered status `counts` for the viewer's allowed scope.

### Kanban

```http
GET /crm/kanban?column_limit=30&q=&mine_only=false
```

The six fixed status keys are:

1. `new`
2. `qualified`
3. `proposal`
4. `decision_pending`
5. `won`
6. `rejected`

Titles, colors, and ordering are configurable. Keys are fixed.

ROP can configure columns through:

```http
PUT /crm/kanban/columns
```

```json
{
  "columns": [
    {"key": "new", "title": "Yangi", "color": "#3B82F6", "order": 10},
    {"key": "qualified", "title": "Ehtiyoj aniqlandi", "color": "#8B5CF6", "order": 20},
    {"key": "proposal", "title": "Taklif yuborildi", "color": "#F59E0B", "order": 30},
    {"key": "decision_pending", "title": "Qaror kutilmoqda", "color": "#F97316", "order": 40},
    {"key": "won", "title": "Muvaffaqiyatli", "color": "#10B981", "order": 50},
    {"key": "rejected", "title": "Rad etildi", "color": "#EF4444", "order": 60}
  ]
}
```

Lead cards can be reordered inside a status and moved to a precise position. Use the returned `kanban.rank`; do not calculate a permanent rank client-side.

For a move, call the status endpoint and always send the latest `lock_version`:

```http
POST /crm/leads/{lead_id}/status
```

```json
{
  "status": "proposal",
  "reason": "Offer was prepared",
  "next_action_at": "2026-11-05T10:00:00+05:00",
  "expected_lock_version": 4
}
```

If another operator changed the lead first, backend returns `409 crm_lead_version_conflict` with `current_lock_version`. Reload the lead before retrying.

## 10. Lead creation and detail

### Create

```http
POST /crm/leads
```

Existing customer example:

```json
{
  "customer_id": "customer-uuid",
  "source": "phone",
  "title": "Inheritance consultation",
  "problem": "Customer needs help with inheritance documents",
  "region": "Toshkent",
  "urgency": "normal",
  "preferred_language": "uz_latn",
  "details": {},
  "next_action_at": null,
  "assigned_operator_user_id": null,
  "force_create": false,
  "reuse_similar": true
}
```

Rules:

- Do not send `client_user_id`.
- Do not show or send `category` in the new form.
- Region is initially taken from the customer.
- If the operator changes the lead region, the backend updates the customer's latest region too.
- An unassigned lead stays in the common queue.
- Similar requests can reopen the old lead cycle.

### Detail

```http
GET /crm/leads/{lead_id}
```

Render:

- visible title and problem;
- customer card;
- workflow/status;
- assigned operator;
- next action;
- score and urgency;
- current cycle and cycle number;
- converted order, if any;
- watchers;
- `detail_sections` as readable sections;
- action buttons from `allowed_actions`.

Never render `details` with a JSON viewer.

### History and timeline

- `GET /crm/leads/{lead_id}/history` — cycles and status history.
- `GET /crm/leads/{lead_id}/timeline?limit=100&offset=0` — full operational timeline.
- `POST /crm/leads/{lead_id}/activities` — add notes, call notes, messages, meetings, follow-ups, documents, or system entries.

### Reopen a previous lead

```http
POST /crm/leads/{lead_id}/reopen
```

```json
{
  "title": "New inquiry title",
  "inquiry": "New customer request. The previous history must remain visible.",
  "source": "phone",
  "assigned_operator_user_id": null,
  "reason": "Customer contacted us again",
  "expected_lock_version": 7
}
```

The old successful/rejected cycle remains in history. The lead returns to `new` with a new cycle.

## 11. Assignment, transfer, and watchers

Load operators with:

```http
GET /crm/operators?q=&limit=100
```

Each operator includes `active_leads`. Use it in the assignment selector.

### Assign or transfer

- `POST /crm/leads/{lead_id}/assign`
- `POST /crm/leads/{lead_id}/transfer`

```json
{
  "operator_user_id": "user-uuid",
  "reason": "Transferred based on workload and specialization",
  "expected_lock_version": 5
}
```

### Claim an unassigned lead

```http
POST /crm/leads/{lead_id}/claim
```

Possible conflict: `409 crm_lead_already_claimed`.

### Watchers

- `POST /crm/leads/{lead_id}/watchers` with `{ "user_id": "..." }`
- `DELETE /crm/leads/{lead_id}/watchers/{watcher_user_id}`

ROP can add or remove other watchers because it has assignment permission.

## 12. Duplicate resolution and conversion

### Duplicate resolution

```http
POST /crm/leads/{lead_id}/duplicate-resolution
```

Not a duplicate:

```json
{"decision":"not_duplicate","reason":"Different legal matter"}
```

Confirmed duplicate:

```json
{
  "decision":"duplicate",
  "duplicate_of_lead_id":"canonical-lead-id",
  "reason":"Same customer and same request"
}
```

### Convert to an order draft

```http
POST /crm/leads/{lead_id}/conversion
```

```json
{
  "service_id": "service-id",
  "package_id": null,
  "seller_user_id": null,
  "price": 500000,
  "currency": "UZS",
  "note": "Operator confirmed the selected service"
}
```

Conversion creates an `operator_draft`; it does not silently complete a purchase. The CRM customer must already be linked to a LexGo account.

## 13. CRM AI assistant

Create an AI job:

```http
POST /crm/leads/{lead_id}/ai/runs
```

Supported `run_type` values:

- `full_analysis`
- `summary`
- `qualification`
- `service_match`
- `draft_reply`
- `call_script`
- `follow_up`
- `offer`
- `live_call_assist`
- `post_call_summary`
- `sms_draft`

Example:

```json
{
  "run_type": "full_analysis",
  "language": "auto",
  "instruction": "Prepare three practical next actions for the operator"
}
```

For standard next-action support, use `full_analysis` or the robot action `ai_next_best_action`; do not send an unknown run type.

Read status:

- `GET /crm/leads/{lead_id}/ai/runs`
- `GET /crm/ai/runs/{run_id}`

Apply only selected AI output fields:

```http
POST /crm/ai/runs/{run_id}/apply
```

```json
{
  "selected_paths": ["summary", "next_action", "score"],
  "overrides": {},
  "expected_lock_version": 8
}
```

AI output is always a draft. The operator or ROP chooses what to apply.

## 14. Calls and live-call supervision

### Start a call record

```http
POST /crm/leads/{lead_id}/calls
```

```json
{
  "contact_id": "contact-id-or-null",
  "direction": "outbound",
  "purpose": "Clarify the customer's legal issue"
}
```

The backend/provider announces that the call may be recorded. The frontend must not fake recording consent.

### Complete a call

```http
POST /crm/calls/{call_id}/complete
```

```json
{
  "status": "completed",
  "summary": "Operator summary",
  "transcript": [],
  "recording_url": "",
  "metadata": {}
}
```

Allowed final statuses: `completed`, `no_answer`, `failed`, `cancelled`.

When status is `no_answer`, backend schedules the configured delayed SMS workflow. Current CRM metadata exposes the exact delay; the intended default is three minutes.

### Live transcript

```http
POST /crm/calls/{call_id}/transcript
```

```json
{
  "segments": [{"speaker":"client","text":"...","started_at_ms":0,"ended_at_ms":2400}],
  "language": "auto",
  "request_ai_assist": true
}
```

The backend can queue `live_call_assist` and returns `ai_run_id`.

### ROP live-call pages

- `GET /crm/live-calls`
- `GET /crm/live-calls/{call_id}`

These pages are read-only supervision views. Show call, customer, lead, transcript, recording access, and AI suggestions. Every view is audited by the backend.

## 15. SMS

### List and create draft

- `GET /crm/leads/{lead_id}/sms`
- `POST /crm/leads/{lead_id}/sms`

```json
{
  "body": "SMS body",
  "language": "uz_latn",
  "contact_id": "phone-contact-id",
  "scheduled_at": null
}
```

### Approve

```http
POST /crm/sms/{sms_id}/approve
```

```json
{"body":"Optional edited final text"}
```

Client-facing SMS generated by a robot remains a draft until an operator approves it. The exception is a backend-defined trusted workflow; frontend must follow returned status and not assume automatic sending.

## 16. CRM robot builder

The robot UI must be metadata-driven.

Load:

1. `GET /crm/automation/catalog`
2. `GET /crm/automation/smart-scripts`
3. `GET /crm/automation/rules`

The catalog returns:

- triggers with descriptions and groups;
- actions with field definitions, risk, integration and approval requirements;
- condition operators;
- execution modes;
- statuses;
- integration availability;
- safety rules.

Do not hard-code robot field forms. Build each action form from `catalog.actions[].fields`.

Supported condition operators:

- `eq`, `ne`
- `in`, `not_in`
- `contains`, `not_contains`
- `exists`, `not_exists`
- `gt`, `gte`, `lt`, `lte`

Condition tree supports `and` and `or`.

### Robot rule form

The form order should be:

1. Rule name and description.
2. Trigger.
3. Optional delay.
4. Conditions.
5. Ordered actions.
6. Execution mode.
7. Stop policy/schedule if relevant.
8. Preview.
9. Save as draft or activate.

Preview before save:

```http
POST /crm/automation/rules/preview
```

```json
{
  "name": "No-answer recovery",
  "trigger_type": "call_no_answer",
  "delay_seconds": 180,
  "conditions": [],
  "actions": [
    {"type":"send_sms","body":"Siz bilan bog‘lana olmadik.","language":"uz_latn"},
    {"type":"plan_call","due_in_minutes":30,"purpose":"Call customer again"}
  ],
  "lead_id": null,
  "trigger_context": {}
}
```

Preview returns a human-readable summary, warnings, condition trace when a lead is supplied, and `writes_performed=false`.

### Create and update

- `POST /crm/automation/rules`
- `PATCH /crm/automation/rules/{rule_id}`
- `POST /crm/automation/rules/{rule_id}/clone`
- `POST /crm/automation/rules/reorder`
- `POST /crm/automation/rules/{rule_id}/dry-run`

Rule statuses:

- `draft`
- `active`
- `paused`
- `archived`

Update requires `expected_lock_version`. On `409 crm_automation_rule_version_conflict`, reload the current rule.

### Smart scripts

Backend currently supplies templates including:

- new lead triage;
- urgent lead;
- no-answer recovery;
- clarify customer need;
- prepare service offer;
- post-payment handoff;
- dormant lead;
- repeat inquiry;
- support escalation;
- rejected lead follow-up.

Instantiate through:

```http
POST /crm/automation/smart-scripts/{script_key}/instantiate
```

```json
{"name":"Optional custom name","priority":100,"status":"draft"}
```

## 17. Robot action groups

The catalog currently covers these categories. Show them grouped, searchable, and with their backend description visible.

### Lead actions

- update fields;
- change status;
- assign owner;
- distribute owner (`round_robin`, `least_loaded`, `first_available`, `random`);
- manage tags;
- set score/urgency;
- set next action;
- add timeline note;
- reopen cycle;
- request duplicate merge.

### Communication actions

- prepare SMS;
- prepare Telegram message;
- prepare email;
- prepare client notification;
- plan call;
- request support chat;
- prepare AI reply draft.

### Team actions

- notify operator;
- notify ROP/supervisor;
- create task;
- close linked tasks;
- plan meeting;
- SLA escalation.

### AI/service/document actions

- AI lead summary;
- AI next best action;
- recommend service/package;
- prepare offer;
- generate document request;
- request client documents;
- protected webhook request.

High-risk/client-facing actions expose `approval_required=true`. Show a visible approval badge and explain that the robot creates a draft rather than directly contacting the client.

## 18. Robot runs and approval drafts

### Runs

- `GET /crm/automation/runs?status=&rule_id=&lead_id=&limit=100&offset=0`
- `GET /crm/automation/runs/{run_id}`
- `POST /crm/automation/runs/{run_id}/retry`
- `POST /crm/automation/runs/{run_id}/cancel`

Run detail includes every step, input, output, attempt count, timestamps, and errors.

Retry supports:

```json
{"from_step_index":2}
```

Only show Retry or Cancel when the backend status permits it. Handle `crm_automation_run_not_retryable` and `crm_automation_run_not_cancellable` as business conflicts, not generic crashes.

### Approval drafts

- `GET /crm/automation/drafts?status=pending_approval&lead_id=&limit=100&offset=0`
- `POST /crm/automation/drafts/{draft_id}/decision`

```json
{
  "decision":"approve",
  "reason":"Checked by ROP",
  "edited_payload": null
}
```

Allowed decisions: `approve`, `reject`.

The frontend must allow the reviewer to edit the draft payload before approval when the response type supports editing.

## 19. Automation metrics

```http
GET /crm/automation/metrics?date_from=<ISO>&date_to=<ISO>
```

Show:

- total runs;
- counts by status;
- success rate;
- scheduled queue size;
- oldest scheduled item;
- queue lag in seconds.

This is operational data and is allowed for ROP. It is not a financial dashboard.

## 20. Operator templates

List:

```http
GET /crm/operator-templates?template_type=&language=&q=
```

Create:

```http
POST /crm/operator-templates
```

Templates are for reusable operator texts/scripts. Use backend-supported `template_type`, `language`, `content`, tags, and status fields from OpenAPI. Editing a message instance must not mutate the source template.

## 21. Exports

Create background export:

```http
POST /crm/exports
```

Supported scopes:

- `leads`
- `customers`
- `activities`

Poll:

```http
GET /crm/exports/{export_id}
```

Download only when `status=ready` and `download_url` is non-null:

```http
GET /crm/exports/{export_id}/download
```

Handle `409 crm_export_not_ready` by continuing to poll. Do not open a broken file URL.

## 22. Realtime behavior

Connect once after authentication:

```text
wss://lexgo.api.cognilabs.org/ws/users/me?token=<access_token>
```

On connect, CRM users receive:

```json
{
  "event":"crm.resync",
  "resources":["/crm/leads","/crm/me/metrics"],
  "reason":"connected"
}
```

ROP with live-call permission is also subscribed to `crm:live-calls`.

Important event families include:

- `crm.lead.created`
- `crm.lead.assigned`
- `crm.lead.transferred`
- `crm.lead.moved`
- `crm.lead.reopened`
- `crm.kanban.columns_updated`
- `crm.call.transcript_updated`
- `crm.automation.rule_created`
- `crm.automation.rule_updated`
- `crm.automation.run_completed`
- `crm.automation.run_failed`
- `crm.automation.approval_required`
- `crm.automation.sla_escalated`

Frontend rule:

- Do not attempt to fully reconstruct complex state from an event.
- Use the event for immediate visual feedback.
- Refetch the affected resource or lead detail.
- On reconnect or `crm.resync`, refetch all visible CRM resources.
- Debounce repeated list refreshes within a short interval.

## 23. Error handling

Backend errors can be strings or structured `detail` objects. Always read:

```ts
const detail = error.response?.data?.detail;
const code = typeof detail === "object" ? detail.code : undefined;
```

Important codes:

- `crm_access_denied`
- `crm_permission_required`
- `crm_lead_not_found`
- `crm_customer_not_found`
- `crm_operator_scope_denied`
- `crm_lead_edit_denied`
- `crm_lead_version_conflict`
- `crm_lead_already_claimed`
- `crm_operator_invalid`
- `crm_duplicate_target_invalid`
- `crm_customer_account_required`
- `crm_phone_contact_required`
- `crm_sms_not_approvable`
- `crm_automation_rule_not_found`
- `crm_automation_rule_version_conflict`
- `crm_automation_action_invalid`
- `crm_automation_action_configuration_invalid`
- `crm_automation_trigger_invalid`
- `crm_automation_run_not_retryable`
- `crm_automation_run_not_cancellable`
- `crm_automation_draft_not_found`
- `crm_export_not_ready`
- `crm_global_analytics_superadmin_only`

For `401`, refresh the access token once through the existing auth flow. For `403`, hide the unavailable action after refreshing `/crm/meta`; do not keep retrying. For `409`, show the business conflict and reload the affected entity.

## 24. Required frontend UX

### ROP overview

- operational cards only;
- all-lead counts;
- unassigned queue;
- operator workload;
- overdue next actions;
- active calls;
- robot failures and pending approvals;
- no revenue or salary.

### Lead detail

- human-readable sections;
- sticky primary actions;
- status and operator selectors;
- timeline and cycle history tabs;
- customer card;
- AI assistant panel;
- call/SMS controls where permitted;
- robot history and pending draft indicator;
- no raw JSON.

### Robot builder

- trigger-condition-action visual flow;
- backend catalog-driven fields;
- drag sorting of actions;
- visible delay and execution mode;
- readable preview before save;
- warning badges for client-facing and high-risk actions;
- dry-run against a selected lead;
- run history and step-level errors;
- explicit draft/active/paused/archived states.

## 25. Frontend acceptance checklist

- [ ] `/crm/meta` is loaded before rendering CRM menus and forms.
- [ ] ROP sees all leads only when `crm.leads.view_all` is present.
- [ ] Revenue and income are never displayed when `revenue_visible=false`.
- [ ] Customer selection uses paginated Select + Search.
- [ ] New Customer modal returns the created customer to the open Lead modal.
- [ ] Lead forms do not ask for LexGo user ID or category.
- [ ] Lead details use `detail_sections`, not JSON.
- [ ] All writes use the latest `lock_version` where required.
- [ ] Kanban status titles/colors/order come from backend.
- [ ] Assignment selector shows operator active workload.
- [ ] Old lead cycles remain visible after reopening.
- [ ] AI output is selectable/editable and never silently applied.
- [ ] Client-facing robot actions require approval when indicated.
- [ ] Robot forms are generated from `/crm/automation/catalog`.
- [ ] Robot preview/dry-run is available before activation.
- [ ] Run detail shows each step and retry/cancel controls only when allowed.
- [ ] Live calls and recording/transcript views are permission-gated.
- [ ] WebSocket reconnect triggers CRM resync.
- [ ] Exports are polled until ready.
- [ ] 401/403/409 errors receive dedicated handling.
- [ ] No API token or client data is written to frontend logs.

## 26. Backend source of truth

Use production OpenAPI for request/response typing:

```text
https://lexgo.api.cognilabs.org/openapi.json
```

When this document and a live backend response differ, the frontend must not guess. Use `/crm/meta`, OpenAPI, entity `allowed_actions`, permission codes, and returned runtime fields as the source of truth, then report the discrepancy with the exact endpoint and response.
