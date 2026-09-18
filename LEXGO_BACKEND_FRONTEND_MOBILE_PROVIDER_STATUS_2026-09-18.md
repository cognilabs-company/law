# LexGo Backend / Frontend / Mobile / Provider Status

Sana: 2026-09-18  
Project: LexGo Law Marketplace  
Production API: https://lexgo.api.cognilabs.org

## Qisqa Xulosa

Hujjatlardan chiqqan umumiy tasklar soni: 107 ta atrofida. Batafsil task heading sifatida ajratilganlari: 101 ta.

Backend tarafda hozir taxminan 70-75 ta task yopilgan yoki backend API/model/logika darajasida yetarli holatga keltirilgan. Qolganlari uch guruhga bo'linadi:

- backendda qisman bor, lekin production-level to'liq avtomatika yoki E2E test kerak;
- frontend/mobile taraf ulashi yoki UI talab qiladigan tasklar;
- tashqi provider, shartnoma yoki real credential talab qiladigan tasklar.

Bugun productionda qo'shimcha yopilgan muhim ishlar:

- WebSocket `/ws/users/me` DB connectionni uzoq ushlab turmaydigan qilindi.
- Postgres pool sozlamalari kuchaytirildi.
- TOTP yoqilgan user login qilganda Telegram OTP emas, faqat authenticator kodi talab qilinadigan qilindi.
- Telegram OTP xabarida telefon/login va kod birga yuboriladigan bo'ldi.
- Telegram OTP xabariga `Copy Code` tugmasi qo'shildi.
- `/docs` va `/openapi.json` productionda yopiq ekani qayta test qilindi.
- Demo endpointlar productionda 404 qaytarishi tekshirildi.
- Advokat/yurist uchun ish vaqti API qo'shildi:
  - `GET /lawyers/me/availability`
  - `PUT /lawyers/me/availability`
- Default ish vaqti: Dushanba-Shanba 09:00-19:00, Yakshanba yopiq.
- Javob deadline defaultlari: manual 30 daqiqa, auto 15 daqiqa, SOS 5 daqiqa.

## Production Test Natijalari

- `GET /health` -> 200 OK
- `GET /docs` -> 404
- `GET /openapi.json` -> 404
- `POST /orders/demo-purchase` -> 404 productionda yopiq
- TOTP login:
  - `POST /auth/login` -> 428, method `totp`
  - `POST /auth/login/2fa` -> 200
- `WS /ws/users/me` -> `ping` yuborilganda `pong` qaytdi
- `GET /lawyers/me/availability` -> 200, `source=default`
- `PUT /lawyers/me/availability` -> 200
- keyingi `GET /lawyers/me/availability` -> 200, `source=custom`
- Server container ichida compile test o'tdi
- Postgres `idle in transaction` qolmadi

## Backend Tarafdan Yopilgan Tasklar

Quyidagi tasklar backend API, model, service yoki production configuration darajasida yopilgan deb hisoblanadi. Ayrimlari frontend ulanishidan keyin E2E tekshiruv talab qiladi, lekin backend tomoni mavjud.

### T0 Blok

#### T0-01 - Muhitlarni ajratish

Backend holati: yopilgan.

Qilinganlar:

- `APP_ENV` mavjud.
- `DEMO_MODE` mavjud.
- Productionda `DEMO_MODE=false`.
- Demo endpointlar productionda 404 qaytaradi.
- Productionda `docs/openapi` public emas.

Tekshirish:

- `GET /docs` productionda 404 bo'lishi kerak.
- `GET /openapi.json` productionda 404 bo'lishi kerak.
- `POST /orders/demo-purchase` productionda 404 bo'lishi kerak.

#### T0-02 - OTP demo_otpni olib tashlash va qoidalar

Backend holati: yopilgan.

Qilinganlar:

- API response ichida `demo_otp` qaytmaydi.
- OTP Telegram orqali yuboriladi.
- OTP muddati 2 daqiqa.
- Xato urinishlar bloklanadi.
- Kunlik OTP limiti bor.
- Telefon raqam OTP xabarida ko'rsatiladi.
- Telegram OTP message o'zbek tilida.

Tekshirish:

- Register yoki login OTP response ichida kod ko'rinmasligi kerak.
- Telegram bot xabarida `Login: +998...` va `Kod: 123456` ko'rinishi kerak.

#### T0-03 - openapi.json va /docsni yopish

Backend holati: yopilgan.

Qilinganlar:

- Productionda `/docs` yopiq.
- Productionda `/openapi.json` yopiq.
- Superadmin uchun alohida `/admin/openapi.json` bor.

Tekshirish:

- Public `/docs` -> 404.
- Public `/openapi.json` -> 404.

#### T0-04 - Parol tiklash

Backend holati: yopilgan.

Endpointlar:

- `POST /auth/password/forgot`
- `POST /auth/password/reset`

Qilinganlar:

- Telefon bo'yicha OTP yuborish.
- OTP bilan yangi password o'rnatish.
- 5 ta / 15 daqiqa limit mavjud.

Frontend kerak:

- Login sahifasida "Parolni unutdingizmi" flow ulanishi kerak.

#### T0-05 - 2FA va sessiya muddatlari

Backend holati: yopilgan.

Endpointlar:

- `POST /auth/2fa/start`
- `POST /auth/2fa/verify`
- `POST /auth/2fa/totp/setup`
- `POST /auth/2fa/totp/enable`
- `DELETE /auth/2fa`
- `POST /auth/login/2fa`

Qilinganlar:

- Telegram OTP 2FA mavjud.
- TOTP QR setup mavjud.
- Google Authenticator yoki boshqa TOTP app bilan 6 xonali kod ishlaydi.
- TOTP yoqilgan account login qilganda Telegram OTP emas, TOTP so'raladi.
- Admin/manager session inactivity: 2 soat.
- Operator/yurist/advokat inactivity: 8 soat.

Frontend kerak:

- Login 2FA uchun `/auth/login/2fa` ishlatilishi kerak.
- `/auth/2fa/verify` login uchun emas, profile ichidagi 2FA enable flow uchun.

#### T0-06 - Rollar va ruxsatlar matritsasi

Backend holati: yopilgan.

Qilinganlar:

- Role/permission model bor.
- Dynamic role create bor.
- Permission assign bor.
- `superadmin`, `admin`, `manager`, `call_center_lawyer`, `sales_operator`, `client`, `advokat`, `yurist`, `advokat_tashkiloti` va qo'shimcha staff rolelar mavjud.

Endpointlar:

- `GET /admin/permissions`
- `GET /admin/roles`
- `GET /admin/permission-matrix`
- `POST /admin/roles`
- `POST /admin/users/assign-role`

Frontend kerak:

- Role UI’da permission checkbox/grid sifatida chiqarish.

#### T0-07 - Test-ma'lumotlar to'plami

Backend holati: qisman yopilgan.

Bor:

- Demo seed endpoint mavjud.
- Katalog seed mavjud.
- Subscription canonical sync mavjud.

Yopilishi kerak:

- GM doc talab qilgan final canonical fixture formatini bitta standart seedga jamlash.
- Tasodifiy eski test yozuvlarini alohida cleanup qilish.

#### T0-08 - Bildirishnoma servisi va kaskad

Backend holati: qisman yopilgan.

Bor:

- In-app notification.
- Telegram notification.
- Queue fallback.
- Notification preferences.
- Meeting invite va secure chat eventlar.

Endpointlar:

- `GET /notifications`
- `POST /notifications/{id}/read`
- `POST /notifications/read-all`
- `GET /notifications/unread-count`
- `GET /notifications/preferences`
- `PUT /notifications/preferences`

Yopilishi kerak:

- Real SMS provider.
- Real email provider.
- Real push provider.
- Background retry worker.

#### T0-09 - To'lov abstraksiyasi

Backend holati: yopilgan, real provider qismi external.

Bor:

- `PaymentProvider` interface.
- Demo provider.
- Payme adapter placeholder.
- Click adapter placeholder.
- Payment webhooks endpoint.
- Payment split endpoint.

Endpointlar:

- `POST /payments`
- `POST /payments/webhook/{provider}`
- `GET /payments`
- `GET /payments/{id}/receipt`
- `GET /payments/{id}/split`

External:

- Payme real checkout URL/secret kerak.
- Click real checkout URL/secret kerak.

#### T0-10 - Identifikatsiya abstraksiyasi

Backend holati: qisman yopilgan.

Bor:

- IdentityProvider abstraction.
- OneID provider placeholder.
- MyID provider placeholder.
- `identity_verified`, `identity_provider` fields.

Endpointlar:

- `POST /identity/start`
- `GET /identity/me`

External:

- OneID/MyID real credential kerak.

#### T0-11 - Audit trail append-only

Backend holati: yopilgan.

Bor:

- `UserActivity`.
- Hash chain.
- Append-only DB trigger.
- Activity yozuvlari ko'p asosiy actionlarda bor.
- Audit trail endpoint.

Endpoint:

- `GET /admin/audit-trail`

#### T0-12 - Console/network xatolar auditi

Backend holati: qisman.

Backend tomoni:

- Security events bor.
- Health/readiness endpointlar bor.
- Compile va production smoke testlar o'tkazildi.

Frontend kerak:

- Browser console/network testlar frontend tarafdan ham bajarilishi kerak.

#### T0-14 - integrations/statusni real qilish

Backend holati: yopilgan.

Endpoint:

- `GET /integrations/status`

Bor:

- Database health.
- Telegram health.
- LiveKit health.
- File storage health.
- Payment/identity provider configured/not_configured.

#### T0-15 - Telegram bot

Backend holati: yopilgan.

Bor:

- Register OTP bot link.
- Telegram account linking.
- Telegram inbound lead creation.
- OTP xabarida login va kod.
- Inline `Copy Code`.

Endpointlar:

- `POST /telegram/register-otp/webhook`
- `POST /telegram/link/start`

#### T0-16 - Pul hisobi tiyinda

Backend holati: yopilgan.

Bor:

- `amount_tiyin`
- `paid_amount_tiyin`
- `price_tiyin`
- Subscription price tiyin fields.
- Runtime migration va sync.

#### T0-17 - PII maskalash

Backend holati: yopilgan.

Bor:

- AI oldidan PII maskalash.
- Seller AI promptda maskalash.

#### T0-18 - Huquqiy hujjatlar va roziliklar jurnali

Backend holati: yopilgan.

Endpointlar:

- `GET /legal/consents`
- `GET /legal/consents/me`
- `POST /legal/consents/{id}/accept`
- `GET /admin/legal/consents`
- `GET /admin/legal/user-consents`

#### T0-19 - Production hosting

Backend holati: qisman yopilgan.

Bor:

- Production server bor.
- Domain bor.
- SSL bor.
- Docker deploy bor.
- Nginx proxy bor.

Qolgan:

- Formal hosting/data residency document kerak.
- Monitoring/backup runbook kerak.

#### T0-20 - Ish vaqti kalendari servisi

Backend holati: yopilgan.

Endpointlar:

- `GET /calendar/business-hours`
- `POST /admin/calendar/holidays`
- `DELETE /admin/calendar/holidays/{day}`
- `POST /calendar/deadline-calculator`
- `GET /lawyers/me/availability`
- `PUT /lawyers/me/availability`

Bor:

- Platform business calendar.
- Holiday management.
- Seller availability default/custom.
- Manual/auto/SOS response deadline.

### T1 / T1A Blok

#### T1-01 - Ro'yxatdan o'tish formasi

Backend holati: yopilgan.

Bor:

- Register start/verify.
- Ism, familiya, otasining ismi.
- Telefon.
- Password.
- Role.
- Region.
- Seller account pendingga tushadi.
- Seller pending holatda login qila oladi, lekin imkoniyatlari cheklangan.

Endpointlar:

- `POST /auth/register`
- `POST /auth/register/start`
- `POST /auth/register/verify`
- `GET /admin/register-requests`
- `GET /admin/register-requests/{id}`
- `POST /admin/register-requests/{id}/accept`
- `POST /admin/register-requests/{id}/reject`

#### T1-02 - LexGo.AI bepul limitlar

Backend holati: yopilgan.

Bor:

- Guest AI limit.
- User AI monthly/free limit.
- Subscription bo'lsa quota logic.

#### T1-03 - LexGo.AI obunasi

Backend holati: qisman yopilgan.

Bor:

- Subscription plans.
- Entitlements.
- AI quota plan bo'yicha.

Qolgan:

- Full commercial AI tariff lifecycle frontend/payment bilan E2E.

#### T1-04 - AI korpusi, RAG va disclaimer

Backend holati: qisman yopilgan.

Bor:

- AI legal corpus endpoint.
- Official source search/fetch tools.
- Disclaimer.
- PII masking.

Qolgan:

- Full indexed RAG corpus pipeline.

#### T1-05 - AI tasnif va 3 darajali advokat taklifi

Backend holati: yopilgan.

Endpointlar:

- `POST /ai/classify`
- `GET /matching/candidates`
- `POST /matching/preview`

#### T1-06 - Katalog

Backend holati: yopilgan.

Endpointlar:

- `GET /service-categories`
- `GET /services`
- `GET /services/search`
- `GET /services/{id}/passport`
- `POST /admin/service-categories`
- `POST /admin/services`
- `PATCH /admin/services/{id}`
- `DELETE /admin/services/{id}`

#### T1-07 - Xizmat pasporti

Backend holati: yopilgan.

Endpoint:

- `GET /services/{id}/passport`

#### T1-08 - Pricing engine

Backend holati: yopilgan.

Endpointlar:

- `GET /pricing/quote`
- `POST /admin/service-packages/price-simulator`

#### T1-09 - Advokat saralash

Backend holati: yopilgan.

Endpointlar:

- `GET /matching/candidates`
- `POST /matching/preview`
- `POST /matching/orders/{order_id}/assign-next`

#### T1-10 - Buyurtma oqimi

Backend holati: qisman yopilgan.

Bor:

- Order statuses.
- Status transitions.
- Accept/decline.
- Payment policy.
- Milestones.
- Contact unlock logic.

Qolgan:

- Timer/escalation worker to'liq avtomatik bo'lishi kerak.

#### T1A-01 - Milestone va to'lov chiqarish

Backend holati: qisman yopilgan.

Bor:

- Milestone list.
- Milestone pay.
- Mark paid.
- Release.

Qolgan:

- Real provider + dispute/release E2E.

#### T1A-02 - Advokat onboarding

Backend holati: yopilgan.

Endpointlar:

- `POST /seller-onboarding`
- `GET /seller-onboarding`
- `GET /seller-onboarding/progress`
- `POST /seller-onboarding/submit`
- `POST /seller-onboarding/documents`

#### T1A-03 - Organizations

Backend holati: yopilgan.

Endpointlar:

- `POST /organizations`
- `GET /organizations`
- `POST /organizations/{id}/members`
- `GET /organizations/{id}/members`

#### T1-11 - Advokat/yurist kabineti

Backend holati: yopilgan.

Endpointlar:

- `GET /lawyers/me/cabinet`
- `GET /seller/me/cabinet`
- `GET /lawyers/me/stats`
- `GET /lawyers/me/clients`
- `GET /lawyers/me/clients/{client_id}`

#### T1-12 - Kol-markaz navbati

Backend holati: yopilgan.

Endpointlar:

- `GET /call-center/queue`
- `GET /call-center/clients/search`
- `GET /call-center/clients/{id}`
- `POST /call-center/calls`
- `GET /call-center/calls`

#### T1-13 - Mening ishlarim, to'lovlar, cheklar

Backend holati: yopilgan.

Endpointlar:

- `GET /cases`
- `GET /orders`
- `GET /payments`
- `GET /payments/{id}/receipt`
- `GET /payments/{id}/receipt/verify`

#### T1-14 - Onlayn xizmatlar: shablon -> hujjat

Backend holati: yopilgan.

Endpointlar:

- `GET /document-templates`
- `POST /document-requests`
- `PUT /document-requests/{id}/answers`
- `POST /document-requests/{id}/payments`
- `POST /document-requests/{id}/generate`
- `GET /document-requests/{id}/file`

#### T1-15 - Hujjat tahlili

Backend holati: yopilgan.

Endpointlar:

- `POST /ai/document-analysis`
- `POST /ai/document-analysis/quote`
- `POST /ai/document-analysis/file`

#### T1-16 - Baholash va advokat javobi

Backend holati: yopilgan.

Endpointlar:

- `GET /reviews/pending`
- `POST /reviews`
- `GET /reviews/me`
- `GET /admin/reviews`
- `PATCH /admin/reviews/{id}/moderate`

#### T1-17 - Bildirishnomalarni oqimga ulash

Backend holati: qisman yopilgan.

Bor:

- Notification records.
- In-app.
- Telegram.
- Unread count.
- Secure chat/call events.

Qolgan:

- Real push/SMS/email provider.
- Retry worker.

#### T1A-04 - Mijoz-advokat shartnomasi

Backend holati: yopilgan.

Bor:

- Contract records.
- PDF file.
- Signature start/verify.
- Verify endpoint.

#### T1A-05 - Lid qabul qilish

Backend holati: yopilgan.

Endpointlar:

- `POST /leads`
- `GET /admin/leads`
- `POST /admin/leads`
- `GET /admin/leads/kanban`
- `PATCH /admin/leads/{id}/move`
- `GET /call-center/leads/kanban`
- `PATCH /call-center/leads/{id}/move`

#### T1A-06 - Advokatni almashtirish

Backend holati: yopilgan.

Endpointlar:

- `POST /replacement-requests`
- `GET /replacement-requests`
- `GET /replacement-requests/me`
- `GET /replacement-requests/{id}/history`

#### T1A-07 - Aylanib o'tishga qarshi choralar

Backend holati: yopilgan.

Bor:

- Secure chat contact filtering.
- Phone/link/telegram blocking.
- Reveal request/approve flow.

Endpointlar:

- `POST /secure-chats/{id}/content-reveal/request`
- `POST /secure-chats/{id}/content-reveal/approve`
- `GET /secure-chats/{id}/content-reveal/status`

#### T1A-08 - Referal maydonlari

Backend holati: yopilgan.

Endpointlar:

- `GET /referrals/me`
- `GET /referrals/{code}/qr`

### T1B Blok

#### T1B-01 - Paketlar modeli va sotuv oqimi

Backend holati: yopilgan.

Endpointlar:

- `GET /service-packages`
- `POST /service-packages/proposals`
- `POST /promotions/checkout`

#### T1B-02 - Paketlar konstruktori

Backend holati: backend API yopilgan, frontend UI kerak.

Endpointlar:

- `GET /admin/service-packages`
- `POST /admin/service-packages`
- `PATCH /admin/service-packages/{id}`
- `POST /admin/service-packages/{id}/submit`
- `POST /admin/service-packages/{id}/approve`
- `POST /admin/service-packages/{id}/publish`
- `POST /admin/service-packages/{id}/preview`

#### T1B-03 - Keys papkasi va hujjatlar

Backend holati: yopilgan.

Endpointlar:

- `GET /workspace/folders`
- `POST /workspace/folders`
- `GET /workspace/files`
- `POST /workspace/files/upload`
- `GET /workspace/files/storage/{stored_name}`
- `POST /workspace/files/{id}/signed-url`
- `GET /workspace/files/{id}/versions`
- `POST /workspace/files/{id}/versions`
- `GET /workspace/files/{id}/comments`
- `POST /workspace/files/{id}/comments`

#### T1B-04 - Kalendar va muddatlar

Backend holati: yopilgan.

Endpointlar:

- `GET /calendar-events`
- `POST /calendar-events`
- `PATCH /calendar-events/{id}`
- `DELETE /calendar-events/{id}`
- `POST /calendar-events/{id}/reminders/cascade`
- `GET /calendar-events/{id}/ical`

#### T1B-05 - Conflict check va mijozlar bazasi

Backend holati: yopilgan.

Endpointlar:

- `POST /conflicts/check`
- `GET /lawyers/me/clients`
- `GET /lawyers/me/clients/{client_id}`
- `POST /lawyers/me/clients`

#### T1B-06 - AI ish vositalari

Backend holati: yopilgan.

Endpointlar:

- `POST /ai/assistant`
- `POST /ai/cases/{case_id}/tools`

#### T1B-07 - B2B minimal

Backend holati: yopilgan.

Endpointlar:

- `GET /b2b/clients`
- `POST /b2b/clients`
- `PATCH /b2b/clients/{id}`
- `GET /b2b/clients/{id}/timeline`
- `GET /b2b/pipeline`
- `GET /b2b/tasks`
- `POST /b2b/clients/{id}/invoice`
- `POST /b2b/clients/{id}/contract`
- `GET /b2b/clients/{id}/monthly-report`

#### T1B-08 - SOS

Backend holati: yopilgan.

Endpointlar:

- `POST /sos`
- `PATCH /sos/{id}`
- `POST /sos/{id}/route`

#### T1B-09 - Shablon konstruktori

Backend holati: yopilgan.

Endpointlar:

- `POST /admin/document-templates/import-docx`
- `POST /admin/document-templates/import-zip`
- `POST /admin/document-templates/preview`
- `POST /admin/document-templates`
- `PATCH /admin/document-templates/{id}`
- `DELETE /admin/document-templates/{id}`

### T2 Blok

#### T2-01 - Dashboard va balans

Backend holati: yopilgan.

Endpointlar:

- `GET /lawyers/me/stats`
- `GET /payouts/me`
- `GET /payments`

#### T2-02 - Xizmatlar va narx sozlash

Backend holati: yopilgan.

Endpointlar:

- `GET /lawyers/me/services`
- `PUT /lawyers/me/services`

#### T2-03 - Profil, verifikatsiya, g'alaba statistikasi

Backend holati: yopilgan.

Endpointlar:

- `GET /lawyers/me`
- `PUT /lawyers/me`
- `POST /lawyers/me/verifications`
- `POST /admin/lawyers/{id}/verify`

Bor:

- `total_cases`
- `wins_count`
- `partial_wins_count`
- `success_rate`

#### T2-04 - Statistika va reyting

Backend holati: yopilgan.

Bor:

- Profile views.
- Search appearances.
- Clicks.
- Rating/reviews.
- Response rate.

#### T2-06 - Payout / hisob-kitob

Backend holati: qisman yopilgan.

Endpointlar:

- `GET /payouts/me`
- `GET /admin/payouts`
- `PATCH /admin/payouts/{id}`
- `GET /payments/reconciliation`

Qolgan:

- Real bank payout integration.

#### T2-08 - Referal to'liq modul

Backend holati: yopilgan.

Bor:

- Referral link.
- QR.
- Joined count.
- 5 referral discount unlock logic.
- 5% discount metadata.

#### T2-09 - Audio/video qo'ng'iroq

Backend holati: qisman yopilgan.

Bor:

- LiveKit call session.
- Multi participant.
- Invite.
- Join token.
- WebSocket call events.
- Mute/camera/screen eventlar.

Qolgan:

- AI meeting transcript/summary full automation.

#### T2-10 - Rad etish sabablari

Backend holati: yopilgan.

Bor:

- Order decline reason.
- Status history.

#### T2-11 - Yurist cheklovlari

Backend holati: yopilgan.

Bor:

- Yurist va advokat role ajratilgan.
- Yurist uchun advokat_required service cheklovlari mavjud.

### T3 Blok

#### T3-01 - Advokat tekshiruv workflow

Backend holati: yopilgan.

Bor:

- Register requests.
- Seller verification.
- Admin accept/reject.
- Pending seller login.

#### T3-02 - Katalog va passport import/export

Backend holati: qisman.

Bor:

- Admin CRUD.
- Search.
- Passport.

Qolgan:

- Full Excel import/export flow alohida mustahkamlanishi kerak.

#### T3-03 - Narx qoidalari boshqaruvi

Backend holati: yopilgan.

Bor:

- Pricing quote.
- Platform policies.
- Package price simulator.

#### T3-05 - Obuna konstruktori

Backend holati: yopilgan.

Endpointlar:

- `POST /admin/subscription-plans`
- `GET /subscription-plans`

#### T3-06 - Nizolar, refund, almashtirish, kafolat

Backend holati: yopilgan.

Endpointlar:

- `POST /refund-requests`
- `GET /refund-requests`
- `POST /replacement-requests`
- `GET /replacement-requests`
- `POST /complaints`
- `GET /complaints`
- `GET /admin/complaints`
- `POST /warranty/claims`
- `GET /warranty/claims`

#### T3-07 - Rollar va ruxsatlar UI

Backend holati: API yopilgan, frontend UI kerak.

Endpointlar:

- `GET /admin/permissions`
- `GET /admin/roles`
- `POST /admin/roles`
- `POST /admin/users/assign-role`

#### T3-08 - KPI paneli

Backend holati: yopilgan.

Endpointlar:

- `GET /analytics/ceo`
- `GET /analytics/gifts`
- `GET /analytics/channels-attribution`
- `GET /analytics/revenue-trend`
- `GET /admin/dashboard`

#### T3-09 - Sharhlar moderatsiyasi

Backend holati: yopilgan.

Endpointlar:

- `GET /admin/reviews`
- `PATCH /admin/reviews/{id}/moderate`

#### T3-10 - Audit trail ko'rinishi

Backend holati: yopilgan.

Endpoint:

- `GET /admin/audit-trail`

#### T3-11 - Integratsiyalar sahifasi

Backend holati: yopilgan.

Endpoint:

- `GET /integrations/status`

#### T3-12 - Reyting batch

Backend holati: qisman.

Bor:

- Review/rating data.
- Lawyer profile rating fields.

Qolgan:

- Scheduled batch recalculation job.

#### T3-13 - Reestr bilan yarimavtomatik qayta tekshiruv

Backend holati: qisman.

Bor:

- Verification workflow.
- Identity abstraction.

Qolgan:

- Real reestr/OneID/MyID integration.

#### T3-14 - Paket va obuna analitikasi

Backend holati: yopilgan.

Endpointlar:

- `GET /analytics/ceo`
- `GET /analytics/gifts`
- `GET /admin/dashboard`

### T4 Blok

#### T4-01 - Navbatchi yurist ish stoli va smena

Backend holati: qisman.

Bor:

- Call-center queue.
- SOS route.
- Calendar/availability.

Qolgan:

- Full shift scheduling UI va scheduling worker.

#### T4-02 - Operator ish stoli

Backend holati: yopilgan.

Endpointlar:

- `GET /call-center/queue`
- `GET /call-center/clients/search`
- `GET /call-center/clients/{id}`
- `GET /call-center/leads/kanban`

#### T4-03 - Skriptlar va namunaviy javoblar

Backend holati: qisman.

Bor:

- Marketplace record based modules orqali saqlash imkoniyati.

Qolgan:

- Maxsus script CRUD endpointlarini ajratish foydali bo'ladi.

#### T4-04 - IP-telefoniya

Backend holati: external/qisman.

Bor:

- Manual call log.
- Call analytics.

Qolgan:

- Real IP telephony provider.

#### T4-05 - Lid skoringi

Backend holati: yopilgan.

Bor:

- Lead score.
- Hot/warm/cold.
- Kanban.
- Re-engage.

#### T4-06 - Upsell / qayta sotuv

Backend holati: yopilgan.

Endpointlar:

- `POST /upsell/offers`
- `GET /upsell/offers`
- `POST /upsell/offers/{id}/purchase`

#### T4-07 - Vaqt tarifli konsultatsiya

Backend holati: qisman.

Bor:

- Calls.
- Payments.
- Calendar.

Qolgan:

- Full timed billing automation.

#### T4-08 - To'liq B2B CRM

Backend holati: yopilgan.

Endpointlar:

- `GET /b2b/clients`
- `POST /b2b/clients`
- `PATCH /b2b/clients/{id}`
- `GET /b2b/pipeline`
- `GET /b2b/tasks`

### T5 Blok

#### T5-01 - Obuna tariflari va entitlements

Backend holati: yopilgan.

Endpointlar:

- `GET /subscription-plans`
- `GET /clients/me/entitlements`

#### T5-02 - Oila a'zolari

Backend holati: yopilgan.

Endpointlar:

- `GET /clients/me/family-members`
- `POST /clients/me/family-members`
- `PATCH /clients/me/family-members/{id}`
- `DELETE /clients/me/family-members/{id}`

#### T5-04 - Sovg'a obunasi

Backend holati: yopilgan.

Endpointlar:

- `POST /gifts`
- `POST /gifts/{code}/claim`
- `GET /gifts/{code}/qr`
- `GET /gifts`

#### T5-05 - Referal mijoz tomoni

Backend holati: yopilgan.

Endpointlar:

- `GET /referrals/me`
- `GET /referrals/{code}/qr`

#### T5-06 - Recurring to'lov

Backend holati: qisman/external.

Bor:

- Payment methods model.
- Payment abstraction.
- Subscription model.

Qolgan:

- Real recurring payment provider support.

#### T5-07 - Retention

Backend holati: yopilgan.

Endpointlar:

- `GET /retention/overview`
- `POST /retention/queue`
- `GET /retention/queue`

#### T5-08 - Gift KPI

Backend holati: yopilgan.

Endpoint:

- `GET /analytics/gifts`

### T6 Blok

#### T6-01 - Texnologiya qarori

Backend holati: yopilgan.

Bor:

- Web API mavjud.
- WebSocket mavjud.
- Mobile API bilan ishlashga endpointlar bor.

#### T6-04 - Push bildirishnoma

Backend holati: qisman/external.

Bor:

- Notification channel abstraction.
- Push provider flag.
- Queue fallback.

Qolgan:

- FCM/APNs provider real integration.

### T7 Blok

#### T7-02 - Akademiya

Backend holati: yopilgan.

Endpointlar:

- `POST /academy/courses`
- `GET /academy/courses`
- `GET /academy/courses/catalog`

#### T7-03 - Reklama va premium joylashuv

Backend holati: yopilgan.

Endpointlar:

- `POST /ads/products`
- `GET /ads/products`
- `GET /promotions/me`
- `GET /promotions/analytics`
- `POST /promotions/checkout`

#### T7-05 - Advokatlik tuzilmasi kabineti

Backend holati: yopilgan.

Endpointlar:

- `POST /organizations`
- `GET /organizations`
- `POST /organizations/{id}/members`
- `GET /organizations/{id}/members`

## Frontend Tarafdan Qilinishi Kerak Bo'lgan Ishlar

Quyidagilar frontend tarafdan ulanishi kerak. Backend endpointlar mavjud bo'lgan joylarda endpoint ko'rsatildi.

### Auth / Register / 2FA

1. Register form:
   - role
   - first_name
   - last_name
   - middle_name
   - name fallback
   - region
   - phone
   - password
   - referral_code

2. Register OTP:
   - `POST /auth/register/start` yoki `POST /auth/register`
   - `telegram_bot_link` bo'lsa bot linkni ko'rsatish
   - API response ichida kod kutmaslik
   - user botga kirib kod oladi
   - `POST /auth/register/verify`

3. Seller register:
   - advokat/yurist register verifydan keyin `approval_pending` qaytishi mumkin
   - bu holatda dashboardga kiritish mumkin, lekin cheklangan pending UI ko'rsatish kerak

4. Login:
   - `POST /auth/login`
   - agar 428 qaytsa, `detail.method`ga qarash:
     - `totp` bo'lsa authenticator app kodi input
     - `telegram` bo'lsa Telegram OTP input
   - login 2FA uchun `POST /auth/login/2fa` ishlatish
   - login uchun `/auth/2fa/verify` ishlatilmasin

5. Profile 2FA:
   - Telegram 2FA uchun:
     - `POST /telegram/link/start`
     - bot start
     - `POST /auth/2fa/start`
     - `POST /auth/2fa/verify`
   - TOTP uchun:
     - `POST /auth/2fa/totp/setup`
     - `qr_code` render qilish
     - user appdan 6 xonali kod kiritadi
     - `POST /auth/2fa/totp/enable`

6. TOTP yoqilganda:
   - UI’da Telegram 2FA emas, Authenticator app active deb ko'rsatish
   - keyingi loginlarda Telegram OTP kutmaslik

### Admin Register Requests

1. `GET /admin/register-requests`
2. Har bir request ustiga bosilganda:
   - `GET /admin/register-requests/{request_id}`
3. Detail modal/page:
   - name
   - first_name
   - last_name
   - middle_name
   - phone
   - region
   - role
   - created_at
   - seller profile payload
4. Accept:
   - `POST /admin/register-requests/{id}/accept`
5. Reject:
   - `POST /admin/register-requests/{id}/reject`

### Seller Availability

1. Advokat/yurist profile yoki ish vaqti page:
   - `GET /lawyers/me/availability`
2. Default source kelsa:
   - Du-Sha 09:00-19:00
   - Yakshanba yopiq
3. Edit:
   - `PUT /lawyers/me/availability`
4. UI fields:
   - timezone
   - weekly days
   - start/end
   - enabled toggle
   - response deadlines manual/auto/SOS

### Seller Profile

1. `GET /lawyers/me`
2. `PUT /lawyers/me`
3. Stats fields:
   - `total_cases`
   - `wins_count`
   - `partial_wins_count`
   - `success_rate`
4. Yurist ham tajriba kiritishi kerak:
   - `experience_years`
   - `lawyer_experience_years`
5. Seller status:
   - pending
   - approved/verified
   - rejected

### Catalog / Services

1. Service list:
   - `GET /services`
2. Search:
   - `GET /services/search`
3. Passport:
   - `GET /services/{id}/passport`
4. Admin CRUD:
   - `POST /admin/services`
   - `PATCH /admin/services/{id}`
   - `DELETE /admin/services/{id}`
5. Admin category:
   - `POST /admin/service-categories`
   - `GET /service-categories`

### Orders

1. Create:
   - `POST /orders`
2. List:
   - `GET /orders`
3. Accept:
   - `POST /orders/{id}/accept`
4. Decline:
   - `POST /orders/{id}/decline`
5. Status:
   - `PATCH /orders/{id}/status`
6. History:
   - `GET /orders/{id}/status-history`
7. Payment policy:
   - `GET /orders/{id}/payment-policy`
8. Milestones:
   - `GET /orders/{id}/milestones`
   - `POST /orders/{id}/milestones/{milestone_id}/pay`
   - `POST /orders/{id}/milestones/{milestone_id}/mark-paid`
   - `POST /orders/{id}/milestones/{milestone_id}/release`

### Secure Chat

1. Rooms:
   - `GET /secure-chats`
   - `POST /secure-chats`
2. Messages:
   - `GET /secure-chats/{room_id}/messages`
   - `POST /secure-chats/{room_id}/messages`
3. WebSocket:
   - `/ws/secure-chats/{room_id}?token=...`
4. Contact blocking:
   - frontend `filtered_content`, `is_blocked`, `block_reason` ni ko'rsatishi kerak
5. Reveal:
   - `POST /secure-chats/{id}/content-reveal/request`
   - `POST /secure-chats/{id}/content-reveal/approve`
   - `GET /secure-chats/{id}/content-reveal/status`

### Calls / Meet

1. Create call:
   - `POST /secure-chats/{room_id}/calls`
2. List calls:
   - `GET /secure-chats/{room_id}/calls`
3. Join token:
   - `GET /secure-chats/{room_id}/calls/{call_id}/join-token`
4. Invited calls:
   - `GET /calls/invited`
5. Add participant:
   - `POST /secure-chats/{room_id}/calls/{call_id}/participants`
6. Participant action:
   - `PATCH /secure-chats/{room_id}/calls/{call_id}/participants/{user_id}`
7. Call WS:
   - `/ws/secure-chats/{room_id}/calls/{call_id}?token=...`
8. User notification WS:
   - `/ws/users/me?token=...`
   - call invite frontendga shu WS orqali kelishi kerak
9. LiveKit URL:
   - backend qaytargan `livekit_url` ishlatiladi
10. Frontend poll qilmasligi kerak:
   - har sekund `/calls` request yuborish o'rniga `/ws/users/me` eventlaridan foydalanish

### Workspace Files

1. Upload:
   - `POST /workspace/files/upload`
2. List:
   - `GET /workspace/files`
3. Signed URL:
   - `POST /workspace/files/{id}/signed-url`
4. Download:
   - backend bergan signed URL ishlatiladi
   - frontend pathni o'zi yasamasin
5. Eski xato:
   - `/workspace/files/storage/...` ni frontend domain bilan yasash 404 beradi
   - backend absolute URL yoki API base URL ishlatilishi kerak

### Document Templates / Requests

1. Templates:
   - `GET /document-templates`
   - `GET /document-templates/{id}`
2. Request:
   - `POST /document-requests`
   - `GET /document-requests`
   - `GET /document-requests/{id}`
3. Answers:
   - `PUT /document-requests/{id}/answers`
4. Payment:
   - `POST /document-requests/{id}/payments`
5. Generate:
   - `POST /document-requests/{id}/generate`
6. File:
   - `GET /document-requests/{id}/file`
7. Frontend amount:
   - amount yuborilmasa backend document request price orqali olishi mumkin bo'lishi kerak
   - hozir frontend price/amount contractni tekshirib yuborsin

### Leads / Kanban

1. Admin list:
   - `GET /admin/leads`
2. Create:
   - `POST /admin/leads`
3. Kanban columns:
   - `GET /admin/leads/kanban/columns`
   - `PUT /admin/leads/kanban/columns`
   - `DELETE /admin/leads/kanban/columns/{key}`
4. Kanban board:
   - `GET /admin/leads/kanban`
5. Move:
   - `PATCH /admin/leads/{lead_id}/move`
6. Call-center:
   - `GET /call-center/leads/kanban`
   - `PATCH /call-center/leads/{lead_id}/move`

### Admin Dashboard / Analytics

1. Main dashboard:
   - `GET /admin/dashboard`
2. CEO:
   - `GET /analytics/ceo`
3. Gifts:
   - `GET /analytics/gifts`
4. Channels:
   - `GET /analytics/channels-attribution`
5. Revenue trend:
   - `GET /analytics/revenue-trend`
6. Quality:
   - `GET /quality/overview`

### Referrals

1. My referral:
   - `GET /referrals/me`
2. QR:
   - `GET /referrals/{code}/qr`
3. Frontend referral link:
   - `ref` query yo'qolmasligi kerak
   - landingdan login/registerga o'tganda `ref` saqlansin
   - localStorage/cookie orqali saqlash kerak

### Reviews

1. Pending:
   - `GET /reviews/pending`
2. Create:
   - `POST /reviews`
3. My reviews:
   - `GET /reviews/me`
4. Admin moderation:
   - `GET /admin/reviews`
   - `PATCH /admin/reviews/{id}/moderate`

### Notifications

1. List:
   - `GET /notifications`
2. Read:
   - `POST /notifications/{id}/read`
3. Read all:
   - `POST /notifications/read-all`
4. Unread count:
   - `GET /notifications/unread-count`
5. Preferences:
   - `GET /notifications/preferences`
   - `PUT /notifications/preferences`
6. Real-time:
   - `/ws/users/me?token=...`

### Mobile Taraf

Mobile app uchun backend tayyor bo'lishi kerak bo'lgan oqimlar:

1. Auth:
   - register
   - login
   - 2FA
   - refresh
   - logout
2. Client:
   - profile
   - family members
   - entitlements
   - documents
   - orders
   - payments
   - secure chat
   - calls
   - notifications
3. Seller:
   - profile
   - stats
   - availability
   - orders
   - cases
   - clients
   - workspace
   - calendar
   - secure chat
   - calls
   - payouts
4. Push:
   - hozir backend abstraction bor
   - real FCM/APNs kerak

## Tashqi Providerga Bog'liq Joylar

Quyidagilar backendda interface yoki placeholder sifatida bor, lekin real production ishlashi uchun tashqi provider credential/shartnoma kerak.

### SMS Provider

Kerak:

- provider nomi
- API base URL
- API key
- sender ID
- OTP template approval

Ta'sir qiladigan flowlar:

- register OTP fallback
- login 2FA fallback
- password reset
- critical notifications

### Email Provider

Kerak:

- SMTP yoki transactional email provider
- API key
- from domain
- SPF/DKIM/DMARC

Ta'sir qiladigan flowlar:

- notifications
- receipts
- document ready
- security alerts

### Push Provider

Kerak:

- Firebase Cloud Messaging
- Apple Push Notification service
- mobile app bundle IDs
- service account JSON

Ta'sir qiladigan flowlar:

- mobile notifications
- call invites
- chat messages
- order updates

### Payme

Kerak:

- merchant ID
- checkout URL
- webhook secret
- test/prod credentials
- callback URL whitelist

Ta'sir qiladigan flowlar:

- service order payment
- subscription payment
- document request payment
- refund/reconciliation

### Click

Kerak:

- service ID
- merchant ID
- secret key
- checkout URL
- webhook secret

Ta'sir qiladigan flowlar:

- service order payment
- subscription payment
- document request payment
- recurring agar provider qo'llasa

### OneID / MyID

Kerak:

- client ID
- client secret
- redirect URLs
- scope
- production access

Ta'sir qiladigan flowlar:

- identity verification
- seller verification
- reestr check
- high-risk operation verification

### IP Telephony

Kerak:

- provider
- SIP/WebRTC config
- API key
- webhook secret
- recording/transcript policy

Ta'sir qiladigan flowlar:

- call-center calls
- call logs
- AI call transcript
- operator dashboard

### LiveKit / TURN

Hozir bor:

- LiveKit container
- coturn container
- join token endpoint
- multi participant meeting

Monitoring kerak:

- TURN public DNS
- firewall UDP ports
- mobile browser media permission
- frontend LiveKit SDK version compatibility

### App Store / Play Market

Kerak:

- Apple developer account
- Google Play console
- bundle ID
- privacy policy URL
- push credentials

Ta'sir qiladigan tasklar:

- T6-02 client app
- T6-03 advocate app
- T6-05 publish

## Hali To'liq Yopilishi Kerak Bo'lgan Backend Ishlar

Quyidagilarni keyingi backend sprintda yopish kerak:

1. Canonical fixture seed:
   - GM doc talab qilgan 5 service family, 20 service, 10 advokat, 5 yurist, 5 template, 5 client, 3 call-center staff.

2. Notification retry worker:
   - queued SMS/email/push retry.
   - provider status monitoring.

3. Order timer/escalation worker:
   - seller response deadline.
   - auto offer next seller.
   - client confirmation window.

4. Rating recalculation batch:
   - paid completed orders asosida rating qayta hisoblash.

5. Meeting AI summary:
   - transcript storage policy.
   - summary generation.
   - delete after consent/24h rule.

6. Recurring payment:
   - real provider tokenized cards.
   - retry/grace policy.

7. Excel import/export:
   - catalog bulk import/export.
   - validation report.

8. Shift scheduling:
   - call-center/duty lawyer shift CRUD.
   - SLA assignment.

9. Script module:
   - operator scripts CRUD.
   - localized answers.

10. Formal production runbook:
   - backup.
   - monitoring.
   - data residency.
   - incident response.

## Frontend Uchun Muhim Eslatmalar

- Productionda `/docs` ochilmaydi, bu xavfsizlik uchun to'g'ri.
- API contractni frontendga alohida markdown/docs orqali berish kerak.
- Login 2FA uchun `/auth/login/2fa` ishlatilsin.
- TOTP yoqilgan userga Telegram OTP kutmang.
- Call invite va notification poll qilinmasin, `/ws/users/me` ishlatilsin.
- File download uchun frontend path yasamasin, backend signed URL ishlatsin.
- Referral `ref` query landingdan registergacha saqlansin.
- Seller pending bo'lsa ham login qila oladi, lekin UI cheklangan bo'lishi kerak.
- Advokat/yurist ish vaqti uchun yangi availability endpointlardan foydalanilsin.

## Yakuniy Holat

Backend hozir katta modullar bo'yicha ishlaydigan holatda. Productionda eng xavfli joylar: docs security, demo endpoint security, TOTP/Telegram OTP conflict, WebSocket DB connection leak, DB pool pressure va seller availability yopildi.

107 taskning hammasini "100% yopildi" deb aytish uchun hali har bir task bo'yicha alohida acceptance test matrix qilish kerak. Backend tarafdan taxminan 70-75 task yopilgan yoki API/logika darajasida tayyor. Qolganlari qisman backend, frontend/mobile yoki tashqi providerga bog'liq.
