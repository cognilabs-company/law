"use client";

import { useSyncExternalStore, type CSSProperties, type DragEventHandler, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtAgeMin, fmtDateTime } from "@/lib/date";
import { parseServerTime } from "@/lib/http";
import { leadCategoryLabel, leadRegionLabel, leadSourceInfo } from "@/lib/leadLabels";
import type { LeadX } from "@/lib/services/leads";
import { ScoreChip, WorkId } from "@/components/ui/Badge";
import IconButton from "@/components/ui/IconButton";
import PersonName from "@/components/ui/PersonName";
import { IconPhone, IconVideo } from "@/components/icons";
import { LeadActionsMenu, LeadOperatorMenu, OperatorAvatar, deniedReason, isAllowed, leadOperatorView, leadPhoneText, leadTel, type LeadHandlers, type LeadPeople, type LeadPerms, type LeadStage } from "./LeadMenu";

export type LeadCardVariant = "pipeline" | "callcenter";

export type LeadCardProps = LeadHandlers &
  LeadPerms &
  LeadPeople & {
    lead: LeadX;
    stage: string;
    stages: readonly LeadStage[];
    variant?: LeadCardVariant;
    busy?: boolean;
    showWorkId?: boolean;
    operatorButton?: boolean;
    extra?: ReactNode;
    draggable?: boolean;
    dragging?: boolean;
    onDragStart?: DragEventHandler<HTMLElement>;
    onDragEnd?: DragEventHandler<HTMLElement>;
    onDragOver?: DragEventHandler<HTMLElement>;
    onDragLeave?: DragEventHandler<HTMLElement>;
    onDrop?: DragEventHandler<HTMLElement>;
    id?: string;
    className?: string;
    style?: CSSProperties;
    aiId?: string;
    aiTarget?: string;
  };

type Tr = ReturnType<typeof useTranslations>;

const INTERACTIVE = "a,button,input,select,textarea,label,[role=menuitem],[role=menuitemradio],[role=option],[role=dialog]";

const subs = new Set<() => void>();
let ticker = 0;

function subscribeMinute(cb: () => void): () => void {
  subs.add(cb);
  if (subs.size === 1) ticker = window.setInterval(() => subs.forEach((fn) => fn()), 30000);
  return () => {
    subs.delete(cb);
    if (!subs.size) window.clearInterval(ticker);
  };
}

const readMinute = () => Math.floor(Date.now() / 60000);
const serverMinute = () => 0;

export function useLeadMinute(): number {
  return useSyncExternalStore(subscribeMinute, readMinute, serverMinute);
}

export function leadDisplayName(lead: LeadX, tp: Tr): string {
  return lead.name || leadPhoneText(lead.phone) || leadCategoryLabel(tp, lead.category) || tp("untitledLead");
}

export function leadAgeText(createdAt: string, minute: number, locale: string, tp: Tr): string {
  const at = parseServerTime(createdAt);
  if (!minute || !Number.isFinite(at)) return "";
  const mins = minute - Math.floor(at / 60000);
  return mins < 2 ? tp("age.now") : fmtAgeMin(mins, locale);
}

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

function fromInside(e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>): boolean {
  const host = e.currentTarget;
  const at = e.target instanceof Element ? e.target : null;
  if (!at || !host.contains(at)) return false;
  const hit = at.closest(INTERACTIVE);
  return !hit || hit === host || !host.contains(hit);
}

export default function LeadCard(props: LeadCardProps) {
  const {
    lead,
    stage,
    stages,
    variant = "pipeline",
    ops,
    load,
    meId = "",
    busy = false,
    showWorkId,
    operatorButton,
    extra,
    onOpen,
    onAssign,
    onCall,
    onVideo,
    canAssign,
    canCall,
    canVideo,
    draggable,
    dragging,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    id,
    className,
    style,
    aiId,
    aiTarget,
  } = props;
  const tp = useTranslations("admin.pipeline");
  const tl = useTranslations("admin.leadCard");
  const te = useTranslations("enums");
  const tm = useTranslations("admin.meetings");
  const locale = useLocale();
  const minute = useLeadMinute();

  const call = variant === "callcenter";
  const name = leadDisplayName(lead, tp);
  const tel = leadTel(lead.phone);
  const phone = leadPhoneText(lead.phone);
  const phoneRow = !!phone && (call || (!!lead.name && lead.name !== lead.phone));
  const source = leadSourceInfo(te, lead.source);
  // A lead with only its client's account to go by is titled with that
  // client's name; the category then joins the tags.
  const byClient = !lead.name && !lead.phone && !!lead.clientUserId;
  const titledByCategory = !lead.name && !lead.phone && !byClient;
  const tags = [
    titledByCategory ? null : { key: "cat", text: leadCategoryLabel(tp, lead.category), title: "" },
    { key: "reg", text: leadRegionLabel(te, lead.region), title: "" },
    { key: "src", text: source.label, title: source.title },
  ].filter((x): x is { key: string; text: string; title: string } => !!x && !!x.text);
  const wid = (showWorkId ?? call) && lead.workId ? lead.workId : "";
  const view = leadOperatorView(lead, tp, ops, meId);
  const pickable = (operatorButton ?? call) && !!onAssign && isAllowed(canAssign) && !deniedReason(canAssign);
  const age = leadAgeText(lead.createdAt, minute, locale, tp);
  const created = parseServerTime(lead.createdAt);
  const createdText = Number.isFinite(created) ? fmtDateTime(created, locale) : "";
  const quickCall = call && !!tel && isAllowed(canCall) && !deniedReason(canCall);
  const quickVideo = call && !!onVideo && isAllowed(canVideo) && !deniedReason(canVideo);

  const open = (e: MouseEvent<HTMLElement>) => {
    if (!onOpen || busy || !fromInside(e)) return;
    onOpen(lead);
  };

  const key = (e: KeyboardEvent<HTMLElement>) => {
    if (!onOpen || e.target !== e.currentTarget) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (!busy) onOpen(lead);
  };

  return (
    <article
      id={id}
      className={cx("ldc", `ldc--${variant}`, onOpen && "ldc--open", dragging && "is-drag", busy && "is-busy", className)}
      style={style}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={name}
      aria-busy={busy || undefined}
      draggable={draggable || undefined}
      onClick={open}
      onKeyDown={key}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-lead={lead.id}
      data-ai-id={aiId}
      data-ai-type={aiId ? "card" : undefined}
      data-ai-label={aiId ? name : undefined}
      data-ai-entity-type={aiId ? "lead" : undefined}
      data-ai-entity-id={aiId ? lead.id : undefined}
      data-ai-target={aiTarget}
    >
      <div className="ldc__top">
        <b className="ldc__name">{byClient ? <PersonName id={lead.clientUserId} fallback={name} /> : name}</b>
        <ScoreChip score={lead.scoreKey} />
        <LeadActionsMenu
          lead={lead}
          stage={stage}
          stages={stages}
          name={name}
          ops={ops}
          load={load}
          meId={meId}
          canMove={props.canMove}
          canAssign={canAssign}
          canDelete={props.canDelete}
          canCall={canCall}
          canVideo={canVideo}
          onOpen={onOpen}
          onMove={props.onMove}
          onAssign={onAssign}
          onLost={props.onLost}
          onDelete={props.onDelete}
          onCall={onCall}
          onVideo={onVideo}
          busy={busy}
          tipSide="bottom"
          aiId={aiId}
        />
      </div>
      {phoneRow ? (
        <div className="ldc__tel">
          <IconPhone aria-hidden="true" />
          <span className="ldc__ph">{phone}</span>
          {quickCall || quickVideo ? (
            <span className="ldc__acts">
              {quickCall ? (
                <a
                  className="ibtn ibtn--line ibtn--sm ldc__qa"
                  href={`tel:${tel}`}
                  draggable={false}
                  aria-label={tl("callTo", { phone })}
                  data-tip={tl("call")}
                  data-tip-side="bottom"
                  data-tip-align="end"
                  data-ai-id={aiId ? `${aiId}.quick-call` : undefined}
                  data-ai-type={aiId ? "call_button" : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCall?.(lead);
                  }}
                >
                  <span className="ibtn__ic" aria-hidden="true">
                    <IconPhone />
                  </span>
                </a>
              ) : null}
              {quickVideo && onVideo ? (
                <IconButton
                  label={lead.name ? tm("ccStartWith", { name: lead.name }) : tl("video")}
                  icon={<IconVideo />}
                  variant="line"
                  size="sm"
                  tip={tl("video")}
                  tipSide="bottom"
                  tipAlign="end"
                  className="ldc__qa"
                  aria-disabled={busy || undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!busy) onVideo(lead);
                  }}
                  aiId={aiId ? `${aiId}.quick-video` : undefined}
                  aiType="call_button"
                />
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
      {wid || tags.length ? (
        <div className="ldc__tags">
          {wid ? <WorkId id={wid} className="ldc__wid" /> : null}
          {tags.map((x) => (
            <span key={x.key} className="ldc__tag" title={x.title || undefined}>
              {x.text}
            </span>
          ))}
        </div>
      ) : null}
      {extra}
      <div className="ldc__foot">
        {pickable && onAssign ? (
          <LeadOperatorMenu lead={lead} ops={ops} load={load} meId={meId} onAssign={onAssign} canAssign={canAssign} look="pill" busy={busy} aiId={aiId ? `${aiId}.operator` : undefined} />
        ) : (
          <span className={cx("ldc__who", view.none && "is-none", view.me && "is-me")}>
            <OperatorAvatar view={view} />
            <span className="ldc__wn">
              <span className="sr-only">{`${tp("assign.title")}: `}</span>
              {view.name}
            </span>
          </span>
        )}
        {age ? (
          <time className="ldc__age" dateTime={lead.createdAt} title={createdText || undefined}>
            <span className="sr-only">{`${tp("d.created")}: `}</span>
            {age}
          </time>
        ) : null}
      </div>
    </article>
  );
}
