"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { claimDocumentRequest, fulfillLawyerDocumentRequestFile, getDocumentRequestPool, getServiceTemplateSourceFile, listMyLawyerDocumentRequests, type DocumentRequestPoolItem, type LawyerDocumentRequest } from "@/lib/services/backend";
import { isConflict } from "@/lib/http";
import { fetchAndDeliver } from "@/lib/download";
import { subscribeUserEvents } from "@/lib/userSocket";
import { matchesSearch } from "@/lib/searchText";
import { statusLabel } from "@/lib/labels";
import { shortDateTime } from "@/lib/date";
import { humanizeSlug } from "@/lib/lawyers";
import { IconAlert, IconBriefcase, IconCheck, IconClipboardCheck, IconDownload, IconEdit, IconFileText, IconInbox, IconLayers, IconPaperclip, IconPhone, IconRefresh, IconTag, IconUpload, IconUser } from "@/components/icons";
import { App, Banner, Btn, Empty, Field, Loading, Search, Sidebar, Tag, TextArea, Tool, Toolbar, useOs, useToast, type NavSection } from "../kit/kit";
import type { NativeProps } from "../native";
import "./docs.css";

// Document requests as a desktop program, a work queue: new requests from
// the pool, the ones assigned to this advocate, those in progress and
// done; the chosen one in full — what the client needs, what they filled
// in, the template — with "take this case", "open the editor", or, for the
// older flow, the finished DOCX sent back to the client.

type Tab = "pool" | "assigned" | "progress" | "done";
type Row = { id: string; title: string; clientName: string; clientPhone: string; serviceName: string; need: string; requestedDocumentType: string; createdAt: string; flow?: string; status: string; pool?: DocumentRequestPoolItem; rec?: LawyerDocumentRequest };
const POOL_FLOW = new Set(["open_pool", "claimed", "completed"]);

export default function DocsApp(props: NativeProps) {
  const editorId = /\/document-requests\/([^/?#]+)\/editor/.exec(props.route)?.[1];
  if (editorId) return <EditorWindow {...props} />;
  return <Queue {...props} />;
}

// A record's editor, in this window, with the way back to the queue. The
// editor itself is the cabinet's document workspace.
function EditorWindow({ route, base, openApp }: NativeProps) {
  const d = useTranslations("portal.desk.docs");
  const locale = useLocale();
  const os = useOs();
  return (
    <App name="docs-editor">
      <Toolbar title={d("editorTitle")} back={{ label: d("back"), onClick: () => openApp("documentRequests", `${base}/document-requests`) }} />
      <iframe className="dxd-editor" name={`lexgo-desk:${os}:docs-editor`} src={`/${locale}${route}`} title={d("editorTitle")} />
    </App>
  );
}

function Queue({ base, openApp }: NativeProps) {
  const t = useTranslations("portal.advocate.documentRequests");
  const tcm = useTranslations("portal.common");
  const tf = useTranslations("portal.workFilters");
  const d = useTranslations("portal.desk.docs");
  const locale = useLocale();
  const os = useOs();
  const [tab, setTab] = useState<Tab>("pool");
  const [pool, setPool] = useState<DocumentRequestPoolItem[] | null>(null);
  const [mine, setMine] = useState<{ assigned: LawyerDocumentRequest[]; progress: LawyerDocumentRequest[]; done: LawyerDocumentRequest[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("");
  const [gone, setGone] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const [toast, say] = useToast();

  useEffect(() => {
    let alive = true;
    getDocumentRequestPool()
      .then((l) => alive && setPool(l))
      .catch(() => alive && setFailed(true));
    Promise.all([listMyLawyerDocumentRequests(), listMyLawyerDocumentRequests("claimed"), listMyLawyerDocumentRequests("completed")])
      .then(([a, p, c]) => alive && setMine({ assigned: a.filter((r) => r.status !== "open_pool"), progress: p, done: c }))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [tick]);
  useEffect(
    () =>
      subscribeUserEvents((e) => {
        if (/^document_request\.(pool_created|claimed|pool_removed|completed)$/.test(e.event ?? "")) setTick((n) => n + 1);
      }),
    [],
  );

  const rows = useMemo<Row[]>(() => {
    if (tab === "pool") return (pool ?? []).filter((p) => !gone.includes(p.id)).map((p) => ({ ...p, pool: p }));
    return (mine?.[tab] ?? []).map((r) => ({ id: r.id, title: r.title, clientName: r.clientName, clientPhone: r.clientPhone, serviceName: r.serviceName, need: r.need, requestedDocumentType: r.requestedDocumentType, createdAt: r.createdAt, flow: r.flow, status: r.status, rec: r }));
  }, [tab, pool, mine, gone]);
  const shown = (q.trim() ? rows.filter((r) => matchesSearch([r.title, r.clientName, r.serviceName, r.need, r.requestedDocumentType].join(" "), q)) : rows).sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  const current = shown.find((r) => r.id === sel) ?? null;
  const count = (k: Tab) => (k === "pool" ? (pool ?? []).filter((p) => !gone.includes(p.id)).length : mine?.[k].length ?? 0);
  const editor = (id: string) => openApp("documentRequests", `${base}/document-requests/${encodeURIComponent(id)}/editor`);
  const sections: NavSection[] = [
    { id: "a", title: os === "mac" ? d("queue") : undefined, items: [{ id: "pool", label: t("tabNewRequests"), icon: <IconInbox />, count: count("pool") || undefined }] },
    {
      id: "b",
      title: t("myWork"),
      items: [
        { id: "assigned", label: t("tabAssigned"), icon: <IconBriefcase />, count: count("assigned") || undefined },
        { id: "progress", label: t("tabInProgress"), icon: <IconEdit />, count: count("progress") || undefined },
        { id: "done", label: t("tabCompleted"), icon: <IconCheck />, count: count("done") || undefined },
      ],
    },
  ];
  const loading = tab === "pool" ? pool === null : mine === null;
  const title = tab === "pool" ? t("tabNewRequests") : tab === "assigned" ? t("tabAssigned") : tab === "progress" ? t("tabInProgress") : t("tabCompleted");

  return (
    <App name="docs" sidebar={<Sidebar label={t("title")} sections={sections} value={tab} onChange={(id) => (setTab(id as Tab), setSel(""))} header={os === "win" ? <Search value={q} onChange={setQ} placeholder={tf("searchDocs")} wide /> : undefined} />}>
      <Toolbar title={title} subtitle={loading ? undefined : d("count", { n: shown.length })} end={os === "mac" ? <Search value={q} onChange={setQ} placeholder={tf("searchDocs")} /> : undefined}>
        <Tool icon={<IconRefresh />} label={d("refresh")} onClick={() => setTick((n) => n + 1)} />
      </Toolbar>
      <div className="dxd-body">
        <section className="dxd-list" aria-label={title}>
          {loading ? (
            failed ? (
              <Empty icon={<IconAlert />} title={t("loadError")} action={<Btn onClick={() => setTick((n) => n + 1)}>{d("retry")}</Btn>} />
            ) : (
              <Loading label={d("loading")} />
            )
          ) : !shown.length ? (
            <Empty icon={<IconFileText />} title={q ? tf("emptyFiltered") : t("empty")} text={q ? undefined : t("emptyText")} />
          ) : (
            <div className="dxd-scroll" role="listbox" aria-label={title}>
              {shown.map((r) => (
                <div key={r.id} role="option" tabIndex={sel === r.id ? 0 : -1} aria-selected={sel === r.id} className={`dxd-row${sel === r.id ? " is-on" : ""}`} onClick={() => setSel(r.id)} onDoubleClick={() => r.rec && (r.rec.canOpenEditor || r.status === "completed") && POOL_FLOW.has(r.status) && editor(r.id)}>
                  <span className="dxd-row__top">
                    <b>{r.title || r.clientName || t("title")}</b>
                    <Tag tone={r.status === "open_pool" ? "info" : r.status === "completed" ? "ok" : "accent"}>{r.status === "open_pool" ? t("statusNew") : statusLabel(tcm, r.status, "docStatus")}</Tag>
                  </span>
                  <small>{[r.clientName, r.serviceName].filter(Boolean).join(" · ")}</small>
                  <span className="dxd-row__tags">
                    {r.flow && tf.has(`flow.${r.flow}`) ? (
                      <Tag>
                        <IconLayers aria-hidden />
                        {tf(`flow.${r.flow}`)}
                      </Tag>
                    ) : null}
                    {r.requestedDocumentType ? (
                      <Tag tone="accent">
                        <IconTag aria-hidden />
                        {r.requestedDocumentType}
                      </Tag>
                    ) : null}
                    {r.createdAt ? <span className="dxd-ago">{shortDateTime(r.createdAt, locale)}</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
        {current ? (
          <Detail
            key={current.id}
            r={current}
            onClaimed={(recordId) => {
              setGone((g) => [...g, current.id]);
              setTick((n) => n + 1);
              setTab("assigned");
              say(t("claimedOk"));
              editor(recordId || current.id);
            }}
            onTaken={() => {
              setGone((g) => [...g, current.id]);
              say(t("claimedByOther"), "err");
            }}
            onEditor={() => editor(current.id)}
            onSent={() => {
              setTick((n) => n + 1);
              say(t("fulfilled"));
            }}
          />
        ) : (
          <div className="dxd-none">
            <Empty icon={<IconClipboardCheck />} title={d("pick")} />
          </div>
        )}
      </div>
      {toast}
    </App>
  );
}

function Detail({ r, onClaimed, onTaken, onEditor, onSent }: { r: Row; onClaimed: (recordId: string) => void; onTaken: () => void; onEditor: () => void; onSent: () => void }) {
  const t = useTranslations("portal.advocate.documentRequests");
  const tf = useTranslations("portal.workFilters");
  const d = useTranslations("portal.desk.docs");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [sent, setSent] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const rec = r.rec;
  const tpl = rec?.templateFile;
  const answers = rec ? Object.entries(rec.answers).filter(([, v]) => v != null && v !== "") : [];
  const poolFlow = POOL_FLOW.has(r.status);
  async function claim() {
    if (!r.pool || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await claimDocumentRequest(r.pool.claimUrl);
      onClaimed(res.recordId);
    } catch (e) {
      if (isConflict(e)) onTaken();
      else setErr(t("claimError"));
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!rec || !file || busy) return;
    setBusy(true);
    setErr("");
    try {
      await fulfillLawyerDocumentRequestFile(rec.fulfillFileUrl, file, notes.trim() || undefined);
      setSent(true);
      onSent();
    } catch {
      setErr(t("fulfillError"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="dxd-detail" aria-label={r.title}>
      <header>
        <span className="dxd-detail__ic" aria-hidden>
          <IconFileText />
        </span>
        <div>
          <h2>{r.title || t("title")}</h2>
          <p>
            {r.flow && tf.has(`flow.${r.flow}`) ? tf(`flow.${r.flow}`) : null}
            {r.createdAt ? ` · ${shortDateTime(r.createdAt, locale)}` : ""}
          </p>
        </div>
      </header>
      <dl className="dxd-facts">
        {r.clientName ? (
          <div>
            <dt>{d("client")}</dt>
            <dd>
              <IconUser aria-hidden />
              {r.clientName}
            </dd>
          </div>
        ) : null}
        {r.clientPhone ? (
          <div>
            <dt>{d("phone")}</dt>
            <dd>
              <IconPhone aria-hidden />
              <a href={`tel:${r.clientPhone.replace(/[^\d+]/g, "")}`}>{r.clientPhone}</a>
            </dd>
          </div>
        ) : null}
        {r.serviceName ? (
          <div>
            <dt>{t("serviceLabel")}</dt>
            <dd>{r.serviceName}</dd>
          </div>
        ) : null}
        {r.requestedDocumentType ? (
          <div>
            <dt>{tf("docType")}</dt>
            <dd>{r.requestedDocumentType}</dd>
          </div>
        ) : null}
      </dl>
      {r.need ? (
        <section className="dxd-box">
          <h3>{t("need")}</h3>
          <p className="dxd-need">{r.need}</p>
        </section>
      ) : null}
      {answers.length ? (
        <section className="dxd-box">
          <h3>{t("answersLabel")}</h3>
          <dl className="dxd-answers">
            {answers.map(([k, v]) => (
              <div key={k}>
                <dt>{humanizeSlug(k)}</dt>
                <dd>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {err ? <Banner tone="err" title={err} /> : null}
      {r.pool ? (
        <div className="dxd-acts">
          <Btn kind="primary" icon={<IconBriefcase />} busy={busy} disabled={!r.pool.canClaim && r.pool.status !== "open_pool"} onClick={() => void claim()}>
            {t("claim")}
          </Btn>
        </div>
      ) : rec && poolFlow ? (
        <div className="dxd-acts">
          <Btn kind="primary" icon={<IconEdit />} disabled={!rec.canOpenEditor && rec.status !== "completed"} onClick={onEditor}>
            {d("openEditor")}
          </Btn>
          {!rec.canOpenEditor && rec.status !== "completed" ? <small className="dxd-muted">{t("editorBlockedFallback")}</small> : null}
        </div>
      ) : rec ? (
        <section className="dxd-box">
          <h3>{t("templateLabel")}</h3>
          {tpl && tpl.hasFile ? (
            <div className="dxd-acts">
              <Btn icon={<IconDownload />} onClick={() => void fetchAndDeliver(() => getServiceTemplateSourceFile(tpl.downloadUrl || tpl.inlineUrl), tpl.fileName || "shablon.docx", true)}>
                {t("downloadTemplate")}
              </Btn>
              <small className="dxd-muted">{tpl.fileName}</small>
            </div>
          ) : (
            <p className="dxd-muted">{t("noTemplate")}</p>
          )}
          {sent ? (
            <Banner tone="ok" title={t("fulfilled")} />
          ) : (
            <>
              <Field label={t("fileLabel")}>
                <span className="dxd-file">
                  <Btn icon={<IconUpload />} onClick={() => pick.current?.click()}>
                    {t("chooseFile")}
                  </Btn>
                  <span>
                    {file ? (
                      <>
                        <IconPaperclip aria-hidden />
                        {file.name}
                      </>
                    ) : (
                      t("filePlaceholder")
                    )}
                  </span>
                </span>
                <input ref={pick} type="file" accept=".docx" hidden onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && !/\.docx$/i.test(f.name)) setErr(t("invalidFileType"));
                  else setFile(f);
                  e.target.value = "";
                }} />
              </Field>
              <Field label={t("notesLabel")}>
                <TextArea value={notes} onChange={setNotes} rows={2} maxLength={1000} />
              </Field>
              <div className="dxd-acts">
                <Btn kind="primary" icon={<IconUpload />} busy={busy} disabled={!file} onClick={() => void send()}>
                  {t("fulfillSubmit")}
                </Btn>
              </div>
            </>
          )}
        </section>
      ) : null}
    </article>
  );
}
