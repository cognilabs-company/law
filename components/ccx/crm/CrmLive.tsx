"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { notify } from "@/lib/toast";
import { loadCrmMeta, useCrmEvents } from "@/lib/crm/useCrm";
import { crmHref, customerHref, leadHref } from "./nav";

const TONE: Record<string, "info" | "warning" | "success" | "error"> = {
  "crm.lead.created": "info",
  "crm.lead.reopened": "info",
  "crm.lead.assigned": "info",
  "crm.lead.transferred": "info",
  "crm.lead.watcher_added": "info",
  "crm.lead.next_action_due": "warning",
  "crm.lead.payment_confirmed": "success",
  "crm.ai.completed": "success",
  "crm.ai.failed": "error",
  "crm.call.completed": "info",
  "crm.automation.notification": "info",
  "crm.automation.escalated": "warning",
};

export default function CrmLive(): null {
  const t = useTranslations("crm.notify");
  const seen = useRef(new Map<string, number>());

  useCrmEvents((ev) => {
    if (ev.invalidate.includes("meta") || ev.invalidate.includes("all")) void loadCrmMeta(true);
    const tone = TONE[ev.name];
    if (!tone) return;
    const key = `${ev.name}:${ev.leadId || ev.runId || ev.exportId || ev.callId}`;
    const now = Date.now();
    if ((seen.current.get(key) ?? 0) > now - 4000) return;
    seen.current.set(key, now);
    const short = ev.name.replace(/^crm\./, "").replace(/\./g, "_");
    const href = ev.leadId ? leadHref(ev.leadId) : ev.customerId ? customerHref(ev.customerId) : crmHref("leads");
    notify[tone](ev.title || t(`ev.${short}`), { body: ev.body || undefined, action: { label: t("open"), href }, duration: 7000 });
  });

  return null;
}
