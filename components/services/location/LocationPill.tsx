"use client";

import "./location.css";
import { useEffect, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { fmtDuration } from "@/lib/date";
import { notify } from "@/lib/toast";
import { IconMapPin } from "@/components/icons";
import Menu, { menuHeading, menuSeparator, type MenuEntry } from "@/components/ui/Menu";
import { useDeskEmbedded } from "@/components/portal/desk/deskMode";
import { locationShareSnapshot, stopSharing, useLocationRunner, useLocationShare, useShareNow } from "@/lib/services/locationShare";

function clock(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

export default function LocationPill({ quiet, desk }: { quiet?: boolean; desk?: boolean }): ReactElement | null {
  const t = useTranslations("portal");
  const locale = useLocale();
  const { session } = useAuth();
  const uid = session?.id ?? "";
  const embedded = useDeskEmbedded();
  useLocationRunner(uid, !embedded, t("sellerSlot.locExpired"));
  const share = useLocationShare(uid);
  const on = share.mode === "on";
  const stopFailed = share.error?.kind === "stop" && share.mode === "off";
  const now = useShareNow(on && !quiet);
  const deskStop = Boolean(desk) && !embedded && on && !!uid;
  const deskText = t("sellerSlot.locDeskStopped");
  const failText = t("sellerSlot.locStopFailed");
  useEffect(() => {
    if (!deskStop || locationShareSnapshot().mode !== "on") return;
    void stopSharing(uid).then((ok) => {
      if (ok) notify.info(deskText);
      else notify.error(failText);
    });
  }, [deskStop, uid, deskText, failText]);
  if (quiet || !uid || embedded || (!on && !stopFailed)) return null;

  const role = session?.role === "lawyer" ? "lawyer" : "advocate";
  const stop = async () => {
    const ok = await stopSharing(uid);
    if (ok) notify.success(t("sellerSlot.locStopped"));
    else notify.error(t("sellerSlot.locStopFailed"));
  };

  const timed = on && !share.manual && share.until !== null;
  const leftMs = timed && share.until !== null ? Math.max(60_000, share.until - now) : 0;
  const left = timed ? fmtDuration(leftMs / 1000, locale) : "";
  const every = fmtDuration(share.policy.foregroundIntervalSec, locale);
  const label = stopFailed ? t("sellerSlot.locStopFailed") : timed ? t("sellerSlot.locPill", { time: left }) : t("sellerSlot.locPillManual");

  const items: MenuEntry[] = [menuHeading("title", t("sellerSlot.locTitle"))];
  if (stopFailed) {
    items.push({ key: "failed", label: t("sellerSlot.locStopFailed"), disabled: true });
  } else {
    items.push({ key: "left", label: timed ? t("sellerSlot.locLeft", { time: left }) : t("sellerSlot.locManual"), disabled: true });
    items.push({ key: "every", label: t("sellerSlot.locEvery", { time: every }), disabled: true });
    if (share.error?.kind === "denied") items.push({ key: "perm", label: t("sellerSlot.locPermission"), disabled: true });
  }
  items.push(
    { key: "manage", label: t("sellerSlot.locManage"), href: `/portal/${role}/services`, icon: <IconMapPin />, aiId: "header.location-pill.manage" },
    menuSeparator("sep"),
    { key: "stop", label: t("sellerSlot.locStop"), danger: true, onSelect: () => void stop(), aiId: "header.location-pill.stop" },
  );

  return (
    <Menu
      items={items}
      label={t("sellerSlot.locMenu")}
      triggerLabel={label}
      caret={false}
      align="end"
      triggerClassName="pslot-loc"
      aiId="header.location-pill"
      minWidth={260}
      text={
        <>
          <span className="pslot-loc__pin" aria-hidden="true">
            <IconMapPin />
            <i className="pslot-loc__dot" data-state={stopFailed ? "warn" : "on"} />
          </span>
          {timed ? (
            <>
              <span className="pslot-loc__full" aria-hidden="true">
                {left}
              </span>
              <span className="pslot-loc__short" aria-hidden="true">
                {clock(leftMs)}
              </span>
            </>
          ) : null}
        </>
      }
    />
  );
}
