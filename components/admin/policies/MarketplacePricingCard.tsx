"use client";

import { useEffect, useId, useState, useSyncExternalStore, type ReactNode, type SVGProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { Skeleton } from "@/components/portal/DataState";
import {
  IconAlert,
  IconAward,
  IconBriefcase,
  IconCheck,
  IconHistory,
  IconHourglass,
  IconInfo,
  IconMapPin,
  IconPlus,
  IconRefresh,
  IconScale,
  IconShieldCheck,
  IconSliders,
  IconStar,
  IconTrash,
} from "@/components/icons";
import { isForbidden } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import {
  CLIENT_FIELDS,
  SELLER_FIELDS,
  defaultPricingPolicy,
  getAdminPricing,
  getPricingHistory,
  isMissingStatus,
  normRegionKey,
  pricingIssues,
  pricingSaveFailure,
  pricingSaveMissing,
  regionName,
  samePricingPolicy,
  saveAdminPricing,
  subscribePricingGate,
  type AdminPricing,
  type PricingIssue,
  type PricingPolicy,
  type PricingSaveFailure,
} from "@/lib/services/marketplacePricing";
import PricingHistoryModal, { versionWhen, type PricingHistoryState } from "./PricingHistoryModal";

type SellerKey = (typeof SELLER_FIELDS)[number];
type ClientKey = (typeof CLIENT_FIELDS)[number];
type ExpRow = { id: string; min: string; max: string; pct: string };
type RegRow = { id: string; key: string; coef: string };
type Draft = {
  seq: number;
  minPct: string;
  maxPct: string;
  exp: ExpRow[];
  regions: RegRow[];
  seller: Record<SellerKey, string>;
  client: Record<ClientKey, string>;
  sectorVerified: boolean;
  sectorYears: string;
  sectorPct: string;
};
type Load = { status: "loading" | "ready" | "forbidden" | "missing" | "error"; data: AdminPricing | null };

type Unit = "pct" | "star" | "years";

const REPROBE_MS = 10 * 60 * 1000;

const IconSortUp = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M14 6h3M14 11h5M14 16h7" />
  </svg>
);

const SELLER_UNIT: Record<SellerKey, Unit | null> = {
  successRateMin: "pct",
  totalCasesMin: null,
  winsMin: null,
  ratingMin: "star",
  reviewsMin: null,
  percent: "pct",
};
const CLIENT_UNIT: Record<ClientKey, Unit | null> = { ratingMin: "star", reviewsMin: null, percent: "pct" };

const str = (n: number) => (Number.isFinite(n) ? String(n) : "");
const coefStr = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "");
const num = (s: string) => {
  const v = s.trim().replace(",", ".");
  return v === "" ? NaN : Number(v);
};
const clean = (v: string) =>
  v
    .replace(/[^\d.,]/g, "")
    .replace(",", ".")
    .replace(/(\..*)\./g, "$1")
    .slice(0, 9);

function toDraft(p: PricingPolicy): Draft {
  return {
    seq: p.experience.length + p.regions.length,
    minPct: str(p.minPercent),
    maxPct: str(p.maxPercent),
    exp: p.experience.map((x, i) => ({ id: `e${i}`, min: str(x.minYears), max: str(x.maxYears), pct: str(x.percent) })),
    regions: p.regions.map((r, i) => ({ id: `r${i}`, key: r.key, coef: coefStr(r.coef) })),
    seller: {
      successRateMin: str(p.seller.successRateMin),
      totalCasesMin: str(p.seller.totalCasesMin),
      winsMin: str(p.seller.winsMin),
      ratingMin: str(p.seller.ratingMin),
      reviewsMin: str(p.seller.reviewsMin),
      percent: str(p.seller.percent),
    },
    client: { ratingMin: str(p.client.ratingMin), reviewsMin: str(p.client.reviewsMin), percent: str(p.client.percent) },
    sectorVerified: p.sector.verifiedOnly,
    sectorYears: str(p.sector.minYears),
    sectorPct: str(p.sector.percent),
  };
}

function fromDraft(d: Draft): PricingPolicy {
  return {
    minPercent: num(d.minPct),
    maxPercent: num(d.maxPct),
    experience: d.exp.map((r) => ({ minYears: num(r.min), maxYears: num(r.max), percent: num(r.pct) })),
    regions: d.regions.map((r) => ({ key: normRegionKey(r.key), coef: num(r.coef) })),
    seller: {
      successRateMin: num(d.seller.successRateMin),
      totalCasesMin: num(d.seller.totalCasesMin),
      winsMin: num(d.seller.winsMin),
      ratingMin: num(d.seller.ratingMin),
      reviewsMin: num(d.seller.reviewsMin),
      percent: num(d.seller.percent),
    },
    client: { ratingMin: num(d.client.ratingMin), reviewsMin: num(d.client.reviewsMin), percent: num(d.client.percent) },
    sector: { verifiedOnly: d.sectorVerified, minYears: num(d.sectorYears), percent: num(d.sectorPct) },
  };
}

const minKey = (r: ExpRow) => {
  const n = num(r.min);
  return Number.isFinite(n) ? n : Infinity;
};

function Field({
  id,
  value,
  unit,
  bad,
  onChange,
  onBlur,
  label,
  placeholder,
  text,
  readOnly,
}: {
  id?: string;
  value: string;
  unit?: string;
  bad?: boolean;
  onChange: (v: string) => void;
  onBlur?: () => void;
  label?: string;
  placeholder?: string;
  text?: boolean;
  readOnly?: boolean;
}) {
  return (
    <span className={`mpp__f${bad ? " is-bad" : ""}${readOnly ? " is-ro" : ""}`}>
      <input
        id={id}
        value={value}
        inputMode={text ? "text" : "decimal"}
        autoComplete="off"
        spellCheck={false}
        maxLength={text ? 40 : 9}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={bad || undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {unit ? <em>{unit}</em> : null}
    </span>
  );
}

function Labeled({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="mpp__kv">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function Section({ icon, title, hint, aside, children }: { icon: ReactNode; title: string; hint: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mpp__sec">
      <header className="mpp__sh">
        <span className="mpp__si" aria-hidden="true">
          {icon}
        </span>
        <span className="mpp__st">
          <b>{title}</b>
          <small>{hint}</small>
        </span>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Issues({ items, text }: { items: PricingIssue[]; text: (i: PricingIssue) => string }) {
  if (!items.length) return null;
  return (
    <ul className="mpp__msgs">
      {items.map((i, k) => (
        <li key={`${i.path}-${i.code}-${k}`} className={i.warn ? "is-warn" : "is-err"}>
          {i.warn ? <IconInfo aria-hidden="true" /> : <IconAlert aria-hidden="true" />}
          <span>{text(i)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function MarketplacePricingCard() {
  const t = useTranslations("admin.policies.pricing");
  const tm = useTranslations("marketPricing");
  const te = useTranslations("enums");
  const locale = useLocale();
  const uid = useId();
  const [tick, setTick] = useState(0);
  const [load, setLoad] = useState<Load>({ status: "loading", data: null });
  const [hist, setHist] = useState<PricingHistoryState>({ status: "loading", items: [] });
  const [synced, setSynced] = useState<AdminPricing | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedKeys, setSavedKeys] = useState<string[] | null>(null);
  const [kept, setKept] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const saveMissing = useSyncExternalStore(subscribePricingGate, pricingSaveMissing, () => false);

  useEffect(() => {
    let alive = true;
    getAdminPricing()
      .then((data) => {
        if (alive) setLoad({ status: "ready", data });
      })
      .catch((e: unknown) => {
        if (alive) setLoad((cur) => (cur.data ? cur : { status: isForbidden(e) ? "forbidden" : isMissingStatus(e) ? "missing" : "error", data: null }));
      });
    getPricingHistory()
      .then((items) => {
        if (alive) setHist({ status: "ready", items });
      })
      .catch((e: unknown) => {
        if (alive) setHist((cur) => ({ status: isMissingStatus(e) ? "missing" : "error", items: cur.items }));
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  useEffect(() => {
    if (load.status !== "missing") return;
    const h = setTimeout(() => setTick((x) => x + 1), REPROBE_MS);
    return () => clearTimeout(h);
  }, [load]);

  if (load.data && load.data !== synced) {
    setSynced(load.data);
    setDraft(toDraft(load.data.policy));
    if (savedKeys) {
      setKept(load.data.policy.regions.map((r) => r.key).filter((k) => !savedKeys.includes(k)));
      setSavedKeys(null);
    }
  }

  const unit = (u: Unit | null) => (u ? t(`unit.${u}`) : undefined);
  const policy = draft ? fromDraft(draft) : null;
  const issues = policy ? pricingIssues(policy) : [];
  const blocking = issues.filter((i) => !i.warn);
  const bad = new Set(blocking.map((i) => i.path));
  const present = Boolean(load.data?.present);
  const dirty = Boolean(policy && load.data && !samePricingPolicy(policy, load.data.policy));
  const atDefaults = Boolean(policy && samePricingPolicy(policy, defaultPricingPolicy()));
  const canSave = Boolean(policy && load.data) && (dirty || !present) && !blocking.length && !saveMissing && !busy;
  const last = hist.status === "ready" ? hist.items[0] : undefined;
  const lastWhen = last ? versionWhen(last.at, locale) : "";

  const patch = (fn: (d: Draft) => Draft) => {
    setDraft((d) => (d ? fn(d) : d));
    setNote(null);
  };

  const fieldName = (path: string): string => {
    const parts = path.split(".");
    if (path === "minPercent") return t("range.min");
    if (path === "maxPercent") return t("range.max");
    if (parts[0] === "exp" && parts.length === 3) {
      const field = parts[2] === "minYears" ? t("exp.from") : parts[2] === "maxYears" ? t("exp.to") : t("exp.percent");
      return t("issues.rowField", { row: Number(parts[1]) + 1, field });
    }
    if (parts[0] === "regions" && parts.length === 3) {
      return t("issues.rowField", { row: Number(parts[1]) + 1, field: parts[2] === "key" ? t("region.key") : t("region.coef") });
    }
    if (parts.length === 2 && t.has(`${parts[0]}.${parts[1]}`)) return t(`${parts[0]}.${parts[1]}`);
    return path;
  };

  const issueText = (i: PricingIssue): string => {
    switch (i.code) {
      case "required":
        return t("issues.required", { field: fieldName(i.path) });
      case "range":
        return t("issues.range", { field: fieldName(i.path), min: i.params.min, max: i.params.max });
      case "int":
        return t("issues.int", { field: fieldName(i.path) });
      case "minMax":
        return t("issues.minMax");
      case "rowMinMax":
        return t("issues.rowMinMax", { row: i.params.row });
      case "order":
        return t("issues.order");
      case "overlap":
        return t("issues.overlap", { a: i.params.a, b: i.params.b });
      case "gap":
        return t("issues.gap", { from: i.params.from, to: i.params.to });
      case "duplicate":
        return t("issues.duplicate", { key: i.params.key });
      case "defaultMissing":
        return t("issues.defaultMissing");
      case "emptyKey":
        return t("issues.emptyKey", { row: i.params.row });
    }
  };

  const failText = (f: PricingSaveFailure): string => {
    if (f.kind === "invalid") return f.detail ? t("errBad", { detail: f.detail }) : t("errBadPlain");
    if (f.kind === "forbidden") return t("errForbidden");
    if (f.kind === "offline") return t("errOffline");
    return f.detail || t("errUnknown");
  };

  const of = (prefix: string) => issues.filter((i) => i.path === prefix || i.path.startsWith(`${prefix}.`));

  const save = async () => {
    if (!policy || !load.data || !canSave) return;
    setBusy(true);
    setNote(null);
    setKept([]);
    try {
      await saveAdminPricing(policy, load.data.raw);
      setSavedKeys(policy.regions.map((r) => r.key));
      setNote({ ok: true, msg: t("saved") });
      setTick((x) => x + 1);
    } catch (e) {
      const f = pricingSaveFailure(e);
      if (f.kind !== "missing") setNote({ ok: false, msg: failText(f) });
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setLoad({ status: "loading", data: null });
    setTick((x) => x + 1);
  };

  const loadVersion = (p: PricingPolicy, v: string) => {
    setDraft(toDraft(p));
    setKept([]);
    setHistoryOpen(false);
    setNote({ ok: true, msg: v ? t("loaded", { v }) : t("loadedPlain") });
  };

  const head = (
    <div className="ppanel__h">
      <b className="ppanel__t">
        <span className="pico">
          <IconSliders />
        </span>
        {t("title")}
      </b>
      {load.data ? (
        <span className="mpp__hacts">
          <em className={`atag${present ? " atag--ok" : " atag--muted"}`}>{present ? t("live") : t("notSaved")}</em>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setHistoryOpen(true)} data-ai-id="admin.policies.marketplace-pricing.history">
            <IconHistory />
            {t("history.open")}
          </button>
        </span>
      ) : null}
    </div>
  );

  if (!draft || !policy) {
    return (
      <div className="ppanel mpp" data-ai-target="policies:marketplace-pricing" data-ai-id="admin.policies.marketplace-pricing" data-ai-type="section" data-ai-label={t("title")}>
        {head}
        <p className="ppanel__note">{t("lead")}</p>
        {load.status === "loading" ? (
          <Skeleton rows={4} />
        ) : load.status === "forbidden" ? (
          <p className="mpp__state">
            <IconShieldCheck aria-hidden="true" />
            {t("forbidden")}
          </p>
        ) : load.status === "missing" ? (
          <p className="mpp__state">
            <IconHourglass aria-hidden="true" />
            {t("soonLoad")}
          </p>
        ) : (
          <div className="mpp__state">
            <IconAlert aria-hidden="true" />
            <span>{t("loadError")}</span>
            <button type="button" className="btn btn--line btn--sm" onClick={retry}>
              <IconRefresh />
              {t("retry")}
            </button>
          </div>
        )}
      </div>
    );
  }

  const minP = policy.minPercent;
  const maxP = policy.maxPercent;
  const rangeOk = Number.isFinite(minP) && Number.isFinite(maxP) && minP > 0 && minP <= maxP;
  const scale = Math.max(100, rangeOk ? maxP : 100);
  const orderIssue = issues.some((i) => i.code === "order");

  return (
    <div className="ppanel mpp" data-ai-target="policies:marketplace-pricing" data-ai-id="admin.policies.marketplace-pricing" data-ai-type="section" data-ai-label={t("title")}>
      {head}
      <p className="ppanel__note">
        {t("lead")}
        {lastWhen ? ` ${last?.version ? t("lastChange", { v: last.version, when: lastWhen }) : t("lastChangePlain", { when: lastWhen })}` : ""}
      </p>

      {!present ? (
        <p className="mpp__info">
          <IconInfo aria-hidden="true" />
          <span>{t("missingSection")}</span>
        </p>
      ) : null}
      {saveMissing ? (
        <p className="mpp__info is-soon" role="status">
          <IconHourglass aria-hidden="true" />
          <span>{t("saveSoon")}</span>
        </p>
      ) : null}

      <div className="mpp__grid">
        <div className="mpp__col">
          <Section icon={<IconScale />} title={t("range.title")} hint={t("range.hint")}>
            <div className="mpp__pair">
              <Labeled id={`${uid}-min`} label={t("range.min")}>
                <Field id={`${uid}-min`} value={draft.minPct} unit={unit("pct")} bad={bad.has("minPercent")} onChange={(v) => patch((d) => ({ ...d, minPct: clean(v) }))} />
              </Labeled>
              <span className="mpp__dash" aria-hidden="true">
                –
              </span>
              <Labeled id={`${uid}-max`} label={t("range.max")}>
                <Field id={`${uid}-max`} value={draft.maxPct} unit={unit("pct")} bad={bad.has("maxPercent")} onChange={(v) => patch((d) => ({ ...d, maxPct: clean(v) }))} />
              </Labeled>
            </div>
            {rangeOk ? (
              <>
                <div className="mpp__bar" aria-hidden="true">
                  <span style={{ left: `${(minP / scale) * 100}%`, width: `${((maxP - minP) / scale) * 100}%` }} />
                  <i style={{ left: `${(100 / scale) * 100}%` }} />
                </div>
                <p className="mpp__ex">{t("range.example", { min: fmtUzs(minP * 1000), max: fmtUzs(maxP * 1000) })}</p>
              </>
            ) : null}
            <Issues items={issues.filter((i) => i.path === "minPercent" || i.path === "maxPercent")} text={issueText} />
          </Section>

          <Section
            icon={<IconBriefcase />}
            title={t("exp.title")}
            hint={t("exp.hint")}
            aside={
              orderIssue ? (
                <button type="button" className="btn btn--line btn--sm" onClick={() => patch((d) => ({ ...d, exp: [...d.exp].sort((a, b) => minKey(a) - minKey(b)) }))}>
                  <IconSortUp aria-hidden="true" />
                  {t("exp.sort")}
                </button>
              ) : null
            }
          >
            {draft.exp.length ? (
              <div className="mpp__tbl mpp__tbl--exp">
                <div className="mpp__tr mpp__tr--h" aria-hidden="true">
                  <span>{t("exp.from")}</span>
                  <span>{t("exp.to")}</span>
                  <span>{t("exp.percent")}</span>
                  <span />
                </div>
                {draft.exp.map((r, i) => (
                  <div className="mpp__tr" key={r.id}>
                    <Field
                      value={r.min}
                      unit={unit("years")}
                      label={t("issues.rowField", { row: i + 1, field: t("exp.from") })}
                      bad={bad.has(`exp.${i}.minYears`)}
                      onChange={(v) => patch((d) => ({ ...d, exp: d.exp.map((x) => (x.id === r.id ? { ...x, min: clean(v) } : x)) }))}
                    />
                    <Field
                      value={r.max}
                      unit={unit("years")}
                      label={t("issues.rowField", { row: i + 1, field: t("exp.to") })}
                      bad={bad.has(`exp.${i}.maxYears`)}
                      onChange={(v) => patch((d) => ({ ...d, exp: d.exp.map((x) => (x.id === r.id ? { ...x, max: clean(v) } : x)) }))}
                    />
                    <Field
                      value={r.pct}
                      unit={unit("pct")}
                      label={t("issues.rowField", { row: i + 1, field: t("exp.percent") })}
                      bad={bad.has(`exp.${i}.percent`)}
                      onChange={(v) => patch((d) => ({ ...d, exp: d.exp.map((x) => (x.id === r.id ? { ...x, pct: clean(v) } : x)) }))}
                    />
                    <button
                      type="button"
                      className="mpp__del"
                      onClick={() => patch((d) => ({ ...d, exp: d.exp.filter((x) => x.id !== r.id) }))}
                      aria-label={t("removeRow", { row: i + 1 })}
                      title={t("remove")}
                    >
                      <IconTrash aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mpp__empty">{t("exp.empty")}</p>
            )}
            <button
              type="button"
              className="btn btn--soft btn--sm mpp__add"
              onClick={() =>
                patch((d) => {
                  const top = d.exp.reduce((m, x) => Math.max(m, Number.isFinite(num(x.max)) ? num(x.max) : -1), -1);
                  const min = top < 0 ? "0" : top < 99 ? String(top + 1) : "";
                  return { ...d, seq: d.seq + 1, exp: [...d.exp, { id: `n${d.seq}`, min, max: "", pct: "" }] };
                })
              }
            >
              <IconPlus />
              {t("exp.add")}
            </button>
            <Issues items={of("exp")} text={issueText} />
          </Section>

          <Section icon={<IconStar />} title={t("client.title")} hint={t("client.hint")}>
            <div className="mpp__kvs">
              {CLIENT_FIELDS.map((f) => (
                <Labeled key={f} id={`${uid}-c-${f}`} label={t(`client.${f}`)}>
                  <Field
                    id={`${uid}-c-${f}`}
                    value={draft.client[f]}
                    unit={unit(CLIENT_UNIT[f])}
                    bad={bad.has(`client.${f}`)}
                    onChange={(v) => patch((d) => ({ ...d, client: { ...d.client, [f]: clean(v) } }))}
                  />
                </Labeled>
              ))}
            </div>
            <Issues items={of("client")} text={issueText} />
          </Section>
        </div>

        <div className="mpp__col">
          <Section icon={<IconMapPin />} title={t("region.title")} hint={t("region.hint")}>
            <div className="mpp__tbl mpp__tbl--reg">
              <div className="mpp__tr mpp__tr--h" aria-hidden="true">
                <span>{t("region.key")}</span>
                <span>{t("region.coef")}</span>
                <span />
              </div>
              {draft.regions.map((r, i) => {
                const isDefault = normRegionKey(r.key) === "default" && i === draft.regions.findIndex((x) => normRegionKey(x.key) === "default");
                const name = regionName(r.key, tm, te);
                return (
                  <div className="mpp__tr" key={r.id}>
                    <Field
                      text
                      value={r.key}
                      unit={name}
                      readOnly={isDefault}
                      placeholder={t("region.keyPh")}
                      label={t("issues.rowField", { row: i + 1, field: t("region.key") })}
                      bad={bad.has(`regions.${i}.key`)}
                      onChange={(v) => patch((d) => ({ ...d, regions: d.regions.map((x) => (x.id === r.id ? { ...x, key: v.toLowerCase() } : x)) }))}
                      onBlur={() => setDraft((d) => (d ? { ...d, regions: d.regions.map((x) => (x.id === r.id ? { ...x, key: normRegionKey(x.key) } : x)) } : d))}
                    />
                    <Field
                      value={r.coef}
                      unit="×"
                      label={t("issues.rowField", { row: i + 1, field: t("region.coef") })}
                      bad={bad.has(`regions.${i}.coef`)}
                      onChange={(v) => patch((d) => ({ ...d, regions: d.regions.map((x) => (x.id === r.id ? { ...x, coef: clean(v) } : x)) }))}
                    />
                    <button
                      type="button"
                      className="mpp__del"
                      onClick={() => patch((d) => ({ ...d, regions: d.regions.filter((x) => x.id !== r.id) }))}
                      disabled={isDefault}
                      aria-label={t("removeRow", { row: i + 1 })}
                      title={isDefault ? t("region.defaultLocked") : t("remove")}
                    >
                      <IconTrash aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="btn btn--soft btn--sm mpp__add"
              onClick={() => patch((d) => ({ ...d, seq: d.seq + 1, regions: [...d.regions, { id: `n${d.seq}`, key: "", coef: "1.00" }] }))}
            >
              <IconPlus />
              {t("region.add")}
            </button>
            <Issues items={of("regions")} text={issueText} />
          </Section>

          <Section icon={<IconAward />} title={t("seller.title")} hint={t("seller.hint")}>
            <div className="mpp__kvs">
              {SELLER_FIELDS.map((f) => (
                <Labeled key={f} id={`${uid}-s-${f}`} label={t(`seller.${f}`)}>
                  <Field
                    id={`${uid}-s-${f}`}
                    value={draft.seller[f]}
                    unit={unit(SELLER_UNIT[f])}
                    bad={bad.has(`seller.${f}`)}
                    onChange={(v) => patch((d) => ({ ...d, seller: { ...d.seller, [f]: clean(v) } }))}
                  />
                </Labeled>
              ))}
            </div>
            <Issues items={of("seller")} text={issueText} />
          </Section>

          <Section icon={<IconShieldCheck />} title={t("sector.title")} hint={t("sector.hint")}>
            <label className="mpp__sw">
              <input type="checkbox" checked={draft.sectorVerified} onChange={(e) => patch((d) => ({ ...d, sectorVerified: e.target.checked }))} />
              <i aria-hidden="true" />
              <span>{t("sector.verifiedOnly")}</span>
            </label>
            <div className="mpp__kvs">
              <Labeled id={`${uid}-x-years`} label={t("sector.minYears")}>
                <Field id={`${uid}-x-years`} value={draft.sectorYears} unit={unit("years")} bad={bad.has("sector.minYears")} onChange={(v) => patch((d) => ({ ...d, sectorYears: clean(v) }))} />
              </Labeled>
              <Labeled id={`${uid}-x-pct`} label={t("sector.percent")}>
                <Field id={`${uid}-x-pct`} value={draft.sectorPct} unit={unit("pct")} bad={bad.has("sector.percent")} onChange={(v) => patch((d) => ({ ...d, sectorPct: clean(v) }))} />
              </Labeled>
            </div>
            <Issues items={of("sector")} text={issueText} />
          </Section>
        </div>
      </div>

      <div className="mpp__foot">
        <button type="button" className="btn btn--line btn--sm" onClick={() => patch(() => toDraft(defaultPricingPolicy()))} disabled={busy || atDefaults}>
          <IconRefresh />
          {t("defaultsBtn")}
        </button>
        <span className="mpp__fr">
          {blocking.length ? (
            <em className="mpp__cnt">
              <IconAlert aria-hidden="true" />
              {t("issuesCount", { n: blocking.length })}
            </em>
          ) : null}
          <button type="button" className="btn btn--line" onClick={() => patch(() => toDraft(load.data ? load.data.policy : defaultPricingPolicy()))} disabled={busy || !dirty}>
            {t("reset")}
          </button>
          <button type="button" className="btn btn--pri" onClick={() => void save()} disabled={!canSave} data-ai-id="admin.policies.marketplace-pricing.save">
            {saveMissing ? <IconHourglass /> : busy ? null : <IconCheck />}
            {saveMissing ? t("soon") : busy ? t("saving") : t("save")}
          </button>
        </span>
      </div>
      {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
      {kept.length ? (
        <p className="mpp__info is-kept">
          <IconInfo aria-hidden="true" />
          <span>{t("kept", { keys: kept.map((k) => `«${k}»`).join(", ") })}</span>
        </p>
      ) : null}

      <PricingHistoryModal open={historyOpen} hist={hist} onClose={() => setHistoryOpen(false)} onLoad={loadVersion} />
    </div>
  );
}
