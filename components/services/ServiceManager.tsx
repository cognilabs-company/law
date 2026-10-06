"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore, useRef, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { isAborted } from "@/lib/http";
import { toast } from "@/lib/toast";
import { matchesSearch } from "@/lib/searchText";
import { subscribeUserEvents } from "@/lib/userSocket";
import {
  dropPendingPromos,
  isLawyerSeller,
  listManagedServices,
  parsePendingPromos,
  pendingPromoKey,
  pendingPromosRaw,
  profileVerified,
  promoSignalOf,
  prunePendingPromos,
  removeManagedService,
  scopeKey,
  serviceErrorOf,
  setManagedServiceStatus,
  subscribePendingPromos,
  type ManagedService,
  type ManagedServices,
  type ServiceError,
  type ServiceScope,
  type ServiceStatus,
} from "@/lib/services/sellerServices";
import {
  IconAlert,
  IconBriefcase,
  IconClock,
  IconLock,
  IconMegaphone,
  IconPause,
  IconPlay,
  IconPlus,
  IconPower,
  IconRefresh,
  IconRocket,
  IconSearch,
  IconShieldCheck,
  IconStore,
} from "@/components/icons";
import ServiceCard from "./ServiceCard";
import ServiceFormModal from "./ServiceFormModal";
import PromoteModal from "./PromoteModal";
import { RemoveServiceModal, som } from "./bits";

type Filter = "all" | ServiceStatus;
type Load = { key: string; data: ManagedServices | null; error: ServiceError | null };
type Dialog =
  | { kind: "add" }
  | { kind: "edit"; item: ManagedService }
  | { kind: "promote"; item: ManagedService }
  | { kind: "remove"; item: ManagedService }
  | null;

const FILTERS: Filter[] = ["all", "active", "paused", "inactive"];
const RANK: Record<ServiceStatus, number> = { active: 0, paused: 1, inactive: 2 };

export default function ServiceManager({
  scope,
  role,
  owner = false,
  title,
  onData,
  renderBlocked,
}: {
  scope: ServiceScope;
  role: "lawyer" | "advocate";
  owner?: boolean;
  title?: string;
  onData?: (d: ManagedServices) => void;
  renderBlocked?: (e: ServiceError) => ReactNode;
}) {
  const t = useTranslations("sellerServices");
  const locale = useLocale();
  const { session } = useAuth();
  const uid = session?.id ?? "";
  const listId = useId();
  const orgId = scope.kind === "org" ? scope.orgId : "";
  const memberId = scope.kind === "org" ? scope.memberId : "";
  const sc = useMemo<ServiceScope>(() => (orgId ? { kind: "org", orgId, memberId } : { kind: "me" }), [orgId, memberId]);
  const skey = scopeKey(sc);
  const [tick, setTick] = useState(0);
  const [pulse, setPulse] = useState(0);
  const reqKey = `${skey}|${locale}|${tick}`;
  const [load, setLoad] = useState<Load>({ key: "", data: null, error: null });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [removing, setRemoving] = useState(false);
  const [removeErr, setRemoveErr] = useState("");
  const onDataRef = useRef(onData);

  useEffect(() => {
    onDataRef.current = onData;
  });

  useEffect(() => {
    const c = new AbortController();
    listManagedServices(sc, locale, c.signal)
      .then((data) => {
        if (c.signal.aborted) return;
        setLoad({ key: reqKey, data, error: null });
        onDataRef.current?.(data);
      })
      .catch((e: unknown) => {
        if (isAborted(e) || c.signal.aborted) return;
        setLoad((cur) => ({ key: reqKey, data: cur.data && cur.key.startsWith(`${skey}|`) ? cur.data : null, error: serviceErrorOf(e) }));
      });
    return () => c.abort();
  }, [sc, skey, locale, reqKey]);

  useEffect(() => {
    if (!pulse) return;
    const h = window.setTimeout(() => setTick((n) => n + 1), 700);
    return () => window.clearTimeout(h);
  }, [pulse]);

  const raw = useSyncExternalStore(subscribePendingPromos, () => pendingPromosRaw(uid), () => "");
  const pending = useMemo(() => parsePendingPromos(raw), [raw]);
  const data = load.data;

  useEffect(() => {
    if (uid) prunePendingPromos(uid);
  }, [uid]);

  useEffect(() => {
    if (!uid || !data) return;
    const live = new Set(data.items.filter((x) => x.ownPromotion).map((x) => pendingPromoKey(sc, x.id)));
    if (live.size) dropPendingPromos(uid, (k) => live.has(k));
  }, [uid, data, sc]);

  useEffect(() => {
    if (!uid) return;
    return subscribeUserEvents((ev) => {
      const s = promoSignalOf(ev);
      if (!s || s.kind === "pending") return;
      dropPendingPromos(uid, (k, p) => (s.requestId !== "" && p.requestId === s.requestId) || (s.serviceId !== "" && k === pendingPromoKey(sc, s.serviceId)));
      toast(s.kind === "approved" ? t("toast.approved") : t("toast.rejected"), { tone: s.kind === "approved" ? "ok" : "err" });
      setPulse((n) => n + 1);
    });
  }, [uid, sc, t]);

  const hasPending = Object.keys(pending).some((k) => k.startsWith(`${skey}|`));
  useEffect(() => {
    if (!hasPending) return;
    const onVis = () => {
      if (document.visibilityState === "visible") setPulse((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [hasPending]);

  const items = useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => RANK[a.status] - RANK[b.status] || a.service.name.localeCompare(b.service.name, locale)),
    [data, locale],
  );
  const taken = useMemo(() => new Set(items.map((x) => x.id)), [items]);
  const counts = useMemo(
    () => ({
      all: items.length,
      active: items.filter((x) => x.status === "active").length,
      paused: items.filter((x) => x.status === "paused").length,
      inactive: items.filter((x) => x.status === "inactive").length,
      promoted: items.filter((x) => x.ownPromotion).length,
    }),
    [items],
  );
  const shown = items.filter(
    (x) =>
      (filter === "all" || x.status === filter) &&
      matchesSearch(`${x.service.name} ${x.service.categoryTitle ?? ""} ${x.service.subcategory ?? ""} ${x.experienceNote}`, query),
  );
  const waiting = items.filter((x) => !x.ownPromotion && pending[pendingPromoKey(sc, x.id)]).length;
  const loading = load.key !== reqKey;
  const reload = () => setTick((n) => n + 1);

  const errText = (e: ServiceError) => {
    if (e.kind === "range") return t("errors.range", { min: som(e.min), max: som(e.max) });
    if (e.kind === "forbidden" && owner) return t("errors.forbiddenOwner");
    return t(`errors.${e.kind}`);
  };

  const replaceItem = (saved: ManagedService) =>
    setLoad((cur) => (cur.data ? { ...cur, data: { ...cur.data, items: [saved, ...cur.data.items.filter((x) => x.id !== saved.id)] } } : cur));
  const dropItem = (id: string) =>
    setLoad((cur) => (cur.data ? { ...cur, data: { ...cur.data, items: cur.data.items.filter((x) => x.id !== id) } } : cur));

  const changeStatus = async (item: ManagedService, status: ServiceStatus) => {
    if (busyIds[item.id]) return;
    setBusyIds((b) => ({ ...b, [item.id]: true }));
    try {
      replaceItem(await setManagedServiceStatus(sc, item.id, status, locale));
      toast(t(`statusSaved.${status}`), { tone: "ok" });
    } catch (e) {
      const err = serviceErrorOf(e);
      toast(errText(err), { tone: "err" });
      if (err.kind === "notFound") reload();
    } finally {
      setBusyIds((b) => Object.fromEntries(Object.entries(b).filter(([k]) => k !== item.id)));
    }
  };

  const confirmRemove = async () => {
    if (dialog?.kind !== "remove" || removing) return;
    const item = dialog.item;
    setRemoving(true);
    setRemoveErr("");
    try {
      await removeManagedService(sc, item.id);
      dropItem(item.id);
      dropPendingPromos(uid, (k) => k === pendingPromoKey(sc, item.id));
      toast(t("toast.removed"), { tone: "ok" });
      setDialog(null);
    } catch (e) {
      const err = serviceErrorOf(e);
      if (err.kind === "notFound") {
        dropItem(item.id);
        setDialog(null);
        reload();
      } else {
        setRemoveErr(errText(err));
      }
    } finally {
      setRemoving(false);
    }
  };

  if (!data) {
    if (loading || !load.error) {
      return (
        <div className="svm" aria-busy="true">
          <div className="svm__hero is-skel" />
          <div className="svm__grid">
            {[0, 1, 2].map((i) => (
              <div key={i} className="msv is-skel" />
            ))}
          </div>
        </div>
      );
    }
    const custom = renderBlocked?.(load.error);
    if (custom) return <>{custom}</>;
    const locked = load.error.kind === "forbidden" || load.error.kind === "pendingAccount";
    return (
      <div className="svm">
        <div className={`svm__blocked${locked ? " is-lock" : ""}`} role="alert">
          <span className="svm__bic" aria-hidden="true">
            {locked ? <IconLock /> : <IconAlert />}
          </span>
          <b>{locked ? t("blocked.lockTitle") : t("error")}</b>
          <p>{errText(load.error)}</p>
          {locked ? null : (
            <button type="button" className="btn btn--line btn--sm" onClick={reload}>
              <IconRefresh aria-hidden="true" />
              {t("retry")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const lawyer = isLawyerSeller(data.profile.sellerType, owner ? undefined : role);
  const sellerId = data.seller.id || data.profile.userId;
  const boost = items.find((x) => x.profileBoost)?.profileBoost ?? null;
  const verified = profileVerified(data.profile);
  const stats = [
    { k: "active", Icon: IconPlay, v: counts.active },
    { k: "paused", Icon: IconPause, v: counts.paused },
    { k: "inactive", Icon: IconPower, v: counts.inactive },
    { k: "promoted", Icon: IconMegaphone, v: counts.promoted },
  ] as const;

  return (
    <div className="svm">
      <section className="svm__hero" data-ai-target="services:summary">
        <div className="svm__hero-t">
          <span className="kick svm__kick">
            <IconStore aria-hidden="true" />
            {t("kicker")}
          </span>
          <h2 className="svm__title">{title ?? t("title")}</h2>
          <p className="svm__lead">{owner ? t("leadOwner") : t("lead")}</p>
        </div>
        <div className="svm__hero-a">
          <button type="button" className="btn btn--grad" onClick={() => setDialog({ kind: "add" })} data-ai-target="button:add-service">
            <IconPlus aria-hidden="true" />
            {t("add")}
          </button>
          {owner ? null : (
            <Link href={`/portal/${role}/promotion`} className="btn btn--glass btn--sm">
              <IconRocket aria-hidden="true" />
              {t("promoteProfile")}
            </Link>
          )}
        </div>
        <ul className="svm__stats">
          {stats.map(({ k, Icon, v }) => (
            <li key={k} className={`svm__stat svm__stat--${k}`}>
              <span className="svm__sic" aria-hidden="true">
                <Icon />
              </span>
              <b>{v}</b>
              <span>{t(`stats.${k}`)}</span>
              {k === "promoted" && waiting ? (
                <em className="svm__swait">
                  <IconClock aria-hidden="true" />
                  {t("stats.waiting", { n: waiting })}
                </em>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {verified ? null : (
        <div className="svm__notice svm__notice--warn" role="note">
          <span className="svm__nic" aria-hidden="true">
            <IconShieldCheck />
          </span>
          <div className="svm__nt">
            <b>{t("unverified.title")}</b>
            <p>{owner ? t("unverified.textOwner") : t("unverified.text")}</p>
          </div>
          {owner ? null : (
            <Link href={`/portal/${role}/profile`} className="btn btn--line btn--sm">
              {t("unverified.action")}
            </Link>
          )}
        </div>
      )}
      {boost ? (
        <div className="svm__notice svm__notice--boost" role="note">
          <span className="svm__nic" aria-hidden="true">
            <IconRocket />
          </span>
          <div className="svm__nt">
            <b>{t("boost.title")}</b>
            <p>{t("boost.text", { days: boost.daysLeft })}</p>
          </div>
        </div>
      ) : null}

      {items.length ? (
        <>
          <div className="svm__bar" data-ai-target="services:filters">
            <div className="suptabs svm__tabs" role="tablist" aria-label={t("filters.label")}>
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  aria-controls={listId}
                  className="suptab"
                  onClick={() => setFilter(f)}
                >
                  {t(`filters.${f}`)}
                  <span className="svm__count">{counts[f]}</span>
                </button>
              ))}
            </div>
            <label className="svm__search">
              <IconSearch aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("searchLabel")} />
            </label>
            <button
              type="button"
              className={`svm__refresh${loading ? " is-spin" : ""}`}
              onClick={reload}
              disabled={loading}
              aria-label={t("refresh")}
              title={t("refresh")}
            >
              <IconRefresh aria-hidden="true" />
            </button>
          </div>

          <div className="svm__grid" id={listId} role="tabpanel" aria-busy={loading || undefined} data-ai-target="services:list">
            {shown.map((x, i) => (
              <ServiceCard
                key={x.id}
                item={x}
                index={i}
                first={i === 0}
                profile={data.profile}
                sellerId={sellerId}
                pending={x.ownPromotion ? null : (pending[pendingPromoKey(sc, x.id)] ?? null)}
                busy={Boolean(busyIds[x.id])}
                onStatus={(s) => void changeStatus(x, s)}
                onEdit={() => setDialog({ kind: "edit", item: x })}
                onPromote={() => setDialog({ kind: "promote", item: x })}
                onRemove={() => {
                  setRemoveErr("");
                  setDialog({ kind: "remove", item: x });
                }}
              />
            ))}
            {shown.length ? null : (
              <div className="svm__none">
                <IconSearch aria-hidden="true" />
                <b>{t("empty.filtered")}</b>
                <p>{t("empty.filteredText")}</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="svm__empty" data-ai-target="services:list">
          <span className="svm__eic" aria-hidden="true">
            <IconBriefcase />
          </span>
          <b>{t("empty.title")}</b>
          <p>{owner ? t("empty.textOwner") : t("empty.text")}</p>
          <button type="button" className="btn btn--pri" onClick={() => setDialog({ kind: "add" })}>
            <IconPlus aria-hidden="true" />
            {t("addFirst")}
          </button>
        </div>
      )}

      {dialog?.kind === "add" || dialog?.kind === "edit" ? (
        <ServiceFormModal
          key={dialog.kind === "edit" ? dialog.item.id : "new"}
          item={dialog.kind === "edit" ? dialog.item : null}
          scope={sc}
          uid={uid}
          sellerId={sellerId}
          region={data.profile.region}
          lawyer={lawyer}
          owner={owner}
          taken={taken}
          onClose={() => setDialog(null)}
          onSaved={(saved, created) => {
            replaceItem(saved);
            toast(t(created ? "toast.added" : "toast.saved"), { tone: "ok" });
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "promote" ? (
        <PromoteModal item={dialog.item} scope={sc} uid={uid} owner={owner} onClose={() => setDialog(null)} onSent={() => toast(t("toast.promoSent"), { tone: "ok" })} />
      ) : null}
      {dialog?.kind === "remove" ? (
        <RemoveServiceModal
          item={dialog.item}
          busy={removing}
          error={removeErr}
          onCancel={() => setDialog(null)}
          onConfirm={() => void confirmRemove()}
        />
      ) : null}
    </div>
  );
}
