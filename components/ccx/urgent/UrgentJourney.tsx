"use client";

import { useTranslations } from "next-intl";
import { IconChat } from "@/components/icons";
import { useUrgentStatuses } from "@/components/admin/UrgentAdvocateQueue";
import { humanize } from "@/lib/labels";
import type { UrgentRequest } from "@/lib/services/backend";
import { Journey } from "../panel/Journey";
import { IcCheck, IcClose, IcInbox, IcMeeting, IcShield, IcUser } from "../icons";
import { flowIndex, statusOf } from "./model";

// Yangi, Olingan, Advokat tanlandi, Uchrashuv, Yakunlangan: the request's way
// through the desk, on the same track as a lead.
export function UrgentJourney({ r }: { r: UrgentRequest }) {
  const t = useTranslations("admin.urgent");
  const tk = useTranslations("portal.client.urgent");
  const x = useTranslations("admin.ccx.urgent");
  const urg = useUrgentStatuses();
  const st = statusOf(r);
  const bad = st === "cancelled" || st === "expired";
  const steps = [
    { key: "open", label: urg.open_pool?.label ?? t("tabOpenPool"), icon: <IcInbox size={16} /> },
    { key: "claimed", label: urg.claimed?.label ?? t("tabClaimed"), icon: <IcUser size={16} /> },
    { key: "lawyer", label: x("flowLawyer"), icon: <IcShield size={16} /> },
    { key: "meeting", label: r.channel === "chat" ? tk("chChat") : x("flowMeeting"), icon: r.channel === "chat" ? <IconChat width={16} height={16} aria-hidden="true" /> : <IcMeeting size={16} /> },
    { key: "end", label: bad ? (urg[st]?.label ?? humanize(st)) : (urg.completed?.label ?? t("tabCompleted")), icon: bad ? <IcClose size={16} /> : <IcCheck size={16} /> },
  ];
  const ended = bad || st === "completed";
  return <Journey label={x("flowAria")} steps={steps} at={ended ? steps.length - 1 : flowIndex(r)} ended={bad ? "hot" : ""} />;
}
