"use client";

import { useEffect, useState } from "react";
import { asDict, asStr, http } from "@/lib/http";

// Names for the bare user ids call-centre records carry (a previous seller,
// a client, a recommended lawyer). The client card (GET
// /call-center/clients/{id}) answers for any user an operator may see; each
// id is asked once per page load and shared by every row that shows it.

export type Person = { id: string; name: string; phone: string; role: string };

const cache = new Map<string, Promise<Person | null>>();

export function lookupPerson(id: string): Promise<Person | null> {
  const key = id.trim();
  if (!key) return Promise.resolve(null);
  let p = cache.get(key);
  if (!p) {
    p = http(`/call-center/clients/${encodeURIComponent(key)}`)
      .then((d) => {
        const c = asDict(asDict(d).client ?? d);
        const name = asStr(c.full_name).trim() || asStr(c.name).trim();
        const phone = asStr(c.phone).trim();
        return name || phone ? { id: key, name, phone, role: asStr(c.role) } : null;
      })
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

// undefined while asking, null when the id has no name to show.
export function usePerson(id: string | null | undefined, known = ""): Person | null | undefined {
  const key = known.trim() ? "" : (id ?? "").trim();
  const [got, setGot] = useState<{ key: string; person: Person | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void lookupPerson(key).then((person) => {
      if (alive) setGot({ key, person });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  if (known.trim()) return { id: id ?? "", name: known.trim(), phone: "", role: "" };
  if (!key) return null;
  return got && got.key === key ? got.person : undefined;
}
