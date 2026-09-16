# LexGo Frontend Integration Update

Backend URL: use the deployment-provided API base URL.

## Registration

`POST /auth/register` now starts phone confirmation and returns:

- `verification_id`
- `phone`
- `expires_at`
- `demo_otp`
- `message`

Show the confirmation screen immediately after this response.

Complete registration with:

`POST /auth/register/verify`

```json
{
  "verification_id": "verification_id",
  "code": "demo_otp"
}
```

The verify response returns `access_token`, `token_type`, and `user`.

`POST /auth/register/start` still works the same way.

`POST /auth/register/direct` is only for internal demo/admin seeding.

## Private Chat Demo Payment

`POST /payments/demo-private-chat`

The backend accepts either field:

```json
{
  "lawyer_user_id": "seller_user_id",
  "seller_user_id": "seller_user_id",
  "amount": 10000,
  "provider": "demo_payme"
}
```

The response contains both `chat_room` and `room` for compatibility.

## Payment Schema

`PaymentOut` includes:

- `target_type`
- `target_id`
- `payment_url`
- `paid_amount`

Use `payment_url` to show the demo Payme/Click screen if needed.

## Verified On Production

- `/health`
- `/openapi.json`
- `/auth/register`
- `/auth/register/verify`
- `/payments/demo-private-chat`
- `/secure-chats/{room_id}/messages`
- `/admin/dashboard`
