"use client";

// The desktop's wallpaper, drawn here rather than copied. The Windows-style
// desktop has a bloom of translucent ribbons opening from a point; the
// macOS-style one has rolling hills of colour, layered like dunes or waves.
// Four of each; the choice is the viewer's.

export const WALLPAPERS = ["bloom", "night", "glow", "lexgo"] as const;
export const MAC_WALLPAPERS = ["dunes", "waves", "aurora", "dusk"] as const;
export type WallpaperId = (typeof WALLPAPERS)[number] | (typeof MAC_WALLPAPERS)[number];
export const wallpapersOf = (os: "win" | "mac"): readonly WallpaperId[] => (os === "mac" ? MAC_WALLPAPERS : WALLPAPERS);

// Hills: a sky and five layers of land, back to front, each a gradient.
type Hills = { sky: [string, string]; layers: [string, string][]; sun?: string };
const HILLS: Record<(typeof MAC_WALLPAPERS)[number], Hills> = {
  dunes: { sky: ["#FDE6C8", "#F6B98C"], layers: [["#F2A86F", "#E98A55"], ["#E47D4F", "#C95E3B"], ["#C9603F", "#A9462E"], ["#9E4432", "#7B3026"], ["#6E2B27", "#4E1D1E"]], sun: "#FFF4DE" },
  waves: { sky: ["#C9D8FF", "#9AB2F5"], layers: [["#8FA8F2", "#6E86E6"], ["#6C7FE0", "#5161CE"], ["#5A55C9", "#4338A8"], ["#4A3299", "#35227A"], ["#2C1A63", "#1C1046"]] },
  aurora: { sky: ["#0B1E33", "#123A4A"], layers: [["#1E6E6A", "#145650"], ["#1B8E78", "#11705C"], ["#147A68", "#0D5A4C"], ["#0E5A50", "#09413A"], ["#08352F", "#052420"]], sun: "#7DF2C9" },
  dusk: { sky: ["#F7C6D9", "#B9A6F2"], layers: [["#B492EC", "#9776DD"], ["#9268D6", "#7550C2"], ["#7444B5", "#5A3197"], ["#552C8F", "#3F1F70"], ["#36195C", "#240F40"]], sun: "#FFE3EE" },
};
const RIDGES = [
  "M0 560C220 470 420 520 640 470S1080 380 1300 430 1520 470 1600 450V1000H0Z",
  "M0 650C260 560 520 640 760 580S1180 500 1600 560V1000H0Z",
  "M0 730C300 660 560 740 860 690S1300 610 1600 680V1000H0Z",
  "M0 820C240 770 520 830 820 790S1320 730 1600 790V1000H0Z",
  "M0 900C320 860 640 920 940 885S1380 840 1600 880V1000H0Z",
];

function HillsArt({ id }: { id: (typeof MAC_WALLPAPERS)[number] }) {
  const w = HILLS[id];
  const g = `wp-${id}`;
  return (
    <svg className="wd-wall" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={`${g}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={w.sky[0]} />
          <stop offset="1" stopColor={w.sky[1]} />
        </linearGradient>
        {w.layers.map(([a, b], i) => (
          <linearGradient key={i} id={`${g}-l${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} />
          </linearGradient>
        ))}
        {w.sun ? (
          <radialGradient id={`${g}-sun`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor={w.sun} stopOpacity=".95" />
            <stop offset="1" stopColor={w.sun} stopOpacity="0" />
          </radialGradient>
        ) : null}
      </defs>
      <rect width="1600" height="1000" fill={`url(#${g}-sky)`} />
      {w.sun ? <circle cx="1160" cy="330" r="260" fill={`url(#${g}-sun)`} /> : null}
      {RIDGES.map((d, i) => (
        <path key={i} d={d} fill={`url(#${g}-l${i})`} className="wd-wall__ridge" style={{ animationDelay: `${i * 0.8}s` }} />
      ))}
    </svg>
  );
}

type Way = { bg: [string, string, string]; petal: [string, string][]; glow: string };
const WAYS: Record<(typeof WALLPAPERS)[number], Way> = {
  bloom: {
    bg: ["#E9F2FC", "#C8DDF5", "#9FC0EA"],
    petal: [
      ["#0F5FD8", "#78B4FF"],
      ["#1A6FE8", "#A7CFFF"],
      ["#0B4FBF", "#5C9BF5"],
      ["#2A84F2", "#C3DEFF"],
      ["#0E57CC", "#6FAEFF"],
      ["#3B8EF5", "#D5E8FF"],
    ],
    glow: "#FFFFFF",
  },
  night: {
    bg: ["#0B1430", "#0A1A44", "#050A1C"],
    petal: [
      ["#2B5CFF", "#7AA2FF"],
      ["#5B3BF0", "#A48BFF"],
      ["#1E46D8", "#5E8CFF"],
      ["#7A4CF5", "#C2AEFF"],
      ["#2C64F0", "#86B0FF"],
      ["#4B57F2", "#B5C2FF"],
    ],
    glow: "#8FB3FF",
  },
  glow: {
    bg: ["#FFF1E6", "#FBD3C4", "#E9A9C2"],
    petal: [
      ["#E8476B", "#FFB199"],
      ["#F27B3D", "#FFD39A"],
      ["#C9378A", "#FF9CC6"],
      ["#F59E3D", "#FFE2A8"],
      ["#D9456F", "#FFB3B8"],
      ["#B7489C", "#F7A6E0"],
    ],
    glow: "#FFF6E8",
  },
  lexgo: {
    bg: ["#10264F", "#0B1F45", "#06132E"],
    petal: [
      ["#1D5BE0", "#5E9BFF"],
      ["#D9A400", "#FFD86B"],
      ["#2F7CF6", "#8FC0FF"],
      ["#E0B53A", "#FFE7A3"],
      ["#1747B8", "#4D86F0"],
      ["#3C8BFF", "#B8D7FF"],
    ],
    glow: "#FFE7A3",
  },
};

// Six ribbons fanned around the centre, each a curved blade folding back on itself.
const ANGLES = [-62, -28, 6, 40, 74, 108];

export default function Wallpaper({ id }: { id: WallpaperId }) {
  if (id in HILLS) return <HillsArt id={id as (typeof MAC_WALLPAPERS)[number]} />;
  const w = WAYS[id as (typeof WALLPAPERS)[number]];
  const g = `wp-${id}`;
  return (
    <svg className="wd-wall" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id={`${g}-bg`} cx="58%" cy="52%" r="85%">
          <stop offset="0" stopColor={w.bg[0]} />
          <stop offset=".55" stopColor={w.bg[1]} />
          <stop offset="1" stopColor={w.bg[2]} />
        </radialGradient>
        {w.petal.map(([a, b], i) => (
          <linearGradient key={i} id={`${g}-p${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} stopOpacity=".55" />
          </linearGradient>
        ))}
        <radialGradient id={`${g}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={w.glow} stopOpacity=".9" />
          <stop offset="1" stopColor={w.glow} stopOpacity="0" />
        </radialGradient>
        <filter id={`${g}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <rect width="1600" height="1000" fill={`url(#${g}-bg)`} />
      <g transform="translate(930 560)">
        {ANGLES.map((a, i) => (
          <g key={a} transform={`rotate(${a})`} className="wd-wall__petal" style={{ animationDelay: `${i * 0.6}s` }}>
            <path d="M0 0C90-150 330-210 520-150C400-120 250-60 0 0Z" fill={`url(#${g}-p${i})`} opacity=".88" filter={`url(#${g}-soft)`} />
            <path d="M0 0C140-70 360-90 520-150C380-30 200 20 0 0Z" fill={`url(#${g}-p${(i + 2) % 6})`} opacity=".62" />
          </g>
        ))}
        <circle r="150" fill={`url(#${g}-glow)`} opacity=".7" />
      </g>
    </svg>
  );
}
