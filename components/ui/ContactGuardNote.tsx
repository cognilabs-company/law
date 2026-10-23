"use client";

import "./contactGuard.css";
import { useTranslations } from "next-intl";
import { IconLock, IconShieldCheck } from "@/components/icons";
import type { ContactHit } from "@/lib/contactGuard";

// Under a lawyer's experience text: the standing "LexGo checks this" line,
// and — when the text carries a phone number, a username, an e-mail, a
// messenger or a link — what was found and why it cannot be saved. A
// refusal from the backend (platform_contact_blocked) shows here too.

export type ContactRefusal = { message: string; preview?: string };

export default function ContactGuardNote({ id, hits, server = null }: { id?: string; hits: readonly ContactHit[]; server?: ContactRefusal | null }) {
  const t = useTranslations("common.contactGuard");
  const blocked = hits.length > 0 || !!server;
  return (
    <div id={id} className="cgn" data-blocked={blocked ? "" : undefined}>
      {blocked ? (
        <div className="cgn__bad" role="alert">
          <span className="cgn__ic" aria-hidden="true">
            <IconLock />
          </span>
          <span className="cgn__body">
            <b>{t("title")}</b>
            {hits.length ? (
              <span className="cgn__hits">
                {hits.map((h, i) => (
                  <span key={`${h.kind}-${i}`} className="cgn__hit">
                    <small>{t(`kind.${h.kind}`)}</small>
                    <code>{h.text}</code>
                  </span>
                ))}
              </span>
            ) : server?.preview ? (
              <em>{server.preview}</em>
            ) : null}
            <span className="cgn__why">{server?.message || t("why")}</span>
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
