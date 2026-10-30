"use client";

import "./verifyReview.css";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Notice } from "@/components/admin/AdminBits";
import { SxButton, SxLinkButton } from "@/components/admin/studio/sx/Button";
import { TextArea } from "@/components/admin/studio/sx/form/TextArea";
import { useGuardedField } from "@/components/ui/ContactGuardNote";
import { IconChat, IconCheck, IconCircleX, IconClock, IconFileText, IconLock, IconMinus, IconPaperclip, IconPhone, IconRefresh, IconUser, IconVideo } from "@/components/icons";
import { useRouter } from "@/i18n/navigation";
import { startCall } from "@/lib/services/backend";
import { dateOnly } from "@/lib/date";
import { labelIn } from "@/lib/backendLabel";
import { ApiError, asDict, asStr, errDetail, isAborted, logApiError } from "@/lib/http";
import { canApprove, type CheckItem, type CheckRows, type CheckVerdict, type DiffRow, type ExperienceEvidence, type ExperienceReviewEntry, type HistoryRow, type ReviewDecision, type ReviewCallKind, type ReviewRoom, type ReviewSeller } from "@/lib/services/experience";
import { staffChatHref } from "./cancellations/model";

// One verification screen for a seller's experience or achievement
// (TSK-100467, TSK-874927, TSK-365169): what changed since the approved
// revision, the backend's dynamic checklist (approve stays shut until every
// item is approved or not applicable), approve / ask for changes / reject
// (the last two need a reason the seller sees), and a protected chat with
// the seller that only the operator closes.

// `field`: the backend field it shows, to mark it when this revision changed it.
export type VerifyFact = { label: string; value: string; field?: string };
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
  // Why no decision can be taken yet (software still checking the files).
  blocked?: string;
  // The record's revisions, oldest first (experience).
  history?: HistoryRow[];
  // revision.changed_fields (final contract §8): facts to highlight.
  changedFields?: string[];
};
export type ReviewInput = { decision: ReviewDecision; reason: string; keys: readonly string[]; rows: CheckRows; publicDescription?: string };
export type VerifySource = {
  kind: "experience" | "achievement" | "license";
  load: (signal: AbortSignal) => Promise<VerifyDetail>;
  review: (input: ReviewInput) => Promise<void>;
  // No room for a record type without review chat (certificates).
  openRoom?: () => Promise<ReviewRoom>;
  closeRoom?: (room: ReviewRoom) => Promise<ReviewRoom>;
  download: (ev: ExperienceEvidence) => Promise<void>;
  fieldLabel: (field: string) => string;
  // Built on every render, so names that load later (categories) show.
  facts: (record: unknown) => VerifyFact[];
  title: string;
  // Extra panels under the facts (the software's risk indicators, …).
  aside?: (detail: VerifyDetail) => ReactNode;
  // Approval needs the text the public profile will show (achievements).
  publicText?: { label: string; hint: string };
  // Status label for one history row.
  historyLabel?: (row: HistoryRow) => string;
};

// Where a refusal belongs: the checklist, the reason, the public text, the
// whole screen (software still checking), or a record someone else decided.
type ErrSpot = "checklist" | "reason" | "public" | "blocked" | "reviewed" | "";
export function reviewErrorSpot(code: string): ErrSpot {
  if (/checklist_incomplete$/.test(code)) return "checklist";
  if (/reason_required$/.test(code)) return "reason";
  if (/public_description_(required|contains_pii)$/.test(code)) return "public";
  if (/ai_analysis_pending$/.test(code)) return "blocked";
  if (/already_reviewed$/.test(code)) return "reviewed";
  return "";
}

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
  const [calling, setCalling] = useState<ReviewCallKind | "">("");
  const router = useRouter();
  const [tick, setTick] = useState(0);
  const [spot, setSpot] = useState<ErrSpot>("");
  const [pub, setPub] = useState("");
  const pubGuard = useGuardedField(pub, setPub, "any");

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
  const needsPublic = !!source.publicText;
  const pubMissing = needsPublic && !pub.trim();
  const approvable = canApprove(keys, rows);
  const blocked = detail?.blocked ?? "";
  const answered = keys.filter((k) => rows[k]?.verdict).length;
  const needsReason = decision === "rejected" || decision === "changes_requested";
  const reasonShort = needsReason && reason.trim().length < REASON_MIN;
  // The backend's own label (§8); a row it sent none for is numbered.
  const label = (c: CheckItem, i: number) => labelIn(c, locale) || t("checkN", { n: i + 1 });

  async function submit() {
    if (busy || sending.current || !detail || !decision || blocked) return;
    if (decision === "approved" && (!approvable || pubMissing || pubGuard.blocked)) return;
    if (reasonShort) return;
    sending.current = true;
    setBusy(true);
    setErr("");
    setSpot("");
    try {
      await source.review({ decision, reason, keys, rows, publicDescription: needsPublic ? pub : undefined });
      setDone(decision);
      onDone?.();
    } catch (e) {
      sending.current = false;
      logApiError(`${source.kind}.review`, e);
      const code = (e instanceof ApiError ? asStr(asDict(e.data.detail).code) || e.code : "") ?? "";
      const at = reviewErrorSpot(code);
      setSpot(at);
      setErr(code && t.has(`err.${code}`) ? t(`err.${code}`) : errDetail(e) || t("failed"));
      // Decided elsewhere or still being checked: show the fresh state.
      if (at === "reviewed" || at === "blocked") setTick((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  // An audio or video call inside LexGo, in the review room, with the
  // advocate (TSK-365169): the call opens in the room's chat.
  async function call(kind: ReviewCallKind) {
    if (!room || room.readOnly || calling) return;
    setCalling(kind);
    setErr("");
    try {
      const sellerId = detail?.seller?.id ?? "";
      const c = await startCall(room.roomId, kind, source.title || "LexGo", sellerId ? { participantUserIds: [sellerId] } : undefined);
      const href = staffChatHref(room.roomId, "", source.title);
      router.push(`${href}${href.includes("?") ? "&" : "?"}join=${encodeURIComponent(c.id)}`);
    } catch (e) {
      logApiError(`${source.kind}.call`, e);
      setErr(errDetail(e) || t("room.callFailed"));
      setCalling("");
    }
  }

  async function roomAction(close: boolean) {
    if (roomBusy || !source.openRoom) return;
    setRoomBusy(true);
    setErr("");
    try {
      setRoom(close && room && source.closeRoom ? await source.closeRoom(room) : await source.openRoom());
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
                <div key={f.label} data-changed={f.field && detail.changedFields?.some((c) => c === f.field || c.startsWith(`${f.field}.`)) ? "" : undefined}>
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

      {source.aside?.(detail)}

      {detail.history && detail.history.length > 1 ? (
        <ol className="vrf__hist" aria-label={t("history")}>
          {detail.history.map((h) => (
            <li key={h.id} data-s={h.status}>
              <b>{t("version", { n: h.version ?? 1 })}</b>
              <span>{source.historyLabel?.(h) ?? ""}</span>
              {h.submittedAt ? <time>{dateOnly(h.submittedAt, locale)}</time> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {source.openRoom ? (
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
          {room && !room.readOnly
            ? room.callTypes.map((k) => (
                <SxButton key={k} size="sm" variant="secondary" busy={calling === k} disabled={!!calling} onClick={() => void call(k)}>
                  {k === "video" ? <IconVideo aria-hidden="true" /> : <IconPhone aria-hidden="true" />}
                  {t(`room.call.${k}`)}
                </SxButton>
              ))
            : null}
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
      ) : null}

      {!pending ? <Notice ok={false} msg={t("notPending")} /> : null}
      {pending && blocked ? (
        <p className="vrf__blocked" role="status">
          <IconClock aria-hidden="true" />
          {blocked}
        </p>
      ) : null}

      <section className="vrf__check" aria-labelledby={`vrf-${source.kind}-ch`} data-bad={spot === "checklist" || undefined}>
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
                {/* A comment for every item (TSK-659111); required in spirit
                    after "No", optional otherwise. */}
                {pending || row?.note ? (
                  <input className="vrf__note" value={row?.note ?? ""} onChange={(e) => set(c.key, { note: e.target.value })} placeholder={row?.verdict === "rejected" ? t("notePh") : t("notePhOptional")} aria-label={t("noteFor", { item: name })} disabled={!pending} maxLength={500} />
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
              {r.reviewer ? (
                <span className="vrf__by">
                  <IconUser aria-hidden="true" />
                  {r.reviewer}
                </span>
              ) : null}
              {r.reason ? <span>{r.reason}</span> : null}
              {r.checklist.some((c) => c.verdict) ? (
                <ul className="vrf__pastitems" aria-label={t("pastItems")}>
                  {r.checklist
                    .filter((c) => c.verdict)
                    .map((c) => {
                      const i = detail.checks.findIndex((x) => x.key === c.key);
                      return (
                        <li key={c.key} data-v={c.verdict}>
                          <b>{i >= 0 ? label(detail.checks[i], i) : t("checkUnknown")}</b>
                          <em>{t.has(`verdict.${c.verdict}`) ? t(`verdict.${c.verdict}`) : t("verdictOther")}</em>
                          {c.note ? <small>{c.note}</small> : null}
                        </li>
                      );
                    })}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      <section className="vrf__decide" aria-label={t("decision.title")}>
        <div className="vrf__dec" role="radiogroup" aria-label={t("decision.title")}>
          {(["approved", "changes_requested", "rejected"] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={decision === d} data-d={d} disabled={!pending || !!blocked || (d === "approved" && !approvable)} onClick={() => setDecision(d)}>
              <b>{t(`decision.${d}`)}</b>
              <small>{d === "approved" && !approvable ? t("approveNeeds") : t(`decisionHint.${d}`)}</small>
            </button>
          ))}
        </div>
        {needsReason ? (
          <label className="vrf__reason">
            <span>{decision === "rejected" ? t("reasonReject") : t("reasonChanges")}</span>
            <TextArea value={reason} onChange={setReason} minRows={3} maxLength={2000} counter invalid={(reasonShort && reason.length > 0) || spot === "reason"} placeholder={t("reasonPh")} />
            {reasonShort ? <small className="vrf__muted">{t("reasonMin", { n: REASON_MIN })}</small> : null}
          </label>
        ) : null}
        {decision === "approved" && source.publicText ? (
          <label className="vrf__reason vrf__public">
            <span>{source.publicText.label}</span>
            <small className="vrf__muted">{source.publicText.hint}</small>
            <TextArea
              value={pub}
              onChange={(v) => pubGuard.change(v)}
              onBlur={pubGuard.blur}
              minRows={3}
              maxLength={1500}
              counter
              invalid={spot === "public" || pubGuard.blocked}
              placeholder={t("publicPh")}
            />
            {pubGuard.note}
          </label>
        ) : null}
        {err ? <Notice ok={false} msg={err} /> : null}
        <div className="vrf__acts">
          <SxButton
            variant={decision === "rejected" ? "danger" : "primary"}
            busy={busy}
            disabled={!pending || !!blocked || !decision || (decision === "approved" && (!approvable || pubMissing || pubGuard.blocked)) || reasonShort}
            onClick={() => void submit()}
          >
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
