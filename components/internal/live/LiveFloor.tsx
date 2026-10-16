"use client";

import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { asDict } from "@/lib/http";
import type { LiveBoard, LivePerson, LiveRoom, LiveUnit } from "@/lib/services/internalLive";
import { initials } from "@/lib/lawyers";
import { IconMoon, IconSun, IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight, IconClose, IconEdit, IconExpand, IconGrid, IconMinus, IconPlus, IconUsers } from "@/components/icons";
import { HrmEmpty } from "@/components/internal/HrmUi";
import { Block, U, boxOf, onFloor, pt, unpt, useFloorCamera, type Rect } from "@/components/live/floorKit";
import { FloorDefs, SeatMark, WindowWallX, WindowWallY } from "@/components/live/floorArt";
import { groupBoard } from "./LiveBoardView";
import { STATUS_TONE, apiMessage, shownStatus, useLiveText } from "./bits";
import { deskGrid, floorOf, tintOf, type Dict } from "./roomPlan";
import { RoomArt, SIDE, themeOf, type ThemeId } from "./roomArt";
import CharacterArt, { backdropOf } from "./CharacterArt";
import type { Look } from "./character";

// The office drawn as a floor seen from above and to the side: every room a
// walled bay with desks, the people at work on their chairs, the people who
// are away in trays under the floor. The whole floor is shown small; a room
// that is pressed is brought close, and there a person opens their record.
// Seats are laid out here — the backend knows rooms and who is in them, not
// where a desk stands. Where a room stands an admin can set by dragging it
// (kept in the room's meta as floor: {x, y}); other rooms find a place.

type Seat = { x: number; y: number; person: LivePerson | null };
type Pos = { x: number; y: number };
type Plan = {
  key: string;
  room: LiveRoom | null;
  unit: LiveUnit | null;
  tint: number;
  // An admin's own floor colour, or the style's floor.
  ownTint: boolean;
  theme: ThemeId;
  // The width of the desks; the furnished corner is beyond it.
  gw: number;
  x: number;
  y: number;
  w: number;
  d: number;
  desks: { x: number; y: number }[];
  seats: Seat[];
  here: number;
  total: number;
};

const WALL = 1.3;
const GAP = 1.8;
// A dragged room lands on half a desk-step.
const SNAP = 0.5;
const snap = (n: number) => Math.max(0, Math.round(n / SNAP) * SNAP);
// People at a desk; the rest are away and wait in the trays.
const SEATED = new Set(["working", "busy", "online", "inactive"]);
const TRAYS = ["break", "offline"] as const;
const TRAY_MAX = 14;

// Rooms an admin has placed stand where they were put; the rest go on
// shelves below them, side by side until a row is as wide as the floor wants.
function layout(board: LiveBoard, statusOf: (p: LivePerson) => string, filtered: boolean, openSpaces: boolean, placeOf: (id: string) => Pos | null, tintFor: (id: string) => number | null, metaFor: (id: string) => Dict): Plan[] {
  const plans: Plan[] = [];
  groupBoard(board, statusOf).forEach((g, gi) => {
    const bays = g.rooms.length || !g.unit || filtered || !openSpaces ? g.rooms : [{ room: null, people: [] }];
    for (const { room, people } of bays) {
      const seated = people.filter((p) => SEATED.has(statusOf(p)));
      if (filtered && !seated.length) continue;
      const grid = deskGrid(Math.max(seated.length, Math.min(room?.capacity || 4, 16)));
      const seats: Seat[] = grid.seats.map((s) => ({ ...s, person: null }));
      seated.forEach((p, i) => (seats[i].person = p));
      const own = room ? tintFor(room.id) : null;
      const key = room?.id || `open:${g.unit?.id ?? "none"}`;
      const theme = themeOf(room ? metaFor(room.id) : {}, [room?.name ?? "", room?.code ?? "", g.unit?.name ?? "", g.unit?.code ?? ""], room?.type ?? "physical", key);
      plans.push({ key, room, unit: g.unit, tint: own ?? gi % 6, ownTint: own !== null, theme, gw: grid.w, x: 0, y: 0, w: grid.w + SIDE, d: grid.d, desks: grid.desks, seats, here: seated.length, total: people.length });
    }
  });
  const put = (p: Plan, x: number, y: number) => {
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
  };
  const fixed: Plan[] = [];
  const rest: Plan[] = [];
  for (const p of plans) {
    const at = p.room ? placeOf(p.room.id) : null;
    if (at) {
      put(p, at.x, at.y);
      fixed.push(p);
    } else rest.push(p);
  }
  const area = rest.reduce((n, p) => n + (p.w + GAP) * (p.d + GAP), 0);
  const limit = Math.max(...rest.map((p) => p.w), Math.sqrt(area) * 1.35, ...fixed.map((p) => p.x + p.w));
  let x = 0;
  let y = fixed.length ? Math.max(...fixed.map((p) => p.y + p.d)) + GAP : 0;
  let depth = 0;
  for (const p of rest) {
    if (x > 0 && x + p.w > limit) {
      x = 0;
      y += depth + GAP;
      depth = 0;
    }
    put(p, x, y);
    x += p.w + GAP;
    depth = Math.max(depth, p.d);
  }
  return plans;
}

// Rooms that stand on one another (a little apart is fine).
function clashes(plans: Plan[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < plans.length; i++)
    for (let j = i + 1; j < plans.length; j++) {
      const a = plans[i];
      const b = plans[j];
      if (a.x < b.x + b.w - 0.1 && b.x < a.x + a.w - 0.1 && a.y < b.y + b.d - 0.1 && b.y < a.y + a.d - 0.1) {
        out.add(a.key);
        out.add(b.key);
      }
    }
  return out;
}

type Target = { kind: "all" } | { kind: "room"; key: string } | { kind: "box"; box: Rect };
type Arrange = { draft: Record<string, Pos>; start: Record<string, Pos>; frozen: Rect; picked: string; limit: Pos };
export type RoomMove = { room: LiveRoom; x: number; y: number };

export default function LiveFloor({
  board,
  now,
  inactiveAfter,
  onOpen,
  filtered,
  roomMeta,
  onArrange,
  onAddRoom,
  onEditRoom,
  lookOf,
}: {
  board: LiveBoard;
  now: number;
  inactiveAfter: number;
  onOpen: (p: LivePerson) => void;
  filtered: boolean;
  // The rooms' meta as the rooms list has it (the board may leave it out).
  roomMeta?: Record<string, Dict>;
  // Admins: put rooms where they stand, add one, change one.
  onArrange?: (moves: RoomMove[]) => Promise<void>;
  onAddRoom?: () => void;
  onEditRoom?: (room: LiveRoom) => void;
  // Each person's character; without it the floor shows initials.
  lookOf?: (id: string) => Look;
}) {
  const { t, roomType, status } = useLiveText();
  const statusOf = useMemo(() => (p: LivePerson) => shownStatus(p.status, p.lastSeenAt, now, inactiveAfter), [now, inactiveAfter]);
  const [arrange, setArrange] = useState<Arrange | null>(null);
  const [saving, setSaving] = useState(false);
  const [arrErr, setArrErr] = useState("");
  const metaOf = useCallback((id: string) => roomMeta?.[id] ?? asDict(board.rooms.find((r) => r.id === id)?.raw.meta), [roomMeta, board.rooms]);
  const draft = arrange?.draft;
  const plans = useMemo(
    () => layout(board, statusOf, filtered && !draft, true, (id) => (draft ? (draft[id] ?? null) : floorOf(metaOf(id))), (id) => tintOf(metaOf(id)), metaOf),
    [board, statusOf, filtered, draft, metaOf],
  );
  // Back to front, so a room moved behind another is drawn behind it.
  const drawOrder = useMemo(() => [...plans].sort((a, b) => a.y + a.d - (b.y + b.d) || a.x - b.x), [plans]);
  const clash = useMemo(() => (draft ? clashes(plans) : new Set<string>()), [draft, plans]);
  const [target, setTarget] = useState<Target>({ kind: "all" });
  const rootRef = useRef<HTMLDivElement>(null);
  const clipId = `lfav${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const focused = !arrange && target.kind === "room" ? (plans.find((p) => p.key === target.key) ?? null) : null;
  const slab = useMemo(() => {
    if (!plans.length) return { x: 0, y: 0, w: 1, d: 1 };
    const x0 = Math.min(...plans.map((p) => p.x));
    const y0 = Math.min(...plans.map((p) => p.y));
    const w = Math.max(...plans.map((p) => p.x + p.w));
    const d = Math.max(...plans.map((p) => p.y + p.d));
    return { x: x0 - 1.2, y: y0 - 1.2, w: w - x0 + 2.4, d: d - y0 + 2.4 };
  }, [plans]);
  const away = useMemo(() => TRAYS.map((s) => ({ status: s, people: board.people.filter((p) => statusOf(p) === s) })).filter((g) => g.people.length), [board.people, statusOf]);

  // Where the camera should rest. The whole floor leaves room below for the
  // trays that lie over the drawing; while rooms are being moved it stays
  // put, with room around the floor to move them into.
  const goal = useMemo<Rect>(() => {
    if (arrange) return arrange.frozen;
    if (target.kind === "box") return target.box;
    if (focused) return boxOf(focused.x - 0.5, focused.y - 0.6, focused.w + 1, focused.d + 1, U * 0.7);
    const all = boxOf(slab.x, slab.y, slab.w, slab.d, U, 2.2);
    return away.length ? { ...all, h: all.h * 1.18 } : all;
  }, [arrange, target, focused, slab, away.length]);

  const { svgRef, scaled, onPointerDown, onPointerMove, onPointerUp, onClickCapture } = useFloorCamera(goal);
  const zoomBy = (f: number) => (arrange ? setArrange({ ...arrange, frozen: scaled(f) }) : setTarget({ kind: "box", box: scaled(f) }));
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

  // Arranging: every room gets the place it has now, so moving one does not
  // send the others back onto their shelves.
  const startArrange = () => {
    const at = Object.fromEntries(plans.filter((p) => p.room).map((p) => [p.room!.id, { x: snap(p.x), y: snap(p.y) }]));
    setTarget({ kind: "all" });
    setArrErr("");
    // A room can go a few steps past the floor's edge, not off the map.
    const limit = { x: snap(slab.x + slab.w + 4), y: snap(slab.y + slab.d + 4) };
    setArrange({ draft: at, start: at, frozen: boxOf(slab.x - 5, slab.y - 3, slab.w + 10, slab.d + 8, U, 2.2), picked: "", limit });
    rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const moveTo = (id: string, x: number, y: number) => setArrange((a) => (a ? { ...a, draft: { ...a.draft, [id]: { x: Math.min(a.limit.x, snap(x)), y: Math.min(a.limit.y, snap(y)) } } } : a));
  const nudge = (dx: number, dy: number) => {
    const at = arrange?.picked ? arrange.draft[arrange.picked] : null;
    if (arrange?.picked && at) moveTo(arrange.picked, at.x + dx, at.y + dy);
  };
  const pick = (id: string) => setArrange((a) => (a ? { ...a, picked: id } : a));
  const autoArrange = () => {
    const fresh = layout(board, statusOf, false, true, () => null, (id) => tintOf(metaOf(id)), metaOf);
    setArrange((a) => (a ? { ...a, draft: Object.fromEntries(fresh.filter((p) => p.room).map((p) => [p.room!.id, { x: snap(p.x), y: snap(p.y) }])) } : a));
  };
  // Every room whose kept place differs is saved — also those never moved
  // by hand, or saving one would send the rest onto new shelves.
  const moves: RoomMove[] = arrange
    ? plans.flatMap((p) => {
        if (!p.room) return [];
        const was = floorOf(metaOf(p.room.id));
        return was && was.x === p.x && was.y === p.y ? [] : [{ room: p.room, x: p.x, y: p.y }];
      })
    : [];
  const moved = arrange ? Object.keys(arrange.draft).filter((id) => arrange.start[id]?.x !== arrange.draft[id].x || arrange.start[id]?.y !== arrange.draft[id].y).length : 0;
  const saveArrange = async () => {
    if (!onArrange || saving) return;
    setSaving(true);
    setArrErr("");
    try {
      if (moves.length) await onArrange(moves);
      setArrange(null);
    } catch (cause) {
      setArrErr(apiMessage(cause, t("errors.save")));
    } finally {
      setSaving(false);
    }
  };
  const arrowKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 2 : SNAP;
    const d = e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : e.key === "ArrowDown" ? [0, step] : null;
    if (!d) return false;
    e.preventDefault();
    e.stopPropagation();
    nudge(d[0], d[1]);
    return true;
  };

  if (!plans.length) {
    return (
      <HrmEmpty
        icon={IconUsers}
        title={filtered ? t("board.noMatch") : t("board.emptyTitle")}
        text={filtered ? undefined : t("board.emptyText")}
        action={onAddRoom && !filtered ? <button type="button" className="btn btn--pri btn--sm" onClick={onAddRoom}><IconPlus />{t("builder.title")}</button> : undefined}
      />
    );
  }

  const here = plans.reduce((n, p) => n + p.here, 0);
  // Morning, day, evening or night in Tashkent, as the backend says (§19),
  // so every screen shows the same light.
  const scene = ["morning", "day", "evening", "night"].includes(String(board.raw.scene_mode)) ? String(board.raw.scene_mode) : "day";
  const tone = (p: LivePerson) => STATUS_TONE[statusOf(p)] ?? "gray";
  const first = (name: string) => name.trim().split(/\s+/)[0] || "—";
  const planName = (p: Plan) => p.room?.name || p.unit?.name || t("board.noUnit");
  const picked = arrange?.picked ? (plans.find((p) => p.room?.id === arrange.picked) ?? null) : null;

  return (
    <div ref={rootRef} className={`lf lf--hrm lf--scene-${scene}${focused ? " is-room" : ""}${arrange ? " is-arrange" : ""}`}>
      <svg
        ref={svgRef}
        className="lf__svg"
        role="group"
        aria-label={t("floor.title")}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        onClick={() => {
          if (arrange) pick("");
          else if (target.kind !== "all") fit();
        }}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          if (arrange) pick("");
          else if (target.kind !== "all") fit();
        }}
      >
        <FloorDefs />
        <defs>
          <clipPath id={clipId}>
            <circle r={10.4} />
          </clipPath>
        </defs>
        <Block x={slab.x} y={slab.y} w={slab.w} d={slab.d} h={0.45} z={-0.45} cls="lf-m-slab" />
        <g transform={onFloor()} className="lf-ground">
          <rect className="lf-carpet" x={slab.x + 0.3} y={slab.y + 0.3} width={slab.w - 0.6} height={slab.d - 0.6} />
        </g>
        <WindowWallX x={slab.x + 0.3} y={slab.y + 0.6} w={slab.w - 0.3} h={1.7} />
        <WindowWallY x={slab.x + 0.6} y={slab.y + 0.6} d={slab.d - 0.9} h={1.7} />
        {drawOrder.map((p) => {
          const on = focused?.key === p.key;
          const id = p.room?.id ?? "";
          const isPicked = !!arrange && !!id && arrange.picked === id;
          const cls = `lf-room lf-room--t${p.tint}${p.room ? ` lf-room--${p.room.type}` : " lf-room--open"}${on ? " on" : ""}${focused && !on ? " is-dim" : ""}${arrange ? (p.room ? " is-movable" : " is-fixed") : ""}${isPicked ? " is-picked" : ""}${clash.has(p.key) ? " is-clash" : ""}`;
          return (
            <g
              key={p.key}
              className={cls}
              role="button"
              tabIndex={arrange && !p.room ? -1 : 0}
              aria-label={arrange ? (p.room ? t("arrange.room", { name: planName(p) }) : t("arrange.openSpace", { name: planName(p) })) : t("floor.enter", { name: planName(p), n: p.here })}
              aria-pressed={arrange ? isPicked : on}
              onPointerDown={(e) => {
                if (!arrange || !p.room || e.button !== 0) return;
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
                pick(id);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || d.id !== id) return;
                e.stopPropagation();
                const ctm = svgRef.current?.getScreenCTM();
                if (!ctm || (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3)) return;
                d.moved = true;
                const [fx, fy] = unpt((e.clientX - d.sx) / ctm.a, (e.clientY - d.sy) / ctm.d);
                moveTo(id, d.ox + fx, d.oy + fy);
              }}
              onPointerUp={(e) => {
                if (drag.current?.id !== id) return;
                e.stopPropagation();
                drag.current = null;
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (arrange) pick(id);
                else if (!on) enter(p.key);
              }}
              onKeyDown={(e) => {
                if (arrange) {
                  if (!p.room) return;
                  if (pressed(e)) pick(id);
                  else if (isPicked) arrowKey(e);
                  return;
                }
                if (pressed(e)) enter(p.key);
              }}
            >
              <RoomArt
                x={p.x}
                y={p.y}
                w={p.w}
                d={p.d}
                gw={p.gw}
                theme={p.theme}
                type={p.room?.type ?? "physical"}
                desks={p.desks}
                taken={p.desks.map((_, i) => p.seats.slice(i * 4, i * 4 + 4).map((s) => !!s.person))}
                tint={p.ownTint ? p.tint : null}
                open={!p.room}
              />
              {arrange && p.room ? (
                <g transform={onFloor(0.02)} className="lf-grip" aria-hidden>
                  <rect x={p.x + 0.12} y={p.y + 0.12} width={p.w - 0.24} height={p.d - 0.24} rx="0.3" />
                </g>
              ) : null}
            </g>
          );
        })}
        <g className={focused ? "lf-marks" : "lf-marks is-far"} aria-hidden>
          {plans.flatMap((p) => p.seats.map((s, i) => (s.person ? null : <g key={`${p.key}${i}`} className={focused && focused.key !== p.key ? "lf-dim" : undefined}><SeatMark x={s.x} y={s.y} /></g>)))}
        </g>
        {plans.map((p) => {
          const on = focused?.key === p.key;
          return (
            <g key={p.key} className={focused && !on ? "lf-dim" : undefined}>
              {p.seats.map((s) => {
                const who = s.person;
                if (!who) return null;
                const [x, y] = pt(s.x, s.y, 1.45);
                return (
                  <g
                    key={who.id}
                    className={`lf-av lf-av--${tone(who)}`}
                    transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
                    role={on ? "button" : undefined}
                    tabIndex={on ? 0 : undefined}
                    aria-hidden={on ? undefined : true}
                    aria-label={on ? t("board.watch", { name: who.name }) : undefined}
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
                    <circle className="lf-av__rim" r={13.4} />
                    {lookOf ? (
                      <>
                        <circle r={10.4} fill={backdropOf(lookOf(who.id))} />
                        <g clipPath={`url(#${clipId})`}>
                          <CharacterArt look={lookOf(who.id)} variant="bust" x={-10.4} y={-10.4} width={20.8} height={20.8} className="chr lf-av__chr" />
                        </g>
                      </>
                    ) : (
                      <>
                        <circle className="lf-av__bg" r={10.4} />
                        <text className="lf-av__i" y={3.4}>{initials(who.name || "?")}</text>
                      </>
                    )}
                    <circle className="lf-av__ring" r={11.6} />
                  </g>
                );
              })}
            </g>
          );
        })}
        {focused
          ? focused.seats.map((s) => {
              if (!s.person) return null;
              const [x, y] = pt(s.x, s.y, 1.45);
              return (
                <text key={s.person.id} className="lf-name" x={x.toFixed(1)} y={(y + 23).toFixed(1)} aria-hidden>
                  {first(s.person.name)}
                </text>
              );
            })
          : null}
        {plans.map((p) => {
          const [x, y] = pt(p.x + p.w / 2, p.y + 0.1, p.room ? WALL + 0.75 : 0.9);
          return (
            <text key={p.key} className={`lf-label${focused && focused.key !== p.key ? " lf-dim" : ""}${arrange && !p.room ? " lf-dim" : ""}`} x={x.toFixed(1)} y={y.toFixed(1)} aria-hidden>
              {planName(p)}
              <tspan className="lf-label__n" dx="0.5em">{p.room?.capacity ? `${p.here}/${p.room.capacity}` : p.here}</tspan>
            </text>
          );
        })}
      </svg>

      <div className="lf__top">
        {arrange ? (
          <>
            <span className="lf-where lf-arr">
              <b>{picked ? planName(picked) : t("arrange.title")}</b>
              <small>{clash.size ? t("arrange.clash") : picked ? t("arrange.at", { x: picked.x, y: picked.y }) : t("arrange.hint")}</small>
            </span>
            <span className="lf-arr__a">
              {picked?.room && onEditRoom ? (
                <button type="button" className="lf-btn" onClick={() => onEditRoom(picked.room!)} aria-label={t("rooms.edit")}>
                  <IconEdit />
                  <span>{t("rooms.edit")}</span>
                </button>
              ) : null}
              <button type="button" className="lf-btn" onClick={autoArrange} title={t("arrange.autoHint")} aria-label={t("arrange.auto")}>
                <IconGrid />
                <span>{t("arrange.auto")}</span>
              </button>
              <button type="button" className="lf-btn" onClick={() => setArrange(null)} disabled={saving} aria-label={t("cancel")}>
                <IconClose />
                <span>{t("cancel")}</span>
              </button>
              <button type="button" className="lf-btn lf-btn--pri" onClick={() => void saveArrange()} disabled={saving || clash.size > 0} aria-label={t("save")}>
                <IconCheck />
                <span>{saving ? t("saving") : moved ? t("arrange.saveN", { n: moved }) : t("save")}</span>
              </button>
            </span>
          </>
        ) : focused ? (
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
        {arrange ? null : (
          <>
            {onArrange ? (
              <button type="button" className="lf-btn lf-btn--tool" onClick={startArrange} disabled={filtered || !board.rooms.length} title={filtered ? t("arrange.clearFilters") : !board.rooms.length ? t("arrange.noRooms") : t("arrange.start")} aria-label={t("arrange.start")}>
                <IconExpand />
                <span>{t("arrange.start")}</span>
              </button>
            ) : null}
            {onAddRoom ? (
              <button type="button" className="lf-btn lf-btn--tool lf-btn--pri" onClick={onAddRoom} aria-label={t("builder.title")} title={t("builder.title")}>
                <IconPlus />
                <span>{t("arrange.addRoom")}</span>
              </button>
            ) : null}
            <span className={`lf-count lf-scene lf-scene--${scene}`} title={t(`floor.scene.${scene}`)} aria-label={t(`floor.scene.${scene}`)}>
              {scene === "night" || scene === "evening" ? <IconMoon /> : <IconSun />}
            </span>
            <span className="lf-count" title={t("board.onlineOfTotal")}>
              <IconUsers />
              {here}/{board.people.length}
            </span>
          </>
        )}
      </div>
      {arrErr ? <p className="lf-arr__err" role="alert">{arrErr}</p> : null}

      <div className="lf__zoom" role="group" aria-label={t("floor.zoom")}>
        {arrange ? null : <button type="button" onClick={fit} aria-label={t("floor.fit")} title={t("floor.fit")}><IconExpand /></button>}
        <button type="button" onClick={() => zoomBy(1 / 1.35)} aria-label={t("floor.zoomIn")} title={t("floor.zoomIn")}><IconPlus /></button>
        <button type="button" onClick={() => zoomBy(1.35)} aria-label={t("floor.zoomOut")} title={t("floor.zoomOut")}><IconMinus /></button>
      </div>

      {arrange && picked ? (
        <div className="lf__pad" role="group" aria-label={t("arrange.move", { name: planName(picked) })}>
          <button type="button" className="lf__pad-u" onClick={() => nudge(0, -SNAP)} aria-label={t("arrange.back")}><IconChevronDown /></button>
          <button type="button" className="lf__pad-l" onClick={() => nudge(-SNAP, 0)} aria-label={t("arrange.left")}><IconChevronLeft /></button>
          <button type="button" className="lf__pad-r" onClick={() => nudge(SNAP, 0)} aria-label={t("arrange.right")}><IconChevronRight /></button>
          <button type="button" className="lf__pad-d" onClick={() => nudge(0, SNAP)} aria-label={t("arrange.front")}><IconChevronDown /></button>
        </div>
      ) : null}

      {away.length && !arrange ? (
        <div className="lf__trays">
          {away.map((g) => (
            <section key={g.status} className={`lf-tray lf-tray--${STATUS_TONE[g.status]}`}>
              <h3>
                {status(g.status)}
                <span>{g.people.length}</span>
              </h3>
              <div>
                {g.people.slice(0, TRAY_MAX).map((p) => (
                  <button key={p.id} type="button" onClick={() => onOpen(p)} title={p.name} aria-label={t("board.watch", { name: p.name })} className={lookOf ? "lf-tray__chr" : undefined} style={lookOf ? { background: backdropOf(lookOf(p.id)) } : undefined}>
                    {lookOf ? <CharacterArt look={lookOf(p.id)} variant="bust" /> : initials(p.name || "?")}
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
