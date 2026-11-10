"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { searchUsers, type UserSearchResult } from "@/lib/services/backend";
import { isForbidden } from "@/lib/http";
import { initials } from "@/lib/lawyers";
import InlineAlert from "@/components/ui/InlineAlert";
import { IconCheck, IconSearch, IconUser, IconUsers } from "@/components/icons";

// A person to notify, always shown by name, avatar, role and phone; the id
// only travels to the send request.
export type PickedPerson = { id: string; name: string; phone: string; role: string; lexgoId: string; avatarUrl?: string };

export const personOfSearch = (u: UserSearchResult): PickedPerson => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, lexgoId: u.lexgoId, avatarUrl: u.avatarUrl });

const MIN_CHARS = 2;

type Found = { q: string; status: "ready" | "error" | "denied"; items: PickedPerson[] };

// A stable hue per name, so the same person keeps the same tinted initials
// everywhere on the page (row, tray chip, preview stack, results).
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function PersonAvatar({ p, size }: { p: Pick<PickedPerson, "name" | "avatarUrl">; size?: "sm" | "md" | "lg" }) {
  const style = { "--av-h": String(hueOf(p.name || "?")) } as CSSProperties;
  return (
    <span className={`nrcp__av${size ? ` nrcp__av--${size}` : ""}`} style={style} aria-hidden="true">
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

// Backend role → a colour family for the role chip. The chip text is always
// the translated role name; the code only picks the colour.
const ROLE_TONE: Record<string, string> = {
  client: "blue",
  yurist: "violet",
  advokat: "teal",
  advokat_tashkiloti: "amber",
  call_center: "pink",
  call_center_lawyer: "pink",
  sales: "green",
  admin: "slate",
  superadmin: "slate",
};
export const roleTone = (role: string) => ROLE_TONE[role] ?? "slate";

// One person in a result list: avatar, bold name, readable phone (and the
// human LexGo ID), the role as a coloured chip; picked = accent border + check.
export function PersonRow({ p, on, onToggle, roleLabel, title }: { p: PickedPerson; on: boolean; onToggle: () => void; roleLabel: (role: string) => string; title: string }) {
  return (
    <button type="button" className={`nrcp__row${on ? " on" : ""}`} aria-pressed={on} onClick={onToggle}>
      <PersonAvatar p={p} size="md" />
      <span className="nrcp__m">
        <b>{title}</b>
        <small>
          {p.phone ? <span className="nrcp__ph">{p.phone}</span> : null}
          {p.lexgoId ? <span>LexGo ID {p.lexgoId}</span> : null}
        </small>
      </span>
      {p.role ? <i className={`nrole nrole--${roleTone(p.role)}`}>{roleLabel(p.role)}</i> : null}
      <span className="nrcp__cb" aria-hidden>
        <IconCheck />
      </span>
    </button>
  );
}

export function PeopleSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="nrcp__skel" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="nrcp__skrow">
          <i className="nrcp__skav" />
          <span>
            <i style={{ width: `${46 + ((i * 17) % 30)}%` }} />
            <i style={{ width: `${28 + ((i * 11) % 18)}%` }} />
          </span>
        </span>
      ))}
    </div>
  );
}

// A calm, designed empty state (start typing / nobody found).
export function PeopleEmpty({ title, hint, search }: { title: string; hint: string; search?: boolean }) {
  return (
    <div className="nrcp__empty">
      <span className="nrcp__emptyic" aria-hidden="true">
        {search ? <IconSearch /> : <IconUsers />}
      </span>
      <b>{title}</b>
      <small>{hint}</small>
    </div>
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

  return (
    <div className="npick">
      <label className="nsearch" htmlFor={`${uid}-q`}>
        <IconSearch />
        <input id={`${uid}-q`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tn("pickerPh")} aria-label={tn("pickerPh")} autoComplete="off" aria-describedby={describedBy} />
      </label>

      {short ? (
        <PeopleEmpty search title={tn("searchStart")} hint={tn("pickerHint", { n: MIN_CHARS })} />
      ) : busy ? (
        <PeopleSkeleton />
      ) : found?.status === "denied" ? (
        <InlineAlert tone="info" compact>
          {tn("pickerDenied")}
        </InlineAlert>
      ) : found?.status === "error" ? (
        <InlineAlert tone="error" compact action={{ label: tc("retry"), onClick: () => setRev((r) => r + 1) }}>
          {tn("usersError")}
        </InlineAlert>
      ) : !found?.items.length ? (
        <PeopleEmpty title={tn("noResultTitle")} hint={tn("noResultHint")} />
      ) : (
        <div className="nrcp__list" role="group" aria-label={tn("recipients")}>
          {found.items.map((p) => (
            <PersonRow key={p.id} p={p} on={selected.has(p.id)} onToggle={() => onToggle(p)} roleLabel={roleLabel} title={title(p)} />
          ))}
        </div>
      )}
    </div>
  );
}
