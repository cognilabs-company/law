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
