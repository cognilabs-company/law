"use client";

import { useEffect, useRef, useState } from "react";
import { ROOMS, type OfficePerson, type OfficeRoom } from "@/lib/liveOffice/model";
import { LOUNGE, QUEUE, SEATS, T, VIEW, faceOf, loungeSpot, pathLength, queueSpot, receptionSpot, roomBox, route, seatOf, type Spot } from "@/lib/liveOffice/plan";
import { IconExpand, IconMinus, IconPlus } from "@/components/icons";
import Character, { FIG_VIEW, type Pose } from "./Character";
import OfficePlan, { RoomSigns } from "./OfficePlan";
import { VERB_ICON, firstName, useOfficeText } from "./text";

// The office from above: people work at desks in their rooms, whoever is
// waiting takes a coffee in the lobby lounge, and a person who starts other
// work gets up and walks there through the hallways, turning the way they go.

type Placed = { p: OfficePerson; spot: Spot; pose: Pose; low?: boolean };

const ZOOMS = [1, 1.3, 1.65, 2.1];

// Where a head is in each pose (sprite units), for the bubble above it.
const HEAD_TOP: Record<string, number> = { work: 21, back: 35, sofa: 31, mug: 29, stand: 29 };
const RECEPTION = 6;

const spotKey = (s: Spot) => `${s.room}:${s.x.toFixed(2)}:${s.y.toFixed(2)}`;
const byArrival = (a: OfficePerson, b: OfficePerson) => (a.segments[a.segments.length - 1]?.from ?? 0) - (b.segments[b.segments.length - 1]?.from ?? 0) || a.id.localeCompare(b.id);

export function placePeople(people: OfficePerson[]) {
  const placed: Placed[] = [];
  const extra: { room: OfficeRoom; n: number }[] = [];
  const idle = people.filter((p) => p.status === "idle").sort((a, b) => a.lastAt - b.lastAt || a.id.localeCompare(b.id));
  idle.slice(0, LOUNGE).forEach((p, i) => {
    const spot = loungeSpot(i);
    placed.push({ p, spot, pose: spot.kind === "sofa" ? "sofa" : "mug", low: i % 2 === 1 });
  });
  let lobbyExtra = Math.max(0, idle.length - LOUNGE);
  for (const r of ROOMS) {
    const list = people.filter((p) => p.status !== "idle" && p.room === r).sort(byArrival);
    if (r === "lobby") {
      list.slice(0, RECEPTION).forEach((p, i) => placed.push({ p, spot: receptionSpot(i), pose: "stand", low: i % 2 === 1 }));
      lobbyExtra += Math.max(0, list.length - RECEPTION);
      continue;
    }
    list.forEach((p, i) => {
      if (i < SEATS) {
        const spot = seatOf(r, i);
        placed.push({ p, spot, pose: spot.kind === "down" ? "work" : "back" });
      } else if (i < SEATS + QUEUE) placed.push({ p, spot: queueSpot(r, i - SEATS), pose: "stand" });
    });
    if (list.length > SEATS + QUEUE) extra.push({ room: r, n: list.length - SEATS - QUEUE });
  }
  if (lobbyExtra) extra.push({ room: "lobby", n: lobbyExtra });
  const counts = Object.fromEntries(ROOMS.map((r) => [r, placed.filter((x) => x.spot.room === r).length + (extra.find((e) => e.room === r)?.n ?? 0)])) as Record<OfficeRoom, number>;
  const seated = Object.fromEntries(ROOMS.map((r) => [r, placed.filter((x) => x.spot.room === r && (x.spot.kind === "down" || x.spot.kind === "up")).length])) as Record<OfficeRoom, number>;
  return { placed, extra, counts, seated };
}

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
  const [zoom, setZoom] = useState(0);
  const [visible, setVisible] = useState(true);

  // Pause every animation while the office is scrolled out of view.
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Zoom keeps the middle of the view where it was.
  const zoomTo = (next: number) => {
    const box = outer.current;
    const cx = box ? (box.scrollLeft + box.clientWidth / 2) / Math.max(1, box.scrollWidth) : 0.5;
    const cy = box ? (box.scrollTop + box.clientHeight / 2) / Math.max(1, box.scrollHeight) : 0.5;
    setZoom(next);
    setTimeout(() => {
      if (!box) return;
      box.scrollLeft = cx * box.scrollWidth - box.clientWidth / 2;
      box.scrollTop = cy * box.scrollHeight - box.clientHeight / 2;
    }, 30);
  };

  // Drag the office around when it is larger than the view.
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = outer.current;
    if (!box || (e.target as HTMLElement).closest(".lo-mp, .lo-zoom") || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, l: box.scrollLeft, t: box.scrollTop };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = outer.current;
    const d = drag.current;
    if (!box || !d) return;
    box.scrollLeft = d.l - (e.clientX - d.x);
    box.scrollTop = d.t - (e.clientY - d.y);
  };
  const onUp = () => {
    drag.current = null;
  };

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let centred = false;
    const ro = new ResizeObserver(() => {
      setScale(el.clientWidth / VIEW.w);
      // On a phone the office is wider than the screen: open on its middle.
      const box = outer.current;
      if (!centred && box && box.scrollWidth > box.clientWidth) {
        box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
        centred = true;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { placed, extra, counts } = placePeople(people);
  const labels = Object.fromEntries(ROOMS.map((r) => [r, room(r)])) as Record<OfficeRoom, string>;

  const z = ZOOMS[zoom];
  return (
    <div className="lo-mapbox">
      <div className="lo-zoom" role="group" aria-label={t("zoom.fit")}>
        <button type="button" onClick={() => zoomTo(Math.min(ZOOMS.length - 1, zoom + 1))} disabled={zoom === ZOOMS.length - 1} aria-label={t("zoom.in")} title={t("zoom.in")}>
          <IconPlus />
        </button>
        <button type="button" onClick={() => zoomTo(Math.max(0, zoom - 1))} disabled={zoom === 0} aria-label={t("zoom.out")} title={t("zoom.out")}>
          <IconMinus />
        </button>
        <button type="button" onClick={() => zoomTo(0)} disabled={zoom === 0} aria-label={t("zoom.fit")} title={t("zoom.fit")}>
          <IconExpand />
        </button>
      </div>
    <div className={`lo-mapwrap${zoom ? " is-zoomed" : ""}`} ref={outer} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
      <div className={`lo-map${scale && scale < 0.72 ? " is-compact" : ""}${visible ? "" : " is-off"}`} ref={wrap} style={{ width: `${z * 100}%`, minWidth: 920 * z }}>
        <svg className="lo-map__svg" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} role="img" aria-label={t("title")}>
          <OfficePlan />
        </svg>
        <svg className="lo-map__signs" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} aria-hidden>
          <RoomSigns labels={labels} counts={counts} />
        </svg>
        {scale ? <Blinkers scale={scale} /> : null}
        {scale ? (
          <div className="lo-map__people">
            {placed.map((x) => (
              <Person key={x.p.id} x={x} scale={scale} selected={selected === x.p.id} onPick={onPick} fresh={!!x.p.last && x.p.last.at >= freshSince && now - x.p.last.at < 45_000} />
            ))}
            {extra.map((e) => {
              const s = e.room === "lobby" ? loungeSpot(LOUNGE - 1) : queueSpot(e.room, QUEUE - 1);
              return (
                <span key={e.room} className="lo-map__more" style={{ transform: `translate(${(s.x * T - VIEW.x + 30) * scale}px, ${(s.y * T - VIEW.y - 20) * scale}px)` }}>
                  +{e.n}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
    </div>
  );
}

// The blinking bits (the urgent room's alarm, the AI room's server lights)
// live outside the plan SVG as small HTML layers that only fade, so the
// browser never has to repaint the whole office for them.
function Blinkers({ scale }: { scale: number }) {
  const ur = roomBox("urgent");
  const ai = roomBox("ai");
  const px = (x: number, y: number) => ({ left: (x * T - VIEW.x) * scale, top: (y * T - VIEW.y) * scale });
  const siren = px(ur.x + 6.3, ur.top + 0.5);
  return (
    <div className="lo-blink" aria-hidden>
      <span className="lo-blink__siren" style={{ left: siren.left, top: siren.top, width: 26 * scale, height: 26 * scale }} />
      {[0, 1, 2].map((i) => {
        const p = px(ai.x + 0.15 + i * 1.1, ai.y + 0.1 + 0.7 - 2.0);
        return <span key={i} className="lo-blink__led" style={{ left: p.left + 5 * scale, top: p.top + 7 * scale, width: (T - 10) * scale, height: 48 * scale, animationDelay: `${i * 0.45}s` }} />;
      })}
    </div>
  );
}

function at(x: number, y: number, scale: number): [number, number] {
  return [(x * T - VIEW.x - FIG_VIEW.ax) * scale, (y * T - VIEW.y - FIG_VIEW.ay) * scale];
}

function Person({ x, scale, selected, onPick, fresh }: { x: Placed; scale: number; selected: boolean; onPick: (id: string) => void; fresh: boolean }) {
  const { kind, status, room, phrase, object } = useOfficeText();
  const ref = useRef<HTMLButtonElement>(null);
  const was = useRef<Spot | null>(null);
  const { p, spot, pose } = x;
  const [left, top] = at(spot.x, spot.y, scale);
  const key = spotKey(spot);
  const latest = useRef(spot);
  useEffect(() => {
    latest.current = spot;
  });

  // A new place means a walk: stand up, out through the door, along the
  // hallways, in — facing the way each stretch goes.
  useEffect(() => {
    const el = ref.current;
    const prev = was.current;
    const next = latest.current;
    was.current = next;
    if (!el || !prev || spotKey(prev) === key || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const path = route(prev, next);
    const total = pathLength(path) || 1;
    const duration = Math.min(9000, Math.max(1200, total * 260));
    let run = 0;
    const frames = path.map((pt, i) => {
      if (i) run += Math.hypot(pt[0] - path[i - 1][0], pt[1] - path[i - 1][1]);
      const [l, t] = at(pt[0], pt[1], scale);
      return { transform: `translate(${l}px, ${t}px)`, offset: run / total };
    });
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      const len = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      if (len < 0.01) continue;
      const face = faceOf(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      timers.push(setTimeout(() => (el.dataset.face = face), (acc / total) * duration));
      acc += len;
    }
    // Walking is marked with a data attribute React does not own: a class
    // would be wiped whenever the button's className changes mid-walk (a new
    // status, a label shift), and the person would carry their desk along.
    el.dataset.walking = "1";
    const anim = el.animate(frames, { duration, easing: "linear" });
    const done = () => {
      delete el.dataset.walking;
      delete el.dataset.face;
    };
    anim.onfinish = done;
    anim.oncancel = done;
    return () => {
      // A cancel event arrives later, after the next walk may have started:
      // unhook it first so it cannot clear the new walk's marks.
      timers.forEach(clearTimeout);
      anim.onfinish = null;
      anim.oncancel = null;
      anim.cancel();
      done();
    };
  }, [key, scale]);

  const Verb = p.last ? VERB_ICON[p.last.verb] : null;
  const name = p.name || "—";
  const label = [name, kind(p.kind), status(p.status), room(p.room), p.last ? phrase(p.last) : ""].filter(Boolean).join(", ");
  const headTop = (HEAD_TOP[pose] ?? 28) * scale;
  const working = p.status === "working" && (pose === "work" || pose === "back");
  return (
    <button
      ref={ref}
      type="button"
      className={`lo-mp lo-mp--${p.status} lo-mp--${pose}${x.low ? " is-low" : ""}${selected ? " is-sel" : ""}`}
      style={{ transform: `translate(${left}px, ${top}px)`, width: FIG_VIEW.w * scale, height: FIG_VIEW.h * scale, zIndex: Math.round(spot.y * 10) }}
      onClick={() => onPick(p.id)}
      aria-label={label}
      title={label}
      data-person={p.id}
      data-room={p.room}
      data-spot={spot.kind}
    >
      <span className="lo-mp__fig lo-mp__seat">
        <Character id={p.id} kind={p.kind} pose={pose} />
      </span>
      <span className="lo-mp__fig lo-mp__walk">
        <Character id={p.id} kind={p.kind} pose="walk" />
      </span>
      {working && Verb ? (
        <span className="lo-mp__badge" style={{ top: headTop - 6 }} aria-hidden>
          <Verb />
        </span>
      ) : null}
      {fresh && p.last ? (
        <span key={p.last.id} className="lo-mp__say" style={{ bottom: `calc(100% - ${headTop}px + 4px)` }}>
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
