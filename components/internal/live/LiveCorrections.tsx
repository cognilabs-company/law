"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import type { SearchOption } from "@/components/SearchSelect";
import { ApiError } from "@/lib/http";
import { subscribeLiveOffice } from "@/lib/liveOfficeSocket";
import { subscribeUserEvents } from "@/lib/userSocket";
import { CORRECTION_DECISIONS, CORRECTION_TYPES, createCorrection, getCorrections, reviewCorrection, type Correction } from "@/lib/services/internalLive";
import { IconCheck, IconFlag, IconPlus } from "@/components/icons";
import { EntitySelect, HrmEmpty, HrmError, HrmLoading, HrmPanel, HrmStatus, useHrmFormat } from "@/components/internal/HrmUi";
import type { CorrectionTarget } from "./LiveEmployeeDrawer";
import { apiMessage, useLiveText } from "./bits";

const isCorrectionEvent = (name: string) => /correction/.test(name);

// Correction requests (§14): an employee asks to fix a wrong activity,
// department, room or attendance; an admin or head reviews it. Both lists
// follow internal.correction.created / .reviewed as they happen.
export default function LiveCorrections({
  unitName,
  roomName,
  canReview,
  onNew,
}: {
  unitName: (id: string) => string;
  roomName: (id: string) => string;
  canReview: boolean;
  onNew: () => void;
}) {
  const { t, correctionType } = useLiveText();
  const f = useHrmFormat();
  const [view, setView] = useState<"mine" | "review">("mine");
  const [state, setState] = useState<{ key: string; rows: Correction[]; err: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [reviewing, setReviewing] = useState<Correction | null>(null);
  const [noReview, setNoReview] = useState(false);
  const key = `${view}|${tick}`;

  useEffect(() => {
    const c = new AbortController();
    getCorrections(view === "mine" ? { mine: true } : { status: "pending" }, c.signal)
      .then((rows) => !c.signal.aborted && setState({ key, rows, err: "" }))
      .catch((e) => {
        if (c.signal.aborted) return;
        // No right to review: the tab is simply not offered.
        if (view === "review" && e instanceof ApiError && e.status === 403) setNoReview(true);
        setState({ key, rows: [], err: apiMessage(e, t("errors.load")) });
      });
    return () => c.abort();
  }, [key, view, t]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    const a = subscribeLiveOffice((e) => isCorrectionEvent(e.event) && reload());
    const b = subscribeUserEvents((e) => isCorrectionEvent(e.event) && reload());
    return () => {
      a();
      b();
    };
  }, [reload]);

  const rows = state?.key === key ? state.rows : null;
  const err = state?.key === key ? state.err : "";
  const reviewTab = canReview && !noReview;
  const requested = (c: Correction) =>
    [c.requested.org_unit_id ? `${t("corrections.toUnit")}: ${unitName(String(c.requested.org_unit_id)) || "—"}` : "", c.requested.room_id ? `${t("corrections.toRoom")}: ${roomName(String(c.requested.room_id)) || "—"}` : ""].filter(Boolean).join(" · ");

  return (
    <HrmPanel
      title={t("corrections.title")}
      icon={IconFlag}
      count={rows?.length}
      actions={
        <>
          {reviewTab ? (
            <div className="hrm-tabs lv-seg" role="tablist">
              {(["mine", "review"] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
                  {t(`corrections.${v}`)}
                </button>
              ))}
            </div>
          ) : null}
          <button type="button" className="btn btn--pri btn--sm" onClick={onNew}>
            <IconPlus />
            {t("corrections.new")}
          </button>
        </>
      }
    >
      {err ? <HrmError text={err} onRetry={reload} retryLabel={t("retry")} /> : null}
      {!rows ? (
        <HrmLoading rows={3} />
      ) : rows.length ? (
        <ul className="lv-cor">
          {rows.map((c) => (
            <li key={c.id}>
              <div className="lv-cor__h">
                <span className="lv-ctype">{correctionType(c.type)}</span>
                <b>{c.title || t("corrections.untitled")}</b>
                <HrmStatus value={c.status} />
              </div>
              {c.description ? <p>{c.description}</p> : null}
              {requested(c) ? <small className="lv-cor__req">{requested(c)}</small> : null}
              <small className="lv-cor__meta">{[c.requester, c.createdAt ? f.dateTime(c.createdAt) : ""].filter(Boolean).join(" · ")}</small>
              {c.resolution ? (
                <p className="lv-cor__res">
                  <IconCheck /> {c.resolution}
                  {c.reviewer ? <small> — {c.reviewer}</small> : null}
                </p>
              ) : null}
              {view === "review" && ["pending", "returned", "new"].includes(c.status) ? (
                <button type="button" className="btn btn--line btn--sm" onClick={() => setReviewing(c)}>
                  {t("corrections.review")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <HrmEmpty icon={IconFlag} title={view === "mine" ? t("corrections.emptyMine") : t("corrections.emptyReview")} />
      )}
      <ReviewModal correction={reviewing} onClose={() => setReviewing(null)} onDone={reload} />
    </HrmPanel>
  );
}

function ReviewModal({ correction, onClose, onDone }: { correction: Correction | null; onClose: () => void; onDone: () => void }) {
  const { t, decision: decisionName } = useLiveText();
  const [decision, setDecision] = useState("approved");
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!correction) return null;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resolution.trim() || busy || !correction) return;
    setBusy(true);
    setErr("");
    try {
      await reviewCorrection(correction.id, decision, resolution.trim());
      setResolution("");
      onDone();
      onClose();
    } catch (cause) {
      setErr(apiMessage(cause, t("errors.save")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={() => !busy && onClose()} title={t("corrections.reviewTitle")}>
      <form className="hrm-form" onSubmit={submit}>
        <p className="hrm-form__note">
          <b>{correction.title}</b>
          {correction.description ? ` — ${correction.description}` : ""}
        </p>
        <label className="lv-field">
          <span>{t("corrections.decision")}</span>
          <Select value={decision} onChange={setDecision} options={CORRECTION_DECISIONS.map((d) => ({ value: d, label: decisionName(d) }))} ariaLabel={t("corrections.decision")} />
        </label>
        <label className="lv-field">
          <span>
            {t("corrections.resolution")} <i className="lv-req">*</i>
          </span>
          <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} maxLength={1000} required placeholder={t("corrections.resolutionPh")} />
        </label>
        {err ? <HrmError text={err} /> : null}
        <div className="hrm-form__foot">
          <button className="btn btn--pri btn--sm" type="submit" disabled={busy || !resolution.trim()}>
            <IconCheck />
            {busy ? t("saving") : t("corrections.submitReview")}
          </button>
          <button className="btn btn--line btn--sm" type="button" onClick={onClose}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// A new correction request. Opened from a timeline item (the activity is the
// target) or from the tab itself (the person's own record is the target).
export function CorrectionForm({
  target,
  onClose,
  onSent,
  unitOptions,
  roomOptions,
}: {
  target: CorrectionTarget | null;
  onClose: () => void;
  onSent: () => void;
  unitOptions: SearchOption[];
  roomOptions: SearchOption[];
}) {
  const { t, correctionType } = useLiveText();
  const [type, setType] = useState(target?.type || "department");
  const [title, setTitle] = useState(target?.title ? t("corrections.titleFor", { what: target.title }) : "");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState("");
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  if (!target) return null;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !title.trim() || !description.trim() || !target) return;
    setBusy(true);
    setErr("");
    try {
      const requested: Record<string, string> = {};
      if (unit) requested.org_unit_id = unit;
      if (room) requested.room_id = room;
      await createCorrection({ correction_type: type, target_type: target.targetType, target_id: target.targetId || null, title: title.trim(), description: description.trim(), requested });
      setDone(true);
      onSent();
    } catch (cause) {
      setErr(apiMessage(cause, t("errors.save")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={() => !busy && onClose()} title={t("corrections.newTitle")}>
      {done ? (
        <div className="lv-done" role="status">
          <IconCheck />
          <b>{t("corrections.sent")}</b>
          <p>{t("corrections.sentText")}</p>
          <button type="button" className="btn btn--pri btn--sm" onClick={onClose}>
            {t("close")}
          </button>
        </div>
      ) : (
        <form className="hrm-form" onSubmit={submit}>
          {target.title ? (
            <p className="hrm-form__note">
              {t("corrections.about")}: <b>{target.title}</b>
            </p>
          ) : null}
          <label className="lv-field">
            <span>{t("corrections.type")}</span>
            <Select value={type} onChange={setType} options={CORRECTION_TYPES.map((x) => ({ value: x, label: correctionType(x) }))} ariaLabel={t("corrections.type")} />
          </label>
          <label className="lv-field">
            <span>
              {t("corrections.titleLabel")} <i className="lv-req">*</i>
            </span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder={t("corrections.titlePh")} />
          </label>
          <label className="lv-field">
            <span>
              {t("corrections.description")} <i className="lv-req">*</i>
            </span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} required placeholder={t("corrections.descriptionPh")} />
          </label>
          {type === "department" || type === "activity" ? (
            <label className="lv-field">
              <span>{t("corrections.rightUnit")}</span>
              <EntitySelect value={unit} onChange={setUnit} options={unitOptions} placeholder={t("corrections.pickUnit")} ariaLabel={t("corrections.rightUnit")} />
            </label>
          ) : null}
          {type === "room" || type === "activity" ? (
            <label className="lv-field">
              <span>{t("corrections.rightRoom")}</span>
              <EntitySelect value={room} onChange={setRoom} options={roomOptions} placeholder={t("corrections.pickRoom")} ariaLabel={t("corrections.rightRoom")} />
            </label>
          ) : null}
          {err ? <HrmError text={err} /> : null}
          <div className="hrm-form__foot">
            <button className="btn btn--pri btn--sm" type="submit" disabled={busy || !title.trim() || !description.trim()}>
              <IconFlag />
              {busy ? t("saving") : t("corrections.send")}
            </button>
            <button className="btn btn--line btn--sm" type="button" onClick={onClose}>
              {t("cancel")}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
