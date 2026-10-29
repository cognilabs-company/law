// An advocate's years of practice as the backend counts them from the
// verified certificate, minus suspensions (contract 2026-10-29 §4.4) — read
// wherever a payload carries them; nothing here counts. null = not sent.
export function verifiedAdvocateYears(d: Record<string, unknown>): number | null {
  const v = d.advocate_active_experience_years;
  return v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
}
