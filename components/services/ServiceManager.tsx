"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, useRef, type ReactNode } from "react";
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
  settlePendingFromInbox,
  subscribePendingPromos,
  type ManagedService,
  type ManagedServices,
  type PromoOutcome,
  type ServiceError,
  type ServiceScope,
  type ServiceStatus,
} from "@/lib/services/sellerServices";
import {
  IconAlert,
  IconBriefcase,
  IconClipboardCheck,
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
  IconUsers,
} from "@/components/icons";
import FilterBar, { type FilterField } from "@/components/filters/FilterBar";
import { aiId } from "@/lib/ai/ids";
import { useAiField, useAiModal, useAiSelection } from "@/lib/ai/registry";
import { useAiReveal } from "@/lib/guide/targets";
import ServiceCard from "./ServiceCard";
import ServiceFormModal from "./ServiceFormModal";
import PromoteModal from "./PromoteModal";
import { RemoveServiceModal, som } from "./bits";
import { useAutoRefresh } from "./useAutoRefresh";

type Filter = "all" | ServiceStatus;
type Load = { key: string; data: ManagedServices | null; error: ServiceError | null };
type Tick = { n: number; quiet: boolean };
type Dialog =
  | { kind: "add" }
  | { kind: "edit"; item: ManagedService }
  | { kind: "promote"; item: ManagedService }
  | { kind: "remove"; item: ManagedService }
  | null;

const FILTERS: Filter[] = ["all", "active", "paused", "inactive"];
const RANK: Record<ServiceStatus, number> = { active: 0, paused: 1, inactive: 2 };
const isFilter = (v: string): v is Filter => (FILTERS as string[]).includes(v);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function announce(out: Pick<PromoOutcome, "kind">[], approved: string, rejected: string): void {
  if (out.some((o) => o.kind === "approved")) toast(approved, { tone: "ok" });
  if (out.some((o) => o.kind === "rejected")) toast(rejected, { tone: "err" });
}

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
  const to = useTranslations("orgOwner");
  const locale = useLocale();
  const { session } = useAuth();
  const uid = session?.id ?? "";
  const orgId = scope.kind === "org" ? scope.orgId : "";
  const memberId = scope.kind === "org" ? scope.memberId : "";
  const sc = useMemo<ServiceScope>(() => (orgId ? { kind: "org", orgId, memberId } : { kind: "me" }), [orgId, memberId]);
  const skey = scopeKey(sc);
  const prefix = `${skey}|`;
  const [tick, setTick] = useState<Tick>({ n: 0, quiet: false });
  const [pulse, setPulse] = useState(0);
  const reqKey = `${skey}|${locale}|${tick.n}`;
  const [load, setLoad] = useState<Load>({ key: "", data: null, error: null });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [removing, setRemoving] = useState(false);
  const [removeErr, setRemoveErr] = useState("");
  const onDataRef = useRef(onData);
  const mut = useRef({ seq: 0, skey: "" });
  const aiBase = orgId ? aiId("organization.member", memberId, "services") : "advocate.services";
  const aiCard = orgId ? aiId("organization.member", memberId, "service") : "services.card";
  const data = load.key.startsWith(prefix) ? load.data : null;
  const hasItems = Boolean(data?.items.length);

  const pickFilter = (v: string) => {
    const w = v.trim().toLowerCase();
    const f = FILTERS.find((x) => x === w || t(`filters.${x}`).toLowerCase() === w);
    if (f) setFilter(f);
  };
  useAiField(hasItems ? `${aiBase}.search.input` : "", { get: () => query, set: setQuery });
  useAiField(hasItems ? `${aiBase}.filters.status` : "", { get: () => filter, set: pickFilter });
  useAiSelection(hasItems ? "seller_services_tab" : "", filter);
  useAiReveal(new RegExp(`^${esc(aiBase)}\\.filter\\.(?:all|active|paused|inactive)$`), (id) => {
    const f = id.slice(id.lastIndexOf(".") + 1);
    if (isFilter(f)) setFilter(f);
  });
  useAiModal(data ? `${aiBase}.form-modal` : "", () => setDialog({ kind: "add" }));

  useEffect(() => {
    onDataRef.current = onData;
  });

  useEffect(() => {
    const c = new AbortController();
    const seq = mut.current.seq;
    listManagedServices(sc, locale, c.signal)
      .then((d) => {
        if (c.signal.aborted) return;
        if (seq !== mut.current.seq && mut.current.skey === skey) {
          setLoad((cur) => ({ ...cur, key: reqKey, error: null }));
          return;
        }
        setLoad({ key: reqKey, data: d, error: null });
        onDataRef.current?.(d);
      })
      .catch((e: unknown) => {
        if (isAborted(e) || c.signal.aborted) return;
        setLoad((cur) => ({ key: reqKey, data: cur.data && cur.key.startsWith(`${skey}|`) ? cur.data : null, error: serviceErrorOf(e) }));
      });
    return () => c.abort();
  }, [sc, skey, locale, reqKey]);

  useEffect(() => {
    if (!pulse) return;
    const h = window.setTimeout(() => setTick((x) => ({ n: x.n + 1, quiet: true })), 700);
    return () => window.clearTimeout(h);
  }, [pulse]);

  const raw = useSyncExternalStore(subscribePendingPromos, () => pendingPromosRaw(uid), () => "");
  const pending = useMemo(() => parsePendingPromos(raw), [raw]);

  useEffect(() => {
    if (uid) prunePendingPromos(uid);
  }, [uid]);

  useEffect(() => {
    if (!uid || !data) return;
    const live = new Set(data.items.filter((x) => x.ownPromotion).map((x) => pendingPromoKey(sc, x.id)));
    if (!live.size) return;
    const out = dropPendingPromos(uid, (k) => live.has(k));
    announce(out.map(() => ({ kind: "approved" as const })), t("toast.approved"), t("toast.rejected"));
  }, [uid, data, sc, t]);

  useEffect(() => {
    if (!uid) return;
    return subscribeUserEvents((ev) => {
      const s = promoSignalOf(ev);
      if (!s || s.kind === "pending") return;
      const kind = s.kind;
      const out = dropPendingPromos(
        uid,
        (k, p) => k.startsWith(`${skey}|`) && ((s.requestId !== "" && p.requestId === s.requestId) || (s.serviceId !== "" && k === pendingPromoKey(sc, s.serviceId))),
      );
      announce(out.map(() => ({ kind })), t("toast.approved"), t("toast.rejected"));
      setPulse((n) => n + 1);
    });
  }, [uid, sc, skey, t]);

  const hasPending = Object.keys(pending).some((k) => k.startsWith(prefix));
  useAutoRefresh(Boolean(uid) && hasPending, async () => {
    if (uid && hasPending) {
      prunePendingPromos(uid);
      const out = await settlePendingFromInbox(uid, (k) => k.startsWith(prefix)).catch(() => []);
      announce(out, t("toast.approved"), t("toast.rejected"));
    }
    setTick((x) => ({ n: x.n + 1, quiet: true }));
  });

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
  const dim = loading && !(tick.quiet && load.key.startsWith(`${skey}|${locale}|`));
  const reload = () => setTick((x) => ({ n: x.n + 1, quiet: false }));

  const errText = (e: ServiceError) => {
    if (e.kind === "range") return t("errors.range", { min: som(e.min), max: som(e.max) });
    if (owner && e.kind === "forbidden") return t("errors.forbiddenOwner");
    if (owner && e.kind === "pendingAccount") return t("errors.pendingAccountOwner");
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
      const saved = await setManagedServiceStatus(sc, item.id, status, locale);
      mut.current = { seq: mut.current.seq + 1, skey };
      replaceItem(saved);
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
      mut.current = { seq: mut.current.seq + 1, skey };
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
    const e = load.error;
    const missing = owner && e.kind === "notFound";
    const wait = e.kind === "pendingAccount";
    const locked = e.kind === "forbidden" || wait || missing;
    const Icon = wait ? IconClock : missing ? IconUsers : locked ? IconLock : IconAlert;
    const head = missing ? to("member.notFoundTitle") : wait ? t("blocked.waitTitle") : locked ? t("blocked.lockTitle") : t("error");
    const text = missing ? to("member.notFoundText") : e.kind === "notFound" ? t("errors.unknown") : errText(e);
    return (
      <div className="svm">
        <div className={`svm__blocked${wait ? " is-wait" : locked ? " is-lock" : ""}`} role="alert">
          <span className="svm__bic" aria-hidden="true">
            <Icon />
          </span>
          <b>{head}</b>
          <p>{text}</p>
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

  const lawyer = data.seller.role === "yurist" || (!owner && role === "lawyer") || isLawyerSeller(data.profile.sellerType);
  const sellerId = data.seller.id || data.profile.userId;
  const boost = items.find((x) => x.profileBoost)?.profileBoost ?? null;
  const verified = profileVerified(data.profile);
  const stats = [
    { k: "active", Icon: IconPlay, v: counts.active },
    { k: "paused", Icon: IconPause, v: counts.paused },
    { k: "inactive", Icon: IconPower, v: counts.inactive },
    { k: "promoted", Icon: IconMegaphone, v: counts.promoted },
  ] as const;
  const fields: FilterField[] = [
    {
      key: "status",
      label: t("form.status"),
      icon: IconClipboardCheck,
      value: filter,
      empty: "all",
      onChange: (v) => {
        if (isFilter(v)) setFilter(v);
      },
      options: FILTERS.map((f) => ({ value: f, label: `${t(`filters.${f}`)} (${counts[f]})` })),
      aiId: `${aiBase}.filters.status`,
      aiLabel: t("filters.label"),
    },
  ];

  return (
    <div className="svm">
      <section className="svm__hero" data-ai-target="services:summary" data-ai-id={`${aiBase}.summary`} data-ai-type="section" data-ai-label={t("kicker")}>
        <div className="svm__hero-t">
          <span className="kick svm__kick">
            <IconStore aria-hidden="true" />
            {t("kicker")}
          </span>
          <h2 className="svm__title">{title ?? t("title")}</h2>
          <p className="svm__lead">{owner ? t("leadOwner") : t("lead")}</p>
        </div>
        <div className="svm__hero-a">
          <button type="button" className="btn btn--grad" onClick={() => setDialog({ kind: "add" })} data-ai-target="button:add-service" data-ai-id={`${aiBase}.add`}>
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
          <FilterBar
            className="svm__filters"
            fields={fields}
            search={{ value: query, onChange: setQuery, placeholder: t("search"), maxLength: 120, aiId: `${aiBase}.search.input` }}
            count={shown.length}
            onReset={() => {
              setFilter("all");
              setQuery("");
            }}
            aiId={`${aiBase}.filters`}
            aiTarget="services:filters"
            aiLabel={t("filters.label")}
            extra={
              <button
                type="button"
                className={`svm__refresh${dim ? " is-spin" : ""}`}
                onClick={reload}
                disabled={dim}
                aria-label={t("refresh")}
                title={t("refresh")}
                data-ai-id={`${aiBase}.refresh`}
              >
                <IconRefresh aria-hidden="true" />
              </button>
            }
          />

          <div className="svm__grid" aria-busy={dim || undefined} data-ai-target="services:list" data-ai-id={`${aiBase}.list`} data-ai-type="list" data-ai-label={t("kicker")}>
            {shown.map((x, i) => (
              <ServiceCard
                key={x.id}
                aiId={x.id ? aiId(aiCard, x.id) : undefined}
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
        <div className="svm__empty" data-ai-target="services:list" data-ai-id={`${aiBase}.list`} data-ai-type="list" data-ai-label={t("kicker")}>
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
          aiId={`${aiBase}.form-modal`}
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
          onStale={reload}
          onSaved={(saved, created) => {
            mut.current = { seq: mut.current.seq + 1, skey };
            replaceItem(saved);
            toast(t(created ? "toast.added" : "toast.saved"), { tone: "ok" });
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "promote" ? (
        <PromoteModal
          aiId={`${aiBase}.promote-modal`}
          item={dialog.item}
          scope={sc}
          uid={uid}
          owner={owner}
          onClose={() => setDialog(null)}
          onStale={reload}
          onSent={(req) => {
            if (req.telegramSent) toast(t("toast.promoSent"), { tone: "ok" });
          }}
        />
      ) : null}
      {dialog?.kind === "remove" ? (
        <RemoveServiceModal
          aiId={`${aiBase}.remove-modal`}
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
