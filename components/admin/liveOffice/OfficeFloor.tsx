"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { ROOMS, type OfficePerson, type OfficeRoom } from "@/lib/liveOffice/model";
import { Block, U, boxOf, nearness, onFloor, pt, useFloorCamera, type Rect } from "@/components/live/floorKit";
import {
  Beanbag,
  Bench,
  Booth,
  Clock,
  Counter,
  Easel,
  FirstAid,
  Figure,
  FloorDefs,
  GoodsShelf,
  Hologram,
  Lockers,
  MeetingTable,
  Partition,
  Picture,
  Plant,
  Printer,
  Rack,
  RoundTable,
  Rug,
  SeatMark,
  Shelf,
  Siren,
  Sofa,
  Stool,
  Tv,
  WallBand,
  WallSign,
  WallX,
  WallY,
  Whiteboard,
  WindowWallX,
  WindowWallY,
  benchSeats,
  type BenchStyle,
  type FigureLook,
} from "@/components/live/floorArt";
import { IconChevronLeft, IconExpand, IconMinus, IconPlus, IconUsers } from "@/components/icons";
import Character, { lookOf, outfitOf } from "./Character";
import { placePeople } from "./OfficeMap";
import { VERB_ICON, firstName, useOfficeText } from "./text";

// The office as one floor of a building, seen from the front and above.
// Every room is its own space: walled on all sides (the walls nearest the
// viewer cut low so the room stays in sight, the inner ones glazed above a
// solid base), entered through a door from the corridor, and furnished for
// what happens in it — the call room's acoustic benches and booths, the
// urgent room's alarm and triage table, the AI room's racks and projector,
// the management room's parquet and meeting table, and so on. Far away a
// person is a face on their chair; brought close, the room shows them whole,
// sitting at the desk and typing, with their status around their head.

const W = 46;
const D = 30;
const WING = 33.75;
type Zone = { x: number; y: number; w: number; d: number };
const ZONE: Record<OfficeRoom, Zone> = {
  talk: { x: 0.5, y: 0.5, w: 11, d: 8.5 },
  urgent: { x: 12, y: 0.5, w: 10.5, d: 8.5 },
  ai: { x: 23, y: 0.5, w: 10.5, d: 8.5 },
  admin: { x: 34, y: 0.5, w: 11.5, d: 8.5 },
  documents: { x: 0.5, y: 11, w: 11, d: 8.5 },
  desk: { x: 12, y: 11, w: 10.5, d: 8.5 },
  studio: { x: 23, y: 11, w: 10.5, d: 8.5 },
  market: { x: 0.5, y: 21.5, w: 11, d: 8 },
  lobby: { x: 34, y: 11, w: 11.5, d: 18.5 },
};
// Back to front, left to right: the order the rooms are painted in.
const ORDER: OfficeRoom[] = ["talk", "urgent", "ai", "admin", "documents", "desk", "studio", "market", "lobby"];
const TRAY_MAX = 14;

// What makes each room itself: its floor, its walls and its desks.
type Theme = { floor: string; wall: string; glass: boolean; bench: BenchStyle; band?: string };
const THEME: Record<OfficeRoom, Theme> = {
  talk: { floor: "lf-fl--talk", wall: "lf-m-wall", glass: true, bench: { divider: "lf-m-acoustic", tall: true, chair: "lf-m-chair--blue", chairBack: "lf-m-chair--blue" }, band: "lf-band--blue" },
  urgent: { floor: "lf-fl--urgent", wall: "lf-m-wall", glass: false, bench: { desk: "lf-m-deskwhite", divider: "lf-m-red", chair: "lf-m-chair--red", chairBack: "lf-m-chair--red" }, band: "lf-band--red" },
  ai: { floor: "lf-fl--ai", wall: "lf-m-wall--dark", glass: false, bench: { desk: "lf-m-deskblack", divider: "lf-m-cyan", screens: "dual", chair: "lf-m-chair--dark", chairBack: "lf-m-chair--dark" } },
  admin: { floor: "lf-fl--parquet", wall: "lf-m-wall--warm", glass: true, bench: { desk: "lf-m-deskwalnut", divider: "lf-m-deskwalnut", chair: "lf-m-chair--leather", chairBack: "lf-m-chair--leather" } },
  documents: { floor: "lf-fl--beige", wall: "lf-m-wall--warm", glass: false, bench: { desk: "lf-m-desk", chair: "lf-m-chair", chairBack: "lf-m-chairback" }, band: "lf-band--amber" },
  desk: { floor: "lf-fl--sage", wall: "lf-m-wall", glass: true, bench: { desk: "lf-m-desk", chair: "lf-m-chair--green", chairBack: "lf-m-chair--green" } },
  studio: { floor: "lf-fl--concrete", wall: "lf-m-wall", glass: true, bench: { desk: "lf-m-deskwhite", screens: "dual", chair: "lf-m-chair--orange", chairBack: "lf-m-chair--orange" }, band: "lf-band--violet" },
  market: { floor: "lf-fl--terra", wall: "lf-m-wall--warm", glass: false, bench: { desk: "lf-m-desk", chair: "lf-m-chair--amber", chairBack: "lf-m-chair--amber" } },
  lobby: { floor: "", wall: "lf-m-wall", glass: true, bench: {} },
};

type Place = { x: number; y: number; z: number };
const benchesOf = (r: OfficeRoom) => [{ x: ZONE[r].x + 1.3, y: ZONE[r].y + 2.6 }, { x: ZONE[r].x + 5.9, y: ZONE[r].y + 2.6 }];
// Chairs in the order people take them: behind the desks first, then in front.
function seatsOf(r: OfficeRoom) {
  const [a, b] = benchesOf(r).map((p) => benchSeats(p.x, p.y));
  return [a[0], a[1], b[0], b[1], a[2], a[3], b[2], b[3]];
}
// Seat index (in the order above) of each place of each bench.
const BENCH_SEAT = [
  [0, 1, 4, 5],
  [2, 3, 6, 7],
];
const queueOf = (r: OfficeRoom, i: number): Place => ({ x: ZONE[r].x + 1.5 + i * 1.15, y: ZONE[r].y + ZONE[r].d - 1.1, z: 1.62 });
const RECEPTION = Array.from({ length: 6 }, (_, i): Place => ({ x: 35.9 + (i % 3) * 1.45, y: 15.3 + Math.floor(i / 3) * 1.25, z: 1.62 }));
const TABLES = [{ x: 38.3, y: 21.4 }, { x: 42, y: 22.5 }, { x: 39.4, y: 25.3 }];
const STOOLS = TABLES.flatMap((t) => [{ x: t.x - 0.95, y: t.y + 0.1 }, { x: t.x + 0.95, y: t.y + 0.1 }]);
const LOUNGE: Place[] = [...STOOLS.map((s) => ({ ...s, z: 1.6 })), { x: 43, y: 27.6, z: 1.35 }];
const STATUS_RING: Record<string, string> = { working: "#19C3B1", idle: "#F5A623", away: "#94A3B8" };

type Head = { p: OfficePerson; room: OfficeRoom; at: Place; kind: "seat" | "stand" | "stool"; seat: number };
type Target = { kind: "all" } | { kind: "room"; room: OfficeRoom } | { kind: "box"; box: Rect };

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

  // Everybody's place on this floor, and which chairs and stools are taken.
  const { heads, seatOf, stools, counts } = useMemo(() => {
    const { placed, counts } = placePeople(people);
    const heads: Head[] = [];
    const seatOf = Object.fromEntries(ROOMS.map((r) => [r, Array<OfficePerson | null>(8).fill(null)])) as Record<OfficeRoom, (OfficePerson | null)[]>;
    const stools = Array(LOUNGE.length).fill(false) as boolean[];
    const n = Object.fromEntries(ROOMS.map((r) => [r, { seat: 0, queue: 0, desk: 0, lounge: 0 }])) as Record<OfficeRoom, { seat: number; queue: number; desk: number; lounge: number }>;
    for (const { p, spot, pose } of placed) {
      const r = spot.room;
      if (r === "lobby") {
        if (pose === "stand") heads.push({ p, room: r, at: RECEPTION[n[r].desk++ % RECEPTION.length], kind: "stand", seat: -1 });
        else {
          const i = n[r].lounge++ % LOUNGE.length;
          stools[i] = true;
          heads.push({ p, room: r, at: LOUNGE[i], kind: "stool", seat: i });
        }
      } else if (spot.kind === "down" || spot.kind === "up") {
        const i = n[r].seat++ % 8;
        seatOf[r][i] = p;
        const s = seatsOf(r)[i];
        heads.push({ p, room: r, at: { x: s.x, y: s.y, z: 1.45 }, kind: "seat", seat: i });
      } else heads.push({ p, room: r, at: queueOf(r, n[r].queue++), kind: "stand", seat: -1 });
    }
    heads.sort((a, b) => nearness(a.at.x, a.at.y) - nearness(b.at.x, b.at.y));
    return { heads, seatOf, stools, counts };
  }, [people]);

  const hasAway = away.length > 0;
  const goal = useMemo<Rect>(() => {
    if (target.kind === "box") return target.box;
    if (target.kind === "room") {
      const z = ZONE[target.room];
      return boxOf(z.x - 0.6, z.y - 0.8, z.w + 1.2, z.d + 1.2, U * 0.55);
    }
    const all = boxOf(-0.4, -0.4, W + 0.8, D + 0.8, U * 0.9, 2.2);
    return hasAway ? { ...all, h: all.h * 1.14 } : all;
  }, [target, hasAway]);
  const { svgRef, scaled, onPointerDown, onPointerMove, onPointerUp, onClickCapture } = useFloorCamera(goal);

  const fit = () => setTarget({ kind: "all" });
  const enter = (r: OfficeRoom) => setTarget({ kind: "room", room: r });
  const pressed = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  };
  const gone = [...away].sort((a, b) => b.leftAt - a.leftAt);
  const picked = heads.find((h) => h.p.id === selected) ?? null;
  const labelOf = (p: OfficePerson) => [p.name || "—", kind(p.kind), status(p.status), room(p.room), p.last ? phrase(p.last) : ""].filter(Boolean).join(", ");

  // A whole person, for the room that is brought close.
  const figure = (p: OfficePerson, at: { x: number; y: number }, pose: "desk" | "stand" | "stool", toward: 1 | -1) => {
    const look = lookOf(p.id);
    const o = outfitOf(p.kind);
    const fl: FigureLook = { skin: look.skin, hair: look.hair, top: o.top[0], topDark: o.top[1], legs: o.legs };
    return (
      <g
        key={p.id}
        className={`lf-who${selected === p.id ? " is-sel" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={labelOf(p)}
        data-person={p.id}
        onClick={(e) => {
          e.stopPropagation();
          onPick(p.id);
        }}
        onKeyDown={(e) => {
          if (pressed(e)) onPick(p.id);
        }}
      >
        <title>{labelOf(p)}</title>
        <Figure x={at.x} y={at.y} look={fl} pose={pose} toward={toward} ring={STATUS_RING[p.status]} typing={pose === "desk" && p.status === "working"} head={<Character id={p.id} kind={p.kind} pose={toward === 1 || pose !== "desk" ? "head" : "headBack"} />} />
      </g>
    );
  };
  const near = (r: OfficeRoom) => focus === r;

  const benches = (r: OfficeRoom) =>
    benchesOf(r).map((b, bi) => {
      const occ = BENCH_SEAT[bi].map((i) => seatOf[r][i]);
      const seats = benchSeats(b.x, b.y);
      return (
        <Bench
          key={bi}
          x={b.x}
          y={b.y}
          look={THEME[r].bench}
          taken={occ.map(Boolean)}
          people={near(r) ? occ.map((p, k) => (p ? figure(p, seats[k], "desk", k < 2 ? 1 : -1) : null)) : []}
        />
      );
    });

  // Walls: the far and the left one full height, the near ones cut low.
  const walls = (r: OfficeRoom, part: "back" | "front") => {
    const z = ZONE[r];
    const th = THEME[r];
    const top = z.y < 1;
    const left = z.x < 1;
    if (part === "back") {
      return (
        <>
          {top ? null : <WallX x={z.x - 0.25} y={z.y - 0.25} len={z.w + 0.5} door={[z.w - 2.6, z.w - 1.3]} cls={th.wall} />}
          {top || !th.band ? null : <WallBand x={z.x} y={z.y - 0.25} len={z.w - 2.7} cls={th.band} />}
          {left ? null : <WallY x={z.x - 0.25} y={z.y - (top ? 0.4 : 0.25)} len={z.d + (top ? 0.4 : 0.25) + 0.25} cls={th.wall} glass={th.glass} />}
        </>
      );
    }
    // The near side wall belongs to the next room (or the wing's glass); a low
    // edge of this room's own marks where it ends.
    return (
      <>
        <WallY x={z.x + z.w + 0.25} y={z.y - 0.25} len={z.d + 0.5} h={0.42} cls={th.wall} />
        <WallX x={z.x - 0.25} y={z.y + z.d + 0.25} len={z.w + 0.5} h={0.42} door={[1.1, 2.4]} cls={th.wall} />
      </>
    );
  };

  const furnish = (r: OfficeRoom): ReactNode => {
    const z = ZONE[r];
    const back = z.y > 1;
    switch (r) {
      case "talk":
        return (
          <>
            <Rug x={z.x + 0.8} y={z.y + 6.3} w={4.6} d={1.8} cls="lf-rug2 lf-rug2--blue" />
            <Booth x={z.x + 8.9} y={z.y + 0.35} />
            <Plant x={z.x + 0.5} y={z.y + 0.6} big />
            {benches(r)}
            <Sofa x={z.x + 1.4} y={z.y + 6.6} w={2.8} />
            <Booth x={z.x + 8.9} y={z.y + 6.4} />
          </>
        );
      case "urgent":
        return (
          <>
            <Siren x={z.x + 5.2} y={z.y + 0.1} z={1.55} />
            <FirstAid x={z.x + 0.6} y={z.y + 0.12} />
            <Lockers x={z.x + 6.6} y={z.y + 0.2} n={5} h={1.05} />
            {benches(r)}
            <Stool x={z.x + 4.0} y={z.y + 7.1} />
            <RoundTable x={z.x + 5.0} y={z.y + 7.0} r={0.65} cls="lf-m-red" />
            <Stool x={z.x + 6.0} y={z.y + 7.1} />
            <Plant x={z.x + 9.7} y={z.y + 7.5} big />
          </>
        );
      case "ai":
        return (
          <>
            {[0, 1, 2].map((i) => (
              <Rack key={i} x={z.x + 6.9 + i * 1.02} y={z.y + 0.25} />
            ))}
            <Tv x={z.x + 0.6} y={z.y + 0.2} w={2.2} />
            {benches(r)}
            <Hologram x={z.x + 5.0} y={z.y + 7.0} />
            <Plant x={z.x + 9.6} y={z.y + 7.4} />
          </>
        );
      case "admin":
        return (
          <>
            <WallSign x={z.x + 4.3} y={0} z={1.52} text={room(r)} cls="lf-sign lf-sign--small" />
            <Shelf x={z.x + 0.4} y={z.y + 0.2} w={2.4} h={1.3} cls="lf-m-deskwalnut" />
            <Plant x={z.x + 10.8} y={z.y + 0.6} big />
            {benches(r)}
            <Rug x={z.x + 6.0} y={z.y + 5.6} w={5} d={2.6} cls="lf-rug2 lf-rug2--red" />
            <MeetingTable x={z.x + 6.6} y={z.y + 6.2} w={3.6} d={1.2} />
          </>
        );
      case "documents":
        return (
          <>
            {back ? <Whiteboard x={z.x + 6.6} y={z.y - 0.18} /> : null}
            {back ? <Clock x={z.x + 4.8} y={z.y - 0.25} /> : null}
            <Lockers x={z.x + 0.4} y={z.y + 0.2} n={4} h={1.25} />
            {benches(r)}
            <Lockers x={z.x + 6.2} y={z.y + 6.7} n={4} />
            <Printer x={z.x + 9.6} y={z.y + 6.5} />
          </>
        );
      case "desk":
        return (
          <>
            {back ? <Whiteboard x={z.x + 1.4} y={z.y - 0.18} /> : null}
            {back ? <Picture x={z.x + 5.0} y={z.y - 0.25} tone={1} /> : null}
            <Plant x={z.x + z.w - 0.9} y={z.y + 0.7} />
            {benches(r)}
            <Lockers x={z.x + 6.6} y={z.y + 6.9} n={4} h={0.9} />
            <Plant x={z.x + 0.6} y={z.y + 7.6} big />
          </>
        );
      case "studio":
        return (
          <>
            {back ? <Picture x={z.x + 1.2} y={z.y - 0.25} w={1.3} tone={2} /> : null}
            {back ? <Picture x={z.x + 2.8} y={z.y - 0.25} w={0.8} tone={0} /> : null}
            <Rug x={z.x + 0.7} y={z.y + 5.8} w={4.2} d={2.4} round cls="lf-rug2 lf-rug2--rainbow" />
            <Shelf x={z.x + 7.8} y={z.y + 0.2} />
            {benches(r)}
            <Beanbag x={z.x + 1.8} y={z.y + 7.0} />
            <Beanbag x={z.x + 3.6} y={z.y + 7.2} cls="lf-bean--b" />
            <Easel x={z.x + 7.4} y={z.y + 6.4} />
            <Tv x={z.x + 8.4} y={z.y + 7.0} w={1.6} />
          </>
        );
      case "market":
        return (
          <>
            {back ? <WallSign x={z.x + 3.2} y={z.y - 0.25} z={0.85} text={room(r)} cls="lf-sign lf-sign--small" /> : null}
            <GoodsShelf x={z.x + 0.4} y={z.y + 0.25} w={2.5} />
            <GoodsShelf x={z.x + 7.4} y={z.y + 0.25} w={3.2} />
            {benches(r)}
            <Counter x={z.x + 6.6} y={z.y + 6.4} w={3} />
            <Plant x={z.x + 9.8} y={z.y + 7.4} big />
          </>
        );
      case "lobby":
        return (
          <>
            <Partition x={WING} y={11} len={8.6} along="y" glass />
            <Block x={35} y={12} w={5.4} d={0.2} h={1.75} cls="lf-m-wall" />
            <WallSign x={35.55} y={12.2} z={0.72} text="LexGo" cls="lf-sign lf-sign--brand" />
            <Plant x={44.7} y={12.3} big />
            <Counter x={35.4} y={13.5} w={4.6} />
            <Shelf x={42.2} y={15.2} />
            {near(r) ? heads.filter((h) => h.room === "lobby" && h.kind === "stand").map((h) => figure(h.p, h.at, "stand", 1)) : null}
            <Tv x={35.3} y={19.4} />
            {TABLES.map((p, i) => (
              <g key={i}>
                <Stool x={p.x - 0.95} y={p.y + 0.1} />
                {near(r) ? heads.filter((h) => h.kind === "stool" && h.seat === i * 2).map((h) => figure(h.p, h.at, "stool", 1)) : null}
                <RoundTable x={p.x} y={p.y} />
                <Stool x={p.x + 0.95} y={p.y + 0.1} />
                {near(r) ? heads.filter((h) => h.kind === "stool" && h.seat === i * 2 + 1).map((h) => figure(h.p, h.at, "stool", 1)) : null}
              </g>
            ))}
            <Sofa x={41.5} y={26.9} w={3} cls="lf-m-peach" />
            {near(r) ? heads.filter((h) => h.kind === "stool" && h.seat === 6).map((h) => figure(h.p, { x: h.at.x, y: h.at.y - 0.2 }, "stool", 1)) : null}
            <Plant x={35} y={28.6} big />
          </>
        );
    }
  };

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
        <FloorDefs />
        <clipPath id="lf-face">
          <circle r="10.2" />
        </clipPath>
        <Block x={-0.32} y={-0.32} w={W + 0.62} d={D + 0.62} z={-0.45} h={0.45} cls="lf-m-slab" />
        <g transform={onFloor()} className="lf-ground">
          <rect className="lf-carpet" x="0" y="0" width={W} height={D} />
          <rect className="lf-wood" x={WING} y="0" width={W - WING} height={D} />
          <path className="lf-wood__edge" d={`M${WING} 0V${D}`} />
          <circle className="lf-rug" cx="40.2" cy="23.4" r="4.5" />
          <circle className="lf-rug__ring" cx="40.2" cy="23.4" r="4.5" />
          <path className="lf-lane" d={`M0.6 10H${WING - 0.6}M0.6 20.5H${WING - 0.6}`} />
          {ORDER.filter((r) => THEME[r].floor).map((r) => {
            const z = ZONE[r];
            return <rect key={r} className={`lf-fl ${THEME[r].floor}`} x={z.x - 0.25} y={z.y - (z.y < 1 ? 0.5 : 0.25)} width={z.w + 0.5} height={z.d + (z.y < 1 ? 0.5 : 0.25) + 0.25} />;
          })}
        </g>
        <WindowWallX x={0} y={0} w={W} />
        <WindowWallY x={0} y={0} d={D} />
        {[11.75, 22.75, 33.75].map((x) => (
          <Block key={x} x={x - 0.3} y={-0.32} w={0.6} d={0.62} h={2} cls="lf-m-wall" />
        ))}

        {ORDER.map((r) => {
          const z = ZONE[r];
          const on = focus === r;
          return (
            <g
              key={r}
              className={`lf-room lf-room--${r}${on ? " on" : ""}${focus && !on ? " is-dim" : ""}`}
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
              <g transform={onFloor()}>
                <rect className="lf-zone" x={z.x} y={z.y} width={z.w} height={z.d} rx="0.25" />
              </g>
              {r === "lobby" ? null : walls(r, "back")}
              {furnish(r)}
              {on && r !== "lobby" ? heads.filter((h) => h.room === r && h.kind === "stand").map((h) => figure(h.p, h.at, "stand", 1)) : null}
              {r === "lobby" ? null : walls(r, "front")}
              {r === "market" ? (
                <g className="lf-decor">
                  <Lockers x={13} y={22.1} n={8} />
                  {[0, 1, 2, 3].map((i) => (
                    <Booth key={i} x={20.4 + i * 1.75} y={22.1} />
                  ))}
                  <Printer x={28.6} y={22.2} />
                  <Printer x={29.9} y={22.2} />
                  <Plant x={32.5} y={22.5} big />
                  <Lockers x={13} y={25.2} n={8} />
                  <Sofa x={21} y={26.4} w={3.2} cls="lf-m-grey" />
                  <Stool x={26.6} y={27.3} />
                  <RoundTable x={27.6} y={27.2} />
                  <Stool x={28.6} y={27.3} />
                  <Plant x={31.6} y={28.3} />
                </g>
              ) : null}
            </g>
          );
        })}

        <g className={focus ? "lf-marks" : "lf-marks is-far"} aria-hidden>
          {ORDER.filter((r) => r !== "lobby").flatMap((r) => seatsOf(r).map((s, i) => (seatOf[r][i] ? null : <g key={`${r}${i}`} className={focus && focus !== r ? "lf-dim" : undefined}><SeatMark x={s.x} y={s.y} /></g>)))}
          {LOUNGE.map((s, i) => (stools[i] ? null : <g key={i} className={focus && focus !== "lobby" ? "lf-dim" : undefined}><SeatMark x={s.x} y={s.y} z={s.z - 0.1} /></g>))}
        </g>

        {/* Far away a person is a face on their chair; the room brought close
            draws its people whole (above), so their faces are left out here. */}
        {[...heads.filter((h) => h.p.id !== selected), ...(picked ? [picked] : [])].map(({ p, room: r, at }) => {
          if (focus === r) return null;
          const [x, y] = pt(at.x, at.y, at.z);
          const fresh = !!p.last && p.last.at >= freshSince && now - p.last.at < 45_000;
          return (
            <g key={p.id}>
              {selected === p.id ? <PickedPlate x={[x, y]} name={p.name || "—"} sub={`${kind(p.kind)} · ${room(r)}`} /> : null}
              <g
                className={`lf-av lf-av--${p.status === "working" ? "ok" : "warn"}${selected === p.id ? " is-sel" : ""}${fresh ? " is-fresh" : ""}${focus ? " lf-dim" : ""}`}
                style={{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` }}
                aria-hidden
                data-person={p.id}
                data-room={r}
                onClick={(e) => {
                  e.stopPropagation();
                  enter(r);
                }}
              >
                <title>{labelOf(p)}</title>
                <circle className="lf-av__pulse" r={13} />
                <circle className="lf-av__rim" r={13.4} />
                <circle className="lf-av__bg" r={10.4} />
                <g clipPath="url(#lf-face)">
                  <svg x={-10.4} y={-10.4} width={20.8} height={20.8} aria-hidden>
                    <Character id={p.id} kind={p.kind} pose="head" />
                  </svg>
                </g>
                <circle className="lf-av__ring" r={11.6} />
              </g>
            </g>
          );
        })}
        {focus
          ? heads.map(({ p, room: r, at, kind: k }) => {
              if (focus !== r) return null;
              const z = k === "stand" ? 2.0 : k === "stool" ? 1.75 : 1.68;
              const [x, y] = pt(at.x, at.y, z);
              return (
                <g key={p.id} className="lf-tag" style={{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` }} aria-hidden>
                  {selected === p.id ? <PickedPlate x={[0, -4]} name={p.name || "—"} sub={`${kind(p.kind)} · ${status(p.status)}`} /> : <text className="lf-name">{firstName(p.name || "—")}</text>}
                </g>
              );
            })
          : null}
        {ORDER.map((r) => {
          const z = ZONE[r];
          const [x, y] = pt(z.x + z.w / 2, z.y + 0.2, 2.15);
          return (
            <text key={r} className={`lf-label${focus && focus !== r ? " lf-dim" : ""}`} x={x.toFixed(1)} y={y.toFixed(1)} aria-hidden>
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

      {focus ? <RoomTicker people={heads.filter((h) => h.room === focus).map((h) => h.p)} onPick={onPick} /> : null}

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

// The dark plate beside the person who is picked: who they are and where.
function PickedPlate({ x, name, sub }: { x: [number, number]; name: string; sub: string }) {
  const w = 34 + Math.max(name.length * 5.4, sub.length * 3.5) + 12;
  return (
    <g className="lf-plate" transform={`translate(${x[0].toFixed(1)} ${x[1].toFixed(1)})`} aria-hidden>
      <rect x={-17} y={-17} width={w} height={34} rx={17} />
      <text className="lf-plate__n" x={19} y={-1.5}>{name}</text>
      <text className="lf-plate__s" x={19} y={8.5}>{sub}</text>
    </g>
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
              <span className={`lf-ticker__av lf-ticker__av--${p.status}`} aria-hidden>
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
