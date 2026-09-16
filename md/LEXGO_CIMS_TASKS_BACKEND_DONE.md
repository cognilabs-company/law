# LexGo CIMS Backend Tasks Update

Backend tasks from the Law Marketplace CIMS board were reviewed and implemented where backend support was needed.

## Added Endpoints

- `GET /cases/{case_id}`
- `PATCH /cases/{case_id}`
- `POST /cases/{case_id}/status`
- `GET /lawyers/me/cases`
- `POST /secure-chats/{room_id}/calls`
- `GET /secure-chats/{room_id}/calls`
- `PATCH /calls/{call_id}`
- `GET /workspace/folders`
- `POST /workspace/folders`
- `DELETE /workspace/folders/{folder_id}`
- `GET /workspace/files`
- `POST /workspace/files`
- `DELETE /workspace/files/{file_id}`
- `POST /admin/demo-data/seed`

## Extended Behavior

- `/document-templates` now auto-seeds 3 demo document templates if missing.
- `/ads/products` already auto-seeds promotion packages if missing.
- Registration start, registration verify, direct register, and login now create CRM lead records for call-center visibility.
- Order accept creates a linked case.
- Case status can be updated by the assigned seller or staff with permissions.
- Audio/video call sessions are stored against secure chat rooms.
- Seller workspace folders and file metadata are stored in the database.

## Production Verification

Production backend verified:

- Swagger exposes 97 paths.
- All new endpoint paths are present.
- Demo data seed works.
- 3 document templates are returned.
- Order create and accept creates a case.
- Case detail and status update work.
- Lawyer cases list works.
- Private chat payment works.
- Video call create and end flow works.
- Workspace folder and file create work.
- CRM leads contain registration/login records.

Backend URL: use the deployed API base URL provided by the project owner.
