"use client";

import "./verifyReview.css";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { SxButton, SxLinkButton } from "@/components/admin/studio/sx/Button";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { IconChat, IconCheck, IconCircleX, IconFileText, IconLock, IconMinus, IconPaperclip, IconPhone, IconRefresh, IconUser } from "@/components/icons";
import { dateOnly } from "@/lib/date";
import { errDetail, isAborted, logApiError } from "@/lib/http";
import { canApprove, checkKeyParts, type CheckItem, type CheckRows, type CheckVerdict, type DiffRow, type ExperienceEvidence, type ExperienceReviewEntry, type ReviewDecision, type ReviewRoom, type ReviewSeller } from "@/lib/services/experience";
import { staffChatHref } from "./cancellations/model";

// One verification screen for a seller's experience or achievement
// (TSK-100467, TSK-874927, TSK-365169): what changed since the approved
// revision, the backend's dynamic checklist (approve stays shut until every
// item is approved or not applicable), approve / ask for changes / reject
// (the last two need a reason the seller sees), and a protected chat with
// the seller that only the operator closes.

export type VerifyFact = { label: string; value: string };
export type VerifyDetail = {
  pending: boolean;
  // The loaded record, for `source.facts` to read at render time.
  record: unknown;
  evidence: ExperienceEvidence[];
  diff: DiffRow[];
  isRevision: boolean;
  checks: CheckItem[];
  reviews: ExperienceReviewEntry[];
  room: ReviewRoom | null;
  // Who submitted it (point 6: the operator sees the advocate in full).
  seller: ReviewSeller | null;
};
export type VerifySource = {
  kind: "experience" | "achievement";
  load: (signal: AbortSignal) => Promise<VerifyDetail>;
  review: (input: { decision: ReviewDecision; reason: string; keys: readonly string[]; rows: CheckRows }) => Promise<void>;
  openRoom: () => Promise<ReviewRoom>;
  closeRoom: (room: ReviewRoom) => Promise<ReviewRoom>;
  download: (ev: ExperienceEvidence) => Promise<void>;
  fieldLabel: (field: string) => string;
  // Built on every render, so names that load later (categories) show.
  facts: (record: unknown) => VerifyFact[];
  title: string;
};

const VERDICTS: readonly Exclude<CheckVerdict, "">[] = ["approved", "not_applicable", "rejected"];
const VERDICT_ICON = { approved: IconCheck, not_applicable: IconMinus, rejected: IconCircleX } as const;
const REASON_MIN = 10;

export default function VerifyReview({ source, onDone }: { source: VerifySource; onDone?: () => void }): ReactElement {
  const t = useTranslations("callCenter.verify");
  const locale = useLocale();
  const [detail, setDetail] = useState<VerifyDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [rows, setRows] = useState<CheckRows>({});
  const [decision, setDecision] = useState<ReviewDecision | "">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [done, setDone] = useState<ReviewDecision | "">("");
  const [err, setErr] = useState("");
  const [room, setRoom] = useState<ReviewRoom | null>(null);
  const [roomBusy, setRoomBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    source.load(ctl.signal).then(
      (d) => {
        setDetail(d);
        setRoom(d.room);
        setLoadFailed(false);
      },
      (e) => {
        if (isAborted(e)) return;
        logApiError(`${source.kind}.detail`, e);
        setLoadFailed(true);
      },
    );
    return () => ctl.abort();
    // A new source object per render must not refetch; the id inside it is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.kind, source.title, tick]);

  const keys = detail?.checks.map((c) => c.key) ?? [];
  const set = (k: string, patch: Partial<{ verdict: CheckVerdict; note: string }>) => setRows((r) => ({ ...r, [k]: { verdict: r[k]?.verdict ?? "", note: r[k]?.note ?? "", ...patch } }));
  const approvable = canApprove(keys, rows);
  const answered = keys.filter((k) => rows[k]?.verdict).length;
  const needsReason = decision === "rejected" || decision === "changes_requested";
  const reasonShort = needsReason && reason.trim().length < REASON_MIN;
  const label = (c: CheckItem, i: number) => {
    const given = c.i18n[locale === "uz" ? "uz_latn" : locale] || c.label;
    if (given) return given;
    const { base, n } = checkKeyParts(c.key);
    const own = t.has(`check.${c.key}`) ? t(`check.${c.key}`) : t.has(`check.${base}`) ? t(`check.${base}`) : "";
    if (!own) return t("checkN", { n: i + 1 });
    return n === null ? own : t("checkNth", { label: own, n });
  };

  async function submit() {
    if (busy || sending.current || !detail || !decision) return;
    if (decision === "approved" && !approvable) return;
    if (reasonShort) return;
    sending.current = true;
    setBusy(true);
    setErr("");
    try {
      await source.review({ decision, reason, keys, rows });
      setDone(decision);
      onDone?.();
    } catch (e) {
      sending.current = false;
      logApiError(`${source.kind}.review`, e);
      const code = (e as { code?: string }).code ?? "";
      setErr(code && t.has(`err.${code}`) ? t(`err.${code}`) : errDetail(e) || t("failed"));
    } finally {
      setBusy(false);
    }
  }

  async function roomAction(close: boolean) {
    if (roomBusy) return;
    setRoomBusy(true);
    setErr("");
    try {
      setRoom(close && room ? await source.closeRoom(room) : await source.openRoom());
    } catch (e) {
      logApiError(`${source.kind}.room`, e);
      setErr(errDetail(e) || t("roomFailed"));
    } finally {
      setRoomBusy(false);
    }
  }

  if (done) return <Notice ok msg={t(`done.${done}`)} />;
  if (loadFailed)
    return (
      <div className="vrf__fail">
        <Notice ok={false} msg={t("loadFailed")} />
        <SxButton size="sm" variant="secondary" onClick={() => setTick((n) => n + 1)}>
          <IconRefresh aria-hidden="true" />
          {t("retry")}
        </SxButton>
      </div>
    );
  if (!detail) return <div className="vrf__sk" aria-busy="true" />;
  const pending = detail.pending;
  return (
    <div className="vrf sx" data-ai-target={`callcenter:${source.kind}-review`}>
      {detail.seller ? <SellerCard seller={detail.seller} /> : null}
      <div className="vrf__top">
        <section className="vrf__card" aria-label={t("submitted")}>
          <h4>{t("submitted")}</h4>
          <dl className="vrf__facts">
            {source
              .facts(detail.record)
              .filter((f) => f.value)
              .map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
          </dl>
          {detail.evidence.length ? (
            <span className="vrf__files">
              {detail.evidence.map((f) => (
                <button key={f.id} type="button" className="vrf__file" onClick={() => void source.download(f).catch((e) => logApiError(`${source.kind}.download`, e))}>
                  <IconPaperclip aria-hidden="true" />
                  {f.fileName || t("file")}
                </button>
              ))}
            </span>
          ) : (
            <small className="vrf__muted">{t("noFiles")}</small>
          )}
        </section>

        <section className="vrf__card" aria-label={t("changes")}>
          <h4>
            {t("changes")}
            {detail.isRevision ? <em>{t("nChanged", { n: detail.diff.length })}</em> : <em>{t("newRecord")}</em>}
          </h4>
          {!detail.isRevision ? (
            <p className="vrf__muted">{t("newRecordText")}</p>
          ) : !detail.diff.length ? (
            <p className="vrf__muted">{t("noChanges")}</p>
          ) : (
            <ul className="vrf__diff">
              {detail.diff.map((r) => (
                <li key={r.field} data-kind={r.kind}>
                  <b>{r.label || source.fieldLabel(r.field)}</b>
                  {r.before ? <del>{r.before}</del> : null}
                  {r.after ? <ins>{r.after}</ins> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="vrf__room" data-open={room && !room.readOnly ? "" : undefined}>
        <span className="vrf__roomic" aria-hidden="true">
          {room?.readOnly ? <IconLock /> : <IconChat />}
        </span>
        <span className="vrf__roomm">
          <b>{!room ? t("room.none") : room.readOnly ? t("room.closed") : t("room.open")}</b>
          <small>{!room ? t("room.noneText") : room.readOnly ? t("room.closedText") : t("room.openText")}</small>
        </span>
        <span className="vrf__roomacts">
          {room ? (
            <SxLinkButton size="sm" variant="secondary" href={staffChatHref(room.roomId, "", source.title)}>
              {room.readOnly ? t("room.history") : t("room.go")}
            </SxLinkButton>
          ) : null}
          {!room ? (
            <SxButton size="sm" variant="primary" busy={roomBusy} onClick={() => void roomAction(false)} disabled={!pending}>
              {t("room.start")}
            </SxButton>
          ) : !room.readOnly ? (
            <SxButton size="sm" variant="secondary" busy={roomBusy} onClick={() => void roomAction(true)}>
              {t("room.close")}
            </SxButton>
          ) : null}
        </span>
      </section>

      {!pending ? <Notice ok={false} msg={t("notPending")} /> : null}

      <section className="vrf__check" aria-labelledby={`vrf-${source.kind}-ch`}>
        <h4 id={`vrf-${source.kind}-ch`}>
          {t("checklist")}
          <em>{t("answered", { done: answered, total: keys.length })}</em>
        </h4>
        <ol>
          {detail.checks.map((c, i) => {
            const row = rows[c.key];
            const name = label(c, i);
            return (
              <li key={c.key} data-verdict={row?.verdict || undefined}>
                <div className="vrf__q">
                  <b>{name}</b>
                  {c.hint ? <small>{c.hint}</small> : null}
                </div>
                <div className="vrf__v" role="radiogroup" aria-label={name}>
                  {VERDICTS.map((v) => {
                    const Icon = VERDICT_ICON[v];
                    return (
                      <button key={v} type="button" role="radio" aria-checked={row?.verdict === v} data-v={v} disabled={!pending} onClick={() => set(c.key, { verdict: row?.verdict === v ? "" : v })}>
                        <Icon aria-hidden="true" />
                        {t(`verdict.${v}`)}
                      </button>
                    );
                  })}
                </div>
                {row?.verdict === "rejected" || row?.note ? (
                  <input className="vrf__note" value={row?.note ?? ""} onChange={(e) => set(c.key, { note: e.target.value })} placeholder={t("notePh")} aria-label={t("noteFor", { item: name })} disabled={!pending} maxLength={500} />
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      {detail.reviews.length ? (
        <ol className="vrf__past" aria-label={t("past")}>
          {detail.reviews.map((r) => (
            <li key={r.id || r.reviewedAt}>
              <span className="vrf__chip" data-s={r.decision || "other"}>
                {r.decision ? t(`decision.${r.decision}`) : t("decision.other")}
              </span>
              {r.reviewedAt ? <time>{dateOnly(r.reviewedAt, locale)}</time> : null}
              {r.reason ? <span>{r.reason}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}

      <section className="vrf__decide" aria-label={t("decision.title")}>
        <div className="vrf__dec" role="radiogroup" aria-label={t("decision.title")}>
          {(["approved", "changes_requested", "rejected"] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={decision === d} data-d={d} disabled={!pending || (d === "approved" && !approvable)} onClick={() => setDecision(d)}>
              <b>{t(`decision.${d}`)}</b>
              <small>{d === "approved" && !approvable ? t("approveNeeds") : t(`decisionHint.${d}`)}</small>
            </button>
          ))}
        </div>
        {needsReason ? (
          <label className="vrf__reason">
            <span>{decision === "rejected" ? t("reasonReject") : t("reasonChanges")}</span>
            <TextArea value={reason} onChange={setReason} minRows={3} maxLength={2000} counter invalid={reasonShort && reason.length > 0} placeholder={t("reasonPh")} />
            {reasonShort ? <small className="vrf__muted">{t("reasonMin", { n: REASON_MIN })}</small> : null}
          </label>
        ) : null}
        {err ? <Notice ok={false} msg={err} /> : null}
        <div className="vrf__acts">
          <SxButton variant={decision === "rejected" ? "danger" : "primary"} busy={busy} disabled={!pending || !decision || (decision === "approved" && !approvable) || reasonShort} onClick={() => void submit()}>
            <IconFileText aria-hidden="true" />
            {decision ? t(`confirm.${decision}`) : t("confirm.none")}
          </SxButton>
        </div>
      </section>
    </div>
  );
}

// The advocate under review: name, LexGo ID, role, account state and a
// phone the operator can call right away.
function SellerCard({ seller }: { seller: ReviewSeller }): ReactElement {
  const t = useTranslations("callCenter.verify.seller");
  const initials = seller.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <section className="vrf__seller" aria-label={t("title")}>
      <span className="vrf__sav" aria-hidden="true">
        {initials || <IconUser />}
      </span>
      <span className="vrf__sm">
        <small>{t("title")}</small>
        <b>{seller.name || t("noName")}</b>
        <span className="vrf__stags">
          {seller.role ? <i>{t.has(`role.${seller.role}`) ? t(`role.${seller.role}`) : t("role.other")}</i> : null}
          {seller.lexgoId ? <i className="vrf__code">{seller.lexgoId}</i> : null}
          {seller.status ? <i data-st={seller.status}>{t.has(`status.${seller.status}`) ? t(`status.${seller.status}`) : t("status.other")}</i> : null}
        </span>
      </span>
      {seller.phone ? (
        <a className="vrf__call" href={`tel:${seller.phone.replace(/[^\d+]/g, "")}`}>
          <IconPhone aria-hidden="true" />
          <span dir="ltr">{seller.phone}</span>
        </a>
      ) : null}
    </section>
  );
}
