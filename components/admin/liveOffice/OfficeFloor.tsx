"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { ROOMS, type OfficePerson, type OfficeRoom } from "@/lib/liveOffice/model";
import { HALL, POD_X, roomBox, type Spot } from "@/lib/liveOffice/plan";
import { Block, U, boxOf, pt, pts, useFloorCamera, type Rect } from "@/components/live/floorKit";
import { IconChevronLeft, IconExpand, IconMinus, IconPlus, IconUsers } from "@/components/icons";
import Character from "./Character";
import { placePeople } from "./OfficeMap";
import { VERB_ICON, firstName, useOfficeText } from "./text";

// The office as a floor seen from above and to the side. The nine rooms and
// every seat in them come from the same plan as before (lib/liveOffice/plan);
// here they are drawn small, the whole office at once, and a room that is
// pressed is brought close — there a person opens their record. Whoever has
// left for the day waits in the tray under the floor.

const WALL = 1.3;
const TRAY_MAX = 14;
type Target = { kind: "all" } | { kind: "room"; room: OfficeRoom } | { kind: "box"; box: Rect };

// Where a head floats over a spot: at a desk the person sits on the chair
// behind it, anywhere else they stand where the plan put them.
function headAt(s: Spot): [number, number] {
  const b = roomBox(s.room);
  const [x, y] = s.kind === "down" ? [s.x, b.y + 2.0] : s.kind === "up" ? [s.x, b.y + 6.0] : [s.x, s.y];
  return pt(x, y, s.kind === "down" || s.kind === "up" || s.kind === "sofa" ? 1.25 : 1.55);
}

function Furniture({ room, taken }: { room: OfficeRoom; taken: Set<number> }) {
  const b = roomBox(room);
  if (room === "lobby") {
    return (
      <>
        <Block x={b.x + 5.5} y={b.y + 0.3} w={4.1} d={0.7} h={0.95} cls="lf-desk" />
        <Block x={b.x + 1.2} y={b.y + 2.4} w={3.4} d={0.7} h={0.95} cls="lf-desk" />
        <Block x={b.x + 5.8} y={b.y + 3.7} w={4} d={0.35} h={1} cls="lf-sofa" />
        <Block x={b.x + 5.8} y={b.y + 4.05} w={4} d={0.8} h={0.45} cls="lf-sofa" />
      </>
    );
  }
  const order = [2, 0, 1, 3];
  return (
    <>
      {order.map((i) => (
        <Block key={`c${i}`} x={b.x + POD_X[i] - 0.25} y={b.y + 1.75} w={0.5} d={0.5} h={0.45} cls={`lf-chair${taken.has(i) ? " is-taken" : ""}`} />
      ))}
      {order.map((i) => (
        <Block key={`d${i}`} x={b.x + POD_X[i] - 0.85} y={b.y + 2.5} w={1.7} d={0.8} h={0.7} cls="lf-desk" />
      ))}
      {order.map((i) => (
        <Block key={`e${i}`} x={b.x + POD_X[i] - 0.85} y={b.y + 4.75} w={1.7} d={0.8} h={0.7} cls="lf-desk" />
      ))}
      {order.map((i) => (
        <Block key={`f${i}`} x={b.x + POD_X[i] - 0.25} y={b.y + 5.75} w={0.5} d={0.5} h={0.45} cls={`lf-chair${taken.has(i + 4) ? " is-taken" : ""}`} />
      ))}
    </>
  );
}

export default function OfficeFloor({
  people,
  away,
  selected,
  onPick,
  now,
  freshSince,
}: {
  people: OfficePerson[];
  away: OfficePerson[];
  selected: string;
  onPick: (id: string) => void;
  now: number;
  freshSince: number;
}) {
  const { t, room, roomDesc, kind, status, phrase } = useOfficeText();
  const [target, setTarget] = useState<Target>({ kind: "all" });
  const focus = target.kind === "room" ? target.room : null;
  const { placed, counts } = useMemo(() => placePeople(people), [people]);

  const slab = useMemo(() => {
    const boxes = ROOMS.map(roomBox);
    const w = Math.max(...boxes.map((b) => b.x + b.w));
    const d = Math.max(...boxes.map((b) => b.y + b.h)) + HALL;
    return { x: -1.2, y: boxes[0].y - 1.2, w: w + 2.4, d: d - boxes[0].y + 1.6 };
  }, []);
  const hasAway = away.length > 0;
  const goal = useMemo<Rect>(() => {
    if (target.kind === "box") return target.box;
    if (target.kind === "room") {
      const b = roomBox(target.room);
      return boxOf(b.x, b.y, b.w, b.h + 1.6, U * 1.2);
    }
    const all = boxOf(slab.x, slab.y, slab.w, slab.d, U);
    return hasAway ? { ...all, h: all.h * 1.16 } : all;
  }, [target, slab, hasAway]);
  const { svgRef, scaled, onPointerDown, onPointerMove, onPointerUp, onClickCapture } = useFloorCamera(goal);

  const fit = () => setTarget({ kind: "all" });
  const enter = (r: OfficeRoom) => setTarget({ kind: "room", room: r });
  const pressed = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  };
  // Nearer the viewer is drawn later, so a head in front covers one behind.
  const drawn = [...placed].sort((a, b) => a.spot.x + a.spot.y - (b.spot.x + b.spot.y));
  const gone = [...away].sort((a, b) => b.leftAt - a.leftAt);

  return (
    <div className={`lf lf--office${focus ? " is-room" : ""}`}>
      <svg
        ref={svgRef}
        className="lf__svg"
        role="group"
        aria-label={t("title")}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        onClick={() => {
          if (target.kind !== "all") fit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && target.kind !== "all") fit();
        }}
      >
        <Block x={slab.x} y={slab.y} w={slab.w} d={slab.d} h={0.35} z={-0.35} cls="lf-slab" />
        {ROOMS.map((r, i) => {
          const b = roomBox(r);
          const on = focus === r;
          const taken = new Set(placed.filter((x) => x.spot.room === r && (x.spot.kind === "down" || x.spot.kind === "up")).map((x) => POD_X.indexOf(Number((x.spot.x - b.x).toFixed(2))) + (x.spot.kind === "up" ? 4 : 0)));
          return (
            <g
              key={r}
              className={`lf-room lf-room--t${i % 6} lf-room--physical${on ? " on" : ""}${focus && !on ? " is-dim" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={t("floor.enter", { name: room(r), n: counts[r] })}
              aria-pressed={on}
              data-room={r}
              onClick={(e) => {
                e.stopPropagation();
                if (!on) enter(r);
              }}
              onKeyDown={(e) => {
                if (pressed(e)) enter(r);
              }}
            >
              <polygon className="lf-floor" points={pts([b.x, b.y, 0], [b.x + b.w, b.y, 0], [b.x + b.w, b.y + b.h, 0], [b.x, b.y + b.h, 0])} />
              <polygon className="lf-wall lf-wall--a" points={pts([b.x, b.y, 0], [b.x + b.w, b.y, 0], [b.x + b.w, b.y, WALL], [b.x, b.y, WALL])} />
              <polygon className="lf-wall lf-wall--b" points={pts([b.x, b.y, 0], [b.x, b.y + b.h, 0], [b.x, b.y + b.h, WALL], [b.x, b.y, WALL])} />
              <polygon className="lf-glass" points={pts([b.x + 0.5, b.y, 0.5], [b.x + b.w - 0.5, b.y, 0.5], [b.x + b.w - 0.5, b.y, 1.05], [b.x + 0.5, b.y, 1.05])} />
              <Furniture room={r} taken={taken} />
            </g>
          );
        })}
        {drawn.map(({ p, spot }) => {
          const on = focus === spot.room;
          const [x, y] = headAt(spot);
          const fresh = !!p.last && p.last.at >= freshSince && now - p.last.at < 45_000;
          const label = [p.name || "—", kind(p.kind), status(p.status), room(p.room), p.last ? phrase(p.last) : ""].filter(Boolean).join(", ");
          return (
            <g
              key={p.id}
              className={`lf-av lf-av--${p.status === "working" ? "ok" : "warn"}${selected === p.id ? " is-sel" : ""}${fresh ? " is-fresh" : ""}${focus && !on ? " lf-dim" : ""}`}
              style={{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` }}
              role={on ? "button" : undefined}
              tabIndex={on ? 0 : undefined}
              aria-hidden={on ? undefined : true}
              aria-label={on ? label : undefined}
              data-person={p.id}
              data-room={spot.room}
              onClick={(e) => {
                e.stopPropagation();
                if (on) onPick(p.id);
                else enter(spot.room);
              }}
              onKeyDown={(e) => {
                if (on && pressed(e)) onPick(p.id);
              }}
            >
              <title>{label}</title>
              <circle className="lf-av__bg" r={12.5} />
              <svg x={-10.5} y={-10.5} width={21} height={21} aria-hidden>
                <Character id={p.id} kind={p.kind} pose="head" />
              </svg>
              <circle className="lf-av__ring" r={12.5} />
            </g>
          );
        })}
        {drawn.map(({ p, spot }) => {
          if (focus !== spot.room) return null;
          const [x, y] = headAt(spot);
          return (
            <text key={p.id} className="lf-name" style={{ transform: `translate(${x.toFixed(1)}px, ${(y + 23.5).toFixed(1)}px)` }} aria-hidden>
              {firstName(p.name || "—")}
            </text>
          );
        })}
        {ROOMS.map((r) => {
          const b = roomBox(r);
          const [x, y] = pt(b.x, b.y, WALL);
          return (
            <text key={r} className={`lf-label${focus && focus !== r ? " lf-dim" : ""}`} x={x.toFixed(1)} y={y.toFixed(1)} dy="-0.7em" aria-hidden>
              {room(r)}
              <tspan className="lf-label__n" dx="0.5em">{counts[r]}</tspan>
            </text>
          );
        })}
      </svg>

      <div className="lf__top">
        {focus ? (
          <>
            <button type="button" className="lf-btn" onClick={fit}>
              <IconChevronLeft />
              {t("zoom.fit")}
            </button>
            <span className="lf-where">
              <b>{room(focus)}</b>
              <small>{[roomDesc(focus), t("floor.here", { n: counts[focus] })].join(" · ")}</small>
            </span>
          </>
        ) : (
          <span className="lf-hint">{t("floor.hint")}</span>
        )}
        <span className="lf-count" title={t("stats.inOffice")}>
          <IconUsers />
          {people.length}
        </span>
      </div>

      <div className="lf__zoom" role="group" aria-label={t("floor.zoom")}>
        <button type="button" onClick={fit} aria-label={t("zoom.fit")} title={t("zoom.fit")}><IconExpand /></button>
        <button type="button" onClick={() => setTarget({ kind: "box", box: scaled(1 / 1.35) })} aria-label={t("zoom.in")} title={t("zoom.in")}><IconPlus /></button>
        <button type="button" onClick={() => setTarget({ kind: "box", box: scaled(1.35) })} aria-label={t("zoom.out")} title={t("zoom.out")}><IconMinus /></button>
      </div>

      {focus ? <RoomTicker people={placed.filter((x) => x.spot.room === focus).map((x) => x.p)} onPick={onPick} /> : null}

      {gone.length && !focus ? (
        <div className="lf__trays">
          <section className="lf-tray">
            <h3>
              {t("away.title")}
              <span>{gone.length}</span>
            </h3>
            <div>
              {gone.slice(0, TRAY_MAX).map((p) => (
                <button key={p.id} type="button" className="lf-tray__face" onClick={() => onPick(p.id)} title={`${p.name} · ${kind(p.kind)}`} aria-label={p.name || "—"}>
                  <Character id={p.id} kind={p.kind} pose="head" />
                </button>
              ))}
              {gone.length > TRAY_MAX ? <i>+{gone.length - TRAY_MAX}</i> : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

// Close up, the room also says what each person in it is doing right now.
function RoomTicker({ people, onPick }: { people: OfficePerson[]; onPick: (id: string) => void }) {
  const { t, phrase, status } = useOfficeText();
  if (!people.length) return <p className="lf-ticker lf-ticker--none">{t("floor.nobody")}</p>;
  return (
    <ul className="lf-ticker">
      {people.slice(0, 8).map((p) => {
        const Verb = p.last ? VERB_ICON[p.last.verb] : null;
        return (
          <li key={p.id}>
            <button type="button" onClick={() => onPick(p.id)}>
              <span className="lf-ticker__av" aria-hidden>
                <Character id={p.id} kind={p.kind} pose="head" />
              </span>
              <span className="lf-ticker__t">
                <b>{p.name || "—"}</b>
                <small>
                  {Verb ? <Verb aria-hidden /> : null}
                  {p.status === "working" && p.last ? phrase(p.last) : status(p.status)}
                </small>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
