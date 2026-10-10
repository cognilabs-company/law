"use client";

import { ROOMS, type OfficeRoom } from "@/lib/liveOffice/model";
import { FRONT_ROW, HALL, ROOM_D, ROOM_W, U, VIEW, WALL_H, WORLD_X, WORLD_Y, box, doorOf, onWallX, onWallY, project, pts, roomOrigin, seatOf } from "@/lib/liveOffice/iso";
import { DeskFront, FIG_VIEW } from "./Character";
import { ROOM_ART } from "./text";

// The building: a slab with tiled hallways and carpet runners, and nine
// rooms seen as cut-aways — two back walls with the room's name and its
// LexGo icon framed like a poster, furniture that says what the room is for,
// free desks waiting, and a glass front with a door onto the hallway.
// Floors and walls follow the light/dark tokens; furniture keeps its own
// colours and is dimmed in dark mode as a group.

export const FIG_W = 3.0 * U;
export const FIG_H = (FIG_W * FIG_VIEW.h) / FIG_VIEW.w;
export const FIG_FOOT = 0.93; // where the feet / desk base sit in the figure box

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

// A vertical cylinder (pot, core, cooler bottle): ellipse top over a body.
function Cylinder({ x, y, z, r, h, color }: { x: number; y: number; z: number; r: number; h: number; color: string }) {
  const [bx, by] = project(x, y, z);
  const [, ty] = project(x, y, z + h);
  const rx = r * U * 1.22;
  const ry = r * U * 0.7;
  return (
    <g>
      <path d={`M${bx - rx} ${ty} V${by} A${rx} ${ry} 0 0 0 ${bx + rx} ${by} V${ty} Z`} fill={shade(color, -0.12)} />
      <ellipse cx={bx} cy={ty} rx={rx} ry={ry} fill={shade(color, 0.18)} />
    </g>
  );
}

function Plant({ x, y, big = false }: { x: number; y: number; big?: boolean }) {
  const k = big ? 1.35 : 1;
  const [a, b] = project(x + 0.35, y + 0.35, 0.55 + 0.6 * k);
  return (
    <g>
      <Cylinder x={x + 0.35} y={y + 0.35} z={0} r={0.36} h={0.55} color="#E9A23B" />
      <circle cx={a - 7 * k} cy={b + 3} r={8.5 * k} fill="#1F9D66" />
      <circle cx={a + 7 * k} cy={b + 2} r={8.5 * k} fill="#27B079" />
      <circle cx={a} cy={b - 7 * k} r={9.5 * k} fill="#34D399" />
      <circle cx={a - 3 * k} cy={b - 2} r={5 * k} fill="#6EE7B7" opacity=".7" />
    </g>
  );
}

function Chair({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <Box at={[x, y, 0.42]} size={[0.75, 0.75, 0.12]} color="#475569" />
      <Box at={[x, y, 0.54]} size={[0.75, 0.15, 0.6]} color="#334155" />
      <Box at={[x + 0.32, y + 0.32, 0]} size={[0.1, 0.1, 0.42]} color="#64748B" />
    </g>
  );
}

// Painted along a wall plane y = const (runs down-right on screen).
function WallText({ x, y, z, children, size = 13, className }: { x: number; y: number; z: number; children: string; size?: number; className?: string }) {
  const [tx, ty] = project(x, y, z);
  return (
    <text className={className} transform={`matrix(0.866 0.5 0 1 ${tx.toFixed(1)} ${ty.toFixed(1)})`} fontSize={size}>
      {children}
    </text>
  );
}

// The room's LexGo icon in a frame on the back wall.
function Poster({ r, x, y, z }: { r: OfficeRoom; x: number; y: number; z: number }) {
  const [tx, ty] = project(x, y, z);
  const s = 1.55 * U;
  return (
    <g transform={`matrix(0.866 0.5 0 1 ${tx.toFixed(1)} ${ty.toFixed(1)})`}>
      <rect x={-3} y={-s - 3} width={s + 6} height={s + 6} rx="3" className="lo-poster" />
      <image href={ROOM_ART[r]} x={0} y={-s} width={s} height={s} preserveAspectRatio="xMidYMid meet" />
    </g>
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
  const win = (a: number, b: number) => (
    <g>
      {WX(a, b, 0.75, 1.85, "url(#lo-sky)")}
      {WX(a, b, 0.75, 0.82, "#fff")}
      {WX(a, b, 1.78, 1.85, "#fff")}
      {WX((a + b) / 2 - 0.04, (a + b) / 2 + 0.04, 0.75, 1.85, "#fff")}
    </g>
  );
  switch (r) {
    case "lobby":
      return (
        <g>
          {win(2.4, 4.6)}
          <Plant x={x0 + 0.3} y={y0 + 1.1} big />
          {B(3.0, 0.8, 0, 4.2, 1.1, 1.0, "#E7EEF8")}
          <polygon points={pts([project(x0 + 3.0, y0 + 1.9, 0.35), project(x0 + 7.2, y0 + 1.9, 0.35), project(x0 + 7.2, y0 + 1.9, 0.7), project(x0 + 3.0, y0 + 1.9, 0.7)])} fill="#1668F0" />
          <WallText x={x0 + 4.0} y={y0 + 1.9} z={0.42} size={11} className="lo-logo-text">
            LexGo
          </WallText>
          {B(2.9, 0.7, 1.0, 4.4, 1.3, 0.12, "#FFFFFF")}
          {B(4.4, 0.85, 1.12, 1.0, 0.14, 0.62, "#334155")}
          {B(6.0, 1.1, 1.12, 0.5, 0.35, 0.18, "#F59E0B")}
          {B(0.3, 5.0, 0, 1.05, 2.8, 0.5, "#5CA8FF")}
          {B(0.3, 5.0, 0.5, 0.32, 2.8, 0.6, "#3B82F6")}
          {B(0.4, 5.3, 0.5, 0.6, 0.9, 0.2, "#BFDBFE")}
          {B(0.4, 6.6, 0.5, 0.6, 0.9, 0.2, "#BFDBFE")}
          {B(1.9, 5.7, 0, 1.3, 1.2, 0.38, "#D9B38C")}
          {B(2.1, 5.9, 0.38, 0.6, 0.45, 0.05, "#F43F5E")}
          <polygon points={pts([project(x0 + 1.6, y0 + 4.4), project(x0 + 4.2, y0 + 4.4), project(x0 + 4.2, y0 + 8.2), project(x0 + 1.6, y0 + 8.2)])} fill="#F59E0B" opacity=".18" />
        </g>
      );
    case "talk":
      return (
        <g>
          {WY(4.2, 9.6, 0.75, 1.75, "#0F2A55")}
          {WY(4.6, 6.6, 1.3, 1.6, "#E0F2FE")}
          {WY(7.0, 9.2, 0.95, 1.25, "#22D3EE")}
          {WY(5.0, 7.4, 0.92, 1.18, "#93C5FD")}
          {WY(8.0, 9.3, 1.4, 1.62, "#FDE68A")}
          <Cylinder x={x0 + 0.75} y={y0 + 1.9} z={0} r={0.38} h={1.05} color="#E2E8F0" />
          <Cylinder x={x0 + 0.75} y={y0 + 1.9} z={1.05} r={0.3} h={0.55} color="#93C5FD" />
          {B(0.3, 4.3, 0, 0.95, 2.0, 0.9, "#CBD5E1")}
          {B(0.4, 4.6, 0.9, 0.7, 0.55, 0.32, "#1E293B")}
          <Plant x={x0 + 0.35} y={y0 + 7.2} />
        </g>
      );
    case "urgent":
      return (
        <g>
          <circle className="lo-siren" cx={project(x0 + 9.8, y0, 1.6)[0]} cy={project(x0 + 9.8, y0, 1.6)[1]} r={9} fill="#EF4444" />
          {WY(4.4, 7.6, 0.95, 1.75, "#DC2626")}
          <WallText x={x0 + 4.85} y={y0} z={1.12} size={15} className="lo-sos">
            SOS
          </WallText>
          <circle cx={project(x0 + 8.5, y0, 1.35)[0]} cy={project(x0 + 8.5, y0, 1.35)[1]} r={9} fill="#fff" stroke="#94A3B8" strokeWidth="2" />
          <path d={`M${project(x0 + 8.5, y0, 1.35)[0]} ${project(x0 + 8.5, y0, 1.35)[1]} v-6 M${project(x0 + 8.5, y0, 1.35)[0]} ${project(x0 + 8.5, y0, 1.35)[1]} h5`} stroke="#334155" strokeWidth="1.6" strokeLinecap="round" />
          {B(0.3, 1.2, 0, 0.9, 1.6, 1.5, "#FFFFFF")}
          <polygon points={pts([project(x0 + 0.42, y0 + 2.8, 0.55), project(x0 + 1.08, y0 + 2.8, 0.55), project(x0 + 1.08, y0 + 2.8, 1.25), project(x0 + 0.42, y0 + 2.8, 1.25)])} fill="#FEE2E2" />
          <polygon points={pts([project(x0 + 0.68, y0 + 2.8, 0.62), project(x0 + 0.82, y0 + 2.8, 0.62), project(x0 + 0.82, y0 + 2.8, 1.18), project(x0 + 0.68, y0 + 2.8, 1.18)])} fill="#EF4444" />
          <polygon points={pts([project(x0 + 0.5, y0 + 2.8, 0.83), project(x0 + 1.0, y0 + 2.8, 0.83), project(x0 + 1.0, y0 + 2.8, 0.97), project(x0 + 0.5, y0 + 2.8, 0.97)])} fill="#EF4444" />
          {B(0.3, 4.6, 0, 0.85, 3.0, 0.42, "#94A3B8")}
          {B(0.3, 4.6, 0.42, 0.25, 3.0, 0.5, "#64748B")}
        </g>
      );
    case "documents":
      return (
        <g>
          {[0, 1].map((i) => (
            <g key={i}>
              {B(4.2 + i * 2.8, 0.2, 0, 2.6, 0.8, 1.85, "#B9845A")}
              <Books x={x0 + 4.2 + i * 2.8} y={y0 + 1.0} z={0.15} w={2.6} />
              <Books x={x0 + 4.4 + i * 2.8} y={y0 + 1.0} z={0.74} w={2.4} />
              <Books x={x0 + 4.2 + i * 2.8} y={y0 + 1.0} z={1.32} w={2.5} />
            </g>
          ))}
          {[0, 1].map((i) => (
            <g key={`c${i}`}>
              {B(0.2, 1.4 + i * 1.15, 0, 0.95, 1.05, 1.35, "#94A3B8")}
              {[0.25, 0.7, 1.12].map((z, k) => (
                <polygon key={k} points={pts([project(x0 + 1.15, y0 + 1.5 + i * 1.15, z), project(x0 + 1.15, y0 + 2.35 + i * 1.15, z), project(x0 + 1.15, y0 + 2.35 + i * 1.15, z + 0.04), project(x0 + 1.15, y0 + 1.5 + i * 1.15, z + 0.04)])} fill="#475569" />
              ))}
            </g>
          ))}
          {B(0.25, 1.5, 1.35, 0.85, 0.8, 0.32, "#E2E8F0")}
          {B(0.4, 1.7, 1.67, 0.5, 0.45, 0.04, "#FFFFFF")}
          {B(0.3, 4.2, 0, 0.9, 1.4, 0.75, "#D9B38C")}
          {["#F59E0B", "#3B82F6", "#10B981"].map((c, i) => B(0.4, 4.35 + i * 0.4, 0.75, 0.65, 0.32, 0.1 + i * 0.05, c, `f${i}`))}
        </g>
      );
    case "desk":
      return (
        <g>
          {WY(3.8, 9.6, 0.75, 1.8, "#FFFFFF", "lo-board")}
          {["#E2E8F0", "#E2E8F0", "#E2E8F0"].map((c, i) => WY(4.1 + i * 1.85, 5.6 + i * 1.85, 1.62, 1.72, c, undefined, `h${i}`))}
          {[0, 1, 2].map((c) => [0, 1, 2].map((k) => (c === 2 && k === 2 ? null : WY(4.2 + c * 1.85, 5.1 + c * 1.85, 1.3 - k * 0.27, 1.52 - k * 0.27, ["#FDE68A", "#FBCFE8", "#BBF7D0", "#BFDBFE"][(c + k) % 4], undefined, `n${c}${k}`))))}
          {WX(1.4, 2.8, 1.1, 1.85, "#fff")}
          {WX(1.4, 2.8, 1.7, 1.85, "#EF4444")}
          {WX(4.2, 5.4, 1.0, 1.7, "#F8FAFC")}
          <circle cx={project(x0, y0 + 4.8, 1.35)[0]} cy={project(x0, y0 + 4.8, 1.35)[1]} r={6} fill="none" stroke="#64748B" strokeWidth="1.4" />
          <Cylinder x={x0 + 1.4} y={y0 + 6.9} z={0} r={0.12} h={0.7} color="#94A3B8" />
          <Cylinder x={x0 + 1.4} y={y0 + 6.9} z={0.7} r={0.8} h={0.08} color="#D9B38C" />
          <Chair x={x0 + 0.3} y={y0 + 6.5} />
          <Chair x={x0 + 1.05} y={y0 + 7.95} />
        </g>
      );
    case "ai":
      return (
        <g>
          {[0, 1].map((i) => (
            <g key={i}>
              {B(0.25, 1.3 + i * 1.45, 0, 0.9, 1.2, 1.85, "#1E293B")}
              {[0.3, 0.6, 0.9, 1.2, 1.5].map((z, k) => (
                <polygon key={k} className="lo-led" style={{ animationDelay: `${(i * 5 + k) * 0.23}s` }} points={onWallX(x0 + 1.15, y0 + 1.42 + i * 1.45, y0 + 2.38 + i * 1.45, z, z + 0.07)} fill={k % 2 ? "#22D3EE" : "#60A5FA"} />
              ))}
            </g>
          ))}
          {WY(4.6, 9.6, 0.75, 1.8, "url(#lo-ai)")}
          <WallText x={x0 + 6.2} y={y0} z={1.02} size={20} className="lo-wall-ai">
            AI
          </WallText>
          <path d={`M${project(x0 + 8.0, y0, 1.6)[0]} ${project(x0 + 8.0, y0, 1.6)[1]} l10 6 l8 -8 l9 9`} fill="none" stroke="#A5F3FC" strokeWidth="1.4" opacity=".8" />
          <g className="lo-core">
            <Cylinder x={x0 + 1.0} y={y0 + 5.6} z={0} r={0.55} h={0.25} color="#334155" />
            <Cylinder x={x0 + 1.0} y={y0 + 5.6} z={0.25} r={0.32} h={1.15} color="#22D3EE" />
            <Cylinder x={x0 + 1.0} y={y0 + 5.6} z={1.4} r={0.55} h={0.18} color="#334155" />
          </g>
        </g>
      );
    case "market":
      return (
        <g>
          {B(4.0, 0.2, 0, 4.0, 0.9, 1.8, "#E2E8F0")}
          {B(4.0, 0.2, 0.85, 4.0, 0.9, 0.06, "#CBD5E1")}
          {[0, 1, 2, 3].map((i) => B(4.15 + i * 0.95, 0.32, 0.05, 0.72, 0.62, 0.5, ["#F59E0B", "#3B82F6", "#10B981", "#EC4899"][i], `a${i}`))}
          {[0, 1, 2].map((i) => B(4.4 + i * 1.15, 0.32, 0.92, 0.8, 0.62, 0.45, ["#8B5CF6", "#F97316", "#06B6D4"][i], `b${i}`))}
          {WY(8.6, 10.4, 1.0, 1.7, "#16A34A")}
          <WallText x={x0 + 9.05} y={y0} z={1.13} size={15} className="lo-sale">
            %
          </WallText>
          {B(0.3, 1.4, 0, 1.15, 2.6, 0.95, "#86EFAC")}
          {B(0.3, 1.4, 0.95, 1.15, 2.6, 0.08, "#F8FAFC")}
          {B(0.5, 1.8, 1.03, 0.45, 0.55, 0.25, "#334155")}
          {B(0.55, 3.1, 1.03, 0.6, 0.5, 0.3, "#FBBF24")}
          {B(0.35, 5.6, 0, 0.8, 0.8, 0.6, "#D9A066")}
          {B(0.45, 5.7, 0.6, 0.6, 0.6, 0.45, "#E7B57A")}
        </g>
      );
    case "studio":
      return (
        <g>
          {WY(3.9, 7.6, 0.7, 1.8, "#FFFBEB")}
          {WY(4.2, 5.4, 1.15, 1.65, "#F472B6")}
          {WY(5.7, 7.2, 0.95, 1.35, "#60A5FA")}
          {WY(5.9, 6.7, 1.45, 1.7, "#FBBF24")}
          {["#EF4444", "#F59E0B", "#10B981", "#3B82F6"].map((c, i) => WX(1.6 + i * 0.7, 2.2 + i * 0.7, 1.15, 1.6, c, undefined, `s${i}`))}
          {B(7.9, 0.5, 0, 2.4, 0.9, 0.8, "#CBD5E1")}
          {B(8.3, 0.65, 0.8, 1.6, 0.14, 0.95, "#1E293B")}
          {B(8.4, 0.62, 0.9, 1.4, 0.04, 0.75, "#6366F1")}
          {B(0.6, 5.2, 0, 0.1, 0.1, 1.5, "#92400E")}
          {B(1.3, 5.2, 0, 0.1, 0.1, 1.5, "#92400E")}
          {B(0.5, 5.15, 0.75, 1.0, 0.12, 0.85, "#FFFFFF")}
          {B(0.6, 5.12, 0.95, 0.4, 0.1, 0.3, "#F472B6")}
          <Cylinder x={x0 + 0.8} y={y0 + 7.4} z={0} r={0.55} h={0.4} color="#A78BFA" />
        </g>
      );
    case "admin":
      return (
        <g>
          {B(4.0, 0.2, 0, 3.4, 0.8, 1.85, "#8B5E3C")}
          <Books x={x0 + 4.0} y={y0 + 1.0} z={0.2} w={3.4} />
          <Books x={x0 + 4.1} y={y0 + 1.0} z={0.74} w={3.2} />
          <Books x={x0 + 4.0} y={y0 + 1.0} z={1.32} w={3.3} />
          {WX(1.5, 2.8, 1.05, 1.8, "#D4A017")}
          {WX(1.62, 2.68, 1.12, 1.73, "#FFFDF5")}
          {WX(3.2, 4.5, 1.05, 1.8, "#D4A017")}
          {WX(3.32, 4.38, 1.12, 1.73, "#FFFDF5")}
          {B(0.3, 6.0, 0, 0.95, 0.95, 1.05, "#64748B")}
          <circle cx={project(x0 + 1.25, y0 + 6.45, 0.55)[0]} cy={project(x0 + 1.25, y0 + 6.45, 0.55)[1]} r={4} fill="#CBD5E1" />
          {B(8.2, 0.4, 0, 0.12, 0.12, 2.0, "#94A3B8")}
          <polygon points={onWallY(y0 + 0.46, x0 + 8.32, x0 + 9.6, 1.45, 1.95)} fill="#1668F0" />
          <polygon points={onWallY(y0 + 0.46, x0 + 8.32, x0 + 9.6, 1.45, 1.62)} fill="#FFFFFF" opacity=".3" />
        </g>
      );
  }
}

function Room({ room: r, label, count, seated }: { room: OfficeRoom; label: string; count: number; seated: number }) {
  const [x0, y0] = roomOrigin(r);
  const T = 0.25;
  const floor = box(x0, y0, 0, ROOM_W, ROOM_D, 0).top;
  const backY = box(x0, y0 - T, 0, ROOM_W, T, WALL_H);
  const backX = box(x0 - T, y0 - T, 0, T, ROOM_D + T, WALL_H);
  const tiles = [];
  for (let i = 1.5; i < ROOM_W; i += 1.5) tiles.push(pts([project(x0 + i, y0), project(x0 + i, y0 + ROOM_D)]));
  for (let j = 1.5; j < ROOM_D; j += 1.5) tiles.push(pts([project(x0, y0 + j), project(x0 + ROOM_W, y0 + j)]));
  const [bx, by] = project(x0 + 0.75, y0, 2.15);
  // Free desks only along the front row, and none at the reception.
  const free = [];
  if (r !== "lobby") for (let i = seated; i < FRONT_ROW; i++) free.push(seatOf(r, i));
  free.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  const door = doorOf(r)[0];
  const GH = 1.9;
  const glassY = (a: number, b: number) => pts([project(a, y0 + ROOM_D, 0), project(b, y0 + ROOM_D, 0), project(b, y0 + ROOM_D, GH), project(a, y0 + ROOM_D, GH)]);
  const glassX = pts([project(x0 + ROOM_W, y0, 0), project(x0 + ROOM_W, y0 + ROOM_D, 0), project(x0 + ROOM_W, y0 + ROOM_D, GH), project(x0 + ROOM_W, y0, GH)]);
  const rail = (a: [number, number, number], b: [number, number, number]) => pts([project(...a), project(...b)]);
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
        <Poster r={r} x={x0 + 1.3} y={y0} z={0.95} />
        <Furniture room={r} />
      </g>
      <WallText x={x0 + 3.6} y={y0} z={2.02} size={11.5} className="lo-wall-name">
        {label.toUpperCase()}
      </WallText>
      <g className={`lo-r__n${count ? " is-on" : ""}`}>
        <circle cx={bx} cy={by} r={11} />
        <text x={bx} y={by + 4} textAnchor="middle">
          {count}
        </text>
      </g>
      {free.map(([wx, wy], i) => {
        const [sx, sy] = project(wx, wy);
        return (
          <svg key={i} className="lo-free" x={sx - FIG_W / 2} y={sy - FIG_H * FIG_FOOT} width={FIG_W} height={FIG_H} viewBox={`0 0 ${FIG_VIEW.w} ${FIG_VIEW.h}`}>
            <DeskFront empty />
          </svg>
        );
      })}
      <g className="lo-glass-front">
        <polygon points={glassY(x0, door - 1.15)} />
        <polygon points={glassY(door + 1.15, x0 + ROOM_W)} />
        <polygon points={glassX} />
      </g>
      <g className="lo-rail">
        <polyline points={rail([x0, y0 + ROOM_D, GH], [door - 1.15, y0 + ROOM_D, GH])} />
        <polyline points={rail([door + 1.15, y0 + ROOM_D, GH], [x0 + ROOM_W, y0 + ROOM_D, GH])} />
        <polyline points={rail([x0 + ROOM_W, y0, GH], [x0 + ROOM_W, y0 + ROOM_D, GH])} />
        <polyline points={rail([x0 + ROOM_W, y0 + ROOM_D, 0], [x0 + ROOM_W, y0 + ROOM_D, GH])} />
        <polyline points={rail([door - 1.15, y0 + ROOM_D, 0], [door - 1.15, y0 + ROOM_D, GH + 0.25])} />
        <polyline points={rail([door + 1.15, y0 + ROOM_D, 0], [door + 1.15, y0 + ROOM_D, GH + 0.25])} />
        <polyline points={rail([door - 1.15, y0 + ROOM_D, GH + 0.25], [door + 1.15, y0 + ROOM_D, GH + 0.25])} />
      </g>
      <polygon className="lo-mat" points={pts([project(door - 0.9, y0 + ROOM_D + 0.1), project(door + 0.9, y0 + ROOM_D + 0.1), project(door + 0.9, y0 + ROOM_D + 0.75), project(door - 0.9, y0 + ROOM_D + 0.75)])} />
    </g>
  );
}

// Hallway life along the front and right outer hallways (inner hallways sit
// behind the next room's walls): plants, benches, a water cooler and a
// coffee corner, all off the walking lines.
function HallDecor() {
  const front = 3 * ROOM_D + 2 * HALL; // outer front hallway starts here (y)
  const right = 3 * ROOM_W + 2 * HALL; // outer right hallway starts here (x)
  const edgeY = front + HALL - 0.85;
  const edgeX = right + HALL - 0.85;
  const items = [];
  for (const x of [0.3, ROOM_W + 0.5, 2 * ROOM_W + HALL + 0.5]) items.push(<Plant key={`pf${x}`} x={x} y={edgeY} />);
  for (const y of [0.4, 2 * ROOM_D + HALL + 0.6]) items.push(<Plant key={`pr${y}`} x={edgeX} y={y} />);
  items.push(<Plant key="corner" x={edgeX} y={edgeY} big />);
  items.push(
    <g key="b1">
      <Box at={[ROOM_W + HALL + 1.0, edgeY + 0.1, 0]} size={[1.9, 0.55, 0.38]} color="#94A3B8" />
      <Box at={[ROOM_W + HALL + 1.0, edgeY + 0.1, 0.38]} size={[1.9, 0.55, 0.08]} color="#C08A5B" />
    </g>,
    <g key="b2">
      <Box at={[edgeX + 0.1, ROOM_D + HALL + 5.5, 0]} size={[0.55, 1.9, 0.38]} color="#94A3B8" />
      <Box at={[edgeX + 0.1, ROOM_D + HALL + 5.5, 0.38]} size={[0.55, 1.9, 0.08]} color="#C08A5B" />
    </g>,
    <g key="cooler">
      <Cylinder x={edgeX + 0.4} y={3.4} z={0} r={0.32} h={0.95} color="#E2E8F0" />
      <Cylinder x={edgeX + 0.4} y={3.4} z={0.95} r={0.26} h={0.5} color="#93C5FD" />
    </g>,
    <g key="coffee">
      <Box at={[edgeX, ROOM_D + HALL + 1.2, 0]} size={[0.85, 2.0, 0.9]} color="#C08A5B" />
      <Box at={[edgeX, ROOM_D + HALL + 1.2, 0.9]} size={[0.85, 2.0, 0.08]} color="#F8FAFC" />
      <Box at={[edgeX + 0.15, ROOM_D + HALL + 1.45, 0.98]} size={[0.55, 0.6, 0.6]} color="#1F2937" />
      <Cylinder x={edgeX + 0.42} y={ROOM_D + HALL + 2.6} z={0.98} r={0.12} h={0.2} color="#FFFFFF" />
    </g>,
    <g key="b3">
      <Box at={[2 * ROOM_W + 2 * HALL + 3.6, edgeY + 0.1, 0]} size={[1.9, 0.55, 0.38]} color="#94A3B8" />
      <Box at={[2 * ROOM_W + 2 * HALL + 3.6, edgeY + 0.1, 0.38]} size={[1.9, 0.55, 0.08]} color="#C08A5B" />
    </g>,
  );
  return <g className="lo-furn">{items}</g>;
}

export default function IsoBuilding({ labels, counts, seated }: { labels: Record<OfficeRoom, string>; counts: Record<OfficeRoom, number>; seated: Record<OfficeRoom, number> }) {
  const slab = box(-0.8, -0.8, -VIEW.slab, WORLD_X + 0.8, WORLD_Y + 0.8, VIEW.slab);
  const tiles: string[] = [];
  for (let x = 0; x <= WORLD_X; x += 1.2) tiles.push(pts([project(x, -0.8), project(x, WORLD_Y)]));
  for (let y = 0; y <= WORLD_Y; y += 1.2) tiles.push(pts([project(-0.8, y), project(WORLD_X, y)]));
  const runners: string[] = [];
  const W2 = 0.55;
  for (let row = 0; row < 3; row++) {
    const y = row * (ROOM_D + HALL) + ROOM_D + HALL / 2;
    runners.push(pts([project(0.2, y - W2), project(WORLD_X - 0.2, y - W2), project(WORLD_X - 0.2, y + W2), project(0.2, y + W2)]));
  }
  for (let c = 0; c < 3; c++) {
    const x = c * (ROOM_W + HALL) + ROOM_W + HALL / 2;
    runners.push(pts([project(x - W2, 0.2), project(x + W2, 0.2), project(x + W2, WORLD_Y - 0.2), project(x - W2, WORLD_Y - 0.2)]));
  }
  return (
    <>
      <defs>
        <linearGradient id="lo-ai" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
        <linearGradient id="lo-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7DD3FC" />
          <stop offset="1" stopColor="#E0F2FE" />
        </linearGradient>
      </defs>
      <polygon className="lo-slab-r" points={slab.right} />
      <polygon className="lo-slab-l" points={slab.left} />
      <polygon className="lo-slab-t" points={slab.top} />
      {tiles.map((t, i) => (
        <polyline key={i} className="lo-hall-tile" points={t} />
      ))}
      {runners.map((r, i) => (
        <polygon key={i} className="lo-runner" points={r} />
      ))}
      <HallDecor />
      {ROOMS.map((r) => (
        <Room key={r} room={r} label={labels[r]} count={counts[r]} seated={seated[r]} />
      ))}
    </>
  );
}
