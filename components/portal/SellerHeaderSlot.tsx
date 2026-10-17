"use client";

import "./sellerSlot.css";
import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { openRulesDrawer, useRulesGate } from "@/lib/services/rulesGate";
import RulesDrawer from "@/components/services/rules/RulesDrawer";
import LocationPill from "@/components/services/location/LocationPill";
import { IconShieldCheck } from "../icons";

function RulesNudge({ uid }: { uid: string }): ReactElement | null {
  const t = useTranslations("portal.sellerSlot");
  const gate = useRulesGate(uid);
  if (!gate.closed) return null;
  const n = gate.missing.length;
  const label = `${t("rules")}. ${t("rulesLabel", { n })}`;
  return (
    <button type="button" className="pslot-rules" aria-label={label} title={label} data-ai-id="header.rules-nudge" onClick={() => openRulesDrawer()}>
      <IconShieldCheck aria-hidden="true" />
      <span className="pslot-rules__t">{t("rules")}</span>
      {n ? (
        <b className="pslot-rules__n" aria-hidden="true">
          {n > 9 ? "9+" : n}
        </b>
      ) : null}
    </button>
  );
}

export default function SellerHeaderSlot({ role, quiet, desk }: { role: "lawyer" | "advocate"; quiet?: boolean; desk?: boolean }): ReactElement {
  const { session } = useAuth();
  const uid = session?.role === role ? session.id : "";
  if (quiet) {
    return (
      <>
        <LocationPill quiet desk={desk} />
        <RulesDrawer />
      </>
    );
  }
  return (
    <div className="pslot">
      <RulesNudge uid={uid} />
      <LocationPill quiet={quiet} />
      <RulesDrawer />
    </div>
  );
}
