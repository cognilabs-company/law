"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  listMyLawyerDocumentRequests,
  fulfillLawyerDocumentRequestFile,
  getServiceTemplateSourceFile,
  getDocumentRequestPool,
  claimDocumentRequest,
  type LawyerDocumentRequest,
  type DocumentRequestPoolItem,
  type ClaimDocumentRequestResult,
} from "@/lib/services/backend";
import { isConflict, logApiError, errDetail } from "@/lib/http";
import { fetchAndDeliver } from "@/lib/download";
import { useResource } from "@/lib/useResource";
import { humanizeSlug } from "@/lib/lawyers";
import { subscribeUserEvents } from "@/lib/userSocket";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import DocTemplateViewer from "./DocTemplateViewer";
import { statusLabel } from "@/lib/labels";
import { shortDateTime } from "@/lib/date";
import { IconFileText, IconUser, IconPhone, IconCheck, IconClock, IconEye, IconDownload, IconUpload, IconAlert, IconTag, IconLock, IconLayers } from "@/components/icons";
import WorkFilterBar, { inPeriod, useStoredFilters, type Period } from "./WorkFilterBar";
import { matchesSearch } from "@/lib/searchText";

const FLOWS = ["template_lawyer_assisted", "custom_from_scratch", "review_existing_document"] as const;
const LATE_MS = 24 * 3600 * 1000;

type Filterable = { title: string; clientName: string; serviceName: string; need: string; requestedDocumentType: string; createdAt: string; flow?: string };

function useAgo() {
  const tf = useTranslations("portal.workFilters");
  return (iso: string) => {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return tf("ago.now");
    if (m < 60) return tf("ago.minutes", { n: m });
    const h = Math.round(m / 60);
    if (h < 24) return tf("ago.hours", { n: h });
    return tf("ago.days", { n: Math.round(h / 24) });
  };
}

function FlowBadge({ flow }: { flow?: string }) {
  const tf = useTranslations("portal.workFilters");
  if (!flow || !tf.has(`flow.${flow}`)) return null;
  return (
    <span className={`wfb__flow wfb__flow--${flow}`}>
      <IconLayers />
      {tf(`flow.${flow}`)}
    </span>
  );
}

// LEXGO_FRONTEND_WORD_EDITOR_DESIGN_GUIDE.md: 4 tabs instead of two stacked
// sections — "Yangi so'rovlar" is the live pool (unclaimed, realtime);
// "Menga biriktirilgan"/"Jarayonda"/"Yakunlangan" are the same
// /lawyers/me/document-requests list, narrowed by the status filter the
// backend itself documents (?status=claimed|open_pool|completed) rather
// than re-deriving those buckets client-side. A record that went through
// the pool flow (status open_pool/claimed/completed) opens the full-page
// editor workspace (DocumentEditorWorkspace, via basePath); an older
// pre-pool record (no such status — LEXGO_LAWYER_DOCUMENT_FILE_FLOW_FRONTEND.md's
// flow) still opens the original upload-a-file FulfillModal below.
// Not role-gated to "lawyer" on the backend (owner / documents.manage /
// call-center can all see and act), so this same component is mounted under
// both /portal/lawyer and /portal/advocate — see SellerCases.tsx for the
// same ns-prop sharing convention this follows.
const POOL_FLOW_STATUSES = new Set(["open_pool", "claimed", "completed"]);

type Tab = "pool" | "assigned" | "progress" | "done";

export default function DocumentRequestsInbox({ ns, basePath }: { ns: string; basePath: string }) {
  const t = useTranslations(ns);
  const tcm = useTranslations("portal.common");
  const locale = useLocale();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("pool");
  const [target, setTarget] = useState<LawyerDocumentRequest | null>(null);

  const [poolReloadKey, setPoolReloadKey] = useState(0);
  const pool = useResource<DocumentRequestPoolItem>(getDocumentRequestPool, [poolReloadKey]);
  // Claimed (by us or by someone else, via 409) cards are hidden right away
  // rather than waiting on the next poolReloadKey fetch to land.
  const [gone, setGone] = useState<Set<string>>(new Set());
  const poolVisible = pool.data.filter((p) => !gone.has(p.id));

  const [reloadKey, setReloadKey] = useState(0);
  const assigned = useResource<LawyerDocumentRequest>(() => listMyLawyerDocumentRequests(), [reloadKey]);
  const progress = useResource<LawyerDocumentRequest>(() => listMyLawyerDocumentRequests("claimed"), [reloadKey]);
  const done = useResource<LawyerDocumentRequest>(() => listMyLawyerDocumentRequests("completed"), [reloadKey]);
  // "Menga biriktirilgan" is everything ever assigned to this account — the
  // unfiltered list minus still-open pool items (those belong only in the
  // dedicated pool tab, with its own working claim button; an unclaimed
  // item has no editorUrl/fulfillFileUrl for a click here to do anything
  // with).
  const assignedList = assigned.data.filter((r) => r.status !== "open_pool");

  const tf = useTranslations("portal.workFilters");
  const [f, setF, resetF] = useStoredFilters("docreq", { q: "", flow: "", docType: "", period: "", sort: "new" });
  const pass = (r: Filterable, skipFlow = false) => {
    if (!skipFlow && f.flow && r.flow !== f.flow) return false;
    if (f.docType && (r.requestedDocumentType || "").trim() !== f.docType) return false;
    if (!inPeriod(r.createdAt, f.period as Period)) return false;
    if (f.q.trim() && !matchesSearch([r.title, r.clientName, r.serviceName, r.need, r.requestedDocumentType].join(" "), f.q)) return false;
    return true;
  };
  const order = <T extends Filterable>(rows: T[]) => {
    const made = (r: T) => Date.parse(r.createdAt) || 0;
    return [...rows].sort((a, b) => (f.sort === "old" ? made(a) - made(b) : made(b) - made(a)));
  };

  // Realtime — no polling: another advocate claiming a pooled request, or a
  // new one landing, refreshes the pool tab the instant it happens.
  useEffect(() => {
    return subscribeUserEvents((e) => {
      if (e.event === "document_request.pool_created" || e.event === "document_request.claimed" || e.event === "document_request.pool_removed") {
        setPoolReloadKey((k) => k + 1);
      }
      if (e.event === "document_request.claimed" || e.event === "document_request.completed") {
        setReloadKey((k) => k + 1);
      }
    });
  }, []);

  // "Ishni olish" → "Advokat workspace ochiladi": claiming is step 3 of a
  // four-step flow that ends in the editor, so it goes straight there rather
  // than dropping the advocate back on a list to find the case again. The
  // claim response carries the record id (or it is recovered from the claim
  // URL) so this works even when the pool item's own id is not the record's.
  function onClaimed(id: string, result: ClaimDocumentRequestResult) {
    setGone((s) => new Set(s).add(id));
    setReloadKey((k) => k + 1);
    setTab("assigned");
    router.push(`${basePath}/${result.recordId || id}/editor`);
  }

  function openRecord(r: LawyerDocumentRequest) {
    if (!POOL_FLOW_STATUSES.has(r.status)) {
      setTarget(r);
      return;
    }
    // "can_open_editor=false bo'lsa editor button disabled bo'lsin" — the row
    // is inert rather than walking the advocate into a 409.
    if (!r.canOpenEditor && r.status !== "completed") return;
    router.push(`${basePath}/${r.id}/editor`);
  }

  const poolShown = order(poolVisible.filter((r) => pass(r)));
  const assignedShown = order(assignedList.filter((r) => pass(r)));
  const progressShown = order(progress.data.filter((r) => pass(r)));
  const doneShown = order(done.data.filter((r) => pass(r)));
  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "pool", label: t("tabNewRequests"), count: poolShown.length },
    { key: "assigned", label: t("tabAssigned"), count: assignedShown.length },
    { key: "progress", label: t("tabInProgress"), count: progressShown.length },
    { key: "done", label: t("tabCompleted"), count: doneShown.length },
  ];
  const activeRows = tab === "assigned" ? assignedShown : tab === "progress" ? progressShown : tab === "done" ? doneShown : [];
  const activeStatus = tab === "assigned" ? assigned.status : tab === "progress" ? progress.status : tab === "done" ? done.status : pool.status;
  const tabSource: Filterable[] = tab === "pool" ? poolVisible : tab === "assigned" ? assignedList : tab === "progress" ? progress.data : done.data;
  const tabTotal = tabSource.length;
  const flowCount = (fl: string) => tabSource.filter((r) => pass(r, true) && (!fl || r.flow === fl)).length;
  const docTypes = useMemo(() => {
    const all = [...pool.data, ...assigned.data].map((r) => (r.requestedDocumentType || "").trim()).filter(Boolean);
    return Array.from(new Set(all)).sort((a, b) => a.localeCompare(b));
  }, [pool.data, assigned.data]);
  const activeCount = [f.flow, f.docType, f.period].filter(Boolean).length;
  const filteredEmpty = (
    <div className="wfb__empty">
      <EmptyState icon={<IconFileText />} title={tf("emptyFiltered")} text={tf("emptyFilteredText")} />
      <button type="button" className="btn btn--line btn--sm" onClick={resetF}>{tf("reset")}</button>
    </div>
  );

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
      </div>

      {/* Its own class, not just .docb__tabs: that one is the document
          builder's mobile-only form/document switcher and is display:none
          from 980px up — reusing it hid this whole tab strip on every
          desktop, which is the call-center advocate's actual device. */}
      <div className="docb__tabs dreq__tabs" role="tablist" style={{ marginBottom: 16 }}>
        {TABS.map((tb) => (
          <button key={tb.key} type="button" role="tab" aria-selected={tab === tb.key} className={tab === tb.key ? "on" : ""} onClick={() => setTab(tb.key)}>
            {tb.label}
            <span className="docb__tabn">{tb.count}</span>
          </button>
        ))}
      </div>

      <WorkFilterBar
        q={f.q}
        onQ={(v) => setF({ q: v })}
        placeholder={tf("searchDocs")}
        chips={[
          {
            key: "flow",
            label: tf("flowLabel"),
            value: f.flow,
            onChange: (v) => setF({ flow: v }),
            options: ["", ...FLOWS].map((fl) => ({ value: fl, label: tf(`flow.${fl || "all"}`), count: flowCount(fl) })),
          },
        ]}
        selects={
          docTypes.length
            ? [
                {
                  key: "docType",
                  label: tf("docType"),
                  value: f.docType,
                  onChange: (v) => setF({ docType: v }),
                  options: [{ value: "", label: tf("docTypeAll") }, ...docTypes.map((d) => ({ value: d, label: d }))],
                },
              ]
            : []
        }
        period={f.period as Period}
        onPeriod={(v) => setF({ period: v })}
        sort={f.sort}
        onSort={(v) => setF({ sort: v })}
        sortOptions={["new", "old"].map((o) => ({ value: o, label: tf(`sort.${o}`) }))}
        activeCount={activeCount}
        onReset={resetF}
        resultCount={tab === "pool" ? poolShown.length : activeRows.length}
      />

      {/* A failed fetch must never be dressed up as an empty pool — an
          advocate told "no requests" stops checking, which is the opposite
          of the truth on a 403/500. */}
      {tab === "pool" ? (
        pool.status === "loading" ? (
          <Skeleton rows={3} />
        ) : pool.status === "error" ? (
          <Notice ok={false} msg={t("loadError")} />
        ) : !poolVisible.length ? (
          <EmptyState icon={<IconFileText />} title={t("empty")} text={t("emptyText")} />
        ) : !poolShown.length ? (
          filteredEmpty
        ) : (
          <div className="pcards">
            {poolShown.map((p) => (
              <PoolCard key={p.id} item={p} ns={ns} tcm={tcm} onClaimed={(r) => onClaimed(p.id, r)} onTaken={() => setGone((s) => new Set(s).add(p.id))} />
            ))}
          </div>
        )
      ) : activeStatus === "loading" ? (
        <Skeleton rows={3} />
      ) : activeStatus === "error" ? (
        <Notice ok={false} msg={t("loadError")} />
      ) : !tabTotal ? (
        <EmptyState icon={<IconFileText />} title={t("empty")} text={t("emptyText")} />
      ) : !activeRows.length ? (
        filteredEmpty
      ) : (
        <div className="pcards">
          {activeRows.map((r) => {
            const locked = POOL_FLOW_STATUSES.has(r.status) && !r.canOpenEditor && r.status !== "completed";
            return (
              <button
                className={`pcase pcase--btn${locked ? " pcase--locked" : ""}`}
                key={r.id}
                type="button"
                onClick={() => openRecord(r)}
                disabled={locked}
                aria-disabled={locked}
              >
                <div className="pcase__h">
                  <b className="pcase__ttl">{r.title || r.clientName || t("title")}</b>
                  <span className="advmuted">{statusLabel(tcm, r.status || r.request.status, "docStatus")}</span>
                </div>
                {r.clientName ? (
                  <small>
                    <IconUser />
                    {r.clientName}
                  </small>
                ) : null}
                <FlowBadge flow={r.flow} />
                {/* What the client asked for, in their own words when they
                    wrote their own — the backend says which it was. */}
                {r.requestedDocumentType ? (
                  <span className={`dtag${r.requestedDocumentTypeIsCustom ? " dtag--own" : ""}`}>
                    <IconTag />
                    {r.requestedDocumentType}
                  </span>
                ) : null}
                {r.need ? <p>{r.need}</p> : null}
                {r.createdAt ? <small>{shortDateTime(r.createdAt, locale)}</small> : null}
                {/* §15 L600 "can_open_editor=false bo'lsa ... editor_block_reason
                    ko'rsatsin". The row was already inert, but the only
                    explanation was a `title` tooltip — invisible on touch,
                    invisible to anyone who does not hover a button that
                    looks dead anyway, and gone entirely for a disabled
                    control in some browsers. The reason is a real line in
                    the card now. A claimable row says so ("take the case
                    first"); anything else is a block this account cannot
                    lift. The backend's own editor_block_reason is not on
                    the LIST payload that backend.ts normalises, so the
                    per-record wording is shown in the workspace instead —
                    see DocumentEditorWorkspace's block panel. */}
                {locked ? (
                  <span className="pcase__lock">
                    <IconLock />
                    {r.canClaim ? t("needClaimLead") : t("editorBlockedCard")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <FulfillModal ns={ns} target={target} onClose={() => setTarget(null)} onDone={() => setReloadKey((k) => k + 1)} />
    </div>
  );
}

// One open-pool card: a claim button that turns into a taken/claimed badge,
// same accept/decline/taken shape as OrderActions.tsx elsewhere in the
// portal (.pcase__act/.pcase__done/.pcase__err) — not a bespoke look. The
// need text starts clamped to ~2 lines ("2-3 qator preview") with a
// "Batafsil" toggle to read the rest, same pattern .pcase__q already uses.
function PoolCard({
  item,
  ns,
  tcm,
  onClaimed,
  onTaken,
}: {
  item: DocumentRequestPoolItem;
  ns: string;
  tcm: ReturnType<typeof useTranslations>;
  onClaimed: (result: ClaimDocumentRequestResult) => void;
  onTaken: () => void;
}) {
  const t = useTranslations(ns);
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"" | "claimed" | "taken">("");
  const [err, setErr] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ago = useAgo();
  const tfw = useTranslations("portal.workFilters");
  const [now] = useState(() => Date.now());
  const late = item.status === "open_pool" && !!item.createdAt && now - Date.parse(item.createdAt) > LATE_MS;

  async function claim() {
    if (busy || done) return;
    setBusy(true);
    setErr(false);
    try {
      const result = await claimDocumentRequest(item.claimUrl);
      setDone("claimed");
      onClaimed(result);
    } catch (e) {
      if (isConflict(e)) {
        setDone("taken");
        onTaken();
      } else {
        logApiError("document-request claim", e);
        setErr(true);
      }
    } finally {
      setBusy(false);
    }
  }

  // The card's documented rows, in the documented order: document name,
  // client, service, a 2-3 line preview of the request, created time, status.
  return (
    <div className={`pcase${late ? " pcase--late" : ""}`}>
      <div className="pcase__h">
        <b className="pcase__ttl">{item.title || t("title")}</b>
        <span className="st st--new">{item.status === "open_pool" ? t("statusNew") : statusLabel(tcm, item.status, "docStatus")}</span>
      </div>
      {item.clientName ? (
        <small>
          <IconUser />
          {item.clientName}
        </small>
      ) : null}
      {item.serviceName ? (
        <small>
          <span className="advmuted">{t("serviceLabel")}:</span> {item.serviceName}
        </small>
      ) : null}
      <FlowBadge flow={item.flow} />
      {item.requestedDocumentType ? (
        <span className={`dtag${item.requestedDocumentTypeIsCustom ? " dtag--own" : ""}`}>
          <IconTag />
          {item.requestedDocumentType}
        </span>
      ) : null}
      {item.need ? <p className={`pcase__q${expanded ? " on" : ""}`}>{item.need}</p> : null}
      {item.createdAt ? (
        <small className={late ? "pcase__wait" : undefined} title={shortDateTime(item.createdAt, locale)}>
          <IconClock />
          {late ? tfw("waitingSince", { ago: ago(item.createdAt) }) : `${ago(item.createdAt)} · ${shortDateTime(item.createdAt, locale)}`}
        </small>
      ) : null}
      {done === "claimed" ? (
        <span className="pcase__done pcase__done--accept">
          <IconCheck />
          {t("claimedOk")}
        </span>
      ) : done === "taken" ? (
        <span className="pcase__done pcase__done--taken">
          <IconAlert />
          {t("claimedByOther")}
        </span>
      ) : (
        <div className="pcase__act">
          {item.need ? (
            <button type="button" className="btn btn--line btn--sm" onClick={() => setExpanded((v) => !v)}>
              {tcm("details")}
            </button>
          ) : null}
          {/* "can_claim=true bo'lsa Ishni olish button active bo'lsin" */}
          <button className="btn btn--grad btn--sm" type="button" onClick={claim} disabled={busy || !item.canClaim}>
            {busy ? t("claiming") : t("claim")}
          </button>
          {err ? <span className="pcase__err" role="alert">{t("claimError")}</span> : null}
        </div>
      )}
    </div>
  );
}

type FulfillResult = Awaited<ReturnType<typeof fulfillLawyerDocumentRequestFile>>;

// Exported for DocumentEditorWorkspace: §14's first start option ("Advokat
// o'zi file upload qiladi") is this exact dialogue, and the workspace opens
// the one that already exists rather than growing a second DOCX-upload form
// that would have to be kept in step with it.
export function FulfillModal({
  ns,
  target,
  onClose,
  onDone,
}: {
  ns: string;
  target: LawyerDocumentRequest | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations(ns);
  const tf = useTranslations("portal.client.documents.fields");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [done, setDone] = useState<FulfillResult | null>(null);
  const [dlBusy, setDlBusy] = useState(false);
  // Which file the inline-preview modal is showing, if any — the template
  // (client's blank clean-source-file) or the advocate's own just-uploaded
  // result. Never a browser tab (see DocTemplateViewer's own comment: a
  // browser can't render DOCX, so opening one in a new tab just flashed a
  // blank tab and silently forced a download instead of showing anything).
  const [preview, setPreview] = useState<"template" | "result" | "">("");

  const [prevId, setPrevId] = useState(target?.id);
  if (target?.id !== prevId) {
    setPrevId(target?.id);
    setFile(null);
    setNotes("");
    setNote(null);
    setDone(null);
    setPreview("");
  }

  function pickFile(f: File | null) {
    setNote(null);
    if (f && !/\.docx$/i.test(f.name)) {
      setFile(null);
      setNote({ ok: false, msg: t("invalidFileType") });
      return;
    }
    setFile(f);
  }

  // The template is fetched through the authed proxy like every other file
  // in this app (never a plain link) — clean-source-file, already blank in
  // place of {{field}} markers per LEXGO_CLEAN_TEMPLATE_DOWNLOAD_FRONTEND.md,
  // is what template_file.download_url/inline_url already point at.
  async function downloadTemplate() {
    const tpl = target?.templateFile;
    if (!tpl?.hasFile || dlBusy) return;
    setDlBusy(true);
    const ok = await fetchAndDeliver(() => getServiceTemplateSourceFile(tpl.downloadUrl || tpl.inlineUrl), tpl.fileName || "shablon.docx", true);
    if (!ok) setNote({ ok: false, msg: t("templateError") });
    setDlBusy(false);
  }

  async function submit() {
    if (!target || !file || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await fulfillLawyerDocumentRequestFile(target.fulfillFileUrl, file, notes.trim() || undefined);
      setDone(result);
      onDone();
    } catch (e) {
      setNote({ ok: false, msg: errDetail(e) || t("fulfillError") });
    } finally {
      setBusy(false);
    }
  }

  const answerEntries = target ? Object.entries(target.answers).filter(([, v]) => v != null && v !== "") : [];
  const tpl = target?.templateFile;

  return (
    <Modal open={!!target} onClose={onClose} title={target?.clientName || target?.title || t("title")} wide>
      {target ? (
        <div className="cform docassist" style={{ maxWidth: "none" }}>
          {target.clientPhone ? (
            <p className="advmuted" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <IconPhone style={{ width: 14, height: 14 }} />
              {target.clientPhone}
            </p>
          ) : null}

          <section className="docassist__sec">
            <label>{t("need")}</label>
            <p style={{ margin: 0, fontSize: ".92rem" }}>{target.need || "—"}</p>
            {answerEntries.length ? (
              <div className="oquote" style={{ marginTop: 4 }}>
                {answerEntries.map(([k, v]) => (
                  <div className="oquote__row" key={k}>
                    <span>{tf.has(k.toLowerCase()) ? tf(k.toLowerCase()) : humanizeSlug(k)}</span>
                    <b>{String(v)}</b>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="docassist__sec">
            <label>{t("templateLabel")}</label>
            {tpl?.hasFile ? (
              <div className="chiprow" style={{ margin: "4px 0 0" }}>
                <button type="button" className="btn btn--line btn--sm" onClick={() => setPreview("template")}>
                  <IconEye /> {t("viewTemplate")}
                </button>
                <button type="button" className="btn btn--line btn--sm" disabled={dlBusy} onClick={downloadTemplate}>
                  <IconDownload /> {dlBusy ? t("processingShort") : t("downloadTemplate")}
                </button>
              </div>
            ) : (
              <p className="advmuted">{t("noTemplate")}</p>
            )}
          </section>

          {done ? (
            <section className="docassist__sec">
              <p className="cform__ok" style={{ margin: 0 }}>
                <IconCheck style={{ width: 16, height: 16 }} /> {t("fulfilled")}
              </p>
              {done.file ? (
                <button type="button" className="btn btn--line btn--full" style={{ marginTop: 10 }} onClick={() => setPreview("result")}>
                  <IconEye /> {t("viewResult")}
                </button>
              ) : null}
            </section>
          ) : (
            <section className="docassist__sec">
              <label>{t("fileLabel")}</label>
              <FilePicker id="fulfill-file" file={file} onPick={pickFile} placeholder={t("filePlaceholder")} chooseLabel={t("chooseFile")} />
              <label htmlFor="fulfill-notes" style={{ marginTop: 4 }}>{t("notesLabel")}</label>
              <textarea id="fulfill-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
              <button className="btn btn--grad btn--full btn--lg" type="button" onClick={submit} disabled={busy || !file}>
                {busy ? t("processingShort") : t("fulfillSubmit")}
              </button>
            </section>
          )}
        </div>
      ) : null}

      <DocTemplateViewer
        open={preview === "template"}
        onClose={() => setPreview("")}
        title={tpl?.fileName || t("templateLabel")}
        fetchBlob={tpl?.hasFile ? () => getServiceTemplateSourceFile(tpl.downloadUrl || tpl.inlineUrl) : null}
        fileName={tpl?.fileName || "shablon.docx"}
      />
      <DocTemplateViewer
        open={preview === "result"}
        onClose={() => setPreview("")}
        title={done?.file?.fileName || t("viewResult")}
        fetchBlob={done?.file ? () => getServiceTemplateSourceFile(done.file!.inlineUrl || done.file!.downloadUrl) : null}
        fileName={done?.file?.fileName || "hujjat.docx"}
      />
    </Modal>
  );
}

// The native <input type=file> renders per the OS/browser's own locale (a
// Russian-Windows Chrome shows "Обзор…"/"Файл не выбран" — this app has no
// control over that text at all, and no amount of CSS reaches it) — hidden
// and driven by a real button + our own filename text instead, the standard
// way to get a fully themeable file picker.
function FilePicker({
  id,
  file,
  onPick,
  placeholder,
  chooseLabel,
}: {
  id: string;
  file: File | null;
  onPick: (f: File | null) => void;
  placeholder: string;
  chooseLabel: string;
}) {
  return (
    <label htmlFor={id} className="filepick">
      <input id={id} type="file" accept=".docx" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      <span className="filepick__btn">
        <IconUpload />
        {chooseLabel}
      </span>
      <span className={`filepick__name${file ? "" : " advmuted"}`}>{file ? file.name : placeholder}</span>
    </label>
  );
}
