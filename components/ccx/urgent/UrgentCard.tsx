"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { UrgentRequest } from "@/lib/services/backend";
import { dateTimeFull, shortDateTime } from "@/lib/date";
import { aiId } from "@/lib/ai/ids";
import { directionLabel, useUrgentStatuses } from "@/components/admin/UrgentAdvocateQueue";
import { IconChat, IconExternal, IconUsers } from "@/components/icons";
import { IcArrowRight, IcClock, IcClose, IcDoc, IcMeeting, IcUser } from "../icons";
import { AI_ITEM, chatHref, kindName, rowAction, statusChoicesOf, statusOf, type Step } from "./model";
import { KindIcon, MoreMenu, SlaBar, UrgBadge, px, type MenuItem } from "./parts";

type Props = {
  r: UrgentRequest;
  me: string;
  on: boolean;
  busy: boolean;
  index: number;
  onSelect: () => void;
  onClaim: () => void;
  onJoin: () => void;
  onMeet: () => void;
  onStep: (act: Step) => void;
};

export default function UrgentCard({ r, me, on, busy, index, onSelect, onClaim, onJoin, onMeet, onStep }: Props) {
  const t = useTranslations("admin.urgent");
  const x = useTranslations("admin.ccx.urgent");
  const tk = useTranslations("portal.client.urgent");
  const te = useTranslations("enums");
  const locale = useLocale();
  const urg = useUrgentStatuses();
  const st = statusOf(r);
  const open = st === "open_pool";
  const finished = !r.nextStatuses.length && !open;
  const working = !finished && !open;
  const act = rowAction(r);
  const name = kindName(tk, r);
  const dirs = r.directions
    .map((d) => directionLabel(te, d, t))
    .filter((d, i, all) => d && all.indexOf(d) === i)
    .join(", ");
  const needText = r.need || dirs;
  const timed = !!r.scheduledAt && !finished;
  const whenAt = timed ? r.scheduledAt : r.createdAt;
  const whenText = whenAt ? (timed ? t("scheduledFor", { when: shortDateTime(whenAt, locale) }) : shortDateTime(whenAt, locale)) : "";
  const choices = statusChoicesOf(r, me);
  const label = [name, r.workId].filter(Boolean).join(" · ");

  const items: MenuItem[] = [];
  if (act !== "detail") items.push({ key: "detail", group: 0, label: t("openDetail"), icon: <IcDoc size={16} />, onSelect, aiId: aiId(AI_ITEM, r.id, "detail") });
  if (r.secureChatRoomId && act !== "chat") items.push({ key: "chat", group: 0, label: t("openChat"), hint: t("newTab"), icon: <IconChat {...px(16)} aria-hidden="true" />, href: chatHref(r, name), title: t("openChatTitle"), aiId: aiId(AI_ITEM, r.id, "chat") });
  if (working && r.channel !== "chat" && act !== "meeting" && act !== "join") items.push({ key: "meeting", group: 0, label: t("startMeeting"), icon: <IcMeeting size={16} />, onSelect: onMeet, aiId: aiId(AI_ITEM, r.id, "meeting") });
  if (working) items.push({ key: "transfer", group: 1, label: `${t("transfer")}…`, icon: <IconUsers {...px(16)} aria-hidden="true" />, onSelect: () => onStep("transfer"), aiId: aiId(AI_ITEM, r.id, "transfer") });
  if (choices.length) items.push({ key: "status", group: 1, label: `${t("moveTo")}…`, icon: <IcClock size={16} />, onSelect: () => onStep("status"), aiId: aiId(AI_ITEM, r.id, "status") });
  if (!finished) items.push({ key: "cancel", group: 2, label: t("cancelAsk"), icon: <IcClose size={16} />, danger: true, onSelect: () => onStep("cancel"), aiId: aiId(AI_ITEM, r.id, "cancel") });

  const main =
    act === "claim" ? (
      <button type="button" className="opx-ug-go is-main" disabled={busy} onClick={onClaim} data-ai-target="button:urgent-claim" data-ai-id={aiId(AI_ITEM, r.id, "claim")}>
        <IcUser size={15} />
        {busy ? t("claiming") : t("claim")}
      </button>
    ) : act === "chat" ? (
      <Link href={chatHref(r, name)} target="_blank" rel="noopener noreferrer" className="opx-ug-go" title={t("openChatTitle")} data-ai-id={aiId(AI_ITEM, r.id, "chat")}>
        <IconChat {...px(15)} aria-hidden="true" />
        {t("openChat")}
        <span className="opx-sr">{` (${t("newTab")})`}</span>
        <IconExternal {...px(13)} aria-hidden="true" />
      </Link>
    ) : act === "join" ? (
      <button type="button" className="opx-ug-go is-live" disabled={busy} onClick={onJoin} data-ai-id={aiId(AI_ITEM, r.id, "meeting")}>
        <IcMeeting size={16} />
        {busy ? t("joining") : t("join")}
      </button>
    ) : act === "meeting" ? (
      <button type="button" className="opx-ug-go" disabled={busy} onClick={onMeet} data-ai-id={aiId(AI_ITEM, r.id, "meeting")}>
        <IcMeeting size={16} />
        {busy ? x("starting") : t("startMeeting")}
      </button>
    ) : (
      <button type="button" className="opx-ug-go is-quiet" onClick={onSelect} data-ai-id={aiId(AI_ITEM, r.id, "detail")}>
        {t("openDetail")}
        <IcArrowRight size={15} />
      </button>
    );

  return (
    <article
      className={`opx-ug-card${on ? " is-on" : ""}${open ? " is-new" : ""}${r.slaBreached ? " is-late" : ""}`}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest("a, button, [role='menu']")) return;
        onSelect();
      }}
      data-ai-id={aiId(AI_ITEM, r.id)}
      data-ai-type="list_item"
      data-ai-label={label}
      data-ai-entity-type="urgent_advokat_request"
      data-ai-entity-id={r.id}
    >
      <span className="opx-ug-card__ic" data-ch={r.channel || "video"} aria-hidden="true">
        <KindIcon kind={r.serviceKind} size={22} />
      </span>
      <div className="opx-ug-card__main" data-ai-private>
        <div className="opx-ug-card__top">
          <div className="opx-ug-card__heads">
            <button type="button" className="opx-ug-card__title" aria-pressed={on} onClick={onSelect}>
              {r.clientName || name}
            </button>
            <UrgBadge status={st} urg={urg} />
          </div>
        </div>
        {needText ? (
          <p className="opx-ug-card__need" title={needText}>
            {needText}
          </p>
        ) : null}
        <div className="opx-ug-card__foot">
          <div className="opx-ug-card__meta">
            {whenText && whenAt ? (
              <time className="opx-num" dateTime={whenAt} title={dateTimeFull(whenAt, locale)}>
                <IcClock size={14} />
                {whenText}
              </time>
            ) : null}
          </div>
          <div className="opx-ug-card__side">
            <SlaBar r={r} />
            <div className="opx-ug-card__acts">
              {main}
              <MoreMenu items={items} title={`${t("moreTitle")}: ${label}`} disabled={busy} aiId={aiId(AI_ITEM, r.id, "menu")} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
