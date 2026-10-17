"use client";

import "./location.css";
import { useId, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { fmtDuration } from "@/lib/date";
import { IconMapPin } from "@/components/icons";
import { stopSharing, useLocationShare, useShareNow, type ShareErrorKind } from "@/lib/services/locationShare";
import LocationShareDialog from "./LocationShareDialog";

const ERR_KEY: Readonly<Record<ShareErrorKind, string>> = {
  denied: "location.errDenied",
  unavailable: "location.errUnavailable",
  timeout: "location.errTimeout",
  insecure: "location.errInsecure",
  unsupported: "location.errUnsupported",
  server: "location.errServer",
  stop: "location.errServer",
};

const AI = "advocate.services.location";

export default function LocationShareCard({ role }: { role: "lawyer" | "advocate" }): ReactElement | null {
  const t = useTranslations("sellerServices");
  const tp = useTranslations("portal");
  const locale = useLocale();
  const { session } = useAuth();
  const uid = session?.id ?? "";
  const share = useLocationShare(uid);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleId = `svloc-t-${useId().replace(/:/g, "")}`;
  const on = share.mode === "on";
  const now = useShareNow(on);
  if (!uid) return null;

  const stop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await stopSharing(uid);
    } finally {
      setBusy(false);
    }
  };

  const left = on && !share.manual && share.until !== null ? fmtDuration(Math.max(60, (share.until - now) / 1000), locale) : "";
  const line =
    share.mode === "on"
      ? share.manual
        ? t("location.textOnManual")
        : t("location.textOn", { time: left })
      : share.mode === "unknown"
        ? t("location.textUnknown")
        : t("location.textOff");
  const sinceMs = on && share.lastSentAt !== null ? now - share.lastSentAt : null;
  const meters = share.lastAccuracy !== null ? Math.max(1, Math.round(share.lastAccuracy)) : null;
  const sent =
    sinceMs === null || meters === null ? "" : sinceMs < 60_000 ? t("location.lastSentNow", { m: meters }) : t("location.lastSent", { time: fmtDuration(sinceMs / 1000, locale), m: meters });
  const err = share.error;
  const errText = !err ? "" : err.kind === "stop" ? tp("sellerSlot.locStopFailed") : on ? t(ERR_KEY[err.kind]) : "";
  const errId = `${titleId}-err`;
  const stopping = busy || share.mode === "stopping";
  const starting = share.mode === "starting";

  return (
    <section className="svm__notice svloc-card" data-state={share.mode} data-role={role} data-ai-id={AI} data-ai-type="section" aria-labelledby={titleId}>
      <span className="svm__nic svloc-card__ic" aria-hidden="true">
        <IconMapPin />
        {on ? <i className="svloc-card__dot" /> : null}
      </span>
      <div className="svm__nt svloc-card__body">
        <b id={titleId}>{t("location.title")}</b>
        <p>{line}</p>
        {sent ? <p className="svloc-card__meta">{sent}</p> : null}
        {errText ? (
          <p className="svloc-card__err" id={errId} role="alert">
            {errText}
          </p>
        ) : null}
      </div>
      <div className="svloc-card__acts">
        {on || share.mode === "stopping" ? (
          <button type="button" className="btn btn--line btn--sm" onClick={() => void stop()} disabled={stopping} aria-busy={stopping || undefined} aria-describedby={errText ? errId : undefined} data-ai-id={`${AI}.stop`} data-ai-type="button">
            {t("location.stop")}
          </button>
        ) : (
          <>
            {err?.kind === "stop" ? (
              <button type="button" className="btn btn--line btn--sm" onClick={() => void stop()} disabled={stopping} aria-busy={stopping || undefined} aria-describedby={errId} data-ai-id={`${AI}.retry-stop`} data-ai-type="button">
                {t("retry")}
              </button>
            ) : share.mode === "unknown" ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => void stop()} disabled={stopping} aria-busy={stopping || undefined} data-ai-id={`${AI}.turn-off`} data-ai-type="button">
                {t("location.stopUnknown")}
              </button>
            ) : null}
            <button type="button" className="btn btn--pri btn--sm" onClick={() => setDialog(true)} disabled={starting} aria-busy={starting || undefined} data-ai-id={`${AI}.start`} data-ai-type="button">
              <IconMapPin aria-hidden="true" />
              {t("location.start")}
            </button>
          </>
        )}
      </div>
      <LocationShareDialog open={dialog} onClose={() => setDialog(false)} />
    </section>
  );
}
