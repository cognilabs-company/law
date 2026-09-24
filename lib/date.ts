// Handmade date formatting (no Intl): ISO "2026-08-22" -> "22 Avgust 2026".
const MONTHS: Record<string, string[]> = {
  uz: [
    "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
    "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
  ],
  ru: [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ],
  en: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
};

export function fmtDate(iso: string, locale: string): string {
  if (!iso) return "";
  const parts = iso.split("-").map((n) => parseInt(n, 10));
  const [y, m, d] = parts;
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  const months = MONTHS[locale] || MONTHS.uz;
  return `${d} ${months[m - 1]} ${y}`;
}

// Short month names for compact chart axes.
const MONTHS_SHORT: Record<string, string[]> = {
  uz: ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"],
  ru: ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

// Compact date for chart axes, e.g. uz "31 Avg", ru "31 авг", en "Aug 31".
export function shortDate(iso: string, locale: string): string {
  if (!iso) return "";
  const parts = iso.split(/[-T ]/).map((n) => parseInt(n, 10));
  const [y, m, d] = parts;
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  const months = MONTHS_SHORT[locale] || MONTHS_SHORT.uz;
  return locale === "en" ? `${months[m - 1]} ${d}` : `${d} ${months[m - 1]}`;
}

// Day, short month and local time, e.g. uz "15 Sen, 14:39", en "Sep 15, 14:39".
export function shortDateTime(value: string, locale: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const months = MONTHS_SHORT[locale] || MONTHS_SHORT.uz;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = locale === "en" ? `${months[d.getMonth()]} ${d.getDate()}` : `${d.getDate()} ${months[d.getMonth()]}`;
  return `${day}, ${time}`;
}

// Nominative month names (for headers like "Avgust 2026").
const MONTHS_NOM: Record<string, string[]> = {
  uz: MONTHS.uz,
  ru: [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ],
  en: MONTHS.en,
};

// Short weekday names, Monday-first.
const WEEKDAYS: Record<string, string[]> = {
  uz: ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"],
  ru: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

export function monthTitle(year: number, month0: number, locale: string): string {
  const months = MONTHS_NOM[locale] || MONTHS_NOM.uz;
  return `${months[month0]} ${year}`;
}

export function weekdays(locale: string): string[] {
  return WEEKDAYS[locale] || WEEKDAYS.uz;
}

// Nominative month names for a given locale (e.g. month picker grid/header).
export function monthNames(locale: string): string[] {
  return MONTHS_NOM[locale] || MONTHS_NOM.uz;
}

// ── Locale-aware replacements for the hardcoded toLocale*("ru-RU") helpers
// that had been copied into two dozen components. Handmade like everything
// above, so a Russian month never leaks into the Uzbek or English build and
// no runtime needs an "uz-UZ" Intl dataset.

// "24 Sen 2026" / "24 сен 2026" / "Sep 24, 2026"
export function dateOnly(value: string, locale: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const months = MONTHS_SHORT[locale] || MONTHS_SHORT.uz;
  return locale === "en"
    ? `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
    : `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// "24 Sen 2026, 17:50" — the year matters in audit and payment logs, which is
// where the old toLocaleString() calls lived.
export function dateTimeFull(value: string, locale: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${dateOnly(value, locale)}, ${time}`;
}

// "17:50"
export function timeOnly(value: string, locale: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  void locale; // 24-hour everywhere; the argument keeps the call sites uniform
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Thousands separated by a space in uz/ru, by a comma in en — the old
// toLocaleString("ru-RU").replace(/,/g," ") produced a space in English too.
export function fmtInt(n: number, locale: string): string {
  if (!Number.isFinite(n)) return "";
  const s = Math.round(Math.abs(n)).toString();
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, locale === "en" ? "," : " ");
  return (n < 0 ? "-" : "") + grouped;
}
