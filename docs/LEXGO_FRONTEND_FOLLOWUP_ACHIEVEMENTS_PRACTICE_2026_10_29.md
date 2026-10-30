# LexGo: what the frontend still needs from the backend (achievements, certificates, practice)

Date: 2026-10-29
From: Frontend
Status: open. Most of the earlier list was answered by `LEXGO_ACHIEVEMENTS_PRACTICE_FRONTEND_FINAL_2026_10_29.md` (backend commit 0829278), and the frontend now follows it. Only the points below are still missing or unclear.
Applies to: `LEXGO_ACHIEVEMENTS_PRACTICE_FRONTEND_FINAL_2026_10_29.md`

---

**1. Suspension write responses: which shape?**
- The final contract (§6) says create and edit return the recounted practice in `practice`. The previous contract (69c11a6 §12) said create, edit and archive return the practice object itself, not `{ practice: … }`. The OpenAPI still types these three responses as free-form objects.
- What the frontend does now: it reads `practice` when present and otherwise takes the answer as the practice itself, for create, edit and archive (`DELETE`).
- Please confirm the one shape for all three, including `DELETE`. Typing them in the OpenAPI would settle it.

**2. Suspension evidence file names.**
- Suspension rows carry `evidence_ids` only (§6), so the operator sees "Document 1, 2, …".
- Please return `evidence[]` with `{ id, file_name, mime_type, size, download_url }`, as achievements do.

**3. Pending analysis returned as `manual_review_required`.**
- Earlier, a freshly created achievement whose analysis was still running could come back as `manual_review_required`.
- The final contract lists the three values but doesn't say whether this bug is fixed. Production has no achievement records, so we can't check.
- Please confirm it is fixed.

**4. Timestamps on achievement and certificate records.**
- §3 says "timestamps". Experience records use `submitted_at` and `reviewed_at`.
- Do achievement records, certificate records and their `history[]` items use the same two names?

**5. Certificate rejection reason on the review record.**
- `latest_verification` on the practice carries the operator's reason.
- On a certificate review `record`, which field holds it: `rejection_reason`, as on achievements?

---

## The owner's rules (2026-10-30)

The owner wrote down how achievements and advocate practice must work. The frontend now follows every rule it can with the current API. These points need the backend.

**6. Achievements and the service price.**
- The owner: an approved achievement improves the advocate's rating **and service price**.
- The contract of 2026-10-29: approved achievements count for the rating only, not the price.
- What the frontend does now: the form promises the rating only ("LexGo tasdiqlasa, profilingizda shaxsga oid ma'lumotlarsiz ko'rinadi va reytingingizga ijobiy ta'sir qiladi"). It never mentions the price.
- Question: will approved achievements affect the price, and when? What should the advocate see about it (a number, a percent, nothing)?

**7. Achievements for lawyers (yurist), not only advocates.**
- The owner writes "yurist/advokatlar".
- Checked on 2026-10-30: `GET /marketplace/me/achievements/config` and `/marketplace/me/advocate-license/config` answer `403 advocate_role_required`, and the contract opens achievements to the `advokat` role only.
- What the frontend does now: achievements are shown to advocates only. A lawyer sees nothing, and the UI does not pretend otherwise.
- Question: should the `yurist` role also be able to add achievements? If yes, please open the endpoints (config, list, evidence, submit, public list) to it, and tell us whether the stages and results are the same.

**8. The warning above the send button.**
- The owner's text: uploading fake or artificially made documents can have negative consequences, and LexGo checks with strong software that documents are authentic and not made with AI tools.
- We could not read the live `config.warning` (an advocate account with 2FA is needed). The test fixtures carry a weaker text ("upload only genuine documents").
- What the frontend does now: it shows `warning` / `warning_i18n` only when the text names both fake documents and the AI check. Otherwise it shows the owner's text, which the frontend keeps in uz, ru and en.
- Request: please put the owner's text into `warning` and `warning_i18n` (`uz_latn`, `uz_cyrl`, `ru`, `en`), so that both sides say the same thing.

**9. Advocate tenure at registration.**
- The owner: the advocate sets the tenure while registering, or the system reads it from the uploaded license.
- `POST /auth/register/start` and `/auth/register` take only `role`, names, `region`, `phone`, `password` and `referral_code`. They take no `advocate_status_started_at` and no certificate file. The certificate flow (`/marketplace/me/advocate-license/*`) needs a signed-in advocate.
- The registration form used to take a license photo, work history and a license number that were never sent. The photo and the work-history list are now gone from registration.
- What the frontend does now:
  - registration says where the tenure comes from;
  - right after sign-up (the done screen and the pending screen), the advocate is told to upload the certificate first;
  - the advocate dashboard asks for it until a certificate is submitted, and again when one is turned back.
- Question: can registration (or the pending-approval account) accept the certificate file, so that the system reads the start date before approval? Or `advocate_status_started_at`, to be checked later against the certificate?
- Related: is `license_number` from the registration form needed anywhere? It isn't sent today.

**10. Earlier workplaces: public body or private company.**
- The owner: before becoming an advocate, the person worked at a public body (davlat idorasi) or at a private company (xususiy kompaniya).
- `ExperienceSubmission` with `experience_kind=pre_advocate_employment` has no field for the kind of organization.
- What the frontend does now: the section title and hints say both kinds are welcome. There is no choice to make, because nothing could save it.
- Request: an `organization_type` field (`state_body` | `private_company`, with `label_i18n`) on pre-advocate employment records, in the submission, the record, the operator's view and the history. The frontend will add the choice as soon as the field exists.
