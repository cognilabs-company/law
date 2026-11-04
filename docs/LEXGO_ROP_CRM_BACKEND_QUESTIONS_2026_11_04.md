# ROP CRM — backend questions (2026-11-04)

Contract: `docs/LEXGO_ROP_CRM_FRONTEND_HANDOFF_FINAL_2026_11_04.md`. Checked against
production OpenAPI (`https://lexgo.api.cognilabs.org/openapi.json`, 4 Nov 2026).
No live ROP session was used: internal accounts need 2FA and no bypass or TOTP secret
was requested, so every shape below was checked against OpenAPI and the contract and
exercised with mocked responses (`tests/e2e/crmServer.ts`, `tests/e2e/rop.spec.ts`).

Where the contract and OpenAPI disagree or OpenAPI leaves a response untyped, the
frontend reads the field names below **and** their common spellings, never guesses a
value, and shows a readable empty state when a field is absent.

## 1. Untyped automation responses

OpenAPI types these responses as `{"type": "object", "additionalProperties": true}`:

| Endpoint | What the frontend reads |
|---|---|
| `GET /crm/automation/catalog` | `triggers[] {key\|type, title\|label, description, group}`, `actions[] {key\|type, title\|label, description, group, risk, integration, approval_required, client_facing, fields[] {key\|name, label, type, required, options\|enum, default, min, max, placeholder, description}}`, `condition_operators[]`, `condition_fields[]`, `execution_modes[]`, `statuses[]`, `integrations {key: {available}}`, `safety_rules[]`, `action_groups[]`, `stop_policy.fields[]`, `schedule.fields[]` |
| `GET /crm/automation/smart-scripts` | `items[] {key, title, description, trigger_type, actions[]}` |
| `POST /crm/automation/rules/preview`, `…/dry-run` | `summary`, `steps[]`, `warnings[]`, `condition_trace[] {label\|field+operator+value, matched}`, `matched`, `writes_performed` |
| `GET /crm/automation/runs`, `…/runs/{id}` | `status`, `attempts`, `error`, `steps[] {index, action_type, status, attempts, input, output, error}`, `can_retry`, `can_cancel` (or `allowed_actions`) |
| `GET /crm/automation/drafts` | `id, status, action_type, title, lead {id, work_id, title, customer}, rule_name, payload, editable_fields[] \| editable` |
| `GET /crm/automation/metrics` | `total_runs, status_counts, success_rate (0–1 or %), scheduled_queue_size, oldest_scheduled_at, queue_lag_seconds` |
| `GET /crm/operators` | `items[] {id, name, lexgo_id, role, active_leads}` |
| `GET /crm/live-calls/{id}` | `call {…, transcript, recording_url}`, `operator`, `lead`, `ai_suggestions` |

**Question:** please publish response models for these (or confirm the field names
above), so the types can come from OpenAPI.

## 2. Condition tree shape

`CrmAutomationRuleCreate.conditions` is `array | object`. The frontend sends a flat
list `[{field, operator, value}]` while every condition is AND, and
`{"operator": "and"|"or", "conditions": [...]}` (nested the same way) once OR or a
group is used. It reads back that shape, `{all|any: [...]}` and
`{logic|op, rules|items}`. **Question:** which tree keys does the backend accept and
return?

## 3. Condition fields

The catalog may list `condition_fields`; when it does not, the builder offers the ten
lead/customer fields of the 29 Oct contract (`lead.status`, `lead.source`, …).
**Question:** will the catalog always send `condition_fields` (with types/options)?

## 4. Stop policy and schedule

`stop_policy` and `schedule` are free objects in `CrmAutomationRuleCreate`. The
builder renders them only from catalog field definitions (`stop_policy.fields`,
`schedule.fields`); without them it shows that none applies. **Question:** what
keys do they take, and can the catalog describe them?

## 5. Retry / cancel permission

Without `can_retry` / `can_cancel` the frontend offers retry for `failed`,
`partially_failed`, `cancelled` and cancel for `scheduled`, `queued`, `pending`,
`running`, `waiting_approval`; the backend's `crm_automation_run_not_retryable` /
`_not_cancellable` are shown as business messages. **Question:** please send
`can_retry` / `can_cancel` on runs.

## 6. Draft editing

Edits are offered for `editable_fields` (or every text field when
`editable: true`) and sent as the whole `edited_payload`. **Question:** is a partial
`edited_payload` (only changed keys) accepted, and which draft types support editing?

## 7. Kanban reorder

`POST /crm/leads/{id}/status` (`CrmLeadStatusUpdate`) has no position, so a move
inside one column still goes through `PATCH /call-center/leads/{id}/move`
(`LeadKanbanMove {column_key, position, expected_lock_version}`); the board re-sorts by
the returned `kanban.rank`. **Question:** is there a `/crm/...` endpoint for an exact
position, or is the call-center move the intended one for ROP?

## 8. Kanban operator filter

`GET /crm/kanban` has `q` and `mine_only` but no `assigned_operator_user_id`, so the
Operators page links to the lead *list* filtered by operator, not to the board.
**Question:** can the Kanban take the operator filter too?

## 9. Live-call recording

`recording_url` is read from the live-call detail and shown only with
`crm.calls.recordings.view`. **Question:** is it a signed, short-lived URL, and is
playing it audited like the view?

## 10. Contract vs. OpenAPI

- §4 names `GET /crm/operator-templates` "Templates"; `CrmOperatorTemplateCreate` has
  `status` and `tags`, both now sent. No update/delete endpoint exists in OpenAPI —
  templates can only be created. **Question:** is editing/archiving planned?
- §21 export `download_url`: the frontend never opens it before `status=ready`; a
  `409 crm_export_not_ready` returns the export to polling.
