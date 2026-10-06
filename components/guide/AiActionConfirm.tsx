"use client";

import { useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { hasAdminAccess, useAuth } from "@/lib/auth";
import { errorText } from "@/lib/errorText";
import { answerFill, cancelPrompt, confirmPrompt, promptServerSnapshot, promptSnapshot, subscribePrompts, type ActionView } from "@/lib/ai/prompts";
import { IconAlert, IconExternal, IconShieldCheck, IconSparkle } from "@/components/icons";

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
  const price = view.free ? t("confirm.free") : p?.amountText || amount || t("confirm.priceLater");
  const actor = p?.onBehalfOf ?? null;
  const other = Boolean(actor && session && (actor.userId ? actor.userId !== session.id : Boolean(actor.name) && actor.name !== session.name));
  const myRole = session ? (hasAdminAccess(session) ? "staff" : session.role) : "client";
  const me = `${session?.name || maskPhone(session?.phone || "")}${session ? ` · ${t(`roles.${myRole}`)}` : ""}`;
  const who = other && actor ? `${actor.name || actor.userId}${actor.role ? ` · ${actor.role}` : ""}` : me;
  const blocked = Boolean(p && !p.canExecute);
  const error = view.error ? errorText(view.error, tc) : "";

  if (view.pay) {
    return (
      <div className="aiconfirm" data-ai-ignore="">
        <span className="aiconfirm__ic" aria-hidden="true">
          <IconShieldCheck />
        </span>
        <p>{t("confirm.payReady")}</p>
        <div className="aiconfirm__acts">
          <button type="button" className="btn btn--line" onClick={cancelPrompt}>
            {t("confirm.close")}
          </button>
          <a className="btn btn--pri aiact__pay" href={view.pay} rel="noopener noreferrer">
            <IconExternal />
            {t("confirm.pay")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="aiconfirm" data-ai-ignore="">
      <span className="aiconfirm__ic" aria-hidden="true">
        <IconShieldCheck />
      </span>
      <p>{view.generic ? view.text || t("confirm.lead") : t("confirm.lead")}</p>
      {view.generic ? null : (
        <dl className="aiact__rows">
          <div className="aiact__row">
            <dt>{t("confirm.what")}</dt>
            <dd>{what}</dd>
          </div>
          <div className="aiact__row">
            <dt>{t("confirm.price")}</dt>
            <dd>{price}</dd>
          </div>
          <div className={`aiact__row${other ? " aiact__row--warn" : ""}`}>
            <dt>{t("confirm.onBehalf")}</dt>
            <dd>{who}</dd>
          </div>
        </dl>
      )}
      {p?.details.length ? (
        <ul className="aiact__list">
          {p.details.map((d, i) => (
            <li key={`${i}-${d}`}>{d}</li>
          ))}
        </ul>
      ) : null}
      {other ? <p className="aiact__warn">{t("confirm.onBehalfOther")}</p> : null}
      {p?.warnings.map((w, i) => (
        <p className="aiact__warn" key={`${i}-${w}`}>
          {w}
        </p>
      ))}
      {view.note === "expired" ? <p className="aiconfirm__note">{t("confirm.expired")}</p> : null}
      {blocked ? <p className="aiconfirm__note">{p?.message || t("confirm.blocked")}</p> : null}
      {error ? (
        <p className="aiconfirm__err" role="alert">
          <IconAlert width={14} height={14} /> {error}
        </p>
      ) : null}
      <div className="aiconfirm__acts">
        <button type="button" className="btn btn--line" onClick={cancelPrompt} disabled={view.busy}>
          {t("confirm.no")}
        </button>
        <button type="button" className="btn btn--pri" onClick={(e) => void confirmPrompt(e.nativeEvent.isTrusted)} disabled={view.busy || blocked} aria-busy={view.busy || undefined}>
          {view.busy ? t("confirm.busy") : t("confirm.yes")}
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
          <span className="aiconfirm__ic" aria-hidden="true">
            <IconSparkle />
          </span>
          <p>{t("fill.lead")}</p>
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
              {t("fill.apply")}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
