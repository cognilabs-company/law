# LexGo role navigation: frontend questions for backend

Date: 2 November 2026
Contract: `docs/LEXGO_ROLE_NAVIGATION_FRONTEND_2026_11_02.md` (backend `d65d607`)

The frontend side of the contract is done. Two things it cannot settle on its own:

## 1. Client complaints read the removed works API

The client's complaints screen (`/portal/client/complaints`, and the Complaints app on the client desktop) lists and opens quality complaints through:

- `GET /clients/me/works?type=quality_complaint`
- `GET /clients/me/works/{ref}`
- `GET /clients/me/works` (to pick which work a new complaint is about)

The contract says a client now gets `403 role_page_access_denied` for `/clients/me/works` and its details. Complaints are not in the client's hidden pages, so this screen would lose its data.

**Question:** Which endpoint should the complaints screen use for the client's complaints and for the works a complaint can be filed against? Or is `type=quality_complaint` still allowed for clients?

## 2. `hidden_routes` and the frontend's own paths

The frontend matches `hidden_routes` exactly as the contract says. Some pages live at other frontend paths than the examples, so the frontend also maps each `hidden_page_ids` entry to its own routes:

| page_id | frontend routes |
|---|---|
| `crm` | `/admin/crm` |
| `duty_services` | `/admin/call-center` (only the console itself), `/portal/call-center`, `/portal/callcenter` |
| `operator_chats` | `/admin/call-center/support`, `/portal/call-center/support` |
| `remote_assistance` | `/admin/remote-assistance` |
| `client_works` | `/portal/client/works` |
| `problem_analysis` | `/portal/client/intake`, `/portal/client/matches` |
| `academy` | `/portal/client/academy` |
| `opportunities` | `/portal/advocate/opportunities` |
| `lawyer_works` | `/portal/advocate/cases`, `/portal/lawyer/cases` |
| `urgent_jobs` | `/portal/advocate/urgent`, `/portal/lawyer/urgent` |
| `lawyer_document_requests` | `/portal/advocate/document-requests`, `/portal/lawyer/document-requests` |
| `organization` | `/portal/advocate/organization`, `/portal/organization` |

**Question:** Please include these frontend paths in `hidden_pages[].routes` / `hidden_routes`, so the backend list alone is complete. Is `/admin/call-center/experience/{id}` (experience review opened from a notification) meant to stay open for `navbatchi_yurist`? The frontend keeps it open.
