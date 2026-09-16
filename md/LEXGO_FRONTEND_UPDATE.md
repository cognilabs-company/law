# LexGo Frontend Update

Backend URL: use deployment-provided value.

## Implement Now

- Registration must use `POST /auth/register/start`, then show confirmation screen, then `POST /auth/register/verify`.
- `demo_otp` is returned by backend for demo until SMS provider is connected.
- Client can select a yurist/advokat and buy service with `POST /orders/demo-purchase`.
- Existing order can be paid with `POST /orders/{order_id}/demo-pay?provider=demo_payme`.
- One-time private chat payment: `POST /payments/demo-private-chat`.
- Plan payment demo: `POST /subscription-plans/{plan_id}/demo-purchase`.
- Generic demo payment can be confirmed with `POST /payments/{payment_id}/demo-confirm`.
- Private chat opens from returned `chat_room`.
- Private chat history: `GET /secure-chats/{room_id}/messages`.
- Private chat realtime: `/ws/secure-chats/{room_id}?token={access_token}`.
- Show `filtered_content`; if `is_blocked=true`, show `block_reason`.
- Admin manual leads: `POST /admin/leads`, `PATCH /admin/leads/{lead_id}`, `DELETE /admin/leads/{lead_id}`.
- Admin dashboard graphs: `GET /admin/dashboard`.

## Demo Flow

1. Register start.
2. Verify code.
3. Select service from `/services`.
4. Select seller from `/lawyers`.
5. Call `/orders/demo-purchase`.
6. Open returned private chat room.

Swagger: `/docs`
