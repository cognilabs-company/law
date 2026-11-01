# LexGo Superadmin Mobile Test Monitoring

Date: 1 November 2026  
Recipient: Abdurahmon, frontend developer  
Backend status: deployed to production  
API base URL: `https://lexgo.api.cognilabs.org`

## 1. Access scope

This page is visible only to the primary LexGo superadmin. Do not show its navigation item to admins, managers, call-center roles, lawyers, jurists, clients, or secondary users.

The backend independently enforces the same rule and returns HTTP 403 with:

```json
{
  "detail": {
    "code": "primary_superadmin_required"
  }
}
```

Suggested navigation label: `Mobile test monitoring`.

## 2. Dashboard

```http
GET /admin/mobile-testing/dashboard?date=2026-11-01
```

If `date` is omitted, the backend uses the current date in `Asia/Tashkent`.

Response shape:

```json
{
  "date": "2026-11-01",
  "timezone": "Asia/Tashkent",
  "summary": {
    "registered_devices": 12,
    "used_devices": 9,
    "unused_devices": 3,
    "active_now": 2,
    "total_foreground_seconds": 15420,
    "total_foreground_minutes": 257.0,
    "sessions": 31
  },
  "items": [],
  "realtime": {
    "websocket_url": "/ws/users/me",
    "events": [
      "mobile_testing.installation_registered",
      "mobile_testing.usage_updated",
      "mobile_testing.session_stale",
      "mobile_testing.report_sent"
    ]
  }
}
```

Show these cards:

1. Registered test phones.
2. Phones used today.
3. Phones not used today.
4. Active now.
5. Total foreground minutes.
6. Total sessions.

The selected date and timezone must always be visible. Never reinterpret the selected date in browser local timezone.

## 3. Device list

```http
GET /admin/mobile-testing/installations?date=2026-11-01&usage=all&limit=50&offset=0
```

Allowed `usage` values:

- `all`
- `used`
- `unused`

Response:

```json
{
  "items": [
    {
      "id": "installation-uuid",
      "tester": {
        "id": "user-uuid",
        "lexgo_id": "LGC-12345678",
        "name": "Tester name",
        "phone": "+998..."
      },
      "platform": "android",
      "distribution_track": "closed",
      "app_version": "2.4.0",
      "version_code": 20400,
      "manufacturer": "Samsung",
      "model": "SM-S918B",
      "os_version": "15",
      "locale": "uz",
      "is_test": true,
      "status": "active",
      "first_seen_at": "2026-10-31T09:00:00Z",
      "last_seen_at": "2026-11-01T12:30:00Z",
      "usage": {
        "date": "2026-11-01",
        "foreground_seconds": 1800,
        "foreground_minutes": 30.0,
        "session_count": 4,
        "first_activity_at": "2026-11-01T08:00:00Z",
        "last_activity_at": "2026-11-01T12:30:00Z",
        "used": true
      }
    }
  ],
  "total": 12,
  "limit": 50,
  "offset": 0,
  "date": "2026-11-01"
}
```

Recommended table columns:

- status indicator;
- tester name and LexGo ID;
- phone model;
- Android version;
- app version;
- Play track;
- minutes on selected date;
- session count;
- first activity;
- last activity;
- last installation contact.

Use a clear gray `Not used` badge when `usage.used` is false. Do not infer usage from `last_seen_at`; use only `usage.used`.

## 4. Installation detail

```http
GET /admin/mobile-testing/installations/{installation_id}?date_from=2026-10-01&date_to=2026-11-01
```

Default period is the latest 30 days. Maximum period is 366 days.

Response contains:

- `installation`: device and current tester metadata;
- `daily[]`: daily seconds, minutes, sessions, first activity, last activity;
- `sessions[]`: up to 500 sessions in the period.

Session statuses:

- `active`: application is currently reporting foreground activity;
- `completed`: mobile sent a background event;
- `stale`: heartbeat stopped and the backend closed the session automatically.

The detail view should contain:

1. Device information card.
2. Current tester card.
3. Daily usage chart.
4. Daily table.
5. Session timeline.
6. Stale-session badge with explanatory tooltip.

Do not expose the installation key; the backend never returns it.

## 5. Release management

### List

```http
GET /admin/mobile-testing/releases
```

### Create

```http
POST /admin/mobile-testing/releases
```

```json
{
  "platform": "android",
  "version_name": "2.4.0",
  "version_code": 20400,
  "distribution_track": "closed",
  "auto_enroll": true,
  "starts_at": "2026-11-01T00:00:00+05:00",
  "ends_at": null
}
```

### Update or close

```http
PATCH /admin/mobile-testing/releases/{release_id}
```

```json
{
  "status": "closed",
  "auto_enroll": false
}
```

Allowed statuses:

- `active`
- `closed`

Allowed tracks:

- `internal`
- `closed`
- `open`

Version code is unique for Android. A duplicate returns HTTP 409 with `mobile_test_release_exists`.

Current test-phase backend can automatically register an observed Android test version. The release page still lets the primary superadmin close auto-enrolment for a version when testing ends.

## 6. Daily Telegram report history

```http
GET /admin/mobile-testing/reports?limit=30&offset=0
```

Response items include:

- report date;
- status;
- first Telegram message ID;
- attempt count;
- sent timestamp;
- created and updated timestamps.

Report statuses may include:

- `pending`
- `sending`
- `sent`
- `failed`

Automatic report time is 23:00 `Asia/Tashkent`. It is sent to the same group and with the same configured report bot as the LexGo task report.

Manual send endpoint:

```http
POST /admin/mobile-testing/reports/{YYYY-MM-DD}/send?force=false
```

Do not show `force=true` as the normal action. Put force resend behind a confirmation dialog because it intentionally creates another Telegram report.

## 7. Realtime updates

Use the existing authenticated WebSocket:

```text
/ws/users/me
```

The backend automatically subscribes the primary superadmin connection to mobile monitoring. The frontend does not send a subscribe message.

Handle these events:

```text
mobile_testing.installation_registered
mobile_testing.usage_updated
mobile_testing.session_stale
mobile_testing.report_sent
```

For installation and usage events, refresh the current dashboard/list with a short debounce of approximately 300–500 ms. Do not add client-side seconds to totals.

The backend remains the only source of totals.

## 8. Date and time rules

- Reporting calendar: `Asia/Tashkent`.
- API timestamps: ISO 8601.
- Display timestamps: convert to `Asia/Tashkent` and label the timezone.
- Dashboard date: use the backend-returned `date`.
- Report time: 23:00 Tashkent time.

## 9. Empty and loading states

### No registered devices

Explain that a test device appears after a tester opens the instrumented Android build and signs in at least once.

### Registered but unused on selected date

Keep the device in the list with zero minutes and a `Not used` badge.

### Realtime disconnected

Show a subtle stale-data indicator and continue to support manual refresh. Reconnect using the existing WebSocket policy.

### API error

Do not render raw JSON. Show a readable error state and retry action.

## 10. Security requirements

- Render this section only for `is_primary_superadmin === true`.
- Never persist tester phone numbers outside normal authenticated frontend storage.
- Never log API response bodies containing tester identity in browser analytics.
- Never request or display the raw installation identifier.
- Do not provide this dashboard to general admin roles.
- Do not send a manual Telegram report during frontend development without explicit approval.

## 11. Acceptance checklist

1. Primary superadmin can open the page.
2. Other roles do not see navigation and receive 403 if they call the API.
3. Date selection updates every card and row.
4. Used and unused filters match backend results.
5. A registered device with no activity remains visible as unused.
6. Device detail shows daily and session history.
7. Realtime activity refreshes the current date without page reload.
8. No client-side duration calculation is used.
9. Release creation, closing, and validation errors are rendered correctly.
10. Report history paginates.
11. Manual resend requires confirmation.
12. All displayed times state or use Tashkent timezone.
13. Raw JSON is never displayed.
14. Mobile installation key is never requested or shown.

## 12. Production backend verification

The production backend has been verified with real HTTP integration flows. Registration, foreground/heartbeat/background, offline batch, duplicate protection, used/unused filters, detail history, superadmin permission, release update, stale-session closure, validation errors, and OpenAPI routes all passed.

No Telegram test report was sent during backend verification.
