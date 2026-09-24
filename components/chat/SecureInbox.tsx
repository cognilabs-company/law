"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { listSecureChats } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconShieldCheck, IconArrowRight, IconLock } from "@/components/icons";
import { statusLabel } from "@/lib/labels";

export default function SecureInbox() {
  const t = useTranslations("secureChat.inbox");
  const tc = useTranslations("portal.common");
  const res = useResource(listSecureChats, []);

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="advmuted">{res.data.length}</span>
      </div>

      <div className="sinbox__banner">
        <span className="sinbox__banner-i"><IconLock /></span>
        <span>{t("lead")}</span>
      </div>

      {res.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !res.data.length ? (
        <EmptyState icon={<IconShieldCheck />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="sinbox">
          {res.data.map((r, i) => (
            <Link key={r.id} href={`/portal/chat/${r.id}`} className="sinbox__item">
              <span className="sinbox__av">
                <IconShieldCheck />
              </span>
              <div className="sinbox__m">
                <b>{t("room")} #{i + 1}</b>
                <span className="sinbox__sub">
                  <IconLock />
                  {t("secured")}
                </span>
              </div>
              {r.status ? <span className={`sinbox__st sinbox__st--${r.status.toLowerCase()}`}>{statusLabel(tc, r.status)}</span> : null}
              <span className="sinbox__go"><IconArrowRight /></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
