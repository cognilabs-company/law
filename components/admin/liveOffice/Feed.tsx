"use client";

import { useState } from "react";
import type { OfficeEvent, OfficePerson } from "@/lib/liveOffice/model";
import { HrmPanel } from "@/components/internal/HrmUi";
import { IconArrowRight, IconHistory, IconLogout } from "@/components/icons";
import Character from "./Character";
import { VERB_ICON, useOfficeText } from "./text";

type Item = { p: OfficePerson; e: OfficeEvent; kind: "action" | "moved" | "left"; n: number };

// Everyone's latest steps in one line-up, newest first: a move to another
// room and a sign-out are called out, so the order of work reads at a glance.
export function feedOf(people: OfficePerson[], limit: number): Item[] {
  const out: Item[] = [];
  for (const p of people) {
    let rooms = 0;
    for (const s of p.segments) {
      if (s.kind === "out") {
        if (s.events[0]) out.push({ p, e: s.events[0], kind: "left", n: 1 });
        continue;
      }
      if (s.kind !== "room") continue;
      s.events.forEach((e, i) => out.push({ p, e, kind: i === 0 && rooms > 0 ? "moved" : "action", n: 1 }));
      rooms++;
    }
  }
  out.sort((a, b) => b.e.at - a.e.at);
  // The same person busy with the same thing reads as one line with a count.
  const merged: Item[] = [];
  for (const it of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === "action" && it.kind === "action" && prev.p.id === it.p.id && prev.e.object === it.e.object) prev.n++;
    else merged.push({ ...it });
    if (merged.length > limit) break;
  }
  return merged.slice(0, limit);
}

export function FeedPanel({ people, now, onPick }: { people: OfficePerson[]; now: number; onPick: (id: string) => void }) {
  const { t, room, phrase, detail, ago, time } = useOfficeText();
  const [more, setMore] = useState(false);
  const items = feedOf(people, more ? 40 : 12);
  return (
    <HrmPanel title={t("feed.title")} icon={IconHistory} className="lo-feed" flush>
      {items.length ? (
        <ol className="lo-feed__list">
          {items.map(({ p, e, kind, n }) => {
            const Verb = kind === "left" ? IconLogout : kind === "moved" ? IconArrowRight : VERB_ICON[e.verb];
            const extra = detail(e);
            return (
              <li key={`${p.id}-${e.id}`} className={`lo-feed__i lo-feed__i--${kind}`}>
                <button type="button" onClick={() => onPick(p.id)}>
                  <span className="lo-feed__av" aria-hidden>
                    <Character id={p.id} kind={p.kind} pose="head" />
                  </span>
                  <span className="lo-feed__t">
                    <b>{p.name || "—"}</b>
                    <span className="lo-feed__what">
                      <Verb aria-hidden />
                      {kind === "moved" ? t("feed.moved", { room: room(e.room) }) : kind === "left" ? t("person.out") : phrase(e)}
                      {extra && kind !== "left" ? <em>{extra}</em> : null}
                      {n > 1 ? <b className="lo-feed__x">×{n}</b> : null}
                    </span>
                  </span>
                  <span className="lo-feed__when" title={time(e.at)}>
                    {ago(e.at, now)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="lo-feed__empty">{t("feed.empty")}</p>
      )}
      {!more && feedOf(people, 13).length > 12 ? (
        <button type="button" className="lo-feed__more" onClick={() => setMore(true)}>
          {t("person.earlier", { n: Math.min(28, feedOf(people, 40).length - 12) })}
        </button>
      ) : null}
    </HrmPanel>
  );
}

export function AwayPanel({ people, onPick }: { people: OfficePerson[]; onPick: (id: string) => void }) {
  const { t, time, kind } = useOfficeText();
  const gone = people.filter((p) => p.status === "away").sort((a, b) => b.leftAt - a.leftAt);
  return (
    <HrmPanel title={t("away.title")} icon={IconLogout} count={gone.length} className="lo-away" flush>
      {gone.length ? (
        <ul className="lo-away__list">
          {gone.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p.id)} title={`${p.name} · ${kind(p.kind)}`}>
                <span className="lo-away__av" aria-hidden>
                  <Character id={p.id} kind={p.kind} pose="head" />
                </span>
                <span className="lo-away__t">
                  <b>{p.name || "—"}</b>
                  <small>{t("away.left", { time: time(p.leftAt) })}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lo-feed__empty">{t("away.none")}</p>
      )}
    </HrmPanel>
  );
}
