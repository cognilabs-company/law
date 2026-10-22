"use client";

import "./sx-audience.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { BriefcaseBusiness, CircleHelp, Globe, LockKeyhole, Settings2, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import type { SxFieldAudience } from "./audience";

// The line under a Studio text field: who will read what is typed here (a
// coloured badge) and what it is used for.

const ICON: Readonly<Record<SxFieldAudience["who"], LucideIcon>> = {
  client: UserRound,
  performer: BriefcaseBusiness,
  both: UsersRound,
  public: Globe,
  staff: LockKeyhole,
  system: Settings2,
  unset: CircleHelp,
};

export function AudienceNote({ aud }: { aud: SxFieldAudience }): ReactElement {
  const t = useTranslations("studio");
  const Icon = ICON[aud.who];
  const use = `sx.aud.use.${aud.use}`;
  return (
    <span className="sx-aud" data-who={aud.who}>
      <span className="sx-aud__who">
        <Icon aria-hidden size={13} strokeWidth={2.2} />
        <span className="sx-vh">{t("sx.aud.who.label")}: </span>
        {t(`sx.aud.who.${aud.who}`)}
      </span>
      {t.has(use) ? <span className="sx-aud__use">{t(use)}</span> : null}
    </span>
  );
}
