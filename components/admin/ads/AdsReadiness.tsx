"use client";

import "./adsReadiness.css";
import { useEffect, useState, type ComponentType, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { IconPause, IconPlay, IconShieldCheck, IconStar, IconTarget, IconUsers } from "@/components/icons";
import { shortDateTime } from "@/lib/date";
import { toast } from "@/lib/toast";
import { ApiError, asDict, asStr, errDetail, http, isAborted, logApiError } from "@/lib/http";

// Whether advertising may be sold (TZ market conditions, contract
// 2026-10-26 §3): enough registered clients and really rated, verified
// sellers (demo, test and unverified records excluded by the backend). An
// admin switches selling on once the conditions are met, and can pause it;
// both are audited. Until then seller checkout answers 409.

type Gate = { current: number; required: number; met: boolean; excluded: number };
type Mode = "test" | "active" | "paused";
type Readiness = {
  ready: boolean;
  mode: Mode;
  checkoutEnabled: boolean;
  activatedAt: string;
  activatedBy: string;
  pausedAt: string;
  reason: string;
  clients: Gate | null;
  sellers: Gate | null;
  premiumMin: number | null;
};

const gateOf = (v: unknown): Gate | null => {
  const d = asDict(v);
  if (!Object.keys(d).length) return null;
  return { current: Number(d.current) || 0, required: Number(d.required) || 0, met: d.met === true, excluded: Number(d.excluded_nonproduction) || 0 };
};

export function readinessOf(v: unknown): Readiness {
  const d = asDict(v);
  const min = Number(d.premium_minimum_rating);
  const mode = asStr(d.mode).toLowerCase();
  const by = asDict(d.activated_by);
  return {
    ready: d.ready === true,
    mode: mode === "active" || mode === "paused" ? mode : "test",
    checkoutEnabled: d.checkout_enabled === true,
    activatedAt: asStr(d.activated_at),
    activatedBy: asStr(by.name ?? by.full_name ?? d.activated_by_name),
    pausedAt: asStr(d.paused_at),
    reason: asStr(d.reason),
    clients: gateOf(d.clients),
    sellers: gateOf(d.rated_verified_sellers),
    premiumMin: Number.isFinite(min) && min > 0 ? min : null,
  };
}

export default function AdsReadiness(): ReactElement | null {
  const t = useTranslations("admin.adsReadiness");
  const locale = useLocale();
  const [r, setR] = useState<Readiness | null>(null);
  const [reload, setReload] = useState(0);
  const [acting, setActing] = useState<"activate" | "pause" | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    http("/admin/marketplace/advertising-readiness", { signal: ctl.signal }).then(
      (v) => setR(readinessOf(v)),
      (e: unknown) => {
        if (!isAborted(e)) logApiError("ads.readiness", e);
      },
    );
    return () => ctl.abort();
  }, [reload]);

  if (!r) return null;
  const row = (label: string, g: Gate | null, Ico: ComponentType) => {
    if (!g) return null;
    const pct = g.required ? Math.min(100, Math.round((g.current / g.required) * 100)) : 0;
    return (
      <li data-met={g.met ? "" : undefined}>
        <span className="adsr__ico" aria-hidden="true">
          <Ico />
        </span>
        <span className="adsr__l">{label}</span>
        <span className="adsr__num">
          <b>{t("of", { current: g.current, required: g.required })}</b>
          <em>{pct}%</em>
        </span>
        <span className="adsr__bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={g.required} aria-valuenow={g.current}>
          <i style={{ width: `${pct}%` }} />
        </span>
        <small>
          {g.met ? t("met") : t("missing", { n: Math.max(0, g.required - g.current) })}
          {g.excluded ? ` · ${t("excluded", { n: g.excluded })}` : ""}
        </small>
      </li>
    );
  };
  const live = r.mode === "active";
  return (
    <section className="adsr" data-ready={r.ready ? "" : undefined} data-mode={r.mode} aria-label={t("title")} data-ai-target="ads:readiness">
      <header>
        <span className="adsr__hico" aria-hidden="true">
          <IconTarget />
        </span>
        <b>{t("title")}</b>
        <span className="adsr__state">{t(`mode.${r.mode}`)}</span>
        <span className="adsr__acts">
          {live ? (
            <button type="button" className="btn btn--line btn--sm" onClick={() => setActing("pause")} data-ai-id="admin.ads.pause-selling">
              <IconPause aria-hidden="true" />
              {t("pause")}
            </button>
          ) : (
            <button type="button" className="btn btn--pri btn--sm" onClick={() => setActing("activate")} disabled={!r.ready} title={r.ready ? undefined : t("activateLocked")} data-ai-id="admin.ads.activate-selling">
              <IconPlay aria-hidden="true" />
              {r.mode === "paused" ? t("reactivate") : t("activate")}
            </button>
          )}
        </span>
      </header>
      <p className="adsr__lead">{live ? t("activeText") : r.mode === "paused" ? t("pausedText") : r.ready ? t("readyText") : t("testOnlyText")}</p>
      {r.activatedAt || r.pausedAt ? (
        <p className="adsr__who">
          {live && r.activatedAt ? t("activatedAt", { date: shortDateTime(r.activatedAt, locale), name: r.activatedBy || "—" }) : null}
          {r.mode === "paused" && r.pausedAt ? t("pausedAt", { date: shortDateTime(r.pausedAt, locale) }) : null}
          {r.reason ? ` · ${r.reason}` : ""}
        </p>
      ) : null}
      <ul>
        {row(t("clients"), r.clients, IconUsers)}
        {row(t("sellers"), r.sellers, IconShieldCheck)}
      </ul>
      {r.premiumMin !== null ? (
        <p className="adsr__note">
          <IconStar />
          {t("premium", { n: r.premiumMin.toFixed(1) })}
        </p>
      ) : null}
      {acting ? (
        <ModeDialog
          kind={acting}
          onClose={() => setActing(null)}
          onDone={(next) => {
            setActing(null);
            if (next) setR(next);
            setReload((n) => n + 1);
          }}
        />
      ) : null}
    </section>
  );
}

function ModeDialog({ kind, onClose, onDone }: { kind: "activate" | "pause"; onClose: () => void; onDone: (next: Readiness | null) => void }): ReactElement {
  const t = useTranslations("admin.adsReadiness");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = reason.trim().length >= 3;

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr("");
    try {
      const v = await http(kind === "activate" ? "/admin/marketplace/advertising-activation" : "/admin/marketplace/advertising-pause", { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      toast(kind === "activate" ? t("activatedToast") : t("pausedToast"), { tone: "ok" });
      const d = asDict(v);
      onDone("mode" in d || "ready" in d ? readinessOf(d) : null);
    } catch (e) {
      logApiError(`ads.${kind}`, e);
      const code = e instanceof ApiError ? (e.code ?? "") : "";
      setErr(code && t.has(`err.${code}`) ? t(`err.${code}`) : errDetail(e) || t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={kind === "activate" ? t("activateTitle") : t("pauseTitle")}
      description={kind === "activate" ? t("activateText") : t("pauseText")}
      size="sm"
      busy={busy}
      dirty={!busy && !!reason.trim()}
      footer={
        <>
          <button type="button" className="btn btn--line" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button type="button" className={`btn ${kind === "activate" ? "btn--pri" : "adsr__danger"}`} onClick={() => void submit()} disabled={!ok || busy} aria-busy={busy || undefined}>
            {kind === "activate" ? <IconPlay aria-hidden="true" /> : <IconPause aria-hidden="true" />}
            {kind === "activate" ? t("activate") : t("pause")}
          </button>
        </>
      }
    >
      <label className="adsr__field">
        <span>{t("reason")}</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={255} placeholder={kind === "activate" ? t("activateReasonPh") : t("pauseReasonPh")} />
        <small>{t("reasonHint")}</small>
      </label>
      {err ? (
        <p className="adsr__err" role="alert">
          {err}
        </p>
      ) : null}
    </Modal>
  );
}
