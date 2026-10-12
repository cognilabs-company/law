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

const DAY_ONLY = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const STAMP = /^\d{4}-\d{1,2}-\d{1,2}[T ]\d{1,2}:\d{2}/;

function dayParts(value: string): [number, number, number] | null {
  const s = String(value || "").trim();
  if (!s) return null;
  const day = DAY_ONLY.exec(s);
  if (day) return [Number(day[1]), Number(day[2]), Number(day[3])];
  if (STAMP.test(s)) {
    const at = new Date(s);
    if (!Number.isNaN(at.getTime())) return [at.getFullYear(), at.getMonth() + 1, at.getDate()];
  }
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d || m < 1 || m > 12) return null;
  return [y, m, d];
}

function dayText(y: number, m: number, d: number, locale: string, withYear = true): string {
  const months = MONTHS[locale] || MONTHS.uz;
  const year = withYear ? ` ${y}` : "";
  if (locale === "ru" || locale === "en") return `${d} ${months[m - 1]}${year}`;
  return `${d}-${MONTHS.uz[m - 1].toLowerCase()}${year}`;
}

export function fmtDate(iso: string, locale: string): string {
  if (!iso) return "";
  const p = dayParts(iso);
  if (!p) return iso;
  return dayText(p[0], p[1], p[2], locale);
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export function localDay(value: string | number | Date): string {
  if (typeof value === "string") {
    const s = value.trim();
    if (DAY_ONLY.test(s)) {
      const [y, m, d] = dayParts(s) ?? [0, 0, 0];
      return y ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
    }
  }
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
}

export function fmtDateTime(value: string | number | Date, locale: string, withYear = true): string {
  if (value === "" || value === null || value === undefined) return "";
  if (typeof value === "string" && DAY_ONLY.test(value.trim())) {
    const p = dayParts(value);
    return p ? dayText(p[0], p[1], p[2], locale, withYear) : value;
  }
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return typeof value === "string" ? value : "";
  return `${dayText(at.getFullYear(), at.getMonth() + 1, at.getDate(), locale, withYear)}, ${hhmm(at)}`;
}

function ruForm(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

type Units = { sec: (n: number) => string; min: (n: number) => string; hour: (n: number) => string; day: (n: number) => string };

const UNITS: Record<string, Units> = {
  uz: { sec: (n) => `${n} soniya`, min: (n) => `${n} daq`, hour: (n) => `${n} soat`, day: (n) => `${n} kun` },
  ru: { sec: (n) => `${n} сек`, min: (n) => `${n} мин`, hour: (n) => `${n} ч`, day: (n) => `${n} ${ruForm(n, "день", "дня", "дней")}` },
  en: { sec: (n) => `${n} sec`, min: (n) => `${n} min`, hour: (n) => `${n} h`, day: (n) => `${n} ${n === 1 ? "day" : "days"}` },
};

const unitsOf = (locale: string): Units => UNITS[locale] || UNITS.uz;

export function fmtAgeMin(minutes: number, locale: string): string {
  if (!Number.isFinite(minutes)) return "";
  const u = unitsOf(locale);
  const mins = Math.max(0, Math.floor(minutes));
  if (mins < 60) return u.min(Math.max(1, mins));
  const hours = Math.floor(mins / 60);
  if (hours < 48) return u.hour(hours);
  return u.day(Math.floor(hours / 24));
}

export function fmtAge(value: string | number | Date, locale: string, now: number = Date.now()): string {
  if (value === "" || value === null || value === undefined) return "";
  const at = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return "";
  return fmtAgeMin((now - at) / 60000, locale);
}

export function fmtDuration(seconds: number, locale: string): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const u = unitsOf(locale);
  const secs = Math.round(seconds);
  if (secs < 60) return u.sec(Math.max(1, secs));
  const mins = Math.round(secs / 60);
  if (mins < 60) return u.min(mins);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${u.hour(h)} ${u.min(m)}` : u.hour(h);
}

export const MINUS = "−";

export function fmtNum(n: number, locale: string, digits = 0): string {
  if (!Number.isFinite(n)) return "";
  const places = Math.max(0, Math.min(6, Math.floor(digits) || 0));
  const fixed = Math.abs(n).toFixed(places);
  const [int, frac = ""] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, locale === "en" ? "," : " ");
  const tail = frac.replace(/0+$/, "");
  const body = tail ? `${grouped}${locale === "en" ? "." : ","}${tail}` : grouped;
  return n < 0 && Number(fixed) !== 0 ? `${MINUS}${body}` : body;
}

export function fmtPct(n: number, locale: string, digits = 1): string {
  const s = fmtNum(n, locale, digits);
  return s ? `${s}%` : "";
}

export function fmtDelta(n: number, locale: string, digits = 0, unit = ""): string {
  const s = fmtNum(n, locale, digits);
  if (!s) return "";
  const zero = Number(Math.abs(n).toFixed(Math.max(0, Math.min(6, Math.floor(digits) || 0)))) === 0;
  return `${n > 0 && !zero ? "+" : ""}${s}${unit}`;
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

// "4,8" in uz/ru, "4.8" in en. toFixed() is locale-blind and always emits a
// dot, which clashed with the grouped numbers beside it on the same card.
export function fmtRating(n: number, locale: string, digits = 1): string {
  if (!Number.isFinite(n)) return "";
  return n.toFixed(digits).replace(".", locale === "en" ? "." : ",");
}
