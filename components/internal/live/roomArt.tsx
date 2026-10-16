"use client";

import type { ReactNode } from "react";
import { onFloor } from "@/components/live/floorKit";
import {
  Beanbag,
  Bench,
  Booth,
  Clock,
  Counter,
  Easel,
  FirstAid,
  GoodsShelf,
  Hologram,
  Lockers,
  MeetingTable,
  Picture,
  Plant,
  Printer,
  Rack,
  RoundTable,
  Rug,
  Shelf,
  Siren,
  Sofa,
  Stool,
  Tv,
  WallBand,
  WallX,
  WallY,
  Whiteboard,
  type BenchStyle,
} from "@/components/live/floorArt";
import { asDict } from "@/lib/http";
import type { Dict } from "./roomPlan";

// How the rooms of the HRM Live Office are furnished. Every room has a
// style — studio, call centre, legal, finance, people, tech, sales,
// management, documents, urgent or a plain office — taken from what an
// admin chose (meta.theme) or else read from the room's and department's
// names. The style decides the floor, the walls, the desks and chairs and
// what stands in the room's corner beside the desks: booths and a sofa for
// the call centre, racks and a hologram for tech, bookcases and a meeting
// table for legal, and so on.

export const THEMES = ["office", "studio", "support", "legal", "finance", "people", "tech", "sales", "board", "docs", "urgent"] as const;
export type ThemeId = (typeof THEMES)[number];
// The width of the corner every room has beside its desks.
export const SIDE = 3.6;

type Style = { floor: string; wall: string; glass: boolean; bench: BenchStyle; band?: string };
const STYLE: Record<ThemeId, Style> = {
  office: { floor: "lf-fl--sage", wall: "lf-m-wall", glass: true, bench: {} },
  studio: { floor: "lf-fl--concrete", wall: "lf-m-wall", glass: true, bench: { desk: "lf-m-deskwhite", screens: "dual", chair: "lf-m-chair--orange", chairBack: "lf-m-chair--orange" }, band: "lf-band--violet" },
  support: { floor: "lf-fl--talk", wall: "lf-m-wall", glass: true, bench: { divider: "lf-m-acoustic", tall: true, chair: "lf-m-chair--blue", chairBack: "lf-m-chair--blue" }, band: "lf-band--blue" },
  legal: { floor: "lf-fl--parquet", wall: "lf-m-wall--warm", glass: false, bench: { desk: "lf-m-deskwalnut", divider: "lf-m-deskwalnut", chair: "lf-m-chair--leather", chairBack: "lf-m-chair--leather" } },
  finance: { floor: "lf-fl--beige", wall: "lf-m-wall--warm", glass: false, bench: { desk: "lf-m-deskwhite", screens: "dual", chair: "lf-m-chair--green", chairBack: "lf-m-chair--green" }, band: "lf-band--amber" },
  people: { floor: "lf-fl--sage", wall: "lf-m-wall", glass: true, bench: { chair: "lf-m-chair--green", chairBack: "lf-m-chair--green" }, band: "lf-band--violet" },
  tech: { floor: "lf-fl--ai", wall: "lf-m-wall--dark", glass: false, bench: { desk: "lf-m-deskblack", divider: "lf-m-cyan", screens: "dual", chair: "lf-m-chair--dark", chairBack: "lf-m-chair--dark" } },
  sales: { floor: "lf-fl--terra", wall: "lf-m-wall--warm", glass: true, bench: { chair: "lf-m-chair--amber", chairBack: "lf-m-chair--amber" }, band: "lf-band--amber" },
  board: { floor: "lf-fl--parquet", wall: "lf-m-wall--warm", glass: true, bench: { desk: "lf-m-deskwalnut", divider: "lf-m-deskwalnut", chair: "lf-m-chair--leather", chairBack: "lf-m-chair--leather" } },
  docs: { floor: "lf-fl--beige", wall: "lf-m-wall--warm", glass: false, bench: {}, band: "lf-band--amber" },
  urgent: { floor: "lf-fl--urgent", wall: "lf-m-wall", glass: false, bench: { desk: "lf-m-deskwhite", divider: "lf-m-red", chair: "lf-m-chair--red", chairBack: "lf-m-chair--red" }, band: "lf-band--red" },
};

// Words in a room's or a department's name that say what it is, in Uzbek
// (Latin and Cyrillic), Russian and English. The first style that matches wins.
const WORDS: [ThemeId, RegExp][] = [
  ["urgent", /shoshilinch|urgent|tezkor|sifat|nazorat|quality|контрол|срочн|качеств/],
  ["support", /call|qo.?ng.?iroq|navbat|support|operator|contact|aloqa|murojaat|mijoz|колл|поддерж|оператор|обращен|клиент/],
  ["studio", /studi|dizayn|design|creative|kreativ|media|контент|content|студи|дизайн/],
  ["legal", /yurid|huquq|legal|advokat|law|notar|sud|юрид|прав|адвокат|суд/],
  ["finance", /moliya|buxgalt|hisob|payroll|ish haqi|finance|account|g.?azna|бухгал|финан|казна|зарплат/],
  ["people", /\bhr\b|kadr|xodim|people|personal|talent|ishga|кадр|персонал|сотрудн/],
  ["tech", /\bit\b|dev|tech|texn|dastur|\bai\b|data|server|engineer|разраб|техн|программ|сервер/],
  ["sales", /sotuv|sales|marketing|crm|market|savdo|hamkor|partner|продаж|маркет|партн/],
  ["board", /boshqar|rahbar|direkt|ceo|admin|management|markaz|руковод|дирек|правлен|управлен/],
  ["docs", /hujjat|arxiv|document|doc\b|kanselyar|архив|документ|канцеляр/],
];
const GENERIC: ThemeId[] = ["office", "people", "studio", "docs"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const chosenTheme = (meta: Dict): ThemeId | null => {
  const v = asDict(meta).theme;
  return typeof v === "string" && (THEMES as readonly string[]).includes(v) ? (v as ThemeId) : null;
};

// The style a room has: the admin's choice, else its names, else its kind
// (a virtual room is a tech room), else one of the plain styles by its id.
export function themeOf(meta: Dict, names: string[], type: string, id: string): ThemeId {
  const chosen = chosenTheme(meta);
  if (chosen) return chosen;
  const text = names.join(" ").toLocaleLowerCase();
  for (const [theme, re] of WORDS) if (re.test(text)) return theme;
  if (type === "virtual") return "tech";
  return GENERIC[hash(id || text) % GENERIC.length];
}

// One room: its floor, walls, desks and furnished corner. `gw` is the width
// of the desk area; the corner is the SIDE beyond it. `open` is a
// department's open bay, which has no walls. `tint` is a colour an admin
// chose for the floor, which then replaces the style's own.
export function RoomArt({
  x,
  y,
  w,
  d,
  gw,
  theme,
  type,
  desks,
  taken,
  tint,
  open = false,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  gw: number;
  theme: ThemeId;
  type: string;
  desks: { x: number; y: number }[];
  taken: boolean[][];
  tint: number | null;
  open?: boolean;
}) {
  const s = STYLE[theme];
  const glass = s.glass || type === "virtual";
  const cx = x + gw + 0.2;
  return (
    <>
      <g transform={onFloor()}>
        <rect className={tint === null ? `lf-fl ${s.floor}` : "lf-zone--tint"} x={x} y={y} width={w} height={d} rx="0.25" />
        <rect className={open ? "lf-zone lf-zone--edge" : "lf-zone"} x={x} y={y} width={w} height={d} rx="0.25" />
      </g>
      {open ? null : (
        <>
          <WallX x={x} y={y} len={w} cls={s.wall} glass={type === "virtual"} />
          {s.band ? <WallBand x={x + 0.2} y={y - 0.08} len={w - 0.4} z={1.02} h={0.1} cls={s.band} /> : null}
          <WallY x={x} y={y} len={d} door={[d - 2.4, d - 1.2]} cls={s.wall} glass={glass} />
          <WallDecor theme={theme} x={x} y={y} gw={gw} w={w} />
        </>
      )}
      {desks.map((k, i) => (
        <Bench key={i} x={k.x} y={k.y} taken={taken[i]} look={s.bench} />
      ))}
      <Corner theme={theme} cx={cx} y={y} d={d} />
      {open ? null : (
        <>
          <WallY x={x + w} y={y} len={d} h={0.42} cls={s.wall} />
          <WallX x={x} y={y + d} len={w} h={0.42} door={[1, 2.3]} cls={s.wall} />
        </>
      )}
    </>
  );
}

// What hangs on the far wall above the desks.
function WallDecor({ theme, x, y, gw, w }: { theme: ThemeId; x: number; y: number; gw: number; w: number }) {
  const board = gw > 4 ? <Whiteboard x={x + 0.9} y={y + 0.07} w={Math.min(2.6, gw - 1.8)} /> : null;
  const right = x + w - 0.6;
  switch (theme) {
    case "studio":
      return (
        <>
          <Picture x={x + 0.7} y={y + 0.1} w={1.3} tone={2} />
          <Picture x={x + 2.2} y={y + 0.1} w={0.8} tone={0} />
          {gw > 6 ? <Picture x={x + 3.2} y={y + 0.1} w={1.1} tone={1} /> : null}
          <Clock x={right} y={y + 0.07} />
        </>
      );
    case "urgent":
      return (
        <>
          {board}
          <Siren x={right - 0.4} y={y + 0.1} z={1.25} />
        </>
      );
    case "legal":
    case "board":
      return (
        <>
          <Picture x={x + 0.8} y={y + 0.1} w={1.2} h={0.7} tone={theme === "legal" ? 1 : 0} />
          {gw > 5 ? <Picture x={x + 2.3} y={y + 0.1} w={1.2} h={0.7} tone={0} /> : null}
          <Clock x={right} y={y + 0.07} />
        </>
      );
    case "people":
    case "office":
      return (
        <>
          {board}
          <Picture x={x + gw - 0.6} y={y + 0.1} w={0.8} tone={1} />
          <Clock x={right} y={y + 0.07} />
        </>
      );
    default:
      return (
        <>
          {board}
          <Clock x={right} y={y + 0.07} />
        </>
      );
  }
}

// The corner beside the desks: something against the far wall, something in
// the middle and something by the front, as the style has it. A room deep
// enough gets a meeting table where a small one has a round one.
function Corner({ theme, cx, y, d }: { theme: ThemeId; cx: number; y: number; d: number }) {
  const back = y + 0.3;
  const mid = y + d / 2 - 0.7;
  const front = y + d - 1.5;
  const roomy = d >= 8.5;
  const lounge = (cls?: string) => (
    <>
      <Rug x={cx + 0.1} y={front - 0.2} w={3.1} d={1.6} cls="lf-rug2" />
      <Sofa x={cx + 0.45} y={front} w={2.3} cls={cls} />
    </>
  );
  const talk = (tableCls?: string): ReactNode =>
    roomy ? (
      <>
        <Rug x={cx} y={mid - 0.6} w={3.2} d={3} cls="lf-rug2 lf-rug2--red" />
        <MeetingTable x={cx + 0.3} y={mid} w={2.6} d={1.1} />
      </>
    ) : (
      <>
        <Stool x={cx + 0.6} y={mid + 0.6} />
        <RoundTable x={cx + 1.6} y={mid + 0.5} r={0.55} cls={tableCls} />
        <Stool x={cx + 2.6} y={mid + 0.6} />
      </>
    );
  const items: ReactNode = (() => {
    switch (theme) {
      case "studio":
        return (
          <>
            <Shelf x={cx + 0.3} y={back} w={2.6} />
            <Rug x={cx + 0.1} y={mid - 0.4} w={3} d={2} round cls="lf-rug2 lf-rug2--rainbow" />
            <Beanbag x={cx + 0.9} y={mid + 0.5} />
            <Beanbag x={cx + 2.3} y={mid + 0.7} cls="lf-bean--b" />
            <Easel x={cx + 0.8} y={front + 0.4} />
            <Tv x={cx + 1.6} y={front + 0.6} w={1.5} />
          </>
        );
      case "support":
        return (
          <>
            <Booth x={cx + 0.2} y={back} />
            <Booth x={cx + 1.75} y={back} />
            <Plant x={cx + 2.9} y={mid + 0.4} />
            {lounge()}
          </>
        );
      case "legal":
        return (
          <>
            <Shelf x={cx + 0.1} y={back} w={1.5} h={1.45} cls="lf-m-deskwalnut" />
            <Shelf x={cx + 1.7} y={back} w={1.5} h={1.45} cls="lf-m-deskwalnut" />
            {talk("lf-m-deskwalnut")}
            {roomy ? null : <Plant x={cx + 0.6} y={front + 0.6} big />}
            {roomy ? null : <Lockers x={cx + 1.4} y={front + 0.4} n={2} h={1} />}
          </>
        );
      case "finance":
        return (
          <>
            <Lockers x={cx + 0.2} y={back} n={4} h={1.25} />
            <Printer x={cx + 0.3} y={mid + 0.2} />
            <Counter x={cx + 1.5} y={mid + 0.2} w={1.6} d={0.7} />
            <Lockers x={cx + 0.2} y={front + 0.3} n={3} h={0.9} />
            <Plant x={cx + 2.9} y={front + 0.7} />
          </>
        );
      case "people":
        return (
          <>
            <Shelf x={cx + 0.3} y={back} w={2.4} cls="lf-m-yellow" />
            {talk()}
            {lounge("lf-m-peach")}
          </>
        );
      case "tech":
        return (
          <>
            {[0, 1, 2].map((i) => (
              <Rack key={i} x={cx + 0.1 + i * 1.02} y={back} />
            ))}
            <Hologram x={cx + 1.6} y={mid + 0.7} />
            <Tv x={cx + 0.5} y={front + 0.5} w={2.2} />
          </>
        );
      case "sales":
        return (
          <>
            <GoodsShelf x={cx + 0.2} y={back} w={2.9} />
            <Counter x={cx + 0.3} y={mid + 0.1} w={2.6} />
            <Tv x={cx + 0.3} y={front + 0.5} w={1.8} />
            <Plant x={cx + 2.8} y={front + 0.7} big />
          </>
        );
      case "board":
        return (
          <>
            <Shelf x={cx + 0.3} y={back} w={2.6} h={1.3} cls="lf-m-deskwalnut" />
            {talk("lf-m-deskwalnut")}
            {roomy ? null : <Plant x={cx + 2.9} y={front + 0.7} big />}
            {roomy ? null : <Sofa x={cx + 0.4} y={front} w={1.9} cls="lf-m-deskwalnut" />}
          </>
        );
      case "docs":
        return (
          <>
            <Lockers x={cx + 0.2} y={back} n={4} h={1.3} />
            <Printer x={cx + 0.3} y={mid + 0.1} />
            <Lockers x={cx + 1.6} y={mid + 0.2} n={2} h={1} />
            <Lockers x={cx + 0.2} y={front + 0.3} n={4} h={0.9} />
          </>
        );
      case "urgent":
        return (
          <>
            <FirstAid x={cx + 0.2} y={back} />
            <Lockers x={cx + 1} y={back} n={3} h={1.05} />
            {talk("lf-m-red")}
            <Plant x={cx + 2.9} y={front + 0.7} big />
          </>
        );
      default:
        return (
          <>
            <Shelf x={cx + 0.3} y={back} w={2.6} />
            <Printer x={cx + 0.3} y={mid + 0.2} />
            <Plant x={cx + 2.6} y={mid + 0.6} />
            {lounge()}
          </>
        );
    }
  })();
  return <g className="lf-corner">{items}</g>;
}
