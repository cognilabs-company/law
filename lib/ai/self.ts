export const AI_LAUNCHER_ID = "dashboard.ai-instructor.open";

export const SELF_TARGET_BLOCKED = "self_target_blocked";

const SELF_IDS = new Set([AI_LAUNCHER_ID, "button:open-instructor", "support.channels.ai", "support:ai"]);

const SUBJECT = [
  "ai instruktor",
  "ai instructor",
  "ai-instruktor",
  "yordamchi",
  "instruktor",
  "instructor",
  "assistant",
  "assistent",
  "ai yordam",
  "ai helper",
  "ассистент",
  "помощник",
  "инструктор",
  "ии помощник",
  "ии-помощник",
  "ии ассистент",
];

const PLACE = [
  "qayer",
  "qaer",
  "och",
  "top",
  "ko'rsat",
  "korsat",
  "tugma",
  "button",
  "ishga tush",
  "where",
  "open",
  "find",
  "show",
  "launch",
  "start",
  "где",
  "найти",
  "найд",
  "открыть",
  "откры",
  "показ",
  "кнопк",
  "запуст",
];

const DOMAIN = [
  "tarif",
  "paket",
  "plan",
  "obuna",
  "hujjat",
  "ariza",
  "shartnoma",
  "advokat",
  "yurist",
  "marketplace",
  "mutaxassis",
  "support",
  "operator",
  "tezkor",
  "konsultatsiya",
  "video",
  "subscription",
  "document",
  "contract",
  "lawyer",
  "attorney",
  "consultation",
  "тариф",
  "подписк",
  "документ",
  "договор",
  "адвокат",
  "юрист",
  "оператор",
  "поддержк",
  "консультац",
];

export function normAiText(raw: string): string {
  return (raw || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ʻʼ‘’`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function selfHelpAsked(message: string): boolean {
  const text = normAiText(message);
  if (!text) return false;
  const has = (list: string[]) => list.some((w) => text.includes(w));
  return has(SUBJECT) && has(PLACE) && !has(DOMAIN);
}

export function isSelfTarget(id: string): boolean {
  return SELF_IDS.has((id || "").trim());
}

export function selfTargetBlocked(id: string, message: string): boolean {
  return isSelfTarget(id) && !selfHelpAsked(message);
}
