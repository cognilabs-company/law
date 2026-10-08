"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { dateOnly, dateTimeFull, fmtInt } from "@/lib/date";
import { humanize } from "@/lib/labels";
import { parseServerTime } from "@/lib/http";
import { onUserSocketResync, subscribeUserEvents, type UserEvent } from "@/lib/userSocket";
import { isStudioEvent, recheckStudio, studioErrorOf, type StudioStatus } from "@/lib/services/studio";
import { ctorMeta, type StudioGroup } from "@/lib/studio/constructors";
import { STUDIO_ERR } from "./editors/types";
import {
  IconAlert,
  IconCheck,
  IconCircleCheck,
  IconCircleX,
  IconEdit,
  IconHourglass,
  IconInbox,
  IconLayers,
  IconLock,
  IconRefresh,
  IconRocket,
  IconSend,
} from "@/components/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const STATUS_ICON: Record<StudioStatus, Icon> = {
  draft: IconEdit,
  submitted: IconSend,
  in_review: IconHourglass,
  changes_requested: IconRefresh,
  approved: IconCircleCheck,
  published: IconRocket,
  archived: IconInbox,
};

const ERR_TOKENS = new Set<string>(Object.values(STUDIO_ERR));

export function useStudioText() {
  const t = useTranslations("studio");
  const locale = useLocale();
  const status = (s: StudioStatus, raw = "") => {
    const r = raw.trim().toLowerCase();
    if ((r === "rejected" || r === "declined") && s === "changes_requested") return t("status.rejected");
    return t(`status.${s}`);
  };
  const ctorName = (code: string, fallback = "") => {
    const k = ctorMeta(code).i18nKey;
    if (k && t.has(`ctor.${k}.name`)) return t(`ctor.${k}.name`);
    return fallback || code;
  };
  const ctorDesc = (code: string) => {
    const k = ctorMeta(code).i18nKey;
    return k && t.has(`ctor.${k}.desc`) ? t(`ctor.${k}.desc`) : "";
  };
  const group = (g: StudioGroup | string) => (g && t.has(`groups.${g}`) ? t(`groups.${g}`) : humanize(g));
  const role = (r: string) => (r && t.has(`roles.${r}`) ? t(`roles.${r}`) : humanize(r));
  const stepStatus = (s: string) => (s && t.has(`stepStatus.${s}`) ? t(`stepStatus.${s}`) : humanize(s));
  const when = (iso: string) => (iso ? dateTimeFull(iso, locale) : "");
  const day = (iso: string) => (iso ? dateOnly(iso, locale) : "");
  const num = (n: number) => fmtInt(n, locale);
  const duration = (sec: number) => {
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return t("fmt.hm", { h, m });
    if (m > 0) return t("fmt.m", { m });
    return t("fmt.s", { s });
  };
  const ago = (iso: string, now: number) => {
    const at = parseServerTime(iso);
    if (!Number.isFinite(at) || !now) return iso ? dateTimeFull(iso, locale) : "";
    const sec = Math.max(0, Math.round((now - at) / 1000));
    if (sec < 60) return t("fmt.justNow");
    if (sec < 3600) return t("fmt.minAgo", { m: Math.floor(sec / 60) });
    if (sec < 86400) return t("fmt.hourAgo", { h: Math.floor(sec / 3600) });
    return dateTimeFull(iso, locale);
  };
  const fieldErr = (msg: string) => {
    if (!msg) return "";
    if (ERR_TOKENS.has(msg)) return t(`fieldErr.${msg.slice(1)}`);
    if (/^@[A-Za-z]+$/.test(msg) && t.has(`editors.err.${msg.slice(1)}`)) return t(`editors.err.${msg.slice(1)}`);
    return msg;
  };
  return { t, locale, status, ctorName, ctorDesc, group, role, stepStatus, when, day, num, duration, ago, fieldErr };
}

export function StudioStatusPill({ status, raw = "", small }: { status: StudioStatus; raw?: string; small?: boolean }) {
  const { status: label } = useStudioText();
  const rejected = /^(rejected|declined)$/i.test(raw.trim());
  const Glyph = rejected ? IconCircleX : STATUS_ICON[status];
  return (
    <span className={`stu-st stu-st--${rejected ? "rejected" : status}${small ? " stu-st--sm" : ""}`}>
      <Glyph aria-hidden />
      {label(status, raw)}
    </span>
  );
}

const FLOW: StudioStatus[] = ["draft", "submitted", "in_review", "approved", "published"];

export function StudioStatusSteps({ status, raw = "", approvalFree }: { status: StudioStatus; raw?: string; approvalFree?: boolean }) {
  const { t, status: label } = useStudioText();
  const flow: StudioStatus[] = approvalFree ? ["draft", "published"] : FLOW;
  const back = status === "changes_requested";
  const archived = status === "archived";
  const at = back ? flow.indexOf("in_review") : archived ? -1 : flow.indexOf(status);
  const rejected = /^(rejected|declined)$/i.test(raw.trim());
  return (
    <div className={`stu-flow${archived ? " stu-flow--archived" : ""}`}>
      <ol className="stu-flow__list" aria-label={t("flow.label")}>
        {flow.map((s, i) => {
          const done = i < at;
          const cur = i === at;
          const warn = cur && back;
          const cls = warn ? " is-warn" : cur ? " is-cur" : done ? " is-done" : "";
          return (
            <li key={s} className={`stu-flow__step${cls}`} aria-current={cur ? "step" : undefined}>
              <span className="stu-flow__dot" aria-hidden>
                {done ? <IconCheck /> : warn ? <IconRefresh /> : <span>{i + 1}</span>}
              </span>
              <span className="stu-flow__l">{warn ? label("changes_requested", raw) : label(s)}</span>
            </li>
          );
        })}
      </ol>
      {archived ? (
        <p className="stu-flow__note">
          <IconInbox aria-hidden />
          {t("flow.archived")}
        </p>
      ) : back ? (
        <p className="stu-flow__note stu-flow__note--warn">
          <IconRefresh aria-hidden />
          {rejected ? t("flow.rejected") : t("flow.back")}
        </p>
      ) : approvalFree ? (
        <p className="stu-flow__note">
          <IconRocket aria-hidden />
          {t("flow.direct")}
        </p>
      ) : null}
    </div>
  );
}

export function ConstructorIcon({ code, size = "md", className = "" }: { code: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const meta = ctorMeta(code);
  const Glyph = meta.icon;
  return (
    <span className={`stu-cico stu-cico--${size} stu-cico--${meta.group}${className ? ` ${className}` : ""}`} aria-hidden>
      <Glyph />
    </span>
  );
}

export function StudioCodeChip({ code }: { code: string }) {
  if (!code) return null;
  return <span className="stu-code">{code}</span>;
}

export function StudioUnavailable({ compact }: { compact?: boolean }) {
  const { t } = useStudioText();
  const [busy, setBusy] = useState(false);
  async function recheck() {
    setBusy(true);
    await recheckStudio();
    setBusy(false);
  }
  return (
    <div className={`stu-off${compact ? " stu-off--compact" : ""}`} role="status" data-ai-id="admin.studio.unavailable" data-ai-type="section" data-ai-label={t("off.title")}>
      <span className="stu-off__ico">
        <IconLayers aria-hidden />
      </span>
      <span className="stu-off__badge">{t("off.badge")}</span>
      <b>{t("off.title")}</b>
      <p>{t("off.text")}</p>
      <ul className="stu-off__list">
        <li>
          <IconEdit aria-hidden />
          {t("off.p1")}
        </li>
        <li>
          <IconCircleCheck aria-hidden />
          {t("off.p2")}
        </li>
        <li>
          <IconRocket aria-hidden />
          {t("off.p3")}
        </li>
      </ul>
      <button type="button" className="btn btn--line btn--sm" onClick={recheck} disabled={busy} data-ai-id="admin.studio.unavailable.recheck" data-ai-type="button" data-ai-label={t("off.recheck")}>
        <IconRefresh className={busy ? "stu-spinning" : undefined} aria-hidden />
        {busy ? t("off.checking") : t("off.recheck")}
      </button>
      <small className="stu-off__hint">{t("off.hint")}</small>
    </div>
  );
}

export function StudioNoAccess() {
  const { t } = useStudioText();
  return (
    <div className="stu-off stu-off--lock" role="status">
      <span className="stu-off__ico">
        <IconLock aria-hidden />
      </span>
      <b>{t("noAccess.title")}</b>
      <p>{t("noAccess.text")}</p>
    </div>
  );
}

export function StudioLoading({ rows = 3, label }: { rows?: number; label?: string }) {
  const { t } = useStudioText();
  return (
    <div className="stu-load" role="status" aria-busy="true" aria-label={label || t("common.loading")}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="stu-load__row" />
      ))}
    </div>
  );
}

export function StudioEmpty({
  icon: Glyph = IconInbox,
  title,
  text,
  children,
  tone,
}: {
  icon?: Icon;
  title: string;
  text?: string;
  children?: ReactNode;
  tone?: "brand";
}) {
  return (
    <div className={`stu-empty${tone === "brand" ? " stu-empty--brand" : ""}`} role="status">
      <span className="stu-empty__ico">
        <Glyph aria-hidden />
      </span>
      <b>{title}</b>
      {text ? <p>{text}</p> : null}
      {children ? <div className="stu-empty__acts">{children}</div> : null}
    </div>
  );
}

export function useStudioErrorText() {
  const { t } = useStudioText();
  return (e: unknown): { title: string; text: string } => {
    const se = studioErrorOf(e);
    const title = t(`error.kind.${se.kind}`);
    const fields = Object.values(se.fieldErrors).filter(Boolean);
    const text = se.message || fields.slice(0, 3).join(" · ") || t(`error.hint.${se.kind}`);
    return { title, text };
  };
}

export function StudioErrorNote({
  error,
  onRetry,
  busy,
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  busy?: boolean;
  compact?: boolean;
}) {
  const { t } = useStudioText();
  const text = useStudioErrorText();
  if (!error) return null;
  const se = studioErrorOf(error);
  const msg = text(error);
  const lock = se.kind === "forbidden";
  return (
    <div className={`stu-err${compact ? " stu-err--compact" : ""}${lock ? " stu-err--lock" : ""}`} role="alert">
      <span className="stu-err__ico">{lock ? <IconLock aria-hidden /> : <IconAlert aria-hidden />}</span>
      <div className="stu-err__m">
        <b>{msg.title}</b>
        <p>{msg.text}</p>
      </div>
      {onRetry && !lock ? (
        <button type="button" className="btn btn--line btn--sm" onClick={onRetry} disabled={busy}>
          <IconRefresh className={busy ? "stu-spinning" : undefined} aria-hidden />
          {t("actions.retry")}
        </button>
      ) : null}
    </div>
  );
}

export function useStudioLive(onEvent: (e: UserEvent) => void, enabled = true): void {
  const ref = useRef(onEvent);
  useEffect(() => {
    ref.current = onEvent;
  });
  useEffect(() => {
    if (!enabled) return;
    const off = subscribeUserEvents((e) => {
      if (isStudioEvent(e.event)) ref.current(e);
    });
    const offSync = onUserSocketResync(() => ref.current({ event: "studio.resync" }));
    return () => {
      off();
      offSync();
    };
  }, [enabled]);
}

export function studioEventObjectId(e: UserEvent): string {
  const d = (e.data && typeof e.data === "object" ? e.data : e) as Record<string, unknown>;
  const pick = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
  const obj = d.object && typeof d.object === "object" ? (d.object as Record<string, unknown>) : {};
  return pick(d.object_id) || pick(d.objectId) || pick(obj.id) || pick(e.object_id);
}

export function useNow(stepMs = 30_000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, stepMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [stepMs]);
  return now;
}
