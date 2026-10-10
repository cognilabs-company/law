"use client";

import { useState } from "react";
import Image from "next/image";
import type { OfficePerson, Segment } from "@/lib/liveOffice/model";
import { HrmDrawer, HrmSection } from "@/components/internal/HrmUi";
import { IconChevronDown, IconLogout, IconClock } from "@/components/icons";
import Character from "./Character";
import { ROOM_ART, VERB_ICON, useOfficeText } from "./text";

const SHOWN = 10;

// One person's day as a numbered path: where they were, from when to when,
// and what they did there. The current stay is marked, so "what next" is
// always the bottom of the list.
export default function PersonPanel({ person, now, onClose }: { person: OfficePerson | null; now: number; onClose: () => void }) {
  const { t, kind, status, room, phrase, detail, time, ago, span } = useOfficeText();
  const [all, setAll] = useState(false);
  const [openSeg, setOpenSeg] = useState<number[]>([]);
  if (!person) return null;
  const p = person;
  const end = p.status === "away" ? p.lastSeenAt : now;
  const segs = p.segments;
  const live = p.status !== "away" ? segs.length - 1 - [...segs].reverse().findIndex((s) => s.kind === "room") : -1;
  const offline = segs.reduce((n, s) => n + (s.kind === "room" ? 0 : s.to - s.from), 0);
  const rooms = new Set(segs.filter((s) => s.kind === "room").map((s) => s.room)).size;
  const first = all ? 0 : Math.max(0, segs.length - SHOWN);
  const toggle = (i: number) => setOpenSeg((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));
  const stepEnd = (s: Segment, i: number) => (i === live ? now : s.to);

  return (
    <HrmDrawer
      open
      onClose={onClose}
      title={p.name || "—"}
      sub={`${kind(p.kind)} · ${status(p.status)}`}
      head={
        <span className={`lo-pp__av lo-pp__av--${p.status}`} aria-hidden>
          <Character id={p.id} kind={p.kind} pose="head" />
        </span>
      }
    >
      <div className={`lo-pp__now lo-pp__now--${p.status}`}>
        <span className="lo-pp__fig" aria-hidden>
          <Character id={p.id} kind={p.kind} pose={p.status === "away" ? "stand" : p.status === "idle" ? "idle" : "work"} />
        </span>
        <div className="lo-pp__nowt">
          <span className={`lo-pp__st lo-pp__st--${p.status}`}>
            <i aria-hidden />
            {status(p.status)}
          </span>
          {p.status === "away" ? (
            <b className="lo-pp__room">
              <IconLogout aria-hidden />
              {t("away.left", { time: time(p.leftAt) })}
            </b>
          ) : (
            <b className="lo-pp__room">
              <Image src={ROOM_ART[p.room]} alt="" width={26} height={26} />
              {room(p.room)}
            </b>
          )}
          {p.last ? (
            <span className="lo-pp__what">
              {phrase(p.last)}
              {detail(p.last) ? <em>{detail(p.last)}</em> : null}
            </span>
          ) : null}
          <small className="lo-pp__ago">
            <IconClock aria-hidden />
            {t("person.lastSeen")}: {ago(p.lastSeenAt, now)}
          </small>
        </div>
      </div>

      <div className="lo-pp__minis">
        <span>
          <small>{t("person.arrived")}</small>
          <b>{time(p.arrivedAt)}</b>
        </span>
        <span>
          <small>{t("person.time")}</small>
          <b>{span(Math.max(0, end - p.arrivedAt - offline))}</b>
        </span>
        <span>
          <small>{t("person.actions")}</small>
          <b>{p.actions}</b>
        </span>
        <span>
          <small>{t("person.rooms")}</small>
          <b>{rooms}</b>
        </span>
      </div>

      <HrmSection label={t("person.path")}>
        {first > 0 ? (
          <button type="button" className="lo-feed__more lo-pp__earlier" onClick={() => setAll(true)}>
            {t("person.earlier", { n: first })}
          </button>
        ) : null}
        <ol className="lo-path">
          {segs.slice(first).map((s, k) => {
            const i = first + k;
            const here = i === live;
            const isOpen = openSeg.includes(i) || (here && !openSeg.includes(-1 - i));
            return (
              <li key={`${s.kind}-${s.from}-${i}`} className={`lo-path__s lo-path__s--${s.kind}${here ? " is-here" : ""}`}>
                <span className="lo-path__n" aria-hidden>
                  {s.kind === "room" ? <Image src={ROOM_ART[s.room]} alt="" width={22} height={22} /> : s.kind === "out" ? <IconLogout /> : <IconClock />}
                </span>
                <div className="lo-path__b">
                  <div className="lo-path__h">
                    <b>{s.kind === "room" ? room(s.room) : s.kind === "out" ? t("person.out") : t("person.away")}</b>
                    {here ? <span className="lo-path__here">{t("person.here")}</span> : null}
                    <small>
                      {time(s.from)}
                      {stepEnd(s, i) - s.from >= 60_000 ? ` – ${time(stepEnd(s, i))} · ${span(stepEnd(s, i) - s.from)}` : ""}
                    </small>
                  </div>
                  {s.kind === "room" && s.events.length ? (
                    <>
                      <button
                        type="button"
                        className="lo-path__toggle"
                        aria-expanded={isOpen}
                        onClick={() => (here ? setOpenSeg((cur) => (cur.includes(-1 - i) ? cur.filter((x) => x !== -1 - i) : [...cur, -1 - i])) : toggle(i))}
                      >
                        {t("person.count", { n: s.events.length })}
                        <IconChevronDown aria-hidden />
                      </button>
                      {isOpen ? (
                        <ul className="lo-path__acts">
                          {s.events.slice(-12).reverse().map((e) => {
                            const Verb = VERB_ICON[e.verb];
                            return (
                              <li key={e.id}>
                                <time>{time(e.at)}</time>
                                <Verb aria-hidden />
                                <span>
                                  {phrase(e)}
                                  {detail(e) ? <em>{detail(e)}</em> : null}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </HrmSection>
    </HrmDrawer>
  );
}
