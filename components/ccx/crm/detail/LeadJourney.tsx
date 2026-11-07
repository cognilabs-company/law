"use client";

import { useTranslations } from "next-intl";
import { isFinalStatus, journeyOf, type CrmMeta } from "@/lib/services/crm";
import { Journey } from "../../panel/Journey";
import { useStatusName } from "../leads/util";
import { StatusGlyph, statusTone } from "./kit";

// A lead's stage, read-only, on the shared journey track.
export function LeadJourney({ meta, status }: { meta: CrmMeta; status: string }) {
  const t = useTranslations("crm.glance");
  const label = useStatusName();
  const journey = journeyOf(meta, status);
  const tone = statusTone(meta, status);
  return (
    <Journey
      label={t("track")}
      at={journey.indexOf(status)}
      ended={isFinalStatus(meta, status) ? (tone === "hot" ? "hot" : tone === "ok" ? "" : "mute") : ""}
      steps={journey.map((s) => ({ key: s, label: label(s), icon: <StatusGlyph status={s} size={16} /> }))}
    />
  );
}
