"use client";

import { memo, type ReactNode } from "react";
import { ROOMS, type OfficeRoom } from "@/lib/liveOffice/model";
import { CAP, DOOR_W, FACE, HALL, PLAN_H, PLAN_W, SEATS, SIDE, T, VIEW, hallY, roomBox, seatOf } from "@/lib/liveOffice/plan";
import { DeskDown, DeskUp, FIG_VIEW } from "./Character";
import { ROOM_ART } from "./text";

// The office seen from above at ¾, like a cosy office game: wooden and
// tiled floors, carpets, walls with windows, paintings and clocks, and
// furniture that tells each room's job at a glance. All in tiles of T units.

const u = (t: number) => t * T;

// A block seen from above at ¾: footprint (x, y, w, d) on the floor and a
// height h — the top face is lifted by h, the front face hangs below it.
function Blk({ x, y, w, d, h, top, front, r = 2, children }: { x: number; y: number; w: number; d: number; h: number; top: string; front: string; r?: number; children?: ReactNode }) {
  return (
    <g>
      <rect x={u(x) + 2} y={u(y + d) - 3} width={u(w)} height="7" rx="3.5" fill="rgba(11,31,69,.14)" />
      <rect x={u(x)} y={u(y + d - h)} width={u(w)} height={u(h)} rx={r} fill={front} />
      <rect x={u(x)} y={u(y - h)} width={u(w)} height={u(d)} rx={r} fill={top} />
      {children}
    </g>
  );
}

function Plant({ x, y, big = false }: { x: number; y: number; big?: boolean }) {
  const k = big ? 1.3 : 1;
  const cx = u(x + 0.3);
  const cy = u(y - 0.25);
  const leaf = (a: number, l: number, c: string, i: number) => {
    const rad = (a * Math.PI) / 180;
    const ex = cx + Math.cos(rad) * l * k;
    const ey = cy - 6 * k + Math.sin(rad) * l * k * 0.8;
    return <path key={i} d={`M${cx} ${cy - 4} Q${(cx + ex) / 2 + 4} ${(cy + ey) / 2 - 6} ${ex} ${ey} Q${(cx + ex) / 2 - 3} ${(cy + ey) / 2 + 2} ${cx} ${cy - 4}Z`} fill={c} />;
  };
  return (
    <g>
      <ellipse cx={cx} cy={u(y + 0.32)} rx={10 * k} ry={3} fill="rgba(0,0,0,.12)" />
      <Blk x={x + 0.05} y={y} w={0.5} d={0.3} h={0.42} top="#E8975A" front="#C9733C" r={3} />
      {[-150, -110, -70, -30, 10, -130, -50, -90].map((a, i) => leaf(a, i > 4 ? 12 : 16, i % 2 ? "#2E9E5B" : "#3DBE73", i))}
    </g>
  );
}

function Books({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const colors = ["#3B82F6", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6", "#0EA5E9", "#F97316", "#E11D48"];
  const out = [];
  let a = u(x) + 2;
  for (let i = 0; a < u(x + w) - 6; i++) {
    const bw = 3 + ((i * 7) % 3);
    const bh = u(h) - 3 - ((i * 5) % 3) * 1.5;
    out.push(<rect key={i} x={a} y={u(y) + u(h) - bh} width={bw} height={bh} rx=".6" fill={colors[i % colors.length]} />);
    a += bw + 1;
  }
  return <g>{out}</g>;
}

function Bookshelf({ x, y, w }: { x: number; y: number; w: number }) {
  const top = y + 0.7 - 1.9;
  return (
    <g>
      <Blk x={x} y={y} w={w} d={0.7} h={1.9} top="#B07A4A" front="#8C5A33" />
      <rect x={u(x) + 3} y={u(top + 0.7) - u(1.9) + u(0.7) + 2} width={u(w) - 6} height={u(1.9) - 6} rx="2" fill="#5E3B20" />
      {[0, 1, 2].map((k) => {
        const sy = y + 0.7 - 1.9 + 0.12 + k * 0.6;
        return (
          <g key={k}>
            <Books x={x + 0.08} y={sy} w={w - 0.16} h={0.5} />
            <rect x={u(x) + 3} y={u(sy + 0.5)} width={u(w) - 6} height="2.5" fill="#8C5A33" />
          </g>
        );
      })}
    </g>
  );
}

function Cabinet({ x, y }: { x: number; y: number }) {
  return (
    <Blk x={x} y={y} w={0.9} d={0.6} h={1.25} top="#CBD5E1" front="#94A3B8">
      {[0, 1, 2].map((k) => (
        <g key={k}>
          <rect x={u(x) + 3} y={u(y + 0.6 - 1.25) + 3 + k * 12.5} width={u(0.9) - 6} height="10" rx="1.5" fill="#A8B4C4" />
          <rect x={u(x + 0.45) - 4} y={u(y + 0.6 - 1.25) + 7 + k * 12.5} width="8" height="2" rx="1" fill="#475569" />
        </g>
      ))}
    </Blk>
  );
}

function Cooler({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <Blk x={x} y={y} w={0.62} d={0.5} h={1.05} top="#F1F5F9" front="#CBD5E1">
        <rect x={u(x) + 5} y={u(y + 0.5 - 1.05) + 10} width="10" height="5" rx="1.5" fill="#60A5FA" />
      </Blk>
      <rect x={u(x) + 3} y={u(y - 1.05) - 14} width={u(0.62) - 6} height="18" rx="5" fill="#93C5FD" opacity=".9" />
      <rect x={u(x) + 6} y={u(y - 1.05) - 11} width="4" height="12" rx="2" fill="#DBEAFE" opacity=".8" />
    </g>
  );
}

function Vending({ x, y }: { x: number; y: number }) {
  const fy = u(y + 0.7 - 2.0);
  const items = ["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#EC4899", "#8B5CF6", "#F97316", "#06B6D4", "#84CC16"];
  return (
    <Blk x={x} y={y} w={1.05} d={0.7} h={2.0} top="#E5484D" front="#C53030">
      <rect x={u(x) + 3} y={fy + 3} width={u(0.68)} height={u(1.35)} rx="2" fill="#DBEAFE" />
      {items.map((c, i) => (
        <rect key={i} x={u(x) + 6 + (i % 3) * 6.6} y={fy + 7 + Math.floor(i / 3) * 12} width="4.6" height="7" rx="1" fill={c} />
      ))}
      <rect x={u(x + 0.8)} y={fy + 8} width="4" height="10" rx="1" fill="#1F2937" />
      <rect x={u(x) + 5} y={fy + u(1.5)} width={u(0.6)} height="5" rx="1.5" fill="#1F2937" />
    </Blk>
  );
}

function CoffeeCounter({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <Blk x={x} y={y} w={w} d={0.7} h={0.95} top="#F8FAFC" front="#A87445">
        <rect x={u(x) + 4} y={u(y + 0.7 - 0.95) + 6} width={u(w) - 8} height="2" fill="#8C5A33" opacity=".6" />
      </Blk>
      <Blk x={x + 0.2} y={y + 0.05} w={0.6} d={0.4} h={1.45} top="#475569" front="#1F2937">
        <rect x={u(x + 0.2) + 4} y={u(y + 0.45 - 1.45) + 6} width="11" height="5" rx="1" fill="#22D3EE" />
        <rect x={u(x + 0.2) + 6} y={u(y + 0.45 - 1.45) + 16} width="7" height="6" rx="1" fill="#0F172A" />
      </Blk>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={u(x + 1.1 + i * 0.35)} y={u(y - 0.95) + 4} width="7" height="8" rx="2" fill="#fff" stroke="#CBD5E1" strokeWidth=".8" />
      ))}
      <Blk x={x + w - 0.7} y={y + 0.1} w={0.5} d={0.35} h={1.15} top="#E2E8F0" front="#94A3B8">
        <rect x={u(x + w - 0.7) + 3} y={u(y + 0.45 - 1.15) + 5} width="10" height="3" rx="1" fill="#94A3B8" />
      </Blk>
    </g>
  );
}

function Sofa({ x, y, w, color }: { x: number; y: number; w: number; color: string }) {
  return (
    <g>
      <Blk x={x} y={y} w={w} d={0.4} h={1.05} top={color} front={color} r={5} />
      <rect x={u(x)} y={u(y + 0.4 - 1.05)} width={u(w)} height={u(1.05)} rx="5" fill="rgba(0,0,0,.12)" />
      <Blk x={x} y={y + 0.4} w={w} d={0.62} h={0.45} top={color} front="rgba(0,0,0,.28)" r={4} />
      {[1, 2].map((k) => (
        <path key={k} d={`M${u(x + (w / 3) * k)} ${u(y + 0.4 - 0.45) + 2}v${u(0.58)}`} stroke="rgba(0,0,0,.15)" strokeWidth="1.2" />
      ))}
      <Blk x={x - 0.18} y={y + 0.05} w={0.3} d={0.95} h={0.75} top={color} front="rgba(0,0,0,.25)" r={4} />
      <Blk x={x + w - 0.12} y={y + 0.05} w={0.3} d={0.95} h={0.75} top={color} front="rgba(0,0,0,.25)" r={4} />
    </g>
  );
}

function Rug({ x, y, w, h, a, b }: { x: number; y: number; w: number; h: number; a: string; b: string }) {
  return (
    <g>
      <rect x={u(x)} y={u(y)} width={u(w)} height={u(h)} rx="6" fill={a} />
      <rect x={u(x) + 6} y={u(y) + 6} width={u(w) - 12} height={u(h) - 12} rx="4" fill="none" stroke={b} strokeWidth="2" strokeDasharray="6 4" />
    </g>
  );
}

// ── wall decorations (on the face above a room's floor) ─────────────────────

function Window({ x, y, w }: { x: number; y: number; w: number }) {
  const X = u(x);
  const Y = u(y);
  const W = u(w);
  const H = u(1.0);
  return (
    <g>
      <rect x={X - 2} y={Y - 2} width={W + 4} height={H + 4} rx="3" fill="#F8FAFC" />
      <rect x={X} y={Y} width={W} height={H} rx="2" fill="url(#lo-sky)" />
      <ellipse cx={X + W * 0.3} cy={Y + H * 0.35} rx={8} ry={3.5} fill="#fff" opacity=".9" />
      <ellipse cx={X + W * 0.68} cy={Y + H * 0.5} rx={6} ry={2.6} fill="#fff" opacity=".8" />
      <path d={`M${X} ${Y + H * 0.82}l${W * 0.2} -${H * 0.25} ${W * 0.18} ${H * 0.14} ${W * 0.22} -${H * 0.3} ${W * 0.4} ${H * 0.41}Z`} fill="#93C5FD" opacity=".7" />
      <rect x={X + W / 2 - 1} y={Y} width="2" height={H} fill="#F8FAFC" />
      <rect x={X - 3} y={Y + H} width={W + 6} height="3" rx="1" fill="#E2E8F0" />
    </g>
  );
}

function Painting({ x, y, w }: { x: number; y: number; w: number }) {
  const X = u(x);
  const Y = u(y);
  const W = u(w);
  const H = u(0.75);
  return (
    <g>
      <rect x={X - 3} y={Y - 3} width={W + 6} height={H + 6} rx="2" fill="#B7791F" />
      <rect x={X} y={Y} width={W} height={H} fill="#BFE3FF" />
      <circle cx={X + W * 0.25} cy={Y + H * 0.3} r={3.5} fill="#FDE047" />
      <path d={`M${X} ${Y + H}l${W * 0.3} -${H * 0.55} ${W * 0.2} ${H * 0.3} ${W * 0.25} -${H * 0.45} ${W * 0.25} ${H * 0.7}Z`} fill="#4ADE80" />
      <path d={`M${X} ${Y + H}l${W * 0.42} -${H * 0.3} ${W * 0.58} ${H * 0.3}Z`} fill="#16A34A" />
    </g>
  );
}

function Clock({ x, y }: { x: number; y: number }) {
  const cx = u(x);
  const cy = u(y);
  return (
    <g>
      <circle cx={cx} cy={cy} r="9" fill="#fff" stroke="#334155" strokeWidth="2.2" />
      <path d={`M${cx} ${cy}v-6M${cx} ${cy}h4.5`} stroke="#334155" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="1.2" fill="#EF4444" />
    </g>
  );
}

function Sign({ r, x, y, label, count }: { r: OfficeRoom; x: number; y: number; label: string; count: number }) {
  const X = u(x);
  const Y = u(y);
  const w = 34 + label.length * 8.3 + 24;
  return (
    <g className="lo-sign">
      <rect x={X} y={Y} width={w} height="26" rx="8" className="lo-sign__plate" />
      <image href={ROOM_ART[r]} x={X + 4} y={Y + 2} width="22" height="22" preserveAspectRatio="xMidYMid meet" />
      <text x={X + 30} y={Y + 17.5} className="lo-sign__t">
        {label}
      </text>
      <g className={`lo-sign__n${count ? " is-on" : ""}`}>
        <circle cx={X + w - 12} cy={Y + 13} r="9" />
        <text x={X + w - 12} y={Y + 16.6} textAnchor="middle">
          {count}
        </text>
      </g>
    </g>
  );
}

// ── rooms ───────────────────────────────────────────────────────────────────

const FLOOR: Record<OfficeRoom, string> = {
  lobby: "url(#lo-p-tile)",
  talk: "url(#lo-p-teal)",
  urgent: "url(#lo-p-rose)",
  documents: "url(#lo-p-wood)",
  desk: "url(#lo-p-woodl)",
  ai: "url(#lo-p-tech)",
  market: "url(#lo-p-tile)",
  studio: "url(#lo-p-woodl)",
  admin: "url(#lo-p-blue)",
};

const WALL: Record<OfficeRoom, string> = {
  lobby: "#EFE6D8",
  talk: "#DDEFF0",
  urgent: "#F7E1E1",
  documents: "#EDE3D3",
  desk: "#E9ECF5",
  ai: "#2C3A5C",
  market: "#E3F2E7",
  studio: "#F1E6FB",
  admin: "#E2E8F4",
};

function Furniture({ r }: { r: OfficeRoom }) {
  const b = roomBox(r);
  const X = (lx: number) => b.x + lx;
  const Y = (ly: number) => b.y + ly;
  const F = (ly: number) => b.top + ly; // on the wall face
  const corners = (
    <>
      <Plant x={X(0.08)} y={Y(6.45)} />
      <Plant x={X(9.35)} y={Y(6.45)} />
    </>
  );
  switch (r) {
    case "lobby":
      return (
        <g>
          <rect x={u(X(2.0))} y={u(F(0.3))} width={u(2.6)} height={u(0.9)} rx="6" fill="#1668F0" />
          <text x={u(X(3.3))} y={u(F(0.95))} textAnchor="middle" className="lo-logo-wall">
            LexGo
          </text>
          <Clock x={X(5.15)} y={F(0.72)} />
          <Rug x={X(5.4)} y={Y(2.6)} w={4.4} h={3.9} a="#F4C9A0" b="#E8A46A" />
          <Plant x={X(0.08)} y={Y(0.55)} big />
          <Plant x={X(0.08)} y={Y(6.45)} />
          <Blk x={X(0.7)} y={Y(1.25)} w={3.6} d={0.8} h={1.0} top="#FFFFFF" front="#1668F0" />
          <text x={u(X(2.5))} y={u(Y(2.05)) - 8} textAnchor="middle" className="lo-logo-desk">
            LexGo
          </text>
          <Blk x={X(0.7)} y={Y(1.25)} w={0.8} d={1.9} h={1.0} top="#FFFFFF" front="#1550C8" />
          <rect x={u(X(1.95))} y={u(Y(1.25 - 1.0)) - 13} width="30" height="19" rx="2.5" fill="#1E293B" />
          <rect x={u(X(1.95)) + 2.5} y={u(Y(1.25 - 1.0)) - 10.5} width="25" height="14" rx="1.5" fill="#60A5FA" />
          <rect x={u(X(1.95)) + 5} y={u(Y(1.25 - 1.0)) - 8} width="12" height="2.4" rx="1" fill="#DBEAFE" />
          <rect x={u(X(1.95)) + 5} y={u(Y(1.25 - 1.0)) - 4} width="17" height="2" rx="1" fill="#BFDBFE" />
          <rect x={u(X(1.95)) + 13} y={u(Y(1.25 - 1.0)) + 6} width="4" height="4" fill="#475569" />
          <circle cx={u(X(3.7))} cy={u(Y(1.25 - 1.0)) + 9} r="3.6" fill="#F59E0B" />
          <CoffeeCounter x={X(5.4)} y={Y(0.12)} w={2.5} />
          <Cooler x={X(8.05)} y={Y(0.2)} />
          <Vending x={X(8.85)} y={Y(0.1)} />
          <Sofa x={X(5.85)} y={Y(3.15)} w={3.9} color="#5B7BC4" />
          <Blk x={X(6.35)} y={Y(4.75)} w={2.8} d={0.8} h={0.35} top="#C9915A" front="#9C6B3E">
            <rect x={u(X(6.7))} y={u(Y(4.4)) + 4} width="12" height="9" rx="1" fill="#F43F5E" transform={`rotate(-10 ${u(X(6.7)) + 6} ${u(Y(4.4)) + 8})`} />
            <rect x={u(X(7.9))} y={u(Y(4.4)) + 5} width="7" height="8" rx="2" fill="#fff" />
          </Blk>
        </g>
      );
    case "talk":
      return (
        <g>
          <rect x={u(X(3.0))} y={u(F(0.16))} width={u(4.0)} height={u(1.22)} rx="4" fill="#0F2A55" />
          <rect x={u(X(3.25))} y={u(F(0.36))} width={u(1.7)} height="9" rx="4.5" fill="#E0F2FE" />
          <rect x={u(X(5.0))} y={u(F(0.74))} width={u(1.75)} height="9" rx="4.5" fill="#22D3EE" />
          <rect x={u(X(3.25))} y={u(F(1.04))} width={u(1.2)} height="8" rx="4" fill="#93C5FD" />
          <Clock x={X(7.75)} y={F(0.72)} />
          <Cooler x={X(0.15)} y={Y(0.25)} />
          <Blk x={X(7.0)} y={Y(0.15)} w={2.2} d={0.65} h={0.95} top="#E2E8F0" front="#94A3B8">
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <circle cx={u(X(7.4 + i * 0.7))} cy={u(Y(0.15 - 0.95)) + 9} r="5" fill="none" stroke="#1E293B" strokeWidth="2" />
                <rect x={u(X(7.4 + i * 0.7)) - 6} y={u(Y(0.15 - 0.95)) + 8} width="3" height="5" rx="1" fill="#1E293B" />
              </g>
            ))}
          </Blk>
          {corners}
        </g>
      );
    case "urgent":
      return (
        <g>
          <rect x={u(X(3.0))} y={u(F(0.3))} width={u(2.6)} height={u(0.92)} rx="6" fill="#DC2626" />
          <text x={u(X(4.3))} y={u(F(0.98))} textAnchor="middle" className="lo-sos">
            SOS
          </text>
          <circle cx={u(X(6.3))} cy={u(F(0.5))} r="7" fill="#EF4444" />
          <Clock x={X(7.4)} y={F(0.72)} />
          <Blk x={X(0.15)} y={Y(0.2)} w={0.95} d={0.55} h={1.35} top="#FFFFFF" front="#E2E8F0">
            <rect x={u(X(0.62)) - 2.5} y={u(Y(0.75 - 1.35)) + 9} width="5" height="15" fill="#EF4444" />
            <rect x={u(X(0.62)) - 7.5} y={u(Y(0.75 - 1.35)) + 14} width="15" height="5" fill="#EF4444" />
          </Blk>
          <Blk x={X(6.6)} y={Y(0.3)} w={2.6} d={0.55} h={0.48} top="#94A3B8" front="#64748B" />
          <Blk x={X(6.6)} y={Y(0.3)} w={2.6} d={0.14} h={0.95} top="#64748B" front="#475569" />
          <rect x={u(X(0.05))} y={u(Y(5.4))} width="8" height="16" rx="3" fill="#DC2626" />
          {corners}
        </g>
      );
    case "documents":
      return (
        <g>
          <Bookshelf x={X(0.2)} y={Y(0.05)} w={2.2} />
          <Bookshelf x={X(2.5)} y={Y(0.05)} w={2.2} />
          <Painting x={X(5.1)} y={F(0.3)} w={1.4} />
          <Clock x={X(7.0)} y={F(0.72)} />
          <Cabinet x={X(7.6)} y={Y(0.2)} />
          <Cabinet x={X(8.6)} y={Y(0.2)} />
          <Blk x={X(7.65)} y={Y(0.2 - 1.25)} w={0.8} d={0.45} h={0.35} top="#E2E8F0" front="#94A3B8" />
          <rect x={u(X(7.75))} y={u(Y(0.2 - 1.25 - 0.35)) - 4} width="18" height="7" rx="1" fill="#fff" />
          {corners}
        </g>
      );
    case "desk":
      return (
        <g>
          <rect x={u(X(0.6))} y={u(F(0.15))} width={u(5.0)} height={u(1.25)} rx="3" fill="#FFFFFF" stroke="#CBD5E1" />
          {[0, 1, 2].map((c) => (
            <g key={c}>
              <rect x={u(X(0.72 + c * 1.63))} y={u(F(0.22))} width={u(1.5)} height="6" rx="2" fill="#E2E8F0" />
              {[0, 1, 2].map((k) =>
                c === 2 && k === 2 ? null : (
                  <rect key={k} x={u(X(0.8 + c * 1.63)) + (k % 2) * 20} y={u(F(0.5)) + Math.floor(k / 2) * 14 + (k % 2) * 3} width="17" height="11" rx="1.5" fill={["#FDE68A", "#FBCFE8", "#BBF7D0", "#BFDBFE"][(c + k) % 4]} />
                ),
              )}
            </g>
          ))}
          <rect x={u(X(6.1))} y={u(F(0.25))} width={u(1.0)} height={u(1.05)} rx="2" fill="#fff" stroke="#CBD5E1" />
          <rect x={u(X(6.1))} y={u(F(0.25))} width={u(1.0)} height="9" rx="2" fill="#EF4444" />
          <Clock x={X(7.75)} y={F(0.72)} />
          <ellipse cx={u(X(8.65))} cy={u(Y(1.25))} rx={u(0.8)} ry={u(0.5)} fill="#B07A4A" />
          <ellipse cx={u(X(8.65))} cy={u(Y(1.05))} rx={u(0.8)} ry={u(0.5)} fill="#D9A46B" />
          <Blk x={X(7.45)} y={Y(1.15)} w={0.45} d={0.42} h={0.45} top="#475569" front="#334155" r={4} />
          <Blk x={X(9.4)} y={Y(1.15)} w={0.45} d={0.42} h={0.45} top="#475569" front="#334155" r={4} />
          {corners}
        </g>
      );
    case "ai":
      return (
        <g>
          <rect x={u(X(3.6))} y={u(F(0.15))} width={u(3.9)} height={u(1.25)} rx="5" fill="url(#lo-ai)" />
          <text x={u(X(5.3))} y={u(F(1.1))} textAnchor="middle" className="lo-wall-ai">
            AI
          </text>
          <path d={`M${u(X(6.2))} ${u(F(0.9))}l9 -8 8 6 9 -10`} fill="none" stroke="#A5F3FC" strokeWidth="1.6" opacity=".8" />
          {[0, 1, 2].map((i) => (
            <Blk key={i} x={X(0.15 + i * 1.1)} y={Y(0.1)} w={1.0} d={0.7} h={2.0} top="#334155" front="#111827">
              {[0, 1, 2, 3, 4].map((k) => (
                <rect key={k} x={u(X(0.15 + i * 1.1)) + 5} y={u(Y(0.8 - 2.0)) + 7 + k * 11} width={u(1.0) - 10} height="3" rx="1.5" fill={k % 2 ? "#22D3EE" : "#60A5FA"} opacity=".55" />
              ))}
            </Blk>
          ))}
          <g className="lo-core">
            <ellipse cx={u(X(8.8))} cy={u(Y(1.0))} rx="17" ry="7" fill="#1E293B" />
            <rect x={u(X(8.8)) - 9} y={u(Y(1.0)) - 34} width="18" height="34" rx="6" fill="#22D3EE" opacity=".85" />
            <ellipse cx={u(X(8.8))} cy={u(Y(1.0)) - 34} rx="11" ry="4.5" fill="#A5F3FC" />
          </g>
          {corners}
        </g>
      );
    case "market":
      return (
        <g>
          <Blk x={X(0.2)} y={Y(0.05)} w={3.1} d={0.75} h={1.9} top="#E2E8F0" front="#CBD5E1">
            {[0, 1, 2].map((row) =>
              [0, 1, 2, 3].map((k) => (
                <rect key={`${row}${k}`} x={u(X(0.3)) + k * 24} y={u(Y(0.8 - 1.9)) + 5 + row * 19} width="19" height="14" rx="2" fill={["#F59E0B", "#3B82F6", "#10B981", "#EC4899", "#8B5CF6", "#F97316"][(row * 4 + k) % 6]} />
              )),
            )}
          </Blk>
          <rect x={u(X(3.8))} y={u(F(0.3))} width={u(1.4)} height={u(0.92)} rx="6" fill="#16A34A" />
          <text x={u(X(4.5))} y={u(F(0.98))} textAnchor="middle" className="lo-sale">
            %
          </text>
          <Painting x={X(5.6)} y={F(0.3)} w={1.3} />
          <Blk x={X(7.4)} y={Y(0.25)} w={2.3} d={0.8} h={1.0} top="#F8FAFC" front="#22A06B">
            <rect x={u(X(8.6))} y={u(Y(1.05 - 1.0)) - 8} width="14" height="10" rx="2" fill="#334155" />
            <rect x={u(X(8.6)) + 3} y={u(Y(1.05 - 1.0)) - 6} width="8" height="4" fill="#22D3EE" />
            <rect x={u(X(7.7))} y={u(Y(1.05 - 1.0)) - 7} width="10" height="7" rx="1" fill="#FBBF24" />
          </Blk>
          <Blk x={X(0.15)} y={Y(5.3)} w={0.8} d={0.7} h={0.6} top="#E7B57A" front="#C9915A" />
          <Blk x={X(0.25)} y={Y(5.35)} w={0.6} d={0.55} h={1.05} top="#EBC38E" front="#D9A066" />
          {corners}
        </g>
      );
    case "studio":
      return (
        <g>
          <rect x={u(X(0.6))} y={u(F(0.15))} width={u(4.2)} height={u(1.25)} rx="3" fill="#FFFBEB" stroke="#E5E7EB" />
          <rect x={u(X(0.85))} y={u(F(0.35))} width="34" height="22" rx="2" fill="#F472B6" />
          <circle cx={u(X(2.85))} cy={u(F(0.75))} r="10" fill="#60A5FA" />
          <path d={`M${u(X(3.6))} ${u(F(1.2))}l12 -20 12 20Z`} fill="#FBBF24" />
          {["#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6"].map((c, i) => (
            <rect key={i} x={u(X(5.3)) + i * 12} y={u(F(0.55))} width="10" height="18" rx="2" fill={c} />
          ))}
          <Clock x={X(7.75)} y={F(0.72)} />
          <g>
            <path d={`M${u(X(8.6))} ${u(Y(1.45))}l8 -48M${u(X(9.4))} ${u(Y(1.45))}l-8 -48M${u(X(9.0))} ${u(Y(1.45))}v-40`} stroke="#92400E" strokeWidth="2.4" strokeLinecap="round" />
            <rect x={u(X(9.0)) - 17} y={u(Y(1.45)) - 50} width="34" height="26" rx="2" fill="#fff" stroke="#E5E7EB" />
            <path d={`M${u(X(9.0)) - 12} ${u(Y(1.45)) - 30}q8 -14 14 -4t10 -8`} stroke="#F472B6" strokeWidth="2.4" fill="none" />
          </g>
          <ellipse cx={u(X(0.75))} cy={u(Y(5.3))} rx="17" ry="12" fill="#A78BFA" />
          <ellipse cx={u(X(0.75))} cy={u(Y(5.1))} rx="12" ry="7" fill="#C4B5FD" />
          <Plant x={X(9.35)} y={Y(6.45)} />
        </g>
      );
    case "admin":
      return (
        <g>
          <Bookshelf x={X(0.2)} y={Y(0.05)} w={2.2} />
          <Painting x={X(2.9)} y={F(0.25)} w={1.8} />
          {[0, 1].map((i) => (
            <g key={i}>
              <rect x={u(X(5.2 + i * 1.0))} y={u(F(0.35))} width={u(0.8)} height={u(0.62)} rx="1" fill="#D4A017" />
              <rect x={u(X(5.2 + i * 1.0)) + 3} y={u(F(0.35)) + 3} width={u(0.8) - 6} height={u(0.62) - 6} fill="#FFFDF5" />
            </g>
          ))}
          <Clock x={X(7.55)} y={F(0.72)} />
          <Blk x={X(8.8)} y={Y(0.2)} w={0.95} d={0.75} h={1.1} top="#94A3B8" front="#64748B">
            <circle cx={u(X(9.27))} cy={u(Y(0.95 - 1.1)) + 15} r="6" fill="#CBD5E1" stroke="#475569" strokeWidth="1.5" />
          </Blk>
          <path d={`M${u(X(8.2))} ${u(Y(1.0))}v-58`} stroke="#94A3B8" strokeWidth="2.6" strokeLinecap="round" />
          <path d={`M${u(X(8.2))} ${u(Y(1.0)) - 58}h22l-5 8 5 8h-22Z`} fill="#1668F0" />
          <Plant x={X(0.08)} y={Y(6.45)} big />
          <Plant x={X(9.35)} y={Y(6.45)} />
        </g>
      );
  }
}

function Room({ r }: { r: OfficeRoom }) {
  const b = roomBox(r);
  const exterior = b.row === 0;
  // Every desk is drawn free; a seated person's sprite brings their own desk,
  // chair and lit screen on top, so the plan never has to change.
  const desks = [];
  if (r !== "lobby") {
    for (let i = 0; i < SEATS; i++) {
      const s = seatOf(r, i);
      desks.push(
        <svg key={i} x={u(s.x) - FIG_VIEW.ax} y={u(s.y) - FIG_VIEW.ay} width={FIG_VIEW.w} height={FIG_VIEW.h} viewBox={`0 0 ${FIG_VIEW.w} ${FIG_VIEW.h}`} className="lo-free">
          {s.kind === "down" ? <DeskDown empty extra={i + r.length} /> : <DeskUp empty />}
        </svg>,
      );
    }
  }
  return (
    <g className={`lo-r lo-r--${r}`} data-room={r}>
      <rect x={u(b.x)} y={u(b.y)} width={u(b.w)} height={u(b.h)} fill={FLOOR[r]} />
      <rect x={u(b.x)} y={u(b.top)} width={u(b.w)} height={u(FACE)} fill={WALL[r]} />
      <rect x={u(b.x)} y={u(b.y) - 6} width={u(b.w)} height="6" fill="rgba(0,0,0,.12)" />
      <rect x={u(b.x)} y={u(b.y)} width={u(b.w)} height="10" fill="rgba(0,0,0,.07)" />
      {exterior ? (
        <>
          <Window x={b.x + 0.5} y={b.top + 0.25} w={1.0} />
          <Window x={b.x + b.w - 1.5} y={b.top + 0.25} w={1.0} />
        </>
      ) : null}
      <g className="lo-furn">
        <Furniture r={r} />
        {desks}
      </g>
    </g>
  );
}

// Walls go on top of every room, in one dark ink, like the plan of a game:
// side walls, the cap over each back wall, and the front wall with its door.
function Walls() {
  const out = [];
  for (const r of ROOMS) {
    const b = roomBox(r);
    const door = b.x + b.w / 2;
    const L = b.x - SIDE;
    const R = b.x + b.w;
    out.push(
      <rect key={`${r}cap`} x={u(L)} y={u(b.top - SIDE)} width={u(b.w + 2 * SIDE)} height={u(SIDE)} />,
      <rect key={`${r}l`} x={u(L)} y={u(b.top - SIDE)} width={u(SIDE)} height={u(FACE + b.h + 2 * SIDE)} />,
      <rect key={`${r}r`} x={u(R)} y={u(b.top - SIDE)} width={u(SIDE)} height={u(FACE + b.h + 2 * SIDE)} />,
      <rect key={`${r}b1`} x={u(L)} y={u(b.y + b.h)} width={u(door - DOOR_W / 2 - L)} height={u(SIDE)} />,
      <rect key={`${r}b2`} x={u(door + DOOR_W / 2)} y={u(b.y + b.h)} width={u(R + SIDE - door - DOOR_W / 2)} height={u(SIDE)} />,
    );
  }
  return <g className="lo-walls">{out}</g>;
}

// The front face of each room's bottom wall, seen from the hallway, and the
// door frames.
function WallFronts() {
  const out = [];
  for (const r of ROOMS) {
    const b = roomBox(r);
    const door = b.x + b.w / 2;
    const L = b.x - SIDE;
    const R = b.x + b.w + SIDE;
    const y = b.y + b.h + SIDE;
    out.push(
      <g key={r}>
        <rect className="lo-wallfront" x={u(L)} y={u(y)} width={u(door - DOOR_W / 2 - L)} height="12" />
        <rect className="lo-wallfront" x={u(door + DOOR_W / 2)} y={u(y)} width={u(R - door - DOOR_W / 2)} height="12" />
        <rect className="lo-doorpost" x={u(door - DOOR_W / 2) - 3} y={u(b.y + b.h) - 2} width="5" height={u(SIDE) + 14} rx="1.5" />
        <rect className="lo-doorpost" x={u(door + DOOR_W / 2) - 2} y={u(b.y + b.h) - 2} width="5" height={u(SIDE) + 14} rx="1.5" />
        <rect className="lo-mat" x={u(door - 0.8)} y={u(y) + 14} width={u(1.6)} height="14" rx="3" style={{ fill: ROOM_MAT[r] }} />
      </g>,
    );
  }
  return <g>{out}</g>;
}

const ROOM_MAT: Record<OfficeRoom, string> = {
  lobby: "#F59E0B",
  talk: "#06B6D4",
  urgent: "#EF4444",
  documents: "#3B82F6",
  desk: "#8B5CF6",
  ai: "#6366F1",
  market: "#10B981",
  studio: "#D946EF",
  admin: "#64748B",
};

// Hallway life, off the walking lines: plants where hallways cross,
// benches, a cooler, bins and fire extinguishers.
function HallDecor() {
  const items: ReactNode[] = [];
  for (let c = 0; c < 2; c++)
    for (let row = 0; row < 3; row++) {
      const b = roomBox(ROOMS[row * 3 + c]);
      const x = b.x + b.w + SIDE + 0.15;
      const y = hallY(ROOMS[row * 3 + c]) - 1.05;
      items.push(<Plant key={`p${c}${row}`} x={x} y={y + 0.5} />);
    }
  for (const r of ["documents", "admin", "talk"] as OfficeRoom[]) {
    const b = roomBox(r);
    items.push(
      <g key={`bench${r}`}>
        <Blk x={b.x + 0.6} y={b.y + b.h + SIDE + 0.55} w={2.0} d={0.45} h={0.42} top="#C08A5B" front="#8C5A33" />
      </g>,
    );
  }
  for (const r of ["lobby", "desk", "market"] as OfficeRoom[]) {
    const b = roomBox(r);
    items.push(
      <g key={`fx${r}`}>
        <rect x={u(b.x + b.w - 1.0)} y={u(b.y + b.h + SIDE) + 8} width="7" height="14" rx="3" fill="#DC2626" />
        <rect x={u(b.x + b.w - 1.0) + 1.5} y={u(b.y + b.h + SIDE) + 5} width="4" height="4" fill="#1F2937" />
        <Blk x={b.x + b.w - 2.0} y={b.y + b.h + SIDE + 0.6} w={0.4} d={0.35} h={0.5} top="#94A3B8" front="#64748B" r={3} />
      </g>,
    );
  }
  return <g className="lo-furn">{items}</g>;
}

// The plan is thousands of SVG nodes and never changes while the page is
// open: it renders once. What moves (people, counts) lives in layers above.
export default memo(function OfficePlan() {
  return <PlanBody />;
});

// Room name plates with head counts: a small layer of their own, so a count
// changing repaints a plate, not the office.
export const RoomSigns = memo(function RoomSigns({ labels, counts }: { labels: Record<OfficeRoom, string>; counts: Record<OfficeRoom, number> }) {
  return (
    <>
      {ROOMS.map((r) => {
        const b = roomBox(r);
        return <Sign key={r} r={r} x={b.x + 0.15} y={b.top - SIDE - 0.62} label={labels[r]} count={counts[r]} />;
      })}
    </>
  );
});

function PlanBody() {
  const W = u(PLAN_W);
  const H = u(PLAN_H);
  const runners = [];
  for (const row of [0, 1, 2]) {
    const y = hallY(ROOMS[row * 3]);
    runners.push(<rect key={`h${row}`} x={u(CAP + 0.4)} y={u(y - 0.5)} width={W - u(2 * CAP + 0.8)} height={u(1)} rx="6" className="lo-runner" />);
  }
  for (const c of [0, 1]) {
    const b = roomBox(ROOMS[c]);
    const x = b.x + b.w + SIDE + (HALL - 2 * SIDE) / 2;
    runners.push(<rect key={`v${c}`} x={u(x - 0.5)} y={u(CAP + 0.4)} width={u(1)} height={H - u(2 * CAP + 0.8)} rx="6" className="lo-runner" />);
  }
  return (
    <>
      <defs>
        <pattern id="lo-p-wood" width="64" height="16" patternUnits="userSpaceOnUse">
          <rect width="64" height="16" fill="#D49A5E" />
          <path d="M0 15.5H64M20 0v16M52 0v16" stroke="#B97E45" strokeWidth="1" />
          <path d="M4 5h10M36 9h12" stroke="#DCA86F" strokeWidth="1" opacity=".7" />
        </pattern>
        <pattern id="lo-p-woodl" width="64" height="16" patternUnits="userSpaceOnUse">
          <rect width="64" height="16" fill="#E6C08D" />
          <path d="M0 15.5H64M28 0v16M60 0v16" stroke="#D0A56D" strokeWidth="1" />
        </pattern>
        <pattern id="lo-p-tile" width="32" height="32" patternUnits="userSpaceOnUse">
          <rect width="32" height="32" fill="#F3EEE6" />
          <rect width="16" height="16" fill="#EAE2D5" />
          <rect x="16" y="16" width="16" height="16" fill="#EAE2D5" />
        </pattern>
        <pattern id="lo-p-rose" width="32" height="32" patternUnits="userSpaceOnUse">
          <rect width="32" height="32" fill="#FAEDED" />
          <path d="M0 31.5H32M31.5 0V32" stroke="#EFD3D3" strokeWidth="1" />
        </pattern>
        <pattern id="lo-p-teal" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#5FAFB0" />
          <circle cx="3" cy="3" r="1" fill="#6EC0C1" />
          <circle cx="9" cy="9" r="1" fill="#52A0A1" />
        </pattern>
        <pattern id="lo-p-blue" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#5574BA" />
          <circle cx="3" cy="3" r="1" fill="#6584C8" />
          <circle cx="9" cy="9" r="1" fill="#4A68AC" />
        </pattern>
        <pattern id="lo-p-tech" width="32" height="32" patternUnits="userSpaceOnUse">
          <rect width="32" height="32" fill="#202B45" />
          <path d="M0 31.5H32M31.5 0V32" stroke="#2E3D63" strokeWidth="1" />
          <circle cx="31.5" cy="31.5" r="1.4" fill="#3B82F6" opacity=".6" />
        </pattern>
        <pattern id="lo-p-hall" width="32" height="32" patternUnits="userSpaceOnUse">
          <rect width="32" height="32" fill="#DCE1E8" />
          <path d="M0 31.5H32M31.5 0V32" stroke="#CDD3DD" strokeWidth="1" />
        </pattern>
        <linearGradient id="lo-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7DD3FC" />
          <stop offset="1" stopColor="#E0F2FE" />
        </linearGradient>
        <linearGradient id="lo-ai" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <rect className="lo-hall" x="0" y="0" width={W} height={H} fill="url(#lo-p-hall)" />
      {runners}
      {(() => {
        const b = roomBox("desk");
        const cx = u(b.x - SIDE - (HALL - 2 * SIDE) / 2);
        const cy = u(hallY("desk"));
        return (
          <g className="lo-floorlogo" key="logo">
            <circle cx={cx} cy={cy} r={u(1.15)} fill="#1668F0" opacity=".9" />
            <circle cx={cx} cy={cy} r={u(1.15) - 4} fill="none" stroke="#fff" strokeWidth="2" opacity=".7" />
            <text x={cx} y={cy + 6} textAnchor="middle" className="lo-floorlogo__t">
              LexGo
            </text>
          </g>
        );
      })()}
      <HallDecor />
      {ROOMS.map((r) => (
        <Room key={r} r={r} />
      ))}
      <Walls />
      <WallFronts />
      <g className="lo-walls">
        <rect x="0" y="0" width={W} height={u(CAP)} />
        <rect x="0" y="0" width={u(CAP)} height={H} />
        <rect x={W - u(CAP)} y="0" width={u(CAP)} height={H} />
        <rect x="0" y={H - u(CAP)} width={W} height={u(CAP)} />
      </g>
      <rect className="lo-night" x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} />
    </>
  );
}
