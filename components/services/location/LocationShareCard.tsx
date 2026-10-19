"use client";

import "./location.css";
import { useEffect, useId, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { fmtDuration } from "@/lib/date";
import { IconMapPin } from "@/components/icons";
import { shareStale, stopSharing, syncLocationShare, useLocationShare, useShareNow, type ShareErrorKind } from "@/lib/services/locationShare";
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
  const server = share.server;
  const remote = !on && share.mode !== "stopping" && server?.enabled === true;
  const now = useShareNow(on || remote);
  useEffect(() => {
    if (uid) void syncLocationShare(uid);
  }, [uid]);
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
  const remoteLeft = remote && server && !server.manual && server.until !== null ? fmtDuration(Math.max(60, (server.until - now) / 1000), locale) : "";
  const line =
    share.mode === "on"
      ? share.manual
        ? t("location.textOnManual")
        : t("location.textOn", { time: left })
      : remote
        ? remoteLeft
          ? t("location.textRemote", { time: remoteLeft })
          : t("location.textRemoteManual")
        : share.mode === "unknown"
          ? t("location.textUnknown")
          : t("location.textOff");
  const localSent = on && share.lastSentAt !== null;
  const sentAt = localSent ? share.lastSentAt : (on || remote) && server?.updatedAt ? server.updatedAt : null;
  const sinceMs = sentAt !== null ? Math.max(0, now - sentAt) : null;
  const acc = localSent ? share.lastAccuracy : (server?.accuracy ?? null);
  const meters = acc !== null ? Math.max(1, Math.round(acc)) : null;
  const sent =
    sinceMs === null
      ? ""
      : meters === null
        ? sinceMs < 60_000
          ? t("location.lastServerNow")
          : t("location.lastServer", { time: fmtDuration(sinceMs / 1000, locale) })
        : sinceMs < 60_000
          ? t("location.lastSentNow", { m: meters })
          : t("location.lastSent", { time: fmtDuration(sinceMs / 1000, locale), m: meters });
  const stale = remote && shareStale(server, now);
  const policy = on || remote ? t("location.policyLine", { time: fmtDuration(share.policy.foregroundIntervalSec, locale), days: share.policy.retentionDays }) : "";
  const err = share.error;
  const errText = !err ? "" : err.kind === "stop" ? tp("sellerSlot.locStopFailed") : on ? t(ERR_KEY[err.kind]) : "";
  const errId = `${titleId}-err`;
  const stopping = busy || share.mode === "stopping";
  const starting = share.mode === "starting";

  return (
    <section className="svm__notice svloc-card" data-state={remote ? "on" : share.mode} data-role={role} data-ai-id={AI} data-ai-type="section" aria-labelledby={titleId}>
      <span className="svm__nic svloc-card__ic" aria-hidden="true">
        <IconMapPin />
        {on || remote ? <i className="svloc-card__dot" /> : null}
      </span>
      <div className="svm__nt svloc-card__body">
        <b id={titleId}>{t("location.title")}</b>
        <p>{line}</p>
        {sent ? <p className="svloc-card__meta">{sent}</p> : null}
        {stale ? <p className="svloc-card__meta svloc-card__stale">{t("location.stale")}</p> : null}
        {policy ? <p className="svloc-card__meta">{policy}</p> : null}
        {errText ? (
          <p className="svloc-card__err" id={errId} role="alert">
            {errText}
          </p>
        ) : null}
      </div>
      <div className="svloc-card__acts">
        {on || remote || share.mode === "stopping" ? (
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
