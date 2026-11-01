"use client";

import "./mtm.css";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { fmtDate, fmtNum, shortDate } from "@/lib/date";
import { isAborted } from "@/lib/http";
import { onUserSocketResync, subscribeUserEvents } from "@/lib/userSocket";
import { useSocketOnline } from "@/lib/useSupportEvents";
import { isPrimaryOnly } from "@/lib/services/superadvokat";
import { MTM_DEBOUNCE_MS, MTM_TZ, createDebounce, isMtmEvent, mtmErrorKey, tashParts, type MtmEvent } from "@/lib/services/mobileTesting";
import { IconAlert, IconBolt, IconCheck, IconChevronLeft, IconChevronRight, IconClock, IconHelpCircle, IconHourglass, IconLock, IconRefresh } from "@/components/icons";

// ── Loading ───────────────────────────────────────────────────────────────

export type Load<T> = {
  status: "loading" | "ready" | "error";
  data: T | null;
  error: unknown;
  // A background refetch (realtime event, manual refresh) that failed: the
  // last good data stays on screen with a quiet note.
  refreshFailed: boolean;
  refreshing: boolean;
  // When the shown data was last read, for the "updated at" line.
  at: number;
  reload: (silent?: boolean) => void;
};

// Loads `fetcher` whenever `key` changes (skeleton), and again in the
// background on reload(true). A newer request always wins over an older one.
export function useMtmLoad<T>(fetcher: ((signal: AbortSignal) => Promise<T>) | null, key: string): Load<T> {
  const [st, setSt] = useState<{ key: string; status: Load<T>["status"]; data: T | null; error: unknown; refreshFailed: boolean; refreshing: boolean; at: number }>({
    key,
    status: "loading",
    data: null,
    error: null,
    refreshFailed: false,
    refreshing: false,
    at: 0,
  });
  if (st.key !== key) setSt({ key, status: "loading", data: null, error: null, refreshFailed: false, refreshing: false, at: 0 });
  const fetchRef = useRef(fetcher);
  useEffect(() => {
    fetchRef.current = fetcher;
  });
  const ctl = useRef<AbortController | null>(null);
  const run = useCallback(
    (silent: boolean) => {
      const f = fetchRef.current;
      if (!f) return;
      ctl.current?.abort();
      const c = new AbortController();
      ctl.current = c;
      f(c.signal)
        .then((data) => {
          if (ctl.current !== c) return;
          setSt((s) => ({ ...s, status: "ready", data, error: null, refreshFailed: false, refreshing: false, at: Date.now() }));
        })
        .catch((error: unknown) => {
          if (ctl.current !== c || isAborted(error)) return;
          setSt((s) =>
            silent && s.data !== null && !isPrimaryOnly(error)
              ? { ...s, refreshFailed: true, refreshing: false }
              : { ...s, status: "error", data: null, error, refreshing: false },
          );
        });
    },
    [],
  );
  const enabled = fetcher !== null;
  useEffect(() => {
    if (enabled) run(false);
    return () => ctl.current?.abort();
  }, [key, enabled, run]);
  return { status: st.status, data: st.data, error: st.error, refreshFailed: st.refreshFailed, refreshing: st.refreshing, at: st.at, reload: (silent = true) => {
    if (silent) setSt((s) => ({ ...s, refreshing: true }));
    run(silent);
  } };
}

// ── Realtime ──────────────────────────────────────────────────────────────

// The four mobile_testing.* events on the existing /ws/users/me socket
// (the backend subscribes the primary superadmin on its own; nothing is
// sent). A burst becomes one refetch MTM_DEBOUNCE_MS after the last event,
// and a reconnect refetches once. `accept` can drop an event for another
// installation.
export function useMtmLive(events: readonly MtmEvent[], refetch: () => void, accept?: (e: Record<string, unknown>) => boolean): boolean {
  const online = useSocketOnline();
  const ref = useRef({ refetch, accept, events });
  useEffect(() => {
    ref.current = { refetch, accept, events };
  });
  useEffect(() => {
    const deb = createDebounce(() => ref.current.refetch(), MTM_DEBOUNCE_MS);
    const off = subscribeUserEvents((e) => {
      if (!isMtmEvent(e.event) || !ref.current.events.includes(e.event)) return;
      if (ref.current.accept && !ref.current.accept(e)) return;
      deb.call();
    });
    const offSync = onUserSocketResync(() => deb.call());
    return () => {
      off();
      offSync();
      deb.cancel();
    };
  }, []);
  return online;
}

// ── Time and numbers ──────────────────────────────────────────────────────

// A backend instant shown on the Tashkent clock. The zone is in the
// tooltip and the screen reader text; each section also names it.
export function TashTime({ iso, date = true, empty }: { iso: string; date?: boolean; empty?: string }) {
  const locale = useLocale();
  const t = useTranslations("admin.mtm");
  const p = tashParts(iso);
  if (!p) return <span className="mtm-muted">{empty ?? t("none")}</span>;
  const text = date ? `${shortDate(p.date, locale)}, ${p.time}` : p.time;
  const full = `${fmtDate(p.date, locale)}, ${p.time} · ${t("tzShort")}`;
  return (
    <time dateTime={iso} title={full} aria-label={full} className="mtm-time">
      {text}
    </time>
  );
}

// "Times: Tashkent (UTC+5)" — beside every block that shows clock times.
export function TzNote({ className }: { className?: string }) {
  const t = useTranslations("admin.mtm");
  return (
    <span className={`mtm-tz${className ? ` ${className}` : ""}`} title={MTM_TZ}>
      <IconClock aria-hidden="true" />
      {t("tzNote")}
    </span>
  );
}

// Backend minutes as words: "42 min", "4 h 17 min". Formatting only.
export function useMinutes(): (minutes: number) => string {
  const locale = useLocale();
  const t = useTranslations("admin.mtm.unit");
  return (minutes: number) => {
    const m = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
    if (m < 60) return t("min", { n: fmtNum(m, locale, m > 0 && m < 10 && !Number.isInteger(m) ? 1 : 0) });
    const whole = Math.round(m);
    const h = Math.floor(whole / 60);
    const rest = whole % 60;
    return rest ? `${t("h", { n: h })} ${t("min", { n: rest })}` : t("h", { n: h });
  };
}

export function useLabels() {
  const t = useTranslations("admin.mtm");
  const locale = useLocale();
  const pick = (group: string, value: string, fallback: string) => (value && t.has(`${group}.${value}`) ? t(`${group}.${value}`) : fallback);
  return {
    platform: (v: string) => pick("platform", v, v ? t("platform.other") : t("none")),
    track: (v: string) => pick("track", v, v ? t("track.other") : t("none")),
    installStatus: (v: string) => pick("installStatus", v, t("installStatus.other")),
    // The tester's app language by name; a tag the browser can't name stays hidden.
    language: (v: string) => {
      if (!v) return t("none");
      const tag = v.replace("_", "-");
      if (t.has(`lang.${tag.slice(0, 2).toLowerCase()}`)) return t(`lang.${tag.slice(0, 2).toLowerCase()}`);
      try {
        const name = new Intl.DisplayNames([locale], { type: "language" }).of(tag);
        return name && name !== tag ? name : t("lang.other");
      } catch {
        return t("lang.other");
      }
    },
    device: (manufacturer: string, model: string) => [manufacturer, model].filter(Boolean).join(" ") || t("unknownDevice"),
  };
}

// ── Badges ────────────────────────────────────────────────────────────────

type Tone = "ok" | "info" | "warn" | "bad" | "off";
export function Badge({ tone, icon, children }: { tone: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="mtm-badge" data-tone={tone}>
      {icon}
      {children}
    </span>
  );
}

export function UsageBadge({ used }: { used: boolean }) {
  const t = useTranslations("admin.mtm");
  return used ? (
    <Badge tone="ok" icon={<IconCheck aria-hidden="true" />}>
      {t("used")}
    </Badge>
  ) : (
    <Badge tone="off">{t("notUsed")}</Badge>
  );
}

const SESSION_TONE: Record<string, Tone> = { active: "ok", completed: "info", stale: "warn" };
export function sessionIcon(status: string) {
  if (status === "active") return <IconBolt aria-hidden="true" />;
  if (status === "completed") return <IconCheck aria-hidden="true" />;
  if (status === "stale") return <IconHourglass aria-hidden="true" />;
  return <IconHelpCircle aria-hidden="true" />;
}
export const sessionTone = (status: string): Tone => SESSION_TONE[status] ?? "off";

const REPORT_TONE: Record<string, Tone> = { pending: "info", sending: "warn", sent: "ok", failed: "bad" };
export function ReportBadge({ status }: { status: string }) {
  const t = useTranslations("admin.mtm.reportStatus");
  const known = status in REPORT_TONE;
  const icon = status === "sent" ? <IconCheck aria-hidden="true" /> : status === "failed" ? <IconAlert aria-hidden="true" /> : status === "sending" ? <IconRefresh aria-hidden="true" /> : <IconClock aria-hidden="true" />;
  return (
    <Badge tone={REPORT_TONE[status] ?? "off"} icon={icon}>
      {known ? t(status) : t("other")}
    </Badge>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────

// An explanation that opens on hover, keyboard focus and tap alike (never
// hover-only), and closes on Escape or a second tap.
export function Tip({ label, text, icon, tone = "warn" }: { label: string; text: string; icon?: ReactNode; tone?: Tone }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const shown = open || hover;
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  return (
    <span className="mtm-tip" ref={box} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        className="mtm-badge mtm-badge--btn"
        data-tone={tone}
        aria-describedby={id}
        aria-expanded={shown}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setHover(false);
          }
        }}
      >
        {icon}
        {label}
        <IconHelpCircle aria-hidden="true" className="mtm-tip__q" />
      </button>
      <span role="tooltip" id={id} className="mtm-tip__box" data-open={shown || undefined}>
        {text}
      </span>
    </span>
  );
}

export function StaleBadge() {
  const t = useTranslations("admin.mtm");
  return <Tip label={t("sessionStatus.stale")} text={t("staleTip")} icon={<IconHourglass aria-hidden="true" />} />;
}

// ── Page chrome ───────────────────────────────────────────────────────────

const TABS = [
  { href: "/admin/mobile-testing", key: "overview" },
  { href: "/admin/mobile-testing/releases", key: "releases" },
  { href: "/admin/mobile-testing/reports", key: "reports" },
] as const;

export function MtmFrame({ children, lead }: { children: ReactNode; lead?: ReactNode }) {
  const t = useTranslations("admin.mtm");
  const path = usePathname();
  const on = (href: string) => (href === "/admin/mobile-testing" ? path === href || path.startsWith(`${href}/devices`) : path === href || path.startsWith(`${href}/`));
  return (
    <div className="mtm">
      <header className="mtm-hero">
        <div className="mtm-hero__txt">
          <span className="mtm-hero__kick">{t("kicker")}</span>
          <h2 className="mtm-hero__h">{t("title")}</h2>
          <p className="mtm-hero__p">{lead ?? t("lead")}</p>
        </div>
        <nav className="mtm-tabs" aria-label={t("tabsLabel")}>
          {TABS.map((x) => (
            <Link key={x.key} href={x.href} className="mtm-tab" aria-current={on(x.href) ? "page" : undefined}>
              {t(`tabs.${x.key}`)}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}

// Live / paused indicator, last read time and the manual refresh.
export function LiveBar({ online, at, refreshing, failed, onRefresh }: { online: boolean; at: number; refreshing: boolean; failed: boolean; onRefresh: () => void }) {
  const t = useTranslations("admin.mtm");
  const p = at ? tashParts(new Date(at).toISOString()) : null;
  return (
    <div className="mtm-live" data-on={online || undefined} role="status">
      <span className="mtm-live__dot" aria-hidden="true" />
      <span className="mtm-live__txt">
        <b>{online ? t("live.on") : t("live.off")}</b>
        <small>{online ? t("live.onHint") : t("live.offHint")}</small>
      </span>
      {p ? <span className="mtm-live__at">{t("live.updated", { time: p.time })}</span> : null}
      {failed ? (
        <span className="mtm-live__err">
          <IconAlert aria-hidden="true" />
          {t("live.refreshFailed")}
        </span>
      ) : null}
      <button type="button" className="btn btn--line btn--sm mtm-live__btn" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing || undefined}>
        <IconRefresh aria-hidden="true" className={refreshing ? "mtm-spin" : undefined} />
        {t("refresh")}
      </button>
    </div>
  );
}

// 403 primary_superadmin_required, in words.
export function MtmForbidden() {
  const t = useTranslations("admin.mtm");
  return (
    <div className="mtm-state mtm-state--lock" role="alert">
      <span className="mtm-state__ic">
        <IconLock aria-hidden="true" />
      </span>
      <b>{t("forbidden.title")}</b>
      <p>{t("forbidden.text")}</p>
      <Link href="/admin" className="btn btn--line btn--sm">
        {t("forbidden.back")}
      </Link>
    </div>
  );
}

// Any other failure: readable words and a retry, never the body.
export function MtmError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useTranslations("admin.mtm");
  if (isPrimaryOnly(error)) return <MtmForbidden />;
  return (
    <div className="mtm-state mtm-state--err" role="alert">
      <span className="mtm-state__ic">
        <IconAlert aria-hidden="true" />
      </span>
      <b>{t("error.title")}</b>
      <p>{t(`err.${mtmErrorKey(error)}`)}</p>
      <button type="button" className="btn btn--pri btn--sm" onClick={onRetry}>
        <IconRefresh aria-hidden="true" />
        {t("retry")}
      </button>
    </div>
  );
}

export function MtmEmpty({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="mtm-state">
      <span className="mtm-state__ic">{icon}</span>
      <b>{title}</b>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function MtmSkeleton({ rows = 4 }: { rows?: number }) {
  const t = useTranslations("admin.mtm");
  return (
    <div className="mtm-skel" aria-busy="true" aria-label={t("loading")}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}

// Offset pagination from the backend's total.
export function Pager({ total, limit, offset, onPage, busy }: { total: number; limit: number; offset: number; onPage: (offset: number) => void; busy?: boolean }) {
  const t = useTranslations("admin.mtm.pager");
  const locale = useLocale();
  if (total <= limit && offset === 0) return null;
  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + limit, total);
  return (
    <nav className="mtm-pager" aria-label={t("label")}>
      <button type="button" className="btn btn--line btn--sm" disabled={offset === 0 || busy} onClick={() => onPage(Math.max(0, offset - limit))}>
        <IconChevronLeft aria-hidden="true" />
        {t("prev")}
      </button>
      <span aria-live="polite">{t("range", { from: fmtNum(from, locale), to: fmtNum(to, locale), total: fmtNum(total, locale) })}</span>
      <button type="button" className="btn btn--line btn--sm" disabled={offset + limit >= total || busy} onClick={() => onPage(offset + limit)}>
        {t("next")}
        <IconChevronRight aria-hidden="true" />
      </button>
    </nav>
  );
}
