"use client";

import "./contactGuard.css";
import { useRef, useState, type SyntheticEvent } from "react";
import { useTranslations } from "next-intl";
import { IconLock, IconShieldCheck } from "@/components/icons";
import { findContacts, stripContacts, type ContactHit } from "@/lib/contactGuard";

// Under a lawyer's experience text: the standing "LexGo checks this" line,
// and — when the text carries a phone number, a username, an e-mail, a
// messenger or a link — what was found and why it cannot be saved. A
// refusal from the backend (platform_contact_blocked) shows here too, and
// so does what useContactStrip already took out of the text.

export type ContactRefusal = { message: string; preview?: string };

// `verifiedLine`: the "verified by LexGo" reassurance, which only fits a
// profile field; a request form leaves it out.
// `peer`: who the writer must not reach outside LexGo — the client (a
// seller's profile, a lawyer's message) or the specialist (a client's).
export default function ContactGuardNote({
  id,
  hits,
  removed = [],
  server = null,
  verifiedLine = true,
  peer = "client",
}: {
  id?: string;
  hits: readonly ContactHit[];
  removed?: readonly ContactHit[];
  server?: ContactRefusal | null;
  verifiedLine?: boolean;
  peer?: "client" | "specialist" | "any";
}) {
  const t = useTranslations("common.contactGuard");
  const blocked = hits.length > 0 || removed.length > 0 || !!server;
  // Only the kind of each find, never its value: the note must not repeat
  // the number or the username it is keeping off the page.
  const shown = [...new Set([...hits, ...removed].map((h) => h.kind))];
  return (
    <div id={id} className="cgn" data-blocked={blocked ? "" : undefined}>
      {blocked ? (
        <div className="cgn__bad" role="alert">
          <span className="cgn__ic" aria-hidden="true">
            <IconLock />
          </span>
          <span className="cgn__body">
            <b>{t("title")}</b>
            {shown.length ? (
              <span className="cgn__hits">
                {shown.map((kind) => (
                  <span key={kind} className="cgn__hit">
                    {t(`kind.${kind}`)}
                  </span>
                ))}
              </span>
            ) : server?.preview ? (
              <em>{server.preview}</em>
            ) : null}
            <span className="cgn__why">{server?.message || (peer === "client" ? (hits.length ? t("why") : t("removed")) : t(hits.length ? `whyPeer.${peer}` : `removedPeer.${peer}`))}</span>
          </span>
        </div>
      ) : null}
      {verifiedLine ? (
        <p className="cgn__ok">
          <IconShieldCheck aria-hidden="true" />
          <span>{t("verified")}</span>
        </p>
      ) : null}
    </div>
  );
}

// What of the newly typed `added` still belongs to a contact just taken:
// the rest of a word (a username, an address), or for a phone number its
// remaining digits and separators until it is a whole number.
function eatOf(tail: ContactHit, added: string): { eaten: string; done: boolean } {
  if (tail.kind !== "phone") {
    const eaten = /^\S*/.exec(added)?.[0] ?? "";
    return { eaten, done: eaten.length < added.length };
  }
  const d = tail.text.replace(/\D/g, "");
  const limit = d.startsWith("998") ? 12 : tail.text.trim().startsWith("+") ? 15 : d.startsWith("8") ? 10 : 9;
  let n = d.length;
  let i = 0;
  for (; i < added.length && n < limit && /[\d\s().\-–]/.test(added[i]); i++) if (/\d/.test(added[i])) n++;
  return { eaten: added.slice(0, i), done: i < added.length || n >= limit };
}

// Keeps contact details out of a field: whatever the lawyer types or
// pastes goes through stripContacts, and what it took stays listed in the
// note until reset() (a new entry, another service). A contact taken while
// it was still being typed ("@akhm" of "@akhmad") keeps eating what is typed
// straight after it, up to the next space, so no tail ("ad") is left behind.
export function useContactStrip(set: (text: string) => void) {
  const [removed, setRemoved] = useState<ContactHit[]>([]);
  const last = useRef<string | null>(null);
  const eating = useRef<ContactHit | null>(null);
  // Right after a cut, a space typed next to a space would double it.
  const seam = useRef(false);
  const apply = (raw: string, finish: boolean, el?: HTMLTextAreaElement | HTMLInputElement | null) => {
    let text = raw;
    let eaten = "";
    const prev = last.current;
    const tail = eating.current;
    const appended = prev !== null && text.length > prev.length && text.startsWith(prev);
    if (appended && (tail || seam.current)) {
      const added = text.slice(prev.length);
      const bite = tail ? eatOf(tail, added) : { eaten: "", done: true };
      eaten = bite.eaten;
      let rest = added.slice(eaten.length);
      if (!prev || /\s$/.test(prev)) rest = rest.replace(/^[ \t]+/, "");
      text = prev + rest;
      if (bite.done) eating.current = null;
      if (/\S/.test(rest)) seam.current = false;
    } else {
      eating.current = null;
      seam.current = false;
    }
    const r = stripContacts(text, finish);
    if (r.removed.length) {
      setRemoved((cur) => [...cur, ...r.removed.filter((h) => !cur.some((c) => c.kind === h.kind && c.text === h.text))]);
      eating.current = finish ? null : r.tail;
      seam.current = !finish;
    } else if (eaten && tail) {
      // The note shows the whole contact, not just the part first caught.
      const grown = { ...tail, text: tail.text + eaten };
      if (eating.current) eating.current = grown;
      setRemoved((cur) => cur.map((h) => (h.kind === tail.kind && h.text === tail.text ? grown : h)));
    }
    last.current = r.text;
    set(r.text);
    // A cut before the caret would throw it to the end; put it back.
    if (el && r.text !== raw && el.selectionStart != null) {
      const caret = Math.max(0, el.selectionStart - (raw.length - r.text.length));
      requestAnimationFrame(() => el.setSelectionRange(caret, caret));
    }
  };
  return {
    removed,
    reset: () => {
      setRemoved([]);
      eating.current = null;
      seam.current = false;
      last.current = null;
    },
    change: (text: string, e?: SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) => apply(text, false, e?.currentTarget),
    blur: (text: string) => {
      eating.current = null;
      apply(text, true);
    },
  };
}

// One text field kept free of contact details: what to call on change and
// on blur, and the note to show under it. `set` receives the cleaned text.
export function useGuardedField(value: string, set: (text: string) => void, peer: "client" | "specialist" | "any" = "any") {
  const strip = useContactStrip(set);
  return {
    change: strip.change,
    blur: () => strip.blur(value),
    reset: strip.reset,
    blocked: findContacts(value).length > 0,
    note: <ContactGuardNote hits={findContacts(value)} removed={strip.removed} verifiedLine={false} peer={peer} />,
  };
}
