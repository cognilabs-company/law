"use client";

import "../sx-tones.css";
import "./sx-settings.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { STUDIO_ROLES } from "@/lib/services/studio";
import { CheckIcon, InfoIcon, ShieldCheckIcon, glyph } from "../icons";
import { MATRIX, ROLE_HUE, ROLE_ICON, SET_AI } from "./model";
import { Card, CardHead, useRoleName } from "./parts";
import { MinusIcon } from "lucide-react";

export function RoleMatrix(): ReactElement {
  const t = useTranslations("studio");
  const roleName = useRoleName();
  const id = "sx-set-matrix-title";
  return (
    <Card className="sx-st-matrix" labelledBy={id} aiId={`${SET_AI}.access.legend`} aiLabel={t("sx.set.matrix.title")}>
      <CardHead icon={ShieldCheckIcon} hue="violet" id={id} title={t("sx.set.matrix.title")} lead={t("sx.set.matrix.lead")} />
      <div className="sx-st-matrix__scroll">
        <table className="sx-st-mx">
          <caption className="sx-vh">{t("sx.set.matrix.title")}</caption>
          <thead>
            <tr>
              <th scope="col" className="sx-st-mx__act">
                {t("sx.set.matrix.action")}
              </th>
              {STUDIO_ROLES.map((r) => {
                const Icon = ROLE_ICON[r];
                return (
                  <th key={r} scope="col" className="sx-st-mx__role" data-hue={ROLE_HUE[r]}>
                    <span className="sx-st-mx__rico" aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    <span className="sx-st-mx__rname">{roleName(r)}</span>
                    <span className="sx-st-mx__rshort">{t(`settings.roleInfo.${r}.short`)}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((row, i) => (
              <tr key={row.key} className="sx-enter" data-enter="fade" style={{ ["--i" as string]: Math.min(i, 12) }}>
                <th scope="row" className="sx-st-mx__act">
                  {t(`sx.set.matrix.rows.${row.key}`)}
                </th>
                {STUDIO_ROLES.map((r) => {
                  const yes = row.roles.includes(r);
                  return (
                    <td key={r} className="sx-st-mx__cell" data-hue={ROLE_HUE[r]} data-yes={yes ? "" : undefined}>
                      <span className="sx-st-mx__mark" aria-hidden="true">
                        {glyph(yes ? CheckIcon : MinusIcon, { size: 14, strokeWidth: yes ? 2.5 : 2 })}
                      </span>
                      <span className="sx-vh">{yes ? t("sx.set.matrix.yes") : t("sx.set.matrix.no")}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sx-st-matrix__note">
        {glyph(InfoIcon, { size: 16 })}
        <span>{t("settings.roleInfo.admins")}</span>
      </p>
    </Card>
  );
}
