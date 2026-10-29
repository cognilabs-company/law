"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useTranslations } from "next-intl";
import Modal from "@/components/admin/Modal";
import { IconCopy, IconFileText, IconPlus, IconSearch } from "@/components/icons";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { TEMPLATE_TYPES, createCrmTemplate, crmCan, listCrmTemplates, type CrmMeta, type CrmTemplate } from "@/lib/services/crm";
import CrmFrame from "./CrmFrame";
import { Empty, useCrmError } from "./bits";
import { CrmSelect } from "./fields";
import { copyText } from "./LeadSide";

export default function CrmTemplates(): ReactElement {
  const t = useTranslations("crm");
  return <CrmFrame title={t("templates.title")} section="templates">{(api) => <Library meta={api.meta} />}</CrmFrame>;
}

// Operator aids: copied into an editor, never sent from here (§6).
function Library({ meta }: { meta: CrmMeta }): ReactElement {
  const t = useTranslations("crm.templates");
  const tl = useTranslations("crm.lang");
  const crmErr = useCrmError();
  const [type, setType] = useState("");
  const [language, setLanguage] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CrmTemplate[] | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setQ(qInput.trim()), 300);
    return () => window.clearTimeout(id);
  }, [qInput]);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setRows(await listCrmTemplates({ type, language, q }, signal));
      } catch (e) {
        if (!isAborted(e)) {
          logApiError("crm.templates", e);
          toast(crmErr(e), { tone: "err" });
        }
        setRows((cur) => cur ?? []);
      }
    },
    [type, language, q, crmErr],
  );
  useEffect(() => {
    const ctl = new AbortController();
    const id = window.setTimeout(() => void load(ctl.signal), 0);
    return () => {
      ctl.abort();
      window.clearTimeout(id);
    };
  }, [load]);
  const canManage = crmCan(meta, "crm.templates.manage");
  return (
    <>
      <div className="crm-filters">
        <label className="crm-search">
          <IconSearch aria-hidden="true" />
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
        </label>
        <CrmSelect value={type} onChange={setType} label={t("type")} options={[{ value: "", label: t("anyType") }, ...TEMPLATE_TYPES.map((x) => ({ value: x, label: t(`t.${x}`) }))]} />
        <CrmSelect value={language} onChange={setLanguage} label={t("language")} options={[{ value: "", label: t("anyLanguage") }, ...meta.languages.map((l) => ({ value: l, label: tl.has(l) ? tl(l) : l }))]} />
        {canManage ? (
          <button type="button" className="crm-btn crm-btn--pri" style={{ marginLeft: "auto" }} onClick={() => setCreating(true)}>
            <IconPlus aria-hidden="true" />
            {t("new")}
          </button>
        ) : null}
      </div>
      <p className="crm-sub">{t("note")}</p>
      {rows === null ? (
        <span className="crm-sk crm-sk--block" />
      ) : !rows.length ? (
        <div className="crm-card">
          <Empty icon={<IconFileText />} title={t("empty")} text={canManage ? t("emptyManage") : t("emptyText")} />
        </div>
      ) : (
        <div className="crm-clist crm-rise">
          {rows.map((x) => (
            <article key={x.id} className="crm-ccard" style={{ cursor: "default" }}>
              <span className="crm-ccard__top">
                <span>
                  <b>{x.title}</b>
                  <small className="crm-muted">
                    {t.has(`t.${x.type}`) ? t(`t.${x.type}`) : x.type} · {tl.has(x.language) ? tl(x.language) : x.language}
                  </small>
                </span>
              </span>
              <p className="crm-sub" style={{ whiteSpace: "pre-wrap", maxHeight: 120, overflow: "hidden" }}>
                {x.content}
              </p>
              <button type="button" className="crm-btn crm-btn--sm" style={{ justifySelf: "start" }} onClick={() => copyText(x.content, t("copied"))}>
                <IconCopy aria-hidden="true" />
                {t("copy")}
              </button>
            </article>
          ))}
        </div>
      )}
      {creating ? <NewTemplate meta={meta} onClose={() => setCreating(false)} onSaved={() => void load()} /> : null}
    </>
  );
}

function NewTemplate({ meta, onClose, onSaved }: { meta: CrmMeta; onClose: () => void; onSaved: () => void }): ReactElement {
  const t = useTranslations("crm.templates");
  const tl = useTranslations("crm.lang");
  const crmErr = useCrmError();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("chat");
  const [language, setLanguage] = useState(meta.languages[0] || "uz_latn");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!title.trim() || !content.trim() || busy) return;
    setBusy(true);
    try {
      await createCrmTemplate({ title, type, language, content });
      toast(t("saved"), { tone: "ok" });
      onSaved();
      onClose();
    } catch (e) {
      toast(crmErr(e), { tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      variant="drawer"
      title={t("new")}
      busy={busy}
      dirty={!!(title || content)}
      footer={
        <>
          <button type="button" className="crm-btn" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="button" className="crm-btn crm-btn--pri" onClick={() => void save()} disabled={busy || !title.trim() || !content.trim()} aria-busy={busy || undefined}>
            {t("save")}
          </button>
        </>
      }
    >
      <div className="crm-pop">
        <label className="crm-field">
          <span>{t("titleLabel")}</span>
          <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <div className="crm-row2">
          <div className="crm-field">
            <span>{t("type")}</span>
            <CrmSelect value={type} onChange={setType} label={t("type")} options={TEMPLATE_TYPES.map((x) => ({ value: x, label: t(`t.${x}`) }))} />
          </div>
          <div className="crm-field">
            <span>{t("language")}</span>
            <CrmSelect value={language} onChange={setLanguage} label={t("language")} options={meta.languages.map((l) => ({ value: l, label: tl.has(l) ? tl(l) : l }))} />
          </div>
        </div>
        <label className="crm-field">
          <span>{t("content")}</span>
          <textarea className="crm-textarea" value={content} onChange={(e) => setContent(e.target.value)} style={{ minHeight: 160 }} />
        </label>
      </div>
    </Modal>
  );
}
