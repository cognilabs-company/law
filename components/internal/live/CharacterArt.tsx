"use client";

import { useId, type ReactNode, type SVGProps } from "react";
import { BACKDROP, CLOTH, HAIR_COLOR, PANTS, SKIN, isLight, tone, type Look } from "./character";

// A Live Office character, drawn front-on in a 120 × 170 box: head centred
// at (60, 44), shoulders at y 76, feet on y 164. The same drawing serves the
// whole figure (the studio, the screen view) and a bust (the floor, trays,
// drawer), which is the same picture through a smaller window; the studio's
// choices look through the window that shows the part being chosen. Nothing here
// uses an id but the chapan's stripes, so many figures share a page safely.

const VIEW = { full: "4 6 112 162", bust: "18 9 84 84", torso: "16 58 88 80", legs: "20 108 80 62", feet: "30 138 60 30" } as const;
export type ArtView = keyof typeof VIEW;
const INK = "#1E2A3D";
const GOLD = "#E7B43A";
const MIRROR = "matrix(-1 0 0 1 120 0)";

// Half the face's width and where its chin ends.
const FACE: Record<Look["face"], { hw: number; chin: number; d: string }> = {
  round: { hw: 19, chin: 63, d: "M60 25a19 19 0 1 1 0 38a19 19 0 1 1 0-38Z" },
  oval: { hw: 17, chin: 65, d: "M60 25c9.4 0 17 9 17 20s-7.6 20-17 20-17-9-17-20 7.6-20 17-20Z" },
  square: { hw: 18.5, chin: 63, d: "M53.5 25h13c6.6 0 12 5.4 12 12v14c0 6.6-5.4 12-12 12h-13c-6.6 0-12-5.4-12-12V37c0-6.6 5.4-12 12-12Z" },
  heart: { hw: 18.5, chin: 65, d: "M60 65C50 62 41.5 54 41.5 42C41.5 31 49 25 60 25S78.5 31 78.5 42C78.5 54 70 62 60 65Z" },
};

export const backdropOf = (look: Look) => BACKDROP[look.bg];

export default function CharacterArt({ look, variant = "full", title, ...rest }: { look: Look; variant?: ArtView; title?: string } & Omit<SVGProps<SVGSVGElement>, "children">) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const skin = SKIN[look.skin];
  const hair = HAIR_COLOR[look.hairColor];
  const cloth = CLOTH[look.topColor];
  const hatC = CLOTH[look.hatColor];
  const pants = PANTS[look.bottomColor];
  const face = FACE[look.face];
  const fem = look.body === "f";
  const scarfHat = look.hat === "scarf";
  const stripes = `chs${uid}`;
  const top = look.top === "chapan" ? `url(#${stripes})` : cloth;

  return (
    <svg viewBox={VIEW[variant]} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} className="chr" {...rest}>
      {look.top === "chapan" ? (
        <defs>
          <pattern id={stripes} width="6" height="10" patternUnits="userSpaceOnUse">
            <rect width="6" height="10" fill={cloth} />
            <rect width="1.6" height="10" fill={tone(cloth, 0.35)} />
            <rect x="3.2" width="0.9" height="10" fill={GOLD} opacity=".75" />
          </pattern>
        </defs>
      ) : null}
      {scarfHat ? <path d="M37 44C35 23 47 17 60 17S85 23 83 44C85 60 83 76 76 86H44C37 76 35 60 37 44Z" fill={hatC} /> : <HairBack look={look} c={hair} />}
      <Legs look={look} skin={skin} pants={pants} />
      <Shoes look={look} accent={cloth} />
      <Arms look={look} skin={skin} sleeve={top} />
      <rect x="54" y="56" width="12" height="23" rx="4" fill={skin} />
      <path d="M54 62H66V70Q60 73 54 70Z" fill="#000" opacity=".13" />
      <Top look={look} c={cloth} fill={top} skin={skin} />
      <Chest look={look} cloth={cloth} />
      {scarfHat ? <path d="M44 70C46 80 52 86 60 87S74 80 76 70C78 80 76 89 71 93H49C44 89 42 80 44 70Z" fill={tone(hatC, -0.08)} /> : <HairLocks look={look} c={hair} />}
      {scarfHat ? null : (
        <>
          <Ear x={60 - face.hw} skin={skin} />
          <g transform={MIRROR}>
            <Ear x={60 - face.hw} skin={skin} />
          </g>
          <Earrings kind={look.earrings} x={60 - face.hw} />
        </>
      )}
      <path d={face.d} fill={skin} />
      <Cheeks kind={look.cheeks} skin={skin} />
      <Beard kind={look.beard} c={hair} skin={skin} hw={face.hw} chin={face.chin} />
      <path d="M60 48.5Q58.2 52.3 60.6 53" stroke={tone(skin, -0.28)} strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <Eyes kind={look.eyes} />
      <Brows kind={look.brows} c={tone(hair, -0.12)} />
      <Mouth kind={look.mouth} />
      {scarfHat ? (
        <>
          <path d="M40 47C39 27 48 21 60 21S81 27 80 47C79 33 71.5 26.5 60 26.5S41 33 40 47Z" fill={tone(hatC, -0.1)} />
          <circle cx="75" cy="58" r="1.6" fill={GOLD} />
        </>
      ) : (
        <HairFront look={look} c={hair} />
      )}
      <Glasses kind={look.glasses} />
      <Hat kind={look.hat} c={hatC} />
      <Hands look={look} fem={fem} />
    </svg>
  );
}

// ── hair ────────────────────────────────────────────────────────────────────

function HairBack({ look, c }: { look: Look; c: string }) {
  const covered = look.hat === "cap" || look.hat === "beanie" || look.hat === "beret";
  switch (look.hair) {
    case "afro":
      return <circle cx="60" cy="39" r="26" fill={c} />;
    case "manbun":
      return covered ? null : (
        <>
          <circle cx="60" cy="19" r="7" fill={c} />
          <path d="M54 23.5h12" stroke={tone(c, -0.3)} strokeWidth="1.6" />
        </>
      );
    case "bun":
      return covered ? null : <circle cx="60" cy="17" r="8.5" fill={c} />;
    case "long":
    case "bangs":
      return <path d="M38 44C37 26 47 20 60 20S83 26 82 44V76H38Z" fill={c} />;
    case "bob":
      return <path d="M38 44C37 27 47 21 60 21S83 27 82 44C82 55 82 62 80 68H40C38 62 38 55 38 44Z" fill={c} />;
    case "pony":
      return <path d="M73 29C88 31 91 50 87 67C86 73 81 75 80 69C83 56 83 43 74 36Z" fill={c} />;
    case "wavy":
      return <path d="M38 44C36 26 47 20 60 20S84 26 82 44C84 54 80 60 84 70L80 76H40L36 70C40 60 36 54 38 44Z" fill={c} />;
    case "curlylong":
      return (
        <g fill={c}>
          <circle cx="60" cy="27" r="15" />
          {[34, 46, 58, 70].map((y) => (
            <g key={y}>
              <circle cx="40" cy={y} r="8.5" />
              <circle cx="80" cy={y} r="8.5" />
            </g>
          ))}
        </g>
      );
    default:
      return null;
  }
}

// Hair that falls over the shoulders, in front of the clothes.
function HairLocks({ look, c }: { look: Look; c: string }) {
  const lock = (d: string) => (
    <g fill={c}>
      <path d={d} />
      <path d={d} transform={MIRROR} />
    </g>
  );
  switch (look.hair) {
    case "long":
    case "bangs":
      return lock("M38.5 46C37 62 38.5 80 41 96L48.5 95C46 80 45 63 46.5 50Z");
    case "wavy":
      return lock("M38 46C36 58 40 64 37 74C35 82 39 92 43 97L49 95C46 88 44 82 46 74C48 64 44 58 46.5 50Z");
    case "curlylong":
      return (
        <g fill={c}>
          {[80, 90].map((y) => (
            <g key={y}>
              <circle cx="42" cy={y} r="6.5" />
              <circle cx="78" cy={y} r="6.5" />
            </g>
          ))}
        </g>
      );
    case "braids":
      return (
        <g fill={c}>
          {[0, 1].map((side) => (
            <g key={side} transform={side ? MIRROR : undefined}>
              {[54, 62, 70, 78, 86].map((y) => (
                <ellipse key={y} cx={42.5 - (y - 54) * 0.06} cy={y} rx="4.4" ry="4.6" stroke={tone(c, -0.25)} strokeWidth=".7" />
              ))}
              <rect x="39.4" y="90.5" width="5.4" height="2.6" rx="1.2" fill={GOLD} />
              <path d="M40.5 93.5l1.6 4 1.6-4Z" />
            </g>
          ))}
        </g>
      );
    default:
      return null;
  }
}

function HairFront({ look, c }: { look: Look; c: string }) {
  const d = tone(c, -0.25);
  const p = (path: string, extra?: ReactNode) => (
    <g fill={c}>
      <path d={path} />
      {extra}
    </g>
  );
  switch (look.hair) {
    case "buzz":
      return p("M41 42C40 30 48 23.5 60 23.5S80 30 79 42C77 35 71 30.5 60 30.5S43 35 41 42Z");
    case "side":
      return p("M40 44C38 28 47 21 60 21S82 28 80 42C78 35 75 31 70 30C64 33.5 52 34 45 31C43 35 41 39 40 44Z", <path d="M47 30Q52 26 58 25" stroke={d} strokeWidth="1.1" fill="none" />);
    case "quiff":
      return p("M40 42C39 30 44 21 54 18C62 15.5 72 16 77 21C81 26 81 34 80 42C77 35 72 31.5 66 31C58 32 50 31 44 33C42 36 41 39 40 42Z", <path d="M52 22Q60 18 70 20" stroke={d} strokeWidth="1" fill="none" />);
    case "curly":
      return (
        <g fill={c}>
          <path d="M42 40C42 28 50 22 60 22S78 28 78 40Z" />
          {[
            [44, 34],
            [48, 28],
            [54, 24.5],
            [60, 23.5],
            [66, 24.5],
            [72, 28],
            [76, 34],
          ].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="5.6" />
          ))}
          <circle cx="42" cy="40" r="3.6" />
          <circle cx="78" cy="40" r="3.6" />
        </g>
      );
    case "afro":
      return p("M41 41C44 32 52 30 60 31S76 32 79 41C79 30 72 23 60 23S41 30 41 41Z");
    case "bald":
      return <ellipse cx="53" cy="29.5" rx="5" ry="2.4" fill="#fff" opacity=".28" />;
    case "manbun":
    case "pony":
    case "bun":
      return p("M40.5 42C40 29 48 23 60 23S80 29 79.5 42C77 34 70 30.5 60 30.5S43 34 40.5 42Z", <path d="M48 27Q56 24.5 66 25.5" stroke={d} strokeWidth="1" fill="none" />);
    case "spiky":
      return p("M40 42L41 30L45 33L46 22L51 27L54 17L58 25L62 16L65 25L69 18L71 27L76 22L76 32L80 30L80 42C77 35 70 31 60 31S43 35 40 42Z");
    case "slick":
      return p("M40.5 40C40 28 48 22 60 22S80 28 79.5 40C78 33 73 29.5 60 29.5S42 33 40.5 40Z", <path d="M48 26Q56 24 66 25M46 30Q56 27 70 28" stroke={d} strokeWidth="1" fill="none" />);
    case "long":
      return p("M40 46C39 30 48 22 60 22S81 30 80 46C77 36 72 31 64 30C58 36 49 39 40 46Z");
    case "bob":
      return p("M41 38.5C41 28 49 22 60 22S79 28 79 38.5L79 39.5H41Z");
    case "braids":
    case "wavy":
      return p("M40 46C40 30 48 22 60 22S80 30 80 46C77 36 70 30 60 29C50 30 43 36 40 46Z");
    case "pixie":
      return p("M40 42C38 28 46 21 58 21C70 21 80 27 80 38C76 33 70 31 64 32C62 36 56 40 48 40C45 40 42 41 40 42Z");
    case "bangs":
      return p("M40 46C39 29 48 22 60 22S81 29 80 46C78 40 74 35 66 34L60 30L54 34C46 35 42 40 40 46Z");
    case "curlylong":
      return (
        <g fill={c}>
          <path d="M41 44C41 29 49 22 60 22S79 29 79 44C77 35 70 31 60 31S43 35 41 44Z" />
          {[46, 53, 60, 67, 74].map((x) => (
            <circle key={x} cx={x} cy={x === 46 || x === 74 ? 31 : 27.5} r="5" />
          ))}
        </g>
      );
    default:
      return null;
  }
}

// ── face ────────────────────────────────────────────────────────────────────

function Ear({ x, skin }: { x: number; skin: string }) {
  return (
    <g>
      <ellipse cx={x} cy="47" rx="3.6" ry="5" fill={skin} />
      <ellipse cx={x + 0.4} cy="47" rx="1.5" ry="2.6" fill={tone(skin, -0.14)} />
    </g>
  );
}

function Earrings({ kind, x }: { kind: Look["earrings"]; x: number }) {
  if (kind === "none") return null;
  const one =
    kind === "studs" ? (
      <circle cx={x} cy="52.4" r="1.5" fill={GOLD} />
    ) : kind === "hoops" ? (
      <circle cx={x} cy="54.6" r="2.9" fill="none" stroke={GOLD} strokeWidth="1.1" />
    ) : (
      <g fill={GOLD}>
        <path d={`M${x} 52v2.4`} stroke={GOLD} strokeWidth=".8" />
        <path d={`M${x} 54.2c1.6 1.6 1.6 3.8 0 4.6-1.6-.8-1.6-3 0-4.6Z`} />
      </g>
    );
  return (
    <>
      {one}
      <g transform={MIRROR}>{one}</g>
    </>
  );
}

function Cheeks({ kind, skin }: { kind: Look["cheeks"]; skin: string }) {
  if (kind === "none") return null;
  const one =
    kind === "blush" ? (
      <circle cx="49.5" cy="53" r="3.2" fill="#F28B82" opacity=".4" />
    ) : (
      <g fill={tone(skin, -0.38)}>
        <circle cx="48" cy="51.2" r=".6" />
        <circle cx="50.6" cy="52.6" r=".6" />
        <circle cx="52.4" cy="50.6" r=".55" />
        <circle cx="49.4" cy="49.6" r=".5" />
      </g>
    );
  return (
    <>
      {one}
      <g transform={MIRROR}>{one}</g>
    </>
  );
}

function Eye({ kind, x }: { kind: Look["eyes"]; x: number }) {
  const y = 46;
  const shine = <circle cx={x + 0.7} cy={y - 0.8} r=".65" fill="#fff" />;
  switch (kind) {
    case "dot":
      return (
        <g>
          <circle cx={x} cy={y} r="1.9" fill={INK} />
          {shine}
        </g>
      );
    case "smile":
      return <path d={`M${x - 3} ${y + 0.8}Q${x} ${y - 2.6} ${x + 3} ${y + 0.8}`} stroke={INK} strokeWidth="1.5" strokeLinecap="round" fill="none" />;
    case "almond":
      return (
        <g>
          <path d={`M${x - 3.4} ${y}Q${x} ${y - 3.2} ${x + 3.4} ${y}Q${x} ${y + 2.6} ${x - 3.4} ${y}Z`} fill="#fff" stroke={INK} strokeWidth=".6" />
          <circle cx={x} cy={y} r="1.7" fill="#3B2A22" />
          {shine}
        </g>
      );
    default:
      return (
        <g>
          <ellipse cx={x} cy={y} rx="2.9" ry="3.1" fill="#fff" />
          <circle cx={x} cy={y + 0.3} r="1.9" fill="#3B2A22" />
          {shine}
          {kind === "lashes" ? <path d={`M${x - 2.6} ${y - 1.8}l-1.7-1.3M${x - 1.2} ${y - 2.9}l-.8-1.6`} stroke={INK} strokeWidth=".9" strokeLinecap="round" /> : null}
        </g>
      );
  }
}

function Eyes({ kind }: { kind: Look["eyes"] }) {
  if (kind === "wink")
    return (
      <>
        <Eye kind="round" x={52} />
        <path d="M65 46.6Q68 44.2 71 46.6" stroke={INK} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </>
    );
  return (
    <>
      <Eye kind={kind} x={52} />
      <g transform={MIRROR}>
        <Eye kind={kind} x={52} />
      </g>
    </>
  );
}

function Brows({ kind, c }: { kind: Look["brows"]; c: string }) {
  const d = kind === "straight" ? "M48 39.8L56 39.2" : kind === "arched" ? "M48 41Q51 36.6 56 39.6" : "M48 40.6Q52 38 56 40.4";
  const one = <path d={d} stroke={c} strokeWidth={kind === "bold" ? 2.8 : kind === "straight" ? 1.9 : 1.6} strokeLinecap="round" fill="none" />;
  return (
    <>
      {one}
      <g transform={MIRROR}>{one}</g>
    </>
  );
}

function Mouth({ kind }: { kind: Look["mouth"] }) {
  const lip = "#8E3B2B";
  switch (kind) {
    case "grin":
      return (
        <g>
          <path d="M55 56.5Q60 63 65 56.5Z" fill="#7A2626" />
          <path d="M56 57Q60 58.6 64 57L63.6 58.3Q60 59.6 56.4 58.3Z" fill="#fff" />
        </g>
      );
    case "calm":
      return <path d="M56.5 57.6Q60 58.6 63.5 57.6" stroke={lip} strokeWidth="1.4" strokeLinecap="round" fill="none" />;
    case "open":
      return (
        <g>
          <ellipse cx="60" cy="58" rx="2.4" ry="2.8" fill="#7A2626" />
          <ellipse cx="60" cy="59.6" rx="1.5" ry=".9" fill="#E88A8A" />
        </g>
      );
    case "smirk":
      return <path d="M55.5 58Q60 59.5 64.5 56" stroke={lip} strokeWidth="1.5" strokeLinecap="round" fill="none" />;
    default:
      return <path d="M55.5 57Q60 61 64.5 57" stroke={lip} strokeWidth="1.5" strokeLinecap="round" fill="none" />;
  }
}

function Beard({ kind, c, skin, hw, chin }: { kind: Look["beard"]; c: string; skin: string; hw: number; chin: number }) {
  if (kind === "none") return null;
  const l = 60 - hw;
  const r = 60 + hw;
  const stache = <path d="M53.5 55.6Q56.5 52.6 60 54.4Q63.5 52.6 66.5 55.6Q63.5 57 60 55.9Q56.5 57 53.5 55.6Z" fill={c} />;
  if (kind === "stubble") return <path d={`M${l + 1} 48C${l + 2} 60 52 ${chin} 60 ${chin}S${r - 2} 60 ${r - 1} 48C${r - 3} 56 68 60.5 60 60.5S${l + 3} 56 ${l + 1} 48Z`} fill={c} opacity=".3" />;
  if (kind === "mustache") return stache;
  if (kind === "goatee")
    return (
      <g>
        {stache}
        <path d={`M56 60.6Q60 ${chin + 2.5} 64 60.6Q60 62 56 60.6Z`} fill={c} />
      </g>
    );
  const drop = kind === "full" ? 8 : 1.5;
  return (
    <g>
      <path d={`M${l} 45C${l} 61 50 ${chin + drop} 60 ${chin + drop}S${r} 61 ${r} 45C${r - 1.5} 54 70 57.5 64 56.5Q60 55.5 56 56.5C50 57.5 ${l + 1.5} 54 ${l} 45Z`} fill={c} />
      <ellipse cx="60" cy="58.2" rx="4.6" ry="2.3" fill={tone(skin, -0.06)} />
      {stache}
    </g>
  );
}

function Glasses({ kind }: { kind: Look["glasses"] }) {
  if (kind === "none") return null;
  const frame = { stroke: "#2B3442", strokeWidth: 1.5, fill: "rgba(255,255,255,.16)" };
  switch (kind) {
    case "round":
      return (
        <g {...frame}>
          <circle cx="52" cy="46" r="5.4" />
          <circle cx="68" cy="46" r="5.4" />
          <path d="M57.4 45.4Q60 44 62.6 45.4M46.6 45l-4.4-1.2M73.4 45l4.4-1.2" fill="none" />
        </g>
      );
    case "square":
      return (
        <g {...frame}>
          <rect x="45.4" y="41.4" width="13" height="9.4" rx="2" />
          <rect x="61.6" y="41.4" width="13" height="9.4" rx="2" />
          <path d="M58.4 45h3.2M45.4 44l-3.4-1M74.6 44l3.4-1" fill="none" />
        </g>
      );
    case "cateye":
      return (
        <g {...frame} stroke="#7A2E5A">
          <path d="M44.6 42.6Q52 40 58.4 42.6Q58 50.6 52 50.6Q46 50.6 44.6 42.6Z" />
          <path d="M75.4 42.6Q68 40 61.6 42.6Q62 50.6 68 50.6Q74 50.6 75.4 42.6Z" />
          <path d="M58.4 44.4h3.2M44.6 42.6l-2.6-2M75.4 42.6l2.6-2" fill="none" />
        </g>
      );
    case "halfrim":
      return (
        <g fill="none" stroke="#2B3442" strokeLinecap="round">
          <path d="M45.6 43.4Q52 41.4 58.4 43.4M61.6 43.4Q68 41.4 74.4 43.4" strokeWidth="2.2" />
          <path d="M45.6 43.6Q46 50.4 52 50.4T58.4 43.6M61.6 43.6Q62 50.4 68 50.4T74.4 43.6" strokeWidth=".7" opacity=".7" />
          <path d="M58.4 44h3.2" strokeWidth="1.3" />
        </g>
      );
    default:
      return (
        <g>
          <path d="M44.8 42h14.2l-1 6.6c-.4 2.4-2.4 3.4-5.6 3.4s-6.2-1-6.8-3.4ZM75.2 42H61l1 6.6c.4 2.4 2.4 3.4 5.6 3.4s6.2-1 6.8-3.4Z" fill="#1F2633" />
          <path d="M59 43.6h2M47 43.6l3.6 0" stroke="#1F2633" strokeWidth="1.4" />
          <path d="M48 44l3 4M64 44l3 4" stroke="#fff" strokeWidth=".9" opacity=".35" />
        </g>
      );
  }
}

function Hat({ kind, c }: { kind: Look["hat"]; c: string }) {
  switch (kind) {
    case "cap":
      return (
        <g>
          <path d="M40 37C40 25 48 18.5 60 18.5S80 25 80 37Z" fill={c} />
          <path d="M60 18.5V36M50 21Q48 28 47 37M70 21Q72 28 73 37" stroke={tone(c, -0.2)} strokeWidth=".8" fill="none" />
          <circle cx="60" cy="19" r="1.6" fill={tone(c, -0.25)} />
          <path d="M38.6 36.5Q60 33 81.4 36.5Q82.4 41 60 40Q37.6 41 38.6 36.5Z" fill={tone(c, -0.22)} />
        </g>
      );
    case "beanie":
      return (
        <g>
          <path d="M40 39C40 24 48 17.5 60 17.5S80 24 80 39Z" fill={c} />
          <path d="M39 33.5Q60 30 81 33.5V40Q60 36.5 39 40Z" fill={tone(c, -0.18)} />
          <path d="M44 33v6M49 32.2v6M54 31.7v6M60 31.5v6M66 31.7v6M71 32.2v6M76 33v6" stroke={tone(c, -0.32)} strokeWidth=".7" />
          <circle cx="60" cy="16" r="4.6" fill={tone(c, 0.35)} />
        </g>
      );
    case "headband":
      return (
        <g>
          <path d="M41.2 34.5Q60 26 78.8 34.5L79.6 38.6Q60 30.2 40.4 38.6Z" fill={c} />
          <path d="M72 30.4c3-3 6-3 6.4-.4.4 2.6-3.4 2.8-6.4.4Zm0 0c-1.4-3.6-.2-6 2-5.2 2.2.8.8 4-2 5.2Z" fill={tone(c, -0.12)} />
        </g>
      );
    case "doppi":
      return (
        <g>
          <path d="M41.5 33.5L43.5 21.5Q60 16 76.5 21.5L78.5 33.5Q60 29.4 41.5 33.5Z" fill="#1D1D22" />
          {[
            [49, 26.4],
            [60, 23.6],
            [71, 26.4],
          ].map(([x, y]) => (
            <path key={x} d={`M${x} ${y - 3}Q${x + 2.4} ${y} ${x} ${y + 3}Q${x - 2.4} ${y} ${x} ${y - 3}Zm-2.6 3.6q2.6 2.2 5.2 0`} fill="#F4F4F0" stroke="#F4F4F0" strokeWidth=".5" />
          ))}
          <path d="M41.5 33.5Q60 29.4 78.5 33.5" stroke="#F4F4F0" strokeWidth=".9" fill="none" />
        </g>
      );
    case "beret":
      return (
        <g>
          <path d="M38 33.5C36 23 49 17 62 18C76 19 85 25 82.5 31.5C78 35.5 49 37 38 33.5Z" fill={c} />
          <path d="M61 18.2l.6-3" stroke={tone(c, -0.3)} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M40 32.6Q60 35.6 81 30.6" stroke={tone(c, -0.2)} strokeWidth="1" fill="none" />
        </g>
      );
    default:
      return null;
  }
}

// ── body ────────────────────────────────────────────────────────────────────

const TORSO = {
  m: "M38 76H82C88 76 92 80 92 86V124H28V86C28 80 32 76 38 76Z",
  f: "M40 77H80C86 77 89 81 89 87L86 103C85 109 87 116 88 124H32C33 116 35 109 34 103L31 87C31 81 34 77 40 77Z",
};
const DRESS = "M40 77H80C86 77 89 81 89 87L86 103C85 108 88 116 92 146H28C32 116 35 108 34 103L31 87C31 81 34 77 40 77Z";
const ROBE = "M36 76H84C90 76 93 80 93 86L95 150H25L27 86C27 80 30 76 36 76Z";
// Shoulder and wrist of the left arm; the right one mirrors it.
const ARM = { m: { s: [31, 84], w: [26, 119], width: 10 }, f: { s: [34, 85], w: [30, 119], width: 9 } } as const;

function Arms({ look, skin, sleeve }: { look: Look; skin: string; sleeve: string }) {
  const a = ARM[look.top === "chapan" ? "m" : look.body];
  const short = look.top === "tee" || look.top === "polo" || look.top === "dress";
  const [sx, sy] = a.s;
  const [wx, wy] = a.w;
  const ex = sx + (wx - sx) * 0.42;
  const ey = sy + (wy - sy) * 0.42;
  const one = (
    <g strokeLinecap="round" fill="none">
      <path d={`M${sx} ${sy}L${wx} ${wy}`} stroke={skin} strokeWidth={a.width - 1.5} />
      <path d={`M${sx} ${sy}L${short ? ex : wx} ${short ? ey : wy - 2}`} stroke={sleeve} strokeWidth={a.width} />
      <circle cx={wx - 0.4} cy={wy + 3} r="4.6" fill={skin} stroke="none" />
    </g>
  );
  return (
    <>
      {one}
      <g transform={MIRROR}>{one}</g>
    </>
  );
}

function Legs({ look, skin, pants }: { look: Look; skin: string; pants: string }) {
  if (look.top === "dress")
    return (
      <g fill={skin}>
        <rect x="46" y="140" width="9" height="18" rx="3" />
        <rect x="65" y="140" width="9" height="18" rx="3" />
      </g>
    );
  switch (look.bottom) {
    case "skirt":
      return (
        <g>
          <g fill={skin}>
            <rect x="45.5" y="138" width="9" height="20" rx="3" />
            <rect x="65.5" y="138" width="9" height="20" rx="3" />
          </g>
          <path d="M37 119H83L89 142H31Z" fill={pants} />
          <path d="M48 124L45 142M60 124V142M72 124L75 142" stroke={tone(pants, -0.2)} strokeWidth=".8" />
        </g>
      );
    case "maxi":
      return (
        <g>
          <path d="M37 119H83L91 157H29Z" fill={pants} />
          <path d="M48 124L43 157M72 124L77 157" stroke={tone(pants, -0.2)} strokeWidth=".8" />
        </g>
      );
    default: {
      const jeans = look.bottom === "jeans";
      return (
        <g>
          <rect x="40" y="118" width="40" height="10" rx="3" fill={pants} />
          <rect x="41" y="120" width="17" height="38" rx="3" fill={pants} />
          <rect x="62" y="120" width="17" height="38" rx="3" fill={pants} />
          {jeans ? <path d="M49.5 128V157M70.5 128V157M58 122Q60 128 62 122" stroke={tone(pants, 0.3)} strokeWidth=".8" strokeDasharray="1.4 1" fill="none" /> : <path d="M49.5 130V157M70.5 130V157" stroke={tone(pants, -0.18)} strokeWidth=".7" />}
        </g>
      );
    }
  }
}

function Shoes({ look, accent }: { look: Look; accent: string }) {
  const pair = (one: ReactNode) => (
    <>
      {one}
      <g transform={MIRROR}>{one}</g>
    </>
  );
  switch (look.shoes) {
    case "sneakers":
      return pair(
        <g>
          <rect x="38.6" y="155" width="20.4" height="8.6" rx="4.2" fill="#F5F6F8" stroke="#C9CED6" strokeWidth=".6" />
          <path d="M39 161.4h19.6" stroke="#C9CED6" strokeWidth="1.4" />
          <path d="M43 158.6q6-.4 11-2.4" stroke={accent} strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </g>,
      );
    case "boots":
      return pair(
        <g>
          <rect x="40.4" y="147" width="18" height="16.6" rx="3" fill="#3A2C24" />
          <path d="M40.4 161.6h18" stroke="#1E1612" strokeWidth="2" />
        </g>,
      );
    case "heels":
      return pair(
        <g fill="#1F2430">
          <path d="M43 157.2h13.4c1.6 0 2.4 1.2 2.4 2.6v1.6H47.8l-1.6 3.4h-2.4l.2-3.6c-1.4-.6-1.8-1.6-1-4Z" />
        </g>,
      );
    case "flats":
      return pair(<rect x="41" y="157.4" width="17.4" height="5.4" rx="2.7" fill="#C9785E" />);
    default:
      return pair(
        <g>
          <rect x="39.6" y="156" width="19.2" height="7.4" rx="3.6" fill="#4A3222" />
          <path d="M44 158.4h8" stroke="#2E1E14" strokeWidth=".9" />
        </g>,
      );
  }
}

function Top({ look, c, fill, skin }: { look: Look; c: string; fill: string; skin: string }) {
  const dk = tone(c, -0.22);
  const lt = tone(c, 0.3);
  const shirt = "#F4F6F9";
  const body = TORSO[look.body];
  switch (look.top) {
    case "tee":
      return (
        <g>
          <path d={body} fill={c} />
          <path d="M52 76.5Q60 84 68 76.5Z" fill={skin} />
          <path d="M52 76.5Q60 84 68 76.5" stroke={dk} strokeWidth="1.6" fill="none" />
        </g>
      );
    case "shirt":
      return (
        <g>
          <path d={body} fill={c} />
          <path d="M53 76.5L60 86L67 76.5Z" fill={skin} />
          <path d="M53 76L60 86L55 89L50 79ZM67 76L60 86L65 89L70 79Z" fill={lt} stroke={dk} strokeWidth=".5" />
          <path d="M60 86V122" stroke={dk} strokeWidth=".8" />
          {[94, 104, 114].map((y) => (
            <circle key={y} cx="61.6" cy={y} r="1" fill={dk} />
          ))}
          <path d="M67 93h9v7q-4.5 2-9 0Z" fill="none" stroke={dk} strokeWidth=".7" />
        </g>
      );
    case "suit":
      return (
        <g>
          <path d={body} fill={c} />
          <path d="M51 76L60 104L69 76Z" fill={shirt} />
          <path d="M51 76L60 104L55 106L47 84L52 82L48 78ZM69 76L60 104L65 106L73 84L68 82L72 78Z" fill={dk} />
          <circle cx="60" cy="110" r="1.3" fill={tone(c, -0.4)} />
          <circle cx="60" cy="117" r="1.3" fill={tone(c, -0.4)} />
          <path d="M68 94h8" stroke={dk} strokeWidth="1.2" />
        </g>
      );
    case "blazer":
      return (
        <g>
          <path d={body} fill={c} />
          <path d="M52 76L56 124H64L68 76Z" fill={isLight(c) ? "#3A4252" : shirt} />
          <path d="M52 76L57 98L53 100L47 84L51 82L48 78ZM68 76L63 98L67 100L73 84L69 82L72 78Z" fill={dk} />
          <path d="M57 98L56 124M63 98L64 124" stroke={dk} strokeWidth="1" />
          <circle cx="54.4" cy="112" r="1.2" fill={tone(c, -0.4)} />
        </g>
      );
    case "hoodie":
      return (
        <g>
          <path d={body} fill={c} />
          <path d="M45 79C44 70 76 70 75 79C70 84 50 84 45 79Z" fill={dk} />
          <path d="M51 77Q60 82 69 77" stroke={tone(c, -0.38)} strokeWidth="1.4" fill="none" />
          <path d="M56 81V94M64 81V94" stroke={lt} strokeWidth="1.2" strokeLinecap="round" />
          <path d="M46 104H74L77 118H43Z" fill={dk} opacity=".55" />
        </g>
      );
    case "sweater": {
      const [x0, x1] = look.body === "m" ? [28, 92] : [31.4, 88.6];
      return (
        <g>
          <path d={body} fill={c} />
          <path d={`M${x0} 92H${x1}V98H${x0}Z`} fill={lt} />
          <path d={`M${x0} 94.6H${x1}`} stroke={dk} strokeWidth=".8" strokeDasharray="2 2" />
          <path d="M52 76.5Q60 83 68 76.5Z" fill={skin} />
          <path d="M51 76.5Q60 85 69 76.5" stroke={dk} strokeWidth="3" fill="none" />
          <path d={`M${x0 + 1} 121H${x1 - 1}`} stroke={dk} strokeWidth="3" />
        </g>
      );
    }
    case "polo":
      return (
        <g>
          <path d={body} fill={c} />
          <path d="M55 76.5L60 83L65 76.5Z" fill={skin} />
          <path d="M52 76L56 83.4L60 80L64 83.4L68 76Z" fill={lt} stroke={dk} strokeWidth=".5" />
          <path d="M58.6 80.4h2.8V92h-2.8Z" fill={dk} />
          <circle cx="60" cy="85" r=".8" fill={lt} />
          <circle cx="60" cy="89" r=".8" fill={lt} />
        </g>
      );
    case "cardigan":
      return (
        <g>
          <path d={body} fill={c} />
          <path d="M53 76L57 124H63L67 76Z" fill={isLight(c) ? "#3A4252" : shirt} />
          <path d="M55 76L60 84L65 76Z" fill={skin} />
          <path d="M53 76L57 124M67 76L63 124" stroke={dk} strokeWidth="1.4" />
          {[92, 102, 112].map((y) => (
            <circle key={y} cx="56.6" cy={y} r="1.2" fill={dk} />
          ))}
          <path d="M40 108h10v7H40ZM70 108h10v7H70Z" fill="none" stroke={dk} strokeWidth=".8" />
        </g>
      );
    case "turtleneck":
      return (
        <g>
          <path d={body} fill={c} />
          <rect x="52.5" y="63" width="15" height="16" rx="5" fill={c} />
          <path d="M53 67.4h14M53 71h14M53 74.6h14" stroke={dk} strokeWidth=".8" />
        </g>
      );
    case "dress":
      return (
        <g>
          <path d={DRESS} fill={c} />
          <path d="M53 77Q60 85 67 77Z" fill={skin} />
          <path d="M34.4 103.6H85.6" stroke={dk} strokeWidth="2.2" />
          <path d="M50 112L46 144M60 112V145M70 112L74 144" stroke={dk} strokeWidth=".8" opacity=".6" />
        </g>
      );
    case "chapan":
      return (
        <g>
          <path d={ROBE} fill={fill} />
          <path d="M52 76L60 104L68 76Z" fill={shirt} />
          <path d="M52 76L60 104L68 76M60 104L58 150" stroke={GOLD} strokeWidth="1.4" fill="none" />
          <path d="M26.6 106H93.6V113.6H26.6Z" fill="#C2342F" />
          <path d="M26.6 109.8H93.6" stroke={GOLD} strokeWidth=".8" strokeDasharray="2 1.6" />
          <path d="M25.2 148.6H94.8" stroke={GOLD} strokeWidth="1.4" />
        </g>
      );
    default:
      return <path d={body} fill={c} />;
  }
}

// What hangs on the chest: a badge, a scarf, a tie, a necklace.
function Chest({ look, cloth }: { look: Look; cloth: string }) {
  const contrast = ["navy", "blue", "sky", "teal", "violet"].includes(look.topColor) ? "#E8742C" : "#2F6FE0";
  switch (look.extra) {
    case "badge":
      return (
        <g>
          <path d="M53 78L58 99M67 78L62 99" stroke={contrast} strokeWidth="1.6" />
          <rect x="54.5" y="98" width="11" height="14" rx="1.6" fill="#fff" stroke="#C9CED6" strokeWidth=".6" />
          <rect x="56" y="100" width="8" height="4.4" rx=".8" fill={contrast} />
          <path d="M56.4 107h7.2M56.4 109.6h5" stroke="#9AA3AF" strokeWidth=".8" />
        </g>
      );
    case "necklace":
      return (
        <g>
          <path d="M52 77Q60 89 68 77" stroke={GOLD} strokeWidth="1.2" fill="none" />
          <circle cx="60" cy="87.4" r="1.9" fill={GOLD} />
        </g>
      );
    case "scarf": {
      const s = look.topColor === "mustard" ? CLOTH.red : CLOTH.mustard;
      return (
        <g>
          <path d="M47 73Q60 82 73 73L74 80Q60 89 46 80Z" fill={s} />
          <path d="M63 82L68 104L62 105L58 84Z" fill={tone(s, -0.15)} />
          <path d="M62.6 101.6l5.2-.8M62 98.6l5-.8" stroke={tone(s, 0.35)} strokeWidth=".8" />
        </g>
      );
    }
    case "tie": {
      const tie = look.topColor === "red" || look.topColor === "berry" ? CLOTH.navy : "#B4233A";
      return (
        <g>
          <path d="M58.3 79H61.7L63.5 98L60 102L56.5 98Z" fill={tie} />
          <rect x="57.5" y="77" width="5" height="3.8" rx="1" fill={tone(tie, -0.2)} />
        </g>
      );
    }
    case "bowtie":
      return (
        <g fill={cloth === CLOTH.red ? CLOTH.navy : "#B4233A"}>
          <path d="M53 78.4L59 81L53 83.6ZM67 78.4L61 81L67 83.6Z" />
          <circle cx="60" cy="81" r="1.7" />
        </g>
      );
    default:
      return null;
  }
}

// What the hands hold or wear, and the headset over everything.
function Hands({ look, fem }: { look: Look; fem: boolean }) {
  const a = ARM[look.top === "chapan" ? "m" : fem ? "f" : "m"];
  const [wx, wy] = a.w;
  switch (look.extra) {
    case "watch":
      return (
        <g>
          <rect x={wx - 4.2} y={wy - 4.8} width="8" height="4.6" rx="1.6" fill="#2B3442" />
          <circle cx={wx - 0.2} cy={wy - 2.5} r="1.7" fill="#DDE7F3" />
        </g>
      );
    case "mug": {
      const x = 120 - wx - 4;
      const y = wy - 5;
      return (
        <g>
          <path className="chr-steam" d={`M${x + 3} ${y - 2}q-1.6-2.4 0-4.6t0-4.4M${x + 7} ${y - 2}q-1.6-2.4 0-4.6t0-4.4`} stroke="#9AA3AF" strokeWidth=".9" strokeLinecap="round" fill="none" />
          <path d={`M${x + 10} ${y + 2.4}h1.6a2.6 2.6 0 0 1 0 5.2H${x + 10}`} stroke="#fff" strokeWidth="1.6" fill="none" />
          <rect x={x} y={y} width="10.4" height="11.4" rx="2" fill="#fff" stroke="#C9CED6" strokeWidth=".6" />
          <rect x={x} y={y + 3.4} width="10.4" height="3" fill="#E8742C" />
        </g>
      );
    }
    case "headset": {
      const hw = FACE[look.face].hw;
      return (
        <g>
          <path d="M40.6 44C40.6 21 79.4 21 79.4 44" stroke="#2B3442" strokeWidth="3" fill="none" />
          <rect x={60 - hw - 3.6} y="40" width="6.2" height="11.6" rx="3" fill="#2B3442" />
          <rect x={60 + hw - 2.6} y="40" width="6.2" height="11.6" rx="3" fill="#2B3442" />
          <path d={`M${60 - hw} 50Q${60 - hw + 2} 60 54 59.4`} stroke="#2B3442" strokeWidth="1.5" fill="none" />
          <circle cx="54.2" cy="59.4" r="1.9" fill="#2B3442" />
        </g>
      );
    }
    default:
      return null;
  }
}
