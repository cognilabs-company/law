import { Block, onFloor, onWallX, onWallY, pt } from "./floorKit";

// What an office floor is furnished with, drawn in floor units. Each piece
// paints itself back to front, so a caller only has to place the pieces in
// the right order (farther first). Colours come from the stylesheet, one
// material class per surface (lf-m-…), so both themes share the drawing.

const f = (n: number) => n.toFixed(2);

export function FloorDefs() {
  return (
    <defs>
      <pattern id="lf-carpet" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
        <rect width="0.5" height="0.5" className="lf-carpet__base" />
        <circle cx="0.12" cy="0.14" r="0.035" className="lf-carpet__a" />
        <circle cx="0.37" cy="0.31" r="0.03" className="lf-carpet__b" />
        <circle cx="0.2" cy="0.42" r="0.025" className="lf-carpet__a" />
      </pattern>
      <pattern id="lf-wood" width="3.2" height="0.8" patternUnits="userSpaceOnUse">
        <rect width="3.2" height="0.8" className="lf-wood__base" />
        <path d="M0 0H3.2M0 0.4H3.2M1.1 0V0.4M2.6 0.4V0.8" className="lf-wood__seam" />
      </pattern>
      <pattern id="lf-rug" width="0.36" height="0.36" patternUnits="userSpaceOnUse">
        <rect width="0.36" height="0.36" className="lf-rug__base" />
        <circle cx="0.18" cy="0.18" r="0.035" className="lf-rug__dot" />
      </pattern>
      <linearGradient id="lf-glass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" className="lf-glass__a" />
        <stop offset="0.5" className="lf-glass__b" />
        <stop offset="1" className="lf-glass__a" />
      </linearGradient>
    </defs>
  );
}

// A soft shadow lying on the floor under a piece.
export function Shadow({ x, y, w, d, r = 0.2 }: { x: number; y: number; w: number; d: number; r?: number }) {
  return (
    <g transform={onFloor()}>
      <rect className="lf-shadow" x={f(x + 0.12)} y={f(y + 0.14)} width={f(w)} height={f(d)} rx={r} />
    </g>
  );
}

// An outer wall across the view (along x) with a band of windows.
export function WindowWallX({ x, y, w, h = 1.9, t = 0.32, every = 1.7 }: { x: number; y: number; w: number; h?: number; t?: number; every?: number }) {
  const panes = Math.max(1, Math.floor((w - 1) / every));
  const pw = (w - 1) / panes;
  return (
    <g>
      <Block x={x} y={y - t} w={w} d={t} h={h} cls="lf-m-wall" />
      <g transform={onWallX(y + 0.001)}>
        <rect className="lf-win" x={f(x + 0.5)} y="0.52" width={f(w - 1)} height={f(h - 0.86)} />
        <rect className="lf-win__sky" x={f(x + 0.5)} y={f(h - 0.86 + 0.52 - 0.38)} width={f(w - 1)} height="0.38" />
        {Array.from({ length: panes + 1 }, (_, i) => (
          <rect key={i} className="lf-win__bar" x={f(x + 0.5 + i * pw - 0.04)} y="0.52" width="0.08" height={f(h - 0.86)} />
        ))}
        <rect className="lf-win__sill" x={f(x + 0.4)} y="0.44" width={f(w - 0.8)} height="0.09" />
        <rect className="lf-skirt" x={f(x)} y="0" width={f(w)} height="0.1" />
      </g>
    </g>
  );
}

// An outer wall running away from the viewer (along y) with windows.
export function WindowWallY({ x, y, d, h = 1.9, t = 0.32, every = 1.7 }: { x: number; y: number; d: number; h?: number; t?: number; every?: number }) {
  const panes = Math.max(1, Math.floor((d - 1) / every));
  const pw = (d - 1) / panes;
  return (
    <g>
      <Block x={x - t} y={y - t} w={t} d={d + t} h={h} cls="lf-m-wall" />
      <g transform={onWallY(x + 0.001)}>
        <rect className="lf-win lf-win--side" x={f(y + 0.5)} y="0.52" width={f(d - 1)} height={f(h - 0.86)} />
        {Array.from({ length: panes + 1 }, (_, i) => (
          <rect key={i} className="lf-win__bar" x={f(y + 0.5 + i * pw - 0.04)} y="0.52" width="0.08" height={f(h - 0.86)} />
        ))}
        <rect className="lf-win__sill" x={f(y + 0.4)} y="0.44" width={f(d - 0.8)} height="0.09" />
        <rect className="lf-skirt" x={f(y)} y="0" width={f(d)} height="0.1" />
      </g>
    </g>
  );
}

// An inner wall: solid, or glass on a low base.
export function Partition({ x, y, len, along, h = 1.25, glass = false }: { x: number; y: number; len: number; along: "x" | "y"; h?: number; glass?: boolean }) {
  const t = 0.14;
  const box = along === "x" ? { x, y: y - t / 2, w: len, d: t } : { x: x - t / 2, y, w: t, d: len };
  if (!glass) return <Block {...box} h={h} cls="lf-m-wall" />;
  return (
    <g>
      <Block {...box} h={0.18} cls="lf-m-frame" />
      <Block {...box} z={0.18} h={h - 0.24} cls="lf-m-glass" />
      <Block {...box} z={h - 0.06} h={0.06} cls="lf-m-frame" />
    </g>
  );
}

// A door standing open in a gap of a wall.
export function Door({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <Block x={x} y={y} w={0.07} d={1.15} h={1.2} cls="lf-m-door" />
      <g transform={onWallY(x + 0.071)}>
        <rect className="lf-door__knob" x={f(y + 0.95)} y="0.55" width="0.09" height="0.09" rx="0.04" />
      </g>
    </g>
  );
}

// An office chair. `back` says which side its back is on: "n" for a chair
// behind a desk (it faces the viewer), "s" for one in front of it.
export function Chair({ x, y, back, taken = false }: { x: number; y: number; back: "n" | "s"; taken?: boolean }) {
  const rest = <Block x={x - 0.27} y={back === "n" ? y - 0.31 : y + 0.23} w={0.54} d={0.08} z={0.5} h={0.52} cls="lf-m-chairback" />;
  return (
    <g className={`lf-chair${taken ? " is-taken" : ""}`}>
      <g transform={onFloor()}>
        <circle className="lf-shadow" cx={f(x + 0.05)} cy={f(y + 0.06)} r="0.36" />
        <path className="lf-chair__feet" d={`M${f(x - 0.3)} ${f(y)}H${f(x + 0.3)}M${f(x)} ${f(y - 0.3)}V${f(y + 0.3)}`} />
      </g>
      <Block x={x - 0.04} y={y - 0.04} w={0.08} d={0.08} h={0.42} cls="lf-m-steel" />
      {back === "n" ? rest : null}
      <Block x={x - 0.27} y={y - 0.27} w={0.54} d={0.54} z={0.42} h={0.1} cls="lf-m-chair" />
      {back === "s" ? rest : null}
    </g>
  );
}

// Where the four chairs of a bench stand, in the order people take them:
// the two behind the desk first, then the two in front.
export const BENCH = { w: 2.9, d: 1.5 };
export function benchSeats(x: number, y: number): { x: number; y: number; back: "n" | "s" }[] {
  return [
    { x: x + 0.78, y: y - 0.5, back: "n" },
    { x: x + 2.12, y: y - 0.5, back: "n" },
    { x: x + 0.78, y: y + BENCH.d + 0.5, back: "s" },
    { x: x + 2.12, y: y + BENCH.d + 0.5, back: "s" },
  ];
}

// A bench for four: two desks facing two desks, a screen at every place
// (lit where somebody sits), keyboards, a low divider down the middle.
export function Bench({ x, y, taken = [false, false, false, false] }: { x: number; y: number; taken?: boolean[] }) {
  const seats = benchSeats(x, y);
  const { w, d } = BENCH;
  const leg = (lx: number, ly: number) => <Block key={`${lx}-${ly}`} x={lx} y={ly} w={0.08} d={0.08} h={0.66} cls="lf-m-steel" />;
  const screen = (i: number) => {
    const s = seats[i];
    const front = s.back === "s";
    const my = front ? y + d / 2 + 0.16 : y + d / 2 - 0.22;
    return (
      <g key={`m${i}`}>
        <Block x={s.x - 0.05} y={my} w={0.1} d={0.06} z={0.74} h={0.16} cls="lf-m-steel" />
        <Block x={s.x - 0.36} y={my} w={0.72} d={0.06} z={0.86} h={0.42} cls={`lf-m-screen${front && taken[i] ? " is-on" : ""}`} />
      </g>
    );
  };
  return (
    <g className="lf-bench">
      <Shadow x={x} y={y} w={w} d={d} />
      <Chair {...seats[0]} taken={taken[0]} />
      <Chair {...seats[1]} taken={taken[1]} />
      {[leg(x + 0.08, y + 0.08), leg(x + w - 0.16, y + 0.08), leg(x + 0.08, y + d - 0.16), leg(x + w - 0.16, y + d - 0.16)]}
      <Block x={x} y={y} w={w} d={d} z={0.66} h={0.08} cls="lf-m-desk" />
      <g transform={onFloor(0.745)}>
        <path className="lf-desk__seam" d={`M${f(x + w / 2)} ${f(y + 0.06)}V${f(y + d - 0.06)}`} />
        {seats.map((s, i) => (
          <rect key={i} className="lf-kbd" x={f(s.x - 0.26)} y={f(s.back === "n" ? y + 0.14 : y + d - 0.32)} width="0.52" height="0.18" rx="0.03" />
        ))}
        {taken[0] ? <circle className="lf-mug" cx={f(x + 0.22)} cy={f(y + 0.3)} r="0.07" /> : null}
        {taken[3] ? <rect className="lf-paper" x={f(x + w - 0.5)} y={f(y + d - 0.5)} width="0.3" height="0.38" /> : null}
      </g>
      {screen(0)}
      {screen(1)}
      <Block x={x + 0.1} y={y + d / 2 - 0.03} w={w - 0.2} d={0.06} z={0.74} h={0.2} cls="lf-m-divider" />
      {screen(2)}
      {screen(3)}
      <Chair {...seats[2]} taken={taken[2]} />
      <Chair {...seats[3]} taken={taken[3]} />
    </g>
  );
}

export function Plant({ x, y, big = false }: { x: number; y: number; big?: boolean }) {
  const [px, py] = pt(x, y, 0.42);
  const k = big ? 1.35 : 1;
  const leaves = [-62, -34, -8, 20, 46, 70];
  return (
    <g className="lf-plant">
      <g transform={onFloor()}>
        <circle className="lf-shadow" cx={f(x + 0.08)} cy={f(y + 0.08)} r="0.34" />
      </g>
      <Block x={x - 0.2} y={y - 0.2} w={0.4} d={0.4} h={0.42} cls="lf-m-pot" />
      <g transform={`translate(${px.toFixed(1)} ${py.toFixed(1)}) scale(${k})`}>
        {leaves.map((a, i) => (
          <ellipse key={a} className={i % 2 ? "lf-leaf lf-leaf--b" : "lf-leaf"} rx="3.4" ry={i % 3 === 0 ? 10 : 12} transform={`rotate(${a}) translate(0 ${i % 3 === 0 ? -9 : -11})`} />
        ))}
      </g>
    </g>
  );
}

// A row of lockers or filing cabinets, doors toward the viewer.
export function Lockers({ x, y, n, h = 1.3, w = 0.72 }: { x: number; y: number; n: number; h?: number; w?: number }) {
  return (
    <g className="lf-lockers">
      <Shadow x={x} y={y} w={n * w} d={0.55} r={0.05} />
      <Block x={x} y={y} w={n * w} d={0.55} h={h} cls="lf-m-white" />
      <g transform={onWallX(y + 0.551)}>
        {Array.from({ length: n }, (_, i) => (
          <g key={i}>
            <rect className="lf-locker__door" x={f(x + i * w + 0.04)} y="0.06" width={f(w - 0.08)} height={f(h - 0.12)} />
            <rect className="lf-locker__grip" x={f(x + i * w + w - 0.16)} y={f(h * 0.55)} width="0.05" height="0.2" />
          </g>
        ))}
      </g>
    </g>
  );
}

// A sofa facing the viewer.
export function Sofa({ x, y, w, cls = "lf-m-blue" }: { x: number; y: number; w: number; cls?: string }) {
  return (
    <g className="lf-sofa">
      <Shadow x={x - 0.2} y={y} w={w + 0.4} d={1.05} />
      <Block x={x - 0.22} y={y} w={0.22} d={1.05} h={0.66} cls={cls} />
      <Block x={x} y={y} w={w} d={0.3} h={0.9} cls={cls} />
      <Block x={x} y={y + 0.3} w={w} d={0.75} h={0.42} cls={`${cls} lf-m--soft`} />
      <Block x={x + w} y={y} w={0.22} d={1.05} h={0.66} cls={cls} />
    </g>
  );
}

// A booth for a call: three padded walls and a seat.
export function Booth({ x, y }: { x: number; y: number }) {
  return (
    <g className="lf-booth">
      <Shadow x={x} y={y} w={1.4} d={1.25} />
      <Block x={x} y={y} w={1.4} d={0.16} h={1.55} cls="lf-m-blue" />
      <Block x={x} y={y + 0.16} w={0.16} d={1.1} h={1.55} cls="lf-m-blue" />
      <Block x={x + 0.16} y={y + 0.16} w={1.08} d={0.6} h={0.45} cls="lf-m-blue lf-m--soft" />
      <Block x={x + 0.5} y={y + 0.86} w={0.5} d={0.3} z={0.6} h={0.05} cls="lf-m-white" />
      <Block x={x + 1.24} y={y + 0.16} w={0.16} d={1.1} h={1.55} cls="lf-m-blue" />
    </g>
  );
}

// A round standing table.
export function RoundTable({ x, y, r = 0.55, h = 0.98, cls = "lf-m-tabletop" }: { x: number; y: number; r?: number; h?: number; cls?: string }) {
  return (
    <g className="lf-rtable">
      <g transform={onFloor()}>
        <circle className="lf-shadow" cx={f(x + 0.1)} cy={f(y + 0.12)} r={f(r * 0.9)} />
        <circle className="lf-m-steel lf-flat" cx={f(x)} cy={f(y)} r={f(r * 0.45)} />
      </g>
      <Block x={x - 0.05} y={y - 0.05} w={0.1} d={0.1} h={h - 0.06} cls="lf-m-steel" />
      <g transform={onFloor(h - 0.07)}>
        <circle className={`${cls} lf-flat lf-flat--edge`} cx={f(x)} cy={f(y)} r={f(r)} />
      </g>
      <g transform={onFloor(h)}>
        <circle className={`${cls} lf-flat`} cx={f(x)} cy={f(y)} r={f(r)} />
      </g>
    </g>
  );
}

export function Stool({ x, y }: { x: number; y: number }) {
  return (
    <g className="lf-stool">
      <g transform={onFloor()}>
        <circle className="lf-shadow" cx={f(x + 0.05)} cy={f(y + 0.06)} r="0.24" />
        <circle className="lf-m-steel lf-flat" cx={f(x)} cy={f(y)} r="0.2" />
      </g>
      <Block x={x - 0.035} y={y - 0.035} w={0.07} d={0.07} h={0.6} cls="lf-m-steel" />
      <g transform={onFloor(0.6)}>
        <circle className="lf-m-chair lf-flat lf-flat--edge" cx={f(x)} cy={f(y)} r="0.24" />
      </g>
      <g transform={onFloor(0.68)}>
        <circle className="lf-m-chair lf-flat" cx={f(x)} cy={f(y)} r="0.24" />
      </g>
    </g>
  );
}

// A screen on a low stand, facing the viewer.
export function Tv({ x, y, w = 1.9 }: { x: number; y: number; w?: number }) {
  return (
    <g className="lf-tv">
      <Shadow x={x} y={y} w={w} d={0.45} r={0.05} />
      <Block x={x} y={y} w={w} d={0.45} h={0.42} cls="lf-m-white" />
      <Block x={x + w / 2 - 0.06} y={y + 0.2} w={0.12} d={0.06} z={0.42} h={0.2} cls="lf-m-steel" />
      <Block x={x + 0.15} y={y + 0.2} w={w - 0.3} d={0.07} z={0.58} h={0.95} cls="lf-m-screen is-on" />
      <g transform={onWallX(y + 0.271)}>
        <path className="lf-tv__chart" d={`M${f(x + 0.4)} 0.85L${f(x + 0.75)} 1.05L${f(x + 1.05)} 0.95L${f(x + w - 0.45)} 1.3`} />
      </g>
    </g>
  );
}

// An open shelf with things on it.
export function Shelf({ x, y, w = 1.9, h = 1.15, cls = "lf-m-yellow" }: { x: number; y: number; w?: number; h?: number; cls?: string }) {
  const cw = (w - 0.3) / 2;
  return (
    <g className="lf-shelf">
      <Shadow x={x} y={y} w={w} d={0.45} r={0.05} />
      <Block x={x} y={y} w={w} d={0.45} h={h} cls={cls} />
      <g transform={onWallX(y + 0.451)}>
        {[0, 1].flatMap((c) => [0, 1].map((r) => <rect key={`${c}${r}`} className="lf-shelf__hole" x={f(x + 0.1 + c * (cw + 0.1))} y={f(0.1 + r * (h / 2 - 0.02))} width={f(cw)} height={f(h / 2 - 0.16)} />))}
        <rect className="lf-shelf__book" x={f(x + 0.16)} y="0.1" width="0.09" height="0.3" />
        <rect className="lf-shelf__book lf-shelf__book--b" x={f(x + 0.27)} y="0.1" width="0.09" height="0.36" />
        <rect className="lf-shelf__book" x={f(x + 0.2 + cw)} y={f(0.08 + h / 2)} width="0.3" height="0.22" />
      </g>
    </g>
  );
}

// A server rack with its lights.
export function Rack({ x, y }: { x: number; y: number }) {
  return (
    <g className="lf-rack">
      <Shadow x={x} y={y} w={0.85} d={0.8} r={0.05} />
      <Block x={x} y={y} w={0.85} d={0.8} h={1.7} cls="lf-m-navy" />
      <g transform={onWallX(y + 0.801)}>
        {[0, 1, 2, 3, 4, 5].map((r) => (
          <g key={r}>
            <rect className="lf-rack__slot" x={f(x + 0.08)} y={f(0.2 + r * 0.23)} width="0.69" height="0.15" />
            <rect className={`lf-led${r % 3 === 1 ? " lf-led--b" : ""}`} x={f(x + 0.14)} y={f(0.25 + r * 0.23)} width="0.07" height="0.05" style={{ animationDelay: `${(r * 0.37).toFixed(2)}s` }} />
            <rect className="lf-led lf-led--c" x={f(x + 0.26)} y={f(0.25 + r * 0.23)} width="0.07" height="0.05" style={{ animationDelay: `${(r * 0.21 + 0.5).toFixed(2)}s` }} />
          </g>
        ))}
      </g>
    </g>
  );
}

// A whiteboard hung on a wall across the view.
export function Whiteboard({ x, y, w = 2.6 }: { x: number; y: number; w?: number }) {
  return (
    <g transform={onWallX(y + 0.002)} className="lf-board">
      <rect className="lf-board__frame" x={f(x)} y="0.4" width={f(w)} height="0.82" rx="0.04" />
      <rect className="lf-board__face" x={f(x + 0.06)} y="0.46" width={f(w - 0.12)} height="0.7" />
      <path className="lf-board__ink" d={`M${f(x + 0.25)} 1H${f(x + w * 0.55)}M${f(x + 0.25)} 0.84H${f(x + w * 0.4)}`} />
      <path className="lf-board__ink lf-board__ink--b" d={`M${f(x + w * 0.62)} 0.62L${f(x + w * 0.72)} 0.82L${f(x + w * 0.8)} 0.72L${f(x + w - 0.25)} 1.02`} />
    </g>
  );
}

// A counter people stand at, its front toward the viewer.
export function Counter({ x, y, w, d = 0.75 }: { x: number; y: number; w: number; d?: number }) {
  return (
    <g className="lf-counter">
      <Shadow x={x} y={y} w={w} d={d} r={0.05} />
      <Block x={x} y={y} w={w} d={d} h={0.98} cls="lf-m-white" />
      <g transform={onWallX(y + d + 0.001)}>
        <rect className="lf-counter__panel" x={f(x + 0.12)} y="0.12" width={f(w - 0.24)} height="0.7" rx="0.04" />
      </g>
      <Block x={x - 0.06} y={y - 0.06} w={w + 0.12} d={d + 0.12} z={0.98} h={0.07} cls="lf-m-tabletop" />
    </g>
  );
}

export function Printer({ x, y }: { x: number; y: number }) {
  return (
    <g className="lf-printer">
      <Shadow x={x} y={y} w={0.95} d={0.8} r={0.05} />
      <Block x={x} y={y} w={0.95} d={0.8} h={0.85} cls="lf-m-grey" />
      <Block x={x + 0.08} y={y + 0.08} w={0.79} d={0.6} z={0.85} h={0.16} cls="lf-m-greydark" />
      <g transform={onWallX(y + 0.801)}>
        <rect className="lf-printer__tray" x={f(x + 0.12)} y="0.3" width="0.7" height="0.08" />
        <rect className="lf-led lf-led--b" x={f(x + 0.74)} y="0.66" width="0.07" height="0.05" />
      </g>
    </g>
  );
}

// A long table to meet at, with its chairs.
export function MeetingTable({ x, y, w = 3.6, d = 1.4 }: { x: number; y: number; w?: number; d?: number }) {
  const n = Math.max(2, Math.round(w / 1.2));
  const xs = Array.from({ length: n }, (_, i) => x + ((i + 0.5) * w) / n);
  return (
    <g className="lf-meet">
      <Shadow x={x} y={y} w={w} d={d} />
      {xs.map((cx) => (
        <Chair key={`n${cx}`} x={cx} y={y - 0.5} back="n" />
      ))}
      <Block x={x + 0.3} y={y + d / 2 - 0.15} w={w - 0.6} d={0.3} h={0.66} cls="lf-m-steel" />
      <Block x={x} y={y} w={w} d={d} z={0.66} h={0.09} cls="lf-m-tabletop" />
      {xs.map((cx) => (
        <Chair key={`s${cx}`} x={cx} y={y + d + 0.5} back="s" />
      ))}
    </g>
  );
}

// A name on a wall across the view, standing in its plane.
export function WallSign({ x, y, z = 0.7, text, cls = "lf-sign" }: { x: number; y: number; z?: number; text: string; cls?: string }) {
  return (
    <g transform={onWallX(y + 0.003)}>
      <text className={cls} transform={`translate(${f(x)} ${f(z)}) scale(1 -1)`}>
        {text}
      </text>
    </g>
  );
}

// A free chair somebody could take: the grey mark over it.
export function SeatMark({ x, y, z = 1.42 }: { x: number; y: number; z?: number }) {
  const [sx, sy] = pt(x, y, z);
  return <circle className="lf-seat" cx={sx.toFixed(1)} cy={sy.toFixed(1)} r="5.8" />;
}
