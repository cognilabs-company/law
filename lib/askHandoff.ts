const KEY = "lexgo_ask_handoff";
const TTL = 5 * 60 * 1000;

export function saveAsk(question: string): boolean {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ q: question, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function takeAsk(): string {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return "";
    sessionStorage.removeItem(KEY);
    const { q, at } = JSON.parse(raw) as { q?: unknown; at?: unknown };
    return typeof q === "string" && typeof at === "number" && Date.now() - at < TTL ? q : "";
  } catch {
    return "";
  }
}
