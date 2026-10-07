"use client";

import type { ComponentType, SVGProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import Select from "@/components/Select";
import { dateOnly, dateTimeFull, fmtInt, fmtRating } from "@/lib/date";
import { humanize } from "@/lib/labels";
import {
  REGLAMENT_CATEGORIES,
  compareVersions,
  isVersionFormat,
  knownReglamentStatus,
  nextVersion,
  parseVersion,
  type ReglamentStatus,
} from "@/lib/services/aiReglaments";
import { IconAlert, IconCircleCheck, IconEdit, IconFileText, IconHourglass, IconInbox, IconLock, IconRefresh, IconTag } from "@/components/icons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export const CUSTOM_CAT = "__custom";

const STATUS_ICON: Record<ReglamentStatus, Icon> = {
  active: IconCircleCheck,
  draft: IconEdit,
  archived: IconInbox,
};

export function useRgl() {
  const t = useTranslations("admin.aiReglaments");
  const locale = useLocale();
  return {
    t,
    cat: (c: string) => (c && t.has(`cat.${c}`) ? t(`cat.${c}`) : humanize(c) || t("cat.none")),
    status: (s: ReglamentStatus, raw = "") => (knownReglamentStatus(raw) ? t(`status.${s}`) : humanize(raw)),
    role: (r: string) => (r && t.has(`roles.${r}`) ? t(`roles.${r}`) : humanize(r)),
    gapStatus: (s: string) => (s && t.has(`gapStatus.${s}`) ? t(`gapStatus.${s}`) : humanize(s)),
    when: (iso: string) => (iso ? dateTimeFull(iso, locale) : ""),
    day: (iso: string) => (iso ? dateOnly(iso, locale) : ""),
    num: (n: number) => fmtInt(n, locale),
    dec: (n: number) => fmtRating(n, locale, 1),
  };
}

export function catChoiceOf(category: string): { choice: string; custom: string } {
  const c = category.trim().toLowerCase();
  if (!c) return { choice: "support", custom: "" };
  return (REGLAMENT_CATEGORIES as readonly string[]).includes(c) ? { choice: c, custom: "" } : { choice: CUSTOM_CAT, custom: category.trim() };
}

export function catValue(choice: string, custom: string): string {
  return choice === CUSTOM_CAT ? custom.trim().toLowerCase().replace(/\s+/g, "_") : choice;
}

export function versionProblem(value: string, current: string): "format" | "low" | null {
  if (!isVersionFormat(value)) return "format";
  if (current && parseVersion(current) && compareVersions(value, current) <= 0) return "low";
  return null;
}

export function cleanVersion(v: string): string {
  return v.replace(/,/g, ".").replace(/[^\d.]/g, "").replace(/\.{2,}/g, ".").slice(0, 7);
}

export function StatusPill({ status, raw = "" }: { status: ReglamentStatus; raw?: string }) {
  const { status: label } = useRgl();
  const Glyph = STATUS_ICON[status];
  return (
    <span className={`rgl-st rgl-st--${status}`}>
      <Glyph aria-hidden />
      {label(status, raw)}
    </span>
  );
}

export function VersionBadge({ version }: { version: string }) {
  if (!version) return null;
  return <span className="rgl-ver">v{version}</span>;
}

export function CategoryChip({ category }: { category: string }) {
  const { cat } = useRgl();
  return (
    <span className="rgl-cat">
      <IconTag aria-hidden />
      {cat(category)}
    </span>
  );
}

export function ReglamentGlyph({ status, big }: { status: ReglamentStatus; big?: boolean }) {
  return (
    <span className={`rgl-glyph rgl-glyph--${status}${big ? " rgl-glyph--big" : ""}`} aria-hidden>
      <IconFileText />
    </span>
  );
}

export function MissingState({ text, onRecheck, busy }: { text?: string; onRecheck?: () => void; busy?: boolean }) {
  const { t } = useRgl();
  return (
    <div className="rgl-miss" role="status">
      <span className="rgl-miss__ico">
        <IconHourglass aria-hidden />
      </span>
      <span className="rgl-soon">{t("missing.soon")}</span>
      <b>{t("missing.title")}</b>
      <p>{text || t("missing.text")}</p>
      {onRecheck ? (
        <button type="button" className="btn btn--line btn--sm" onClick={onRecheck} disabled={busy}>
          <IconRefresh className={busy ? "rgl-spinning" : undefined} aria-hidden />
          {t("missing.recheck")}
        </button>
      ) : null}
    </div>
  );
}

export function LoadFailed({ forbidden, onRetry, busy }: { forbidden: boolean; onRetry: () => void; busy?: boolean }) {
  const { t } = useRgl();
  if (forbidden) {
    return (
      <div className="rgl-miss rgl-miss--lock" role="status">
        <span className="rgl-miss__ico">
          <IconLock aria-hidden />
        </span>
        <b>{t("error.forbidden")}</b>
        <p>{t("error.forbiddenText")}</p>
      </div>
    );
  }
  return (
    <div className="rgl-miss rgl-miss--err" role="alert">
      <span className="rgl-miss__ico">
        <IconAlert aria-hidden />
      </span>
      <b>{t("error.load")}</b>
      <p>{t("error.loadText")}</p>
      <button type="button" className="btn btn--line btn--sm" onClick={onRetry} disabled={busy}>
        <IconRefresh className={busy ? "rgl-spinning" : undefined} aria-hidden />
        {t("error.retry")}
      </button>
    </div>
  );
}

export function CategoryField({
  id,
  choice,
  custom,
  onChoice,
  onCustom,
  error,
  aiId,
}: {
  id?: string;
  choice: string;
  custom: string;
  onChoice: (v: string) => void;
  onCustom: (v: string) => void;
  error?: string;
  aiId?: string;
}) {
  const { t } = useRgl();
  const options = [...REGLAMENT_CATEGORIES.map((c) => ({ value: c, label: t(`cat.${c}`) })), { value: CUSTOM_CAT, label: t("cat.custom") }];
  return (
    <div className="rgl-fld" data-ai-id={aiId} data-ai-type={aiId ? "select" : undefined} data-ai-label={t("editor.category")}>
      <label>{t("editor.category")}</label>
      <Select value={choice} onChange={onChoice} options={options} ariaLabel={t("editor.category")} />
      {choice === CUSTOM_CAT ? (
        <input
          id={id}
          className="rgl-fld__more"
          value={custom}
          onChange={(e) => onCustom(e.target.value.slice(0, 60))}
          placeholder={t("editor.customCategoryPh")}
          aria-label={t("editor.customCategory")}
          aria-invalid={Boolean(error)}
          autoComplete="off"
        />
      ) : null}
      {error ? (
        <p className="rgl-err" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function VersionField({
  id,
  value,
  onChange,
  current,
  error,
  aiId,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  current: string;
  error?: string;
  aiId?: string;
}) {
  const { t } = useRgl();
  const base = current && parseVersion(current) ? current : "";
  const minor = base ? nextVersion(base, "minor") : "";
  const major = base ? nextVersion(base, "major") : "";
  return (
    <div className="rgl-fld">
      <label htmlFor={id}>{t("editor.version")}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(cleanVersion(e.target.value))}
        inputMode="decimal"
        placeholder={minor || "1.0"}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint`}
        data-ai-id={aiId}
        data-ai-type={aiId ? "input" : undefined}
        data-ai-label={t("editor.version")}
      />
      {base ? (
        <div className="rgl-bumps" role="group" aria-label={t("editor.versionPick")}>
          <button type="button" className="rgl-bump" aria-pressed={value === minor} onClick={() => onChange(minor)}>
            <b>{minor}</b>
            {t("editor.bumpMinor")}
          </button>
          <button type="button" className="rgl-bump" aria-pressed={value === major} onClick={() => onChange(major)}>
            <b>{major}</b>
            {t("editor.bumpMajor")}
          </button>
        </div>
      ) : null}
      {error ? (
        <p id={`${id}-hint`} className="rgl-err" role="alert">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="rf__hint">
          {base ? t("editor.versionCurrent", { v: base }) : t("editor.versionHint")}
        </p>
      )}
    </div>
  );
}
