# Advocate registration — current shape (reference)

Advocate registration flow:
`personal → professional → expertise → stats → review`
(`STEPS_BY_TYPE.advocate` in `components/register/RegisterFlow.tsx`).

Nothing is deferred to the profile editor anymore — every section below is
collected during registration.

## professional (Kasbiy) step

- License number.
- **Specialization** dropdown (`register.advocate.specOptions`:
  criminal-administrative / economic-civil / both).
- **Advocate structure** dropdown (`structureOptions`: bureau / firm /
  bar collegium) + structure name (`orgName`). Sent to the backend as
  `advocate_structure` / `organization_name`.
- License document upload.
- Two experience inputs: `advocateYears` / `lawyerYears`.
- **Work history** (`WorkHistoryEditor`, `ProfessionalProfile.workHistory`) —
  embedded here (org / position + dates), i18n `register.advocate.work.*`.
- Bar-association field was removed.

## expertise (Yo'nalishlar) step — OPTIONAL

- Categorized catalog `lib/legalServices.ts` via `LegalServicePicker`
  (accordion: category → sub-services). Stored in `practiceAreas`.

## stats (Statistika) step

- `totalCases`, `fullyWonCases`, `partiallyWonCases` (+ notes), computed
  `successRate`. Backend `PUT /lawyers/me` → `wins_count` /
  `partial_wins_count`.

## Lawyer (yurist) registration

- Simplified to name + region + password, then services. No license fields.
