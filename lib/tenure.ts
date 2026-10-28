export function yearsSince(isoDate: string, today: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  const n = /^(\d{4})-(\d{2})-(\d{2})/.exec(today);
  if (!m || !n) return null;
  const [y1, m1, d1] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [y2, m2, d2] = [Number(n[1]), Number(n[2]), Number(n[3])];
  if (y1 > y2 || (y1 === y2 && (m1 > m2 || (m1 === m2 && d1 > d2)))) return null;
  const before = m2 < m1 || (m2 === m1 && d2 < d1);
  return y2 - y1 - (before ? 1 : 0);
}
