"use client";

import "./location.css";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { timeOnly } from "@/lib/date";
import { notify } from "@/lib/toast";
import { LOCATION_DURATIONS, marketErrorInfo, type LocationDuration } from "@/lib/services/marketRuntime";
import { FIX_MAX_AGE_MS, geoErrorKind, readPosition, startSharing, useLocationShare, useShareNow, type GeoFix, type ShareErrorKind } from "@/lib/services/locationShare";
import { SxDialog } from "@/components/admin/studio/sx/editor/SxDialog";
import { SxButton } from "@/components/admin/studio/sx/Button";
import { ChoiceCards, type ChoiceCard } from "@/components/admin/studio/sx/form/ChoiceCards";
import { SxNote } from "@/components/admin/studio/sx/layout/Note";
import { ArrowRightIcon, RefreshCwIcon, CheckIcon, TimerIcon, EyeOffIcon, HourglassIcon, ShieldCheckIcon, glyph } from "@/components/admin/studio/sx/icons";
import { LocateFixedIcon, MapPinIcon, NavigationIcon } from "./icons";

type Step = 1 | 2 | 3;

const GEO_ERR_KEY: Readonly<Partial<Record<ShareErrorKind, string>>> = {
  denied: "location.errDenied",
  unavailable: "location.errUnavailable",
  timeout: "location.errTimeout",
  insecure: "location.errInsecure",
  unsupported: "location.errUnsupported",
};

function hoursOf(choice: string): LocationDuration | undefined {
  if (choice === "manual") return null;
  const n = Number(choice);
  return (LOCATION_DURATIONS as readonly number[]).includes(n) ? (n as LocationDuration) : undefined;
}

export default function LocationShareDialog({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement {
  const t = useTranslations("sellerServices");
  const locale = useLocale();
  const { session } = useAuth();
  const uid = session?.id ?? "";
  const share = useLocationShare(uid);
  const [step, setStep] = useState<Step>(1);
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoErr, setGeoErr] = useState<ShareErrorKind | null>(null);
  const [choice, setChoice] = useState("");
  const [starting, setStarting] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setStep(1);
      setFix(null);
      setLocating(false);
      setGeoErr(null);
      setChoice("");
      setStarting(false);
      setServerErr(null);
    }
  }
  const now = useShareNow(open && step === 3);
  const close = () => {
    setFix(null);
    setChoice("");
    setGeoErr(null);
    setServerErr(null);
    onClose();
  };
  const base = useId().replace(/:/g, "");
  const durId = `svloc-dur-${base}`;
  const choicesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || step !== 3) return;
    const first = choicesRef.current?.querySelector<HTMLInputElement>("input[type=radio]:not(:disabled)");
    first?.focus({ preventScroll: true });
  }, [open, step]);

  const locate = async () => {
    if (locating) return;
    setLocating(true);
    setGeoErr(null);
    try {
      const f = await readPosition();
      setFix(f);
      setStep(3);
    } catch (e) {
      setGeoErr(geoErrorKind(e));
    } finally {
      setLocating(false);
    }
  };

  const confirm = async () => {
    const hours = hoursOf(choice);
    if (hours === undefined || !fix || starting || !uid) return;
    setStarting(true);
    setServerErr(null);
    setGeoErr(null);
    let f = fix;
    if (Date.now() - f.at > FIX_MAX_AGE_MS) {
      try {
        f = await readPosition();
        setFix(f);
      } catch (e) {
        setGeoErr(geoErrorKind(e));
        setStarting(false);
        return;
      }
    }
    try {
      await startSharing(uid, hours, f);
      notify.success(t("location.dialog.started"));
      setStarting(false);
      close();
    } catch (e) {
      setServerErr(marketErrorInfo(e)?.message ?? "");
      setStarting(false);
    }
  };

  const busy = locating || starting;
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: t("location.dialog.stepExplain") },
    { n: 2, label: t("location.dialog.stepAllow") },
    { n: 3, label: t("location.dialog.stepConfirm") },
  ];
  const meters = fix ? Math.max(1, Math.round(fix.accuracy)) : 0;
  const options: ChoiceCard[] = [
    ...LOCATION_DURATIONS.map((h) => ({
      value: String(h),
      title: t("location.dialog.hours", { n: h }),
      description: t("location.dialog.hoursHint", { time: timeOnly(new Date((now || 0) + h * 3_600_000).toISOString(), locale) }),
      icon: TimerIcon,
    })),
    { value: "manual", title: t("location.dialog.manual"), description: t("location.dialog.manualHint"), icon: RefreshCwIcon },
  ];
  const geoText = geoErr ? t(GEO_ERR_KEY[geoErr] ?? "location.errUnavailable") : "";

  const footer =
    step === 1 ? (
      <>
        <SxButton variant="secondary" onClick={close} aiId="seller.location.dialog.cancel">
          {t("form.cancel")}
        </SxButton>
        <SxButton variant="primary" iconEnd={ArrowRightIcon} onClick={() => setStep(2)} aiId="seller.location.dialog.next">
          {t("location.dialog.next")}
        </SxButton>
      </>
    ) : step === 2 ? (
      <>
        <SxButton variant="secondary" onClick={close} disabled={locating} aiId="seller.location.dialog.cancel">
          {t("form.cancel")}
        </SxButton>
        <SxButton variant="primary" icon={geoErr ? RefreshCwIcon : LocateFixedIcon} busy={locating} onClick={() => void locate()} aiId="seller.location.dialog.allow">
          {locating ? t("location.dialog.locating") : geoErr ? t("location.dialog.retry") : t("location.dialog.allow")}
        </SxButton>
      </>
    ) : (
      <>
        <SxButton variant="secondary" onClick={close} disabled={starting} aiId="seller.location.dialog.cancel">
          {t("form.cancel")}
        </SxButton>
        <SxButton variant="primary" icon={NavigationIcon} busy={starting} disabled={hoursOf(choice) === undefined} onClick={() => void confirm()} aiId="seller.location.dialog.confirm">
          {starting ? t("location.dialog.starting") : t("location.dialog.confirm")}
        </SxButton>
      </>
    );

  return (
    <SxDialog open={open} onClose={close} title={t("location.dialog.title")} size="md" aiId="seller.location.dialog" busy={busy} footer={footer}>
      <div className="svloc-dlg" data-step={step}>
        <ol className="svloc-steps">
          {steps.map((s) => (
            <li key={s.n} className="svloc-steps__i" data-state={s.n < step ? "done" : s.n === step ? "current" : "next"} aria-current={s.n === step ? "step" : undefined}>
              <span className="svloc-steps__n" aria-hidden="true">
                {s.n < step ? glyph(CheckIcon, { size: 14, strokeWidth: 2.5 }) : s.n}
              </span>
              <span className="svloc-steps__t">{s.label}</span>
            </li>
          ))}
        </ol>

        {step === 1 ? (
          <div className="svloc-explain">
            <span className="svloc-lead" aria-hidden="true">
              {glyph(MapPinIcon, { size: 28 })}
            </span>
            <ul className="svloc-points">
              <li>
                {glyph(NavigationIcon, { size: 18, "aria-hidden": true })}
                <span>{t("location.dialog.explain1")}</span>
              </li>
              <li>
                {glyph(EyeOffIcon, { size: 18, "aria-hidden": true })}
                <span>{t("location.dialog.explain2")}</span>
              </li>
              <li>
                {glyph(ShieldCheckIcon, { size: 18, "aria-hidden": true })}
                <span>{t("location.dialog.explain3")}</span>
              </li>
              <li>
                {glyph(HourglassIcon, { size: 18, "aria-hidden": true })}
                <span>{t("location.dialog.explain4", { days: share.policy.retentionDays })}</span>
              </li>
            </ul>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="svloc-allow">
            <span className="svloc-lead" aria-hidden="true">
              {glyph(LocateFixedIcon, { size: 28 })}
            </span>
            <p className="svloc-text">{t("location.dialog.allowHint")}</p>
            {locating ? (
              <p className="svloc-muted" role="status">
                {t("location.dialog.locating")}
              </p>
            ) : null}
            {geoErr ? (
              <SxNote tone="error" role="alert">
                {geoText}
              </SxNote>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="svloc-confirm" ref={choicesRef}>
            <SxNote tone="success" role="status">
              {t("location.dialog.located", { m: meters })}
            </SxNote>
            <p className="svloc-dlabel" id={`${durId}-label`}>
              {t("location.dialog.durationLabel")}
            </p>
            <div className="svloc-dur">
              <ChoiceCards id={durId} value={choice} onChange={setChoice} options={options} columns={3} required aiId="seller.location.dialog.duration" />
            </div>
            {geoErr ? (
              <SxNote tone="error" role="alert">
                {geoText}
              </SxNote>
            ) : null}
            {serverErr !== null ? (
              <SxNote tone="error" role="alert" title={t("location.errServer")}>
                {serverErr || undefined}
              </SxNote>
            ) : null}
          </div>
        ) : null}
      </div>
    </SxDialog>
  );
}
