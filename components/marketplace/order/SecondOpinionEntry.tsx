"use client";

import "./secondOpinionEntry.css";
import { useId, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { ArrowRightIcon, ScaleIcon, UsersRoundIcon } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { hasAdminAccess, useAuth } from "@/lib/auth";
import { setReturnTo } from "@/lib/returnTo";
import { GROUP_KIND } from "@/lib/services/secondOpinion";

export const SINGLE_KIND = "second_opinion_single";

export function secondOpinionHref(kind: string): string {
  return `/portal/client/urgent?service=${encodeURIComponent(kind)}`;
}

const ICON = { size: 18, strokeWidth: 1.75, "aria-hidden": true } as const;

export default function SecondOpinionEntry({ layout = "strip", aiId }: { layout?: "strip" | "side"; aiId: string }): ReactElement | null {
  const t = useTranslations("marketplace.secondOpinionEntry");
  const router = useRouter();
  const { session, ready } = useAuth();
  const titleId = useId();
  if (session && (session.role !== "client" || hasAdminAccess(session))) return null;

  const guest = ready && !session;
  const go = (kind: string) => {
    const href = secondOpinionHref(kind);
    setReturnTo(href);
    router.push("/login");
  };

  const action = (kind: string, label: string, primary: boolean, icon: ReactElement) => {
    const className = `btn ${primary ? "btn--grad" : "btn--line"} sxo-entry__btn`;
    const id = `${aiId}.${kind === GROUP_KIND ? "group" : "single"}`;
    const body = (
      <>
        {icon}
        <span>{label}</span>
        {primary ? <ArrowRightIcon {...ICON} className="sxo-entry__go" /> : null}
      </>
    );
    return guest ? (
      <button type="button" className={className} onClick={() => go(kind)} data-ai-id={id} data-ai-type="button" data-ai-label={label}>
        {body}
      </button>
    ) : (
      <Link href={secondOpinionHref(kind)} className={className} data-ai-id={id} data-ai-type="link" data-ai-label={label}>
        {body}
      </Link>
    );
  };

  return (
    <section className={`sxo-entry sxo-entry--${layout}`} aria-labelledby={titleId} data-ai-id={aiId} data-ai-type="section" data-ai-label={t("title")}>
      <span className="sxo-entry__mark" aria-hidden="true">
        <UsersRoundIcon size={22} strokeWidth={1.75} />
      </span>
      <div className="sxo-entry__text">
        <h2 className="sxo-entry__title" id={titleId}>
          {t("title")}
        </h2>
        <p className="sxo-entry__lead">{t("lead")}</p>
        <p className="sxo-entry__note">{t("note")}</p>
      </div>
      <div className="sxo-entry__acts">
        {action(GROUP_KIND, t("group"), true, <UsersRoundIcon {...ICON} />)}
        {action(SINGLE_KIND, t("single"), false, <ScaleIcon {...ICON} />)}
      </div>
      {guest ? <p className="sxo-entry__login">{t("loginHint")}</p> : null}
    </section>
  );
}
