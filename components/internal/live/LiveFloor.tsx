"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { LiveBoard, LivePerson, LiveRoom, LiveUnit } from "@/lib/services/internalLive";
import { initials } from "@/lib/lawyers";
import { IconChevronLeft, IconExpand, IconMinus, IconPlus, IconUsers } from "@/components/icons";
import { HrmEmpty } from "@/components/internal/HrmUi";
import { groupBoard } from "./LiveBoardView";
import { STATUS_TONE, shownStatus, useLiveText } from "./bits";

// The office drawn as a floor seen from above and to the side: every room a
// walled bay with desks, the people at work on their chairs, the people who
// are away in trays under the floor. The whole floor is shown small; a room
// that is pressed is brought close, and there a person opens their record.
// Seats are laid out here — the backend knows rooms and who is in them, not
// where a desk stands.

type Rect = { x: number; y: number; w: number; h: number };
type Seat = { x: number; y: number; person: LivePerson | null };
type Plan = {
  key: string;
  room: LiveRoom | null;
  unit: LiveUnit | null;
  tint: number;
  x: number;
  y: number;
  w: number;
  d: number;
  desks: { x: number; y: number }[];
  seats: Seat[];
  here: number;
  total: number;
};

// One floor unit in pixels of the drawing, and the two axes of the projection.
const U = 24;
const AX = U * 0.866;
const AY = U * 0.5;
const WALL = 1.3;
const CELL_W = 3.4;
const CELL_D = 3.2;
const PAD = 0.6;
const GAP = 1.6;
// People at a desk; the rest are away and wait in the trays.
const SEATED = new Set(["working", "busy", "online", "inactive"]);
const TRAYS = ["break", "offline"] as const;
const TRAY_MAX = 14;

const pt = (x: number, y: number, z = 0): [number, number] => [(x - y) * AX, (x + y) * AY - z * U];
const pts = (...p: [number, number, number][]) => p.map(([x, y, z]) => pt(x, y, z).map((n) => n.toFixed(1)).join(",")).join(" ");

function Block({ x, y, w, d, h, z = 0, cls }: { x: number; y: number; w: number; d: number; h: number; z?: number; cls: string }) {
  const t = z + h;
  return (
    <g className={cls}>
      <polygon className="lf-f1" points={pts([x, y + d, z], [x + w, y + d, z], [x + w, y + d, t], [x, y + d, t])} />
      <polygon className="lf-f2" points={pts([x + w, y, z], [x + w, y + d, z], [x + w, y + d, t], [x + w, y, t])} />
      <polygon className="lf-f0" points={pts([x, y, t], [x + w, y, t], [x + w, y + d, t], [x, y + d, t])} />
    </g>
  );
}

// The screen box of a floor rectangle, walls and labels included.
function boxOf(x: number, y: number, w: number, d: number, pad: number): Rect {
  const c = [pt(x, y, WALL + 1.6), pt(x + w, y), pt(x, y + d), pt(x + w, y + d), pt(x + w, y, WALL), pt(x, y + d, WALL)];
  const xs = c.map((p) => p[0]);
  const ys = c.map((p) => p[1]);
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  return { x: x0, y: y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 };
}

function layout(board: LiveBoard, statusOf: (p: LivePerson) => string, filtered: boolean, openSpaces: boolean): Plan[] {
  const plans: Plan[] = [];
  groupBoard(board, statusOf).forEach((g, gi) => {
    const bays = g.rooms.length || !g.unit || filtered || !openSpaces ? g.rooms : [{ room: null, people: [] }];
    for (const { room, people } of bays) {
      const seated = people.filter((p) => SEATED.has(statusOf(p)));
      if (filtered && !seated.length) continue;
      const want = Math.max(seated.length, Math.min(room?.capacity || 4, 16));
      const deskCount = Math.ceil(want / 4);
      const cols = Math.ceil(Math.sqrt(deskCount));
      const rowsN = Math.ceil(deskCount / cols);
      const desks: Plan["desks"] = [];
      const seats: Seat[] = [];
      for (let i = 0; i < deskCount; i++) {
        const cx = PAD + (i % cols) * CELL_W;
        const cy = PAD + Math.floor(i / cols) * CELL_D;
        desks.push({ x: cx + 0.7, y: cy + 1.1 });
        for (const [sx, sy] of [[0.95, 0.35], [1.95, 0.35], [0.95, 2.35], [1.95, 2.35]]) seats.push({ x: cx + sx, y: cy + sy, person: null });
      }
      seated.forEach((p, i) => (seats[i].person = p));
      plans.push({ key: room?.id || `open:${g.unit?.id ?? "none"}`, room, unit: g.unit, tint: gi % 6, x: 0, y: 0, w: cols * CELL_W + PAD * 2, d: rowsN * CELL_D + PAD * 2, desks, seats, here: seated.length, total: people.length });
    }
  });
  // Shelves: rooms side by side until the row is as wide as the floor wants.
  const area = plans.reduce((n, p) => n + (p.w + GAP) * (p.d + GAP), 0);
  const limit = Math.max(...plans.map((p) => p.w), Math.sqrt(area) * 1.35);
  let x = 0;
  let y = 0;
  let depth = 0;
  for (const p of plans) {
    if (x > 0 && x + p.w > limit) {
      x = 0;
      y += depth + GAP;
      depth = 0;
    }
    p.x = x;
    p.y = y;
    for (const d of p.desks) {
      d.x += x;
      d.y += y;
    }
    for (const s of p.seats) {
      s.x += x;
      s.y += y;
    }
    x += p.w + GAP;
    depth = Math.max(depth, p.d);
  }
  return plans;
}

type Target = { kind: "all" } | { kind: "room"; key: string } | { kind: "box"; box: Rect };

export default function LiveFloor({ board, now, inactiveAfter, onOpen, filtered }: { board: LiveBoard; now: number; inactiveAfter: number; onOpen: (p: LivePerson) => void; filtered: boolean }) {
  const { t, roomType, status } = useLiveText();
  const statusOf = useMemo(() => (p: LivePerson) => shownStatus(p.status, p.lastSeenAt, now, inactiveAfter), [now, inactiveAfter]);
  const plans = useMemo(() => layout(board, statusOf, filtered, true), [board, statusOf, filtered]);
  const [target, setTarget] = useState<Target>({ kind: "all" });
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const view = useRef<Rect | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const swallow = useRef(false);

  const focused = target.kind === "room" ? (plans.find((p) => p.key === target.key) ?? null) : null;
  const slab = useMemo(() => {
    if (!plans.length) return { x: 0, y: 0, w: 1, d: 1 };
    const w = Math.max(...plans.map((p) => p.x + p.w));
    const d = Math.max(...plans.map((p) => p.y + p.d));
    return { x: -1.2, y: -1.2, w: w + 2.4, d: d + 2.4 };
  }, [plans]);
  const away = useMemo(() => TRAYS.map((s) => ({ status: s, people: board.people.filter((p) => statusOf(p) === s) })).filter((g) => g.people.length), [board.people, statusOf]);

  // Where the camera should rest. The whole floor leaves room below for the
  // trays that lie over the drawing.
  const goal = useMemo<Rect>(() => {
    if (target.kind === "box") return target.box;
    if (focused) return boxOf(focused.x, focused.y, focused.w, focused.d, U * 1.6);
    const all = boxOf(slab.x, slab.y, slab.w, slab.d, U);
    return away.length ? { ...all, h: all.h * 1.18 } : all;
  }, [target, focused, slab, away.length]);

  const apply = useCallback((b: Rect) => {
    const svg = svgRef.current;
    if (!svg) return;
    view.current = b;
    svg.setAttribute("viewBox", `${b.x.toFixed(2)} ${b.y.toFixed(2)} ${b.w.toFixed(2)} ${b.h.toFixed(2)}`);
    // Drawing units per screen pixel: labels are sized by it so that a room's
    // name reads the same from far and from near.
    const k = Math.max(b.w / (svg.clientWidth || 1), b.h / (svg.clientHeight || 1));
    svg.style.setProperty("--lf-k", k.toFixed(4));
  }, []);

  const { x: gx, y: gy, w: gw, h: gh } = goal;
  useLayoutEffect(() => {
    const to = { x: gx, y: gy, w: gw, h: gh };
    const from = view.current;
    if (!from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (at: number) => {
      const p = Math.min(1, (at - start) / 520);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      apply({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e });
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [gx, gy, gw, gh, apply]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (view.current) apply(view.current);
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, [apply]);

  const zoomBy = (f: number) => {
    const b = view.current ?? goal;
    const w = b.w * f;
    const h = b.h * f;
    setTarget({ kind: "box", box: { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h } });
  };
  const fit = () => setTarget({ kind: "all" });
  const enter = (key: string) => {
    setTarget({ kind: "room", key });
    // The room comes close in the middle of the map, so the map itself has to
    // be on screen.
    rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const pressed = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  };

  // Dragging moves the floor; a drag must not also count as a press.
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button === 0) drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    const b = view.current;
    const svg = svgRef.current;
    if (!d || !b || !svg) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) svg.setPointerCapture(e.pointerId);
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    const k = Math.max(b.w / (svg.clientWidth || 1), b.h / (svg.clientHeight || 1));
    apply({ ...b, x: b.x - dx * k, y: b.y - dy * k });
  };
  const onUp = () => {
    swallow.current = !!drag.current?.moved;
    drag.current = null;
  };

  if (!plans.length) {
    return <HrmEmpty icon={IconUsers} title={filtered ? t("board.noMatch") : t("board.emptyTitle")} text={filtered ? undefined : t("board.emptyText")} />;
  }

  const here = plans.reduce((n, p) => n + p.here, 0);
  const tone = (p: LivePerson) => STATUS_TONE[statusOf(p)] ?? "gray";
  const first = (name: string) => name.trim().split(/\s+/)[0] || "—";
  const planName = (p: Plan) => p.room?.name || p.unit?.name || t("board.noUnit");

  return (
    <div ref={rootRef} className={`lf${focused ? " is-room" : ""}`}>
      <svg
        ref={svgRef}
        className="lf__svg"
        role="group"
        aria-label={t("floor.title")}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClickCapture={(e) => {
          if (!swallow.current) return;
          swallow.current = false;
          e.stopPropagation();
        }}
        onClick={() => {
          if (target.kind !== "all") fit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && target.kind !== "all") fit();
        }}
      >
        <Block x={slab.x} y={slab.y} w={slab.w} d={slab.d} h={0.35} z={-0.35} cls="lf-slab" />
        {plans.map((p) => {
          const on = focused?.key === p.key;
          const solid = p.room && p.room.type !== "virtual";
          return (
            <g
              key={p.key}
              className={`lf-room lf-room--t${p.tint}${p.room ? ` lf-room--${p.room.type}` : " lf-room--open"}${on ? " on" : ""}${focused && !on ? " is-dim" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={t("floor.enter", { name: planName(p), n: p.here })}
              aria-pressed={on}
              onClick={(e) => {
                e.stopPropagation();
                if (!on) enter(p.key);
              }}
              onKeyDown={(e) => {
                if (pressed(e)) enter(p.key);
              }}
            >
              <polygon className="lf-floor" points={pts([p.x, p.y, 0], [p.x + p.w, p.y, 0], [p.x + p.w, p.y + p.d, 0], [p.x, p.y + p.d, 0])} />
              {p.room ? (
                <>
                  <polygon className="lf-wall lf-wall--a" points={pts([p.x, p.y, 0], [p.x + p.w, p.y, 0], [p.x + p.w, p.y, WALL], [p.x, p.y, WALL])} />
                  <polygon className="lf-wall lf-wall--b" points={pts([p.x, p.y, 0], [p.x, p.y + p.d, 0], [p.x, p.y + p.d, WALL], [p.x, p.y, WALL])} />
                  {solid ? <polygon className="lf-glass" points={pts([p.x + 0.4, p.y, 0.5], [p.x + p.w - 0.4, p.y, 0.5], [p.x + p.w - 0.4, p.y, 1.05], [p.x + 0.4, p.y, 1.05])} /> : null}
                </>
              ) : null}
              {p.desks.map((d, i) => (
                <g key={i}>
                  {p.seats.slice(i * 4, i * 4 + 2).map((s, j) => (
                    <Block key={j} x={s.x} y={s.y} w={0.5} d={0.5} h={0.45} cls={`lf-chair${s.person ? " is-taken" : ""}`} />
                  ))}
                  <Block x={d.x} y={d.y} w={2} d={1} h={0.7} cls="lf-desk" />
                  {p.seats.slice(i * 4 + 2, i * 4 + 4).map((s, j) => (
                    <Block key={j} x={s.x} y={s.y} w={0.5} d={0.5} h={0.45} cls={`lf-chair${s.person ? " is-taken" : ""}`} />
                  ))}
                </g>
              ))}
            </g>
          );
        })}
        {plans.map((p) => {
          const on = focused?.key === p.key;
          return (
            <g key={p.key} className={focused && !on ? "lf-dim" : undefined}>
              {p.seats.map((s) => {
                const who = s.person;
                if (!who) return null;
                const [x, y] = pt(s.x + 0.25, s.y + 0.25, 1.25);
                return (
                  <g
                    key={who.id}
                    className={`lf-av lf-av--${tone(who)}`}
                    transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
                    role={on ? "button" : undefined}
                    tabIndex={on ? 0 : undefined}
                    aria-hidden={on ? undefined : true}
                    aria-label={on ? t("board.open", { name: who.name }) : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (on) onOpen(who);
                      else enter(p.key);
                    }}
                    onKeyDown={(e) => {
                      if (on && pressed(e)) onOpen(who);
                    }}
                  >
                    <title>{`${who.name} — ${status(statusOf(who))}`}</title>
                    <circle r={13} />
                    <text className="lf-av__i" y={3.6}>{initials(who.name || "?")}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
        {focused
          ? focused.seats.map((s) => {
              if (!s.person) return null;
              const [x, y] = pt(s.x + 0.25, s.y + 0.25, 1.25);
              return (
                <text key={s.person.id} className="lf-name" x={x.toFixed(1)} y={(y + 23).toFixed(1)} aria-hidden>
                  {first(s.person.name)}
                </text>
              );
            })
          : null}
        {plans.map((p) => {
          const [x, y] = pt(p.x, p.y, p.room ? WALL : 0);
          return (
            <text key={p.key} className={`lf-label${focused && focused.key !== p.key ? " lf-dim" : ""}`} x={x.toFixed(1)} y={y.toFixed(1)} dy="-0.7em" aria-hidden>
              {planName(p)}
              <tspan className="lf-label__n" dx="0.5em">{p.room?.capacity ? `${p.here}/${p.room.capacity}` : p.here}</tspan>
            </text>
          );
        })}
      </svg>

      <div className="lf__top">
        {focused ? (
          <>
            <button type="button" className="lf-btn" onClick={fit}>
              <IconChevronLeft />
              {t("floor.back")}
            </button>
            <span className="lf-where">
              <b>{planName(focused)}</b>
              <small>{[focused.room ? focused.unit?.name : "", focused.room ? roomType(focused.room.type) : t("floor.openSpace"), t("floor.atDesks", { n: focused.here })].filter(Boolean).join(" · ")}</small>
            </span>
          </>
        ) : (
          <span className="lf-hint">{t("floor.hint")}</span>
        )}
        <span className="lf-count" title={t("board.onlineOfTotal")}>
          <IconUsers />
          {here}/{board.people.length}
        </span>
      </div>

      <div className="lf__zoom" role="group" aria-label={t("floor.zoom")}>
        <button type="button" onClick={fit} aria-label={t("floor.fit")} title={t("floor.fit")}><IconExpand /></button>
        <button type="button" onClick={() => zoomBy(1 / 1.35)} aria-label={t("floor.zoomIn")} title={t("floor.zoomIn")}><IconPlus /></button>
        <button type="button" onClick={() => zoomBy(1.35)} aria-label={t("floor.zoomOut")} title={t("floor.zoomOut")}><IconMinus /></button>
      </div>

      {away.length ? (
        <div className="lf__trays">
          {away.map((g) => (
            <section key={g.status} className={`lf-tray lf-tray--${STATUS_TONE[g.status]}`}>
              <h3>
                {status(g.status)}
                <span>{g.people.length}</span>
              </h3>
              <div>
                {g.people.slice(0, TRAY_MAX).map((p) => (
                  <button key={p.id} type="button" onClick={() => onOpen(p)} title={p.name} aria-label={t("board.open", { name: p.name })}>
                    {initials(p.name || "?")}
                  </button>
                ))}
                {g.people.length > TRAY_MAX ? <i>+{g.people.length - TRAY_MAX}</i> : null}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
