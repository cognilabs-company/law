"use client";

import { useSyncExternalStore, type ComponentType, type SVGProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { hasAdminAccess, useAuth } from "@/lib/auth";
import { errorText } from "@/lib/errorText";
import { answerFill, cancelPrompt, confirmPrompt, promptServerSnapshot, promptSnapshot, subscribePrompts, type ActionView } from "@/lib/ai/prompts";
import { IconAlert, IconBolt, IconCheck, IconCircleCheck, IconExternal, IconFileText, IconGem, IconHeadset, IconShieldCheck, IconSparkle, IconStore } from "@/components/icons";

type Glyph = ComponentType<SVGProps<SVGSVGElement>>;

const ACTION_ICONS: Record<string, Glyph> = {
  start_support_ticket: IconHeadset,
  prepare_subscription_purchase: IconGem,
  start_document_request: IconFileText,
  prepare_marketplace_purchase: IconStore,
  prepare_urgent_advokat_request: IconBolt,
};

type Period = "month" | "year" | "week";

const PERIODS: [RegExp, Period][] = [
  [/^(month|monthly|1m|30d|oy|oylik)$/i, "month"],
  [/^(year|yearly|annual|annually|12m|365d|yil|yillik)$/i, "year"],
  [/^(week|weekly|7d|hafta|haftalik)$/i, "week"],
];

function periodOf(v: string): Period | "" {
  const s = v.trim();
  for (const [re, p] of PERIODS) if (re.test(s)) return p;
  return "";
}

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length >= 4 ? `*** ** ${d.slice(-2)}` : "";
}

function usePrompts() {
  return useSyncExternalStore(subscribePrompts, promptSnapshot, promptServerSnapshot);
}

function ActionBody({ view }: { view: ActionView }) {
  const t = useTranslations("portal.aiAssistant.v21");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { session } = useAuth();
  const p = view.preview;
  const actionTitle = view.action && t.has(`action.${view.action}`) ? t(`action.${view.action}`) : p?.title || t("action.generic");
  const what = p?.summary || p?.title || actionTitle;
  const amount = p && p.amount !== null && !view.free ? `${new Intl.NumberFormat(locale).format(p.amount)} ${p.currency.toUpperCase() === "UZS" ? t("confirm.currency") : p.currency}` : "";
  const quoted = p?.amountText || amount;
  const price = view.free ? t("confirm.free") : quoted || t("confirm.priceLater");
  const period = p && !view.free && quoted ? periodOf(p.billingPeriod || "") : "";
  const actor = p?.onBehalfOf ?? null;
  const other = Boolean(actor && session && (actor.userId ? actor.userId !== session.id : Boolean(actor.name) && actor.name !== session.name));
  const myRole = session ? (hasAdminAccess(session) ? "staff" : session.role) : "client";
  const me = `${session?.name || maskPhone(session?.phone || "")}${session ? ` · ${t(`roles.${myRole}`)}` : ""}`;
  const who = other && actor ? `${actor.name || actor.userId}${actor.role ? ` · ${actor.role}` : ""}` : me;
  const blocked = Boolean(p && !p.canExecute);
  const error = view.error ? errorText(view.error, tc) : "";
  const detailRows = p && Array.isArray(p.detailRows) ? p.detailRows : [];
  const rows = detailRows.filter((r) => r.label);
  const notes = detailRows.filter((r) => !r.label).map((r) => r.value);
  const warnings = p && Array.isArray(p.warnings) ? p.warnings : [];
  const Icon = ACTION_ICONS[view.action] ?? IconShieldCheck;
  const safe = !view.generic || Boolean(view.text);

  if (view.pay) {
    return (
      <div className="aiconfirm aiconfirm--done" data-ai-ignore="" role="status">
        <span className="aiconfirm__ic aiconfirm__ic--ok" aria-hidden="true">
          <IconCircleCheck />
        </span>
        <p className="aiconfirm__what">{t("confirm.payReady")}</p>
        <div className="aiconfirm__acts">
          <button type="button" className="btn btn--line" onClick={cancelPrompt}>
            {t("confirm.close")}
          </button>
          <a className="btn btn--pri aiact__pay" href={view.pay} rel="noopener noreferrer">
            <IconExternal aria-hidden="true" />
            {t("confirm.pay")}
          </a>
        </div>
      </div>
    );
  }

  if (view.done) {
    return (
      <div className="aiconfirm aiconfirm--done" data-ai-ignore="" role="status">
        <span className="aiconfirm__ic aiconfirm__ic--ok" aria-hidden="true">
          <IconCircleCheck />
        </span>
        <p className="aiconfirm__what">{t.has(`done.${view.action}`) ? t(`done.${view.action}`) : t("done.generic")}</p>
        <div className="aiconfirm__acts">
          <button type="button" className="btn btn--pri" onClick={cancelPrompt}>
            {t("confirm.close")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="aiconfirm" data-ai-ignore="" aria-busy={view.busy || undefined}>
      <div className="aiconfirm__top">
        <span className="aiconfirm__ic" aria-hidden="true">
          <Icon />
        </span>
        <div className="aiconfirm__head">
          {view.generic ? null : <span className="aiconfirm__eyebrow">{t("confirm.what")}</span>}
          <p className="aiconfirm__what">{view.generic ? view.text || t("confirm.lead") : what}</p>
        </div>
      </div>
      {view.generic ? null : (
        <dl className="aiact__rows">
          <div className="aiact__row aiact__row--amount">
            <dt>{t("confirm.price")}</dt>
            <dd>
              {price}
              {period ? <small>{t(`confirm.period.${period}`)}</small> : null}
            </dd>
          </div>
          {rows.map((r, i) => (
            <div className="aiact__row" key={`${i}-${r.label}`}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
          <div className={`aiact__row${other ? " aiact__row--warn" : ""}`}>
            <dt>{t("confirm.onBehalf")}</dt>
            <dd>{who}</dd>
          </div>
        </dl>
      )}
      {notes.length ? (
        <ul className="aiact__list">
          {notes.map((d, i) => (
            <li key={`${i}-${d}`}>{d}</li>
          ))}
        </ul>
      ) : null}
      {other ? (
        <p className="aiact__warn">
          <IconAlert aria-hidden="true" />
          <span>{t("confirm.onBehalfOther")}</span>
        </p>
      ) : null}
      {warnings.map((w, i) => (
        <p className="aiact__warn" key={`${i}-${w}`}>
          <IconAlert aria-hidden="true" />
          <span>{w}</span>
        </p>
      ))}
      {view.note === "expired" ? <p className="aiconfirm__note">{t("confirm.expired")}</p> : null}
      {blocked ? <p className="aiconfirm__note">{p?.message || t("confirm.blocked")}</p> : null}
      {error ? (
        <p className="aiconfirm__err" role="alert">
          <IconAlert aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
      {safe ? (
        <p className="aiconfirm__safe">
          <IconShieldCheck aria-hidden="true" />
          <span>{t("confirm.lead")}</span>
        </p>
      ) : null}
      <div className="aiconfirm__acts">
        <button type="button" className="btn btn--line" onClick={cancelPrompt} disabled={view.busy}>
          {t("confirm.no")}
        </button>
        <button type="button" className="btn btn--pri" onClick={(e) => void confirmPrompt(e.nativeEvent.isTrusted)} disabled={view.busy || blocked} aria-busy={view.busy || undefined}>
          {view.busy ? <span className="aiconfirm__spin" aria-hidden="true" /> : <IconCheck aria-hidden="true" />}
          {view.busy ? t("confirm.busy") : error ? t("confirm.retry") : t("confirm.yes")}
        </button>
      </div>
    </div>
  );
}

export default function AiActionConfirm() {
  const t = useTranslations("portal.aiAssistant.v21");
  const { action } = usePrompts();
  const title = action ? (action.generic ? t("confirm.genericTitle") : action.action && t.has(`action.${action.action}`) ? t(`action.${action.action}`) : t("confirm.title")) : "";
  return (
    <Modal open={!!action} onClose={cancelPrompt} title={title} aiId={action?.action === "prepare_subscription_purchase" ? "pricing.purchase-confirm-modal" : undefined}>
      {action ? <ActionBody key={action.key} view={action} /> : null}
    </Modal>
  );
}

export function AiFillPreview() {
  const t = useTranslations("portal.aiAssistant.v21");
  const { fill } = usePrompts();
  return (
    <Modal open={!!fill} onClose={() => answerFill(false)} title={t("fill.title")}>
      {fill ? (
        <div className="aiconfirm" data-ai-ignore="">
          <div className="aiconfirm__top">
            <span className="aiconfirm__ic" aria-hidden="true">
              <IconSparkle />
            </span>
            <p className="aiconfirm__lead">{t("fill.lead")}</p>
          </div>
          <ul className="aifill__rows">
            {fill.rows.map((r) => (
              <li key={r.aiId} className="aifill__row">
                <span>{r.label}</span>
                <b>{r.value}</b>
              </li>
            ))}
          </ul>
          <div className="aiconfirm__acts">
            <button type="button" className="btn btn--line" onClick={() => answerFill(false)}>
              {t("fill.cancel")}
            </button>
            <button type="button" className="btn btn--pri" onClick={(e) => e.nativeEvent.isTrusted && answerFill(true)}>
              <IconCheck aria-hidden="true" />
              {t("fill.apply")}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
