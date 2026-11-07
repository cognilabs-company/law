"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { listUrgentCandidates, type UrgentCandidate, type UrgentRequest } from "@/lib/services/backend";
import { logApiError } from "@/lib/http";
import { statusLabel, statusSpecOf } from "@/lib/labels";
import { useUrgentStatuses } from "@/components/admin/UrgentAdvocateQueue";
import { IconAlert, IconUsers } from "@/components/icons";
import { Choice, Field, Loading } from "../panel/bits";
import { IcCheck, IcClose } from "../icons";
import { CAND_PAGE, MIN_REASON, MIN_SUMMARY, statusOf } from "./model";
import { CandRow, StepError, StepFoot, useReportDirty } from "./kit";
import { px } from "./parts";

export function StatusStep({
  req,
  choices,
  busy,
  onBack,
  onDirty,
  onMove,
}: {
  req: UrgentRequest;
  choices: string[];
  busy: boolean;
  onBack: () => void;
  onDirty: (dirty: boolean) => void;
  onMove: (status: string, note: string) => void;
}) {
  const t = useTranslations("admin.urgent");
  const tcm = useTranslations("portal.common");
  const urg = useUrgentStatuses();
  const urgLabel = (s: string) => statusSpecOf(urg, s, statusLabel(tcm, s))?.label ?? "";
  const [next, setNext] = useState("");
  const [note, setNote] = useState("");
  const sel = choices.includes(next) ? next : "";
  const withNote = !!sel && sel !== "claimed";
  useReportDirty(!!sel || !!note.trim(), onDirty);

  const submit = () => {
    if (!sel || busy) return;
    onMove(sel, withNote ? note.trim() : "");
  };

  return (
    <>
      <div className="opx-pscroll" data-ai-private>
        <p className="opx-ug-lead">{t("statusNow", { status: urgLabel(statusOf(req)) })}</p>
        <Choice label={t("statusPick")} options={choices.map((s) => ({ value: s, label: urgLabel(s) }))} value={sel} onChange={setNext} />
        {withNote ? <Field label={t("statusNotePh")} value={note} onChange={setNote} max={500} multiline rows={2} /> : null}
      </div>
      <StepFoot onBack={onBack} backLabel={t("back")} primary={submit} label={t("statusSave")} busy={busy} busyLabel={tcm("processingShort")} disabled={!sel} />
    </>
  );
}

export function CompleteStep({ busy, onBack, onDirty, onSubmit }: { busy: boolean; onBack: () => void; onDirty: (dirty: boolean) => void; onSubmit: (summary: string, nextAction: string) => void }) {
  const t = useTranslations("admin.urgent");
  const tcm = useTranslations("portal.common");
  const [summary, setSummary] = useState("");
  const [next, setNext] = useState("");
  const short = summary.trim().length < MIN_SUMMARY;
  useReportDirty(!!summary.trim() || !!next.trim(), onDirty);

  const submit = () => {
    if (short || busy) return;
    onSubmit(summary.trim(), next.trim());
  };

  return (
    <>
      <div className="opx-pscroll" data-ai-private>
        <Field label={t("summary")} value={summary} onChange={setSummary} multiline rows={4} required placeholder={t("summaryPh")} hint={t("minChars", { n: MIN_SUMMARY })} />
        <Field label={t("nextAction")} value={next} onChange={setNext} placeholder={t("nextActionPh")} />
      </div>
      <StepFoot onBack={onBack} backLabel={t("back")} primary={submit} label={t("completeSubmit")} busy={busy} busyLabel={tcm("processingShort")} disabled={short} icon={<IcCheck size={16} />} />
    </>
  );
}

export function CancelStep({ busy, onBack, onDirty, onSubmit }: { busy: boolean; onBack: () => void; onDirty: (dirty: boolean) => void; onSubmit: (reason: string) => void }) {
  const t = useTranslations("admin.urgent");
  const tcm = useTranslations("portal.common");
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const short = reason.trim().length < MIN_REASON;
  useReportDirty(!!reason.trim(), onDirty);

  useEffect(() => {
    if (confirm) box.current?.focus({ preventScroll: true });
  }, [confirm]);

  const ask = () => {
    if (short || busy) return;
    setConfirm(true);
  };

  const go = () => {
    if (busy) return;
    onSubmit(reason.trim());
  };

  if (confirm) {
    return (
      <>
        <div className="opx-pscroll" data-ai-private>
          <div className="opx-ug-confirm" ref={box} tabIndex={-1} role="alertdialog" aria-labelledby={`${uid}-ct`} aria-describedby={`${uid}-cd`}>
            <span className="opx-ug-confirm__ic" aria-hidden="true">
              <IconAlert {...px(22)} />
            </span>
            <h3 id={`${uid}-ct`}>{t("cancelConfirmTitle")}</h3>
            <p id={`${uid}-cd`}>{t("cancelConfirmText")}</p>
            <blockquote>{reason.trim()}</blockquote>
          </div>
        </div>
        <StepFoot onBack={() => setConfirm(false)} backLabel={t("back")} primary={go} label={t("cancelYes")} busy={busy} busyLabel={tcm("processingShort")} danger kbd={false} icon={<IcClose size={16} />} />
      </>
    );
  }

  return (
    <>
      <div className="opx-pscroll" data-ai-private>
        <div className="opx-field">
          <label htmlFor={`${uid}-r`}>
            {t("reason")}
            <i aria-hidden="true">*</i>
          </label>
          <input
            id={`${uid}-r`}
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reasonPh")}
            aria-required="true"
            aria-describedby={`${uid}-m`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                ask();
              }
            }}
          />
          <span className="opx-field__meta">
            <small id={`${uid}-m`} className={short ? undefined : "opx-ug-okhint"}>
              {t("minChars", { n: MIN_REASON })}
            </small>
          </span>
        </div>
      </div>
      <StepFoot onBack={onBack} backLabel={t("back")} primary={ask} label={t("cancelRequest")} busy={busy} busyLabel={tcm("processingShort")} disabled={short} danger icon={<IcClose size={16} />} />
    </>
  );
}

export function TransferStep({
  req,
  busy,
  onBack,
  onDirty,
  onSubmit,
}: {
  req: UrgentRequest;
  busy: boolean;
  onBack: () => void;
  onDirty: (dirty: boolean) => void;
  onSubmit: (targetUserId: string, reason: string, name: string) => void;
}) {
  const t = useTranslations("admin.urgent");
  const tcm = useTranslations("portal.common");
  const uid = useId();
  const [list, setList] = useState<UrgentCandidate[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [fail, setFail] = useState<unknown>(undefined);
  const [tries, setTries] = useState(0);
  const [pick, setPick] = useState("");
  const [reason, setReason] = useState("");
  const [shown, setShown] = useState(CAND_PAGE);
  useReportDirty(!!pick || !!reason.trim(), onDirty);

  useEffect(() => {
    let alive = true;
    listUrgentCandidates(req.id, { limit: 50 })
      .then((c) => {
        if (!alive) return;
        setList(c);
        setState("ready");
      })
      .catch((e) => {
        if (!alive) return;
        logApiError("urgent transfer candidates", e);
        setFail(e);
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [req.id, tries]);

  const holder = req.assignedLawyerUserId || req.claimedByUserId;
  const options = useMemo(() => [...list].filter((c) => c.userId !== holder).sort((a, b) => b.score - a.score), [list, holder]);
  const visible = options.slice(0, shown);
  const rest = options.length - visible.length;

  const submit = () => {
    if (!pick || busy) return;
    onSubmit(pick, reason.trim(), list.find((c) => c.userId === pick)?.name ?? "");
  };

  return (
    <>
      <div className="opx-pscroll" data-ai-private>
        <section className="opx-ug-pick" aria-labelledby={`${uid}-l`}>
          <h4 id={`${uid}-l`}>{t("transferPick")}</h4>
          {state === "loading" ? (
            <Loading label={t("transferPick")} />
          ) : state === "error" ? (
            <StepError
              title={t("candidatesError")}
              error={fail}
              onRetry={() => {
                setState("loading");
                setTries((n) => n + 1);
              }}
            />
          ) : !options.length ? (
            <p className="opx-pnone">{t("noAdvocates")}</p>
          ) : (
            <>
              <ul className="opx-ug-cands">
                {visible.map((c) => (
                  <CandRow key={c.userId} c={c} on={pick === c.userId} onToggle={() => setPick(c.userId)} />
                ))}
              </ul>
              {rest > 0 ? (
                <button type="button" className="opx-pbtn opx-ug-sm opx-ug-moreb" onClick={() => setShown((n) => n + CAND_PAGE)}>
                  {t("showMore", { n: rest })}
                </button>
              ) : null}
            </>
          )}
        </section>
        <Field label={t("reason")} value={reason} onChange={setReason} placeholder={t("transferReasonPh")} />
      </div>
      <StepFoot onBack={onBack} backLabel={t("back")} primary={submit} label={t("transferSubmit")} busy={busy} busyLabel={tcm("processingShort")} disabled={!pick} icon={<IconUsers {...px(16)} aria-hidden="true" />} />
    </>
  );
}
