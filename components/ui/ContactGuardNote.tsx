"use client";

import "./contactGuard.css";
import { useState, type SyntheticEvent } from "react";
import { useTranslations } from "next-intl";
import { IconLock, IconShieldCheck } from "@/components/icons";
import { stripContacts, type ContactHit } from "@/lib/contactGuard";

// Under a lawyer's experience text: the standing "LexGo checks this" line,
// and — when the text carries a phone number, a username, an e-mail, a
// messenger or a link — what was found and why it cannot be saved. A
// refusal from the backend (platform_contact_blocked) shows here too, and
// so does what useContactStrip already took out of the text.

export type ContactRefusal = { message: string; preview?: string };

export default function ContactGuardNote({ id, hits, removed = [], server = null }: { id?: string; hits: readonly ContactHit[]; removed?: readonly ContactHit[]; server?: ContactRefusal | null }) {
  const t = useTranslations("common.contactGuard");
  const blocked = hits.length > 0 || removed.length > 0 || !!server;
  const shown = [...hits, ...removed];
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
                {shown.map((h, i) => (
                  <span key={`${h.kind}-${i}`} className="cgn__hit">
                    <small>{t(`kind.${h.kind}`)}</small>
                    <code>{h.text}</code>
                  </span>
                ))}
              </span>
            ) : server?.preview ? (
              <em>{server.preview}</em>
            ) : null}
            <span className="cgn__why">{server?.message || (hits.length ? t("why") : t("removed"))}</span>
          </span>
        </div>
      ) : null}
      <p className="cgn__ok">
        <IconShieldCheck aria-hidden="true" />
        <span>{t("verified")}</span>
      </p>
    </div>
  );
}

// Keeps contact details out of a field: what the lawyer types or pastes
// goes through stripContacts, and what it took stays listed in the note
// until reset() (a new entry, another service).
export function useContactStrip(set: (text: string) => void) {
  const [removed, setRemoved] = useState<ContactHit[]>([]);
  const apply = (text: string, all: boolean, el?: HTMLTextAreaElement | HTMLInputElement | null) => {
    const r = stripContacts(text, all);
    if (r.removed.length) setRemoved(r.removed);
    set(r.text);
    // A cut before the caret would throw it to the end; put it back.
    if (el && r.text !== text && el.selectionStart != null) {
      const caret = Math.max(0, el.selectionStart - (text.length - r.text.length));
      requestAnimationFrame(() => el.setSelectionRange(caret, caret));
    }
  };
  return {
    removed,
    reset: () => setRemoved([]),
    change: (text: string, e?: SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const kind = (e?.nativeEvent as InputEvent | undefined)?.inputType ?? "";
      apply(text, kind === "insertFromPaste" || kind === "insertFromDrop", e?.currentTarget);
    },
    blur: (text: string) => apply(text, true),
  };
}
