"use client";

// The desktop's wallpaper: a bloom of translucent ribbons opening from a
// point, in the spirit of a modern desktop's default picture, drawn here
// rather than copied. Four colourways; the choice is the viewer's.

export const WALLPAPERS = ["bloom", "night", "glow", "lexgo"] as const;
export type WallpaperId = (typeof WALLPAPERS)[number];

type Way = { bg: [string, string, string]; petal: [string, string][]; glow: string };
const WAYS: Record<WallpaperId, Way> = {
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
  const w = WAYS[id];
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
