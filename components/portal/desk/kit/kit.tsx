"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight, IconClose, IconSearch } from "@/components/icons";
import type { MenuItem } from "../ContextMenu";
import "./kit.css";

// The desktop's own app kit: the controls a program on that computer is
// made of, drawn the Windows 11 way (Fluent: Mica, navigation pane, command
// bar, 4px corners, accent pills) or the macOS way (vibrant sidebar, unified
// toolbar, push buttons, segmented controls, sheets), in light and dark.
// The apps are written once against these pieces; each piece knows which
// computer it is on from the window around it.

export type Os = "win" | "mac";
const OsCtx = createContext<Os>("win");
export const KitOs = OsCtx.Provider;
export const useOs = () => useContext(OsCtx);

// What the desktop lends an app: its right-click menu (drawn by the
// desktop, in its style), and from the window around it, dragging that
// window by the app's own toolbar (the Mac's unified title bar).
export type DeskMenu = (e: MouseEvent | { clientX: number; clientY: number }, label: string, items: MenuItem[]) => void;
const MenuCtx = createContext<DeskMenu | null>(null);
export const KitMenu = MenuCtx.Provider;
type WinCtl = { drag: (e: PointerEvent<HTMLElement>) => void; zoom: () => void };
const WinCtx = createContext<WinCtl | null>(null);
export const KitWindow = WinCtx.Provider;
export const useHost = () => {
  const win = useContext(WinCtx);
  return { menu: useContext(MenuCtx), dragWindow: win?.drag, zoomWindow: win?.zoom };
};

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ── layout ───────────────────────────────────────────────────────────────────

// An app: its sidebar, its content, and an inspector on the right when it
// has one. Dialogs open inside it.
export function App({ name, sidebar, inspector, children, className }: { name: string; sidebar?: ReactNode; inspector?: ReactNode; children: ReactNode; className?: string }) {
  const os = useOs();
  return (
    <div className={cx("dx", `dx--${os}`, `dx-app--${name}`, sidebar ? "dx--side" : "", inspector ? "dx--insp" : "", className)} data-os={os}>
      {sidebar}
      <main className="dx-main">{children}</main>
      {inspector}
    </div>
  );
}

export type NavItem = { id: string; label: string; icon?: ReactNode; count?: number | string; dot?: string; disabled?: boolean };
export type NavSection = { id: string; title?: string; items: NavItem[] };

// The Mac's source list / Windows' navigation pane.
export function Sidebar({ label, sections, value, onChange, header, footer, onMenu }: { label: string; sections: NavSection[]; value: string; onChange: (id: string) => void; header?: ReactNode; footer?: ReactNode; onMenu?: (e: MouseEvent, item: NavItem) => void }) {
  const host = useHost();
  return (
    <aside className="dx-side" aria-label={label}>
      <div className="dx-side__drag" onPointerDown={(e) => host.dragWindow?.(e)} aria-hidden />
      {header ? <div className="dx-side__head">{header}</div> : null}
      <nav className="dx-side__nav">
        {sections.map((s) => (
          <div key={s.id} className="dx-side__sec" role="group" aria-label={s.title || label}>
            {s.title ? <p className="dx-side__t">{s.title}</p> : null}
            {s.items.map((it) => (
              <button
                key={it.id}
                type="button"
                className={cx("dx-side__i", value === it.id && "is-on")}
                aria-current={value === it.id ? "page" : undefined}
                disabled={it.disabled}
                onClick={() => onChange(it.id)}
                onContextMenu={onMenu ? (e) => onMenu(e, it) : undefined}
              >
                {it.icon ? <span className="dx-side__ic">{it.icon}</span> : null}
                {it.dot ? <i className="dx-side__dot" style={{ background: it.dot }} aria-hidden /> : null}
                <span className="dx-side__l">{it.label}</span>
                {it.count !== undefined && it.count !== 0 && it.count !== "" ? <span className="dx-side__n">{it.count}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </nav>
      {footer ? <div className="dx-side__foot">{footer}</div> : null}
    </aside>
  );
}

// The top of the content: on the Mac a unified toolbar (title, then the
// tools on the right; its empty space drags the window), on Windows a page
// header with a command bar under it.
export function Toolbar({ title, subtitle, back, forward, children, end }: { title: ReactNode; subtitle?: ReactNode; back?: { label: string; onClick: () => void; disabled?: boolean }; forward?: { label: string; onClick: () => void; disabled?: boolean }; children?: ReactNode; end?: ReactNode }) {
  const os = useOs();
  const host = useHost();
  const drag = (e: PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("button,input,select,textarea,a,[role=tab],[role=search]")) return;
    host.dragWindow?.(e);
  };
  const nav =
    back || forward ? (
      <span className="dx-tb__nav">
        {back ? (
          <button type="button" className="dx-tb__navb" onClick={back.onClick} disabled={back.disabled} aria-label={back.label} title={back.label}>
            <IconChevronLeft />
          </button>
        ) : null}
        {forward ? (
          <button type="button" className="dx-tb__navb" onClick={forward.onClick} disabled={forward.disabled} aria-label={forward.label} title={forward.label}>
            <IconChevronRight />
          </button>
        ) : null}
      </span>
    ) : null;
  if (os === "mac")
    return (
      <header
        className="dx-tb"
        onPointerDown={drag}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest("button,input,select,textarea,a,[role=tab],[role=search]")) host.zoomWindow?.();
        }}
      >
        {nav}
        <div className="dx-tb__title">
          <h1>{title}</h1>
          {subtitle ? <small>{subtitle}</small> : null}
        </div>
        <div className="dx-tb__tools">
          {children}
          {end}
        </div>
      </header>
    );
  return (
    <header className="dx-tb">
      <div className="dx-tb__head" onPointerDown={drag}>
        {nav}
        <div className="dx-tb__title">
          <h1>{title}</h1>
          {subtitle ? <small>{subtitle}</small> : null}
        </div>
        {end ? <div className="dx-tb__end">{end}</div> : null}
      </div>
      {children ? (
        <div className="dx-tb__cmd" role="toolbar">
          {children}
        </div>
      ) : null}
    </header>
  );
}

export function Sep() {
  return <span className="dx-sep" aria-hidden />;
}

// ── controls ────────────────────────────────────────────────────────────────

type BtnKind = "default" | "primary" | "plain" | "danger";
export function Btn({ kind = "default", icon, children, onClick, disabled, title, type = "button", small, className, busy }: { kind?: BtnKind; icon?: ReactNode; children?: ReactNode; onClick?: () => void; disabled?: boolean; title?: string; type?: "button" | "submit"; small?: boolean; className?: string; busy?: boolean }) {
  return (
    <button type={type} className={cx("dx-btn", `dx-btn--${kind}`, small && "dx-btn--sm", !children && "dx-btn--icon", className)} onClick={onClick} disabled={disabled || busy} title={title} aria-label={!children ? title : undefined} aria-busy={busy || undefined}>
      {busy ? <Spinner small /> : icon}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

// A toolbar/command-bar tool: an icon on the Mac (named by its tooltip), an
// icon with its label on Windows.
export function Tool({ icon, label, onClick, disabled, active, primary }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; active?: boolean; primary?: boolean }) {
  const os = useOs();
  return (
    <button type="button" className={cx("dx-tool", active && "is-on", primary && "dx-tool--pri")} onClick={onClick} disabled={disabled} title={label} aria-label={os === "mac" ? label : undefined} aria-pressed={active}>
      {icon}
      {os === "win" ? <span>{label}</span> : null}
    </button>
  );
}

// The Mac's segmented control / Windows' selector bar.
export function Seg<T extends string>({ items, value, onChange, label, small }: { items: { id: T; label: string; icon?: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; label: string; small?: boolean }) {
  return (
    <div className={cx("dx-seg", small && "dx-seg--sm")} role="tablist" aria-label={label}>
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" aria-selected={value === it.id} className={value === it.id ? "is-on" : ""} onClick={() => onChange(it.id)}>
          {it.icon}
          <span>{it.label}</span>
          {it.count ? <small>{it.count}</small> : null}
        </button>
      ))}
    </div>
  );
}

export function Search({ value, onChange, placeholder, wide }: { value: string; onChange: (v: string) => void; placeholder: string; wide?: boolean }) {
  return (
    <label className={cx("dx-search", wide && "dx-search--wide")} role="search">
      <IconSearch aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value ? (
        <button type="button" onClick={() => onChange("")} aria-label={placeholder}>
          <IconClose />
        </button>
      ) : null}
    </label>
  );
}

export function Field({ label, hint, children, error }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className={cx("dx-field", error && "is-err")}>
      <span className="dx-field__l">{label}</span>
      {children}
      {error ? <small className="dx-field__e">{error}</small> : hint ? <small className="dx-field__h">{hint}</small> : null}
    </label>
  );
}

export function Input(p: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean; maxLength?: number; autoFocus?: boolean; ariaLabel?: string; min?: string; max?: string }) {
  return <input className="dx-in" type={p.type ?? "text"} value={p.value} onChange={(e) => p.onChange(e.target.value)} placeholder={p.placeholder} required={p.required} maxLength={p.maxLength} autoFocus={p.autoFocus} aria-label={p.ariaLabel} min={p.min} max={p.max} />;
}

export function TextArea(p: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; maxLength?: number; ariaLabel?: string }) {
  return <textarea className="dx-in dx-in--area" value={p.value} onChange={(e) => p.onChange(e.target.value)} placeholder={p.placeholder} rows={p.rows ?? 3} maxLength={p.maxLength} aria-label={p.ariaLabel} />;
}

// A pop-up button (Mac) / combo box (Windows), on the browser's own list.
export function Select<T extends string>({ value, onChange, options, ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel: string }) {
  return (
    <span className="dx-sel">
      <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={ariaLabel}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <IconChevronDown aria-hidden />
    </span>
  );
}

export function Toggle({ checked, onChange, label, onText, offText, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; onText?: string; offText?: string; disabled?: boolean }) {
  const os = useOs();
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={cx("dx-toggle", checked && "is-on")} onClick={() => onChange(!checked)} disabled={disabled}>
      {os === "win" && (onText || offText) ? <span className="dx-toggle__t">{checked ? onText : offText}</span> : null}
      <i aria-hidden />
    </button>
  );
}

export function Check({ checked, onChange, label, round, children }: { checked: boolean; onChange: (v: boolean) => void; label: string; round?: boolean; children?: ReactNode }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={children ? undefined : label} className={cx("dx-check", round && "dx-check--round", checked && "is-on")} onClick={() => onChange(!checked)}>
      <i aria-hidden>{checked ? <IconCheck /> : null}</i>
      {children ? <span>{children}</span> : null}
    </button>
  );
}

// ── groups and rows ─────────────────────────────────────────────────────────

// The Mac's inset grouped box (System Settings) / Windows' settings cards.
export function Group({ title, children, footer, end }: { title?: string; children: ReactNode; footer?: ReactNode; end?: ReactNode }) {
  return (
    <section className="dx-group">
      {title || end ? (
        <div className="dx-group__h">
          {title ? <h2>{title}</h2> : <span />}
          {end}
        </div>
      ) : null}
      <div className="dx-group__b">{children}</div>
      {footer ? <p className="dx-group__f">{footer}</p> : null}
    </section>
  );
}

export function SettingRow({ icon, title, desc, children, onClick }: { icon?: ReactNode; title: ReactNode; desc?: ReactNode; children?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      {icon ? <span className="dx-srow__ic">{icon}</span> : null}
      <span className="dx-srow__t">
        <b>{title}</b>
        {desc ? <small>{desc}</small> : null}
      </span>
      {children ? <span className="dx-srow__c">{children}</span> : onClick ? <IconChevronRight className="dx-srow__go" aria-hidden /> : null}
    </>
  );
  return onClick ? (
    <button type="button" className="dx-srow dx-srow--btn" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="dx-srow">{body}</div>
  );
}

// A list and its rows: selected with the accent (Mac) or a pill (Windows),
// double-click or Enter opens, right-click asks for a menu.
export function List({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("dx-list", className)} role="listbox" aria-label={label}>
      {children}
    </div>
  );
}

export function Row({ selected, onSelect, onOpen, onMenu, lead, title, sub, meta, end, className, style }: { selected?: boolean; onSelect?: () => void; onOpen?: () => void; onMenu?: (e: MouseEvent) => void; lead?: ReactNode; title: ReactNode; sub?: ReactNode; meta?: ReactNode; end?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      role="option"
      aria-selected={!!selected}
      tabIndex={selected ? 0 : -1}
      className={cx("dx-row", selected && "is-on", className)}
      style={style}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onOpen) onOpen();
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const sib = (e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement | null;
          if (sib?.classList.contains("dx-row")) {
            sib.click();
            sib.focus();
          }
        }
      }}
      onContextMenu={
        onMenu
          ? (e) => {
              e.preventDefault();
              onSelect?.();
              onMenu(e);
            }
          : undefined
      }
    >
      {lead ? <span className="dx-row__lead">{lead}</span> : null}
      <span className="dx-row__t">
        <b>{title}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
      {meta ? <span className="dx-row__meta">{meta}</span> : null}
      {end ? <span className="dx-row__end">{end}</span> : null}
    </div>
  );
}

export type Col<T> = { id: string; label: string; width?: string; align?: "end"; sort?: (a: T, b: T) => number; cell: (row: T) => ReactNode };
// A table with a header to sort by (the Mac's striped table view / Windows'
// details view).
export function Table<T>({ label, cols, rows, rowKey, selected, onSelect, onOpen, onMenu, empty }: { label: string; cols: Col<T>[]; rows: T[]; rowKey: (r: T) => string; selected?: string; onSelect?: (r: T) => void; onOpen?: (r: T) => void; onMenu?: (e: MouseEvent, r: T) => void; empty?: ReactNode }) {
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const col = sort ? cols.find((c) => c.id === sort.id) : undefined;
  const shown = col?.sort && sort ? [...rows].sort((a, b) => col.sort!(a, b) * sort.dir) : rows;
  const tpl = cols.map((c) => c.width ?? "minmax(0,1fr)").join(" ");
  return (
    <div className="dx-table" role="grid" aria-label={label} aria-rowcount={rows.length}>
      <div className="dx-table__h" role="row" style={{ gridTemplateColumns: tpl }}>
        {cols.map((c) => (
          <span key={c.id} role="columnheader" className={cx(c.align === "end" && "is-end")} aria-sort={sort?.id === c.id ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
            {c.sort ? (
              <button type="button" onClick={() => setSort((s) => (s?.id === c.id ? (s.dir === 1 ? { id: c.id, dir: -1 } : null) : { id: c.id, dir: 1 }))}>
                {c.label}
                {sort?.id === c.id ? <IconChevronDown className={sort.dir === -1 ? "is-up" : ""} aria-hidden /> : null}
              </button>
            ) : (
              c.label
            )}
          </span>
        ))}
      </div>
      <div className="dx-table__b">
        {shown.length
          ? shown.map((r) => {
              const k = rowKey(r);
              return (
                <div
                  key={k}
                  role="row"
                  tabIndex={selected === k ? 0 : -1}
                  aria-selected={selected === k}
                  className={cx("dx-table__r", selected === k && "is-on")}
                  style={{ gridTemplateColumns: tpl }}
                  onClick={() => onSelect?.(r)}
                  onDoubleClick={() => onOpen?.(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onOpen?.(r);
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                      e.preventDefault();
                      const sib = (e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement | null;
                      sib?.click();
                      sib?.focus();
                    }
                  }}
                  onContextMenu={
                    onMenu
                      ? (e) => {
                          e.preventDefault();
                          onSelect?.(r);
                          onMenu(e, r);
                        }
                      : undefined
                  }
                >
                  {cols.map((c) => (
                    <span key={c.id} role="gridcell" className={cx(c.align === "end" && "is-end")}>
                      {c.cell(r)}
                    </span>
                  ))}
                </div>
              );
            })
          : empty}
      </div>
    </div>
  );
}

// ── small things ────────────────────────────────────────────────────────────

export function Spinner({ small, label }: { small?: boolean; label?: string }) {
  return <span className={cx("dx-spin", small && "dx-spin--sm")} role={label ? "status" : undefined} aria-label={label} />;
}

export function Loading({ label }: { label: string }) {
  return (
    <div className="dx-loading">
      <Spinner label={label} />
      <span>{label}</span>
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="dx-empty">
      {icon ? <span className="dx-empty__ic">{icon}</span> : null}
      <b>{title}</b>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}

export type Tone = "neutral" | "accent" | "ok" | "warn" | "err" | "info";
export function Tag({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`dx-tag dx-tag--${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Avatar({ name, size = 32, tone }: { name: string; size?: number; tone?: number }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const ini = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  const hue = tone ?? [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span className="dx-av" style={{ width: size, height: size, fontSize: size * 0.38, "--h": hue } as CSSProperties} aria-hidden>
      {ini}
    </span>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="dx-prog" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <i style={{ width: `${v}%` }} />
    </span>
  );
}

// Windows' InfoBar / the Mac's inline notice.
export function Banner({ tone = "info", title, children, action, onClose, closeLabel }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode; onClose?: () => void; closeLabel?: string }) {
  return (
    <div className={`dx-banner dx-banner--${tone}`} role={tone === "err" ? "alert" : "status"}>
      <i className="dx-banner__ic" aria-hidden />
      <span className="dx-banner__t">
        {title ? <b>{title}</b> : null}
        {children ? <span>{children}</span> : null}
      </span>
      {action}
      {onClose ? (
        <button type="button" className="dx-banner__x" onClick={onClose} aria-label={closeLabel}>
          <IconClose />
        </button>
      ) : null}
    </div>
  );
}

// ── dialogs ─────────────────────────────────────────────────────────────────

// A dialog inside the app's window: a sheet that drops from the toolbar on
// the Mac, Windows' content dialog over a dimmed window. Escape closes.
export function Dialog({ open, title, children, actions, onClose, onSubmit, width = 460 }: { open: boolean; title: string; children: ReactNode; actions: ReactNode; onClose: () => void; onSubmit?: () => void; width?: number }) {
  const id = useId();
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    el?.querySelector<HTMLElement>("input,textarea,select,button")?.focus({ preventScroll: true });
  }, [open]);
  if (!open) return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.();
  };
  return (
    <div
      className="dx-dlg"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <form ref={ref} className="dx-dlg__box" style={{ width }} role="dialog" aria-modal="true" aria-labelledby={id} onSubmit={submit}>
        <h2 id={id}>{title}</h2>
        <div className="dx-dlg__body">{children}</div>
        <div className="dx-dlg__foot">{actions}</div>
      </form>
    </div>
  );
}

type Ask = { title: string; text?: string; ok: string; cancel: string; danger?: boolean };
// A yes/no question as a dialog of this app.
export function useConfirm(): [ReactNode, (a: Ask) => Promise<boolean>] {
  const [ask, setAsk] = useState<(Ask & { done: (v: boolean) => void }) | null>(null);
  const open = useCallback((a: Ask) => new Promise<boolean>((done) => setAsk({ ...a, done })), []);
  const close = (v: boolean) => {
    ask?.done(v);
    setAsk(null);
  };
  const node = ask ? (
    <Dialog
      open
      title={ask.title}
      onClose={() => close(false)}
      onSubmit={() => close(true)}
      width={400}
      actions={
        <>
          <Btn onClick={() => close(false)}>{ask.cancel}</Btn>
          <Btn kind={ask.danger ? "danger" : "primary"} type="submit">
            {ask.ok}
          </Btn>
        </>
      }
    >
      {ask.text ? <p className="dx-dlg__text">{ask.text}</p> : null}
    </Dialog>
  ) : null;
  return [node, open];
}

// A short note at the bottom of the app (saved, failed…), gone by itself.
export function useToast(): [ReactNode, (text: string, tone?: Tone) => void] {
  const [msg, setMsg] = useState<{ text: string; tone: Tone; n: number } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const h = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(h);
  }, [msg]);
  const say = useCallback((text: string, tone: Tone = "ok") => setMsg((m) => ({ text, tone, n: (m?.n ?? 0) + 1 })), []);
  const node = msg ? (
    <div key={msg.n} className={`dx-toast dx-toast--${msg.tone}`} role={msg.tone === "err" ? "alert" : "status"}>
      {msg.text}
    </div>
  ) : null;
  return [node, say];
}
