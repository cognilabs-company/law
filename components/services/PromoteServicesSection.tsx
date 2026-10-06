"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { isAborted } from "@/lib/http";
import { toast } from "@/lib/toast";
import { subscribeUserEvents } from "@/lib/userSocket";
import {
  dropPendingPromos,
  listManagedServices,
  parsePendingPromos,
  pendingPromoKey,
  pendingPromosRaw,
  promoSignalOf,
  subscribePendingPromos,
  type ManagedService,
  type ManagedServices,
  type ServiceScope,
} from "@/lib/services/sellerServices";
import { IconArrowRight, IconBriefcase, IconClock, IconMegaphone } from "@/components/icons";
import PromoteModal from "./PromoteModal";
import { som } from "./bits";

const ME: ServiceScope = { kind: "me" };
type Load = { key: string; data: ManagedServices | null };

export default function PromoteServicesSection({ role, onData }: { role: "lawyer" | "advocate"; onData?: (d: ManagedServices) => void }) {
  const t = useTranslations("sellerServices");
  const tp = useTranslations("promotion");
  const locale = useLocale();
  const { session } = useAuth();
  const uid = session?.id ?? "";
  const [tick, setTick] = useState(0);
  const [load, setLoad] = useState<Load | null>(null);
  const [promote, setPromote] = useState<ManagedService | null>(null);
  const key = `${locale}|${tick}`;
  const onDataRef = useRef(onData);

  useEffect(() => {
    onDataRef.current = onData;
  });

  useEffect(() => {
    const c = new AbortController();
    listManagedServices(ME, locale, c.signal)
      .then((data) => {
        if (c.signal.aborted) return;
        setLoad({ key, data });
        onDataRef.current?.(data);
      })
      .catch((e: unknown) => {
        if (isAborted(e) || c.signal.aborted) return;
        setLoad({ key, data: null });
      });
    return () => c.abort();
  }, [key, locale]);

  const raw = useSyncExternalStore(subscribePendingPromos, () => pendingPromosRaw(uid), () => "");
  const pending = useMemo(() => parsePendingPromos(raw), [raw]);
  const data = load?.data ?? null;

  useEffect(() => {
    if (!uid || !data) return;
    const live = new Set(data.items.filter((x) => x.ownPromotion).map((x) => pendingPromoKey(ME, x.id)));
    if (live.size) dropPendingPromos(uid, (k) => live.has(k));
  }, [uid, data]);

  useEffect(() => {
    if (!uid) return;
    return subscribeUserEvents((ev) => {
      const s = promoSignalOf(ev);
      if (!s || s.kind === "pending" || !s.serviceId) return;
      dropPendingPromos(uid, (k, p) => (s.requestId !== "" && p.requestId === s.requestId) || k === pendingPromoKey(ME, s.serviceId));
      setTick((n) => n + 1);
    });
  }, [uid]);

  if (!load) {
    return (
      <div className="ppanel svps" aria-busy="true">
        <div className="svps__skel" />
      </div>
    );
  }
  if (!data) return null;

  const rows = data.items.filter((x) => x.status === "active" && x.service.isActive);

  return (
    <div className="ppanel svps" style={{ marginTop: 18 }} data-ai-target="promotion:services">
      <div className="ppanel__h">
        <b>{tp("servicesTitle")}</b>
        <Link href={`/portal/${role}/services`} className="svps__all">
          {tp("servicesManage")}
          <IconArrowRight aria-hidden="true" />
        </Link>
      </div>
      <p className="ppanel__note">{tp("servicesLead")}</p>
      {rows.length ? (
        <ul className="svps__list">
          {rows.map((x) => {
            const own = x.ownPromotion;
            const wait = own ? null : (pending[pendingPromoKey(ME, x.id)] ?? null);
            return (
              <li key={x.id} className={`svps__row${own ? " is-live" : ""}`}>
                <span className="svps__ic" aria-hidden="true">
                  <IconBriefcase />
                </span>
                <span className="svps__m">
                  <b>{x.service.name}</b>
                  <small>
                    {som(x.effectivePrice)} {t("card.som")}
                    {x.service.categoryTitle ? ` · ${x.service.categoryTitle}` : ""}
                  </small>
                </span>
                {own ? (
                  <span className="svps__chip svps__chip--live">
                    <IconMegaphone aria-hidden="true" />
                    {t("card.promoted", { days: own.daysLeft })}
                  </span>
                ) : wait ? (
                  <span className="svps__chip svps__chip--wait" title={t("card.pendingHint")}>
                    <IconClock aria-hidden="true" />
                    {t("card.pending")}
                  </span>
                ) : (
                  <button type="button" className="btn btn--grad btn--sm" onClick={() => setPromote(x)}>
                    <IconMegaphone aria-hidden="true" />
                    {t("card.promote")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="svps__empty">
          <p>{tp("servicesEmpty")}</p>
          <Link href={`/portal/${role}/services`} className="btn btn--line btn--sm">
            {t("add")}
          </Link>
        </div>
      )}
      {promote ? (
        <PromoteModal
          item={promote}
          scope={ME}
          uid={uid}
          owner={false}
          onClose={() => setPromote(null)}
          onSent={() => toast(t("toast.promoSent"), { tone: "ok" })}
        />
      ) : null}
    </div>
  );
}
