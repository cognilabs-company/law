"use client";

import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { fmtUzs } from "@/lib/money";
import { matchesSearch } from "@/lib/searchText";
import { findContacts } from "@/lib/contactGuard";
import ContactGuardNote, { useContactStrip } from "@/components/ui/ContactGuardNote";
import { searchServices, type BackendService } from "@/lib/services/backend";
import { hiddenReasons, listManagedServices, priceBandFor, priceExplanationOf, removeManagedService, serviceErrorOf, setManagedServiceStatus, type ManagedService, type ManagedServices, type PriceBand, type ServiceScope, type ServiceStatus } from "@/lib/services/sellerServices";
import { acceptServiceRule, getRuntimeConfig, listServiceRules, updateSellerServiceConfig, type RuntimeConfig, type ServiceRule } from "@/lib/services/marketRuntime";
import { configSupport, isConfigUnsupported, saveSellerService } from "@/lib/services/sellerConfig";
import { ensureServiceRules, refreshRulesGate, rulesBlockOf } from "@/lib/services/rulesGate";
import { enableMyPackage, listMyPackages, setMyPackageStatus, type SellerPackage } from "@/lib/services/sellerPackages";
import { IconAlert, IconBriefcase, IconCheck, IconEdit, IconEye, IconEyeOff, IconMegaphone, IconPackage, IconPause, IconPlay, IconPlus, IconPower, IconRefresh, IconSearch, IconShieldCheck, IconTrash } from "@/components/icons";
import { App, Banner, Btn, Check, Dialog, Empty, Field, Input, Loading, Search, Select, Sidebar, Tag, TextArea, Toggle, Tool, Toolbar, useConfirm, useHost, useOs, useToast, type NavSection, type Tone } from "../kit/kit";
import type { NativeProps } from "../native";
import PromoteDialog from "./promote/PromoteDialog";
import "./services.css";
import PriceLimits from "@/components/services/PriceLimits";
import { useSellerConfig } from "@/components/services/useSellerConfig";
import { useSameTickGuard } from "@/lib/useSameTickGuard";

// The seller's services as a desktop program: the services by status and
// the packages on the side; the chosen one's sheet — price and its allowed
// range, negotiation, the experience note, visibility and why it is
// hidden, promotion — with switching on (behind the service rules), pause,
// edit, promote and remove. Adding searches the catalogue.

const ME: ServiceScope = { kind: "me" };
type View = string;
const TONE: Record<ServiceStatus, Tone> = { active: "ok", paused: "warn", inactive: "neutral" };
const som = (n: number) => fmtUzs(n);

export default function ServicesApp(_props: NativeProps) {
  void _props;
  return <ServicesBoard scope={ME} />;
}

// The same board for another seller: an organization owner managing a
// member's services (`owner`). The owner cannot accept the member's
// service rules or promote for them, so those are left out; `head` tops the
// sidebar (whose services these are) and `extra` adds sidebar items that
// draw their own view (the member's workload).
export type BoardExtra = { section: NavSection; render: (id: string) => ReactNode };
export function ServicesBoard({ scope, owner = false, head, extra, back, start = "all", title }: { scope: ServiceScope; owner?: boolean; head?: ReactNode; extra?: BoardExtra; back?: { label: string; onClick: () => void }; start?: string; title?: string }) {
  const t = useTranslations("sellerServices");
  const tp = useTranslations("sellerPackages");
  const d = useTranslations("portal.desk.services");
  const locale = useLocale();
  const os = useOs();
  const { menu } = useHost();
  const uid = useAuth().session?.id ?? "";
  const [data, setData] = useState<ManagedServices | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>(start);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState("");
  const once = useSameTickGuard();
  const [edit, setEdit] = useState<{ item: ManagedService | null } | null>(null);
  const [promote, setPromote] = useState<ManagedService | null>(null);
  const [rules, setRules] = useState<{ serviceId: string; focus: string[] } | null>(null);
  const [tick, setTick] = useState(0);
  const [confirmNode, confirm] = useConfirm();
  const [toast, say] = useToast();

  useEffect(() => {
    const c = new AbortController();
    listManagedServices(scope, locale, c.signal)
      .then((x) => !c.signal.aborted && (setData(x), setFailed(false)))
      .catch(() => !c.signal.aborted && setFailed(true));
    return () => c.abort();
  }, [scope, locale, tick]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const shown = items.filter((x) => (view === "all" || x.status === view) && (!q.trim() || matchesSearch(`${x.service.name} ${x.service.categoryTitle ?? ""}`, q)));
  const current = items.find((x) => x.id === sel) ?? null;
  const replace = (x: ManagedService) => setData((cur) => (cur ? { ...cur, items: cur.items.some((y) => y.id === x.id) ? cur.items.map((y) => (y.id === x.id ? x : y)) : [x, ...cur.items] } : cur));

  async function setStatus(item: ManagedService, status: ServiceStatus) {
    if (busy || !once()) return;
    setBusy(item.id);
    try {
      if (status === "active" && !owner) {
        const chk = await ensureServiceRules(item.id);
        if (chk.allAccepted === false) {
          setRules({ serviceId: item.id, focus: chk.missingIds });
          return;
        }
        if (configSupport() !== "no") await updateSellerServiceConfig(item.id, { enabled: true }).catch((e) => {
          if (!isConfigUnsupported(e)) throw e;
        });
      }
      const saved = await setManagedServiceStatus(scope, item.id, status, locale);
      replace(saved);
      if (!owner && status !== "active" && configSupport() !== "no") void updateSellerServiceConfig(item.id, { enabled: false }).catch(() => undefined);
      say(t(`statusSaved.${status}`));
    } catch (e) {
      const ids = rulesBlockOf(e);
      if (ids && owner) say(t("rules.ownerNote"), "err");
      else if (ids) setRules({ serviceId: item.id, focus: ids });
      else if (owner && serviceErrorOf(e).kind === "forbidden") say(t("errors.forbiddenOwner"), "err");
      else say(t.has(`errors.${serviceErrorOf(e).kind}`) ? t(`errors.${serviceErrorOf(e).kind}`) : t("errors.unknown"), "err");
    } finally {
      setBusy("");
    }
  }
  async function remove(item: ManagedService) {
    const ok = await confirm({ title: t("remove.title"), text: `${t("remove.text", { title: item.service.name })}${item.ownPromotion ? ` ${t("remove.promoWarn")}` : ""}`, ok: t("remove.confirm"), cancel: t("form.cancel"), danger: true });
    if (!ok) return;
    try {
      await removeManagedService(scope, item.id);
      setData((cur) => (cur ? { ...cur, items: cur.items.filter((y) => y.id !== item.id) } : cur));
      setSel("");
      say(d("removed"));
    } catch {
      say(t("errors.unknown"), "err");
    }
  }
  const rowMenu = (e: MouseEvent, x: ManagedService) =>
    menu?.(e, x.service.name, [
      { id: "edit", label: t("card.edit"), icon: <IconEdit />, onSelect: () => setEdit({ item: x }) },
      x.status === "active" ? { id: "pause", label: d("pause"), icon: <IconPause />, onSelect: () => void setStatus(x, "paused") } : { id: "on", label: d("activate"), icon: <IconPlay />, onSelect: () => void setStatus(x, "active") },
      ...(owner ? [] : [{ id: "promo", label: t("card.promote"), icon: <IconMegaphone />, disabled: x.status !== "active", onSelect: () => setPromote(x) }]),
      { sep: true, id: "s" },
      { id: "del", label: t("card.remove"), icon: <IconTrash />, danger: true, onSelect: () => void remove(x) },
    ]);
  const count = (v: View) => (v === "all" ? items.length : items.filter((x) => x.status === v).length);
  const sections: NavSection[] = [
    {
      id: "s",
      title: os === "mac" ? title || t("title") : undefined,
      items: [
        { id: "all", label: t("filters.all"), icon: <IconBriefcase />, count: count("all") || undefined },
        { id: "active", label: t("filters.active"), icon: <IconPlay />, count: count("active") || undefined },
        { id: "paused", label: t("filters.paused"), icon: <IconPause />, count: count("paused") || undefined },
        { id: "inactive", label: t("filters.inactive"), icon: <IconPower />, count: count("inactive") || undefined },
      ],
    },
    ...(owner ? [] : [{ id: "p", title: os === "mac" ? tp("tabPackages") : undefined, items: [{ id: "packages", label: tp("tabPackages"), icon: <IconPackage /> }] }]),
    ...(extra ? [extra.section] : []),
  ];
  const extraView = !!extra && extra.section.items.some((it) => it.id === view);
  const search = os === "win" ? <Search value={q} onChange={setQ} placeholder={t("search")} wide /> : null;

  return (
    <App
      name="services"
      sidebar={
        <Sidebar
          label={t("title")}
          sections={sections}
          value={view}
          onChange={(id) => (setView(id), setSel(""))}
          header={
            head || search ? (
              <>
                {head}
                {search}
              </>
            ) : undefined
          }
        />
      }
    >
      {view === "packages" ? (
        <Packages />
      ) : extraView && extra ? (
        extra.render(view)
      ) : (
        <>
          <Toolbar title={title || t("title")} subtitle={data ? d("count", { n: shown.length }) : undefined} back={back} end={os === "mac" ? <Search value={q} onChange={setQ} placeholder={t("search")} /> : undefined}>
            <Tool icon={<IconPlus />} label={t("add")} primary onClick={() => setEdit({ item: null })} />
            {owner ? null : <Tool icon={<IconMegaphone />} label={t("promoteProfile")} onClick={() => setPromote(items.find((x) => x.status === "active") ?? items[0] ?? null)} disabled={!items.length} />}
            {owner ? null : <Tool icon={<IconShieldCheck />} label={t("rules.drawerTitle")} onClick={() => setRules({ serviceId: "", focus: [] })} />}
            <Tool icon={<IconRefresh />} label={t("refresh")} onClick={() => setTick((n) => n + 1)} />
          </Toolbar>
          <div className="dxv-body">
            <section className="dxv-list" aria-label={t("title")}>
              {data === null ? (
                failed ? (
                  <Empty icon={<IconAlert />} title={t("error")} action={<Btn onClick={() => setTick((n) => n + 1)}>{t("retry")}</Btn>} />
                ) : (
                  <Loading label={d("loading")} />
                )
              ) : !items.length ? (
                <Empty icon={<IconBriefcase />} title={t.has("empty.title") ? t("empty.title") : d("empty")} text={owner ? t("empty.textOwner") : undefined} action={<Btn kind="primary" icon={<IconPlus />} onClick={() => setEdit({ item: null })}>{t("addFirst")}</Btn>} />
              ) : !shown.length ? (
                <Empty icon={<IconSearch />} title={d("noResults")} />
              ) : (
                <div className="dxv-scroll" role="listbox" aria-label={t("title")}>
                  {shown.map((x) => (
                    <div key={x.id} role="option" tabIndex={sel === x.id ? 0 : -1} aria-selected={sel === x.id} className={`dxv-row${sel === x.id ? " is-on" : ""}`} onClick={() => setSel(x.id)} onDoubleClick={() => setEdit({ item: x })} onContextMenu={(e) => (e.preventDefault(), setSel(x.id), rowMenu(e, x))}>
                      <span className="dxv-row__top">
                        <b>{x.service.name}</b>
                        <em>{x.effectivePrice ? `${som(x.effectivePrice)} ${t("card.som")}` : t("form.noPriceTag")}</em>
                      </span>
                      <span className="dxv-row__tags">
                        <Tag tone={TONE[x.status]}>{t(`status.${x.status}`)}</Tag>
                        {x.visible ? (
                          <Tag tone="ok">
                            <IconEye aria-hidden />
                          </Tag>
                        ) : (
                          <Tag>
                            <IconEyeOff aria-hidden />
                          </Tag>
                        )}
                        {x.ownPromotion ? <Tag tone="accent">{t("card.promoted", { days: x.ownPromotion.daysLeft })}</Tag> : null}
                        {x.service.categoryTitle ? <small>{x.service.categoryTitle}</small> : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {current && data ? (
              <Sheet key={current.id} x={current} data={data} busy={busy === current.id} onStatus={(s) => void setStatus(current, s)} onEdit={() => setEdit({ item: current })} onPromote={owner ? undefined : () => setPromote(current)} onRemove={() => void remove(current)} />
            ) : (
              <div className="dxv-none">
                <Empty icon={<IconBriefcase />} title={d("pick")} text={owner ? t("leadOwner") : t("lead")} />
              </div>
            )}
          </div>
        </>
      )}
      {edit && data ? (
        <ServiceDialog
          item={edit.item}
          data={data}
          uid={uid}
          scope={scope}
          onClose={() => setEdit(null)}
          onSaved={(x, msg) => {
            replace(x);
            setSel(x.id);
            setEdit(null);
            say(msg);
          }}
          onRules={(ids, id) => setRules({ serviceId: id, focus: ids })}
        />
      ) : null}
      {owner ? null : <PromoteDialog open={!!promote} start={promote ? "service_boost" : "profile_boost"} services={items.filter((x) => x.status === "active")} onClose={() => setPromote(null)} onSent={() => setTick((n) => n + 1)} />}
      {rules && !owner ? <RulesDialog serviceId={rules.serviceId} focus={rules.focus} onClose={() => (setRules(null), void refreshRulesGate({ force: true }))} /> : null}
      {confirmNode}
      {toast}
    </App>
  );
}

function Sheet({ x, data, busy, onStatus, onEdit, onPromote, onRemove }: { x: ManagedService; data: ManagedServices; busy: boolean; onStatus: (s: ServiceStatus) => void; onEdit: () => void; onPromote?: () => void; onRemove: () => void }) {
  const t = useTranslations("sellerServices");
  const d = useTranslations("portal.desk.services");
  const reasons = hiddenReasons(x, data.profile);
  const band = x.limits;
  return (
    <article className="dxv-sheet" aria-label={x.service.name}>
      <header>
        <span className="dxv-sheet__ic" aria-hidden>
          <IconBriefcase />
        </span>
        <div>
          <h2>{x.service.name}</h2>
          <p>{[x.service.categoryTitle, x.service.subcategory].filter(Boolean).join(" · ")}</p>
        </div>
        <Tag tone={TONE[x.status]}>{t(`status.${x.status}`)}</Tag>
      </header>
      <div className="dxv-acts">
        {x.status === "active" ? (
          <Btn icon={<IconPause />} busy={busy} onClick={() => onStatus("paused")}>
            {d("pause")}
          </Btn>
        ) : (
          <Btn kind="primary" icon={<IconPlay />} busy={busy} disabled={!x.service.isActive} onClick={() => onStatus("active")}>
            {d("activate")}
          </Btn>
        )}
        <Btn icon={<IconEdit />} onClick={onEdit} disabled={!x.service.isActive}>
          {t("card.edit")}
        </Btn>
        {onPromote ? (
          <Btn icon={<IconMegaphone />} onClick={onPromote} disabled={x.status !== "active"} title={x.status !== "active" ? t("card.promoteInactive") : undefined}>
            {t("card.promote")}
          </Btn>
        ) : null}
        {x.status !== "inactive" ? (
          <Btn icon={<IconPower />} onClick={() => onStatus("inactive")}>
            {d("deactivate")}
          </Btn>
        ) : null}
        <Btn kind="danger" icon={<IconTrash />} onClick={onRemove}>
          {t("card.remove")}
        </Btn>
      </div>
      {x.visible ? <Banner tone="ok" title={t("card.visible")} /> : <Banner tone="warn" title={t("card.hidden", { reasons: reasons.map((r) => t(`reasons.${r}`)).join(", ") })} />}
      <section className="dxv-box">
        <div className="dxv-price">
          <small>{t("form.price")}</small>
          <b>{x.effectivePrice ? `${som(x.effectivePrice)} ${t("card.som")}` : t("form.noPriceTag")}</b>
          {band && band.max ? <span>{t("card.band", { min: som(band.min), max: som(band.max) })}</span> : <span>{t("card.bandUnknown")}</span>}
          {x.priceCapped ? <Tag tone="warn">{t("card.capped")}</Tag> : null}
        </div>
        <div className="dxv-line">
          <span>{d("negotiation")}</span>
          <Tag tone={x.negotiationAllowed ? "ok" : "neutral"}>{x.negotiationAllowed ? d("on") : d("off")}</Tag>
        </div>
        {x.ownPromotion ? (
          <div className="dxv-line">
            <span>{t("card.promotedShort")}</span>
            <Tag tone="accent">{t("card.promotedHint", { days: x.ownPromotion.daysLeft })}</Tag>
          </div>
        ) : null}
      </section>
      <section className="dxv-box">
        <h3>{t("form.note")}</h3>
        <p className={x.experienceNote ? "dxv-text" : "dxv-muted"}>{x.experienceNote || t("card.noteEmpty")}</p>
      </section>
      {x.service.description ? (
        <section className="dxv-box">
          <h3>{d("about")}</h3>
          <p className="dxv-text">{x.service.description}</p>
        </section>
      ) : null}
    </article>
  );
}

// Adding a service from the catalogue, or editing one: its price within the
// allowed range, negotiation, the experience note, the status.
function ServiceDialog({ item, data, uid, scope, onClose, onSaved, onRules }: { item: ManagedService | null; data: ManagedServices; uid: string; scope: ServiceScope; onClose: () => void; onSaved: (x: ManagedService, msg: string) => void; onRules: (ids: string[], serviceId: string) => void }) {
  const t = useTranslations("sellerServices");
  const tf = useTranslations("sellerServices.form");
  const d = useTranslations("portal.desk.services");
  const locale = useLocale();
  const [svc, setSvc] = useState<BackendService | null>(item?.service ?? null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<BackendService[] | null>(null);
  const [price, setPrice] = useState(item?.selectedPrice ? String(item.selectedPrice) : "");
  const [neg, setNeg] = useState<boolean>(item?.negotiationAllowed ?? false);
  const [note, setNote] = useState(item?.experienceNote ?? "");
  const noteHits = useMemo(() => findContacts(note), [note]);
  const noteStrip = useContactStrip(setNote);
  const [noteRefused, setNoteRefused] = useState<{ message: string } | null>(null);
  const tcg = useTranslations("common.contactGuard");
  const [status, setStatus] = useState<ServiceStatus>(item?.status ?? "active");
  const [policy, setPolicy] = useState(!!item);
  const [band, setBand] = useState<PriceBand | null>(item?.limits ?? null);
  const [runtime, setRuntime] = useState<RuntimeConfig | null>(null);
  const cfg = useSellerConfig(svc?.id ?? "", uid, !!svc).config;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const taken = new Set(data.items.map((x) => x.service.id));
  useEffect(() => {
    const term = q.trim();
    if (item || term.length < 2) return;
    const h = setTimeout(() => {
      searchServices(term, { limit: 20 }, locale)
        .then((rows) => setHits(rows.map((r) => r.service)))
        .catch(() => setHits([]));
    }, 260);
    return () => clearTimeout(h);
  }, [q, item, locale]);
  useEffect(() => {
    if (!svc) return;
    let alive = true;
    priceBandFor(svc.id, data.seller.id, data.profile.region).then((b) => alive && b && setBand(b)).catch(() => undefined);
    getRuntimeConfig(svc.id).then((r) => alive && setRuntime(r)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [svc, data.seller.id, data.profile.region]);
  const value = Math.round(Number(price.replace(/[^\d]/g, "")) || 0);
  const out = !!band && !!band.max && value > 0 && (value < band.min || value > band.max);
  async function save() {
    if (!svc || busy) return;
    if (!policy) return setErr(tf("policyRequired"));
    if (out && band) return setErr(tf("priceOut", { min: som(band.min), max: som(band.max) }));
    if (noteHits.length) return setErr(tcg("title"));
    setBusy(true);
    setErr("");
    const r = await saveSellerService({ scope, locale, uid, persisted: item, input: { serviceId: svc.id, selectedPrice: value, experienceNote: note.trim(), status }, negotiation: neg, runtime, fallbackPrice: band?.recommended ?? 0 });
    setBusy(false);
    if (r.ok) return onSaved(r.saved, r.created ? tf("added") : d("saved"));
    if (r.stage === "config" && r.error.code === "service_rules_acceptance_required") {
      onRules(r.error.missingRuleIds, r.persisted.id);
      return onSaved(r.persisted, t("rules.savedNotEnabled"));
    }
    if (r.stage === "manage" && r.error.kind === "contact") {
      setNoteRefused({ message: r.error.detail });
      return setErr(tcg("title"));
    }
    setErr(r.stage === "manage" ? (t.has(`errors.${r.error.kind}`) ? t(`errors.${r.error.kind}`, { min: som(r.error.min), max: som(r.error.max) }) : t("errors.unknown")) : r.error.message || t("errors.unknown"));
  }
  return (
    <Dialog
      open
      title={item ? tf("editTitle") : tf("addTitle")}
      onClose={() => !busy && onClose()}
      onSubmit={() => void save()}
      width={560}
      actions={
        <>
          <Btn onClick={onClose} disabled={busy}>
            {tf("cancel")}
          </Btn>
          <Btn kind="primary" type="submit" busy={busy} disabled={!svc}>
            {tf("save")}
          </Btn>
        </>
      }
    >
      {!svc ? (
        <Field label={tf("service")} hint={tf("serviceHint")}>
          <Input value={q} onChange={setQ} placeholder={tf("searchPh")} autoFocus />
          {q.trim().length >= 2 ? (
            <div className="dxv-hits" role="listbox" aria-label={tf("service")}>
              {hits === null ? (
                <p className="dxv-muted">{tf("searching")}</p>
              ) : !hits.length ? (
                <p className="dxv-muted">{tf("noResults")}</p>
              ) : (
                hits.map((h) => (
                  <button key={h.id} type="button" role="option" aria-selected={false} disabled={taken.has(h.id)} onClick={() => setSvc(h)}>
                    <b>{h.name}</b>
                    <small>{[h.categoryTitle, h.price ? tf("fromPrice", { price: som(h.price) }) : "", taken.has(h.id) ? tf("added") : "", h.advokatRequired ? tf("advocateOnly") : ""].filter(Boolean).join(" · ")}</small>
                  </button>
                ))
              )}
            </div>
          ) : (
            <p className="dxv-muted">{tf("typeMore")}</p>
          )}
        </Field>
      ) : (
        <div className="dxv-picked">
          <IconCheck aria-hidden />
          <span>
            <b>{svc.name}</b>
            {svc.categoryTitle ? <small>{svc.categoryTitle}</small> : null}
          </span>
          {!item ? (
            <Btn small kind="plain" onClick={() => setSvc(null)}>
              {tf("change")}
            </Btn>
          ) : null}
        </div>
      )}
      {svc ? (
        <>
          <PriceLimits
            minimum={cfg?.minimumListingPrice || band?.min || 0}
            recommended={cfg?.recommendedPrice || band?.recommended || 0}
            sellerMax={cfg?.maximumPrice || band?.max || 0}
            serviceMax={cfg?.serviceMaximumPrice || runtime?.pricing.maximumPrice || 0}
            increasePct={cfg?.maxIncreasePercent ?? null}
            price={value}
            explanation={priceExplanationOf(cfg?.raw.price_explanation)}
            modifiers={band?.modifiers ?? null}
            requirements={cfg?.requirements ?? []}
            discountPct={cfg?.maxListingDiscountPercent ?? runtime?.pricing.maxListingDiscountPercent ?? null}
            belowAllowed={cfg?.belowRecommendedAllowed ?? runtime?.pricing.sellerCanPriceBelowRecommended ?? null}
            aiId="portal.desk.services.limits"
          />
          <Field label={tf("price")} hint={band && band.max ? tf("bandHint", { min: som(band.min), max: som(band.max) }) : tf("bandLoading")} error={out && band ? tf("priceOut", { min: som(band.min), max: som(band.max) }) : undefined}>
            <Input value={price ? som(value) : ""} onChange={(v) => setPrice(v.replace(/[^\d]/g, ""))} placeholder={tf("pricePh")} />
          </Field>
          {band && band.recommended ? (
            <div className="dxv-chips">
              <Btn small onClick={() => setPrice(String(band.recommended))}>
                {tf("useRecommended", { price: som(band.recommended) })}
              </Btn>
              {band.min ? (
                <Btn small onClick={() => setPrice(String(band.min))}>
                  {tf("useMin", { price: som(band.min) })}
                </Btn>
              ) : null}
            </div>
          ) : null}
          <label className="dxv-toggle">
            <span>
              <b>{d("negotiation")}</b>
              <small>{d("negotiationHint")}</small>
            </span>
            <Toggle checked={neg} onChange={setNeg} label={d("negotiation")} onText={d("on")} offText={d("off")} />
          </label>
          <Field label={tf("note")} hint={tf("noteHint")} error={noteHits.length || noteRefused ? tcg("field") : undefined}>
            <TextArea
              value={note}
              onChange={(v, e) => {
                noteStrip.change(v, e);
                setNoteRefused(null);
              }}
              onBlur={() => noteStrip.blur(note)}
              rows={3}
              placeholder={tf("notePh")}
              maxLength={2000}
            />
          </Field>
          <ContactGuardNote hits={noteHits} removed={noteStrip.removed} server={noteRefused} />
          <Field label={tf("status")}>
            <Select ariaLabel={tf("status")} value={status} onChange={setStatus} options={(["active", "paused", "inactive"] as const).map((s) => ({ value: s, label: t(`status.${s}`) }))} />
          </Field>
          <Check checked={policy} onChange={setPolicy} label={tf("policy")}>
            {tf("policy")}
          </Check>
        </>
      ) : null}
      {err ? <Banner tone="err" title={err} /> : null}
    </Dialog>
  );
}

// The service rules to accept before a service can be switched on.
function RulesDialog({ serviceId, focus, onClose }: { serviceId: string; focus: string[]; onClose: () => void }) {
  const t = useTranslations("sellerServices.rules");
  const locale = useLocale();
  const [list, setList] = useState<ServiceRule[] | null>(null);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<string[]>(focus);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    listServiceRules(serviceId || undefined)
      .then((r) => alive && setList(r.items))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [serviceId]);
  async function accept(r: ServiceRule) {
    setBusy(r.id);
    setErr("");
    try {
      const a = await acceptServiceRule(r.id);
      setList((l) => (l ?? []).map((x) => (x.id === r.id ? { ...x, accepted: true, acceptedAt: a.acceptedAt || x.acceptedAt } : x)));
    } catch {
      setErr(t("acceptError"));
    } finally {
      setBusy("");
    }
  }
  const pending = (list ?? []).filter((r) => !r.accepted).length;
  return (
    <Dialog open title={t("drawerTitle")} onClose={onClose} onSubmit={onClose} width={600} actions={<Btn kind="primary" type="submit">{pending ? t("close") : t("done")}</Btn>}>
      <p className="dx-dlg__text">{t("drawerLead")}</p>
      {list === null ? (
        <Loading label={t("checking")} />
      ) : !list.length ? (
        <Banner tone="info" title={t("empty")} />
      ) : (
        <>
          <Banner tone={pending ? "warn" : "ok"} title={pending ? t("summaryPending", { n: pending }) : t("summaryDone")} />
          <ul className="dxv-rules">
            {list.map((r) => (
              <li key={r.id} className={r.accepted ? "is-ok" : ""}>
                <div className="dxv-rules__h">
                  <span>
                    <b>{r.title}</b>
                    <small>
                      {t("version", { version: r.version })}
                      {r.effectiveAt ? ` · ${t("effectiveSince", { date: new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale === "ru" ? "ru-RU" : "uz-UZ").format(new Date(r.effectiveAt)) })}` : ""}
                    </small>
                  </span>
                  {r.accepted ? (
                    <Tag tone="ok">{t("stateAccepted")}</Tag>
                  ) : (
                    <Btn small kind="primary" busy={busy === r.id} onClick={() => void accept(r)}>
                      {t("accept")}
                    </Btn>
                  )}
                </div>
                {r.body ? (
                  open.includes(r.id) ? (
                    <>
                      <p className="dxv-rules__body">{r.body}</p>
                      <Btn small kind="plain" onClick={() => setOpen((o) => o.filter((x) => x !== r.id))}>
                        {t("hideText")}
                      </Btn>
                    </>
                  ) : (
                    <Btn small kind="plain" onClick={() => setOpen((o) => [...o, r.id])}>
                      {t("showText")}
                    </Btn>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {err ? <Banner tone="err" title={err} /> : null}
    </Dialog>
  );
}

// The ready-made packages the seller may offer: each switched on or off,
// with why one can't be when it can't.
function Packages() {
  const tp = useTranslations("sellerPackages");
  const d = useTranslations("portal.desk.services");
  const [list, setList] = useState<SellerPackage[] | null>(null);
  const [busy, setBusy] = useState("");
  const [toast, say] = useToast();
  useEffect(() => {
    const c = new AbortController();
    listMyPackages(c.signal)
      .then((l) => !c.signal.aborted && setList(l))
      .catch(() => !c.signal.aborted && setList([]));
    return () => c.abort();
  }, []);
  async function toggle(p: SellerPackage, on: boolean) {
    setBusy(p.id);
    try {
      const saved = on ? await enableMyPackage(p.id) : await setMyPackageStatus(p.id, "disabled");
      setList((l) => (l ?? []).map((x) => (x.id === p.id ? (saved ?? { ...x, enabled: on, status: on ? "active" : "disabled" }) : x)));
    } catch {
      say(d("packageFailed"), "err");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <Toolbar title={tp("tabPackages")} subtitle={list ? d("count", { n: list.length }) : undefined} />
      {list === null ? (
        <Loading label={d("loading")} />
      ) : !list.length ? (
        <Empty icon={<IconPackage />} title={d("noPackages")} />
      ) : (
        <div className="dxv-packs dx-scroll">
          {list.map((p) => (
            <article key={p.id} className={`dxv-pack${p.enabled ? " is-on" : ""}`}>
              <header>
                <span className="dxv-pack__ic" aria-hidden>
                  <IconPackage />
                </span>
                <span>
                  <b>{p.pkg.title}</b>
                  <small>{[p.pkg.categoryTitle, p.pkg.duration].filter(Boolean).join(" · ")}</small>
                </span>
                <Toggle checked={p.enabled} disabled={busy === p.id || (!p.enabled && !p.eligibility.eligible)} onChange={(v) => void toggle(p, v)} label={p.pkg.title} onText={d("on")} offText={d("off")} />
              </header>
              <b className="dxv-pack__price">{p.pkg.price ? `${som(p.pkg.price)} UZS` : "—"}</b>
              {p.pkg.included.length ? (
                <ul>
                  {p.pkg.included.slice(0, 5).map((x) => (
                    <li key={x}>
                      <IconCheck aria-hidden />
                      {x}
                    </li>
                  ))}
                </ul>
              ) : null}
              {!p.eligibility.eligible && p.eligibility.reasons.length ? <Banner tone="warn" title={p.eligibility.reasons.join(" · ")} /> : null}
            </article>
          ))}
        </div>
      )}
      {toast}
    </>
  );
}
