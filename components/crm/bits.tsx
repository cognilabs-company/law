"use client";

import "./crm.css";
import { useCallback, useEffect, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { IconChartBar, IconChevronLeft, IconFileText, IconFlame, IconGrid, IconInbox, IconLayers, IconSearch, IconUsers } from "@/components/icons";
import { errDetail } from "@/lib/http";
import { CRM_STATUSES, crmCan, crmCode, crmGlobalAnalytics, type CrmMeta } from "@/lib/services/crm";
import { minutesUntil, useLiveState } from "@/lib/crm/useCrm";

export const statusVar = (s: string) => ({ ["--sc" as string]: `var(--s-${s}, var(--crm-muted))` });

export function StatusPill({ status }: { status: string }): ReactElement {
  const t = useTranslations("crm.status");
  return (
    <span className="crm-pill" style={statusVar(status)}>
      <i aria-hidden="true" />
      {t.has(status) ? t(status) : status}
    </span>
  );
}

// The seven stages as dots; `closed` lights none of the journey.
export function StageDots({ status }: { status: string }): ReactElement {
  const t = useTranslations("crm.status");
  const at = CRM_STATUSES.indexOf(status as (typeof CRM_STATUSES)[number]);
  const journey = CRM_STATUSES.slice(0, 6);
  return (
    <span className="crm-dots" style={statusVar(status)} aria-label={t.has(status) ? t(status) : status} role="img">
      {journey.map((s, i) => (
        <i key={s} data-on={status !== "closed" && i <= at ? "" : undefined} />
      ))}
    </span>
  );
}

export function ScoreChip({ score }: { score: string }): ReactElement | null {
  const t = useTranslations("crm.score");
  if (!score) return null;
  return (
    <span className="crm-score" data-s={score}>
      {score === "hot" ? <IconFlame aria-hidden="true" /> : null}
      {t.has(score) ? t(score) : score}
    </span>
  );
}

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "·";

export function Avatar({ name, large = false, title }: { name: string; large?: boolean; title?: string }): ReactElement {
  return (
    <span className={`crm-avatar${large ? " crm-avatar--lg" : ""}${name ? "" : " crm-avatar--none"}`} title={title ?? name} aria-hidden={title ? undefined : true}>
      {name ? initials(name) : "?"}
    </span>
  );
}

// "in 25 min", "overdue 3 h": the next action at a glance.
export function WhenChip({ at, now }: { at: string; now: number }): ReactElement | null {
  const t = useTranslations("crm.when");
  const m = minutesUntil(at, now);
  if (m === null) return null;
  const abs = Math.abs(m);
  const span = abs < 60 ? t("min", { n: abs }) : abs < 60 * 48 ? t("h", { n: Math.round(abs / 60) }) : t("d", { n: Math.round(abs / 1440) });
  const tone = m < 0 ? "bad" : m <= 60 ? "soon" : "";
  return (
    <span className="crm-when" data-tone={tone || undefined} title={at}>
      {m < 0 ? t("overdue", { span }) : abs < 1 ? t("now") : t("in", { span })}
    </span>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }): ReactElement {
  return (
    <div className="crm-empty">
      <span className="crm-empty__art" aria-hidden="true">
        {icon ?? <IconInbox />}
      </span>
      <b>{title}</b>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}

export function SkeletonRows({ n = 5 }: { n?: number }): ReactElement {
  return (
    <div className="crm-card" aria-busy="true">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="crm-sk" style={{ width: `${92 - ((i * 13) % 40)}%` }} />
      ))}
    </div>
  );
}

// A short, helpful line for an error: the code's own text when we have one,
// the server's message otherwise. Logic elsewhere branches on the code.
// Stable across renders: loaders list it as a dependency, and a new
// function every render would make them refetch forever.
export function useCrmError(): (e: unknown) => string {
  const t = useTranslations("crm.err");
  return useCallback(
    (e: unknown) => {
      const code = crmCode(e);
      if (code && t.has(code)) return t(code);
      return errDetail(e) || t("generic");
    },
    [t],
  );
}

export function LiveDot(): ReactElement {
  const t = useTranslations("crm.live");
  const s = useLiveState();
  return (
    <span className="crm-live" data-s={s} role="status" aria-live="polite" title={t(s)}>
      <i aria-hidden="true" />
      {t(s)}
    </span>
  );
}

const SECTIONS = [
  { href: "/admin/crm", key: "overview", Icon: IconGrid, ok: (m: CrmMeta | null) => crmCan(m, "crm.leads.view") || crmCan(m, "crm.customers.view") },
  { href: "/admin/crm/leads", key: "leads", Icon: IconLayers, ok: (m: CrmMeta | null) => crmCan(m, "crm.leads.view") },
  { href: "/admin/crm/customers", key: "customers", Icon: IconUsers, ok: (m: CrmMeta | null) => crmCan(m, "crm.customers.view") },
  { href: "/admin/crm/templates", key: "templates", Icon: IconFileText, ok: (m: CrmMeta | null) => crmCan(m, "crm.leads.view") },
  { href: "/admin/crm/analytics", key: "analytics", Icon: IconChartBar, ok: (m: CrmMeta | null) => crmGlobalAnalytics(m) },
];

// The CRM's own header on every page: sections, the live dot and search.
export type CrmBack = { href: string; label: string };

// Back to where the operator came from inside the CRM; the list otherwise.
export function BackButton({ back }: { back: CrmBack }): ReactElement {
  const router = useRouter();
  return (
    <button
      type="button"
      className="crm-back"
      onClick={() => {
        const fromCrm = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin) && /\/admin\/crm/.test(document.referrer);
        if (fromCrm && window.history.length > 1) router.back();
        else router.push(back.href);
      }}
    >
      <IconChevronLeft aria-hidden="true" />
      {back.label}
    </button>
  );
}

export function CrmTop({ meta, title, onPalette, tools, back }: { meta: CrmMeta | null; title: string; onPalette: () => void; tools?: ReactNode; back?: CrmBack }): ReactElement {
  const t = useTranslations("crm");
  const path = usePathname();
  const current = SECTIONS.filter((s) => s.ok(meta))
    .slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((s) => path === s.href || path.startsWith(`${s.href}/`));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPalette]);
  return (
    <header className="crm-top">
      {back ? <BackButton back={back} /> : null}
      <h1 className="crm-top__title">
        <i aria-hidden="true">
          <IconLayers />
        </i>
        {title}
      </h1>
      <nav className="crm-nav" aria-label={t("navLabel")}>
        {SECTIONS.filter((s) => s.ok(meta)).map((s) => (
          <Link key={s.key} href={s.href} aria-current={current?.key === s.key ? "page" : undefined}>
            <s.Icon aria-hidden="true" />
            {t(`nav.${s.key}`)}
          </Link>
        ))}
      </nav>
      <div className="crm-top__tools">
        <LiveDot />
        <button type="button" className="crm-kbd" onClick={onPalette} aria-label={t("palette.open")}>
          <IconSearch aria-hidden="true" />
          {t("palette.placeholder")}
          <kbd>⌘K</kbd>
        </button>
        {tools}
      </div>
    </header>
  );
}
