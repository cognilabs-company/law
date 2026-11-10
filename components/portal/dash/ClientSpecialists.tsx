"use client";

import "./dash1920.css";
import "./specialists1920.css";
import { useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { CalendarCheck, CircleCheck, ImageIcon, Languages, Layers, MapPin, MessageSquareText, Search, SlidersHorizontal, Video } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useResource } from "@/lib/useResource";
import { listMarketplace, type MarketSeller, type MarketService } from "@/lib/services/marketplace";
import { LEGAL_AREAS, areaByKey, inArea } from "@/lib/legalAreas";
import { matchesSearch } from "@/lib/searchText";
import { regionKeyOf, regionLabel, personName } from "@/lib/labels";
import { fmtUzs } from "@/lib/money";
import { useFitPlaceholder } from "@/lib/useFitPlaceholder";
import { initials } from "@/lib/lawyers";
import Select from "@/components/Select";
import CheckBox from "@/components/CheckBox";
import PurchaseDialog from "@/components/marketplace/PurchaseDialog";
import { langLabel, sellerTypeLabel, specLabel } from "@/components/marketplace/bits";

// "Advokat va yuristlar" (reference/design-lexgo-1920/1b_mijoz_advokatlar.png):
// the search bar, the legal-area checklist, the type switch and one card per
// verified specialist with their own services and prices.

const REGIONS = ["tashkent", "samarkand", "fergana", "bukhara", "namangan", "andijan", "kashkadarya", "khorezm", "jizzakh", "navoi"];
const KINDS = ["all", "advokat", "yurist"] as const;
const PAGE = 10;

// onlyIds: the marketplace banner's AI search above this list — while it is
// on, only those specialists are shown, in its order (null = no search).
export default function ClientSpecialists({ initialQuery = "", initialArea = "", initialRegion = "", initialType = "", onlyIds = null }: { initialQuery?: string; initialArea?: string; initialRegion?: string; initialType?: string; onlyIds?: string[] | null }) {
  const t = useTranslations("lxSpec");
  const tc = useTranslations("lxClient");
  const te = useTranslations("enums");
  const [qPh, qRef] = useFitPlaceholder([t("searchPh"), t("searchPhShort")]);
  const tm = useTranslations("marketplace");
  const res = useResource<MarketSeller>(async () => (await listMarketplace({ sort: "recommended" })).items, []);

  const [draft, setDraft] = useState(initialQuery);
  const [q, setQ] = useState(initialQuery);
  const [areas, setAreas] = useState<string[]>(() => (areaByKey(initialArea) ? [initialArea] : []));
  const [region, setRegion] = useState(REGIONS.includes(initialRegion) ? initialRegion : "");
  const [kind, setKind] = useState<(typeof KINDS)[number]>(initialType === "advokat" || initialType === "yurist" ? initialType : "all");
  const [shown, setShown] = useState(PAGE);
  const [buy, setBuy] = useState<{ seller: MarketSeller; service: MarketService | null } | null>(null);

  const list = useMemo(() => {
    const rank = onlyIds ? new Map(onlyIds.map((id, i) => [id, i])) : null;
    const out = res.data.filter((s) => {
      if (rank && !rank.has(s.userId)) return false;
      if (kind !== "all" && s.sellerType !== kind) return false;
      if (region && regionKeyOf(te, s.region) !== region) return false;
      const texts = [...s.specializations, ...s.serviceTitles, ...s.services.map((x) => `${x.title} ${x.categoryTitle}`), ...s.categories.map((c) => `${c.title} ${c.slug}`)];
      if (areas.length && !areas.some((k) => { const a = areaByKey(k); return a ? inArea(a, texts) : false; })) return false;
      if (q.trim() && !matchesSearch([s.name, s.bio, ...texts].join(" "), q)) return false;
      return true;
    });
    return rank ? out.sort((a, b) => (rank.get(a.userId) ?? 0) - (rank.get(b.userId) ?? 0)) : out;
  }, [res.data, kind, region, areas, q, te, onlyIds]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setQ(draft);
    setShown(PAGE);
  };
  const toggleArea = (k: string, on: boolean) => {
    setAreas((cur) => (on ? [...cur, k] : cur.filter((x) => x !== k)));
    setShown(PAGE);
  };
  const reset = () => {
    setDraft("");
    setQ("");
    setAreas([]);
    setRegion("");
    setKind("all");
  };
  const oneArea = areas.length === 1 ? areas[0] : "";

  return (
    <div className="sp">
      <form className="lx-card sp-bar" role="search" onSubmit={submit}>
        <label className="sp-bar__q">
          <Search aria-hidden="true" />
          <input ref={qRef} type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={qPh} aria-label={t("searchPh")} />
        </label>
        <div className="sp-bar__sel">
          <Layers aria-hidden="true" />
          <Select
            value={oneArea}
            onChange={(v) => {
              setAreas(v ? [v] : []);
              setShown(PAGE);
            }}
            ariaLabel={t("area")}
            options={[{ value: "", label: t("allAreas") }, ...LEGAL_AREAS.map((a) => ({ value: a.key, label: tc(`area.${a.key}.t`) }))]}
          />
        </div>
        <div className="sp-bar__sel">
          <MapPin aria-hidden="true" />
          <Select value={region} onChange={setRegion} ariaLabel={t("region")} options={[{ value: "", label: t("allRegions") }, ...REGIONS.map((r) => ({ value: r, label: te(`regions.${r}`) }))]} />
        </div>
        <button type="submit" className="btn btn--pri sp-bar__go"><Search />{t("search")}</button>
      </form>

      <div className="sp-body">
        <aside className="lx-card sp-areas" aria-labelledby="sp-areas-h">
          <h2 id="sp-areas-h" className="sp-h">
            <SlidersHorizontal aria-hidden="true" />
            {t("areas")}
          </h2>
          <ul>
            {LEGAL_AREAS.map((a) => {
              const on = areas.includes(a.key);
              return (
                <li key={a.key} className={on ? "on" : ""}>
                  <span className="sp-areas__ic"><a.Icon /></span>
                  <CheckBox checked={on} onChange={(v) => toggleArea(a.key, v)} className="sp-areas__cb">{tc(`area.${a.key}.t`)}</CheckBox>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="sp-results" aria-labelledby="sp-found">
          <div className="sp-results__h">
            <h2 id="sp-found" className="sp-found">{res.status === "loading" ? "…" : t("found", { n: list.length })}</h2>
            <div className="sp-kind" role="radiogroup" aria-label={t("kindLabel")}>
              {KINDS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                  {t(`kind.${k}`)}
                </button>
              ))}
            </div>
          </div>

          {res.status === "loading" ? (
            <div className="sp-list"><div className="cx-skel cx-skel--tall" /><div className="cx-skel cx-skel--tall" /></div>
          ) : res.status === "error" ? (
            <div className="lx-card cx-empty"><b>{t("error")}</b><button type="button" className="btn btn--line btn--sm" onClick={() => void res.refresh()}>{t("retry")}</button></div>
          ) : !list.length ? (
            <div className="lx-card cx-empty">
              <span className="cx-empty__ic"><Search /></span>
              <b>{t("empty")}</b>
              <p>{t("emptyText")}</p>
              <button type="button" className="btn btn--line btn--sm" onClick={reset}>{t("reset")}</button>
            </div>
          ) : (
            <div className="sp-list">
              {list.slice(0, shown).map((s) => {
                const name = personName(s.name);
                const tags = (s.categories.length ? s.categories.map((c) => c.title) : s.specializations.map((x) => specLabel(te, x))).slice(0, 3);
                const svcs = s.services.slice(0, 3);
                return (
                  <article key={s.userId} className="lx-card sp-card">
                    <Link href={`/portal/client/lawyers/${s.userId}`} className="sp-card__ph" aria-label={`${t("profile")}: ${name}`}>
                      <span className="sp-card__av">{initials(name || "L")}</span>
                      <span className="sp-card__phl"><ImageIcon />{t("photo")}</span>
                    </Link>
                    <div className="sp-card__main">
                      <Link href={`/portal/client/lawyers/${s.userId}`} className="sp-card__name">{name}</Link>
                      <span className="sp-card__role">
                        {sellerTypeLabel(tm, s.sellerType)}
                        {s.verified ? <span className="sp-ok"><CircleCheck />{t("verified")}</span> : null}
                      </span>
                      <p className="sp-card__bio">{s.bio || t("noBio")}</p>
                      <div className="sp-facts">
                        <div><span><MapPin />{t("geo")}</span><b>{s.region ? regionLabel(te, s.region) : "—"}</b></div>
                        <div><span><Languages />{t("langs")}</span><b>{s.languages.length ? [...new Set(s.languages.map((l) => langLabel(tm, l)))].join(", ") : "—"}</b></div>
                        <div><span><Video />{t("format")}</span><b>{s.onlineNow ? t("onlineNow") : t("online")}</b></div>
                      </div>
                      {tags.length ? (
                        <div className="sp-tags">{tags.map((x) => <span key={x}>{x}</span>)}</div>
                      ) : null}
                    </div>
                    <div className="sp-card__side">
                      <span className="sp-side__h">{t("services")}</span>
                      {svcs.length ? (
                        <ul className="sp-svcs">
                          {svcs.map((x) => (
                            <li key={x.id}>
                              <span>{x.title}</span>
                              <b>{fmtUzs(x.price || x.selectedPrice || x.basePrice)} {t("som")}</b>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="lxs-muted">{t("noServices")}</p>
                      )}
                      <div className="sp-side__act">
                        {svcs.length ? (
                          <button type="button" className="btn btn--pri btn--full" onClick={() => setBuy({ seller: s, service: svcs[0] })}><CalendarCheck />{t("order")}</button>
                        ) : (
                          <Link href={`/portal/client/lawyers/${s.userId}`} className="btn btn--pri btn--full"><CalendarCheck />{t("profile")}</Link>
                        )}
                        <Link href={`/portal/client/lawyers/${s.userId}#services`} className="btn btn--line btn--full"><MessageSquareText />{t("message")}</Link>
                      </div>
                    </div>
                  </article>
                );
              })}
              {list.length > shown ? (
                <button type="button" className="btn btn--line sp-more" onClick={() => setShown((n) => n + PAGE)}>{t("more")}</button>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {buy ? (
        <PurchaseDialog
          sellerUserId={buy.seller.userId}
          sellerName={personName(buy.seller.name)}
          service={buy.service}
          returnPath="/portal/client/lawyers"
          onClose={() => setBuy(null)}
          onStale={() => {
            setBuy(null);
            void res.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
