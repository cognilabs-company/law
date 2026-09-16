# LexGo Frontend Backend Update

Backend has implemented the endpoints requested in `BACKEND_ENDPOINTS_NEEDED.md`.

## New / Extended Endpoints

- `POST /orders/{order_id}/accept`
- `POST /orders/{order_id}/decline`
- `GET /document-templates/{template_id}/file`
- `GET /lawyers/me/stats`
- `GET /lawyers/me/clients`
- `GET /calendar-events`
- `POST /calendar-events`
- `PATCH /calendar-events/{event_id}`
- `DELETE /calendar-events/{event_id}`
- `GET /promotions/me`
- `GET /promotions/analytics`
- `POST /promotions/checkout`
- `POST /gifts`
- `GET /gifts`
- `GET /clients/me`
- `PUT /clients/me`
- `GET /clients/me/payment-methods`
- `POST /clients/me/payment-methods`
- `DELETE /clients/me/payment-methods/{method_id}`
- `GET /clients/me/family-members`
- `POST /clients/me/family-members`
- `DELETE /clients/me/family-members/{member_id}`
- `GET /payments`
- `GET /payments/{payment_id}/receipt`
- `GET /notifications`
- `POST /notifications/{notification_id}/read`
- `POST /notifications/read-all`
- `GET /notifications/unread-count`

## Notes

- `/ads/products` now auto-seeds promotion packages if the table is empty.
- Order accept creates or returns a linked legal case.
- Order decline is soft and per seller.
- Template download returns a PDF file response.
- Gifts, profile cards, family members, calendar events, and promotions persist in the database.
- Swagger now exposes 87 paths.

## Production Verification

Production API tested:

- health check
- OpenAPI path check
- register and verify
- order create, accept, decline
- template PDF download
- seller stats and clients
- calendar create/list
- ads package seed
- promotion checkout/status/analytics
- gift create/list
- client profile update
- payment method create
- family member create
- payments list
- notifications list/read/unread count
