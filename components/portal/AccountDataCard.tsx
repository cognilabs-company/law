"use client";

import "./accountData.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { IconDownload, IconFolder, IconTrash } from "@/components/icons";

// The user's own data from the profile: a copy of it, and deleting the
// account. The backend has no self-service export or deletion endpoint yet
// (launch compliance 2026-11-01, asked for in the backend requests), so the
// download says so plainly and points to support, and deletion opens the
// published deletion page, which explains what is deleted and kept and how
// the request is sent. Nothing here pretends to export or delete.
export default function AccountDataCard({ supportHref }: { supportHref: string }): ReactElement {
  const t = useTranslations("accountData");
  return (
    <section className="ppanel accdata" aria-labelledby="accdata-t" data-ai-id="profile.account-data" data-ai-type="section">
      <div className="ppanel__h">
        <b className="ppanel__t" id="accdata-t">
          <span className="pico">
            <IconFolder />
          </span>
          {t("title")}
        </b>
      </div>
      <p className="accdata__lead">{t("lead")}</p>
      <div className="accdata__grid">
        <div className="accdata__i">
          <span className="accdata__ic" aria-hidden>
            <IconDownload />
          </span>
          <b>
            {t("download.title")}
            <span className="accdata__soon">{t("soon")}</span>
          </b>
          <p>{t("download.text")}</p>
          <div className="accdata__acts">
            <button type="button" className="btn btn--soft btn--sm" disabled aria-describedby="accdata-dl-why">
              <IconDownload />
              {t("download.button")}
            </button>
            <Link href={supportHref} className="btn btn--line btn--sm" data-ai-id="profile.account-data.ask-copy">
              {t("download.ask")}
            </Link>
          </div>
          <span id="accdata-dl-why" className="sr-only">
            {t("download.why")}
          </span>
        </div>
        <div className="accdata__i accdata__i--del">
          <span className="accdata__ic" aria-hidden>
            <IconTrash />
          </span>
          <b>{t("delete.title")}</b>
          <p>{t("delete.text")}</p>
          <div className="accdata__acts">
            <Link href="/legal/account-deletion" className="btn btn--line btn--sm accdata__del" data-ai-id="profile.account-data.delete">
              <IconTrash />
              {t("delete.button")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
