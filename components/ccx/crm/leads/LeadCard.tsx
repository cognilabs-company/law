"use client";

import { memo, useEffect, useRef, type DragEvent, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fmtAge } from "@/lib/date";
import { crmNextStatuses, leadCan, type CrmLead, type CrmMeta } from "@/lib/services/crm";
import { prettyPhone } from "../../now/feed";
import { IcBolt, IcClock, IcDoc, IcLayers, IcPhone, IcStore, IcSupport, IcUser } from "../../icons";
import { IcAlert, IcCase, IcDots, IcDown, IcGlobe, IcSend, IcUp } from "./icons";
import { dialOf, initials, shortName, stageStyle, useCategoryName, useDayTime, useWhen } from "./util";

export function SourceIcon({ source }: { source: string }) {
  if (source === "phone") return <IcPhone size={13} />;
  if (source === "telegram") return <IcSend size={13} />;
  if (source === "web") return <IcGlobe size={13} />;
  if (source === "manual") return <IcUser size={13} />;
  if (source === "marketplace") return <IcStore size={13} />;
  if (source === "support") return <IcSupport size={13} />;
  if (source === "document") return <IcDoc size={13} />;
  if (source === "ai" || source === "ai_classify") return <IcBolt size={13} />;
  return <IcLayers size={13} />;
}

export function SourceChip({ source }: { source: string }) {
  const tsrc = useTranslations("crm.source");
  if (!source) return null;
  return (
    <span className="opx-ld-src">
      <SourceIcon source={source} />
      {tsrc.has(source) ? tsrc(source) : tsrc("other")}
    </span>
  );
}

export function ScoreBadge({ score }: { score: string }) {
  const t = useTranslations("crm.score");
  if (!score) return null;
  return (
    <span className="opx-ld-score" data-s={score}>
      {t.has(score) ? t(score) : score}
    </span>
  );
}

type Props = {
  lead: CrmLead;
  meta: CrmMeta;
  now: number;
  stageLabel: (key: string) => string;
  dragging: boolean;
  movingTo: string;
  menuOpen: boolean;
  claimState: string;
  onDragStart: (l: CrmLead, e: DragEvent) => void;
  onDragEnd: () => void;
  onOpen: (l: CrmLead) => void;
  onMenu: (id: string) => void;
  onPick: (l: CrmLead, to: string) => void;
  onNudge: (l: CrmLead, dir: -1 | 1) => void;
  onClaim: (l: CrmLead) => void;
};

export const LeadCard = memo(function LeadCard({ lead: l, meta, now, stageLabel, dragging, movingTo, menuOpen, claimState, onDragStart, onDragEnd, onOpen, onMenu, onPick, onNudge, onClaim }: Props) {
  const t = useTranslations("crm.board");
  const tl = useTranslations("crm.leads");
  const tx = useTranslations("admin.ccx.crmLeads");
  const locale = useLocale();
  const when = useWhen();
  const dayTime = useDayTime();
  const categoryName = useCategoryName();
  const menuBtn = useRef<HTMLButtonElement>(null);
  const menuBox = useRef<HTMLDivElement>(null);
  const movable = leadCan(l, "change_status") || leadCan(l, "move");
  const nextOnes = movable ? crmNextStatuses(meta, l.status) : [];
  const canMove = movable && !movingTo;
  const who = l.customer?.name || l.title || l.workId;
  const sub = l.customer?.name ? l.title : "";
  const category = categoryName(l.category);
  const phone = l.customer?.phone ?? "";
  const tg = l.customer?.telegram ?? "";
  const next = l.nextActionAt ? when(l.nextActionAt, now) : null;
  const age = now && l.createdAt ? fmtAge(l.createdAt, locale, now) : "";

  useEffect(() => {
    if (menuOpen) menuBox.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menuOpen]);

  const menuKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
    const i = items.findIndex((b) => b === document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onMenu("");
      menuBtn.current?.focus();
    }
  };

  return (
    <article
      className="opx-ld-card"
      style={stageStyle(l.status)}
      data-urgency={l.urgency || "normal"}
      data-dragging={dragging || undefined}
      data-moving={movingTo ? "" : undefined}
      data-open={menuOpen || undefined}
      data-menu-for={l.id}
      data-card-id={l.id}
      aria-busy={movingTo ? true : undefined}
      aria-label={[who, sub, stageLabel(l.status)].filter(Boolean).join(" · ")}
      draggable={canMove}
      tabIndex={0}
      onDragStart={(e) => onDragStart(l, e)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(l)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen(l);
      }}
    >
      <span className="opx-ld-card__top">
        <span className="opx-ld-card__cat" title={l.workId}>
          <span className="opx-ld-card__catic" aria-hidden="true">
            <IcCase size={14} />
          </span>
          <span>{category || l.workId}</span>
        </span>
        <ScoreBadge score={l.score} />
      </span>
      <b className="opx-ld-card__who">{who}</b>
      {sub ? <small className="opx-ld-card__sub">{sub}</small> : null}
      <span className="opx-ld-card__row">
        {phone || tg ? (
          <a
            className="opx-ld-card__reach opx-num"
            href={phone ? `tel:${dialOf(phone)}` : `https://t.me/${tg.replace(/^@/, "")}`}
            target={phone ? undefined : "_blank"}
            rel={phone ? undefined : "noopener noreferrer"}
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {phone ? <IcPhone size={14} /> : <IcSend size={14} />}
            <span dir="ltr">{phone ? prettyPhone(phone) : tg}</span>
          </a>
        ) : (
          <span className="opx-ld-card__none">—</span>
        )}
        <SourceChip source={l.source} />
      </span>
      {next ? (
        <span className="opx-ld-card__next" data-tone={next.tone || undefined}>
          <IcClock size={14} />
          <span>
            {dayTime(l.nextActionAt, now)} · {next.text}
          </span>
        </span>
      ) : null}
      {movingTo ? (
        <span className="opx-ld-card__moving" role="status">
          {t("movingTo", { to: movingTo })}
        </span>
      ) : null}
      {l.duplicateStatus === "needs_review" ? (
        <span className="opx-ld-card__dup" title={t("dup")}>
          <IcAlert size={13} />
          {t("dup")}
        </span>
      ) : null}
      <span className="opx-ld-card__foot">
        {l.operator ? (
          <span className="opx-ld-op" title={l.operator.name}>
            <i aria-hidden="true">{initials(l.operator.name)}</i>
            <span>{shortName(l.operator.name)}</span>
          </span>
        ) : leadCan(l, "claim") ? (
          <button
            type="button"
            className="opx-ld-claim"
            data-done={claimState === "done" || undefined}
            disabled={!!claimState}
            aria-busy={claimState === "hold" || undefined}
            onClick={(e) => {
              e.stopPropagation();
              onClaim(l);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {claimState === "done" ? tl("claimDone") : tl("claim")}
          </button>
        ) : (
          <span className="opx-ld-op is-none">
            <i aria-hidden="true">?</i>
            <span>{tl("unassigned")}</span>
          </span>
        )}
        {age ? (
          <span className="opx-ld-card__age opx-num" title={tl("col.created")}>
            {age}
          </span>
        ) : null}
        {canMove ? (
          <button
            ref={menuBtn}
            type="button"
            className="opx-ld-card__more"
            aria-label={t("moveTo")}
            title={t("moveTo")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              onMenu(l.id);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <IcDots size={18} />
          </button>
        ) : null}
      </span>
      {menuOpen && canMove ? (
        <div ref={menuBox} className="opx-ld-menu" role="menu" aria-label={t("moveTo")} onClick={(e) => e.stopPropagation()} onKeyDown={menuKeys}>
          <button type="button" role="menuitem" onClick={() => onNudge(l, -1)}>
            <IcUp size={15} />
            {t("up")}
          </button>
          <button type="button" role="menuitem" onClick={() => onNudge(l, 1)}>
            <IcDown size={15} />
            {t("down")}
          </button>
          {nextOnes.length ? <span className="opx-ld-menu__sep" role="separator" /> : null}
          {nextOnes.length ? (
            <span className="opx-ld-menu__cap" role="presentation">
              {tx("moveCap")}
            </span>
          ) : null}
          {nextOnes.map((s) => (
            <button key={s} type="button" role="menuitem" style={stageStyle(s)} onClick={() => onPick(l, s)}>
              <i aria-hidden="true" />
              {stageLabel(s)}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
});
