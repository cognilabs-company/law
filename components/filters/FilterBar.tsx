"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  type SVGProps,
} from "react";
import { useTranslations } from "next-intl";
import Select, { type Option } from "@/components/Select";
import { IconChevronDown, IconClose, IconSearch, IconSliders } from "@/components/icons";
import { useAiReveal } from "@/lib/guide/targets";
import { useLayer } from "@/lib/layers";
import { isCoarsePointer } from "@/lib/usePopover";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

type FieldBase = {
  key: string;
  label: string;
  icon?: Icon;
  hidden?: boolean;
  wide?: boolean;
  more?: boolean;
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

const SHEET_QUERY = "(max-width: 900px)";
const FOCUSABLE =
  'button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';
const SWIPE_START = 4;
const SWIPE_CLOSE = 80;
const SWIPE_FLICK = 0.5;
const SWIPE_FLICK_MIN = 24;
const SWIPE_STALE_MS = 120;
const SWIPE_OUT_MS = 200;

function subscribeSheet(fn: () => void): () => void {
  const mq = window.matchMedia(SHEET_QUERY);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
}

const sheetNow = () => window.matchMedia(SHEET_QUERY).matches;
const sheetServer = () => false;

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.tabIndex >= 0 && el.getClientRects().length > 0);
}

function useSheetSwipe(active: boolean, card: RefObject<HTMLDivElement | null>, bg: RefObject<HTMLDivElement | null>, onClose: () => void) {
  const done = useRef(onClose);
  useEffect(() => {
    done.current = onClose;
  });
  useEffect(() => {
    const el = card.current;
    if (!active || !el) return;
    let from: { x: number; y: number; head: boolean } | null = null;
    let drag = false;
    let dy = 0;
    let lastY = 0;
    let lastT = 0;
    let speed = 0;
    let timer = 0;

    const paint = (y: number, animate: boolean) => {
      el.style.animation = "none";
      el.style.transition = animate ? "transform .2s cubic-bezier(.2,.8,.2,1)" : "none";
      el.style.transform = y > 0 ? `translateY(${y}px)` : "";
      const b = bg.current;
      if (!b) return;
      b.style.animation = "none";
      b.style.transition = animate ? "opacity .2s ease" : "none";
      b.style.opacity = y > 0 ? String(Math.max(0.2, 1 - y / Math.max(1, el.offsetHeight))) : "";
    };

    const clear = () => {
      el.style.animation = "";
      el.style.transition = "";
      el.style.transform = "";
      const b = bg.current;
      if (!b) return;
      b.style.animation = "";
      b.style.transition = "";
      b.style.opacity = "";
    };

    const onStart = (e: TouchEvent) => {
      from = null;
      drag = false;
      if (e.touches.length !== 1) return;
      const target = e.target instanceof Element ? e.target : null;
      const head = Boolean(target?.closest(".uf-card__head"));
      if (!head && el.scrollTop > 0) return;
      const p = e.touches[0];
      from = { x: p.clientX, y: p.clientY, head };
      dy = 0;
      speed = 0;
      lastY = p.clientY;
      lastT = e.timeStamp;
    };

    const onMove = (e: TouchEvent) => {
      if (!from) return;
      const p = e.touches[0];
      if (!p || e.touches.length !== 1) {
        from = null;
        if (drag) paint(0, true);
        drag = false;
        return;
      }
      const ddx = p.clientX - from.x;
      const ddy = p.clientY - from.y;
      if (!drag) {
        if (ddy < -SWIPE_START || Math.abs(ddx) > Math.max(SWIPE_START, ddy)) {
          from = null;
          return;
        }
        if (ddy < SWIPE_START) return;
        if (!from.head && el.scrollTop > 0) {
          from = null;
          return;
        }
        drag = true;
      }
      if (e.cancelable) e.preventDefault();
      dy = Math.max(0, ddy);
      const dt = e.timeStamp - lastT;
      if (dt > 0) speed = (p.clientY - lastY) / dt;
      lastY = p.clientY;
      lastT = e.timeStamp;
      paint(dy, false);
    };

    const onEnd = (e: TouchEvent) => {
      if (!from) return;
      from = null;
      if (!drag) return;
      drag = false;
      if (e.timeStamp - lastT > SWIPE_STALE_MS) speed = 0;
      if (dy > SWIPE_CLOSE || (speed > SWIPE_FLICK && dy > SWIPE_FLICK_MIN)) {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          done.current();
          return;
        }
        paint(el.offsetHeight + 32, true);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => done.current(), SWIPE_OUT_MS);
        return;
      }
      paint(0, true);
    };

    const onCancel = () => {
      if (from && drag) paint(0, true);
      from = null;
      drag = false;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onCancel);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
      window.clearTimeout(timer);
      clear();
    };
  }, [active, card, bg]);
}

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
  const [more, setMore] = useState(false);
  const narrow = useSyncExternalStore(subscribeSheet, sheetNow, sheetServer);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLElement>(null);
  const focusOnOpen = useRef(false);
  const shown = fields.filter((f) => !f.hidden);
  const primary = shown.filter((f) => !f.more);
  const later = shown.filter((f) => f.more);
  const chips = filterChips(fields);
  const searching = Boolean(search?.value.trim());
  const sheetId = `${uid}-sheet`;
  const titleId = `${uid}-title`;
  const moreId = `${uid}-more`;
  const fold = (className ?? "").split(/\s+/).includes("uf--fold");
  const panel = fold && !narrow;
  const laterKeys = new Set(later.map((f) => f.key));
  const laterIds = later.flatMap((f) => [f.aiId, f.aiTarget]).filter((x): x is string => Boolean(x));
  const laterActive = chips.filter((c) => laterKeys.has(c.key)).length;

  const shut = () => {
    setOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
  };

  useLayer(open, {
    kind: "overlay",
    el: cardRef,
    trigger: toggleRef,
    backdrop: bgRef,
    onEscape: shut,
    onOutside: () => {
      if (fold && window.matchMedia("(min-width: 901px)").matches) setOpen(false);
    },
  });

  useSheetSwipe(open && narrow, cardRef, bgRef, shut);

  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    const card = cardRef.current;
    if (!card) return;
    if (isCoarsePointer()) {
      const head = titleRef.current;
      (head && head.getClientRects().length ? head : card).focus({ preventScroll: true });
      return;
    }
    const first = focusables(card).find((el) => !el.closest(".uf-card__head"));
    (first ?? card).focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(max-width: 900px)");
    const onMq = () => {
      if (!mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onMq);
    return () => {
      mq.removeEventListener("change", onMq);
    };
  }, [open]);

  const sub = (part: string) => (aiId ? `${aiId}.${part}` : undefined);
  const ids = [aiId, aiTarget, sub("toggle"), sub("apply"), ...shown.flatMap((f) => [f.aiId, f.aiTarget])].filter((x): x is string => Boolean(x));
  useAiReveal(new RegExp(ids.length ? `^(?:${ids.map(esc).join("|")})$` : "(?!)"), (id) => {
    if (laterIds.includes(id)) setMore(true);
    const toggle = toggleRef.current;
    if (toggle && toggle.getClientRects().length > 0) setOpen(true);
  });

  const trap = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || e.defaultPrevented || !narrow) return;
    const card = cardRef.current;
    if (!card || !(e.target instanceof Node) || !card.contains(e.target)) return;
    const list = focusables(card);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    const at = document.activeElement;
    const wrap = e.shiftKey ? at === first || at === card || at === titleRef.current : at === last;
    if (!wrap) return;
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  };

  const field = (f: FilterField) => {
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
  };

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
            <button
              ref={toggleRef}
              type="button"
              className="uf-toggle"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={sheetId}
              onClick={() => {
                focusOnOpen.current = !open;
                setOpen((v) => !v);
              }}
              data-ai-id={sub("toggle")}
            >
              <IconSliders aria-hidden="true" />
              <span>{title || t("title")}</span>
              {chips.length ? <span className="uf-toggle__n">{chips.length}</span> : null}
            </button>
          ) : null}
        </div>
      ) : null}

      {open && narrow ? <div ref={bgRef} className="uf-sheetbg" aria-hidden="true" onClick={shut} /> : null}

      <div
        ref={cardRef}
        id={sheetId}
        className={`uf-card${open ? " is-open" : ""}${shown.length ? "" : " uf-card--search"}${later.length ? " uf-card--more" : ""}`}
        role={open ? "dialog" : undefined}
        aria-labelledby={open ? titleId : undefined}
        tabIndex={open ? -1 : undefined}
        onKeyDown={open ? trap : undefined}
        data-ai-id={aiId}
        data-ai-target={aiTarget}
        data-ai-label={aiLabel}
        data-ai-type={aiId ? "section" : undefined}
      >
        <div className="uf-card__head">
          <span className="uf-card__grip" aria-hidden="true" />
          <b ref={titleRef} id={titleId} tabIndex={-1}>
            {title || t("title")}
          </b>
          <button type="button" onClick={shut} aria-label={t("close")}>
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
        {primary.map(field)}
        {later.length ? (
          <>
            <button
              type="button"
              className="uf-moretg"
              aria-expanded={more}
              aria-controls={moreId}
              onClick={() => setMore((v) => !v)}
              data-ai-id={sub("more")}
            >
              <IconSliders aria-hidden="true" />
              <span>{t("more")}</span>
              {laterActive ? <span className="uf-moretg__n">{laterActive}</span> : null}
              <IconChevronDown className="uf-moretg__cv" aria-hidden="true" />
            </button>
            <div id={moreId} className={`uf-more${more ? " is-open" : ""}`}>
              {later.map(field)}
            </div>
          </>
        ) : null}
        {extra ? <div className="uf-extra">{extra}</div> : null}
        {shown.length && panel ? (
          <div className="uf-card__foot">
            <button type="button" className="btn btn--line btn--sm" onClick={reset} disabled={!chips.length && !searching} data-ai-id={sub("clear")}>
              {t("reset")}
            </button>
            <button type="button" className="btn btn--pri btn--sm" onClick={shut} data-ai-id={sub("apply")}>
              {t("close")}
            </button>
          </div>
        ) : shown.length ? (
          <button type="button" className="btn btn--pri uf-card__apply" onClick={shut} data-ai-id={sub("apply")}>
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
