// A client-side heads-up counter for a guest's free AI questions (2/day,
// 5/month cumulative) — purely so the "you're out of free questions,
// register for 5 more" card can appear right under a real answer, the same
// moment the backend's own limit is about to bite, instead of only after a
// failed request. The backend remains the actual enforcer: isLimitError()
// still catches its real block regardless of what this counter thinks, so a
// cleared localStorage never grants an extra real question — it only makes
// this early heads-up card show up one question late.
const DAILY_LIMIT = 2;
const MONTHLY_LIMIT = 5;
const KEY = "lexgo_guest_ai_usage";

type State = { day: string; dayCount: number; month: string; monthCount: number };

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);

function read(): State {
  const day = today();
  const month = thisMonth();
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<State>) : null;
    return {
      day,
      dayCount: v?.day === day ? v.dayCount || 0 : 0,
      month,
      monthCount: v?.month === month ? v.monthCount || 0 : 0,
    };
  } catch {
    return { day, dayCount: 0, month, monthCount: 0 };
  }
}

function write(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// Call once for every AI answer a guest actually received. Returns whether
// that answer just used the last free question available today or this
// month — the moment to show the registration card under it.
export function noteGuestQuestion(): boolean {
  const s = read();
  s.dayCount += 1;
  s.monthCount += 1;
  write(s);
  return s.dayCount >= DAILY_LIMIT || s.monthCount >= MONTHLY_LIMIT;
}
