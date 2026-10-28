"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import Select from "@/components/Select";
import { IconAlert, IconCheck, IconCircleCheck, IconClipboardCheck, IconClock, IconCoins, IconFileText, IconHistory, IconLock, IconRefresh, IconScale, IconReply, IconShieldCheck } from "@/components/icons";
import { fmtAge, fmtNum } from "@/lib/date";
import { fmtUzs as fmtUzsRaw } from "@/lib/money";
import { isAborted, logApiError } from "@/lib/http";
import { getProviderReadiness, getReconciliationV2, type ProviderReadiness, type Readiness, type Reconciliation } from "@/lib/services/paymentProviders";
import "./payments.css";

// Each production requirement as an icon and a short line of what it means.
const REQ_ICON: Record<string, (p: { "aria-hidden"?: boolean }) => ReactElement> = {
  merchant_contract: IconFileText,
  provider_credentials: IconLock,
  signed_webhook: IconShieldCheck,
  idempotency: IconCheck,
  daily_reconciliation: IconScale,
  refund_support: IconReply,
  settlement_confirmation: IconCoins,
};

// TSK-664399: is Click / Payme ready to take real money, and do our payments
// match the providers' records? Read-only; ids never shown.
export default function PaymentProviders(): ReactElement {
  const t = useTranslations("admin.payments");
  const locale = useLocale();
  const [ready, setReady] = useState<Readiness | null>(null);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [provider, setProvider] = useState("");
  const [err, setErr] = useState(false);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(0);

  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        const [r, c] = await Promise.all([getProviderReadiness(signal), getReconciliationV2(provider, signal)]);
        setReady(r);
        setRecon(c);
        setErr(false);
        setNow(Date.now());
      } catch (e) {
        if (isAborted(e)) return;
        logApiError("admin.payments", e);
        setErr(true);
      }
    },
    [provider],
  );
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load, tick]);

  const pname = (k: string) => (t.has(`provider.${k}`) ? t(`provider.${k}`) : t("provider.other"));

  return (
    <div className="pmx">
      <header className="pmx__head">
        <div>
          <h2 className="pmx__title">{t("title")}</h2>
          <p className="pmx__lead">{t("lead")}</p>
        </div>
        <button type="button" className="pmx__refresh" onClick={() => setTick((n) => n + 1)} aria-label={t("refresh")}>
          <IconRefresh aria-hidden="true" />
          <span>{recon?.generatedAt && now ? t("checked", { ago: fmtAge(recon.generatedAt, locale, now) }) : t("refresh")}</span>
        </button>
      </header>

      {err && !ready ? (
        <div className="pmx__banner pmx__banner--bad" role="alert">
          <IconAlert aria-hidden="true" />
          <span>{t("loadError")}</span>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setTick((n) => n + 1)}>
            {t("retry")}
          </button>
        </div>
      ) : null}

      {ready && ready.flagged && !ready.allEnabled ? (
        <div className="pmx__banner" role="status">
          <IconShieldCheck aria-hidden="true" />
          <span>
            <b>{t("flagged.title")}</b> {t("flagged.text")}
          </span>
        </div>
      ) : null}

      <section className="pmx__cards" aria-label={t("providersLabel")}>
        {ready
          ? ready.providers.map((p, i) => <ProviderCard key={p.key} p={p} name={pname(p.key)} now={now} i={i} />)
          : [0, 1, 2].map((i) => <div key={i} className="pmx__card pmx__card--sk" aria-hidden="true" />)}
      </section>

      {ready && ready.requirements.length ? (
        <section className="pmx__panel" aria-labelledby="pmx-req">
          <h3 className="pmx__h" id="pmx-req">
            <IconClipboardCheck aria-hidden="true" />
            {t("req.title")}
            <small>{ready.allEnabled ? t("req.allDone") : t("req.needed", { n: ready.requirements.length })}</small>
          </h3>
          <ol className="pmx__reqs">
            {ready.requirements.map((r, i) => {
              const Icon = REQ_ICON[r] ?? IconCircleCheck;
              return (
                <li key={r} data-done={ready.allEnabled || undefined} style={{ ["--i" as string]: i }}>
                  <span className="pmx__reqi">
                    <Icon aria-hidden={true} />
                  </span>
                  <b>{t.has(`req.k.${r}`) ? t(`req.k.${r}`) : t("req.other")}</b>
                  {t.has(`req.d.${r}`) ? <small>{t(`req.d.${r}`)}</small> : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className="pmx__panel" aria-labelledby="pmx-rec">
        <div className="pmx__rechead">
          <h3 className="pmx__h" id="pmx-rec">
            <IconScale aria-hidden="true" />
            {t("rec.title")}
          </h3>
          <span className="pmx__sel">
            <Select
              value={provider}
              onChange={setProvider}
              ariaLabel={t("rec.filter")}
              options={[{ value: "", label: t("rec.all") }, ...(ready?.providers ?? []).map((p) => ({ value: p.key, label: pname(p.key) }))]}
            />
          </span>
        </div>
        {!recon ? (
          <div className="pmx__sk" aria-busy="true">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <Recon recon={recon} pname={pname} locale={locale} />
        )}
      </section>
    </div>
  );
}

function ProviderCard({ p, name, now, i }: { p: ProviderReadiness; name: string; now: number; i: number }): ReactElement {
  const t = useTranslations("admin.payments");
  const locale = useLocale();
  // The backend's own detail line, only when it is a sentence rather than a code.
  const detail = p.detail && /\s/.test(p.detail) && !/^[a-z0-9_.:-]+$/.test(p.detail) ? p.detail : "";
  return (
    <article className="pmx__card" data-tone={p.tone} data-p={p.key} style={{ ["--i" as string]: i }}>
      <div className="pmx__cardtop">
        <span className="pmx__mono" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
        <span className="pmx__cardname">
          <b>{name}</b>
          <small>{p.configured ? t("keys.on") : t("keys.off")}</small>
        </span>
        <span className="pmx__pill" data-tone={p.tone}>
          <i aria-hidden="true" />
          {t.has(`status.${p.status}`) ? t(`status.${p.status}`) : t(`tone.${p.tone}`)}
        </span>
      </div>
      <p className="pmx__cardtext">{t(`toneText.${p.tone}`)}</p>
      {detail ? <p className="pmx__detail">{detail}</p> : null}
      <div className="pmx__meta">
        {p.checkedAt && now ? (
          <span>
            <IconClock aria-hidden="true" />
            {t("checkedAgo", { ago: fmtAge(p.checkedAt, locale, now) })}
          </span>
        ) : null}
        {p.latencyMs !== null && p.latencyMs >= 1 ? (
          <span>
            <IconHistory aria-hidden="true" />
            {t("latency", { ms: fmtNum(p.latencyMs, locale) })}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function Recon({ recon, pname, locale }: { recon: Reconciliation; pname: (k: string) => string; locale: string }): ReactElement {
  const t = useTranslations("admin.payments.rec");
  const tp = useTranslations("admin.payments");
  const [more, setMore] = useState(false);
  const fmtUzs = (n: number) => `${fmtUzsRaw(n)} ${tp("som")}`;
  if (!recon.checkedCount && !recon.providers.length) {
    return (
      <div className="pmx__empty">
        <IconScale aria-hidden="true" />
        <b>{t("empty")}</b>
        <span>{t("emptyText")}</span>
      </div>
    );
  }
  const clean = recon.discrepancyCount === 0;
  const rows = more ? recon.discrepancies : recon.discrepancies.slice(0, 6);
  const statusOf = (s: string) => (tp.has(`pay.${s}`) ? tp(`pay.${s}`) : tp("pay.other"));
  return (
    <>
      <div className="pmx__tiles">
        <div className="pmx__tile">
          <small>{t("checked")}</small>
          <b>{fmtNum(recon.checkedCount, locale)}</b>
        </div>
        <div className="pmx__tile" data-tone={clean ? "ok" : "warn"}>
          <small>{t("mismatches")}</small>
          <b>{fmtNum(recon.discrepancyCount, locale)}</b>
        </div>
        <div className="pmx__tile">
          <small>{t("matched")}</small>
          <b>{recon.checkedCount ? `${Math.round(((recon.checkedCount - recon.discrepancyCount) / recon.checkedCount) * 100)}%` : "—"}</b>
        </div>
      </div>

      <ul className="pmx__prov">
        {recon.providers.map((p) => {
          const share = p.count ? Math.round((p.paidCount / p.count) * 100) : 0;
          return (
            <li key={p.provider}>
              <span className="pmx__provn">
                <b>{pname(p.provider)}</b>
                <small>{t("paidOf", { paid: fmtNum(p.paidCount, locale), all: fmtNum(p.count, locale) })}</small>
              </span>
              <span className="pmx__bar" role="img" aria-label={t("paidShare", { p: share })}>
                <span style={{ width: `${share}%` }} />
              </span>
              <span className="pmx__amt">
                <b>{fmtUzs(p.paidAmount)}</b>
                <small>{t("ofAmount", { amount: fmtUzs(p.amount) })}</small>
              </span>
              {p.discrepancies ? <span className="pmx__badge">{t("nMismatch", { n: p.discrepancies })}</span> : <span className="pmx__badge pmx__badge--ok">{t("ok")}</span>}
            </li>
          );
        })}
      </ul>

      {recon.reasons.length ? (
        <>
          <h4 className="pmx__sub">{t("why")}</h4>
          <ul className="pmx__reasons">
            {recon.reasons.map((g) => (
              <li key={g.reason}>
                <span className="pmx__reasonic">
                  <IconAlert aria-hidden="true" />
                </span>
                <span className="pmx__reasonm">
                  <b>{t.has(`reason.${g.reason}`) ? t(`reason.${g.reason}`) : t("reason.other")}</b>
                  <small>
                    {t.has(`reasonHelp.${g.reason}`) ? t(`reasonHelp.${g.reason}`) : t("reasonHelp.other")} · {g.providers.map(pname).join(", ")}
                  </small>
                </span>
                <span className="pmx__reasonn">
                  <b>{fmtNum(g.count, locale)}</b>
                  <small>{fmtUzs(g.amount)}</small>
                </span>
              </li>
            ))}
          </ul>
          <h4 className="pmx__sub">{t("rows")}</h4>
          <ul className="pmx__rows">
            {rows.map((r) => (
              <li key={r.key}>
                <span className="pmx__rowp">{pname(r.provider)}</span>
                <span className="pmx__rows-st" data-s={r.status}>
                  {statusOf(r.status)}
                </span>
                <span className="pmx__rows-why">{r.reasons.map((x) => (t.has(`reason.${x}`) ? t(`reason.${x}`) : t("reason.other"))).join(", ")}</span>
                <b className="pmx__rows-amt">{fmtUzs(r.amount)}</b>
              </li>
            ))}
          </ul>
          {recon.discrepancies.length > 6 ? (
            <button type="button" className="pmx__more" onClick={() => setMore((m) => !m)} aria-expanded={more}>
              {more ? t("less") : t("more", { n: recon.discrepancies.length - 6 })}
            </button>
          ) : null}
        </>
      ) : (
        <div className="pmx__clean">
          <IconCircleCheck aria-hidden="true" />
          {t("clean")}
        </div>
      )}
    </>
  );
}
