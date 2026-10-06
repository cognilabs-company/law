"use client";

import { useEffect, useId, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { useTranslations } from "next-intl";
import Select, { type Option } from "@/components/Select";
import { IconClose, IconSearch, IconSliders } from "@/components/icons";
import { useAiReveal } from "@/lib/guide/targets";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

type FieldBase = {
  key: string;
  label: string;
  icon?: Icon;
  hidden?: boolean;
  wide?: boolean;
  aiId?: string;
  aiTarget?: string;
  aiLabel?: string;
};

export type FilterSelectField = FieldBase & {
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  empty?: string;
  chip?: string | null;
};

export type FilterCustomField = FieldBase & {
  node: ReactNode;
  active?: boolean;
  chip?: string | null;
  clear?: () => void;
  aiType?: string;
};

export type FilterField = FilterSelectField | FilterCustomField;

export type FilterSearch = {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label?: string;
  maxLength?: number;
  onEnter?: () => void;
  aiId?: string;
  aiTarget?: string;
  aiLabel?: string;
};

const isSelect = (f: FilterField): f is FilterSelectField => "options" in f;

const stripCount = (s: string) => s.replace(/\s*(\(\d[\d\s]*\)|·\s*\d[\d\s]*)$/u, "").trim();

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Chip = { key: string; label: string; clear: () => void };

export function filterChips(fields: FilterField[]): Chip[] {
  const out: Chip[] = [];
  for (const f of fields) {
    if (f.chip === null) continue;
    if (isSelect(f)) {
      const empty = f.empty ?? "";
      if (f.value === empty) continue;
      const opt = f.options.find((o) => o.value === f.value);
      if (!opt) continue;
      out.push({ key: f.key, label: f.chip ?? stripCount(opt.label), clear: () => f.onChange(empty) });
    } else if (f.active && f.clear) {
      out.push({ key: f.key, label: f.chip ?? f.label, clear: f.clear });
    }
  }
  return out;
}

function SearchBox({ search, id }: { search: FilterSearch; id?: string }) {
  const t = useTranslations("filterBar");
  return (
    <div className="uf-search" data-ai-target={search.aiTarget} data-ai-label={search.aiLabel}>
      <IconSearch aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={search.value}
        onChange={(e) => search.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && search.onEnter) {
            e.preventDefault();
            search.onEnter();
          }
        }}
        placeholder={search.placeholder}
        aria-label={search.label || search.placeholder}
        maxLength={search.maxLength ?? 200}
        enterKeyHint="search"
        data-ai-id={search.aiId}
        data-ai-label={search.aiLabel}
      />
      {search.value ? (
        <button type="button" className="uf-search__x" onClick={() => search.onChange("")} aria-label={t("clearSearch")} title={t("clearSearch")}>
          <IconClose />
        </button>
      ) : null}
    </div>
  );
}

export default function FilterBar({
  fields,
  search,
  count,
  onReset,
  title,
  extra,
  aiId,
  aiTarget,
  aiLabel,
  variant,
  className,
}: {
  fields: FilterField[];
  search?: FilterSearch;
  count?: number;
  onReset?: () => void;
  title?: string;
  extra?: ReactNode;
  aiId?: string;
  aiTarget?: string;
  aiLabel?: string;
  variant?: "market";
  className?: string;
}) {
  const t = useTranslations("filterBar");
  const uid = useId();
  const [open, setOpen] = useState(false);
  const shown = fields.filter((f) => !f.hidden);
  const chips = filterChips(fields);
  const searching = Boolean(search?.value.trim());
  const sheetId = `${uid}-sheet`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const mq = window.matchMedia("(max-width: 900px)");
    const onMq = () => {
      if (!mq.matches) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [open]);

  const sub = (part: string) => (aiId ? `${aiId}.${part}` : undefined);
  const ids = [aiId, aiTarget, sub("toggle"), sub("apply"), ...shown.flatMap((f) => [f.aiId, f.aiTarget])].filter((x): x is string => Boolean(x));
  useAiReveal(new RegExp(ids.length ? `^(?:${ids.map(esc).join("|")})$` : "(?!)"), () => {
    if (window.matchMedia("(max-width: 900px)").matches) setOpen(true);
  });

  const reset = () => {
    if (onReset) {
      onReset();
      return;
    }
    for (const c of chips) c.clear();
    if (search?.value) search.onChange("");
  };

  const cls = ["uf", variant ? `uf--${variant}` : "", className ?? ""].filter(Boolean).join(" ");

  return (
    <div className={cls}>
      {search || shown.length ? (
        <div className={`uf-bar${search ? "" : " uf-bar--solo"}`}>
          {search ? <SearchBox search={search} /> : null}
          {shown.length ? (
            <button type="button" className="uf-toggle" aria-expanded={open} aria-controls={sheetId} onClick={() => setOpen((v) => !v)} data-ai-id={sub("toggle")}>
              <IconSliders aria-hidden="true" />
              <span>{title || t("title")}</span>
              {chips.length ? <span className="uf-toggle__n">{chips.length}</span> : null}
            </button>
          ) : null}
        </div>
      ) : null}

      {open ? <button type="button" className="uf-sheetbg" aria-label={t("close")} onClick={() => setOpen(false)} /> : null}

      <div
        id={sheetId}
        className={`uf-card${open ? " is-open" : ""}${shown.length ? "" : " uf-card--search"}`}
        data-ai-id={aiId}
        data-ai-target={aiTarget}
        data-ai-label={aiLabel}
        data-ai-type={aiId ? "section" : undefined}
      >
        <div className="uf-card__head">
          <b>{title || t("title")}</b>
          <button type="button" onClick={() => setOpen(false)} aria-label={t("close")}>
            <IconClose />
          </button>
        </div>
        {search ? (
          <div className="uf-fld uf-fld--search uf-fld--wide">
            <label htmlFor={`${uid}-q`}>
              <IconSearch aria-hidden="true" />
              {search.label || t("search")}
            </label>
            <SearchBox search={search} id={`${uid}-q`} />
          </div>
        ) : null}
        {shown.map((f) => {
          const FIcon = f.icon;
          return (
            <div
              key={f.key}
              className={`uf-fld${f.wide ? " uf-fld--wide" : ""}`}
              data-ai-id={f.aiId}
              data-ai-target={f.aiTarget}
              data-ai-label={f.aiLabel || f.label}
              data-ai-type={f.aiId ? (isSelect(f) ? "select" : f.aiType || "input") : undefined}
            >
              <span className="uf-fld__l">
                {FIcon ? <FIcon aria-hidden="true" /> : null}
                {f.label}
              </span>
              {isSelect(f) ? <Select value={f.value} onChange={f.onChange} ariaLabel={f.label} options={f.options} /> : f.node}
            </div>
          );
        })}
        {extra ? <div className="uf-extra">{extra}</div> : null}
        {shown.length ? (
          <button type="button" className="btn btn--pri uf-card__apply" onClick={() => setOpen(false)} data-ai-id={sub("apply")}>
            {count === undefined ? t("apply") : t("show", { n: count })}
          </button>
        ) : null}
      </div>

      {chips.length || (searching && count !== undefined) ? (
        <div className="uf-chosen" data-ai-id={sub("chosen")}>
          {chips.map((c) => (
            <button key={c.key} type="button" className="uf-chosen__c" onClick={c.clear} aria-label={t("remove", { label: c.label })} data-ai-id={sub(`chosen.${c.key}`)}>
              {c.label}
              <IconClose aria-hidden="true" />
            </button>
          ))}
          {chips.length ? (
            <button type="button" className="uf-chosen__all" onClick={reset} data-ai-id={sub("reset")}>
              {t("reset")}
            </button>
          ) : null}
          {count !== undefined ? (
            <span className="uf-count" aria-live="polite">
              {t("count", { n: count })}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
