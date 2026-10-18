"use client";

import "../../sx-core.css";
import "../sx-editor-panels.css";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { STUDIO_PERM_REASSIGN, listApprovalUsers, type StudioApprover, type StudioStep } from "@/lib/services/studio";
import { SxButton } from "../../Button";
import { useStudioLabels } from "../../useStudioLabels";
import type { SxIcon } from "../../types";
import {
  ArrowUUpLeftIcon,
  CheckIcon,
  ClockIcon,
  HourglassMediumIcon,
  ProhibitIcon,
  RocketLaunchIcon,
  SealCheckIcon,
  UserCheckIcon,
  UserSwitchIcon,
  WarningIcon,
  glyph,
} from "../../icons";
import type { EditorState } from "../useEditorState";
import { initials, normRole, roleName, stepName, stepPending, stepTone } from "../model";
import { ReassignDialog } from "./ReassignDialog";

export type StepTone = "ok" | "warn" | "err" | "wait";

export const STEP_TONE_ICON: Readonly<Record<StepTone, SxIcon>> = { ok: CheckIcon, warn: ArrowUUpLeftIcon, err: ProhibitIcon, wait: HourglassMediumIcon };

const holders = new Map<string, { at: number; list: Promise<StudioApprover[]> }>();

export function studioPeople(code: string, now: number = Date.now()): Promise<StudioApprover[]> {
  const hit = holders.get(code);
  if (hit && now - hit.at < 60_000) return hit.list;
  const list = listApprovalUsers("", code);
  holders.set(code, { at: now, list });
  list.catch(() => holders.delete(code));
  return list;
}

export function roleHolders(all: readonly StudioApprover[], role: string): StudioApprover[] {
  return all.filter((u) => u.roles.some((r) => normRole(r) === role || normRole(r) === "studio_admin"));
}

function useRoleHolders(code: string, role: string): StudioApprover[] | null {
  const key = `${code}|${role}`;
  const [got, setGot] = useState<{ key: string; list: StudioApprover[] } | null>(null);
  useEffect(() => {
    if (!role) return;
    let live = true;
    studioPeople(code).then(
      (all) => {
        if (live) setGot({ key, list: roleHolders(all, role) });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [code, role, key]);
  return role && got?.key === key ? got.list : null;
}

export function StepMeta({ step, code, onChanged }: { step: StudioStep; code: string; onChanged: () => void }): ReactElement | null {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const { session } = useAuth();
  const canReassign = (session?.permissions ?? []).includes(STUDIO_PERM_REASSIGN);
  const [open, setOpen] = useState(false);
  const pending = stepPending(step);
  const byRole = pending && !step.approvers.length ? normRole(step.role) : "";
  const people = useRoleHolders(code, byRole);
  const decided = new Map(step.approvals.map((a) => [a.userId, a]));
  const waiting = step.approvers.filter((p) => !decided.has(p.id));
  const many = step.approvers.length > 1 || step.required > 1;
  const late = step.overdue && pending;
  if (!step.approvers.length && !people && !step.deadlineAt && !step.escalatedAt && !step.reassignments.length && !many) return null;
  return (
    <div className="sx-ed-steps__meta">
      {people ? (
        people.length ? (
          <div className="sx-ed-steps__can">
            <p className="sx-ed-steps__sub">{t("sx.editor.steps.canDecide")}</p>
            <ul className="sx-ed-ppl">
              {people.map((u) => (
                <li key={u.id}>
                  <span className="sx-ed-av" aria-hidden="true">
                    {initials(u.name)}
                  </span>
                  <span className="sx-ed-ppl__m">
                    <span className="sx-ed-ppl__n">{u.name || "—"}</span>
                    <span className="sx-ed-ppl__s">{[u.employeeCode, u.roles.map((r) => roleName(labels, normRole(r))).filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="sx-ed-steps__warn">
            {glyph(WarningIcon, { size: 16 })}
            <span>{roleName(labels, byRole) ? t("sx.editor.steps.nobody", { role: roleName(labels, byRole) }) : t("sx.editor.steps.nobodyAny")}</span>
          </p>
        )
      ) : null}
      {step.approvers.length ? (
        <ul className="sx-ed-ppl">
          {step.approvers.map((p) => {
            const a = decided.get(p.id);
            const tone: StepTone = a ? (stepTone(a.decision) === "ok" ? "ok" : stepTone(a.decision) === "err" ? "err" : "warn") : "wait";
            return (
              <li key={p.id} data-tone={tone}>
                <span className="sx-ed-ppl__mark" aria-hidden="true">
                  {glyph(STEP_TONE_ICON[tone], { size: 14 })}
                </span>
                <span className="sx-ed-ppl__m">
                  <span className="sx-ed-ppl__n">{p.name || "—"}</span>
                  <span className="sx-ed-ppl__s">{a ? [labels.stepDecision(a.decision), a.at ? labels.dateTime(a.at) : ""].filter(Boolean).join(" · ") : t("sx.editor.steps.waiting")}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="sx-ed-steps__chips">
        {many ? (
          <span className="sx-ed-chip">
            {glyph(UserCheckIcon,{ size: 14 })}
            {t("sx.editor.steps.progress", { done: labels.num(step.approved), need: labels.num(step.required) })}
          </span>
        ) : null}
        {pending && many && step.remaining > 0 ? <span className="sx-ed-chip">{t("sx.editor.steps.remaining", { n: step.remaining })}</span> : null}
        {step.deadlineAt ? (
          <span className="sx-ed-chip" data-late={late ? "" : undefined}>
            {glyph(late ? WarningIcon : ClockIcon, { size: 14 })}
            {late ? `${t("sx.editor.steps.overdue")} · ` : ""}
            {t("sx.editor.steps.deadline", { date: labels.dateTime(step.deadlineAt) })}
          </span>
        ) : null}
        {step.escalatedAt ? (
          <span className="sx-ed-chip" data-late="">
            {t("sx.editor.steps.escalated", { date: labels.dateTime(step.escalatedAt) })}
          </span>
        ) : null}
        {pending && canReassign && waiting.length ? (
          <SxButton variant="ghost" size="sm" icon={UserSwitchIcon} onClick={() => setOpen(true)} aria-haspopup="dialog" aiId="admin.studio.approvals.step.reassign">
            {t("sx.editor.steps.reassign")}
          </SxButton>
        ) : null}
      </div>
      {step.reassignments.length ? (
        <div className="sx-ed-steps__hist">
          <p className="sx-ed-steps__sub">{t("sx.editor.steps.history")}</p>
          <ul>
            {step.reassignments.map((r, i) => (
              <li key={`${r.at}-${i}`}>
                <span className="sx-ed-steps__histrow">{t("sx.editor.steps.historyRow", { from: r.from || "—", to: r.to || "—" })}</span>
                <span className="sx-ed-ppl__s">{[r.at ? labels.dateTime(r.at) : "", r.by].filter(Boolean).join(" · ")}</span>
                {r.message ? <q className="sx-ed-steps__q">{r.message}</q> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {open ? (
        <ReassignDialog
          step={step}
          code={code}
          from={waiting}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

export function StepsTab({ st }: { st: EditorState }): ReactElement {
  const t = useTranslations("studio");
  const labels = useStudioLabels();
  const steps = st.detail?.steps ?? [];
  const submitted = st.status === "submitted" || st.status === "in_review";
  const refresh = () => void st.refresh(true);

  if (st.direct) {
    return (
      <div className="sx-ed-steps" data-ai-id="admin.studio.editor.steps" data-ai-type="section" data-ai-label={t("sx.editor.tab.steps")}>
        <div className="sx-ed-none">
          {glyph(RocketLaunchIcon, { size: 24 })}
          <p>{t("sx.editor.steps.free")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sx-ed-steps" data-ai-id="admin.studio.editor.steps" data-ai-type="section" data-ai-label={t("sx.editor.tab.steps")}>
      {steps.length ? (
        <ol className="sx-ed-steps__list">
          {steps.map((s, i) => {
            const tone = stepTone(s.status);
            const n = s.order || i + 1;
            const stepLabel = t("sx.editor.steps.step", { n });
            const title = stepName(labels, s) || stepLabel;
            const role = s.role && !s.approvers.length ? roleName(labels, s.role) : "";
            const sub = [title !== stepLabel ? stepLabel : "", role && role !== title ? role : ""].filter(Boolean).join(" · ");
            const by = [s.decidedBy, s.decidedAt ? labels.dateTime(s.decidedAt) : ""].filter(Boolean).join(" · ");
            return (
              <li key={s.id || i} className="sx-ed-steps__item" data-tone={tone}>
                <span className="sx-ed-steps__dot" aria-hidden="true">
                  {glyph(STEP_TONE_ICON[tone], { size: 14 })}
                </span>
                <div className="sx-ed-steps__body">
                  <div className="sx-ed-steps__top">
                    <span className="sx-ed-steps__title">{title}</span>
                    <span className="sx-ed-steps__state" data-tone={tone}>
                      {labels.stepDecision(s.status)}
                    </span>
                  </div>
                  {sub ? <p className="sx-ed-steps__sub">{sub}</p> : null}
                  {by ? <p className="sx-ed-steps__by">{by}</p> : null}
                  {s.comment ? <p className="sx-ed-steps__comment">{s.comment}</p> : null}
                  <StepMeta step={s} code={st.code} onChanged={refresh} />
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="sx-ed-none">
          {glyph(SealCheckIcon, { size: 24 })}
          <p>{submitted ? t("sx.editor.steps.pending") : t("sx.editor.steps.empty")}</p>
        </div>
      )}
    </div>
  );
}
