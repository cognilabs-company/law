"use client";

import { useMemo } from "react";
import type { LiveBoard, LivePerson, LiveRoom, LiveUnit } from "@/lib/services/internalLive";
import { IconBuilding, IconClock, IconUsers } from "@/components/icons";
import { HrmAvatar, HrmEmpty, useHrmFormat } from "@/components/internal/HrmUi";
import { LiveStatus, ObjectLink, STATUS_TONE, shownStatus, useLiveText } from "./bits";

export type Group = { unit: LiveUnit | null; depth: number; rooms: { room: LiveRoom | null; people: LivePerson[] }[]; total: number; on: number };

const ONLINE = new Set(["online", "working", "busy", "break"]);
// Who is at work first, then by name.
const RANK: Record<string, number> = { working: 0, busy: 1, online: 2, break: 3, inactive: 4, offline: 5 };

// Units in tree order (parent before its children), each with its rooms and
// the people seated in them; people without a room sit in the unit itself.
export function groupBoard(board: LiveBoard, statusOf: (p: LivePerson) => string): Group[] {
  const byParent = new Map<string, LiveUnit[]>();
  const ids = new Set(board.units.map((u) => u.id));
  for (const u of board.units) {
    const p = u.parentId && ids.has(u.parentId) ? u.parentId : "";
    byParent.set(p, [...(byParent.get(p) ?? []), u]);
  }
  const ordered: { unit: LiveUnit; depth: number }[] = [];
  const walk = (parent: string, depth: number) => {
    for (const u of (byParent.get(parent) ?? []).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))) {
      ordered.push({ unit: u, depth });
      walk(u.id, depth + 1);
    }
  };
  walk("", 0);
  const sort = (list: LivePerson[]) => [...list].sort((a, b) => (RANK[statusOf(a)] ?? 9) - (RANK[statusOf(b)] ?? 9) || a.name.localeCompare(b.name));
  const roomIds = new Set(board.rooms.map((r) => r.id));
  const make = (unit: LiveUnit | null, depth: number, people: LivePerson[]): Group => {
    const rooms = board.rooms.filter((r) => (unit ? r.unitId === unit.id : !ids.has(r.unitId))).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const inRooms = rooms.map((room) => ({ room, people: sort(people.filter((p) => p.roomId === room.id)) }));
    const loose = sort(people.filter((p) => !p.roomId || !roomIds.has(p.roomId) || !rooms.some((r) => r.id === p.roomId)));
    const all = [...(loose.length ? [{ room: null, people: loose }] : []), ...inRooms];
    return { unit, depth, rooms: all, total: people.length, on: people.filter((p) => ONLINE.has(statusOf(p))).length };
  };
  const out = ordered.map(({ unit, depth }) => make(unit, depth, board.people.filter((p) => p.unitId === unit.id)));
  const orphans = board.people.filter((p) => !p.unitId || !ids.has(p.unitId));
  if (orphans.length) out.push(make(null, 0, orphans));
  return out;
}

export default function LiveBoardView({
  board,
  now,
  inactiveAfter,
  onOpen,
  filtered,
}: {
  board: LiveBoard;
  now: number;
  inactiveAfter: number;
  onOpen: (p: LivePerson) => void;
  filtered: boolean;
}) {
  const { t, roomType } = useLiveText();
  const statusOf = useMemo(() => (p: LivePerson) => shownStatus(p.status, p.lastSeenAt, now, inactiveAfter), [now, inactiveAfter]);
  const groups = useMemo(() => groupBoard(board, statusOf), [board, statusOf]);
  const visible = groups.filter((g) => g.total > 0 || (!filtered && g.rooms.length > 0) || (!filtered && g.unit));

  if (!board.people.length && !board.units.length) {
    return <HrmEmpty icon={IconUsers} title={filtered ? t("board.noMatch") : t("board.emptyTitle")} text={filtered ? undefined : t("board.emptyText")} />;
  }

  return (
    <div className="lv-board">
      {!board.people.length ? <p className="lv-board__note">{filtered ? t("board.noMatch") : t("board.nobody")}</p> : null}
      {visible.map((g) => (
        <section key={g.unit?.id ?? "none"} className="lv-unit" style={{ ["--lv-depth" as string]: g.depth }}>
          <header className="lv-unit__h">
            <span className="lv-unit__i" aria-hidden>
              <IconBuilding />
            </span>
            <span className="lv-unit__t">
              <b>{g.unit?.name ?? t("board.noUnit")}</b>
              {g.unit?.code ? <small>{g.unit.code}</small> : null}
            </span>
            <span className="lv-unit__n" title={t("board.onlineOfTotal")}>
              <i className={g.on ? "on" : ""} aria-hidden />
              {g.on}/{g.total}
            </span>
          </header>
          {g.rooms.length ? (
            g.rooms.map(({ room, people }) => (
              <div key={room?.id ?? "loose"} className={`lv-room${room ? ` lv-room--${room.type}` : " lv-room--loose"}`}>
                {room ? (
                  <div className="lv-room__h">
                    <b>{room.name}</b>
                    <span className={`lv-rtype lv-rtype--${room.type}`}>{roomType(room.type)}</span>
                    {room.capacity ? <small>{t("board.capacity", { n: people.length, cap: room.capacity })}</small> : null}
                    {room.status !== "active" ? <small className="lv-room__off">{t(`roomStatus.${room.status}`)}</small> : null}
                  </div>
                ) : null}
                {people.length ? (
                  <div className="lv-grid">
                    {people.map((p) => (
                      <PersonCard key={p.id} p={p} status={statusOf(p)} now={now} onOpen={() => onOpen(p)} />
                    ))}
                  </div>
                ) : (
                  <p className="lv-room__empty">{t("board.roomEmpty")}</p>
                )}
              </div>
            ))
          ) : (
            <p className="lv-room__empty">{t("board.unitEmpty")}</p>
          )}
        </section>
      ))}
    </div>
  );
}

function PersonCard({ p, status, now, onOpen }: { p: LivePerson; status: string; now: number; onOpen: () => void }) {
  const { t } = useLiveText();
  const f = useHrmFormat();
  const seen = p.lastSeenAt ? Date.parse(p.lastSeenAt) : NaN;
  const ago = Number.isFinite(seen) && now ? Math.max(0, Math.round((now - seen) / 60000)) : -1;
  return (
    <article className={`lv-card lv-card--${STATUS_TONE[status] ?? "gray"}`}>
      <button type="button" className="lv-card__hit" onClick={onOpen} aria-label={t("board.open", { name: p.name })} />
      <div className="lv-card__top">
        <span className="lv-card__av">
          <HrmAvatar name={p.name} size="md" />
          <i className={`lv-dot lv-dot--${STATUS_TONE[status] ?? "gray"}`} aria-hidden />
        </span>
        <span className="lv-card__who">
          <b>{p.name}</b>
          <small>{[p.position, p.code].filter(Boolean).join(" · ") || "—"}</small>
        </span>
        <LiveStatus value={status} compact />
      </div>
      {status === "busy" && p.busy?.reason ? (
        <p className="lv-card__busy">
          <span>{t("board.busyBecause")}</span> {p.busy.reason}
        </p>
      ) : p.activity?.label ? (
        <p className="lv-card__act">
          {p.activity.detailUrl ? <ObjectLink href={p.activity.detailUrl}>{p.activity.label}</ObjectLink> : p.activity.label}
        </p>
      ) : (
        <p className="lv-card__act lv-card__act--none">{t("board.noActivity")}</p>
      )}
      <div className="lv-card__foot">
        <span>
          <IconClock aria-hidden />
          {ago < 0 ? "—" : ago < 1 ? t("board.justNow") : ago < 60 ? t("board.minAgo", { n: ago }) : f.time(p.lastSeenAt)}
        </span>
        {p.extraUnitIds.length ? <span className="lv-card__extra">{t("board.extraUnits", { n: p.extraUnitIds.length })}</span> : null}
      </div>
    </article>
  );
}
