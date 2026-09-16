# LexGo Law Marketplace — build plan (CIMS project 14)

Source: CIMS project 14, my assigned module cards (Backend board / To Do, #210–#270).
Directive: build modern, polished UI for each even if the backend is not ready
(fail-soft against expected endpoints). Work sequentially; verify each via the
running UI (screenshot) before moving on.

Status legend: ✅ already built · 🟡 partial (needs polish) · 🔴 missing (build now)

## Already built (from earlier work)
- #210 Authentication ✅ · #211 Role/Permission (admin/roles) ✅
- #213 Family Profile ✅ · #214 Lead Management (admin/leads) ✅
- #215 Sales Pipeline (admin/pipeline) ✅ · #217 Legal-services catalog ✅
- #218 Template catalog (admin/templates) ✅ · #219 Document Generator ✅
- #222 Case Management ✅ · #224 Calendar ✅ · #225 Advocate profile ✅
- #230 Marketplace ✅ · #232 Secure Chat ✅ · #233 Voice/Video + Zoom ✅
- #236 Payments ✅ · #238 Subscription ✅ · #253 Ads/Promotion ✅
- #255 AI Legal Chat (client/ai) ✅ · #262 Notifications ✅
- #263 File storage (workspace) ✅ · #266 Admin panel ✅

## Partial — polish later
- #212 Client 360 profile 🟡 · #220/#221 Order mgmt+workflow 🟡
- #223 Task Management 🟡 · #226 Advocate qualification 🟡
- #228 Order accept/reject (opportunities) 🟡 · #234 Call-center CRM 🟡
- #239 Personal-lawyer subscription 🟡 · #254 CEO dashboard 🟡

## Build order (missing UI — this is the working queue)

### Phase A — client portal (most visible)
- [x] A1. #240 SOS / Shoshilinch yuridik yordam (+ #231 duty lawyer) — done, verified
- [x] A2. #243 Referral System — done, verified
- [x] A3. #247 Rating & Review — done, verified
- [x] A4. #245 Complaint Management — done, verified
- [x] A5. #246 LexGo Warranty / Lawyer Replacement — done, verified
- [x] A6. #270 Academy (portal) — done, verified

### Phase B — advocate / lawyer
- [x] B1. #227 Automatic Lawyer Matching (results UI) — done, verified
- [x] B2. #223 Task Management board (lawyer + advocate) — done, verified
- [x] B3. #235 Call Recording & Analytics (admin) — done, verified

### Phase C — admin / CEO
- [x] C1. #254 CEO Dashboard + #269 Analytics + #251 Marketing Attribution — done, verified
- [x] C2. #241 Retention + #242 Upsell/Cross-sell — done, verified
- [x] C3. #244 Quality Control + complaint admin (#245) — done, verified
- [x] C4. #248 B2B CRM (clients) — done
- [x] C5. #216 Re-engage lost leads (pipeline action) — done

### Phase D — AI
- [x] D1. #256 AI Problem Classification (intake → call-center lead) — done, verified
- [x] D2. #257 AI Document Analysis — done
- [x] D3. #258 AI Operator Assistant + #259 AI Case Assistant — done, verified

## All queued phases (A–D) complete. Backend endpoints in BACKEND_INTEGRATION_NOTES.md.

Out of web scope: #260/#261 mobile apps, #264 security, #265 audit (backend),
#267 integration, #268 workflow engine.

Each built module: expected backend endpoints noted in code (fail-soft) and, if
new, appended to BACKEND_INTEGRATION_NOTES.md.
