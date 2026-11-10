"use client";

import "./detail.css";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { dateTimeFull, fmtAgeMin } from "@/lib/date";
import { initials } from "@/components/crm/bits";
import { prettyPhone } from "../now/feed";
import { CopyButton } from "../now/NowFocus";
import { IcCheck, IcClock, IcClose, IcInbox, IcMeeting, IcPhone, IcRefresh, IcTimeline, IcUser, IcBolt } from "../icons";

// The call-center's detail furniture («Tafsilotlar», «Batafsil»): one primary
// block, grouped sections with icon headers, people as people, status and
// time as coloured chips, and a timeline whose every dot carries an icon.
// Styled on the ccx tokens, with fallbacks to the portal's own, so the same
// markup reads right inside the call-center and in the lawyer cabinet.

export type DkTone = "ok" | "warn" | "hot" | "info" | "mute";

const MOTION_MS = 260;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Opens and closes its content with a height + fade motion, keeps it mounted
// while it closes, and skips the motion for prefers-reduced-motion.
export function Disclosure({ open, id, className, children }: { open: boolean; id?: string; className?: string; children: ReactNode }) {
  // shown: the open look is applied (one frame after mounting, so the
  // motion has a start). linger: still mounted while the close plays.
  const [shown, setShown] = useState(open);
  const [linger, setLinger] = useState(open);

  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setShown(true);
          setLinger(true);
        }),
      );
      return () => cancelAnimationFrame(raf);
    }
    const raf = requestAnimationFrame(() => setShown(false));
    const tm = window.setTimeout(() => setLinger(false), reducedMotion() ? 0 : MOTION_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tm);
    };
  }, [open]);

  if (!open && !linger) return null;
  return (
    <div id={id} className={`opx-dk-disc${className ? ` ${className}` : ""}`} data-open={(open && shown) || undefined} inert={!open || undefined}>
      <div className="opx-dk-disc__in">{children}</div>
    </div>
  );
}

// "5 daq oldin" / "26 soat o'tib" next to the absolute date and time.
export function useWhen() {
  const t = useTranslations("admin.ccx.detail");
  const locale = useLocale();
  return (at: string, now = Date.now()) => {
    const ms = Date.parse(at);
    if (!at || !Number.isFinite(ms)) return { rel: "", abs: "", future: false };
    const diff = (ms - now) / 60000;
    const abs = dateTimeFull(at, locale);
    if (Math.abs(diff) < 1) return { rel: t("now"), abs, future: diff > 0 };
    const time = fmtAgeMin(Math.abs(diff), locale);
    return { rel: diff > 0 ? t("in", { time }) : t("ago", { time }), abs, future: diff > 0 };
  };
}

export function When({ at, className }: { at: string; className?: string }) {
  const when = useWhen();
  const w = when(at);
  if (!w.abs) return null;
  return (
    <time className={`opx-dk-when${className ? ` ${className}` : ""}`} dateTime={at} title={w.abs}>
      <b className="opx-num">{w.rel}</b>
      <span className="opx-num">{w.abs}</span>
    </time>
  );
}

export function Chip({ tone = "mute", icon, dot, live, title, children }: { tone?: DkTone; icon?: ReactNode; dot?: boolean; live?: boolean; title?: string; children: ReactNode }) {
  return (
    <span className="opx-dk-chip" data-tone={tone} data-live={live || undefined} title={title}>
      {dot ? <i aria-hidden="true" /> : null}
      {icon}
      <span>{children}</span>
    </span>
  );
}

export function Avatar({ name, tone = "info", size = "md" }: { name: string; tone?: DkTone; size?: "md" | "lg" }) {
  return (
    <span className={`opx-dk-av opx-dk-av--${size}`} data-tone={tone} aria-hidden="true">
      {name.trim() ? initials(name) : <IcUser size={size === "lg" ? 22 : 17} />}
    </span>
  );
}

function telOf(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

// A phone the viewer may use: a tap-to-call link, copyable. A withheld one
// is a lock pill (the caller passes the lock), never bare coloured text.
export function PhoneLine({ phone, name, locked }: { phone?: string; name?: string; locked?: ReactNode }) {
  const t = useTranslations("admin.ccx.detail");
  const dial = telOf(phone ?? "");
  if (dial && phone) {
    return (
      <span className="opx-dk-phone">
        <a className="opx-dk-tel opx-num" dir="ltr" href={`tel:${dial}`} aria-label={t("callAria", { name: name || prettyPhone(phone) })}>
          <IcPhone size={15} />
          {prettyPhone(phone)}
        </a>
        <CopyButton value={phone} label={t("phone")} />
      </span>
    );
  }
  if (locked) return <span className="opx-dk-lock">{locked}</span>;
  return null;
}

// The primary block: who this is about, and the one fact that matters next.
export function Hero({ role, name, avatarName, tone, phone, locked, meta, aside, children }: { role: string; name: ReactNode; avatarName: string; tone?: DkTone; phone?: string; locked?: ReactNode; meta?: ReactNode; aside?: ReactNode; children?: ReactNode }) {
  return (
    <section className="opx-dk-hero">
      <div className="opx-dk-hero__who">
        <Avatar name={avatarName} tone={tone} size="lg" />
        <div className="opx-dk-hero__txt">
          <small>{role}</small>
          <b>{name}</b>
          <PhoneLine phone={phone} name={avatarName} locked={locked} />
          {meta ? <span className="opx-dk-hero__meta">{meta}</span> : null}
        </div>
      </div>
      {aside ? <div className="opx-dk-hero__next">{aside}</div> : null}
      {children}
    </section>
  );
}

// The "most important next fact" tile inside the hero.
export function NextFact({ icon, label, tone = "info", children }: { icon: ReactNode; label: string; tone?: DkTone; children: ReactNode }) {
  return (
    <div className="opx-dk-next" data-tone={tone}>
      <span className="opx-dk-next__ic" aria-hidden="true">
        {icon}
      </span>
      <span className="opx-dk-next__txt">
        <small>{label}</small>
        {children}
      </span>
    </div>
  );
}

export function Group({ icon, title, count, tone, aside, wide, children }: { icon: ReactNode; title: string; count?: number; tone?: "ok" | "hot" | "warn"; aside?: ReactNode; wide?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <section className={`opx-dk-group${wide ? " is-wide" : ""}`} data-tone={tone} aria-labelledby={id}>
      <header className="opx-dk-group__h">
        <span className="opx-dk-group__ic" aria-hidden="true">
          {icon}
        </span>
        <h4 id={id}>{title}</h4>
        {count != null ? <b className="opx-dk-count opx-num">{count}</b> : null}
        {aside ? <span className="opx-dk-group__aside">{aside}</span> : null}
      </header>
      <div className="opx-dk-group__b">{children}</div>
    </section>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="opx-dk-grid">{children}</div>;
}

export type Person = { key: string; name: ReactNode; avatarName: string; role: string; phone?: string; locked?: ReactNode; me?: boolean; tone?: DkTone };

export function People({ people }: { people: Person[] }) {
  const t = useTranslations("admin.ccx.detail");
  return (
    <ul className="opx-dk-people">
      {people.map((p) => (
        <li key={p.key} data-me={p.me || undefined}>
          <Avatar name={p.avatarName} tone={p.tone ?? (p.me ? "ok" : "info")} />
          <span className="opx-dk-people__txt">
            <b>
              {p.name}
              {p.me ? <em className="opx-dk-me">{t("you")}</em> : null}
            </b>
            <small>{p.role}</small>
          </span>
          <PhoneLine phone={p.phone} name={p.avatarName} locked={p.locked} />
        </li>
      ))}
    </ul>
  );
}

export type FactItem = { key: string; icon: ReactNode; label: string; value: ReactNode };

export function Facts({ items: all }: { items: (FactItem | null | false | undefined)[] }) {
  const items = all.filter((f): f is FactItem => !!f);
  if (!items.length) return null;
  return (
    <dl className="opx-dk-facts">
      {items.map((f) => (
        <div key={f.key}>
          <span className="opx-dk-facts__ic" aria-hidden="true">
            {f.icon}
          </span>
          <span className="opx-dk-facts__txt">
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </span>
        </div>
      ))}
    </dl>
  );
}

// The human code (ADV-…, #69E71328), copyable. Never an internal id.
export function CodeRow({ code, label }: { code: string; label?: string }) {
  const t = useTranslations("admin.ccx.detail");
  if (!code) return null;
  const name = label ?? t("code");
  return (
    <span className="opx-dk-code">
      <small>{name}</small>
      <b className="opx-num">{code}</b>
      <CopyButton value={code} label={name} />
    </span>
  );
}

export type HistoryStep = { id: string; at: string; title: string; sub?: string; icon?: ReactNode; tone?: DkTone };

// A real timeline: every dot carries an icon, the newest one is lit.
export function History({ steps, empty, newestFirst }: { steps: HistoryStep[]; empty: string; newestFirst?: boolean }) {
  const when = useWhen();
  const list = newestFirst ? [...steps].reverse() : steps;
  const lit = newestFirst ? 0 : list.length - 1;
  if (!list.length) return <p className="opx-dk-none">{empty}</p>;
  return (
    <ol className="opx-dk-tl">
      {list.map((s, i) => {
        const w = when(s.at);
        return (
          <li key={s.id} data-tone={s.tone ?? (i === lit ? "info" : "mute")} data-lit={i === lit || undefined}>
            <span className="opx-dk-tl__dot" aria-hidden="true">
              {s.icon ?? <IcTimeline size={14} />}
            </span>
            <span className="opx-dk-tl__txt">
              <b>{s.title}</b>
              {s.sub ? <small>{s.sub}</small> : null}
            </span>
            {w.abs ? (
              <time className="opx-dk-tl__at opx-num" dateTime={s.at} title={w.abs}>
                <b>{w.rel}</b>
                <span>{w.abs}</span>
              </time>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// The icon a request's lifecycle status carries on its timeline dot.
export function statusIcon(status: string, size = 14): ReactNode {
  switch (status) {
    case "open_pool":
    case "new":
    case "created":
      return <IcInbox size={size} />;
    case "claimed":
    case "assigned":
      return <IcUser size={size} />;
    case "scheduled":
      return <IcClock size={size} />;
    case "meeting_active":
      return <IcMeeting size={size} />;
    case "in_progress":
      return <IcBolt size={size} />;
    case "completed":
    case "done":
      return <IcCheck size={size} />;
    case "cancelled":
    case "expired":
    case "rejected":
      return <IcClose size={size} />;
    default:
      return <IcTimeline size={size} />;
  }
}

export function Skeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div className="opx-dk-skel" aria-busy="true" aria-label={label} role="status">
      {Array.from({ length: rows }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}

export function Failed({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const t = useTranslations("admin.ccx.detail");
  return (
    <div className="opx-dk-fail" role="alert">
      <span className="opx-dk-fail__ic" aria-hidden="true">
        <IcClose size={16} />
      </span>
      <span>{text}</span>
      {onRetry ? (
        <button type="button" className="opx-dk-btn" onClick={onRetry}>
          <IcRefresh size={15} />
          {t("retry")}
        </button>
      ) : null}
    </div>
  );
}

export function Root({ className, children, ...rest }: { className?: string; children: ReactNode } & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <div className={`opx-dk${className ? ` ${className}` : ""}`} {...rest}>
      {children}
    </div>
  );
}
