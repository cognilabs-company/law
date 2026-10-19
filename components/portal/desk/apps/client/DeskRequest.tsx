"use client";

import { useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { docTypeApplies, getRequestedDocumentTypes, type DocPaymentGate, type RequestedDocTypes } from "@/lib/services/backend";
import { fmtUzs } from "@/lib/money";
import { DocChromeContext, type DocRequestView } from "@/components/portal/DocFill";
import { IconAlert, IconArrowRight, IconCard, IconCheck, IconCircleX, IconClock, IconDocSearch, IconDownload, IconEdit, IconExternal, IconFileText, IconHeadset, IconRefresh, IconSparkle } from "@/components/icons";
import { Banner, Btn, Empty, Field, Group, Select, SettingRow, Spinner, Tag, TextArea } from "../../kit/kit";
import FileViewer from "../FileViewer";
import { DeskDocChat, DeskSign } from "./DeskSign";

// A document request's screens around its form, as a desktop window's
// pages: the price to pay, the waits (generating, with an advocate, held
// for payment approval) with "Check status", and the finished file —
// open, download, sign, ask an advocate to check it, talk to them. What
// each does is DocumentRequestPanel's (a skin, see DocRequestView).

export default function DeskRequest({ v }: { v: DocRequestView }) {
  const t = useTranslations("portal.client.documents");
  if (v.fatal) return <Empty icon={<IconAlert />} title={t(v.fatal)} />;
  if (v.stage === "answers") return <>{v.fill}</>;
  return (
    <div className="dxcr">
      {v.stage === "pay" ? <Pay v={v} /> : v.stage === "done" ? <Done v={v} /> : v.stage ? <Wait v={v} /> : null}
      <FileViewer open={!!v.viewer} onClose={v.closeViewer} title={v.viewer?.name || t("fileGeneric")} fetchBlob={v.viewer ? () => Promise.resolve(v.viewer!.blob) : null} fileName={v.viewer?.name || t("fileGeneric")} />
    </div>
  );
}

function Card({ tone, icon, title, sub, badge, children }: { tone: string; icon: ReactNode; title: string; sub?: string; badge?: ReactNode; children?: ReactNode }) {
  return (
    <section className={`dxcr-card is-${tone}`} role="status">
      <span className="dxcr-card__ic" aria-hidden>
        {icon}
      </span>
      <b>{title}</b>
      {sub ? <p>{sub}</p> : null}
      {badge}
      {children}
    </section>
  );
}

function Pay({ v }: { v: DocRequestView }) {
  const t = useTranslations("portal.client.documents");
  return (
    <Card tone="pay" icon={<IconCard />} title={v.req.price ? `${fmtUzs(v.req.price)} ${t("som")}` : t("free")} sub={t("payLead")}>
      <small className="dxcs-lead">{t("downloadPolicy", { n: v.monthDownloads, limit: 3 })}</small>
      <span className="dxcr-acts">
        {v.backToAnswers ? (
          <Btn icon={<IconEdit />} disabled={v.busy} onClick={v.backToAnswers}>
            {t("backToAnswers")}
          </Btn>
        ) : null}
        <Btn icon={<IconRefresh />} disabled={v.busy} onClick={v.refresh}>
          {t("checkStatus")}
        </Btn>
        <Btn kind="primary" icon={<IconCard />} busy={v.busy} onClick={v.pay}>
          {t("pay")}
        </Btn>
      </span>
    </Card>
  );
}

function GateFacts({ gate, telegram }: { gate: DocPaymentGate; telegram: boolean }) {
  const t = useTranslations("portal.client.documents");
  return (
    <>
      {gate.amount ? <b className="dxcr-amt">{`${fmtUzs(gate.amount)} ${gate.currency && gate.currency !== "UZS" ? gate.currency : t("som")}`}</b> : null}
      <span className="dxcw-tags">
        {gate.pageCount ? <Tag>{t("gatePages", { n: gate.pageCount })}</Tag> : null}
        {gate.includedPages ? <Tag>{t("gateIncluded", { n: gate.includedPages })}</Tag> : null}
        {gate.extraPages ? <Tag tone="warn">{t("gateExtra", { n: gate.extraPages })}</Tag> : null}
      </span>
      {telegram ? <Banner tone={gate.telegramSent ? "info" : "warn"}>{gate.telegramSent ? t("gateTelegramOk") : t("gateTelegramFail")}</Banner> : null}
    </>
  );
}

// Generating, with an advocate, held for payment approval, stopped.
function Wait({ v }: { v: DocRequestView }) {
  const t = useTranslations("portal.client.documents");
  const chrome = useContext(DocChromeContext);
  const s = v.stage;
  const live = (label: string, tone = "accent") => (
    <span className={`dxcr-live is-${tone}`}>
      <i aria-hidden />
      {label}
    </span>
  );
  const check = (
    <Btn icon={<IconRefresh />} busy={v.busy} onClick={v.refresh}>
      {t("checkStatus")}
    </Btn>
  );
  const escape = v.req.constructorAction?.available && v.onOpenConstructor ? (
    <Btn icon={<IconEdit />} onClick={v.onOpenConstructor}>
      {t("constructorContinue")}
    </Btn>
  ) : null;
  const stopped = v.pollStopped ? <Banner tone="info">{t("stillPending")}</Banner> : null;
  if (s === "generating")
    return (
      <Card tone="ai" icon={<IconSparkle />} title={t("generatingTitle")} sub={t("generatingSub")} badge={live(t("generatingStatus"))}>
        <span className="dxcr-sheets" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        {stopped}
        {check}
      </Card>
    );
  if (s === "lawyerReview" || s === "claimed")
    return (
      <>
        <Card tone="lawyer" icon={<IconHeadset />} title={t(s === "claimed" ? "claimedTitle" : "lawyerReviewTitle")} sub={t(s === "claimed" ? "claimedSub" : "lawyerReviewSub")} badge={live(t(s === "claimed" ? "claimedStatus" : "lawyerReviewStatus"))}>
          {s === "claimed" && v.req.assignedLawyerName ? <small className="dxcs-lead">{t("assignedLawyer", { name: v.req.assignedLawyerName })}</small> : null}
          {v.req.lawyerRequestBlockReason ? <small className="dxcs-lead">{v.req.lawyerRequestBlockReason}</small> : null}
          {stopped}
          <span className="dxcr-acts">
            {escape}
            {check}
          </span>
        </Card>
        {s === "claimed" ? <DeskDocChat requestId={v.req.id} openRoute={chrome?.openRoute} /> : null}
      </>
    );
  if (s === "payGate")
    return (
      <Card tone="pay" icon={<IconCard />} title={t("gateTitle")} sub={t("gateSub")} badge={live(t("gateStatus"), "warn")}>
        {v.gate ? <GateFacts gate={v.gate} telegram={v.gateKnown} /> : <small className="dxcs-lead">{t("gateNoFacts")}</small>}
        {check}
        <small className="dxcs-lead">{t("gateRefreshHint")}</small>
      </Card>
    );
  if (s === "payCancelled")
    return (
      <Card tone="off" icon={<IconAlert />} title={t("cancelledTitle")} sub={t("cancelledSub")} badge={<Tag>{t("cancelledStatus")}</Tag>}>
        {v.gate && v.gateKnown ? <GateFacts gate={v.gate} telegram={false} /> : null}
        <span className="dxcr-acts">
          {check}
          {v.onRetry ? (
            <Btn kind="primary" onClick={v.onRetry}>
              {t("gateRetry")}
            </Btn>
          ) : null}
        </span>
      </Card>
    );
  return (
    <Card tone="wait" icon={<IconClock />} title={t("pendingTitle")} sub={t("pendingSub")} badge={live(t("pendingStatus"))}>
      {stopped}
      {check}
    </Card>
  );
}

// The finished file, and what can follow it.
function Done({ v }: { v: DocRequestView }) {
  const t = useTranslations("portal.client.documents");
  const chrome = useContext(DocChromeContext);
  const r = v.review;
  return (
    <>
      {v.isStale ? (
        <Banner tone="warn" action={v.onStartNew ? <Btn small onClick={v.onStartNew}>{t("startNew")}</Btn> : undefined}>
          {t("staleNotice")}
        </Banner>
      ) : null}
      <Card tone="ok" icon={<IconCheck />} title={t("ready")} sub={v.req.contractFile?.fileName || t("fileGeneric")}>
        <span className="dxcr-acts">
          <Btn icon={<IconDownload />} busy={v.pdfBusy} onClick={() => v.getFile(true)}>
            {t("download")}
          </Btn>
          <Btn kind="primary" icon={<IconExternal />} disabled={v.pdfBusy} onClick={() => v.getFile(false)}>
            {t("open")}
          </Btn>
        </span>
        <small className="dxcs-lead">{t("keptInCabinet")}</small>
        {v.onStartNew && !v.isStale ? (
          <Btn kind="plain" onClick={v.onStartNew}>
            {t("startNew")}
          </Btn>
        ) : null}
      </Card>
      {v.req.contractId ? <DeskSign contractId={v.req.contractId} /> : null}
      <Group title={t("reviewOpen")}>
        {r.refused ? (
          <SettingRow icon={<IconHeadset />} title={r.refused} />
        ) : r.sent && r.gate && r.outcome ? (
          <SettingRow icon={r.outcome === "pooled" ? <IconCheck /> : <IconCircleX />} title={r.outcome === "pooled" ? t("gatePooled") : t("cancelledTitle")} desc={r.outcome === "pooled" ? t("gatePooledSub") : t("cancelledSub")} />
        ) : r.sent && r.gate ? (
          <div className="dxcz-id">
            <b>{t("gateTitle")}</b>
            <small className="dxcs-lead">{t("gateSub")}</small>
            <GateFacts gate={r.gate} telegram />
            <span>
              <Btn small icon={<IconRefresh />} busy={v.busy} onClick={v.refresh}>
                {t("checkStatus")}
              </Btn>
            </span>
          </div>
        ) : r.sent ? (
          <SettingRow icon={<IconCheck />} title={t("reviewSent")} />
        ) : r.open ? (
          <div className="dxcz-id">
            <ReviewType value={r.type} onChange={r.setType} />
            <Field label={t("reviewNeedLabel")}>
              <TextArea value={r.need} onChange={r.setNeed} placeholder={t("reviewNeedDefault")} rows={2} />
            </Field>
            <span className="dxcw-tags">
              <Btn kind="primary" icon={<IconHeadset />} busy={r.busy} onClick={r.send}>
                {t("reviewSubmit")}
              </Btn>
              <Btn disabled={r.busy} onClick={() => r.setOpen(false)}>
                {t("reviewCancel")}
              </Btn>
            </span>
          </div>
        ) : (
          <SettingRow icon={<IconHeadset />} title={t("reviewOpen")} desc={v.lawyerHeldNote || undefined}>
            <Btn small disabled={!!v.lawyerHeldNote} onClick={() => r.setOpen(true)}>
              {t("reviewOpen")}
            </Btn>
          </SettingRow>
        )}
      </Group>
      <Group title={t("offerTitle")} footer={t("offerLead")}>
        <SettingRow icon={<IconDocSearch />} title={t("offerReview", { price: fmtUzs(v.offerPrice) })} onClick={() => chrome?.openRoute?.(`/portal/client/doc-analysis?request=${encodeURIComponent(v.req.id)}`)}>
          <IconArrowRight aria-hidden className="dxcr-go" />
        </SettingRow>
        <SettingRow icon={<IconFileText />} title={t("offerHelp", { price: fmtUzs(399000) })} onClick={() => chrome?.openRoute?.("/portal/client/services?q=shablon")}>
          <IconArrowRight aria-hidden className="dxcr-go" />
        </SettingRow>
      </Group>
      <DeskDocChat requestId={v.req.id} openRoute={chrome?.openRoute} />
    </>
  );
}

// Which kind of document the advocate should check (when the backend asks).
function ReviewType({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tt = useTranslations("portal.client.docType");
  const [opts, setOpts] = useState<RequestedDocTypes | null>(null);
  useEffect(() => {
    let alive = true;
    getRequestedDocumentTypes()
      .then((o) => alive && setOpts(o))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (!opts) return <Spinner small />;
  if (!docTypeApplies(opts, "constructor_review") || !opts.items.length) return null;
  return (
    <Field label={tt("label")} hint={opts.optional ? tt("hintOptional") : tt("hint")}>
      <Select value={value} onChange={onChange} ariaLabel={tt("label")} options={[{ value: "", label: tt("none") }, ...opts.items.map((x) => ({ value: x, label: x }))]} />
    </Field>
  );
}
