"use client";

import { useEffect, useState } from "react";
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
} from "@/lib/services/backend";
import { ApiError, isConflict } from "@/lib/http";
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
import { IconFileText, IconUser, IconPhone, IconCheck, IconEye, IconDownload, IconUpload, IconAlert } from "@/components/icons";

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

  function onClaimed(id: string) {
    setGone((s) => new Set(s).add(id));
    setReloadKey((k) => k + 1);
    setTab("assigned");
  }

  function openRecord(r: LawyerDocumentRequest) {
    if (POOL_FLOW_STATUSES.has(r.status)) router.push(`${basePath}/${r.id}/editor`);
    else setTarget(r);
  }

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "pool", label: t("tabNewRequests"), count: poolVisible.length },
    { key: "assigned", label: t("tabAssigned"), count: assignedList.length },
    { key: "progress", label: t("tabInProgress"), count: progress.data.length },
    { key: "done", label: t("tabCompleted"), count: done.data.length },
  ];
  const activeRows = tab === "assigned" ? assignedList : tab === "progress" ? progress.data : tab === "done" ? done.data : [];
  const activeStatus = tab === "assigned" ? assigned.status : tab === "progress" ? progress.status : tab === "done" ? done.status : pool.status;

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("title")}</b>
      </div>

      <div className="docb__tabs" role="tablist" style={{ marginBottom: 16 }}>
        {TABS.map((tb) => (
          <button key={tb.key} type="button" role="tab" aria-selected={tab === tb.key} className={tab === tb.key ? "on" : ""} onClick={() => setTab(tb.key)}>
            {tb.label}
            <span className="docb__tabn">{tb.count}</span>
          </button>
        ))}
      </div>

      {tab === "pool" ? (
        pool.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !poolVisible.length ? (
          <EmptyState icon={<IconFileText />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <div className="pcards">
            {poolVisible.map((p) => (
              <PoolCard key={p.id} item={p} ns={ns} tcm={tcm} onClaimed={() => onClaimed(p.id)} onTaken={() => setGone((s) => new Set(s).add(p.id))} />
            ))}
          </div>
        )
      ) : activeStatus === "loading" ? (
        <Skeleton rows={3} />
      ) : !activeRows.length ? (
        <EmptyState icon={<IconFileText />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="pcards">
          {activeRows.map((r) => (
            <button className="pcase pcase--btn" key={r.id} type="button" onClick={() => openRecord(r)}>
              <div className="pcase__h">
                <span className="pcase__client">
                  <IconUser />
                  {r.clientName || r.title || t("title")}
                </span>
                <span className="advmuted">{statusLabel(tcm, r.status || r.request.status)}</span>
              </div>
              {r.need ? <p>{r.need}</p> : null}
              {r.createdAt ? <small>{shortDateTime(r.createdAt, locale)}</small> : null}
            </button>
          ))}
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
  onClaimed: () => void;
  onTaken: () => void;
}) {
  const t = useTranslations(ns);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"" | "claimed" | "taken">("");
  const [err, setErr] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function claim() {
    if (busy || done) return;
    setBusy(true);
    setErr(false);
    try {
      await claimDocumentRequest(item.claimUrl);
      setDone("claimed");
      onClaimed();
    } catch (e) {
      if (isConflict(e)) {
        setDone("taken");
        onTaken();
      } else {
        setErr(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pcase">
      <div className="pcase__h">
        <span className="pcase__client">
          <IconUser />
          {item.clientName || item.title || t("title")}
        </span>
      </div>
      {item.serviceName ? <small>{item.serviceName}</small> : null}
      {item.need ? <p className={`pcase__q${expanded ? " on" : ""}`}>{item.need}</p> : null}
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
          <button className="btn btn--grad btn--sm" type="button" onClick={claim} disabled={busy}>
            {busy ? t("claiming") : t("claim")}
          </button>
          {err ? <span className="pcase__err" role="alert">{t("claimError")}</span> : null}
        </div>
      )}
    </div>
  );
}

type FulfillResult = Awaited<ReturnType<typeof fulfillLawyerDocumentRequestFile>>;

function FulfillModal({
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
      setNote({ ok: false, msg: e instanceof ApiError && e.detail ? e.detail : t("fulfillError") });
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
                    <span>{humanizeSlug(k)}</span>
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
