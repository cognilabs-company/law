# LexGo backend — frontend uchun majburiy ishlar ro'yxati

**Sana:** 2026-09-18 (kechki)
**Backend commit (tekshirilgan):** `a203556` — production `https://lexgo.api.cognilabs.org`
**Frontend commit:** `c12878c` (GitHub `cognilabs-company/law`, main)
**Kim uchun:** backend dasturchi. Har band — frontend allaqachon qurilgan, faqat backend yo'qligi uchun to'liq ishlamaydigan joy. Batafsil topilmalar va tarix: `LEXGO_BACKEND_ISSUES_2026-09-15.md` (raqamlar o'sha hujjat bo'yicha).

Muhimlik: 🔴 — ishlab chiqarishda ish oqimi buziladi yoki xavfsizlik; 🟠 — GM v1.1 talabi yopilmaydi; 🟡 — sifat/UX.

---

## A. 🔴 Bugun kerak (production xavfsizlik va buzilgan oqimlar)

| # | Nima | Aniq talab | Hozir |
|---|---|---|---|
| A1 | **OTP kodlari umumiy Telegram chatga ketyapti** (#32, T0-02) | Production'da `telegram_otp_test_mode` o'chirilsin; kod faqat foydalanuvchining o'z `telegram_chat_id` siga; test rejimi faqat staging | Boshqa foydalanuvchining kodi umumiy chatda ko'rinadi |
| A2 | **Ichki rollar 2FA'siz kiradi** (#30, T0-05) | `mandatory_two_factor` foydalanuvchining *barcha* rollari bo'yicha (`roles` ro'yxatida admin/callcenter/finance/… bo'lsa) — hozir faqat `user.role != client` | Superadmin login javobida darhol `access_token` |
| A3 | **To'lov webhook'i yo'q** (2.1, T1A-01) | Payme/Click callback endpointlari → `Payment.status=paid`, buyurtma bosqichi `paid`, `order.paid` bildirishnoma; demo-confirm ham bosqichni `paid` qilsin (2.2/2.3, #33) | Real invoice hech qachon "paid" bo'lmaydi; "to'langan" buyurtmada bosqichlar to'lanmagan |
| A4 | **Katalog tezligi** (1.1) | `GET /services`, `/services/search` ≤ 500 ms (metadata JOIN + indeks, `count` so'rovlarini yig'ish, keshlash) | 11,5 s |
| A5 | **Production'dagi test yozuvlar** (3.3, 0D) | `T1BTEST-*` kategoriya/paket (paket `on_sale` — mijozga ko'rinadi!), `FX-*` xizmatlar, `TEST` roli, `Smoke/Test/Runtime Yurist` so'rovlari, `sssss`/`e2e` shikoyatlar, `test` kategoriyasi o'chirilsin; testlar faqat staging bazasida | Ko'payib bormoqda |
| A6 | **Call-markaz yuristi mijoz kartasini ocholmaydi** (#38, T4-02) | `GET /call-center/leads/{id}/client-card` (yoki 360) `callcenter.access` bilan ochilsin — hozir `users.manage` talab qiladi | 403 |
| A7 | **AI takliflari hamma savolga bir xil** (#31, T1-05) | `/ai/classify` → `offer_levels` savol mazmuniga qarab (kategoriya → xizmatlar), `summary` foydalanuvchi matni emas (3.1/3.2) | 3 ta doimiy xizmat |
| A8 | **AI manbalari modda va sanasiz** (#10, 3.6, T1-04) | `legal_corpus_sources` da `article`, `date`, `url` to'ldirilsin | `article: None, date: None` |

## B. 🟠 GM v1.1 talablari — frontend tayyor, backend kutilmoqda

### B1. Admin CRUD'lar (frontend hozir overlay bilan ishlaydi — backend chiqqach avtomatik o'tadi)

| # | Endpoint | Talab |
|---|---|---|
| #77 | `PATCH /admin/subscription-plans/{id}`, `DELETE /admin/subscription-plans/{id}` (soft: `is_active=0`), `GET /admin/subscription-plans` (nofaollar bilan) | `audience` qiymatlari: `client \| yurist \| advokat \| seller \| business`; **`sync_canonical_subscription_plans` admin tahririni qayta yozmasin** (faqat yo'q bo'lsa yaratsin); `name{uz,ru,en}`, `features{uz,ru,en}` saqlansin |
| #66 | Seed | `lexgo-ai-yurist-advokat-seller`, `lexgo-ai-jismoniy-shaxs`, `biznes-abonent-basic/standard/premium` seed'dan olib tashlash (hujjatda yo'q); LexGo.AI Free/Lite/Pro `audience=client` (#65, #14); «Shaxsiy advokat Standard» narxi 149 000 yoki 249 000 — PM bilan aniqlash |
| #80 | `PATCH /admin/service-categories/{id}` (`title`, `title_ru`, `title_en`, `slug`, `sort_order`), `DELETE /admin/service-categories/{id}` (soft) | `GET /admin/services?include_inactive=true`; `PATCH /admin/services/{id}` metadata yozuvi bo'lmasa yaratsin; PATCH uchun Pydantic sxema (422, 500 emas) |
| #42 | `POST /admin/legal/consents` va `PUT /admin/legal/consents/{id}` | `{slug, version, title, body, is_active, requires_reaccept}`; PM bergan 10 hujjat × 3 til matnlarini bazaga kiritish (hozir 43–76 belgili placeholder) |
| #64 | `PUT /admin/roles/{id}/permissions` (body: `{permissions: string[]}`) | Rol matritsasini saqlash — hozir faqat `POST /admin/roles`, body hujjatlashtirilmagan |

> Overlay tafsiloti: frontend hozir tarif/kategoriya tahririni `PUT /admin/platform/policies/payment` → `plans.overrides[slug]` va `/order` → `catalog.categories[id]` ichida saqlaydi. Backend PATCH/DELETE 200 qaytarsa overlay ishlatilmaydi. PATCH/DELETE chiqqach `payment.plans.overrides` va `order.catalog.categories` kalitlarini bazaga ko'chirib (migration) tozalash mumkin.

### B2. Obuna va to'lov

| # | Talab |
|---|---|
| #78 | **ATMOS avto-to'lov**: `AtmosPaymentProvider` (karta ulash → token, token bilan yechish), `UserSubscription.auto_renew`, `next_billing_at`, `payment_method_id`; `GET/PATCH /subscriptions/me {auto_renew}`; oylik yechish job'i; `subscription_renewed` / `subscription_payment_failed` bildirishnomalari. Frontend tumbler va «Kartani ulash» kartasi tayyor (hozir sozlama qurilmada) |
| #65 | Chegirma jadvali server tomonda: 3 oy −5 %, 6 oy −10 %, 12 oy −15 %, bir yo'la +5 %, jami ≤ 20 %; 3 oylik `billing_period`; tasdiqlangan advokat/yuristga −50 % (hozir frontend summani o'zi hisoblab yuboradi — server tekshirmaydi) |
| #49 / #50 | `/clients/me/entitlements` har imtiyoz uchun `{limit, used, reset_at}`; `GET /ai/usage` (200 javobda ham) |
| #47 | `/payouts/me`: `period`, `scheduled_for` (payshanba), `dispute_hold_amount`; payout qoidasi (3 kun nizo oynasi, min 100 000, oy oxiri) |
| 2.4 | To'lovlar tarixida `description` (xom `target_type` emas) |

### B3. CRM / call-markaz

| # | Talab |
|---|---|
| #76 | `Lead.assigned_to_user_id`, `assigned_at`, `assigned_by`; `POST /admin/leads/{id}/assign {user_id}`; `POST /admin/leads/auto-assign {strategy: round_robin\|least_loaded}`; `GET /admin/leads?assigned_to=&region=&date_from=&date_to=&score=`; call-markaz rollari uchun `mine` filtri. Frontend hozir `details.assigned_to_user_id` ga yozadi (faqat `leads.manage` bilan) |
| #62 | `PATCH /call-center/leads/{id}` (details **merge**, to'liq almashtirmasin) yoki move payload'ida `lost_reason` |
| #37 | `GET /admin/leads/kanban` — N+1 so'rovlar (lid ko'paysa yana 10 s) |
| #39 | Sales operator uchun mijoz qidiruvi va 360 |
| #40 | `/call-center/calls` tarixi: `duration`, `result`, `recording_url` |

### B4. Uchrashuvlar (T2-09)

| # | Talab |
|---|---|
| #68 | `POST …/calls/{id}/end` va `/leave` (REST) → call socket (`/ws/…/calls/{id}`) va user socket (`/ws/users/me`) ga `call.ended` / `call.participant_left`. Hozir frontend `call.end`/`call.leave` signalini o'zi yuboradi va bo'sh xonada 10 s dan keyin o'zi tugatadi |
| #81 | `call_participant.recording_consent {requested_by, approved_by, denied_by, at}`; call socket allowlist'ga `recording.request/approve/deny/started/stopped`; `call.incoming` da `caller_name`. Hozir rozilik LiveKit data-kanalida (saqlanmaydi) |
| #67 | `GET /users/search` mijoz/advokat host uchun ham (o'z chat/buyurtma aloqalari yoki tasdiqlangan ijrochilar ichida) — hozir 403 |

### B5. Dashboard va analitika

| # | Talab |
|---|---|
| #79 | `GET /admin/dashboard`, `/analytics/ceo`, `/calls/analytics`, `/retention/overview`, `/quality/overview`, `/lawyers/me/stats`: `region`, `date_from`, `date_to` parametrlari qo'llansin; `by_region` bo'linmalar; `charts.revenue_trend` kunlik. Frontend parametrlarni yuboradi va imkon boricha o'zi filtrlaydi; ma'lumot bo'lmasa demo ko'rsatadi |
| — | `/analytics/ceo` da `mrr` ≠ `revenue` (hozir bir xil raqam), `avg_rating`/`response_sla_pct` haqiqiy hisob (hozir konstanta) |
| #75 | `NotificationInboxOut` da `event`, `category`, `channel` ustki darajada; bitta voqea uchun bitta yozuv (kanal soni emas); `GET /notifications?category=&read=&limit=` |

### B6. Ijrochi (advokat/yurist) kabineti

| # | Talab |
|---|---|
| #56 ✅/⚠️ | `GET/PUT /lawyers/me/availability` bor — qo'shimcha: `vacation_mode` (ta'tilda buyurtma yuborilmaydi, ko'rsatkichlarga kirmaydi), `exceptions` sxemasi hujjatlashtirilsin |
| #61 | `GET/PUT /lawyers/me/services` da har xizmat uchun `selected_price` (+ `min_allowed/max_allowed`) — hozir narx frontend'da |
| #55 | lawyers API: `gender`, `is_online`, `is_super`, `is_promoted` (#58) |
| #69–71 | `User.identity_verified_at`; `/auth/me` da `identity_verified`, `identity_provider`, `identity_verified_at`; MyID ulangach `accept_orders` uchun `identity_verified` sharti; #70 ✅ (`order.catalog.unverified_sellers` policy'sini `GET /lawyers` hurmat qilishi — hozir frontend filtrlaydi) |
| #57 | Onboarding draft server'da (`/register/draft`), selfie/litsenziya yuklash |
| #48 | `/referrals/me`: ijrochi uchun `active_count`, `commission_rate`, `next_tier`; mijoz uchun `paid_count`, `share_text` |

### B7. Buyurtma / hujjatlar / boshqalar

| # | Talab |
|---|---|
| #45 | `/orders/{id}/status-history`: `old_status`, `changed_by_user_id`, `ip`, `device`, `reason` |
| #46 | `POST /orders/{id}/decline {reason, note}` saqlansin + `GET /admin/orders/decline-reasons/stats` |
| #51 | `/service-packages` da `related_service_ids` yoki komponentlarda `service_id, unit_price` |
| #52 / #53 | Kalendar hodisa turlari (hearing, investigative, meeting, filing_deadline, appeal_deadline), eslatma to'plami [10080, 4320, 1440, 120]; Google Calendar OAuth |
| #54 | `/admin/security-events` turlari (suspicious_login, otp_bruteforce, password_bruteforce, mass_read) + `PATCH` status |
| #59 | Chat xabarida telefon/@username/«telegramda yozing» maskalash (to'lovgacha) — hozir frontend ko'rsatadi, server saqlaydi |
| #63 | `PATCH /b2b/clients/{id}`: `address`, `bank`; yuridik shaxs ro'yxati (`/auth/register` `company` maydonlari) |
| #28 / #18 | Fayl tahlili AI'dan o'tishi (6 bo'lim), matnli tahlil ≤ 10 s (hozir 38 s) |
| #17 | Integratsiyalar sahifasi: `database`, `payment_mode`, `website_api`, `mobile_api` haqiqiy holat (hozir doim `connected`) |
| #12 | E2E readiness: `report` haqiqiy sinov natijasi |

## C. 🟡 Til va sifat

| # | Talab |
|---|---|
| #73 | Har `HTTPException.detail` → `{code, message}` yoki `Accept-Language` bo'yicha matn. Hozir 400+ joyda faqat o'zbekcha; frontend 20 ta iborani o'zi tarjima qiladi (`lib/apiMessage.ts`) |
| #74 | `LegalService.title_en`, `ServiceCategory.title_ru/title_en`, `SubscriptionPlan.name{uz,ru,en}` — `GET /services`, `/service-categories`, `/subscription-plans` javobida |
| #35 | Ma'lumotlar tili aralash (kirill/lotin/rus) — seed'ni bir tilga keltirish yoki 3 tilda saqlash |
| #36 / #60 | GM tekshiruvi uchun test-akkaunt to'plami (mijoz ×3, advokat ×3 — tuzilmali/tuzilmasiz/tasdiqlanmagan, yurist, superadmin ×2, executive, ceo_viewer, moderator, finance, quality_control, content_manager, sales_head, b2b_manager, marketing) |
| 3.4 / 3.5 | `/matching/me` formati; `/pricing/quote` modifier'larida `label` |

## D. Tashqi provayderlar (hujjatdagi ro'yxat, kalitlar PM'dan)

SMS (Eskiz/PlayMobile), Email (SMTP), Push (FCM), Payme, Click, **ATMOS** (B2), OneID, MyID, IP-telefoniya (call-markaz). Har biri uchun: sozlanmagan bo'lsa `503 {detail:{code:"PROVIDER_NOT_CONFIGURED", provider}}` — frontend shu kodni «hali ulanmagan» deb ko'rsatadi.

---

### Frontend tomonidan tayyor va backend'ni kutayotgan UI (tekshirish uchun)
- Admin → Paket tariflar: tahrir / faol-nofaol / o'chirish / yashirilganlarni qaytarish (B1 #77)
- Admin → Xizmatlar → Xizmat kategoriyalari: tahrir / o'chirish / qaytarish (B1 #80)
- Mijoz → Paket tariflar: «Avtomatik to'lov (ATMOS)» kartasi (B2 #78)
- Admin → Sotuv voronkasi / Call-markaz: operatorga biriktirish, auto-taqsimlash, filtrlar (B3 #76)
- Uchrashuv: yozib olish roziligi, kim yozyapti, taklif qidiruvi (B4)
- Admin → Umumiy / CEO / Qo'ng'iroq tahlili / Ushlab qolish / Sifat: hudud + sana filtri, drill-down (B5 #79)
- Bildirishnomalar: toifalar va rol tablari (B5 #75)

### Tekshiruv tartibi (har band uchun)
1. Staging'da endpoint → frontend `main` bilan (Vercel preview) sinash.
2. Javob sxemasi `md/LEXGO_BACKEND_ISSUES_2026-09-15.md` dagi kutilayotgan maydonlar bilan bir xil bo'lsin (nomlar snake_case, pul **tiyin**da `*_tiyin`, sanalar ISO 8601 UTC).
3. Yangi/o'zgargan endpoint OpenAPI (`/docs`) da chiqsin — frontend shundan tekshiradi.
