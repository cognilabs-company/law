"use client";

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import type { BackendService } from "@/lib/services/backend";
import {
  NOTE_MAX,
  SERVICE_STATUSES,
  isZeroBand,
  priceBandFor,
  profileVerified,
  serviceErrorOf,
  type ManagedService,
  type PriceBand,
  type ServiceError,
  type ServiceScope,
  type ServiceSellerProfile,
  type ServiceStatus,
} from "@/lib/services/sellerServices";
import { configSupport, lastSellerConfig, saveSellerService, type ConfigError } from "@/lib/services/sellerConfig";
import { IconAlert, IconCheck, IconCoins, IconEdit, IconEye, IconLayers, IconLock, IconPause, IconPlay, IconPower, IconScale } from "@/components/icons";
import { InBody, som } from "./bits";
import ServicePicker from "./ServicePicker";
import PriceField, { bandRecommended, digitsOf, priceAboveCap } from "./PriceField";
import MarketPreviewModal from "./MarketPreviewModal";
import { RequirementsLine } from "./RuntimeFactors";
import { useRuntimeConfig } from "./useRuntimeConfig";
import type { PreviewDraft } from "@/lib/marketPreview";
import "./config.css";

const POLICY_KEY = (uid: string) => `lexgo_price_policy_v2_${uid}`;

function withDetails(primary: PriceBand | null, extra: PriceBand | null): PriceBand | null {
  if (!primary) return extra;
  if (!extra) return primary;
  return { ...primary, base: primary.base ?? extra.base, modifiers: primary.modifiers ?? extra.modifiers };
}

const STATUS_ICON = { active: IconPlay, paused: IconPause, inactive: IconPower } as const;

function readPolicy(uid: string): boolean {
  try {
    return localStorage.getItem(POLICY_KEY(uid)) === "1";
  } catch {
    return false;
  }
}

function rememberPolicy(uid: string): void {
  try {
    localStorage.setItem(POLICY_KEY(uid), "1");
  } catch {
    return;
  }
}

type BandLoad = { key: string; band: PriceBand | null; failed: boolean; advocate: boolean };
type NegState = { key: string; on: boolean };
type RulesProp = {
  closed: boolean;
  open: (focusIds?: string[], serviceId?: string) => void;
  check: (serviceId: string) => Promise<{ allAccepted: boolean | null; missingIds: string[] }>;
};

export default function ServiceFormModal({
  item,
  scope,
  uid,
  sellerId,
  profile,
  lawyer,
  owner,
  taken,
  onClose,
  onSaved,
  onStale,
  aiId,
  rules,
  onPersist,
}: {
  item: ManagedService | null;
  scope: ServiceScope;
  uid: string;
  sellerId: string;
  profile: ServiceSellerProfile;
  lawyer: boolean;
  owner: boolean;
  taken: Set<string>;
  onClose: () => void;
  onSaved: (saved: ManagedService, created: boolean) => void;
  onStale?: () => void;
  aiId?: string;
  rules?: RulesProp | null;
  onPersist?: (saved: ManagedService) => void;
}) {
  const t = useTranslations("sellerServices");
  const tv = useTranslations("sellerServices.preview");
  const tm = useTranslations("marketplace.errors");
  const locale = useLocale();
  const ids = useId();
  const self = scope.kind === "me" && !owner;
  const [persisted, setPersisted] = useState<ManagedService | null>(item);
  const editing = Boolean(persisted);
  const [service, setService] = useState<BackendService | null>(item?.service ?? null);
  const [price, setPrice] = useState(item?.selectedPrice ? String(item.selectedPrice) : "");
  const [note, setNote] = useState(item?.experienceNote ?? "");
  const [status, setStatus] = useState<ServiceStatus>(item?.status ?? (rules?.closed ? "paused" : "active"));
  const [checking, setChecking] = useState(false);
  const [statusErr, setStatusErr] = useState("");
  const [cfgErr, setCfgErr] = useState<{ price: string; form: string } | null>(null);
  const [neg, setNeg] = useState<NegState | null>(null);
  const [agreed, setAgreed] = useState(() => readPolicy(uid));
  const [askPolicy] = useState(() => !readPolicy(uid));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ServiceError | null>(null);
  const [policyErr, setPolicyErr] = useState(false);
  const [priceReq, setPriceReq] = useState(false);
  const [bandLoad, setBandLoad] = useState<BandLoad | null>(null);
  const [serverBand, setServerBand] = useState<{ key: string; band: PriceBand } | null>(null);
  const [live, setLive] = useState(false);
  const [warm, setWarm] = useState(false);

  const region = profile.region;
  const serviceId = service?.id ?? "";
  const bandKey = `${serviceId}|${sellerId}|${region}`;
  const savedBand = persisted && persisted.id === serviceId ? persisted.limits : null;
  const runtimeLoad = useRuntimeConfig(serviceId);
  const runtime = runtimeLoad.config;
  const pricing = runtime?.pricing ?? null;
  const savedComplete = Boolean(savedBand && savedBand.base !== null && savedBand.modifiers !== null);

  useEffect(() => {
    if (!serviceId || savedComplete) return;
    let alive = true;
    priceBandFor(serviceId, sellerId, region)
      .then((band) => {
        if (alive) setBandLoad({ key: bandKey, band, failed: !band, advocate: false });
      })
      .catch((e: unknown) => {
        if (alive) setBandLoad({ key: bandKey, band: null, failed: true, advocate: serviceErrorOf(e).kind === "advocateOnly" });
      });
    return () => {
      alive = false;
    };
  }, [serviceId, sellerId, region, bandKey, savedComplete]);

  const loaded = bandLoad && bandLoad.key === bandKey ? bandLoad : null;
  const fromServer = serverBand && serverBand.key === serviceId ? serverBand.band : null;
  const band = withDetails(fromServer, withDetails(savedBand, loaded?.band ?? null));
  const bandState = !serviceId ? "idle" : band ? "ready" : loaded ? "failed" : "loading";
  const noPrice = isZeroBand(band) && !(pricing && pricing.recommendedPrice > 0);
  const n = noPrice ? 0 : Number(price || "0");
  const off = priceAboveCap(n, pricing);
  const advocateBlocked = Boolean(loaded?.advocate) || err?.kind === "advocateOnly";
  const remembered = serviceId ? lastSellerConfig(uid, serviceId) : null;
  const explanation = remembered && remembered.selectedPrice === n && (remembered.priceExplanation || remembered.priceExplanationLines.length) ? { text: remembered.priceExplanation, lines: remembered.priceExplanationLines } : null;
  const showNeg = self && Boolean(runtime?.negotiationAvailable) && configSupport() !== "no";
  const negInitial = persisted && persisted.id === serviceId && persisted.negotiationAllowed !== null ? persisted.negotiationAllowed : (remembered?.negotiationAllowed ?? null);
  const negTouched = neg !== null && neg.key === serviceId;
  const negOn = negTouched ? neg.on : negInitial === true;
  const sendNeg = showNeg && (negTouched || negInitial !== null);
  const activeLocked = Boolean(rules?.closed) && status !== "active";

  const errText = (e: ServiceError) => {
    if (e.kind === "range") return t("limits.serverRange", { min: som(e.min), max: som(e.max) });
    if (e.kind === "invalid" && e.detail) return e.detail;
    if (e.kind === "forbidden" && owner) return t("errors.forbiddenOwner");
    if (e.kind === "pendingAccount" && owner) return t("errors.pendingAccountOwner");
    return t(`errors.${e.kind}`);
  };

  const codeText = (code: string, values?: Record<string, string | number>) => (tm.has(code) ? tm(code, values) : "");

  const keep = (row: ManagedService) => {
    setPersisted(row);
    onPersist?.(row);
  };

  const applyConfigError = (error: ConfigError, rolledBack: boolean, id: string) => {
    if (error.field === "price") {
      const text = error.code === "seller_price_above_maximum" && error.maximum ? t("config.aboveMax", { max: som(error.maximum) }) : codeText(error.code) || error.message || t("config.configFailed");
      setCfgErr({ price: text, form: t("config.partialSaved") });
      return;
    }
    if (error.code === "service_rules_acceptance_required") {
      const head = codeText(error.code, { n: error.missingRuleIds.length });
      setStatusErr([head, rolledBack ? t("rules.savedNotEnabled") : ""].filter(Boolean).join(" "));
      rules?.open(error.missingRuleIds, id);
      return;
    }
    setCfgErr({ price: "", form: [t("config.configFailed"), error.message].filter(Boolean).join(" ") });
  };

  const save = async () => {
    if (busy || checking || !service) return;
    if (askPolicy && !agreed) {
      setPolicyErr(true);
      return;
    }
    if (n <= 0 && !noPrice) {
      setPriceReq(true);
      return;
    }
    if (off || advocateBlocked) return;
    setErr(null);
    setCfgErr(null);
    setStatusErr("");
    const enabling = status === "active" && (!persisted || persisted.status !== "active");
    if (self && rules && enabling) {
      if (rules.closed) {
        setStatusErr(t("rules.lockReason"));
        rules.open(undefined, service.id);
        return;
      }
      setChecking(true);
      let blocked = false;
      try {
        const r = await rules.check(service.id);
        if (r.allAccepted === false) {
          blocked = true;
          setStatusErr(t("rules.lockReason"));
          rules.open(r.missingIds, service.id);
        }
      } catch {
        blocked = false;
      } finally {
        setChecking(false);
      }
      if (blocked) return;
    }
    setBusy(true);
    try {
      const input = { serviceId: service.id, selectedPrice: n, experienceNote: note, status };
      const res = await saveSellerService({
        scope,
        locale,
        uid,
        persisted,
        input,
        negotiation: sendNeg ? negOn : null,
        runtime: runtimeLoad.state === "ready" ? runtime : null,
        fallbackPrice: persisted ? persisted.legacyPrice : band && !isZeroBand(band) ? bandRecommended(band) : 0,
      });
      if (res.ok) {
        rememberPolicy(uid);
        onSaved(res.saved, res.created);
        return;
      }
      if (res.stage === "manage") {
        const se = res.error;
        setErr(se);
        if ((se.kind === "range" || se.kind === "noPrice") && se.limits) setServerBand({ key: service.id, band: se.limits });
        if (res.persisted && res.persisted !== persisted) keep(res.persisted);
        if (se.kind === "notFound") onStale?.();
        return;
      }
      keep(res.persisted);
      applyConfigError(res.error, res.rolledBack, service.id);
    } catch (e) {
      setErr(serviceErrorOf(e, locale));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (!busy && !checking) onClose();
  };
  const priceErr = err?.kind === "range" ? errText(err) : cfgErr?.price ? cfgErr.price : priceReq ? t("errors.priceRequired") : "";
  const draft: PreviewDraft = {
    kind: "service",
    sellerId,
    seed: { name: profile.name, sellerType: profile.sellerType, region: profile.region, verified: profileVerified(profile) },
    service: service
      ? { id: service.id, title: service.name, categoryId: service.categoryId ?? "", categoryTitle: service.categoryTitle ?? "", basePrice: service.price ?? 0, price: n, note, advokatRequired: service.advokatRequired }
      : null,
    ad: null,
    profile: null,
  };
  const formErr = err && err.kind !== "range" && err.kind !== "noPrice" && err.kind !== "advocateOnly" ? errText(err) : (cfgErr?.form ?? "");
  const stDescribed = [activeLocked ? `${ids}-lock` : "", statusErr ? `${ids}-sterr` : ""].filter(Boolean).join(" ") || undefined;

  return (
    <InBody>
      <Modal open onClose={close} title={editing ? t("form.editTitle") : t("form.addTitle")}>
        <form
          className="svform"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          noValidate
          data-ai-id={aiId}
          data-ai-type={aiId ? "modal" : undefined}
          data-ai-label={aiId ? (editing ? t("form.editTitle") : t("form.addTitle")) : undefined}
        >
          <section className="svform__sec">
            <label className="svform__lbl" htmlFor={`${ids}-svc`}>
              <span className="svform__n" aria-hidden="true">
                <IconLayers />
              </span>
              {t("form.service")}
            </label>
            {editing && persisted ? (
              <div className="svpick__sel svpick__sel--fixed">
                <span className="svpick__ic" aria-hidden="true">
                  <IconEdit />
                </span>
                <span className="svpick__selm">
                  <b>{persisted.service.name}</b>
                  <small>{[persisted.service.categoryTitle, persisted.service.subcategory].filter(Boolean).join(" · ")}</small>
                </span>
              </div>
            ) : (
              <ServicePicker
                inputId={`${ids}-svc`}
                value={service}
                onChange={(s) => {
                  setService(s);
                  setErr(null);
                }}
                taken={taken}
                lawyer={lawyer}
                invalid={advocateBlocked ? t("errors.advocateOnly") : undefined}
              />
            )}
            {advocateBlocked ? (
              <p className="svform__bad" role="alert">
                <IconAlert aria-hidden="true" />
                {t("errors.advocateOnly")}
              </p>
            ) : null}
            {runtime ? <RequirementsLine req={runtime.minimumRequirements} verified={profileVerified(profile)} id={`${ids}-req`} /> : null}
          </section>

          <section className={`svform__sec${service ? "" : " is-dim"}`}>
            <label className="svform__lbl" htmlFor={`${ids}-price`}>
              <span className="svform__n" aria-hidden="true">
                <IconCoins />
              </span>
              {t("form.price")}
            </label>
            <PriceField
              id={`${ids}-price`}
              value={price}
              onChange={(v) => {
                setPrice(digitsOf(v));
                setPriceReq(false);
                if (err?.kind === "range") setErr(null);
                if (cfgErr?.price) setCfgErr(null);
              }}
              band={band}
              bandState={bandState}
              basePrice={service?.price ?? 0}
              error={priceErr}
              runtime={pricing}
              runtimeState={runtimeLoad.state}
              explanation={explanation}
            />
          </section>

          {showNeg ? (
            <section className="svform__sec svcfg-negsec">
              <button
                type="button"
                role="switch"
                aria-checked={negOn}
                aria-labelledby={`${ids}-neg`}
                aria-describedby={`${ids}-neg-h`}
                className={`svcfg-sw${negOn ? " is-on" : ""}`}
                data-ai-id={aiId ? `${aiId}.negotiation` : undefined}
                data-ai-type={aiId ? "toggle" : undefined}
                onClick={() => setNeg({ key: serviceId, on: !negOn })}
              >
                <span className="svform__n" aria-hidden="true">
                  <IconScale />
                </span>
                <span className="svcfg-sw__l">
                  <b id={`${ids}-neg`}>{t("config.negotiation")}</b>
                  <small id={`${ids}-neg-h`}>
                    {t("config.negotiationHint")}
                    {!negTouched && negInitial === null ? <span className="svcfg-sw__m">{t("config.negotiationUnknown")}</span> : null}
                    {status !== "active" ? <span className="svcfg-sw__m">{t("config.negotiationActiveOnly")}</span> : null}
                  </small>
                </span>
                <span className="svcfg-sw__track" aria-hidden="true">
                  <i />
                </span>
              </button>
            </section>
          ) : null}

          <section className="svform__sec">
            <label className="svform__lbl" htmlFor={`${ids}-note`}>
              <span className="svform__n" aria-hidden="true">
                <IconEdit />
              </span>
              {t("form.note")}
              <span className="svform__cnt">
                {note.length}/{NOTE_MAX}
              </span>
            </label>
            <textarea
              id={`${ids}-note`}
              className="svform__ta"
              value={note}
              maxLength={NOTE_MAX}
              rows={4}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("form.notePh")}
              aria-describedby={`${ids}-note-h`}
            />
            <p id={`${ids}-note-h`} className="svform__hint">
              {t("form.noteHint")}
            </p>
          </section>

          <section className="svform__sec">
            <span className="svform__lbl" id={`${ids}-st`}>
              <span className="svform__n" aria-hidden="true">
                <IconPlay />
              </span>
              {t("form.status")}
            </span>
            <div className="svform__st" role="radiogroup" aria-labelledby={`${ids}-st`}>
              {SERVICE_STATUSES.map((s) => {
                const Icon = STATUS_ICON[s];
                const on = status === s;
                const lock = s === "active" && activeLocked;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`svform__sto svform__sto--${s}${on ? " is-on" : ""}${lock ? " svcfg-locked" : ""}`}
                    disabled={lock}
                    title={lock ? t("rules.lockReason") : undefined}
                    aria-describedby={stDescribed}
                    onClick={() => {
                      setStatus(s);
                      setStatusErr("");
                    }}
                  >
                    <span className="svform__stic" aria-hidden="true">
                      <Icon />
                    </span>
                    <b>{t(`status.${s}`)}</b>
                    <small>{t(`statusHint.${s}`)}</small>
                  </button>
                );
              })}
            </div>
            {activeLocked && rules ? (
              <p id={`${ids}-lock`} className="svcfg-lock">
                <IconLock aria-hidden="true" />
                <span>{t("rules.lockReason")}</span>
                <button type="button" className="svcfg-lock__btn" onClick={() => rules.open(undefined, serviceId)}>
                  {t("rules.lockAction")}
                </button>
              </p>
            ) : null}
            {statusErr ? (
              <p id={`${ids}-sterr`} className="svcfg-err" role="alert">
                <IconAlert aria-hidden="true" />
                <span>{statusErr}</span>
              </p>
            ) : null}
          </section>

          {askPolicy ? (
            <label className={`svform__policy${agreed ? " is-on" : ""}${policyErr && !agreed ? " is-bad" : ""}`}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked);
                  setPolicyErr(false);
                }}
              />
              <span className="svform__box" aria-hidden="true">
                <IconCheck />
              </span>
              <span>{t("config.policy")}</span>
            </label>
          ) : null}
          {policyErr && !agreed ? (
            <p className="svform__bad" role="alert">
              <IconAlert aria-hidden="true" />
              {t("form.policyRequired")}
            </p>
          ) : null}
          {formErr ? (
            <p className="svm__err" role="alert">
              {formErr}
            </p>
          ) : null}

          <div className="svform__acts">
            <button type="button" className="btn btn--line svform__live" onPointerEnter={() => setWarm(true)} onFocus={() => setWarm(true)} onClick={() => setLive(true)}>
              <IconEye aria-hidden="true" />
              {tv("open")}
            </button>
            <button type="button" className="btn btn--line" onClick={close} disabled={busy || checking}>
              {t("form.cancel")}
            </button>
            <button type="submit" className="btn btn--pri" disabled={busy || checking || !service || off || advocateBlocked} aria-busy={busy || checking || undefined}>
              {checking ? t("rules.checking") : busy ? t("form.saving") : t("form.save")}
              {busy || checking ? null : <IconCheck aria-hidden="true" />}
            </button>
          </div>
        </form>
      </Modal>
      {warm || live ? (
        <MarketPreviewModal open={live} draft={draft} views={["profile", "market"]} subtitle={service ? service.name : t("form.addTitle")} onClose={() => setLive(false)} />
      ) : null}
    </InBody>
  );
}
