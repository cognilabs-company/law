"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { dateOnly, dateTimeFull, monthTitle, timeOnly, weekdays } from "@/lib/date";
import { fmtUzs, fmtUzsShort } from "@/lib/money";
import { initials } from "@/lib/lawyers";
import { humanize } from "@/lib/labels";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { IconAlert, IconClose, IconInfo, IconRefresh } from "@/components/icons";
import { usePathname } from "@/i18n/navigation";
import { NAV_GROUPS, activeNav } from "@/components/internal/nav";

// Shared building blocks of the internal HRM pages. They follow the portal's
// own surfaces (ppanel's inset ring and large radius, ptable's header row,
// the admin drawer) so the HRM reads as part of the same product rather than
// a separate tool bolted onto it.

type Icon = ComponentType<{ className?: string }>;

// ── Formatting ──────────────────────────────────────────────────────────────

export function useHrmFormat() {
  const locale = useLocale();
  const t = useTranslations("internal.ui");
  const units = { mln: t("mln"), mlrd: t("mlrd") };
  return {
    locale,
    date: (v: string) => (v ? dateOnly(v, locale) : "—"),
    dateTime: (v: string) => (v ? dateTimeFull(v, locale) : "—"),
    time: (v: string) => (v ? timeOnly(v, locale) : "—"),
    // 513 → "8 h 33 min"; nothing worked is a dash, not "0 h 0 min".
    minutes: (n: number) => {
      if (!n || n < 0) return "—";
      const h = Math.floor(n / 60);
      const m = Math.round(n % 60);
      return h ? (m ? t("hm", { h, m }) : t("h", { h })) : t("m", { m });
    },
    money: (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${fmtUzs(n)} ${t("som")}`),
    moneyShort: (n: number) => `${fmtUzsShort(n, units, locale)} ${t("som")}`,
    // "2026-10" → "Oktabr 2026"; anything else is shown as the backend sent it.
    period: (p: string) => {
      const m = /^(\d{4})-(\d{2})$/.exec(p || "");
      return m ? monthTitle(Number(m[1]), Number(m[2]) - 1, locale) : p || "—";
    },
    weekday: (day: number) => weekdays(locale)[day - 1] ?? String(day),
    num: (n: number) => (Number.isFinite(n) ? String(Math.round(n * 10) / 10).replace(".", locale === "en" ? "." : ",") : "—"),
  };
}

// The current time for "is this overdue?", read in an effect rather than
// during render (render must stay pure), and refreshed once a minute so a
// deadline that passes while the page is open turns red on its own.
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const h = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(h);
    };
  }, [intervalMs]);
  return now;
}

export const isOverdue = (deadline: string, status: string, now: number) =>
  !!deadline && now > 0 && !["done", "cancelled"].includes(status) && new Date(deadline).getTime() < now;

// ── Status & priority ───────────────────────────────────────────────────────

type Tone = "ok" | "info" | "warn" | "err" | "gray";
const TONE: Record<string, Tone> = {
  done: "ok", active: "ok", present: "ok", approved: "ok", paid: "ok", completed: "ok",
  new: "info", accepted: "info", in_progress: "info", remote: "info",
  in_review: "warn", paused: "warn", draft: "warn", pending: "warn", late: "warn", on_leave: "warn", vacation: "warn", sick: "warn",
  returned: "err", rejected: "err", absent: "err", terminated: "err",
  cancelled: "gray", inactive: "gray", archived: "gray",
  resolved: "ok", triaged: "info", calculated: "info", closed: "gray", revoked: "gray", expired: "gray",
  assigned: "info", open: "info", screening: "info", interview: "info", offer: "warn", hired: "ok", effective: "ok", review: "warn", blocked: "err", on_hold: "gray",
};

export function useStatusLabel() {
  const t = useTranslations("internal.ui.status");
  return (value: string) => (!value ? "—" : t.has(value) ? t(value) : humanize(value));
}

export function HrmStatus({ value }: { value: string }) {
  const label = useStatusLabel();
  if (!value) return <span className="hrm-st hrm-st--gray">—</span>;
  return <span className={`hrm-st hrm-st--${TONE[value] ?? "gray"}`}>{label(value)}</span>;
}

export function HrmPriority({ value }: { value: string }) {
  const t = useTranslations("internal.ui.priority");
  const v = value || "normal";
  return <span className={`hrm-prio hrm-prio--${v}`}><i aria-hidden />{t.has(v) ? t(v) : humanize(v)}</span>;
}

// ── People ──────────────────────────────────────────────────────────────────

// A stable colour per person (from the name), so the same face keeps the same
// avatar across the board, the tables and the drawer.
const AVATAR_TONES = 6;
function toneOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % AVATAR_TONES;
}

export function HrmAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const label = name.trim() || "?";
  return <span className={`hrm-av hrm-av--${size} hrm-av--t${toneOf(label)}`} aria-hidden>{initials(label)}</span>;
}

export function HrmPerson({ name, sub, size = "md" }: { name: string; sub?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className="hrm-person">
      <HrmAvatar name={name} size={size} />
      <span className="hrm-person__t">
        <b>{name || "—"}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
    </span>
  );
}

// ── Layout ──────────────────────────────────────────────────────────────────

// The page header: the section's own icon (from the navigation), the title,
// one line of facts under it and the page's actions on the right. The group
// the page belongs to is already named in the top bar, so there is no kicker.
export function HrmHead({ title, lead, actions, meta }: { kicker?: string; title: string; lead?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  const pathname = usePathname();
  const Ico = activeNav(pathname, NAV_GROUPS.flatMap((g) => g.items))?.Icon;
  return (
    <header className="hrm-head">
      {Ico ? <span className="hrm-head__i" aria-hidden><Ico /></span> : null}
      <div className="hrm-head__t">
        <div className="hrm-head__row">
          <h2>{title}</h2>
          {meta}
        </div>
        {lead ? <p>{lead}</p> : null}
      </div>
      {actions ? <div className="hrm-head__a">{actions}</div> : null}
    </header>
  );
}

// A note inside a page: something to know (info), to watch (warn), or a
// feature the screen shows but the backend does not serve yet (soon).
export function HrmCallout({ tone = "info", title, children, action }: { tone?: "info" | "warn" | "ok" | "soon"; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`hrm-callout hrm-callout--${tone}`} role="note">
      <IconInfo />
      <div className="hrm-callout__t">
        {title ? <b>{title}</b> : null}
        {children ? <span>{children}</span> : null}
      </div>
      {action}
    </div>
  );
}

// A control for something the product will do but the backend cannot serve
// yet: shown, labelled, and not clickable — so nobody waits on a dead button.
export function HrmSoon({ children, icon: Ico }: { children: ReactNode; icon?: Icon }) {
  const t = useTranslations("internal.ui");
  return (
    <span className="hrm-soon" title={t("soonHint")} aria-disabled="true">
      {Ico ? <Ico /> : null}
      {children}
      <em>{t("soon")}</em>
    </span>
  );
}

export function HrmPanel({
  title,
  icon: Ico,
  count,
  actions,
  children,
  className,
  flush,
}: {
  title?: ReactNode;
  icon?: Icon;
  count?: number | string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`hrm-panel${flush ? " hrm-panel--flush" : ""}${className ? ` ${className}` : ""}`}>
      {title || actions ? (
        <div className="hrm-panel__h">
          <h3>
            {Ico ? <span className="hrm-panel__i"><Ico /></span> : null}
            <span>{title}</span>
            {count !== undefined ? <span className="hrm-count">{count}</span> : null}
          </h3>
          {actions ? <div className="hrm-panel__a">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

// A number with its name. Given onClick it is also a filter: pressing it
// narrows the list below to what the number counts, pressing again clears.
export function HrmStat({ icon: Ico, label, value, hint, tone = "blue", onClick, active }: { icon: Icon; label: string; value: ReactNode; hint?: ReactNode; tone?: "blue" | "ok" | "warn" | "violet" | "err" | "cyan"; onClick?: () => void; active?: boolean }) {
  const body = (
    <>
      <span className="hrm-stat__i"><Ico /></span>
      <b className="hrm-stat__v">{value}</b>
      <span className="hrm-stat__l">{label}</span>
      {hint ? <small className="hrm-stat__h">{hint}</small> : null}
    </>
  );
  if (onClick) return <button type="button" className={`hrm-stat hrm-stat--${tone} hrm-stat--btn${active ? " is-on" : ""}`} onClick={onClick} aria-pressed={!!active}>{body}</button>;
  return <div className={`hrm-stat hrm-stat--${tone}`}>{body}</div>;
}

export function HrmEmpty({ icon: Ico, title, text, action }: { icon?: Icon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="hrm-empty">
      {Ico ? <span className="hrm-empty__i"><Ico /></span> : null}
      <b>{title}</b>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}

export function HrmLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="hrm-skel" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => <span key={i} />)}
    </div>
  );
}

export function HrmError({ text, onRetry, retryLabel }: { text: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="hrm-error" role="alert">
      <IconAlert />
      <span>{text}</span>
      {onRetry ? <button type="button" className="btn btn--line btn--sm" onClick={onRetry}><IconRefresh />{retryLabel}</button> : null}
    </div>
  );
}

export function HrmKv({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="hrm-kv">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// 0–100 bar; over target is still drawn full, the number says how far over.
export function HrmBar({ value, tone }: { value: number; tone?: "ok" | "warn" | "err" | "blue" }) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const auto = tone ?? (pct >= 90 ? "ok" : pct >= 60 ? "blue" : pct >= 40 ? "warn" : "err");
  return <span className={`hrm-bar hrm-bar--${auto}`} role="presentation"><i style={{ width: `${pct}%` }} /></span>;
}

// ── Forms ───────────────────────────────────────────────────────────────────

// One person, unit or position, picked from the directory — never an id typed
// by hand (10-09 §11: "ID input qo'lda yozilmasin").
export function EntitySelect({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SearchOption[];
  placeholder: string;
  ariaLabel: string;
}) {
  const t = useTranslations("internal.ui");
  return (
    <SearchSelect
      single
      value={value ? [value] : []}
      onChange={(v) => onChange(v[v.length - 1] ?? "")}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={t("search")}
      emptyText={t("noOptions")}
      ariaLabel={ariaLabel}
      removeLabel={t("clear")}
    />
  );
}

// ── Drawer ──────────────────────────────────────────────────────────────────

// The admin's side drawer (.ldrw), for details that should not cost the page
// the list the user was working through.
export function HrmDrawer({
  open,
  onClose,
  title,
  sub,
  head,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  head?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useTranslations("internal.ui");
  const panel = useRef<HTMLElement>(null);
  // Something was typed: the X, the scrim and Esc ask before throwing it
  // away. A form's own Cancel and a successful save close without asking.
  const dirty = useRef(false);
  const [asking, setAsking] = useState(false);
  const requestClose = useCallback(() => {
    if (dirty.current) setAsking(true);
    else onClose();
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    dirty.current = false;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, requestClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="ldrw__scrim" onClick={requestClose} />
      <aside
        className="ldrw hrm-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
        onInput={(e) => {
          const el = e.target as HTMLElement;
          if (el.matches("input:not([type=search]),textarea")) dirty.current = true;
        }}
      >
        {asking ? (
          <div className="hrm-guard" role="alertdialog" aria-label={t("unsaved")}>
            <span>{t("unsaved")}</span>
            <button type="button" className="btn btn--line btn--sm" onClick={() => setAsking(false)}>{t("keepEditing")}</button>
            <button type="button" className="btn btn--pri btn--sm" onClick={() => { setAsking(false); onClose(); }}>{t("discard")}</button>
          </div>
        ) : null}
        <div className="ldrw__head">
          <div className="hrm-drawer__head">
            {head}
            <span>
              <b className="ldrw__name">{title}</b>
              {sub ? <small className="hrm-drawer__sub">{sub}</small> : null}
            </span>
          </div>
          <button className="ldrw__x" type="button" onClick={requestClose} aria-label={t("close")}><IconClose /></button>
        </div>
        <div className="ldrw__body">{children}</div>
        {footer ? <div className="hrm-drawer__foot">{footer}</div> : null}
      </aside>
    </>,
    document.body,
  );
}

export function HrmSection({ label, children, aside }: { label: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="ldrw__sec">
      <span className="hrm-sec__h"><span className="ldrw__lbl">{label}</span>{aside}</span>
      {children}
    </div>
  );
}
