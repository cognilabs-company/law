"use client";

import { memo } from "react";
import { ROOMS, type OfficeRoom } from "@/lib/liveOffice/model";
import { HALL, ROOM_D, ROOM_W, VIEW, WALL_H, WORLD_X, WORLD_Y, box, onWallX, onWallY, project, pts, roomOrigin } from "@/lib/liveOffice/iso";

// The building itself: a slab, hallways, and nine cut-away rooms, each
// furnished for what happens there. Colours of floors and walls come from
// CSS tokens (light/dark); furniture keeps its own colours and is dimmed in
// dark mode as a group.

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)));
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function Box({ at, size, color }: { at: [number, number, number]; size: [number, number, number]; color: string }) {
  const b = box(at[0], at[1], at[2], size[0], size[1], size[2]);
  return (
    <g>
      <polygon points={b.right} fill={shade(color, -0.2)} />
      <polygon points={b.left} fill={color} />
      <polygon points={b.top} fill={shade(color, 0.16)} />
    </g>
  );
}

function Plant({ x, y }: { x: number; y: number }) {
  const [a, b] = project(x + 0.35, y + 0.35, 1.05);
  return (
    <g>
      <Box at={[x, y, 0]} size={[0.7, 0.7, 0.55]} color="#E9A23B" />
      <circle cx={a - 7} cy={b + 2} r={9} fill="#22A06B" />
      <circle cx={a + 7} cy={b + 1} r={9} fill="#2CB67D" />
      <circle cx={a} cy={b - 8} r={10} fill="#34D399" />
    </g>
  );
}

// Text painted along a back wall (plane y = const), so the room's name reads
// like a sign on its wall.
function WallText({ x, y, z, children, size = 13, className }: { x: number; y: number; z: number; children: string; size?: number; className?: string }) {
  const [tx, ty] = project(x, y, z);
  return (
    <text className={className} transform={`matrix(0.866 0.5 0 1 ${tx.toFixed(1)} ${ty.toFixed(1)})`} fontSize={size}>
      {children}
    </text>
  );
}

function Books({ x, y, z, w }: { x: number; y: number; z: number; w: number }) {
  const colors = ["#3B82F6", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6", "#0EA5E9", "#F97316"];
  const out = [];
  for (let i = 0, a = x + 0.1; a < x + w - 0.3; i++) {
    const t = 0.18 + ((i * 7) % 3) * 0.06;
    out.push(<polygon key={i} points={onWallY(y, a, a + t, z, z + 0.42 + ((i * 5) % 3) * 0.06)} fill={colors[i % colors.length]} />);
    a += t + 0.04;
  }
  return <g>{out}</g>;
}

function Furniture({ room: r }: { room: OfficeRoom }) {
  const [x0, y0] = roomOrigin(r);
  const B = (lx: number, ly: number, z: number, w: number, d: number, h: number, color: string, key?: string) => (
    <Box key={key} at={[x0 + lx, y0 + ly, z]} size={[w, d, h]} color={color} />
  );
  const WY = (a: number, b: number, z1: number, z2: number, fill: string, cls?: string, key?: string) => (
    <polygon key={key} className={cls} points={onWallY(y0, x0 + a, x0 + b, z1, z2)} fill={fill} />
  );
  const WX = (a: number, b: number, z1: number, z2: number, fill: string, cls?: string, key?: string) => (
    <polygon key={key} className={cls} points={onWallX(x0, y0 + a, y0 + b, z1, z2)} fill={fill} />
  );
  switch (r) {
    case "lobby":
      return (
        <g>
          {WY(5.6, 8.8, 0.95, 1.8, "#1668F0")}
          {WY(6.0, 6.6, 1.25, 1.65, "#fff")}
          {WY(6.8, 8.4, 1.4, 1.5, "#BFDBFE")}
          {WX(2.2, 4.6, 0.9, 1.9, "var(--lo-glass)", "lo-glass")}
          <Plant x={x0 + 0.3} y={y0 + 1.2} />
          {B(1.3, 0.7, 0, 3.8, 1.1, 1.05, "#D9B38C")}
          {B(1.2, 0.6, 1.05, 4.0, 1.3, 0.12, "#F8FAFC")}
          {B(2.6, 0.75, 1.17, 0.9, 0.15, 0.6, "#334155")}
          {B(0.3, 4.9, 0, 1.0, 2.6, 0.5, "#5CA8FF")}
          {B(0.3, 4.9, 0.5, 0.35, 2.6, 0.55, "#3B82F6")}
          <polygon points={pts([project(x0 + 4, y0 + ROOM_D - 0.9), project(x0 + 6.2, y0 + ROOM_D - 0.9), project(x0 + 6.2, y0 + ROOM_D), project(x0 + 4, y0 + ROOM_D)])} fill="#F59E0B" opacity=".55" />
        </g>
      );
    case "talk":
      return (
        <g>
          {WY(2.2, 8.0, 0.8, 1.85, "#0F2A55")}
          {WY(2.7, 4.8, 1.45, 1.75, "#E0F2FE")}
          {WY(5.2, 7.5, 1.05, 1.35, "#22D3EE")}
          {WY(3.2, 5.6, 1.05, 1.3, "#93C5FD")}
          {B(0.35, 1.4, 0, 0.75, 0.75, 1.15, "#E2E8F0")}
          {B(0.48, 1.53, 1.15, 0.5, 0.5, 0.55, "#93C5FD")}
          {B(0.3, 4.2, 0, 0.9, 1.8, 0.85, "#CBD5E1")}
          <Plant x={x0 + 8.9} y={y0 + 0.3} />
        </g>
      );
    case "urgent":
      return (
        <g>
          <circle className="lo-siren" cx={project(x0 + 9.6, y0, 1.6)[0]} cy={project(x0 + 9.6, y0, 1.6)[1]} r={8} fill="#EF4444" />
          <circle cx={project(x0 + 2, y0, 1.55)[0]} cy={project(x0 + 2, y0, 1.55)[1]} r={9} fill="#fff" stroke="#94A3B8" strokeWidth="2" />
          <path d={`M${project(x0 + 2, y0, 1.55)[0]} ${project(x0 + 2, y0, 1.55)[1]} v-6 M${project(x0 + 2, y0, 1.55)[0]} ${project(x0 + 2, y0, 1.55)[1]} h5`} stroke="#334155" strokeWidth="1.6" strokeLinecap="round" />
          {B(0.35, 1.2, 0, 0.85, 1.5, 1.55, "#FCA5A5")}
          {WX(1.5, 2.4, 0.6, 1.2, "#fff")}
          {B(6.4, 0.4, 0, 3.0, 0.8, 0.45, "#94A3B8")}
          {B(6.4, 0.4, 0.45, 3.0, 0.25, 0.5, "#64748B")}
        </g>
      );
    case "documents":
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              {B(1.2 + i * 2.7, 0.2, 0, 2.5, 0.8, 1.85, "#C08A5B")}
              <Books x={x0 + 1.2 + i * 2.7} y={y0 + 1.0} z={0.15} w={2.5} />
              <Books x={x0 + 1.4 + i * 2.7} y={y0 + 1.0} z={0.74} w={2.3} />
              <Books x={x0 + 1.2 + i * 2.7} y={y0 + 1.0} z={1.32} w={2.4} />
            </g>
          ))}
          {B(0.2, 2.6, 0, 0.9, 1.0, 1.3, "#94A3B8")}
          {B(0.2, 3.7, 0, 0.9, 1.0, 1.3, "#94A3B8")}
          {B(0.25, 2.75, 1.3, 0.8, 0.75, 0.35, "#E2E8F0")}
        </g>
      );
    case "desk":
      return (
        <g>
          {WY(1.3, 6.7, 0.75, 1.85, "#FFFFFF", "lo-board")}
          {[0, 1, 2].map((c) =>
            [0, 1, 2].map((k) => WY(1.6 + c * 1.75, 2.6 + c * 1.75, 1.6 - k * 0.32, 1.85 - k * 0.32, ["#FDE68A", "#FBCFE8", "#BBF7D0", "#BFDBFE"][(c + k) % 4], undefined, `n${c}${k}`)),
          )}
          {WX(2.0, 3.5, 1.2, 2.0, "#fff")}
          {WX(2.0, 3.5, 1.8, 2.0, "#EF4444")}
          {B(7.6, 0.6, 0, 1.7, 1.1, 0.75, "#D9B38C")}
          <Plant x={x0 + 0.3} y={y0 + 5.6} />
        </g>
      );
    case "ai":
      return (
        <g>
          {[0, 1].map((i) => (
            <g key={i}>
              {B(0.9 + i * 1.5, 0.25, 0, 1.2, 0.9, 1.85, "#1E293B")}
              {[0.3, 0.6, 0.9, 1.2, 1.5].map((z, k) => (
                <polygon key={k} className="lo-led" style={{ animationDelay: `${(i * 5 + k) * 0.23}s` }} points={onWallY(y0 + 1.15, x0 + 1.0 + i * 1.5, x0 + 1.9 + i * 1.5, z, z + 0.07)} fill="#60A5FA" />
              ))}
            </g>
          ))}
          {WY(4.6, 8.8, 0.8, 1.85, "url(#lo-ai)")}
          <WallText x={x0 + 5.9} y={y0} z={1.12} size={20} className="lo-wall-ai">
            AI
          </WallText>
          <Plant x={x0 + 0.3} y={y0 + 5.8} />
        </g>
      );
    case "market":
      return (
        <g>
          {B(1.0, 0.2, 0, 3.8, 0.9, 1.85, "#E2E8F0")}
          {[0, 1, 2, 3].map((i) => B(1.15 + i * 0.92, 0.32, 0.05, 0.7, 0.62, 0.5, ["#F59E0B", "#3B82F6", "#10B981", "#EC4899"][i], `a${i}`))}
          {[0, 1, 2].map((i) => B(1.4 + i * 1.1, 0.32, 0.95, 0.8, 0.62, 0.45, ["#8B5CF6", "#F97316", "#06B6D4"][i], `b${i}`))}
          {WY(5.6, 8.6, 1.15, 1.8, "#16A34A")}
          {WY(5.9, 7.4, 1.35, 1.6, "#DCFCE7")}
          {B(0.3, 3.3, 0, 1.1, 2.4, 0.95, "#86EFAC")}
          {B(0.5, 3.8, 0.95, 0.45, 0.55, 0.22, "#334155")}
        </g>
      );
    case "studio":
      return (
        <g>
          {WY(1.3, 5.2, 0.7, 1.85, "#FFFBEB")}
          {WY(1.7, 2.9, 1.2, 1.75, "#F472B6")}
          {WY(3.2, 4.8, 1.0, 1.4, "#60A5FA")}
          {WY(3.4, 4.2, 1.5, 1.85, "#FBBF24")}
          {["#EF4444", "#F59E0B", "#10B981", "#3B82F6"].map((c, i) => WX(2.0 + i * 0.75, 2.6 + i * 0.75, 1.1, 1.6, c, undefined, `s${i}`))}
          {B(6.3, 0.5, 0, 2.6, 0.9, 0.85, "#CBD5E1")}
          {B(6.8, 0.65, 0.85, 1.6, 0.14, 0.95, "#1E293B")}
          <Plant x={x0 + 9.0} y={y0 + 0.4} />
        </g>
      );
    case "admin":
      return (
        <g>
          {B(1.0, 0.2, 0, 3.4, 0.8, 1.85, "#8B5E3C")}
          <Books x={x0 + 1.0} y={y0 + 1.0} z={0.2} w={3.4} />
          <Books x={x0 + 1.1} y={y0 + 1.0} z={0.74} w={3.2} />
          <Books x={x0 + 1.0} y={y0 + 1.0} z={1.32} w={3.3} />
          {WX(2.0, 3.3, 1.1, 1.9, "#D4A017")}
          {WX(2.12, 3.18, 1.18, 1.82, "#FFFDF5")}
          {WY(5.4, 8.6, 0.9, 1.85, "var(--lo-glass)", "lo-glass")}
          {B(0.3, 5.6, 0, 0.95, 0.95, 1.05, "#64748B")}
          <Plant x={x0 + 9.0} y={y0 + 0.4} />
        </g>
      );
  }
}

function Room({ room: r, label, count }: { room: OfficeRoom; label: string; count: number }) {
  const [x0, y0] = roomOrigin(r);
  const T = 0.25;
  const floor = box(x0, y0, 0, ROOM_W, ROOM_D, 0).top;
  const backY = box(x0, y0 - T, 0, ROOM_W, T, WALL_H);
  const backX = box(x0 - T, y0 - T, 0, T, ROOM_D + T, WALL_H);
  const tiles = [];
  for (let i = 2; i < ROOM_W; i += 2) tiles.push(pts([project(x0 + i, y0), project(x0 + i, y0 + ROOM_D)]));
  for (let j = 2; j < ROOM_D; j += 2) tiles.push(pts([project(x0, y0 + j), project(x0 + ROOM_W, y0 + j)]));
  const [bx, by] = project(x0 + 0.75, y0, 2.15);
  return (
    <g className={`lo-r lo-r--${r}`} data-room={r}>
      <polygon className="lo-r__floor" points={floor} />
      {tiles.map((t, i) => (
        <polyline key={i} className="lo-r__tile" points={t} />
      ))}
      <polygon className="lo-wall-b" points={backX.right} />
      <polygon className="lo-wall-cap" points={backX.top} />
      <polygon className="lo-wall-a" points={backY.left} />
      <polygon className="lo-wall-cap" points={backY.top} />
      <polygon className="lo-r__base" points={onWallY(y0, x0, x0 + ROOM_W, 0, 0.22)} />
      <polygon className="lo-r__base lo-r__base--x" points={onWallX(x0, y0, y0 + ROOM_D, 0, 0.22)} />
      <g className="lo-furn">
        <Furniture room={r} />
      </g>
      <WallText x={x0 + 1.5} y={y0} z={1.98} size={11.5} className="lo-wall-name">
        {label.toUpperCase()}
      </WallText>
      <g className={`lo-r__n${count ? " is-on" : ""}`}>
        <circle cx={bx} cy={by} r={11} />
        <text x={bx} y={by + 4} textAnchor="middle">
          {count}
        </text>
      </g>
    </g>
  );
}

function IsoBuildingImpl({ labels, counts }: { labels: Record<OfficeRoom, string>; counts: Record<OfficeRoom, number> }) {
  const slab = box(-0.8, -0.8, -VIEW.slab, WORLD_X + 0.8, WORLD_Y + 0.8, VIEW.slab);
  const lines: string[] = [];
  for (let row = 0; row < 3; row++) {
    const y = row * (ROOM_D + HALL) + ROOM_D + HALL / 2;
    lines.push(pts([project(0.4, y), project(WORLD_X - 0.4, y)]));
  }
  for (let c = 0; c < 3; c++) {
    const x = c * (ROOM_W + HALL) + ROOM_W + HALL / 2;
    lines.push(pts([project(x, 0.4), project(x, WORLD_Y - 0.4)]));
  }
  return (
    <>
      <defs>
        <linearGradient id="lo-ai" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <polygon className="lo-slab-r" points={slab.right} />
      <polygon className="lo-slab-l" points={slab.left} />
      <polygon className="lo-slab-t" points={slab.top} />
      {lines.map((l, i) => (
        <polyline key={i} className="lo-hall-line" points={l} />
      ))}
      {ROOMS.map((r) => (
        <Room key={r} room={r} label={labels[r]} count={counts[r]} />
      ))}
    </>
  );
}

const IsoBuilding = memo(IsoBuildingImpl);
export default IsoBuilding;
