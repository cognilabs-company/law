"use client";

import "./sx-settings.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import RoutesPanel from "@/components/admin/studio/settings/RoutesPanel";
import { SxButton } from "../Button";
import { CrownIcon, RefreshCwIcon } from "../icons";
import { SxNote } from "../layout/Note";
import { SET_AI, TAB_HUE, TAB_ICON } from "./model";
import { SectionHead } from "./parts";
import type { RoutesProbe } from "./useRoutesProbe";

export function RoutesSection({ probe }: { probe: RoutesProbe }): ReactElement {
  const t = useTranslations("studio");
  return (
    <div className="sx-st-stack">
      <SectionHead icon={TAB_ICON.routes} hue={TAB_HUE.routes} title={t("sx.set.nav.routes.title")} lead={t("settings.routes.lead")} titleId="sx-set-routes-title" />
      {probe.phase === "loading" ? (
        <div className="sx-st-card sx-st-sk" role="status" aria-busy="true">
          <span className="sx-vh">{t("sx.ui.loading")}</span>
          <span className="sx-sk" aria-hidden="true" />
          <span className="sx-sk" aria-hidden="true" />
          <span className="sx-sk" aria-hidden="true" />
        </div>
      ) : probe.phase === "denied" ? (
        <SxNote tone="info" icon={CrownIcon} title={t("sx.set.routes.deniedTitle")} role="note">
          {t("sx.set.routes.deniedText")}
        </SxNote>
      ) : probe.phase === "error" ? (
        <SxNote
          tone="error"
          title={t("sx.ui.errorTitle")}
          action={
            <SxButton variant="ghost" size="sm" icon={RefreshCwIcon} onClick={probe.recheck} aiId={`${SET_AI}.routes.retry`}>
              {t("sx.ui.retry")}
            </SxButton>
          }
        >
          {t("sx.ui.loadFail")}
        </SxNote>
      ) : (
        <div className="sx-st-legacy">
          <RoutesPanel />
        </div>
      )}
    </div>
  );
}
