"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { aiSeg } from "@/lib/ai/ids";
import { registerReveal, revealTarget } from "@/lib/guide/targets";
import { useScrollEdges } from "@/lib/useScrollEdges";

export type TabCountTone = "hot" | "warn" | "info";

export type TabItem<K extends string = string> = {
  key: K;
  label: ReactNode;
  icon?: ReactNode;
  count?: number | null;
  countLabel?: string;
  countTone?: TabCountTone;
  disabled?: boolean;
  panel?: ReactNode;
  lazy?: boolean;
  aiId?: string;
  aiLabel?: string;
};

export type TabsProps<K extends string = string> = {
  items: readonly TabItem<K>[];
  value?: K;
  defaultValue?: K;
  onChange?: (key: K) => void;
  storeKey?: string;
  label?: string;
  labelledBy?: string;
  variant?: "pill" | "line";
  idPrefix?: string;
  controls?: string;
  end?: ReactNode;
  className?: string;
  listClassName?: string;
  panelClassName?: string;
  aiId?: string;
  aiTarget?: string;
  reveal?: boolean | Partial<Record<K, string | RegExp>>;
};

const STORE_PREFIX = "lexgo_tab:";
const MEMORY_EVENT = "lexgo-tab-memory";

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(STORE_PREFIX + key);
  } catch {
    return null;
  }
}

export function rememberTab(key: string, value: string): void {
  try {
    localStorage.setItem(STORE_PREFIX + key, value);
  } catch {}
  try {
    window.dispatchEvent(new Event(MEMORY_EVENT));
  } catch {}
}

function subscribeStored(fn: () => void): () => void {
  window.addEventListener("storage", fn);
  window.addEventListener(MEMORY_EVENT, fn);
  return () => {
    window.removeEventListener("storage", fn);
    window.removeEventListener(MEMORY_EVENT, fn);
  };
}

const noStored = (): string | null => null;

export function useStoredTab(storeKey: string | undefined): string | null {
  return useSyncExternalStore(subscribeStored, () => (storeKey ? readStored(storeKey) : null), noStored);
}

export function useTabMemory<K extends string>(storeKey: string | undefined, keys: readonly K[], fallback?: K): [K | undefined, (key: K) => void] {
  const stored = useStoredTab(storeKey);
  const [picked, setPicked] = useState<K | undefined>(undefined);
  const has = (k: unknown): k is K => typeof k === "string" && (keys as readonly string[]).includes(k);
  const active = has(picked) ? picked : has(stored) ? stored : has(fallback) ? fallback : keys[0];
  const select = (k: K) => {
    setPicked(k);
    if (storeKey) rememberTab(storeKey, k);
  };
  return [active, select];
}

export const tabDomId = (prefix: string, key: string) => `${prefix}-tab-${aiSeg(key)}`;
export const panelDomId = (prefix: string, key: string) => `${prefix}-panel-${aiSeg(key)}`;

function until(test: () => boolean, ms = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const end = Date.now() + ms;
    const tick = () => {
      if (test()) resolve(true);
      else if (Date.now() > end) resolve(false);
      else window.setTimeout(tick, 30);
    };
    tick();
  });
}

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export default function Tabs<K extends string = string>({
  items,
  value,
  defaultValue,
  onChange,
  storeKey,
  label,
  labelledBy,
  variant = "pill",
  idPrefix,
  controls,
  end,
  className,
  listClassName,
  panelClassName,
  aiId,
  aiTarget,
  reveal,
}: TabsProps<K>) {
  const uid = useId();
  const prefix = idPrefix || `tabs-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const keys = items.filter((it) => !it.disabled).map((it) => it.key);
  const [memo, remember] = useTabMemory(storeKey, keys, defaultValue);
  const active: K | undefined = value !== undefined ? (keys.includes(value) ? value : keys[0]) : memo;
  const [seen, setSeen] = useState<readonly string[]>([]);
  if (active !== undefined && !seen.includes(active) && items.some((it) => it.key === active && it.lazy)) setSeen([...seen, active]);

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useScrollEdges(listRef, { silent: true });

  const select = (k: K) => {
    if (!keys.includes(k)) return;
    remember(k);
    onChange?.(k);
  };

  const activeRef = useRef(active);
  const selectRef = useRef(select);
  const revealRef = useRef(reveal);
  useEffect(() => {
    activeRef.current = active;
    selectRef.current = select;
    revealRef.current = reveal;
  });

  useEffect(() => {
    const list = listRef.current;
    if (!list || active === undefined) return;
    const el = Array.from(list.querySelectorAll<HTMLElement>("[role=tab]")).find((b) => b.dataset.tab === active);
    if (!el || list.scrollWidth <= list.clientWidth) return;
    const box = list.getBoundingClientRect();
    const at = el.getBoundingClientRect();
    if (at.left < box.left + 32) list.scrollLeft -= box.left + 32 - at.left;
    else if (at.right > box.right - 32) list.scrollLeft += at.right - box.right + 32;
  }, [active]);

  const hasPanels = items.some((it) => it.panel !== undefined);
  const map = reveal && typeof reveal === "object" ? reveal : undefined;
  const auto = reveal !== false && hasPanels;
  const hiddenKey = keys.filter((k) => k !== active && (Boolean(map?.[k]) || (auto && items.some((it) => it.key === k && it.panel !== undefined)))).join("\n");
  useEffect(() => {
    if (!hiddenKey) return;
    const hidden = hiddenKey.split("\n") as K[];
    let alive = true;
    let offs: (() => void)[] = [];
    const panelOf = (root: HTMLElement, k: string) => Array.from(root.children).find((el): el is HTMLElement => el instanceof HTMLElement && el.getAttribute("role") === "tabpanel" && el.dataset.tab === k);
    const idsIn = (el?: HTMLElement) => {
      const out = new Set<string>();
      el?.querySelectorAll<HTMLElement>("[data-ai-id],[data-ai-target]").forEach((n) => {
        const a = n.getAttribute("data-ai-id");
        const b = n.getAttribute("data-ai-target");
        if (a) out.add(a);
        if (b) out.add(b);
      });
      return out;
    };
    const shownElsewhere = (id: string) => {
      try {
        const q = CSS.escape(id);
        return Array.from(document.querySelectorAll<HTMLElement>(`[data-ai-id="${q}"],[data-ai-target="${q}"]`)).some((el) => !el.closest("[hidden]"));
      } catch {
        return false;
      }
    };
    const register = () => {
      if (!alive) return;
      offs.forEach((off) => off());
      offs = [];
      const root = rootRef.current;
      const cur = activeRef.current;
      const shown = root && cur !== undefined ? idsIn(panelOf(root, cur)) : new Set<string>();
      for (const k of hidden) {
        const open = async (id: string) => {
          const host = rootRef.current;
          if (!host || shownElsewhere(id)) return;
          const layers = document.querySelectorAll(".amodal");
          const top = layers[layers.length - 1];
          if (top && !top.contains(host)) return;
          selectRef.current(k);
          if (await until(() => activeRef.current === k)) await revealTarget(id);
        };
        const given = revealRef.current;
        const match = given && typeof given === "object" ? given[k] : undefined;
        if (match) offs.push(registerReveal(match, open));
        if (auto && root) {
          idsIn(panelOf(root, k)).forEach((id) => {
            if (!shown.has(id)) offs.push(registerReveal(id, open));
          });
        }
      }
    };
    register();
    let timer = 0;
    const root = rootRef.current;
    const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(register, 150);
    });
    if (root && mo) mo.observe(root, { childList: true, subtree: true });
    return () => {
      alive = false;
      mo?.disconnect();
      window.clearTimeout(timer);
      offs.forEach((off) => off());
    };
  }, [hiddenKey, auto]);

  const focusTab = (k: K) => {
    const list = listRef.current;
    if (!list) return;
    Array.from(list.querySelectorAll<HTMLButtonElement>("[role=tab]"))
      .find((b) => b.dataset.tab === k)
      ?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, k: K) => {
    const n = keys.length;
    if (!n) return;
    const i = keys.indexOf(k);
    const next = e.key === "ArrowRight" ? keys[(i + 1) % n] : e.key === "ArrowLeft" ? keys[(i - 1 + n) % n] : e.key === "Home" ? keys[0] : e.key === "End" ? keys[n - 1] : undefined;
    if (next === undefined) return;
    e.preventDefault();
    if (next !== active) select(next);
    focusTab(next);
  };

  const textOf =(it: TabItem<K>) => it.aiLabel ?? (typeof it.label === "string" ? it.label : undefined);

  const list = (
    <div
      ref={listRef}
      role="tablist"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={cx("segs", "utabs", "scue-x", variant === "line" && "utabs--line", listClassName)}
      data-ai-id={aiId ? `${aiId}.tabs` : undefined}
      data-ai-type={aiId ? "section" : undefined}
      data-ai-label={aiId ? label : undefined}
      data-ai-target={aiTarget}
    >
      {items.map((it) => {
        const on = it.key === active;
        const tabAi = it.aiId ?? (aiId ? `${aiId}.tab.${aiSeg(it.key)}` : undefined);
        const counted = typeof it.count === "number" || Boolean(it.countLabel);
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            id={tabDomId(prefix, it.key)}
            aria-selected={on}
            aria-controls={hasPanels ? (it.panel !== undefined ? panelDomId(prefix, it.key) : undefined) : controls}
            tabIndex={on ? 0 : -1}
            disabled={it.disabled}
            className="seg"
            data-tab={it.key}
            onClick={() => {
              if (!on) select(it.key);
            }}
            onKeyDown={(e) => onKey(e, it.key)}
            data-ai-id={tabAi}
            data-ai-type={tabAi ? "tab" : undefined}
            data-ai-label={tabAi ? textOf(it) : undefined}
          >
            {it.icon ? (
              <span className="seg__ic" aria-hidden="true">
                {it.icon}
              </span>
            ) : null}
            <span className="seg__t">{it.label}</span>
            {counted ? <span className={cx("seg__n", it.countTone && `seg__n--${it.countTone}`)}>{it.countLabel ?? it.count}</span> : null}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={rootRef} className={cx("utabs-wrap", className)}>
      {end ? (
        <div className="utabs-bar">
          {list}
          <div className="utabs-bar__end">{end}</div>
        </div>
      ) : (
        list
      )}
      {hasPanels
        ? items.map((it) => {
            if (it.panel === undefined) return null;
            const on = it.key === active;
            const mount = !it.lazy || on || seen.includes(it.key);
            return (
              <div key={it.key} role="tabpanel" id={panelDomId(prefix, it.key)} aria-labelledby={tabDomId(prefix, it.key)} hidden={!on} className={cx("utabs__panel", panelClassName)} data-tab={it.key}>
                {mount ? it.panel : null}
              </div>
            );
          })
        : null}
    </div>
  );
}
