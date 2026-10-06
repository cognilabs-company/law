"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import {
  listAdPackages,
  pendingPromoKey,
  promoteManagedService,
  savePendingPromo,
  serviceErrorOf,
  type AdPackage,
  type ManagedService,
  type PromotionRequest,
  type ServiceScope,
} from "@/lib/services/sellerServices";
import { IconAlert, IconCheck, IconClock, IconCrown, IconGem, IconInfo, IconMegaphone, IconRocket, IconTrendingUp } from "@/components/icons";
import { InBody, som, usePackageName } from "./bits";

type Packs = { status: "loading" | "ready" | "error"; items: AdPackage[] };
const TIER_ICON = [IconRocket, IconGem, IconCrown];

export default function PromoteModal({
  item,
  scope,
  uid,
  owner,
  onClose,
  onSent,
}: {
  item: ManagedService;
  scope: ServiceScope;
  uid: string;
  owner: boolean;
  onClose: () => void;
  onSent: (req: PromotionRequest) => void;
}) {
  const t = useTranslations("sellerServices.promote");
  const tc = useTranslations("sellerServices");
  const packName = usePackageName();
  const [packs, setPacks] = useState<Packs>({ status: "loading", items: [] });
  const [tick, setTick] = useState(0);
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<PromotionRequest | null>(null);

  useEffect(() => {
    const c = new AbortController();
    listAdPackages(c.signal)
      .then((items) => {
        if (!c.signal.aborted) setPacks({ status: "ready", items });
      })
      .catch(() => {
        if (!c.signal.aborted) setPacks({ status: "error", items: [] });
      });
    return () => c.abort();
  }, [tick]);

  const items = packs.items;
  const feat = items.length >= 3 ? items[1].id : items.length ? items[items.length - 1].id : "";
  const chosen = items.find((p) => p.id === picked) ?? items.find((p) => p.id === feat) ?? null;

  const send = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    setErr("");
    try {
      const req = await promoteManagedService(scope, item.id, chosen);
      savePendingPromo(uid, pendingPromoKey(scope, item.id), {
        requestId: req.requestId,
        packageTitle: packName(chosen.title),
        amount: req.amount,
        currency: req.currency,
        telegramSent: req.telegramSent,
      });
      setDone(req);
      onSent(req);
    } catch (e) {
      const k = serviceErrorOf(e).kind;
      setErr(k === "inactivePromo" ? tc("errors.inactivePromo") : k === "notFound" ? t("notFound") : k === "forbidden" ? tc("errors.forbidden") : tc(`errors.${k === "offline" ? "offline" : "unknown"}`));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <InBody>
      <Modal open onClose={close} title={t("title")}>
        {done ? (
          <div className="svpdone" role="status">
            <span className="svpdone__ic" aria-hidden="true">
              <IconClock />
            </span>
            <b className="svpdone__t">{t("doneTitle")}</b>
            <p className="svpdone__p">{t("doneText")}</p>
            <div className="svpdone__rows">
              <span>{t("service")}</span>
              <b>{item.service.name}</b>
              {chosen ? (
                <>
                  <span>{t("package")}</span>
                  <b>{packName(chosen.title)}</b>
                </>
              ) : null}
              <span>{t("amount")}</span>
              <b>
                {som(done.amount)} {done.currency === "UZS" ? tc("card.som") : done.currency}
              </b>
              {done.requestId ? (
                <>
                  <span>{t("request")}</span>
                  <b className="svpdone__id">{done.requestId.slice(0, 8).toUpperCase()}</b>
                </>
              ) : null}
            </div>
            <p className={`svpdone__tg${done.telegramSent ? " is-ok" : " is-bad"}`}>
              {done.telegramSent ? <IconCheck aria-hidden="true" /> : <IconAlert aria-hidden="true" />}
              {done.telegramSent ? t("telegramOk") : t("telegramFail")}
            </p>
            <button type="button" className="btn btn--pri btn--full" onClick={onClose}>
              {t("close")}
            </button>
          </div>
        ) : (
          <div className="svprom">
            <div className="svprom__svc">
              <span className="svprom__svcic" aria-hidden="true">
                <IconMegaphone />
              </span>
              <span>
                <small>{t("service")}</small>
                <b>{item.service.name}</b>
              </span>
            </div>
            <p className="svprom__lead">{t("lead")}</p>

            {packs.status === "loading" ? (
              <div className="svprom__grid" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="svpk is-skel" />
                ))}
              </div>
            ) : packs.status === "error" ? (
              <div className="svprom__empty">
                <IconAlert aria-hidden="true" />
                <b>{t("loadError")}</b>
                <button type="button" className="btn btn--line btn--sm" onClick={() => setTick((n) => n + 1)}>
                  {tc("retry")}
                </button>
              </div>
            ) : !items.length ? (
              <div className="svprom__empty">
                <IconRocket aria-hidden="true" />
                <b>{t("empty")}</b>
                <p>{t("emptyText")}</p>
              </div>
            ) : (
              <div className="svprom__grid" role="radiogroup" aria-label={t("packages")}>
                {items.map((p, i) => {
                  const Icon = TIER_ICON[Math.min(i, TIER_ICON.length - 1)];
                  const on = chosen?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`svpk${on ? " is-on" : ""}${p.id === feat ? " svpk--feat" : ""}`}
                      onClick={() => setPicked(p.id)}
                    >
                      {p.id === feat ? <span className="svpk__rib">{t("popular")}</span> : null}
                      <span className="svpk__ic" aria-hidden="true">
                        <Icon />
                      </span>
                      <b className="svpk__name">{packName(p.title)}</b>
                      <span className="svpk__days">{t("days", { d: p.days })}</span>
                      {p.reach ? (
                        <span className="svpk__reach">
                          <IconTrendingUp aria-hidden="true" />
                          {t("reach", { x: p.reach })}
                        </span>
                      ) : null}
                      <span className="svpk__price">
                        {som(p.price)} <small>{p.currency === "UZS" ? tc("card.som") : p.currency}</small>
                      </span>
                      <span className="svpk__check" aria-hidden="true">
                        <IconCheck />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {chosen ? (
              <div className="svprom__sum">
                <span>{t("package")}</span>
                <b>{packName(chosen.title)}</b>
                <span>{t("duration")}</span>
                <b>{t("days", { d: chosen.days })}</b>
                <span>{t("amount")}</span>
                <b className="svprom__total">
                  {som(chosen.price)} {chosen.currency === "UZS" ? tc("card.som") : chosen.currency}
                </b>
              </div>
            ) : null}

            <p className="svprom__note">
              <IconInfo aria-hidden="true" />
              <span>
                {t("note")}
                {owner ? ` ${t("noteOwner")}` : ""}
              </span>
            </p>
            {err ? (
              <p className="svm__err" role="alert">
                {err}
              </p>
            ) : null}
            <div className="svform__acts">
              <button type="button" className="btn btn--line" onClick={close} disabled={busy}>
                {tc("form.cancel")}
              </button>
              <button type="button" className="btn btn--grad" onClick={() => void send()} disabled={busy || !chosen}>
                <IconMegaphone aria-hidden="true" />
                {busy ? t("sending") : t("submit")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </InBody>
  );
}
