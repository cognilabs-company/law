"use client";

import { aiId } from "@/lib/ai/ids";
import type { StudioDetail } from "@/lib/services/studio";
import { ConstructorIcon, StudioCodeChip, StudioStatusPill, useStudioText } from "../bits";
import { commentsCountOf, currentStepOf, submittedOf, versionLabelOf } from "./helpers";
import { IconChat, IconChevronRight, IconClock, IconPaperclip, IconRocket, IconShieldCheck, IconUser } from "@/components/icons";

export default function ApprovalCard({
  item,
  now,
  mine,
  publishable,
  active,
  onOpen,
}: {
  item: StudioDetail;
  now: number;
  mine: boolean;
  publishable: boolean;
  active: boolean;
  onOpen: (item: StudioDetail) => void;
}) {
  const { t, ctorName, role, ago, num } = useStudioText();
  const sub = submittedOf(item);
  const ver = versionLabelOf(item);
  const step = currentStepOf(item);
  const comments = commentsCountOf(item);
  const stepName = step ? step.step.title || role(step.step.role) : "";
  return (
    <li
      className={`stu-apc${active ? " is-on" : ""}${mine ? " is-mine" : ""}`}
      data-ai-id={aiId("admin.studio.approvals.item", item.id)}
      data-ai-type="list_item"
      data-ai-entity-type="studio_object"
      data-ai-entity-id={item.id}
      data-ai-label={item.title}
    >
      <button type="button" className="stu-apc__btn" onClick={() => onOpen(item)} aria-current={active ? "true" : undefined} data-ai-id={aiId("admin.studio.approvals.item", item.id, "open")} data-ai-type="button" data-ai-label={item.title}>
        <ConstructorIcon code={item.code} />
        <span className="stu-apc__body">
          <span className="stu-apc__top">
            <StudioCodeChip code={item.code} />
            <span className="stu-apc__ctor">{ctorName(item.code)}</span>
            {ver ? <span className="stu-apc__ver">v{ver}</span> : null}
          </span>
          <span className="stu-apc__t">{item.title || t("approvals.untitled")}</span>
          <span className="stu-apc__meta">
            {sub.by ? (
              <span>
                <IconUser aria-hidden />
                {sub.by}
              </span>
            ) : null}
            {sub.at ? (
              <span title={sub.at}>
                <IconClock aria-hidden />
                {ago(sub.at, now)}
              </span>
            ) : null}
            {step ? (
              <span className={step.back ? "is-warn" : undefined}>
                <IconShieldCheck aria-hidden />
                {t("approvals.card.step", { n: step.index + 1, total: step.total, name: stepName })}
              </span>
            ) : null}
            {item.hasFile ? (
              <span>
                <IconPaperclip aria-hidden />
                {t("approvals.card.file")}
              </span>
            ) : null}
            {comments ? (
              <span>
                <IconChat aria-hidden />
                {num(comments)}
              </span>
            ) : null}
          </span>
        </span>
        <span className="stu-apc__side">
          <StudioStatusPill status={item.status} raw={item.statusRaw} small />
          {publishable ? (
            <span className="stu-apc__flag stu-apc__flag--pub">
              <IconRocket aria-hidden />
              {t("approvals.card.ready")}
            </span>
          ) : mine ? (
            <span className="stu-apc__flag">{t("approvals.card.yourTurn")}</span>
          ) : null}
          <IconChevronRight className="stu-apc__go" aria-hidden />
        </span>
      </button>
    </li>
  );
}
