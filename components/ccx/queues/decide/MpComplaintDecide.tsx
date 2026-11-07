"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError, errDetail, logApiError } from "@/lib/http";
import { fmtUzs } from "@/lib/money";
import { shortDateTime } from "@/lib/date";
import { useSameTickGuard } from "@/lib/useSameTickGuard";
import {
  MP_EVIDENCE_MAX,
  MP_EVIDENCE_TYPES,
  downloadEvidence,
  resolveMpComplaint,
  uploadMpComplaintEvidence,
  type MpComplaint,
  type MpComplaintAction,
  type MpEvidence,
} from "@/lib/services/mpComplaints";
import { CaseBox, Choice, FactStrip, Field, Note, PanelFoot, Section } from "../../panel/bits";
import { IcArrowRight, IcCheck, IcClock, IcCoins, IcDoc, IcFlag, IcScale, IcShield } from "../../icons";
import Party from "./Party";
import { focusFirstError } from "./focus";
import type { DecideProps } from "./types";
import Select from "@/components/Select";

const NOTE_MIN = 5;
const NOTE_MAX = 2000;
const REFUNDS = new Set<MpComplaintAction>(["full_refund", "partial_refund", "valid_refund"]);
const STACK: CSSProperties = { display: "grid", gap: 12, alignContent: "start", minWidth: 0 };
const UP_ROW: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 10 };
const VIS: CSSProperties = { flex: "1 1 200px" };
const RANGE_ROW: CSSProperties = { display: "flex", alignItems: "center", gap: 14 };
const RANGE: CSSProperties = { flex: 1, minWidth: 0, accentColor: "var(--opx-aqua)", cursor: "pointer" };
const PCT: CSSProperties = { color: "var(--opx-aqua)", fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" };
const DOWN: CSSProperties = { transform: "rotate(90deg)" };
const UP: CSSProperties = { transform: "rotate(-90deg)" };

function Stars({ value }: { value: number }) {
  const n = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="opx-stars" role="img" aria-label={`${n}/5`}>
      {"★".repeat(n)}
      <i>{"★".repeat(5 - n)}</i>
    </span>
  );
}

export default function MpComplaintDecide({ job, item: c, onDone, onClose, onDirty }: DecideProps<MpComplaint>) {
  const t = useTranslations("callCenter.mpComplaints");
  const tp = useTranslations("marketplace.orderDetail.pricing");
  const tx = useTranslations("admin.ccx.panel");
  const tc = useTranslations("admin.ccx.cases");
  const none = useTranslations("common")("none");
  const locale = useLocale();
  const once = useSameTickGuard();
  const visId = useId();
  const fileBox = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [action, setAction] = useState<MpComplaintAction | "">("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<MpEvidence[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<"staff" | "parties">("staff");
  const [uploading, setUploading] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ title: string; text: string } | null>(null);

  const st = c.settlement;
  const evidence = [...c.evidence, ...files];
  const money = (n: number | null) => (n === null ? none : `${fmtUzs(n)} ${t("som")}`);
  const label = (group: string, v: string) => (v && t.has(`${group}.${v}`) ? t(`${group}.${v}`) : v ? t("other") : none);
  const options = c.actions.filter((a) => t.has(`action.${a}`) && t.has(`confirm.${a}`));
  const act = action && options.includes(action) ? action : "";
  const danger = act !== "" && REFUNDS.has(act);
  const amountNum = amount ? Number(amount) : undefined;
  const errs = {
    action: act ? "" : t("err.action"),
    amount: act === "partial_refund" && !(amountNum && amountNum > 0 && Number.isInteger(amountNum)) ? t("err.amount") : "",
    note: note.trim().length < NOTE_MIN ? t("err.note", { n: NOTE_MIN }) : "",
  };
  const shown = tried ? errs : { action: "", amount: "", note: "" };
  const price = c.order.price ?? 0;
  const cap = st && st.held !== null && st.held > 0 ? st.held : price > 0 ? price : 0;
  const pct = price > 0 && amountNum ? Math.round((amountNum / price) * 100) : null;

  const pick = (v: string) => {
    if (busy) return;
    const next = options.find((a) => a === v);
    if (!next) return;
    setAction(next);
    onDirty(true);
  };

  const editAmount = (v: string) => {
    setAmount(v.replace(/\D/g, "").replace(/^0+/, "").slice(0, 12));
    onDirty(true);
  };

  const editNote = (v: string) => {
    setNote(v);
    onDirty(true);
  };

  const toggle = (id: string) => {
    setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
    onDirty(true);
  };

  const download = (f: MpEvidence) => {
    void downloadEvidence(f).catch((e: unknown) => logApiError("mpComplaint.download", e));
  };

  const addFiles = async (all: File[]) => {
    if (!all.length || uploading) return;
    const bad = all.find((f) => !(MP_EVIDENCE_TYPES as readonly string[]).includes(f.type) || f.size > MP_EVIDENCE_MAX);
    if (bad) {
      setErr({ title: t("err.fileBad", { name: bad.name }), text: "" });
      return;
    }
    setUploading(true);
    setErr(null);
    onDirty(true);
    try {
      for (const f of all) {
        const ev = await uploadMpComplaintEvidence(c.id, f, visibility);
        if (ev.id) {
          setFiles((x) => [...x, { ...ev, fileName: ev.fileName || f.name }]);
          setPicked((x) => [...x, ev.id]);
        }
      }
    } catch (e) {
      logApiError("mpComplaint.evidence", e);
      setErr({ title: t("err.upload"), text: errDetail(e) });
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (busy || uploading || !once()) return;
    setTried(true);
    if (errs.action || errs.amount || errs.note || !act) {
      focusFirstError(box.current);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await resolveMpComplaint(c.id, { action: act, note, refundAmount: amountNum, evidenceIds: picked });
      onDone(t(`done.${act}`));
    } catch (e) {
      if (e instanceof ApiError && e.code === "marketplace_complaint_already_resolved") {
        onDone(t("alreadyResolved"));
        return;
      }
      logApiError("mpComplaint.resolve", e);
      setErr({ title: t("err.failed"), text: errDetail(e) });
    } finally {
      setBusy(false);
    }
  };

  const left = (
    <div style={STACK}>
      <CaseBox icon={<IcCoins size={18} />} label={t("f.settlement")} title={st ? (tp.has(`settle.${st.status}`) ? tp(`settle.${st.status}`) : t("other")) : none}>
        {st ? <p className="opx-num">{t("amounts", { held: money(st.held), refunded: money(st.refunded), pending: money(st.pendingRefund) })}</p> : null}
      </CaseBox>
      {c.resolution ? (
        <CaseBox icon={<IcScale size={18} />} label={t("f.resolution")} title={label("action", c.resolution)}>
          {c.refundAmount ? <p className="opx-num">{money(c.refundAmount)}</p> : null}
          {c.resolutionNote ? <p>{c.resolutionNote}</p> : null}
        </CaseBox>
      ) : null}
    </div>
  );

  return (
    <>
      <div className="opx-pscroll" ref={box}>
        <div className="opx-pgrid2">
          <Party role={t("f.client")} id={c.client?.id} name={c.client?.name} phone={c.client?.phone} lexgoId={c.client?.lexgoId} empty={tc("notSet")} />
          <Party role={t("f.seller")} id={c.seller?.id} name={c.seller?.name} phone={c.seller?.phone} lexgoId={c.seller?.lexgoId} empty={tc("noSeller")} />
        </div>
        <FactStrip
          facts={[
            ...(c.order.workId && c.order.workId !== job.code ? [{ icon: <IcDoc size={17} />, label: t("f.order"), value: c.order.workId }] : []),
            {
              icon: <IcShield size={17} />,
              label: t("statusFilter"),
              value: c.order.status ? (
                <i className="opx-pill opx-fpill" data-tone="info">
                  {label("orderStatus", c.order.status)}
                </i>
              ) : (
                none
              ),
            },
            { icon: <IcCoins size={17} />, label: tx("amount"), value: money(c.order.price) },
            { icon: <IcClock size={17} />, label: tx("created"), value: c.createdAt ? shortDateTime(c.createdAt, locale) : none },
          ]}
        />
        <CaseBox
          icon={<IcFlag size={18} />}
          label={t("untitled")}
          title={c.title || c.reason || undefined}
          aside={
            c.rating !== null ? (
              <>
                <small>{t("f.rating")}</small>
                <Stars value={c.rating} />
                <b className="opx-num">{`${c.rating}/5`}</b>
              </>
            ) : undefined
          }
        >
          {c.title && c.reason ? <p>{c.reason}</p> : null}
        </CaseBox>
        <Section icon={<IcDoc size={17} />} title={t("evidence")} count={evidence.length}>
          {evidence.length ? (
            <div className="opx-files">
              {evidence.map((f) => (
                <button key={f.id} type="button" className="opx-file" onClick={() => download(f)} title={f.fileName || t("file")}>
                  <IcDoc size={16} />
                  <span>{f.fileName || t("file")}</span>
                  {f.visibility ? <small>{t(`vis.${f.visibility === "parties" ? "parties" : "staff"}`)}</small> : null}
                  <IcArrowRight size={14} style={DOWN} />
                </button>
              ))}
            </div>
          ) : (
            <p className="opx-pnone">{t("noEvidence")}</p>
          )}
        </Section>
        {options.length ? (
          <div className="opx-pcols">
            {left}
            <Section icon={<IcScale size={17} />} title={t("resolveTitle")}>
              <Choice
                label={tc("decision")}
                options={options.map((a) => ({ value: a, label: t(`action.${a}`), hint: t.has(`actionHint.${a}`) ? t(`actionHint.${a}`) : undefined, danger: REFUNDS.has(a), disabled: busy && a !== act }))}
                value={act}
                onChange={pick}
                error={shown.action}
              />
              {act === "partial_refund" ? (
                <>
                  <Field
                    label={t("amount")}
                    value={amount ? fmtUzs(Number(amount)) : ""}
                    onChange={editAmount}
                    required
                    inputMode="numeric"
                    hint={st && st.held !== null ? t("amountHelp", { held: fmtUzs(st.held) }) : undefined}
                    error={shown.amount}
                    readOnly={busy}
                  />
                  {cap > 0 ? (
                    <div style={RANGE_ROW}>
                      <input
                        type="range"
                        min={0}
                        max={cap}
                        step={cap >= 10000 ? 1000 : 1}
                        value={Math.min(amountNum ?? 0, cap)}
                        onChange={(e) => editAmount(e.currentTarget.value)}
                        disabled={busy}
                        aria-label={t("amount")}
                        style={RANGE}
                      />
                      {pct !== null ? (
                        <b className="opx-num" style={PCT}>
                          {tc("share", { pct })}
                        </b>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
              <Field label={t("note")} value={note} onChange={editNote} max={NOTE_MAX} required multiline rows={4} hint={t("noteHelp")} error={shown.note} readOnly={busy} />
              <fieldset className="opx-choice">
                <legend>{tc("attach")}</legend>
                {evidence.length ? (
                  <div className="opx-files">
                    {evidence.map((f) => {
                      const on = picked.includes(f.id);
                      return (
                        <button key={f.id} type="button" className={`opx-file${on ? " is-picked" : ""}`} aria-pressed={on} onClick={() => toggle(f.id)} disabled={busy}>
                          {on ? <IcCheck size={16} /> : <IcDoc size={16} />}
                          <span>{f.fileName || t("file")}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="opx-pnone">{t("noEvidence")}</p>
                )}
                <div style={UP_ROW}>
                  <div className="opx-field opx-qsel" style={VIS}>
                    <label id={visId}>{t("visibility")}</label>
                    <Select value={visibility} labelId={visId} disabled={uploading || busy} onChange={(v) => setVisibility(v === "parties" ? "parties" : "staff")} options={[{ value: "staff", label: t("vis.staff") }, { value: "parties", label: t("vis.parties") }]} />
                  </div>
                  <button type="button" className="opx-pbtn" onClick={() => fileBox.current?.click()} disabled={uploading || busy} aria-busy={uploading}>
                    <IcArrowRight size={16} style={UP} />
                    {uploading ? t("uploading") : t("addFile")}
                  </button>
                  <input
                    ref={fileBox}
                    type="file"
                    hidden
                    multiple
                    accept={MP_EVIDENCE_TYPES.join(",")}
                    onChange={(e) => {
                      const input = e.currentTarget;
                      const list = input.files ? Array.from(input.files) : [];
                      input.value = "";
                      void addFiles(list);
                    }}
                  />
                </div>
                <p className="opx-choice__hint">{t("fileHint")}</p>
              </fieldset>
              {danger ? <Note tone="warn">{t("refundNote")}</Note> : null}
              {err ? (
                <Note tone="bad">
                  <b>{err.title}</b>
                  {err.text ? (
                    <>
                      <br />
                      {err.text}
                    </>
                  ) : null}
                </Note>
              ) : null}
            </Section>
          </div>
        ) : (
          left
        )}
      </div>
      <PanelFoot
        onCancel={onClose}
        cancelLabel={options.length ? undefined : tx("close")}
        primary={options.length ? () => void submit() : undefined}
        primaryLabel={act ? t(`confirm.${act}`) : t("confirmAny")}
        busy={busy}
        disabled={uploading}
        danger={danger}
      />
    </>
  );
}
