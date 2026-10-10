"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ROOMS, type OfficePerson, type OfficeRoom } from "@/lib/liveOffice/model";
import Character from "./Character";
import { ROOM_ART, VERB_ICON, firstName, useOfficeText } from "./text";

// The floor plan: nine rooms in the page's own card style, and one layer of
// people above them. Seats are computed from each room's measured floor, so
// a person who starts work in another room walks there across the plan
// instead of jumping.
const SEAT_W = 96;
const SEAT_H = 120;
const ROWS = 2;

type Box = { x: number; y: number; w: number };

function seatCols(w: number) {
  return Math.max(1, Math.floor((w - 8) / SEAT_W));
}

export default function OfficeFloor({ people, selected, onPick }: { people: OfficePerson[]; selected: string; onPick: (id: string) => void }) {
  const { t, room } = useOfficeText();
  const wrap = useRef<HTMLDivElement>(null);
  const floors = useRef<Partial<Record<OfficeRoom, HTMLDivElement | null>>>({});
  const [geo, setGeo] = useState<Partial<Record<OfficeRoom, Box>>>({});
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<OfficeRoom[]>([]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let armed: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const next: Partial<Record<OfficeRoom, Box>> = {};
      for (const r of ROOMS) {
        const f = floors.current[r];
        if (!f) continue;
        const b = f.getBoundingClientRect();
        next[r] = { x: Math.round(b.left - base.left), y: Math.round(b.top - base.top), w: Math.round(b.width) };
      }
      setGeo((prev) => (ROOMS.every((r) => prev[r]?.x === next[r]?.x && prev[r]?.y === next[r]?.y && prev[r]?.w === next[r]?.w) ? prev : next));
      // Walking is switched on only after the first placement, so nobody
      // strolls in from the corner when the page opens.
      if (!armed) armed = setTimeout(() => setReady(true), 120);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const r of ROOMS) {
      const f = floors.current[r];
      if (f) ro.observe(f);
    }
    return () => {
      ro.disconnect();
      clearTimeout(armed);
    };
  }, []);

  // Stable seat order: whoever came into the room first keeps the first desk.
  const byRoom = new Map<OfficeRoom, OfficePerson[]>(ROOMS.map((r) => [r, []]));
  for (const p of people) byRoom.get(p.room)?.push(p);
  for (const list of byRoom.values()) list.sort((a, b) => (a.segments[a.segments.length - 1]?.from ?? 0) - (b.segments[b.segments.length - 1]?.from ?? 0) || a.id.localeCompare(b.id));

  const seats: { p: OfficePerson; x: number; y: number }[] = [];
  const extra: { room: OfficeRoom; n: number; x: number; y: number }[] = [];
  const height: Partial<Record<OfficeRoom, number>> = {};
  for (const r of ROOMS) {
    const list = byRoom.get(r) ?? [];
    const g = geo[r];
    const cols = g ? seatCols(g.w) : 3;
    const cap = open.includes(r) ? list.length : cols * ROWS;
    const visible = list.length > cap ? list.slice(0, cap - 1) : list;
    const rows = Math.max(1, Math.ceil((visible.length + (list.length > cap ? 1 : 0)) / cols));
    height[r] = rows * SEAT_H + 12;
    if (!g) continue;
    const used = Math.min(cols, visible.length + (list.length > cap ? 1 : 0));
    const left = g.x + Math.max(4, (g.w - used * SEAT_W) / 2);
    visible.forEach((p, i) => seats.push({ p, x: left + (i % cols) * SEAT_W, y: g.y + 6 + Math.floor(i / cols) * SEAT_H }));
    if (list.length > cap) {
      const i = visible.length;
      extra.push({ room: r, n: list.length - visible.length, x: left + (i % cols) * SEAT_W, y: g.y + 6 + Math.floor(i / cols) * SEAT_H });
    }
  }

  return (
    <div className={`lo-floor${ready ? " is-ready" : ""}`} ref={wrap}>
      {ROOMS.map((r) => {
        const list = byRoom.get(r) ?? [];
        const busy = list.some((p) => p.status === "working");
        return (
          <section key={r} className={`lo-room lo-room--${r}${list.length ? " has-people" : ""}${busy ? " is-busy" : ""}`} aria-label={room(r)}>
            <header className="lo-room__head">
              <Image src={ROOM_ART[r]} alt="" width={44} height={44} />
              <span className="lo-room__t">
                <b>{room(r)}</b>
                <small>{t(`rooms.${r}.desc`)}</small>
              </span>
              <span className="lo-room__n" title={t("room.people", { n: list.length })}>
                {list.length}
              </span>
            </header>
            <div
              className="lo-room__floor"
              ref={(el) => {
                floors.current[r] = el;
              }}
              style={{ minHeight: height[r] }}
            >
              {!list.length ? (
                <span className="lo-room__empty">
                  <i aria-hidden />
                  <i aria-hidden />
                  {t("room.empty")}
                </span>
              ) : null}
            </div>
          </section>
        );
      })}

      <div className="lo-layer">
        {seats.map(({ p, x, y }) => (
          <Person key={p.id} p={p} x={x} y={y} selected={selected === p.id} onPick={onPick} />
        ))}
        {extra.map((e) => (
          <button
            key={e.room}
            type="button"
            className="lo-more"
            style={{ transform: `translate(${e.x}px, ${e.y}px)` }}
            onClick={() => setOpen((cur) => [...cur, e.room])}
          >
            <b>+{e.n}</b>
            <small>{t("room.more", { n: e.n })}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function Person({ p, x, y, selected, onPick }: { p: OfficePerson; x: number; y: number; selected: boolean; onPick: (id: string) => void }) {
  const { kind, status, room, phrase, object } = useOfficeText();
  const ref = useRef<HTMLButtonElement>(null);

  // The walking pose lives only as long as the move itself.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === "transform") el.classList.add("is-walking");
    };
    const stop = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === "transform") el.classList.remove("is-walking");
    };
    el.addEventListener("transitionrun", start);
    el.addEventListener("transitionend", stop);
    el.addEventListener("transitioncancel", stop);
    return () => {
      el.removeEventListener("transitionrun", start);
      el.removeEventListener("transitionend", stop);
      el.removeEventListener("transitioncancel", stop);
    };
  }, []);

  const Verb = p.last ? VERB_ICON[p.last.verb] : null;
  const name = p.name || "—";
  const label = [name, kind(p.kind), status(p.status), room(p.room), p.last ? phrase(p.last) : ""].filter(Boolean).join(", ");
  return (
    <button
      ref={ref}
      type="button"
      className={`lo-p lo-p--${p.status} lo-p--${p.kind}${selected ? " is-sel" : ""}`}
      style={{ transform: `translate(${x}px, ${y}px)` }}
      onClick={() => onPick(p.id)}
      aria-label={label}
      title={label}
      data-person={p.id}
      data-room={p.room}
    >
      {p.status === "working" && p.last && Verb ? (
        <span className="lo-p__bubble">
          <Verb aria-hidden />
          <span>{object(p.last.object)}</span>
        </span>
      ) : null}
      <span className="lo-p__fig lo-p__seat">
        <Character id={p.id} kind={p.kind} pose={p.status === "idle" ? "idle" : "work"} />
      </span>
      <span className="lo-p__fig lo-p__walk">
        <Character id={p.id} kind={p.kind} pose="walk" />
      </span>
      <span className="lo-p__name">
        <i aria-hidden />
        {firstName(name)}
      </span>
    </button>
  );
}
