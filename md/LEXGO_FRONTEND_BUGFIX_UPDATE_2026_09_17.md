# LexGo Backend Bugfix Update

Backend productionga chiqarildi: `https://lexgo.api.cognilabs.org`

## 1. Login 2FA oqimi

Agar userda TOTP authenticator yoqilgan bo'lsa, login endi Telegram OTP yubormaydi.

Login response:

```json
{
  "detail": {
    "code": "two_factor_required",
    "method": "totp",
    "verification_id": "...",
    "phone": "+998..."
  }
}
```

Frontend TOTP uchun shu endpointni ishlatsin:

```http
POST /auth/login/2fa
```

Body:

```json
{
  "verification_id": "...",
  "code": "123456"
}
```

`/auth/2fa/verify` login uchun emas, profil ichida 2FA yoqish jarayoni uchun.

## 2. Register OTP block

Register OTP 3 marta noto'g'ri kiritilsa, 15 daqiqa blok bo'ladi.

Blok vaqtida `POST /auth/register/start` endi yangi OTP yaratmaydi va 429 qaytaradi:

```json
{
  "detail": {
    "message": "Kod 3 marta noto'g'ri kiritildi. 15 daqiqadan keyin qayta urinib ko'ring",
    "blocked_until": "...",
    "retry_after": 900
  }
}
```

Frontend:

- Blok vaqtida inputni yopish.
- Countdown ko'rsatish.
- `retry_after` tugagandan keyin register start buttonni qayta chiqarish.
- Register flowda alohida resend button ishlatmaslik.

## 3. Admin register request detail

Yangi endpoint:

```http
GET /admin/register-requests/{request_id}
```

Admin arizani bosganda shu endpointdan detail oching. Response ichida:

- `request`
- `pending`
- `user`
- `lawyer_profile`
- `activity`

`pending` ichida registerda berilgan F.I.O., region, phone, status, attempts, blocked_until bor.

## 4. Advokat/yurist mijoz detail

Yangi endpoint:

```http
GET /lawyers/me/clients/{client_id}
```

Response:

- `client`
- `cases`
- `orders`
- `chats`
- `payments`
- `documents`
- `timeline`

Seller faqat o'zi bilan ishlagan mijoz detailini ko'ra oladi. Begona client ID bo'lsa 404 qaytadi.

## 5. Workspace file download

Workspace file javoblariga `download_url` qo'shildi.

```json
{
  "file_url": "/workspace/files/storage/name.docx",
  "download_url": "https://lexgo.api.cognilabs.org/workspace/files/storage/name.docx"
}
```

Signed URL endpoint ham endi absolute URL qaytaradi:

```http
POST /workspace/files/{file_id}/signed-url
```

Response:

```json
{
  "url": "https://lexgo.api.cognilabs.org/workspace/files/storage/name.docx?token=...",
  "relative_url": "/workspace/files/storage/name.docx?token=..."
}
```

Frontend download/open uchun `url` yoki `download_url` ishlatsin. Vercel frontend domainiga qo'shib yubormang.

## 6. Profile 2FA holati

`GET /auth/me` endi Telegram ulangan userda ham:

```json
{
  "two_factor_enabled": true,
  "two_factor_method": "telegram"
}
```

TOTP yoqilgan bo'lsa:

```json
{
  "two_factor_enabled": true,
  "two_factor_method": "totp"
}
```

Frontend profil ichida shu fieldlarga qarab holat ko'rsatsin.

## 7. Audit log Uzbek fields

`GET /users/me/activity` va `GET /admin/audit-trail` javoblariga qo'shildi:

```json
{
  "title_uz": "Fayl yuklandi",
  "description_uz": "Fayl yuklandi. test.docx. Obyekt: workspace_file"
}
```

Frontend audit jurnalida oddiy user uchun `title_uz` va `description_uz` ko'rsatsin.

## 8. Referral link

`GET /referrals/me` endi register sahifaga link beradi:

```json
{
  "link": "https://law-two-tau.vercel.app/uz/register?ref=CODE",
  "register_url": "https://law-two-tau.vercel.app/uz/register?ref=CODE",
  "landing_url": "https://law-two-tau.vercel.app/?ref=CODE"
}
```

Frontend login/register navigatsiyada `ref` query parametrini yo'qotmasligi kerak.

## Backend test natijalari

Production container ichida test qilindi:

- TOTP login: 428 `method=totp`, keyin `/auth/login/2fa` 200.
- Register OTP 3 xato: keyingi register start 429.
- Admin register request detail: 200.
- Seller client detail: 200, begona client: 404.
- Workspace signed URL: backend absolute URL qaytdi.
- Workspace file list: `download_url` qaytdi.
- Activity audit: `title_uz` va `description_uz` qaytdi.
- Referral: `/uz/register?ref=` link qaytdi.
