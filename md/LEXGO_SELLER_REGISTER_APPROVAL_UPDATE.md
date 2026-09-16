# LexGo Seller Registration Approval Update

Seller registration is now approval-based.

## Client Registration

`POST /auth/register`

`POST /auth/register/verify`

For `role: "client"`, verify returns normal auth:

- `access_token`
- `token_type`
- `user`

## Seller Registration

Seller roles:

- `yurist`
- `advokat`
- `advokat_tashkiloti`

For these roles, `POST /auth/register/verify` does not create a login-ready account. It returns:

```json
{
  "request_id": "request_id",
  "verification_id": "verification_id",
  "status": "pending",
  "role": "advokat",
  "phone": "+998901234567",
  "name": "Ali Valiyev",
  "message": "Ro'yxatdan o'tish so'rovi adminga yuborildi"
}
```

Show a pending review screen. Login must not work before admin approval.

## Admin Review

List pending seller registration requests:

`GET /admin/register-requests?status=pending`

Accept:

`POST /admin/register-requests/{request_id}/accept`

Reject:

`POST /admin/register-requests/{request_id}/reject`

Accepted request creates:

- user account
- seller profile
- verified seller status

Rejected request does not create an account.

## Seller Profile

After approval and login:

- `GET /lawyers/me`
- `PUT /lawyers/me`

## Important

`POST /auth/register/direct` now rejects seller roles. It is only for internal client/admin demo seeding.

Production verified:

- seller verify returns pending request and no token
- seller cannot login before approval
- admin can see request
- admin accept creates account/profile
- seller can login after approval
- seller profile returns `verification_status: "approved"` and `is_verified: true`
