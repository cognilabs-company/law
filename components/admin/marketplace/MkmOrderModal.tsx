"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getAdminMarketplaceOrder, type MkmActivity, type MkmConfirm, type MkmOrder, type MkmPerson } from "@/lib/services/adminMarketplace";
import { ApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { humanize } from "@/lib/labels";
import Modal from "@/components/admin/Modal";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { IconAlert, IconCard, IconChat, IconCheck, IconChevronRight, IconClock, IconClose, IconExternal, IconFileText, IconPhone, IconSend, IconUsers, IconVideo } from "@/components/icons";
import { useLive } from "./useLive";
import { Avatar, LoadFailed, PayBadge, StatusBadge, payWorthShowing, useTypeLabel, useWhen, toneOf } from "./bits";

type StepState = "done" | "now" | "fail" | "todo";
type Step = { key: string; state: StepState; tone: "pending" | "active" | "done" | "cancel"; label: string; at: string };

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="mkm-sec">
      <h4>
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

function Person({ role, p, type, onOrders }: { role: string; p: MkmPerson; type?: string; onOrders?: () => void }) {
  const t = useTranslations("admin.marketplace.detail");
  return (
    <div className="mkm-person">
      <div className="mkm-person__top">
        <Avatar name={p.name} />
        <div>
          <span className="mkm-person__role">{role}</span>
          <b>{p.name || "—"}</b>
          {type || p.lexgoId ? (
            <span className="mkm-person__meta mkm-sep">
              {type ? <span>{type}</span> : null}
              {p.lexgoId ? <span>{p.lexgoId}</span> : null}
            </span>
          ) : null}
        </div>
      </div>
      {p.phone ? (
        <a href={`tel:${p.phone.replace(/[^+\d]/g, "")}`}>
          <IconPhone aria-hidden />
          {p.phone}
        </a>
      ) : null}
      {onOrders ? (
        <button type="button" className="mkm-link" onClick={onOrders}>
          {t("theirOrders")}
          <IconChevronRight aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function useJourney() {
  const t = useTranslations("admin.marketplace.detail.journey");
  return (o: MkmOrder, c: MkmConfirm | undefined): Step[] => {
    const cancelled = o.status === "cancelled";
    const completed = o.status === "completed";
    const paid = o.paymentStatus === "paid" || o.status === "paid" || completed;
    const rejected = c?.status === "rejected";
    const approved = c?.status === "approved" || paid;
    const paidAt = c?.reviewedAt || o.payment?.updatedAt || "";
    return [
      { key: "requested", state: "done", tone: "done", label: t("requested"), at: o.requestedAt || o.createdAt },
      approved
        ? { key: "confirm", state: "done", tone: "done", label: t("confirm"), at: paidAt }
        : rejected
          ? { key: "confirm", state: "fail", tone: "cancel", label: t("rejected"), at: c?.reviewedAt || "" }
          : cancelled
            ? { key: "confirm", state: "todo", tone: "pending", label: t("confirm"), at: "" }
            : { key: "confirm", state: "now", tone: "pending", label: t("confirm"), at: "" },
      completed
        ? { key: "work", state: "done", tone: "done", label: t("work"), at: paidAt }
        : paid && !cancelled
          ? { key: "work", state: "now", tone: "active", label: t("work"), at: paidAt }
          : cancelled && approved
            ? { key: "work", state: "fail", tone: "cancel", label: t("work"), at: "" }
            : { key: "work", state: "todo", tone: "active", label: t("work"), at: "" },
      completed
        ? { key: "done", state: "done", tone: "done", label: t("done"), at: o.updatedAt }
        : cancelled
          ? { key: "done", state: "fail", tone: "cancel", label: t("cancelled"), at: o.updatedAt }
          : { key: "done", state: "todo", tone: "done", label: t("finish"), at: "" },
    ];
  };
}

function Journey({ steps }: { steps: Step[] }) {
  const t = useTranslations("admin.marketplace.detail.journey");
  const when = useWhen();
  return (
    <ol className="mkm-journey" aria-label={t("aria")}>
      {steps.map((s) => (
        <li key={s.key} className={`is-${s.state} mkm-jt--${s.tone}`} aria-current={s.state === "now" ? "step" : undefined}>
          <span className="mkm-journey__c" aria-hidden>
            {s.state === "done" ? <IconCheck /> : s.state === "fail" ? <IconClose /> : s.state === "now" ? <IconClock /> : null}
          </span>
          <b>{s.label}</b>
          <span className="mkm-sr">{t(`state.${s.state}`)}</span>
          <small>{s.at ? when(s.at) : s.state === "now" ? t("waiting") : ""}</small>
        </li>
      ))}
    </ol>
  );
}

function ConfirmCard({ c }: { c: MkmConfirm }) {
  const t = useTranslations("admin.marketplace.detail");
  const when = useWhen();
  const ok = c.deliveries.filter((d) => d.ok).length;
  const tone = toneOf(c.status);
  return (
    <div className={`mkm-tg mkm-tg--${tone}`}>
      <div className="mkm-tg__h">
        <span className="mkm-tg__ic" aria-hidden>
          <IconSend />
        </span>
        <span className={`mkm-st mkm-st--${tone}`}>{t.has(`confirmStatus.${c.status}`) ? t(`confirmStatus.${c.status}`) : humanize(c.status) || "—"}</span>
        {c.reviewedAt ? <em>{when(c.reviewedAt)}</em> : null}
      </div>
      <dl className="mkm-dl">
        <div>
          <dt>{t("reviewedBy")}</dt>
          <dd>{c.reviewedByChatId ? <code className="mkm-code">{c.reviewedByChatId}</code> : "—"}</dd>
        </div>
        <div>
          <dt>{t("sentAt")}</dt>
          <dd>{when(c.createdAt) || "—"}</dd>
        </div>
        {c.categoryTitle ? (
          <div className="is-wide">
            <dt>{t("category")}</dt>
            <dd>{c.categoryTitle}</dd>
          </div>
        ) : null}
      </dl>
      {c.deliveries.length ? (
        <div className="mkm-deliv">
          <span>{t("delivered", { ok, n: c.deliveries.length })}</span>
          <ul>
            {c.deliveries.map((d) => (
              <li
                key={d.chatId}
                className={`${d.ok ? "ok" : "bad"}${d.chatId === c.reviewedByChatId ? " is-rev" : ""}`}
                title={d.ok ? t("deliveryOk") : d.error || t("deliveryFail")}
              >
                {d.ok ? <IconCheck aria-hidden /> : <IconClose aria-hidden />}
                <code>{d.chatId}</code>
                {d.chatId === c.reviewedByChatId ? <em>{t("reviewer")}</em> : null}
                <span className="mkm-sr">{d.ok ? t("deliveryOk") : t("deliveryFail")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Timeline({ rows }: { rows: MkmActivity[] }) {
  const t = useTranslations("admin.marketplace.detail");
  const when = useWhen();
  const title = (a: MkmActivity) => (t.has(`actions.${a.action}`) ? t(`actions.${a.action}`) : a.title || humanize(a.action) || "—");
  const outcome = (o: string) => (o === "success" ? "ok" : o ? "bad" : "na");
  return (
    <ol className="mkm-tl">
      {rows.map((a) => (
        <li key={a.id || `${a.action}-${a.createdAt}`} className={`is-${outcome(a.outcome)}`}>
          <span className="mkm-tl__dot" aria-hidden />
          <div>
            <b>{title(a)}</b>
            {a.detail ? <span>{a.detail}</span> : null}
            <em>{[when(a.createdAt), a.ip ? `IP ${a.ip}` : "", a.outcome && a.outcome !== "success" ? (t.has(`outcome.${a.outcome}`) ? t(`outcome.${a.outcome}`) : humanize(a.outcome)) : ""].filter(Boolean).join(" · ")}</em>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function MkmOrderModal({
  order,
  onClose,
  onSeller,
  onClient,
}: {
  order: MkmOrder | null;
  onClose: () => void;
  onSeller: (p: MkmPerson) => void;
  onClient: (p: MkmPerson) => void;
}) {
  const t = useTranslations("admin.marketplace.detail");
  const tc = useTranslations("marketplace.purchase.channels");
  const te = useTranslations("enums");
  const when = useWhen();
  const typeLabel = useTypeLabel();
  const journey = useJourney();
  const id = order?.id ?? "";
  const live = useLive(() => getAdminMarketplaceOrder(id), id, !!id);
  const detail = live.data && !live.stale ? live.data : null;
  const o = detail?.order.id ? detail.order : order;
  const confirm = detail?.confirms[0];
  const channel = o?.preferredChannel ? (tc.has(o.preferredChannel) ? tc(o.preferredChannel) : humanize(o.preferredChannel)) : "";
  const provider = (p: string) => (t.has(`providers.${p}`) ? t(`providers.${p}`) : humanize(p));
  const currency = (c: string) => (!c || c.toUpperCase() === "UZS" ? te("currency") : c);
  const chatHref = o?.roomId ? `/portal/chat/${o.roomId}?${new URLSearchParams({ ...(o.workId ? { wid: o.workId } : {}), ...(o.serviceTitle ? { svc: o.serviceTitle } : {}) }).toString()}` : "";
  const missing = live.failed && live.stale && live.error instanceof ApiError && live.error.status === 404;

  return (
    <Modal open={!!order} onClose={onClose} title={o ? t("title", { id: o.workId || "—" }) : ""} wide>
      {o ? (
        <div className="mkm-det">
          <div className="mkm-ticket">
            <div className="mkm-ticket__badges">
              <StatusBadge status={o.status} />
              {payWorthShowing(o) ? <PayBadge status={o.paymentStatus} /> : null}
            </div>
            <div className="mkm-ticket__main">
              <h3>{o.serviceTitle || "—"}</h3>
              <p>{[typeLabel(o.sellerType), channel].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="mkm-ticket__sum">
              <b>{fmtUzs(o.price)}</b>
              <small>{currency(o.currency)}</small>
            </div>
            <dl className="mkm-ids">
              {o.workId ? (
                <div>
                  <dt>{t("ids.work")}</dt>
                  <dd>{o.workId}</dd>
                </div>
              ) : null}
              {o.orderWorkId ? (
                <div>
                  <dt>{t("ids.order")}</dt>
                  <dd>{o.orderWorkId}</dd>
                </div>
              ) : null}
              {o.payment?.workId ? (
                <div>
                  <dt>{t("ids.payment")}</dt>
                  <dd>{o.payment.workId}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          {missing ? <p className="mkm-warn" role="status"><IconAlert aria-hidden />{t("notFound")}</p> : null}

          <Journey steps={journey(o, confirm)} />

          <div className="mkm-det__cols">
            <div className="mkm-det__col">
              <Section icon={<IconUsers aria-hidden />} title={t("parties")}>
                <div className="mkm-people">
                  <Person role={t("client")} p={o.client} onOrders={o.client.id ? () => onClient(o.client) : undefined} />
                  <Person role={t("seller")} p={o.seller} type={typeLabel(o.sellerType)} onOrders={o.seller.id ? () => onSeller(o.seller) : undefined} />
                </div>
              </Section>

              <Section icon={<IconFileText aria-hidden />} title={t("order")}>
                <dl className="mkm-dl">
                  <div className="is-wide">
                    <dt>{t("service")}</dt>
                    <dd>{o.serviceTitle || "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("channel")}</dt>
                    <dd>{channel || "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("time")}</dt>
                    <dd>{o.preferredTime || "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("created")}</dt>
                    <dd>{when(o.createdAt) || "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("updated")}</dt>
                    <dd>{when(o.updatedAt) || "—"}</dd>
                  </div>
                </dl>
                {o.note ? (
                  <p className="mkm-note">
                    <small>{t("note")}</small>
                    {o.note}
                  </p>
                ) : null}
              </Section>

              <Section icon={<IconCard aria-hidden />} title={t("payment")}>
                {o.payment ? (
                  <dl className="mkm-dl">
                    <div>
                      <dt>{t("provider")}</dt>
                      <dd>{provider(o.payment.provider) || "—"}</dd>
                    </div>
                    <div>
                      <dt>{t("payStatus")}</dt>
                      <dd>
                        <PayBadge status={o.payment.status} />
                      </dd>
                    </div>
                    <div>
                      <dt>{t("amount")}</dt>
                      <dd>
                        {fmtUzs(o.payment.amount)} {currency(o.payment.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("paid")}</dt>
                      <dd>
                        {fmtUzs(o.payment.paidAmount)} {currency(o.payment.currency)}
                      </dd>
                    </div>
                    <div className="is-wide">
                      <dt>{t("updated")}</dt>
                      <dd>{when(o.payment.updatedAt) || "—"}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mkm-muted">{t("noPayment")}</p>
                )}
              </Section>

              <Section icon={<IconChat aria-hidden />} title={t("contact")}>
                <div className="mkm-contact">
                  {chatHref ? (
                    <Link href={chatHref} target="_blank" rel="noopener noreferrer" className="btn btn--line btn--sm">
                      <IconChat aria-hidden />
                      {t("openChat")}
                      <IconExternal aria-hidden />
                    </Link>
                  ) : (
                    <span className="mkm-chip">{t("noChat")}</span>
                  )}
                  <span className={`mkm-chip${o.canCreateCall ? " mkm-chip--on" : ""}`}>
                    <IconVideo aria-hidden />
                    {o.canCreateCall ? t("callOn") : t("callOff")}
                  </span>
                </div>
              </Section>
            </div>

            <div className="mkm-det__col">
              <Section icon={<IconSend aria-hidden />} title={t("confirm")}>
                {live.loading || (live.changing && !detail) ? (
                  <Skeleton rows={2} />
                ) : live.failed && live.stale ? (
                  missing ? <p className="mkm-muted">{t("noConfirm")}</p> : <LoadFailed error={live.error} onRetry={live.reload} />
                ) : detail && detail.confirms.length ? (
                  detail.confirms.map((c) => <ConfirmCard key={c.id || c.createdAt} c={c} />)
                ) : (
                  <p className="mkm-muted">{t("noConfirm")}</p>
                )}
              </Section>

              <Section icon={<IconClock aria-hidden />} title={t("activity")}>
                {live.loading || (live.changing && !detail) ? (
                  <Skeleton rows={3} />
                ) : live.failed && live.stale ? (
                  missing ? <p className="mkm-muted">{t("noActivity")}</p> : null
                ) : detail && detail.activity.length ? (
                  <Timeline rows={detail.activity} />
                ) : (
                  <EmptyState icon={<IconClock />} title={t("noActivity")} />
                )}
              </Section>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
