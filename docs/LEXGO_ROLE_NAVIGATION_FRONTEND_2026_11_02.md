# LexGo Role Navigation and Access Contract

Date: 2 November 2026  
Backend commit: `d65d607`  
Production API: `https://lexgo.api.cognilabs.org`

## Result

The backend now owns a single role-navigation policy. The frontend must no longer infer these page removals from broad permissions such as `orders.manage` or `callcenter.access`.

Use `GET /me/navigation` after authentication and whenever the authenticated account or assigned role changes.

## Navigation endpoint

### Request

```http
GET /me/navigation
Authorization: Bearer <access_token>
```

### Response shape

```json
{
  "policy_version": "2026-11-02.1",
  "role_profile": "navbatchi_yurist",
  "hidden_page_ids": [
    "crm",
    "duty_services",
    "operator_chats",
    "remote_assistance"
  ],
  "hidden_pages": [
    {
      "page_id": "crm",
      "title": "CRM",
      "routes": ["/crm", "/admin/crm", "/portal/call-center/crm"]
    }
  ],
  "hidden_routes": ["/crm", "/admin/crm", "/portal/call-center/crm"],
  "default_route": "/portal/lawyer",
  "direct_navigation_denied": true
}
```

`hidden_pages` and `hidden_routes` contain the complete current values. Do not duplicate the list in frontend constants unless it is used only as a temporary loading fallback.

## Pages removed by role

### `navbatchi_yurist`

Hide and block:

- `crm` — CRM
- `duty_services` — Navbatchi xizmat
- `operator_chats` — Operator chatlari
- `remote_assistance` — Masofaviy yordam

The backend also removes `callcenter.access`, every `crm.*` permission and every `remote_assist.*` permission from users assigned to the `call_center_lawyer` role. This does not affect real call-center operators.

### `client`

Hide and block:

- `client_works` — Mening ishlarim
- `problem_analysis` — Muammo tahlili
- `academy` — Akademiya

The client's document archive, marketplace, services and other remaining pages are unchanged.

### `advokat`

Hide and block:

- `opportunities` — Imkoniyatlar
- `lawyer_works` — Mening ishlarim
- `urgent_jobs` — Tezkor ishlar
- `lawyer_document_requests` — Hujjat so‘rovlari
- `organization` — Tashkilot

An organization owner is not treated as a plain advocate for the organization page. Do not hide organization management from an account whose returned `role_profile` is not `advokat`.

## Required frontend behavior

1. Load `GET /me/navigation` immediately after login and keep the result in authenticated application state.
2. Remove every navigation item whose page ID exists in `hidden_page_ids`.
3. Before rendering a protected route, match its pathname against every prefix in `hidden_routes`.
4. A route matches when it equals the prefix or starts with `prefix + "/"`.
5. If matched, replace the route with `default_route`; do not briefly render the blocked page.
6. Apply the same check to command palette entries, dashboard shortcuts, mobile drawer links, breadcrumbs, deep links and AI navigation actions.
7. Do not use only CSS hiding. The component and its data queries must not mount.
8. Clear cached navigation policy on logout and refetch it after role/account switching.

Suggested route guard logic:

```ts
const isHiddenRoute = (pathname: string, hiddenRoutes: string[]) =>
  hiddenRoutes.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
```

## Backend denial response

Dedicated APIs belonging to removed pages are protected server-side. Direct access returns:

```http
HTTP/1.1 403 Forbidden
```

```json
{
  "detail": {
    "code": "role_page_access_denied",
    "message": "Bu bo'lim sizning rolingiz uchun yopilgan",
    "page_id": "crm",
    "role_profile": "navbatchi_yurist",
    "default_route": "/portal/lawyer",
    "navigation_url": "/me/navigation"
  }
}
```

Add one global API interceptor for `detail.code === "role_page_access_denied"`:

- cancel page-specific retries;
- invalidate/refetch `/me/navigation` if its `policy_version` is stale or unavailable;
- navigate with `replace` to `detail.default_route`;
- show a short informational toast, not a destructive error dialog.

## Protected API examples

The following examples are intentionally denied for the specified role:

- Navbatchi yurist: `/crm/*`, `/call-center/support/*`, `/urgent-advokat/requests/assigned`, remote-assistance endpoints.
- Client: `/clients/me/works` and its details.
- Plain advocate: `/lawyers/me/cases`, `/lawyers/me/document-requests/*`, `/urgent-advokat/requests/assigned`, `/organizations/*`.

Shared APIs were not deleted. For example, public service catalog data remains available because other active pages still need it.

## AI navigation

`GET /api/ai/pages` and `GET /api/ai/capabilities` now use the same role policy. Hidden pages are not returned to the AI instructor, so it must not suggest or navigate to removed pages. Frontend must still apply the route guard before executing any AI-provided navigation action.

## Loading and failure behavior

- While `/me/navigation` is loading, render a neutral shell and do not render role-sensitive navigation.
- On `401`, follow the existing refresh/logout flow.
- On a temporary network failure, use the last policy cached for the same authenticated user ID only. Never reuse another user's policy.
- If no safe cached policy exists, show the default dashboard without role-sensitive shortcuts and retry the endpoint.

## Production verification completed

The backend was deployed and verified on the production server after a source and database backup.

- 18 API-level role checks passed.
- Navbatchi yurist receives 403 for CRM, operator support tickets and assigned urgent work.
- Client receives 403 for My Works while the service catalog remains available.
- Plain advocate receives 403 for cases/My Works, document requests, urgent jobs and organizations.
- Real call-center operator still receives 200 for CRM and operator support tickets.
- AI page lists no longer expose removed pages.
- OpenAPI generation and server-side Python compilation passed.
