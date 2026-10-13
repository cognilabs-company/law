"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { aiSeg } from "@/lib/ai/ids";
import { initials } from "@/lib/lawyers";
import { assigneeLabel, personLabel } from "@/lib/leadLabels";
import { assignHint, rankForAssign } from "@/lib/leadOperators";
import { leadUserId, type LeadX, type OperatorsState } from "@/lib/services/leads";
import { formatUzPhone, isValidUzPhone } from "@/lib/phone";
import { IconPhone, IconVideo } from "@/components/icons";
import type { PopoverAlign } from "@/lib/usePopover";
import Menu, { isMenuItem, menuSeparator, type MenuEntry, type MenuItem } from "@/components/ui/Menu";
import type { TipAlign, TipSide } from "@/components/ui/IconButton";

export type LeadStage = { key: string; label: string; color?: string; lost?: boolean };

export type LeadCan = boolean | string;

export type LeadHandlers = {
  onOpen?: (lead: LeadX) => void;
  onMove?: (lead: LeadX, stageKey: string) => void;
  onAssign?: (lead: LeadX, userId: string) => void;
  onLost?: (lead: LeadX, stageKey: string) => void;
  onDelete?: (lead: LeadX) => void;
  onCall?: (lead: LeadX) => void;
  onVideo?: (lead: LeadX) => void;
};

export type LeadPerms = {
  canMove?: LeadCan;
  canAssign?: LeadCan;
  canDelete?: LeadCan;
  canCall?: LeadCan;
  canVideo?: LeadCan;
};

export type LeadPeople = {
  ops?: OperatorsState;
  load?: ReadonlyMap<string, number>;
  meId?: string;
};

export type LeadOperatorView = { id: string; name: string; none: boolean; me: boolean; known: boolean };

type Tr = ReturnType<typeof useTranslations>;

const NO_LOAD: ReadonlyMap<string, number> = new Map();

export const leadTel = (phone: string): string => (phone || "").replace(/[^+\d]/g, "");

export function leadPhoneText(phone: string): string {
  const raw = (phone || "").trim();
  if (!/^[+\d\s().-]+$/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, "");
  const uz = digits.length === 12 ? digits.startsWith("998") : digits.length === 9 && !raw.startsWith("+");
  return uz && isValidUzPhone(raw) ? formatUzPhone(raw) : raw;
}

export const isAllowed = (can: LeadCan | undefined): boolean => can !== false;

export const deniedReason = (can: LeadCan | undefined): string | undefined => (typeof can === "string" && can ? can : undefined);

export function lostStageOf(stages: readonly LeadStage[]): LeadStage | undefined {
  return stages.find((s) => s.lost);
}

export function leadOperatorView(lead: LeadX, tp: Tr, ops?: OperatorsState, meId = ""): LeadOperatorView {
  const id = lead.assignedTo;
  if (!id) return { id: "", name: tp("assign.none"), none: true, me: false, known: true };
  const person = personLabel(ops?.people.get(id));
  const name = person || assigneeLabel(tp, ops?.people ?? new Map(), id, meId, ops?.status === "ready");
  return { id, name, none: false, me: !!meId && id === meId, known: !!person };
}

export function OperatorAvatar({ view }: { view: LeadOperatorView }) {
  return (
    <span className="ldc__av" aria-hidden="true">
      {view.none ? "?" : initials(view.name) || "?"}
    </span>
  );
}

function stageDot(color?: string): ReactNode {
  return <i className="umenu__dot" style={{ "--c": color || "#94a3b8" } as CSSProperties} />;
}

export function leadStageEntries(o: { stages: readonly LeadStage[]; stage: string; skipLost?: boolean; aiBase?: string; onPick: (stageKey: string) => void }): MenuEntry[] {
  return o.stages
    .filter((s) => !(o.skipLost && s.lost && s.key !== o.stage))
    .map((s) => ({
      key: `stage:${s.key}`,
      label: s.label,
      icon: stageDot(s.color),
      checked: s.key === o.stage,
      onSelect: s.key === o.stage ? undefined : () => o.onPick(s.key),
      aiId: o.aiBase ? `${o.aiBase}.${aiSeg(s.key)}` : undefined,
    }));
}

export function leadOperatorEntries(o: { lead: LeadX; ops?: OperatorsState; load?: ReadonlyMap<string, number>; meId?: string; aiBase?: string; tp: Tr; tl: Tr; onPick: (userId: string) => void }): MenuEntry[] {
  const { lead, ops, tp, tl } = o;
  if (!ops || ops.status === "loading") return [{ key: "ops:loading", label: tl("opsLoading"), disabled: true }];
  if (ops.status === "forbidden") return [{ key: "ops:forbidden", label: tl("opsUnavailable"), disabled: tp("assign.opsForbidden") }];
  if (ops.status === "error") return [{ key: "ops:error", label: tl("opsUnavailable"), disabled: tp("assign.opsError") }];
  const ranked = rankForAssign(ops.ops, o.load ?? NO_LOAD, { unknown: tp("assign.unknown"), count: (n) => tp("assign.leadCount", { n }), idle: tl("idle"), me: tp("assign.me") }, o.meId);
  const rows: MenuEntry[] = [];
  const cur = lead.assignedTo;
  if (cur && !ranked.some((r) => r.id === cur)) {
    const view = leadOperatorView(lead, tp, ops, o.meId);
    rows.push({ key: `op:${cur}`, label: view.name, icon: <OperatorAvatar view={view} />, checked: true, aiId: o.aiBase ? `${o.aiBase}.${aiSeg(cur)}` : undefined });
  }
  for (const r of ranked) {
    rows.push({
      key: `op:${r.id}`,
      label: r.label,
      hint: assignHint(r.count, { unknown: "", count: (n) => tp("assign.leadCount", { n }), idle: tl("idle") }) || undefined,
      icon: <OperatorAvatar view={{ id: r.id, name: r.name, none: false, me: r.me, known: true }} />,
      checked: r.id === cur,
      onSelect: r.id === cur ? undefined : () => o.onPick(r.id),
      aiId: o.aiBase ? `${o.aiBase}.${aiSeg(r.id)}` : undefined,
    });
  }
  if (!ranked.length) rows.push({ key: "ops:none", label: tl("opsUnavailable"), disabled: tp("assign.noOps") });
  if (cur) {
    rows.push(menuSeparator("op-sep"));
    rows.push({ key: "op:-", label: tl("unassign"), onSelect: () => o.onPick(""), aiId: o.aiBase ? `${o.aiBase}.none` : undefined });
  }
  return rows;
}

export type LeadActionsMenuProps = LeadHandlers &
  LeadPerms &
  LeadPeople & {
    lead: LeadX;
    stage: string;
    stages: readonly LeadStage[];
    name: string;
    aiId?: string;
    size?: "sm" | "md";
    busy?: boolean;
    disabled?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    triggerClassName?: string;
    tipSide?: TipSide;
    tipAlign?: TipAlign;
    align?: PopoverAlign;
  };

export function leadActionEntries(p: Omit<LeadActionsMenuProps, "size" | "busy" | "disabled" | "open" | "onOpenChange" | "triggerClassName" | "tipSide" | "tipAlign" | "align">, tp: Tr, tl: Tr): MenuEntry[] {
  const { lead, stage, stages, aiId: base } = p;
  const id = (part: string) => (base ? `${base}.${part}` : undefined);
  const out: MenuEntry[] = [];
  const lost = p.onLost ? lostStageOf(stages) : undefined;
  if (p.onOpen) {
    const onOpen = p.onOpen;
    out.push({ key: "open", label: tl("open"), onSelect: () => onOpen(lead), aiId: id("open") });
  }
  if (p.onMove && isAllowed(p.canMove) && stages.length > 1) {
    const onMove = p.onMove;
    out.push({
      key: "move",
      label: tl("move"),
      disabled: deniedReason(p.canMove),
      items: () => leadStageEntries({ stages, stage, skipLost: !!lost, aiBase: id("move"), onPick: (k) => onMove(lead, k) }),
      aiId: id("move"),
    });
  }
  if (p.onAssign && isAllowed(p.canAssign)) {
    const onAssign = p.onAssign;
    out.push({
      key: "assign",
      label: tl("assign"),
      disabled: deniedReason(p.canAssign),
      items: () => leadOperatorEntries({ lead, ops: p.ops, load: p.load, meId: p.meId, aiBase: id("assign"), tp, tl, onPick: (u) => onAssign(lead, u) }),
      aiId: id("assign"),
    });
  }
  out.push(menuSeparator("sep-contact"));
  const tel = leadTel(lead.phone);
  if (isAllowed(p.canCall)) {
    const onCall = p.onCall;
    const call: MenuItem = {
      key: "call",
      label: tl("call"),
      icon: <IconPhone />,
      disabled: !tel ? tl("noPhone") : deniedReason(p.canCall),
      href: tel ? `tel:${tel}` : undefined,
      onSelect: onCall ? () => onCall(lead) : undefined,
      aiId: id("call"),
      aiType: "call_button",
    };
    out.push(call);
  }
  if (p.onVideo && isAllowed(p.canVideo)) {
    const onVideo = p.onVideo;
    out.push({
      key: "video",
      label: tl("video"),
      icon: <IconVideo />,
      disabled: !tel && !leadUserId(lead) ? tl("noPhone") : deniedReason(p.canVideo),
      onSelect: () => onVideo(lead),
      aiId: id("video"),
      aiType: "call_button",
    });
  }
  out.push(menuSeparator("sep-end"));
  if (lost && p.onLost && isAllowed(p.canMove) && stage !== lost.key) {
    const onLost = p.onLost;
    out.push({ key: "lost", label: tl("lost"), disabled: deniedReason(p.canMove), onSelect: () => onLost(lead, lost.key), aiId: id("lost") });
  }
  if (p.onDelete && isAllowed(p.canDelete)) {
    const onDelete = p.onDelete;
    out.push({ key: "delete", label: tl("delete"), danger: true, disabled: deniedReason(p.canDelete), onSelect: () => onDelete(lead), aiId: id("delete") });
  }
  return out;
}

export function LeadActionsMenu(props: LeadActionsMenuProps) {
  const tp = useTranslations("admin.pipeline");
  const tl = useTranslations("admin.leadCard");
  const { name, aiId, size = "sm", busy, disabled, open, onOpenChange, triggerClassName, tipSide, tipAlign, align = "end" } = props;
  const items = leadActionEntries(props, tp, tl);
  return (
    <Menu
      items={items}
      label={tl("actionsFor", { name })}
      title={name}
      size={size}
      busy={busy}
      disabled={disabled}
      open={open}
      onOpenChange={onOpenChange}
      triggerClassName={triggerClassName ?? "ldc__more"}
      tipSide={tipSide}
      tipAlign={tipAlign ?? "end"}
      align={align}
      aiId={aiId ? `${aiId}.menu` : undefined}
    />
  );
}

export type LeadStageMenuProps = {
  lead: LeadX;
  stage: string;
  stages: readonly LeadStage[];
  onMove: (lead: LeadX, stageKey: string) => void;
  canMove?: LeadCan;
  busy?: boolean;
  className?: string;
  aiId?: string;
};

export function LeadStageMenu({ lead, stage, stages, onMove, canMove, busy, className, aiId }: LeadStageMenuProps) {
  const tl = useTranslations("admin.leadCard");
  const whyId = useId();
  const cur = stages.find((s) => s.key === stage);
  const why = deniedReason(canMove);
  const items = leadStageEntries({ stages, stage, aiBase: aiId, onPick: (k) => onMove(lead, k) });
  return (
    <span className="lmenu-field">
      <Menu
        items={items}
        label={tl("move")}
        text={
          <>
            {stageDot(cur?.color)}
            <span className="umenu-btn__t">{tl("stageButton", { stage: cur?.label ?? stage })}</span>
          </>
        }
        triggerClassName={className ?? "btn btn--line btn--sm lmenu-btn"}
        focus="checked"
        busy={busy}
        disabled={canMove === false || !!why}
        describedBy={why ? whyId : undefined}
        aiId={aiId}
      />
      {why ? (
        <span id={whyId} className="lmenu-why">
          {why}
        </span>
      ) : null}
    </span>
  );
}

export type LeadOperatorMenuProps = LeadPeople & {
  lead: LeadX;
  onAssign: (lead: LeadX, userId: string) => void;
  canAssign?: LeadCan;
  look?: "pill" | "button";
  busy?: boolean;
  className?: string;
  aiId?: string;
};

export function LeadOperatorMenu({ lead, ops, load, meId, onAssign, canAssign, look = "button", busy, className, aiId }: LeadOperatorMenuProps) {
  const tp = useTranslations("admin.pipeline");
  const tl = useTranslations("admin.leadCard");
  const whyId = useId();
  const view = leadOperatorView(lead, tp, ops, meId);
  const why = deniedReason(canAssign);
  const items = leadOperatorEntries({ lead, ops, load, meId, aiBase: aiId, tp, tl, onPick: (u) => onAssign(lead, u) });
  const count = items.filter(isMenuItem).length;
  const pill = look === "pill";
  const cls = pill ? `ldc__who ldc__who--btn${view.none ? " is-none" : view.me ? " is-me" : ""}` : "btn btn--line btn--sm lmenu-btn";
  return (
    <span className={pill ? "lmenu-pill" : "lmenu-field"}>
      <Menu
        items={items}
        label={tl("assign")}
        triggerLabel={pill ? tl("operatorChange", { name: view.name }) : undefined}
        text={
          <>
            <OperatorAvatar view={view} />
            <span className={pill ? "ldc__wn" : "umenu-btn__t"}>{pill ? view.name : tl("operatorButton", { name: view.name })}</span>
          </>
        }
        triggerClassName={className ?? cls}
        focus="checked"
        search={count > 8}
        busy={busy}
        disabled={canAssign === false || !!why}
        describedBy={why ? whyId : undefined}
        aiId={aiId}
      />
      {why && !pill ? (
        <span id={whyId} className="lmenu-why">
          {why}
        </span>
      ) : null}
    </span>
  );
}
