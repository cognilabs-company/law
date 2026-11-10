"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { searchUsers, type UserSearchResult } from "@/lib/services/backend";
import { isForbidden } from "@/lib/http";
import { initials } from "@/lib/lawyers";
import InlineAlert from "@/components/ui/InlineAlert";
import { Skeleton } from "@/components/portal/DataState";
import { IconCheck, IconClose, IconSearch, IconUser } from "@/components/icons";

// A person to notify, always shown by name, avatar, role and phone; the id
// only travels to the send request.
export type PickedPerson = { id: string; name: string; phone: string; role: string; lexgoId: string; avatarUrl?: string };

export const personOfSearch = (u: UserSearchResult): PickedPerson => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, lexgoId: u.lexgoId, avatarUrl: u.avatarUrl });

const MIN_CHARS = 2;

type Found = { q: string; status: "ready" | "error" | "denied"; items: PickedPerson[] };

export function PersonAvatar({ p }: { p: Pick<PickedPerson, "name" | "avatarUrl"> }) {
  return (
    <span className="nrcp__av" aria-hidden="true">
      {p.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.avatarUrl} alt="" loading="lazy" />
      ) : p.name ? (
        initials(p.name)
      ) : (
        <IconUser />
      )}
    </span>
  );
}

// Recipients for people who cannot list every user (no users.manage): a
// search over GET /users/search, the same lookup meetings use to invite.
// Nobody types an id; a person is picked from what the search finds.
export default function PeoplePicker({
  selected,
  onToggle,
  roleLabel,
  title,
  describedBy,
}: {
  selected: Map<string, PickedPerson>;
  onToggle: (p: PickedPerson) => void;
  roleLabel: (role: string) => string;
  title: (p: PickedPerson) => string;
  describedBy?: string;
}) {
  const tn = useTranslations("admin.notifications");
  const tc = useTranslations("common");
  const uid = useId();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [rev, setRev] = useState(0);
  const [found, setFound] = useState<Found | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(h);
  }, [q]);

  const key = `${term}|${rev}`;
  useEffect(() => {
    if (term.length < MIN_CHARS) return;
    let alive = true;
    searchUsers(term, { limit: 20 })
      .then((list) => {
        if (alive) setFound({ q: key, status: "ready", items: list.filter((u) => u.id).map(personOfSearch) });
      })
      .catch((e) => {
        if (alive) setFound({ q: key, status: isForbidden(e) ? "denied" : "error", items: [] });
      });
    return () => {
      alive = false;
    };
  }, [term, key]);

  const short = term.length < MIN_CHARS;
  const busy = !short && (!found || found.q !== key);
  const picked = [...selected.values()];

  return (
    <div className="npick">
      <label className="npick__search" htmlFor={`${uid}-q`}>
        <IconSearch />
        <input id={`${uid}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tn("pickerPh")} aria-label={tn("pickerPh")} autoComplete="off" aria-describedby={describedBy} />
      </label>

      {picked.length ? (
        <ul className="npick__chips" aria-label={tn("selectedN", { n: picked.length })}>
          {picked.map((p) => (
            <li key={p.id}>
              <PersonAvatar p={p} />
              <span>{title(p)}</span>
              <button type="button" onClick={() => onToggle(p)} aria-label={tn("removeOne", { name: title(p) })} title={tn("removeOne", { name: title(p) })}>
                <IconClose />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {short ? (
        <p className="nrcp__hint npick__note">{tn("pickerHint", { n: MIN_CHARS })}</p>
      ) : busy ? (
        <Skeleton rows={3} />
      ) : found?.status === "denied" ? (
        <InlineAlert tone="info" compact>
          {tn("pickerDenied")}
        </InlineAlert>
      ) : found?.status === "error" ? (
        <InlineAlert tone="error" compact action={{ label: tc("retry"), onClick: () => setRev((r) => r + 1) }}>
          {tn("usersError")}
        </InlineAlert>
      ) : !found?.items.length ? (
        <p className="advmuted">{tn("noUsers")}</p>
      ) : (
        <div className="nrcp__list" role="group" aria-label={tn("recipients")}>
          {found.items.map((p) => {
            const on = selected.has(p.id);
            return (
              <button key={p.id} type="button" className={`nrcp__row${on ? " on" : ""}`} aria-pressed={on} onClick={() => onToggle(p)}>
                <span className="nrcp__cb" aria-hidden>
                  <IconCheck />
                </span>
                <PersonAvatar p={p} />
                <span className="nrcp__m">
                  <b>{title(p)}</b>
                  <small>{[p.phone, p.lexgoId ? `LexGo ID ${p.lexgoId}` : ""].filter(Boolean).join(" · ")}</small>
                </span>
                {p.role ? <i className="atag atag--muted">{roleLabel(p.role)}</i> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
