"use client";

import "./VerifyDecide.css";
import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useGuardedField } from "@/components/ui/ContactGuardNote";
import { dateOnly } from "@/lib/date";
import { errDetail, isAborted, logApiError } from "@/lib/http";
import { reviewAchievement } from "@/lib/services/achievements";
import { reviewLicense } from "@/lib/services/advocatePractice";
import { canApprove, reviewExperience, type CheckRow, type CheckRows, type ReviewDecision, type ReviewSeller } from "@/lib/services/experience";
import { Choice, FactStrip, Field, Loading, Note, PanelFoot, PartyCard, type ChoiceOpt, type Fact } from "../../panel/bits";
import { IcClock, IcDoc, IcLayers, IcRefresh, IcShield } from "../../icons";
import type { DecideProps } from "./types";
import { AiPanel, Mismatches } from "./VerifyAi";
import VerifyChecklist from "./VerifyChecklist";
import { REASON_MIN, closeReviewRoom, errCodeOf, errSpotOf, kindOfQueue, loadVerifyDetail, openReviewRoom, useCategoryName, type ErrSpot, type VerifyDetail, type VerifyItem } from "./VerifyModel";
import { Changes, PastReviews, RecordCard, Versions } from "./VerifyRecord";
import VerifyRoom from "./VerifyRoom";
import VerifySuspensions from "./VerifySuspensions";

const DECISIONS: readonly ReviewDecision[] = ["approved", "changes_requested", "rejected"];
const PUBLIC_MAX = 1500;
const SELLER_TONE: Partial<Record<string, string>> = { active: "ok", blocked: "hot", suspended: "hot", pending: "warn" };
const STATUS_TONE: Partial<Record<string, string>> = { pending_review: "info", ai_analysis_pending: "info", approved: "ok", changes_requested: "warn", rejected: "hot" };

function SellerTags({ seller }: { seller: ReviewSeller | null }) {
  const t = useTranslations("callCenter.verify.seller");
  if (!seller || (!seller.role && !seller.status)) return null;
  return (
    <span className="opx-vrf-tags">
      {seller.role ? (
        <i className="opx-pill" data-tone="info">
          {t.has(`role.${seller.role}`) ? t(`role.${seller.role}`) : t("role.other")}
        </i>
      ) : null}
      {seller.status ? (
        <i className="opx-pill" data-tone={SELLER_TONE[seller.status] ?? "mute"}>
          {t.has(`status.${seller.status}`) ? t(`status.${seller.status}`) : t("status.other")}
        </i>
      ) : null}
    </span>
  );
}

export default function VerifyDecide(props: DecideProps<VerifyItem>) {
  return <VerifyBody key={`${props.job.queue}:${props.item.id}`} {...props} />;
}

function VerifyBody({ job, item, onDone, onClose, onDirty }: DecideProps<VerifyItem>) {
  const t = useTranslations("callCenter.verify");
  const ts = useTranslations("callCenter.verify.seller");
  const tc = useTranslations("callCenter.experience");
  const tca = useTranslations("callCenter.achievements");
  const tl = useTranslations("callCenter.licenses");
  const tn = useTranslations("admin.ccx.now.f");
  const tpe = useTranslations("portal.experience");
  const tpa = useTranslations("portal.achievements");
  const tpp = useTranslations("portal.practice");
  const locale = useLocale();
  const uid = useId();
  const kind = kindOfQueue(job.queue);
  const id = item.id;
  const catName = useCategoryName(kind !== "license");
  const [st, setSt] = useState<{ detail: VerifyDetail | null; failed: boolean }>({ detail: null, failed: false });
  const [tick, setTick] = useState(0);
  const [rows, setRows] = useState<CheckRows>({});
  const [decision, setDecision] = useState<ReviewDecision | "">("");
  const [reason, setReason] = useState("");
  const [pub, setPub] = useState("");
  const pubGuard = useGuardedField(pub, setPub, "any");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [err, setErr] = useState("");
  const [spot, setSpot] = useState<ErrSpot>("");

  useEffect(() => {
    const ctl = new AbortController();
    void loadVerifyDetail(kind, id, ctl.signal).then(
      (d) => {
        if (!ctl.signal.aborted) setSt({ detail: d, failed: false });
      },
      (e) => {
        if (ctl.signal.aborted || isAborted(e)) return;
        logApiError(`${kind}.detail`, e);
        setSt({ detail: null, failed: true });
      },
    );
    return () => ctl.abort();
  }, [kind, id, tick]);

  const detail = st.detail;
  const keys = detail ? detail.checks.map((c) => c.key) : [];
  const locked = !detail || !detail.pending || detail.blocked;
  const approvable = canApprove(keys, rows);
  const needsPublic = kind === "achievement";
  const pubMissing = needsPublic && !pub.trim();
  const needsReason = decision === "rejected" || decision === "changes_requested";
  const reasonShort = needsReason && reason.trim().length < REASON_MIN;
  const cannot = locked || !decision || (decision === "approved" && (!approvable || pubMissing || pubGuard.blocked)) || reasonShort;

  const setRow = (key: string, patch: Partial<CheckRow>) => {
    setRows((r) => ({ ...r, [key]: { verdict: r[key]?.verdict ?? "", note: r[key]?.note ?? "", ...patch } }));
    onDirty(true);
  };

  const pick = (v: string) => {
    setDecision(DECISIONS.find((d) => d === v) ?? "");
    onDirty(true);
  };

  const patchDetail = (p: Partial<VerifyDetail>) => setSt((s) => (s.detail ? { ...s, detail: { ...s.detail, ...p } } : s));

  const retry = () => {
    setSt({ detail: null, failed: false });
    setTick((n) => n + 1);
  };

  const submit = async () => {
    if (busy || sending.current || !detail || !decision || detail.blocked || !detail.pending) return;
    if (decision === "approved" && (!approvable || pubMissing || pubGuard.blocked)) return;
    if (reasonShort) return;
    sending.current = true;
    setBusy(true);
    setErr("");
    setSpot("");
    try {
      const input = { decision, reason, keys, rows };
      if (kind === "achievement") await reviewAchievement(id, { ...input, publicDescription: pub });
      else if (kind === "license") await reviewLicense(id, input);
      else await reviewExperience(id, input);
      onDone(t(`done.${decision}`));
    } catch (e) {
      sending.current = false;
      logApiError(`${kind}.review`, e);
      const code = errCodeOf(e);
      const at = errSpotOf(code);
      setSpot(at);
      setErr(code && t.has(`err.${code}`) ? t(`err.${code}`) : errDetail(e) || t("failed"));
      if (at === "reviewed" || at === "blocked") setTick((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const seller = detail?.seller ?? item.seller;
  const holder = detail?.lic?.holderName || ("holderName" in item ? item.holderName : "");
  const rec = detail ? (detail.exp ?? detail.ach ?? detail.lic) : null;
  const statusLabel = (s: string) => {
    if (kind === "experience") return tpe.has(`status.${s}`) ? tpe(`status.${s}`) : tpe("status.other");
    if (kind === "achievement") return tpa.has(`status.${s}`) ? tpa(`status.${s}`) : tpa("status.other");
    return tpp.has(`status.${s}`) ? tpp(`status.${s}`) : tpp("status.other");
  };
  const facts: Fact[] = rec
    ? [
        {
          icon: <IcShield size={17} />,
          label: tn("status"),
          value: (
            <span className="opx-pill" data-tone={STATUS_TONE[rec.status] ?? "mute"}>
              {statusLabel(rec.status)}
            </span>
          ),
        },
        { icon: <IcLayers size={17} />, label: tpa("version"), value: `${t("version", { n: rec.version ?? 1 })} · ${detail?.isRevision ? tca("revision") : t("newRecord")}` },
        { icon: <IcClock size={17} />, label: tc("submitted"), value: rec.submittedAt ? dateOnly(rec.submittedAt, locale) : "—" },
        { icon: <IcDoc size={17} />, label: t("field.evidence"), value: String(detail?.evidence.length ?? 0) },
      ]
    : [];
  const options: ChoiceOpt[] = DECISIONS.map((d) => ({
    value: d,
    label: t(`decision.${d}`),
    hint: d === "approved" && !approvable ? t("approveNeeds") : t(`decisionHint.${d}`),
    danger: d === "rejected",
    disabled: locked || (d === "approved" && !approvable),
  }));
  const pubBad = spot === "public" || pubGuard.blocked;

  return (
    <>
      <div className="opx-pscroll opx-vrf" data-ai-target={`callcenter:${kind}-review`}>
        <div className="opx-vrf-top">
          <PartyCard role={ts("title")} name={seller?.name || holder || ts("noName")} phone={seller?.phone || undefined} lexgoId={seller?.lexgoId || undefined} extra={<SellerTags seller={seller} />} />
          {detail ? (
            <VerifyRoom
              room={detail.room}
              title={id}
              sellerId={detail.seller?.id ?? ""}
              pending={detail.pending}
              scope={kind}
              open={() => openReviewRoom(kind, id)}
              close={(r) => closeReviewRoom(kind, id, r)}
              onRoom={(room) => patchDetail({ room })}
            />
          ) : null}
        </div>
        {st.failed ? (
          <div className="opx-vrf-fail">
            <Note tone="bad">{t("loadFailed")}</Note>
            <button type="button" className="opx-pbtn opx-vrf-sm" onClick={retry}>
              <IcRefresh size={15} />
              {t("retry")}
            </button>
          </div>
        ) : !detail ? (
          <Loading label={tc("loading")} />
        ) : (
          <>
            <FactStrip facts={facts} />
            <div className="opx-vrf-cols">
              <div className="opx-vrf-col">
                <RecordCard kind={kind} detail={detail} catName={catName} />
                <Changes kind={kind} detail={detail} catName={catName} />
                {detail.ai ? <AiPanel ai={detail.ai} advisory={detail.advisory} /> : null}
                {kind === "license" ? <Mismatches rows={detail.mismatches} /> : null}
                {kind === "license" && detail.sellerUserId ? <VerifySuspensions sellerUserId={detail.sellerUserId} practice={detail.practice} onPractice={(practice) => patchDetail({ practice })} onDirty={() => onDirty(true)} /> : null}
                <Versions kind={kind} history={detail.history} />
                <PastReviews detail={detail} />
              </div>
              <div className="opx-vrf-col">
                {!detail.pending ? <Note tone="warn">{t("notPending")}</Note> : detail.blocked ? <Note tone="warn">{kind === "license" ? tl("aiPendingBlock") : tca("aiPending")}</Note> : null}
                <VerifyChecklist checks={detail.checks} rows={rows} onSet={setRow} locked={!detail.pending} bad={spot === "checklist"} />
                <section className="opx-psec opx-vrf-dec">
                  <Choice label={t("decision.title")} options={options} value={decision} onChange={pick} />
                  {!locked && !approvable && !decision ? <p className="opx-vrf-muted">{t("approveNeeds")}</p> : null}
                  {needsReason ? (
                    <Field
                      label={decision === "rejected" ? t("reasonReject") : t("reasonChanges")}
                      value={reason}
                      onChange={(v) => {
                        setReason(v);
                        onDirty(true);
                      }}
                      max={2000}
                      multiline
                      rows={4}
                      required
                      placeholder={t("reasonPh")}
                      hint={reasonShort ? t("reasonMin", { n: REASON_MIN }) : undefined}
                      error={spot === "reason" && err ? err : undefined}
                    />
                  ) : null}
                  {decision === "approved" && needsPublic ? (
                    <div className={`opx-field opx-vrf-pub${pubBad ? " has-error" : ""}`}>
                      <label htmlFor={`${uid}-pub`}>
                        {tca("publicLabel")}
                        <i aria-hidden="true">*</i>
                      </label>
                      <small className="opx-vrf-muted" id={`${uid}-pubh`}>
                        {tca("publicHint")}
                      </small>
                      <textarea
                        id={`${uid}-pub`}
                        value={pub}
                        rows={3}
                        maxLength={PUBLIC_MAX}
                        required
                        placeholder={t("publicPh")}
                        aria-invalid={pubBad}
                        aria-describedby={`${uid}-pubh`}
                        onChange={(e) => {
                          pubGuard.change(e.target.value, e);
                          onDirty(true);
                        }}
                        onBlur={pubGuard.blur}
                      />
                      <span className="opx-field__meta">
                        <small />
                        <small className="opx-num">{`${pub.length}/${PUBLIC_MAX}`}</small>
                      </span>
                      {spot === "public" && err ? (
                        <p className="opx-ferr" role="alert">
                          {err}
                        </p>
                      ) : null}
                      {pubGuard.note}
                    </div>
                  ) : null}
                  {err && spot !== "reason" && spot !== "public" ? <Note tone="bad">{err}</Note> : null}
                </section>
              </div>
            </div>
          </>
        )}
      </div>
      <PanelFoot onCancel={onClose} primary={() => void submit()} primaryLabel={decision ? t(`confirm.${decision}`) : t("confirm.none")} busy={busy} disabled={cannot} danger={decision === "rejected"} />
    </>
  );
}
