"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { asArr, asDict, asNum, asStr } from "@/lib/http";
import { getOrgUnitDetail, normEmployee, personName, type OrgBoardNode } from "@/lib/services/internalHrm";
import {
  IconBriefcase,
  IconBuilding,
  IconArrowRight,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconCircleX,
  IconClose,
  IconDocLines,
  IconDownload,
  IconEdit,
  IconExpand,
  IconExternal,
  IconEye,
  IconLayers,
  IconMinus,
  IconPlus,
  IconSearch,
  IconTarget,
  IconUser,
  IconUserPlus,
  IconUsers,
} from "@/components/icons";
import { useHrmDirectory } from "@/components/internal/useHrmDirectory";
import { HrmEmpty, HrmError, HrmKv, HrmLoading, HrmPerson, HrmStatus, useHrmFormat } from "@/components/internal/HrmUi";
import OrgContextMenu, { type OrgMenuItem } from "./OrgContextMenu";
import { flatten, positionIdOf, type Tree } from "./orgTree";

// The organisation as a whiteboard: every unit a card with its type's colour
// down its left edge, its type and code, its name, and — by the mode chosen —
// its head and people, or its positions; cards laid out as a tree joined by
// right-angled lines, wide branches of single cards stacked into a column.
// The board pans and zooms (wheel, pinch, buttons), fits itself, finds a
// card by name and walks the matches, folds branches, goes full screen and
// saves itself as a picture. Pressing a card opens its panel on the right.

export type BoardMode = "structure" | "people" | "positions";
type Box = { tree: Tree; x: number; y: number; parent: Box | null; stacked: boolean; descendants: number };
type Cam = { x: number; y: number; k: number };

const CW = 268;
const CH = 138;
const GX = 36;
const GY = 74;
const INDENT = 34;
const COL_GAP = 16;
const K_MIN = 0.25;
const K_MAX = 1.8;
export const TYPE_COLOR: Record<string, string> = { company: "#1668F0", department: "#19C3B1", team: "#8B5CF6", branch: "#F5A623", division: "#E5484D" };
const HEX = /^#[0-9a-f]{3,8}$/i;
const colorOf = (n: OrgBoardNode) => {
  const own = asStr(asDict(n.raw.meta).board_color);
  return HEX.test(own) && own.toLowerCase() !== "#0b1f45" ? own : TYPE_COLOR[asStr(n.raw.unit_type)] ?? "#64748B";
};
const fteOf = (people: OrgBoardNode[]) => people.reduce((s, p) => s + (asNum(asDict(p.raw.assignment).rate, 100) || 100) / 100, 0);
const countUnits = (t: Tree): number => t.units.reduce((n, u) => n + 1 + countUnits(u), 0);

// A tidy tree: a parent centred over its children; children that are all
// leaves and three or more become a column under the parent's left edge.
function layout(trees: Tree[], collapsed: Set<string>): Box[] {
  const kids = (t: Tree) => (collapsed.has(t.node.id) ? [] : t.units);
  const stack = (t: Tree) => {
    const k = kids(t);
    return k.length >= 3 && k.every((c) => !kids(c).length);
  };
  const widthOf = new Map<string, number>();
  const measure = (t: Tree): number => {
    const k = kids(t);
    let w = CW;
    if (stack(t)) w = CW + INDENT;
    else if (k.length) w = Math.max(CW, k.reduce((s, c) => s + measure(c), 0) + GX * (k.length - 1));
    widthOf.set(t.node.id, w);
    return w;
  };
  const out: Box[] = [];
  const place = (t: Tree, left: number, top: number, parent: Box | null, stacked: boolean): Box => {
    const w = widthOf.get(t.node.id) ?? CW;
    const k = kids(t);
    const box: Box = { tree: t, x: left, y: top, parent, stacked, descendants: countUnits(t) };
    out.push(box);
    if (!k.length) {
      box.x = left + (w - CW) / 2;
      return box;
    }
    if (stack(t)) {
      box.x = left;
      k.forEach((c, i) => place(c, left + INDENT, top + CH + GY * 0.55 + i * (CH + COL_GAP), box, true));
      return box;
    }
    const span = k.reduce((s, c) => s + (widthOf.get(c.node.id) ?? CW), 0) + GX * (k.length - 1);
    let cx = left + (w - span) / 2;
    const placed = k.map((c) => {
      const b = place(c, cx, top + CH + GY, box, false);
      cx += (widthOf.get(c.node.id) ?? CW) + GX;
      return b;
    });
    box.x = (placed[0].x + placed[placed.length - 1].x) / 2;
    return box;
  };
  let left = 0;
  for (const t of trees) {
    const w = measure(t);
    place(t, left, 0, null, false);
    left += w + GX * 2;
  }
  return out;
}

function edgePath(b: Box): string {
  const p = b.parent!;
  if (b.stacked) {
    const sx = p.x + 18;
    const cy = b.y + CH / 2;
    return `M${sx} ${p.y + CH}V${cy - 8}Q${sx} ${cy} ${sx + 8} ${cy}H${b.x}`;
  }
  const px = p.x + CW / 2;
  const cx = b.x + CW / 2;
  const mid = p.y + CH + GY / 2;
  if (Math.abs(px - cx) < 1) return `M${px} ${p.y + CH}V${b.y}`;
  const dir = cx > px ? 1 : -1;
  const r = Math.min(10, Math.abs(cx - px) / 2);
  return `M${px} ${p.y + CH}V${mid - r}Q${px} ${mid} ${px + dir * r} ${mid}H${cx - dir * r}Q${cx} ${mid} ${cx} ${mid + r}V${b.y}`;
}

type Menu = { kind: "node"; id: string; x: number; y: number } | { kind: "edge"; id: string; x: number; y: number } | { kind: "pane"; x: number; y: number };
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

export default function OrgWhiteboard({
  trees,
  onEditUnit,
  onAddUnit,
  onAddEmployee,
  onOpenEmployee,
  onRename,
  onDuplicate,
  onAddAbove,
  onCloseUnit,
}: {
  trees: Tree[];
  onEditUnit: (unitId: string) => void;
  onAddUnit: (parentId: string) => void;
  onAddEmployee: (unitId: string) => void;
  onOpenEmployee: (employeeId: string) => void;
  // Right-click (and keyboard) actions on a unit.
  onRename: (unitId: string, name: string) => Promise<void>;
  onDuplicate: (unitId: string) => void;
  // A new unit between this one and its parent (or above the top).
  onAddAbove: (unitId: string) => void;
  onCloseUnit: (unitId: string) => void;
}) {
  const tb = useTranslations("internal.people.board");
  const tu = useTranslations("internal.ui");
  const shell = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<BoardMode>("structure");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [hit, setHit] = useState(0);
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [full, setFull] = useState(false);
  const [mini, setMini] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [editing, setEditing] = useState("");
  const [chainOf, setChainOf] = useState("");
  const [copied, setCopied] = useState("");
  const [cam, setCam] = useState<Cam>({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const fitted = useRef(false);

  const boxes = useMemo(() => layout(trees, collapsed), [trees, collapsed]);
  const bounds = useMemo(() => {
    if (!boxes.length) return { x: 0, y: 0, w: CW, h: CH };
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    return { x: x0, y: y0, w: Math.max(...boxes.map((b) => b.x + CW)) - x0, h: Math.max(...boxes.map((b) => b.y + CH)) - y0 };
  }, [boxes]);
  const panelOpen = Boolean(selected);
  const viewW = size.w - (panelOpen && size.w > 900 ? 392 : 0);

  // Size of the board on screen.
  useLayoutEffect(() => {
    const el = shell.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitTo = useCallback(
    (r: { x: number; y: number; w: number; h: number }, max = 1) => {
      if (!viewW || !size.h) return;
      const pad = 56;
      const k = Math.max(K_MIN, Math.min(max, (viewW - pad * 2) / r.w, (size.h - pad * 2 - 40) / r.h));
      setCam({ k, x: (viewW - r.w * k) / 2 - r.x * k, y: Math.max(pad + 24, (size.h - r.h * k) / 2) - r.y * k });
    },
    [viewW, size.h],
  );
  const fit = useCallback(() => fitTo(bounds), [fitTo, bounds]);
  // First look: the whole company when it fits at a readable size; a wide
  // one opens on its top card instead, readable, and is panned from there.
  useEffect(() => {
    if (fitted.current || !viewW || !size.h || !boxes.length) return;
    fitted.current = true;
    const pad = 56;
    const whole = Math.min(1, (viewW - pad * 2) / bounds.w, (size.h - pad * 2 - 40) / bounds.h);
    const h = setTimeout(() => {
      if (whole >= 0.72) return fit();
      const root = boxes.find((x) => !x.parent) ?? boxes[0];
      const k = 0.78;
      setCam({ k, x: viewW / 2 - (root.x + CW / 2) * k, y: pad + 40 - root.y * k });
    }, 0);
    return () => clearTimeout(h);
  }, [viewW, size.h, boxes, bounds, fit]);

  // Zoom about a point of the screen.
  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    setCam((c) => {
      const k = Math.max(K_MIN, Math.min(K_MAX, c.k * factor));
      const f = k / c.k;
      return { k, x: sx - (sx - c.x) * f, y: sy - (sy - c.y) * f };
    });
  }, []);
  // The wheel zooms the board instead of scrolling the page.
  useEffect(() => {
    const el = shell.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest(".ob-panel, .ob-tools, .ob-legend")) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.shiftKey) setCam((c) => ({ ...c, x: c.x - e.deltaY }));
      else zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Drag to pan; two fingers to pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number } | null>(null);
  const moved = useRef(false);
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, input, .ob-panel, .ob-tools, .ob-legend, .ob-mini, a")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    // The pointer is captured only once it moves: a plain press still
    // reaches the card under it.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = shell.current!.getBoundingClientRect();
      zoomAt(d / pinch.current.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch.current = { d };
      return;
    }
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    if (!moved.current && Math.abs(dx) + Math.abs(dy) > 2) {
      moved.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setCam((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  // Search: every card whose name, code, head or people match; Enter walks them.
  const needle = query.trim().toLocaleLowerCase();
  const matches = useMemo(() => {
    if (!needle) return [] as Box[];
    return boxes.filter((b) => {
      const n = b.tree.node;
      const text = [n.label, n.subtitle, personName(n.raw.head), ...b.tree.people.map((p) => `${p.label} ${p.subtitle} ${asStr(p.raw.employee_code)}`)].join(" ").toLocaleLowerCase();
      return text.includes(needle);
    });
  }, [boxes, needle]);
  const matchIds = useMemo(() => new Set(matches.map((b) => b.tree.node.id)), [matches]);
  const focusBox = useCallback(
    (b: Box) => {
      if (!viewW) return;
      setCam((c) => {
        const k = Math.max(c.k, 0.85);
        return { k, x: viewW / 2 - (b.x + CW / 2) * k, y: size.h / 2 - (b.y + CH / 2) * k };
      });
    },
    [viewW, size.h],
  );
  const walk = (d: 1 | -1) => {
    if (!matches.length) return;
    const i = (hit + d + matches.length) % matches.length;
    setHit(i);
    focusBox(matches[i]);
    setSelected(matches[i].tree.node.id);
  };

  // The path from the selected card to the top lights up.
  const chain = useMemo(() => {
    const out = new Set<string>();
    let b = boxes.find((x) => x.tree.node.id === selected) ?? null;
    while (b) {
      out.add(b.tree.node.id);
      b = b.parent;
    }
    return out;
  }, [boxes, selected]);

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of flatten(trees)) {
      const ty = asStr(t.node.raw.unit_type) || "department";
      m.set(ty, (m.get(ty) ?? 0) + 1);
    }
    return [...m.entries()];
  }, [trees]);

  const toggle = (id: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const all = flatten(trees);
  const collapseAll = () => setCollapsed(new Set(all.filter((t) => t.units.length && t.depth >= 1).map((t) => t.node.id)));
  const expandAll = () => setCollapsed(new Set());
  const selectedBox = boxes.find((b) => b.tree.node.id === selected) ?? null;

  // A card picked under the panel is slid into view beside it.
  const sx = selectedBox ? selectedBox.x * cam.k + cam.x : 0;
  const sw = CW * cam.k;
  useEffect(() => {
    if (!selectedBox || !viewW) return;
    const overRight = sx + sw - (viewW - 24);
    const overLeft = 24 - sx;
    if (overRight <= 0 && overLeft <= 0) return;
    const h = setTimeout(() => setCam((c) => ({ ...c, x: c.x - (overRight > 0 ? overRight : -overLeft) })), 0);
    return () => clearTimeout(h);
    // Only when the selection or the space beside the panel changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, viewW]);

  // ── The right-click menu ───────────────────────────────────────────────
  const at = (clientX: number, clientY: number) => {
    const r = shell.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  };
  const boxOfId = (id: string) => boxes.find((b) => b.tree.node.id === id) ?? null;
  // Show one branch whole: the camera fits the unit and everything under it.
  const showBranch = (id: string) => {
    const root = boxOfId(id);
    if (!root) return;
    const inside = boxes.filter((b) => {
      for (let p: Box | null = b; p; p = p.parent) if (p === root) return true;
      return false;
    });
    const x0 = Math.min(...inside.map((b) => b.x));
    const y0 = Math.min(...inside.map((b) => b.y));
    fitTo({ x: x0, y: y0, w: Math.max(...inside.map((b) => b.x + CW)) - x0, h: Math.max(...inside.map((b) => b.y + CH)) - y0 }, 1.1);
  };
  const copyText = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(""), 1800);
    });
  };
  const unitLink = (b: Box) => `${window.location.origin}${window.location.pathname}?unit=${encodeURIComponent(b.tree.node.entityId)}`;
  const menuItems = (m: Menu): OrgMenuItem[] => {
    if (m.kind === "node") {
      const b = boxOfId(m.id);
      if (!b) return [];
      const n = b.tree.node;
      const hasKids = b.tree.units.length > 0;
      return [
        { label: tb("menu.open"), icon: IconEye, kbd: "Enter", onSelect: () => setSelected(n.id) },
        { label: tb("menu.rename"), icon: IconEdit, kbd: "F2", onSelect: () => setEditing(n.id) },
        { label: tb("menu.edit"), icon: IconDocLines, onSelect: () => onEditUnit(n.entityId) },
        { kind: "separator" },
        { label: tb("addChild"), icon: IconPlus, kbd: "Tab", onSelect: () => onAddUnit(n.entityId) },
        { label: tb("addSibling"), icon: IconPlus, hidden: !b.parent, onSelect: () => b.parent && onAddUnit(b.parent.tree.node.entityId) },
        { label: tb("menu.addAbove"), icon: IconPlus, onSelect: () => onAddAbove(n.entityId) },
        { label: tb("addEmployee"), icon: IconUserPlus, onSelect: () => onAddEmployee(n.entityId) },
        { kind: "separator" },
        { label: tb("menu.duplicate"), icon: IconLayers, kbd: `${MOD}D`, onSelect: () => onDuplicate(n.entityId) },
        { label: tb("menu.copyName"), icon: IconDocLines, onSelect: () => copyText(n.label, tb("menu.copiedName")) },
        { label: tb("menu.copyLink"), icon: IconExternal, onSelect: () => copyText(unitLink(b), tb("menu.copiedLink")) },
        { kind: "separator" },
        { label: collapsed.has(n.id) ? tb("expand") : tb("collapse"), icon: IconChevronDown, hidden: !hasKids, onSelect: () => toggle(n.id) },
        { label: tb("menu.chain"), icon: IconTarget, checked: chainOf === n.id, onSelect: () => setChainOf(chainOf === n.id ? "" : n.id) },
        { label: tb("menu.branch"), icon: IconExpand, hidden: !hasKids, onSelect: () => showBranch(n.id) },
        { kind: "separator" },
        { label: tb("menu.close"), icon: IconCircleX, kbd: "Del", danger: true, onSelect: () => onCloseUnit(n.entityId) },
      ];
    }
    if (m.kind === "edge") {
      const child = boxOfId(m.id);
      if (!child?.parent) return [];
      return [
        { label: tb("menu.insertBetween"), icon: IconPlus, onSelect: () => onAddAbove(child.tree.node.entityId) },
        { kind: "separator" },
        { label: tb("menu.goParent", { name: child.parent.tree.node.label }), icon: IconArrowRight, onSelect: () => { setSelected(child.parent!.tree.node.id); focusBox(child.parent!); } },
        { label: tb("menu.goChild", { name: child.tree.node.label }), icon: IconArrowRight, onSelect: () => { setSelected(child.tree.node.id); focusBox(child); } },
      ];
    }
    return [
      { label: tb("menu.addRoot"), icon: IconPlus, onSelect: () => onAddUnit("") },
      { kind: "separator" },
      { label: tb("fit"), icon: IconExpand, kbd: "0", onSelect: fit },
      { label: tb("expandAll"), icon: IconChevronDown, disabled: !collapsed.size, onSelect: expandAll },
      { label: tb("collapseAll"), icon: IconLayers, onSelect: collapseAll },
      { label: tb("menu.clearChain"), icon: IconTarget, hidden: !chainOf, onSelect: () => setChainOf("") },
      { kind: "separator" },
      { kind: "header", label: tb("cardMode") },
      ...(["structure", "people", "positions"] as BoardMode[]).map((mo) => ({ label: tb(`mode.${mo}`), checked: mode === mo, onSelect: () => setMode(mo) })),
      { kind: "separator" },
      { label: tb("minimap"), checked: mini, onSelect: () => setMini(!mini) },
      { label: full ? tb("exitFull") : tb("full"), checked: full, onSelect: () => setFull(!full) },
      { kind: "separator" },
      { label: tb("exportPng"), icon: IconDownload, onSelect: () => download("png") },
      { label: tb("exportSvg"), icon: IconDownload, onSelect: () => download("svg") },
    ];
  };
  // The chain asked for: that unit, everything above it and below it.
  const chainSet = useMemo(() => {
    if (!chainOf) return null;
    const root = boxes.find((b) => b.tree.node.id === chainOf);
    if (!root) return null;
    const out = new Set<string>();
    for (let p: Box | null = root; p; p = p.parent) out.add(p.tree.node.id);
    for (const b of boxes) for (let p: Box | null = b; p; p = p.parent) if (p === root) out.add(b.tree.node.id);
    return out;
  }, [boxes, chainOf]);

  // A unit link (?unit=…) opens on that unit.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || !boxes.length || !viewW) return;
    linked.current = true;
    const id = new URLSearchParams(window.location.search).get("unit");
    const b = id ? boxes.find((x) => x.tree.node.entityId === id) : null;
    if (!b) return;
    const h = setTimeout(() => {
      setSelected(b.tree.node.id);
      focusBox(b);
    }, 60);
    return () => clearTimeout(h);
  }, [boxes, viewW, focusBox]);

  // Esc closes the panel, then leaves full screen — unless a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector(".ldrw, .amodal, .hn-pal")) return;
      if (exportOpen) setExportOpen(false);
      else if (chainOf) setChainOf("");
      else if (selected) setSelected("");
      else if (full) setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, full, exportOpen, chainOf]);

  const download = (kind: "svg" | "png") => {
    setExportOpen(false);
    const svg = toSvg(boxes, bounds, (n) => (asStr(n.raw.unit_type) && tu.has(`unitType.${asStr(n.raw.unit_type)}`) ? tu(`unitType.${asStr(n.raw.unit_type)}`) : tb("department")), tb("head"));
    const name = `lexgo-org-${new Date().toISOString().slice(0, 10)}`;
    if (kind === "svg") {
      save(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const c = document.createElement("canvas");
      c.width = (bounds.w + 80) * scale;
      c.height = (bounds.h + 80) * scale;
      const g = c.getContext("2d");
      if (!g) return;
      g.scale(scale, scale);
      g.drawImage(img, 0, 0);
      c.toBlob((b) => b && save(b, `${name}.png`), "image/png");
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const vb = viewW && size.h ? { x: -cam.x / cam.k, y: -cam.y / cam.k, w: viewW / cam.k, h: size.h / cam.k } : null;

  return (
    <div
      ref={shell}
      className={`ob${full ? " ob--full" : ""}${panelOpen ? " ob--panel" : ""}`}
      style={{ "--ob-k": cam.k, backgroundPosition: `${cam.x}px ${cam.y}px`, backgroundSize: `${22 * cam.k}px ${22 * cam.k}px` } as CSSProperties}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClick={(e) => {
        if (!moved.current && e.target === e.currentTarget) setSelected("");
      }}
      // The board never scrolls: focusing a card half off screen would shift
      // the whole board (toolbar and all) sideways. The camera moves instead.
      onScroll={(e) => {
        e.currentTarget.scrollLeft = 0;
        e.currentTarget.scrollTop = 0;
      }}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest(".ob-panel, .ob-tools, .ob-legend, .ob-zoom, .ob-mini, .ob-menu, input")) return;
        e.preventDefault();
        setMenu({ kind: "pane", ...at(e.clientX, e.clientY) });
      }}
      tabIndex={0}
      aria-label={tb("boardLabel")}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        if (e.key === "+" || e.key === "=") zoomAt(1.2, viewW / 2, size.h / 2);
        if (e.key === "-") zoomAt(1 / 1.2, viewW / 2, size.h / 2);
        if (e.key === "0") fit();
      }}
    >
      <div className="ob-world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }} onClick={(e) => e.target === e.currentTarget && !moved.current && setSelected("")}>
        <svg className="ob-edges" style={{ left: bounds.x - 40, top: bounds.y - 40, width: bounds.w + 80, height: bounds.h + 80 }} viewBox={`${bounds.x - 40} ${bounds.y - 40} ${bounds.w + 80} ${bounds.h + 80}`} aria-hidden>
          {boxes
            .filter((b) => b.parent)
            .map((b) => (
              <path key={b.tree.node.id} d={edgePath(b)} className={`${chain.has(b.tree.node.id) && chain.has(b.parent!.tree.node.id) ? "is-chain" : ""}${(needle && !matchIds.has(b.tree.node.id)) || (chainSet && !chainSet.has(b.tree.node.id)) ? " is-dim" : ""}${menu?.kind === "edge" && menu.id === b.tree.node.id ? " is-menu" : ""}`} />
            ))}
          {/* Wide invisible twins of the lines: what a right-click on a line hits. */}
          {boxes
            .filter((b) => b.parent)
            .map((b) => (
              <path
                key={`hit-${b.tree.node.id}`}
                d={edgePath(b)}
                className="ob-edge-hit"
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenu({ kind: "edge", id: b.tree.node.id, ...at(e.clientX, e.clientY) });
                }}
              />
            ))}
        </svg>
        {boxes.map((b) => (
          <Card
            key={b.tree.node.id}
            box={b}
            mode={mode}
            selected={selected === b.tree.node.id}
            dim={(needle && !matchIds.has(b.tree.node.id)) || (types.size > 0 && !types.has(asStr(b.tree.node.raw.unit_type) || "department")) || (!!chainSet && !chainSet.has(b.tree.node.id))}
            match={!!needle && matchIds.has(b.tree.node.id)}
            chain={chain.has(b.tree.node.id) && selected !== b.tree.node.id}
            collapsed={collapsed.has(b.tree.node.id)}
            onSelect={() => !moved.current && setSelected(b.tree.node.id)}
            onToggle={() => toggle(b.tree.node.id)}
            onEdit={() => onEditUnit(b.tree.node.entityId)}
            onAddChild={() => onAddUnit(b.tree.node.entityId)}
            onAddSibling={b.parent ? () => onAddUnit(b.parent!.tree.node.entityId) : undefined}
            onOpenEmployee={onOpenEmployee}
            menuOn={menu?.kind === "node" && menu.id === b.tree.node.id}
            onFocusCard={() => {
              const x = b.x * cam.k + cam.x;
              const y = b.y * cam.k + cam.y;
              if (x < 0 || y < 0 || x + CW * cam.k > viewW || y + CH * cam.k > size.h) focusBox(b);
            }}
            editing={editing === b.tree.node.id}
            onMenu={(x, y) => setMenu({ kind: "node", id: b.tree.node.id, ...at(x, y) })}
            onRename={async (name) => {
              setEditing("");
              shell.current?.focus({ preventScroll: true });
              if (name && name !== b.tree.node.label) await onRename(b.tree.node.entityId, name);
            }}
            onShortcut={(key) => {
              const id = b.tree.node.entityId;
              if (key === "rename") setEditing(b.tree.node.id);
              else if (key === "child") onAddUnit(id);
              else if (key === "duplicate") onDuplicate(id);
              else if (key === "close") onCloseUnit(id);
            }}
          />
        ))}
      </div>

      {menu ? (
        <OrgContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu)}
          label={tb("menu.label")}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {copied ? <span className="ob-toast" role="status">{copied}</span> : null}
      {chainSet && chainOf ? (
        <button type="button" className="ob-chip" onClick={() => setChainOf("")}>
          <IconTarget aria-hidden />
          {tb("menu.chainOf", { name: boxOfId(chainOf)?.tree.node.label ?? "" })}
          <IconClose aria-hidden />
        </button>
      ) : null}

      <div className="ob-tools" role="toolbar" aria-label={tb("toolbar")}>
        <div className="ob-seg" role="radiogroup" aria-label={tb("cardMode")}>
          {(["structure", "people", "positions"] as BoardMode[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)} title={tb(`mode.${m}`)}>
              {m === "structure" ? <IconBuilding /> : m === "people" ? <IconUsers /> : <IconBriefcase />}
              <span>{tb(`mode.${m}`)}</span>
            </button>
          ))}
        </div>
        <span className="ob-sep" />
        <label className="ob-find">
          <IconSearch aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHit(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                walk(e.shiftKey ? -1 : 1);
              }
            }}
            placeholder={tb("search")}
            aria-label={tb("search")}
            maxLength={120}
          />
          {needle ? (
            <span className="ob-find__n" aria-live="polite">
              {matches.length ? tb("matchOf", { i: Math.min(hit + 1, matches.length), n: matches.length }) : tb("noHits")}
            </span>
          ) : null}
          {needle && matches.length > 1 ? (
            <>
              <button type="button" onClick={() => walk(-1)} aria-label={tb("prevHit")} title={tb("prevHit")}>
                <IconChevronLeft />
              </button>
              <button type="button" onClick={() => walk(1)} aria-label={tb("nextHit")} title={tb("nextHit")}>
                <IconChevronRight />
              </button>
            </>
          ) : null}
        </label>
        <span className="ob-sep" />
        <button type="button" className="ob-ib" onClick={collapseAll} title={tb("collapseAll")} aria-label={tb("collapseAll")}>
          <IconLayers />
        </button>
        <button type="button" className="ob-ib" onClick={expandAll} title={tb("expandAll")} aria-label={tb("expandAll")}>
          <IconChevronDown />
        </button>
        <button type="button" className={`ob-ib${full ? " on" : ""}`} onClick={() => setFull(!full)} title={full ? tb("exitFull") : tb("full")} aria-label={full ? tb("exitFull") : tb("full")} aria-pressed={full}>
          <IconExpand />
        </button>
        <div className="ob-exp">
          <button type="button" className={`ob-ib${exportOpen ? " on" : ""}`} onClick={() => setExportOpen(!exportOpen)} title={tb("export")} aria-label={tb("export")} aria-expanded={exportOpen}>
            <IconDownload />
          </button>
          {exportOpen ? (
            <div className="ob-exp__menu" role="menu">
              <button type="button" role="menuitem" onClick={() => download("png")}>{tb("exportPng")}</button>
              <button type="button" role="menuitem" onClick={() => download("svg")}>{tb("exportSvg")}</button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="ob-legend" aria-label={tb("legend")}>
        {typeCounts.map(([ty, n]) => {
          const on = types.has(ty);
          return (
            <button
              key={ty}
              type="button"
              className={on ? "on" : ""}
              aria-pressed={on}
              onClick={() =>
                setTypes((cur) => {
                  const next = new Set(cur);
                  if (next.has(ty)) next.delete(ty);
                  else next.add(ty);
                  return next;
                })
              }
              style={{ "--c": TYPE_COLOR[ty] ?? "#64748B" } as CSSProperties}
            >
              <i aria-hidden />
              {tu.has(`unitType.${ty}`) ? tu(`unitType.${ty}`) : ty}
              <b>{n}</b>
            </button>
          );
        })}
      </div>

      <div className="ob-zoom" role="group" aria-label={tb("zoom")}>
        <button type="button" onClick={() => zoomAt(1 / 1.2, viewW / 2, size.h / 2)} disabled={cam.k <= K_MIN + 0.001} aria-label={tb("zoomOut")} title={tb("zoomOut")}>
          <IconMinus />
        </button>
        <output>{Math.round(cam.k * 100)}%</output>
        <button type="button" onClick={() => zoomAt(1.2, viewW / 2, size.h / 2)} disabled={cam.k >= K_MAX - 0.001} aria-label={tb("zoomIn")} title={tb("zoomIn")}>
          <IconPlus />
        </button>
        <button type="button" onClick={fit} aria-label={tb("fit")} title={tb("fit")}>
          <IconExpand />
        </button>
        <button type="button" className={mini ? "on" : ""} onClick={() => setMini(!mini)} aria-pressed={mini} aria-label={tb("minimap")} title={tb("minimap")}>
          <IconLayers />
        </button>
      </div>

      {mini && vb && boxes.length ? (
        <MiniMap
          boxes={boxes}
          bounds={bounds}
          view={vb}
          selected={selected}
          onJump={(x, y) => setCam((c) => ({ ...c, x: viewW / 2 - x * c.k, y: size.h / 2 - y * c.k }))}
          label={tb("minimap")}
        />
      ) : null}

      {selectedBox ? (
        <UnitPanel
          key={selectedBox.tree.node.id}
          tree={selectedBox.tree}
          parent={selectedBox.parent?.tree ?? null}
          onClose={() => setSelected("")}
          onSelect={(id) => {
            const b = boxes.find((x) => x.tree.node.id === id);
            if (b) {
              setSelected(id);
              focusBox(b);
            }
          }}
          onEditUnit={onEditUnit}
          onAddUnit={onAddUnit}
          onAddEmployee={onAddEmployee}
          onOpenEmployee={onOpenEmployee}
        />
      ) : null}
    </div>
  );
}

// ── A card ──────────────────────────────────────────────────────────────────

function Card({
  box,
  mode,
  selected,
  dim,
  match,
  chain,
  collapsed,
  onSelect,
  onToggle,
  onEdit,
  onAddChild,
  onAddSibling,
  onOpenEmployee,
  menuOn,
  onFocusCard,
  editing,
  onMenu,
  onRename,
  onShortcut,
}: {
  box: Box;
  mode: BoardMode;
  selected: boolean;
  dim: boolean;
  match: boolean;
  chain: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onAddChild: () => void;
  onAddSibling?: () => void;
  onOpenEmployee: (id: string) => void;
  menuOn: boolean;
  onFocusCard: () => void;
  editing: boolean;
  onMenu: (clientX: number, clientY: number) => void;
  onRename: (name: string) => void;
  onShortcut: (key: "rename" | "child" | "duplicate" | "close") => void;
}) {
  const tb = useTranslations("internal.people.board");
  // A long press on a touch screen opens the same menu as a right-click.
  const press = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.t);
    press.current = null;
  };
  const tu = useTranslations("internal.ui");
  const n = box.tree.node;
  const people = box.tree.people;
  const type = asStr(n.raw.unit_type) || "department";
  const head = personName(n.raw.head);
  const status = asStr(n.raw.status);
  const fte = fteOf(people);
  const style = { left: box.x, top: box.y, width: CW, height: CH, "--c": colorOf(n) } as CSSProperties;
  const positions = useMemo(() => {
    const m = new Map<string, { title: string; n: number }>();
    for (const p of people) {
      const id = positionIdOf(p) || p.subtitle;
      const title = asStr(asDict(p.raw.position).title) || p.subtitle || "—";
      m.set(id, { title, n: (m.get(id)?.n ?? 0) + 1 });
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [people]);
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  return (
    <div
      className={`obc${selected ? " is-sel" : ""}${dim ? " is-dim" : ""}${match ? " is-match" : ""}${chain ? " is-chain" : ""}${menuOn ? " is-menu" : ""}`}
      style={style}
      data-unit={n.entityId}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${n.label} (${n.subtitle})`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
      onFocus={(e) => e.target === e.currentTarget && onFocusCard()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        cancelPress();
        onMenu(e.clientX, e.clientY);
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "touch") return;
        const { clientX, clientY } = e;
        press.current = { t: setTimeout(() => onMenu(clientX, clientY), 550), x: clientX, y: clientY };
      }}
      onPointerMove={(e) => {
        if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 8) cancelPress();
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onKeyDown={(e) => {
        if (editing) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        } else if (e.key === "F2") {
          e.preventDefault();
          onShortcut("rename");
        } else if (e.key === "Tab" && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          onShortcut("child");
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
          e.preventDefault();
          onShortcut("duplicate");
        } else if (e.key === "Delete") {
          e.preventDefault();
          onShortcut("close");
        } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
          e.preventDefault();
          onMenu(r.left + 24, r.top + 30);
        }
      }}
      title={tb("dblEdit")}
    >
      <div className="obc__head">
        <span className="obc__type">
          <IconBuilding aria-hidden />
          {tu.has(`unitType.${type}`) ? tu(`unitType.${type}`) : type}
        </span>
        <span className="obc__code">{n.subtitle}</span>
        <span className="obc__sp" />
        {status && status !== "active" ? <span className="obc__st">{status}</span> : null}
      </div>
      {editing ? <RenameInput initial={n.label} label={tb("menu.rename")} onDone={onRename} /> : <div className="obc__title">{n.label}</div>}
      <div className="obc__body">
        {mode === "positions" ? (
          positions.length ? (
            <>
              {positions.slice(0, 2).map((p) => (
                <div key={p.title} className="obc__seat">
                  <span>{p.title}</span>
                  <b>{p.n}</b>
                </div>
              ))}
              {positions.length > 2 ? <span className="obc__muted">{tb("morePositions", { n: positions.length - 2 })}</span> : null}
            </>
          ) : (
            <span className="obc__muted">{tb("noPositions")}</span>
          )
        ) : mode === "people" ? (
          <>
            <div className="obc__row">
              {people.length ? (
                <span className="obc__avs">
                  {people.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="obc__av"
                      title={`${p.label} · ${p.subtitle}`}
                      aria-label={p.label}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenEmployee(p.entityId);
                      }}
                    >
                      {initialsOf(p.label)}
                    </button>
                  ))}
                  {people.length > 6 ? <span className="obc__av obc__av--more">+{people.length - 6}</span> : null}
                </span>
              ) : (
                <span className="obc__muted">{tb("noPeople")}</span>
              )}
            </div>
            <div className={`obc__line${head ? "" : " obc__muted"}`}>{head ? `${tb("headPrefix")} ${head}` : tb("noHead")}</div>
          </>
        ) : (
          <>
            <div className="obc__row">
              {head ? <span className="obc__av obc__av--head">{initialsOf(head)}</span> : <span className="obc__av obc__av--more">—</span>}
              <span className={`obc__line${head ? "" : " obc__muted"}`}>
                <span className="obc__muted">{tb("headPrefix")} </span>
                {head || tb("noHead")}
              </span>
            </div>
            <div className="obc__row">
              <span className="obc__bar" aria-hidden>
                <i style={{ width: `${people.length ? Math.min(100, (fte / Math.max(people.length, 1)) * 100) : 0}%` }} />
              </span>
              <span className="obc__fte">{tb("peopleFte", { n: people.length, fte: fmt(fte) })}</span>
            </div>
          </>
        )}
      </div>
      {box.tree.units.length ? (
        <button
          type="button"
          className="obc__fold"
          aria-expanded={!collapsed}
          aria-label={collapsed ? tb("expand") : tb("collapse")}
          title={collapsed ? tb("expand") : tb("collapse")}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <IconChevronDown className={collapsed ? "" : "is-up"} />
          {box.descendants}
        </button>
      ) : null}
      <button
        type="button"
        className="obc__add obc__add--child"
        aria-label={tb("addChild")}
        title={tb("addChild")}
        onClick={(e) => {
          e.stopPropagation();
          onAddChild();
        }}
      >
        <IconPlus />
      </button>
      {onAddSibling ? (
        <button
          type="button"
          className="obc__add obc__add--sib"
          aria-label={tb("addSibling")}
          title={tb("addSibling")}
          onClick={(e) => {
            e.stopPropagation();
            onAddSibling();
          }}
        >
          <IconPlus />
        </button>
      ) : null}
    </div>
  );
}

// The name typed on the card itself: Enter keeps it, Esc drops it.
function RenameInput({ initial, label, onDone }: { initial: string; label: string; onDone: (v: string) => void }) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const finish = (value: string) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <input
      className="obc__rename"
      value={v}
      maxLength={160}
      aria-label={label}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(v.trim());
        if (e.key === "Escape") finish("");
      }}
      onBlur={() => finish(v.trim())}
    />
  );
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

// ── Minimap ─────────────────────────────────────────────────────────────────

function MiniMap({ boxes, bounds, view, selected, onJump, label }: { boxes: Box[]; bounds: { x: number; y: number; w: number; h: number }; view: { x: number; y: number; w: number; h: number }; selected: string; onJump: (x: number, y: number) => void; label: string }) {
  const W = 196;
  const H = 128;
  const pad = 40;
  const k = Math.min(W / (bounds.w + pad * 2), H / (bounds.h + pad * 2));
  const ox = bounds.x - pad;
  const oy = bounds.y - pad;
  const go = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onJump((e.clientX - r.left) / k + ox, (e.clientY - r.top) / k + oy);
  };
  return (
    <div className="ob-mini" aria-label={label} role="img">
      <svg
        width={W}
        height={H}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          go(e);
        }}
        onPointerMove={(e) => e.buttons === 1 && go(e)}
      >
        {boxes.map((b) => (
          <rect key={b.tree.node.id} x={(b.x - ox) * k} y={(b.y - oy) * k} width={CW * k} height={CH * k} rx={2} fill={b.tree.node.id === selected ? "var(--b500,#2f7cf6)" : colorOf(b.tree.node)} opacity={b.tree.node.id === selected ? 1 : 0.55} />
        ))}
        <rect className="ob-mini__view" x={(view.x - ox) * k} y={(view.y - oy) * k} width={view.w * k} height={view.h * k} rx={3} />
      </svg>
    </div>
  );
}

// ── The panel of a unit ─────────────────────────────────────────────────────

type Tab = "details" | "people" | "units";

function UnitPanel({
  tree,
  parent,
  onClose,
  onSelect,
  onEditUnit,
  onAddUnit,
  onAddEmployee,
  onOpenEmployee,
}: {
  tree: Tree;
  parent: Tree | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onEditUnit: (id: string) => void;
  onAddUnit: (parentId: string) => void;
  onAddEmployee: (unitId: string) => void;
  onOpenEmployee: (id: string) => void;
}) {
  const t = useTranslations("internal.people");
  const tb = useTranslations("internal.people.board");
  const tu = useTranslations("internal.ui");
  const f = useHrmFormat();
  const dir = useHrmDirectory();
  const node = tree.node;
  const unitId = node.entityId;
  const [tab, setTab] = useState<Tab>("details");
  const [detail, setDetail] = useState<{ data: Record<string, unknown>; failed?: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    getOrgUnitDetail(unitId, c.signal)
      .then((d) => !c.signal.aborted && setDetail({ data: asDict(d) }))
      .catch(() => !c.signal.aborted && setDetail({ data: {}, failed: true }));
    return () => c.abort();
  }, [unitId, retry]);
  const d = detail && !detail.failed ? detail.data : null;
  const people = d ? asArr(d.people).map((p) => ({ employee: normEmployee(asDict(p).employee), assignment: asDict(asDict(p).assignment) })) : tree.people.map((p) => ({ employee: normEmployee({ ...asDict(p.raw.employee), id: p.entityId, display_name: p.label, employee_code: p.raw.employee_code }), assignment: asDict(p.raw.assignment) }));
  const type = asStr(node.raw.unit_type) || "department";
  const head = personName(node.raw.head);
  const headId = asStr(asDict(node.raw.head).id);
  const fte = fteOf(tree.people);
  const meta = asDict(node.raw.meta);
  return (
    <aside className="ob-panel" style={{ "--c": colorOf(node) } as CSSProperties} aria-label={node.label} onPointerDown={(e) => e.stopPropagation()}>
      <div className="ob-panel__head">
        <div className="ob-panel__t">
          <span className="obc__type">
            <IconBuilding aria-hidden />
            {tu.has(`unitType.${type}`) ? tu(`unitType.${type}`) : type}
          </span>
          <h3>{node.label}</h3>
          <span className="ob-panel__badges">
            <span className="hrm-code">{node.subtitle}</span>
            <HrmStatus value={asStr(node.raw.status) || "active"} />
            {parent ? (
              <button type="button" className="org-link" onClick={() => onSelect(parent.node.id)}>
                ↑ {parent.node.label}
              </button>
            ) : null}
          </span>
        </div>
        <button type="button" className="ob-panel__x" onClick={onClose} aria-label={tb("close")} title={tb("close")}>
          <IconClose />
        </button>
      </div>
      <div className="hrm-tabs ob-panel__tabs" role="tablist">
        {(["details", "people", "units"] as Tab[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {tb(`tab.${k}`)}
            {k === "people" ? <span className="hrm-count">{people.length}</span> : k === "units" ? <span className="hrm-count">{tree.units.length}</span> : null}
          </button>
        ))}
      </div>
      <div className="ob-panel__body">
        {detail?.failed ? <HrmError text={tb("detailError")} onRetry={() => setRetry((n) => n + 1)} retryLabel={tb("retry")} /> : null}
        {tab === "details" ? (
          <>
            <div className="hrm-minis" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}>
              <div className="hrm-mini"><b>{people.length}</b><span>{tb("people")}</span></div>
              <div className="hrm-mini"><b>{Number.isInteger(fte) ? fte : fte.toFixed(1)}</b><span>{tb("fte")}</span></div>
              <div className="hrm-mini"><b>{countUnits(tree)}</b><span>{tb("subUnits")}</span></div>
            </div>
            <div className="ob-panel__sec">
              <span className="ldrw__lbl">{tb("head")}</span>
              {head ? (
                <button type="button" className="org-row" onClick={() => headId && onOpenEmployee(headId)}>
                  <HrmPerson name={head} sub={asStr(asDict(node.raw.head).employee_code)} />
                </button>
              ) : (
                <p className="hrm-muted">{tb("noHead")}</p>
              )}
            </div>
            <HrmKv
              rows={[
                { label: tb("code"), value: node.subtitle || "—" },
                ...(asStr(meta.city) ? [{ label: tb("city"), value: asStr(meta.city) }] : []),
                { label: tb("level"), value: String(tree.depth + 1) },
                ...(asStr(asDict(d ?? {}).created_at) ? [{ label: tb("created"), value: f.date(asStr(asDict(d ?? {}).created_at)) }] : []),
              ]}
            />
          </>
        ) : tab === "people" ? (
          !d && !detail ? (
            <HrmLoading rows={3} />
          ) : people.length ? (
            <ul className="hrm-list">
              {people.map(({ employee, assignment }) => (
                <li key={employee.id}>
                  <button type="button" className="org-row" onClick={() => onOpenEmployee(employee.id)}>
                    <HrmPerson name={employee.name || employee.code} sub={[dir.positionTitle(asStr(assignment.position_id)), asNum(assignment.rate) && asNum(assignment.rate) !== 100 ? `${asNum(assignment.rate)}%` : ""].filter(Boolean).join(" · ") || employee.code} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <HrmEmpty icon={IconUsers} title={tb("noPeople")} />
          )
        ) : tree.units.length ? (
          <ul className="hrm-list">
            {tree.units.map((u) => (
              <li key={u.node.id}>
                <button type="button" className="org-row" onClick={() => onSelect(u.node.id)}>
                  <span className="ob-dot" style={{ background: colorOf(u.node) }} aria-hidden />
                  <span className="hrm-list__t"><b>{u.node.label}</b><small>{[u.node.subtitle, personName(u.node.raw.head)].filter(Boolean).join(" · ")}</small></span>
                  <span className="hrm-count">{u.people.length}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <HrmEmpty icon={IconBuilding} title={tb("noSubUnits")} />
        )}
      </div>
      <div className="ob-panel__foot">
        <button className="btn btn--line btn--sm" type="button" onClick={() => onEditUnit(unitId)}><IconEdit />{t("editUnit")}</button>
        <button className="btn btn--line btn--sm" type="button" onClick={() => onAddUnit(unitId)}><IconPlus />{tb("addSubUnit")}</button>
        <button className="btn btn--pri btn--sm" type="button" onClick={() => onAddEmployee(unitId)}><IconUserPlus />{tb("addEmployee")}</button>
      </div>
      {head ? null : <span className="ob-panel__hint"><IconUser aria-hidden />{tb("noHeadHint")}</span>}
    </aside>
  );
}

// ── Export ──────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function toSvg(boxes: Box[], b: { x: number; y: number; w: number; h: number }, typeName: (n: OrgBoardNode) => string, headWord: string): string {
  const ox = b.x - 40;
  const oy = b.y - 40;
  const W = b.w + 80;
  const H = b.h + 80;
  const edges = boxes.filter((x) => x.parent).map((x) => `<path d="${edgePath(x)}" fill="none" stroke="#B6C2D2" stroke-width="1.75"/>`).join("");
  const cards = boxes
    .map((x) => {
      const n = x.tree.node;
      const c = colorOf(n);
      const head = personName(n.raw.head);
      return `<g transform="translate(${x.x} ${x.y})"><rect width="${CW}" height="${CH}" rx="14" fill="#fff" stroke="#E2E8F0"/><rect x="0" y="12" width="4" height="${CH - 24}" rx="2" fill="${c}"/><text x="16" y="26" font-size="11" font-weight="700" fill="${c}">${esc(typeName(n))} · ${esc(n.subtitle)}</text><text x="16" y="52" font-size="15" font-weight="700" fill="#0F1F3D">${esc(clip(n.label, 30))}</text><text x="16" y="${CH - 40}" font-size="12" fill="#475569">${esc(head ? `${headWord}: ${clip(head, 28)}` : "—")}</text><text x="16" y="${CH - 18}" font-size="12" fill="#64748B">${x.tree.people.length} 👤</text></g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${ox} ${oy} ${W} ${H}" font-family="Inter, Segoe UI, Arial, sans-serif"><rect x="${ox}" y="${oy}" width="${W}" height="${H}" fill="#F5F7FB"/>${edges}${cards}</svg>`;
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
