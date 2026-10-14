"use client";

import { useEffect, useState, type FormEvent } from "react";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { useAuth } from "@/lib/auth";
import { logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { STUDIO_PERM_REASSIGN, STUDIO_PERM_WORKFLOW, listApprovalUsers, reassignApprovalStep, type StudioStep } from "@/lib/services/studio";
import { StudioErrorNote } from "./bits";
import { useStudioHuman } from "./human";
import { IconAlert, IconCheck, IconClock, IconHourglass, IconRefresh, IconUsers } from "@/components/icons";

// The two workflow permissions, straight from the session: never guessed
// from a role name or from which page is open (contract §3).
export function useStudioPerms(): { workflow: boolean; reassign: boolean } {
  const { session } = useAuth();
  const p = session?.permissions ?? [];
  return { workflow: p.includes(STUDIO_PERM_WORKFLOW), reassign: p.includes(STUDIO_PERM_REASSIGN) };
}

const pending = (s: StudioStep) => !/approv|done|complete|pass|skip|reject|declin|change|return/.test(s.status);

// What a stage is waiting for: who decides, how many of them it takes (the
// backend's own counters), by when, and who it was handed over to.
export default function StepMeta({ step, code, onChanged }: { step: StudioStep; code: string; onChanged?: () => void }) {
  const { t, when, num } = useStudioHuman();
  const perms = useStudioPerms();
  const [open, setOpen] = useState(false);
  const open_ = pending(step);
  const decided = new Map(step.approvals.map((a) => [a.userId, a]));
  const waiting = step.approvers.filter((p) => !decided.has(p.id));
  const many = step.approvers.length > 1 || step.required > 1;
  if (!step.approvers.length && !step.deadlineAt && !step.reassignments.length) return null;
  return (
    <div className="stu-stepm">
      {step.approvers.length ? (
        <ul className="stu-stepm__who" aria-label={t("appr.approvers")}>
          {step.approvers.map((p) => {
            const a = decided.get(p.id);
            const ok = a && /approv/.test(a.decision);
            return (
              <li key={p.id} className={a ? (ok ? "is-ok" : "is-back") : undefined}>
                {a ? ok ? <IconCheck aria-hidden /> : <IconRefresh aria-hidden /> : <IconHourglass aria-hidden />}
                <span>
                  <b>{p.name || "—"}</b>
                  <small>{a ? [t.has(`appr.decision.${a.decision}`) ? t(`appr.decision.${a.decision}`) : "", when(a.at)].filter(Boolean).join(" · ") : t("appr.waiting")}</small>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="stu-stepm__row">
        {many ? (
          <span className="stu-stepm__chip">
            <IconUsers aria-hidden />
            {t("appr.progress", { done: num(step.approved), need: num(step.required) })}
          </span>
        ) : null}
        {open_ && many && step.remaining > 0 ? <span className="stu-stepm__chip">{t("appr.remaining", { n: num(step.remaining) })}</span> : null}
        {step.deadlineAt ? (
          <span className={`stu-stepm__chip${step.overdue && open_ ? " is-late" : ""}`}>
            {step.overdue && open_ ? <IconAlert aria-hidden /> : <IconClock aria-hidden />}
            {step.overdue && open_ ? `${t("appr.overdue")} · ` : ""}
            {t("appr.deadline", { d: when(step.deadlineAt) })}
          </span>
        ) : null}
        {step.escalatedAt ? <span className="stu-stepm__chip is-late">{t("appr.escalated", { d: when(step.escalatedAt) })}</span> : null}
        {open_ && perms.reassign && waiting.length ? (
          <button type="button" className="stu-olnk" onClick={() => setOpen(true)} data-ai-id="admin.studio.approvals.step.reassign" data-ai-type="button" data-ai-label={t("appr.reassign")}>
            <IconRefresh aria-hidden />
            {t("appr.reassign")}
          </button>
        ) : null}
      </div>
      {step.reassignments.length ? (
        <ul className="stu-stepm__hist" aria-label={t("appr.history")}>
          {step.reassignments.map((r, i) => (
            <li key={i}>
              <b>{t("appr.historyRow", { from: r.from || "—", to: r.to || "—" })}</b>
              <small>{[when(r.at), r.by].filter(Boolean).join(" · ")}</small>
              {r.message ? <q>{r.message}</q> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open ? <Reassign step={step} code={code} from={waiting} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChanged?.(); }} /> : null}
    </div>
  );
}

function Reassign({ step, code, from, onClose, onDone }: { step: StudioStep; code: string; from: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const { t, role } = useStudioHuman();
  const [fromId, setFromId] = useState(from[0]?.id ?? "");
  const [to, setTo] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Anyone already deciding this stage cannot be handed it again.
  const [people, setPeople] = useState<SearchOption[]>([]);
  useEffect(() => {
    const c = new AbortController();
    const taken = new Set(step.approvers.map((p) => p.id));
    listApprovalUsers("", code, c.signal)
      .then((users) => setPeople(users.filter((u) => !taken.has(u.id)).map((u) => ({ value: u.id, label: u.name, sub: [u.employeeCode, u.roles.map(role).join(", ")].filter(Boolean).join(" · ") }))))
      .catch((e: unknown) => {
        if (!c.signal.aborted) logApiError("studio.approvals.reassign.users", e);
      });
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step.id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!fromId || !to[0]) return;
    setBusy(true);
    setError(null);
    try {
      await reassignApprovalStep(step.id, { fromUserId: fromId, toUserId: to[0], message: message.trim() });
      toast(t("appr.reassigned"), { tone: "ok" });
      onDone();
    } catch (err) {
      logApiError("studio.approvals.reassign", err);
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={() => (busy ? undefined : onClose())} title={t("appr.reassignTitle")} aiId="admin.studio.approvals.reassign">
      <form className="stu-sform stu-reasg" onSubmit={submit} noValidate>
        <div className="stu-fld">
          <span className="stu-fld__l">{t("appr.from")}</span>
          <Select value={fromId} onChange={setFromId} options={from.map((p) => ({ value: p.id, label: p.name || "—" }))} ariaLabel={t("appr.from")} />
        </div>
        <div className="stu-fld">
          <span className="stu-fld__l">
            {t("appr.to")}
            <em className="stu-req">*</em>
          </span>
          <SearchSelect single value={to} onChange={setTo} options={people} placeholder={t("appr.pick")} searchPlaceholder={t("settings.routes.approversSearch")} emptyText={t("settings.routes.approversEmpty")} ariaLabel={t("appr.to")} invalid={tried && !to[0]} />
          {tried && !to[0] ? <p className="stu-ferr">{t("fieldErr.required")}</p> : null}
        </div>
        <div className="stu-fld stu-fld--textarea">
          <label className="stu-fld__l" htmlFor="stu-reassign-msg">
            {t("appr.message")}
          </label>
          <textarea id="stu-reassign-msg" rows={3} value={message} onChange={(e) => setMessage(e.target.value.slice(0, 500))} placeholder={t("appr.messagePh")} />
        </div>
        {error ? <StudioErrorNote error={error} compact /> : null}
        <div className="stu-sform__acts">
          <button type="button" className="btn btn--line btn--sm" onClick={onClose} disabled={busy}>
            {t("actions.cancel")}
          </button>
          <button type="submit" className="btn btn--pri btn--sm" disabled={busy} data-ai-id="admin.studio.approvals.reassign.confirm" data-ai-type="button" data-ai-label={t("appr.reassignConfirm")}>
            {busy ? <span className="stu-spin" aria-hidden /> : <IconRefresh aria-hidden />}
            {t("appr.reassignConfirm")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
