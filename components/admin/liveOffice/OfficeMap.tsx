"use client";

import { useEffect, useRef, useState } from "react";
import { ROOMS, type OfficePerson, type OfficeRoom } from "@/lib/liveOffice/model";
import { QUEUE, SEATS, U, VIEW, pathLength, project, queueSpot, route, seatOf } from "@/lib/liveOffice/iso";
import Character from "./Character";
import IsoBuilding from "./IsoBuilding";
import { VERB_ICON, firstName, useOfficeText } from "./text";

// The office as a building seen from above at an angle: rooms with walls and
// furniture, and people at their desks. Someone who starts other work gets
// up, walks out through the hallway and sits down in the other room.
const FIG_W = 3.3 * U;
const FIG_H = (FIG_W * 76) / 64;

type Spot = { p: OfficePerson; room: OfficeRoom; wx: number; wy: number; queued: boolean };

export default function OfficeMap({
  people,
  selected,
  onPick,
  now,
  freshSince,
}: {
  people: OfficePerson[];
  selected: string;
  onPick: (id: string) => void;
  now: number;
  freshSince: number;
}) {
  const { room, t } = useOfficeText();
  const wrap = useRef<HTMLDivElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let centred = false;
    const ro = new ResizeObserver(() => {
      setScale(el.clientWidth / VIEW.w);
      // On a phone the building is wider than the screen: open on its middle.
      const box = outer.current;
      if (!centred && box && box.scrollWidth > box.clientWidth) {
        box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
        centred = true;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Stable desks: whoever came into the room first keeps the first desk; the
  // rest wait in the hallway in front of the door.
  const byRoom = new Map<OfficeRoom, OfficePerson[]>(ROOMS.map((r) => [r, []]));
  for (const p of people) byRoom.get(p.room)?.push(p);
  const spots: Spot[] = [];
  const extra: { room: OfficeRoom; n: number }[] = [];
  for (const r of ROOMS) {
    const list = (byRoom.get(r) ?? []).sort((a, b) => (a.segments[a.segments.length - 1]?.from ?? 0) - (b.segments[b.segments.length - 1]?.from ?? 0) || a.id.localeCompare(b.id));
    list.forEach((p, i) => {
      if (i < SEATS) {
        const [wx, wy] = seatOf(r, i);
        spots.push({ p, room: r, wx, wy, queued: false });
      } else if (i < SEATS + QUEUE) {
        const [wx, wy] = queueSpot(r, i - SEATS);
        spots.push({ p, room: r, wx, wy, queued: true });
      }
    });
    if (list.length > SEATS + QUEUE) extra.push({ room: r, n: list.length - SEATS - QUEUE });
  }
  const labels = Object.fromEntries(ROOMS.map((r) => [r, room(r)])) as Record<OfficeRoom, string>;
  const counts = Object.fromEntries(ROOMS.map((r) => [r, byRoom.get(r)?.length ?? 0])) as Record<OfficeRoom, number>;

  return (
    <div className="lo-mapwrap" ref={outer}>
      <div className={`lo-map${scale && scale < 0.8 ? " is-compact" : ""}`} ref={wrap}>
        <svg className="lo-map__svg" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} role="img" aria-label={t("title")}>
          <IsoBuilding labels={labels} counts={counts} />
        </svg>
        {scale ? (
          <div className="lo-map__people">
            {spots.map((s) => (
              <Person key={s.p.id} s={s} scale={scale} selected={selected === s.p.id} onPick={onPick} fresh={!!s.p.last && s.p.last.at >= freshSince && now - s.p.last.at < 45_000} />
            ))}
            {extra.map((e) => {
              const [sx, sy] = project(...queueSpot(e.room, QUEUE));
              return (
                <span key={e.room} className="lo-map__more" style={{ transform: `translate(${(sx - VIEW.x) * scale}px, ${(sy - VIEW.y) * scale}px)` }}>
                  +{e.n}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function screen(wx: number, wy: number, scale: number): [number, number] {
  const [sx, sy] = project(wx, wy);
  // top-left of the figure box, feet on the spot
  return [(sx - VIEW.x - FIG_W / 2) * scale, (sy - VIEW.y - FIG_H * 0.88) * scale];
}

function Person({ s, scale, selected, onPick, fresh }: { s: Spot; scale: number; selected: boolean; onPick: (id: string) => void; fresh: boolean }) {
  const { kind, status, room, phrase, object } = useOfficeText();
  const ref = useRef<HTMLButtonElement>(null);
  const was = useRef<{ room: OfficeRoom; wx: number; wy: number } | null>(null);
  const { p } = s;
  const [x, y] = screen(s.wx, s.wy, scale);

  // A new desk means a walk: out of the door, along the hallway, in.
  useEffect(() => {
    const el = ref.current;
    const prev = was.current;
    was.current = { room: s.room, wx: s.wx, wy: s.wy };
    if (!el || !prev || (prev.wx === s.wx && prev.wy === s.wy) || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const path = route(prev.room, [prev.wx, prev.wy], s.room, [s.wx, s.wy]);
    const total = pathLength(path) || 1;
    let run = 0;
    const frames = path.map((pt, i) => {
      if (i) run += Math.hypot(pt[0] - path[i - 1][0], pt[1] - path[i - 1][1]);
      const [px, py] = screen(pt[0], pt[1], scale);
      return { transform: `translate(${px}px, ${py}px)`, offset: run / total };
    });
    el.classList.add("is-walking");
    const anim = el.animate(frames, { duration: Math.min(6000, Math.max(1100, total * 150)), easing: "linear" });
    const done = () => el.classList.remove("is-walking");
    anim.onfinish = done;
    anim.oncancel = done;
    return () => anim.cancel();
  }, [s.room, s.wx, s.wy, scale]);

  const Verb = p.last ? VERB_ICON[p.last.verb] : null;
  const name = p.name || "—";
  const label = [name, kind(p.kind), status(p.status), room(p.room), p.last ? phrase(p.last) : ""].filter(Boolean).join(", ");
  return (
    <button
      ref={ref}
      type="button"
      className={`lo-mp lo-mp--${p.status}${s.queued ? " is-queued" : ""}${selected ? " is-sel" : ""}`}
      style={{ transform: `translate(${x}px, ${y}px)`, width: FIG_W * scale, height: FIG_H * scale, zIndex: Math.round((s.wx + s.wy) * 10) }}
      onClick={() => onPick(p.id)}
      aria-label={label}
      title={label}
      data-person={p.id}
      data-room={p.room}
    >
      <span className="lo-mp__fig lo-mp__seat">
        <Character id={p.id} kind={p.kind} pose={s.queued ? "walk" : p.status === "idle" ? "idle" : "work"} />
      </span>
      <span className="lo-mp__fig lo-mp__walk">
        <Character id={p.id} kind={p.kind} pose="walk" />
      </span>
      {p.status === "working" && Verb && !s.queued ? (
        <span className="lo-mp__badge" aria-hidden>
          <Verb />
        </span>
      ) : null}
      {fresh && p.last ? (
        <span key={p.last.id} className="lo-mp__say">
          {Verb ? <Verb aria-hidden /> : null}
          {object(p.last.object)}
        </span>
      ) : null}
      <span className="lo-mp__name">
        <i aria-hidden />
        {firstName(name)}
      </span>
    </button>
  );
}
