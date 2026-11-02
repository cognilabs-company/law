"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { isAborted, logApiError } from "@/lib/http";
import { toast } from "@/lib/toast";
import { TEMPLATE_TYPES, createCrmTemplate, crmCan, listCrmTemplates, type CrmMeta, type CrmTemplate } from "@/lib/services/crm";
import Sheet from "../../panel/Sheet";
import { Choice, Field, Note, PanelFoot } from "../../panel/bits";
import { IcCopy, IcDoc, IcSearch } from "../../icons";
import { IcPlus } from "../misc/icons";
import { Empty, Seg, Skel, copyText } from "../misc/ui";
import type { CrmSectionProps } from "../nav";
import { useCrmErr } from "../leads/util";

export default function CrmTemplatesX({ meta }: CrmSectionProps) {
  const t = useTranslations("crm.templates");
  const tl = useTranslations("admin.ccx.crm.lang");
  const tx = useTranslations("admin.ccx.crmMisc");
  const crmErr = useCrmErr();
  const uid = useId();
  const [type, setType] = useState("");
  const [language, setLanguage] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CrmTemplate[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<CrmTemplate | null>(null);

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
  const typeName = (x: string) => (t.has(`t.${x}`) ? t(`t.${x}`) : x);
  const langName = (l: string) => (tl.has(l) ? tl(l) : l);

  return (
    <div className="opx-cm" data-ai-target="callcenter:crm:templates">
      <div className="opx-cm-bar">
        <label className="opx-cm-search">
          <IcSearch size={17} />
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t("search")} aria-label={t("search")} />
        </label>
        <span className="opx-cm-select">
          <label htmlFor={`${uid}-lang`} className="opx-sr">
            {t("language")}
          </label>
          <select id={`${uid}-lang`} value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">{t("anyLanguage")}</option>
            {meta.languages.map((l) => (
              <option key={l} value={l}>
                {langName(l)}
              </option>
            ))}
          </select>
        </span>
        {canManage ? (
          <button type="button" className="opx-pbtn opx-pbtn--main opx-cm-push" onClick={() => setCreating(true)}>
            <IcPlus size={17} />
            {t("new")}
          </button>
        ) : null}
      </div>

      <div className="opx-cm-chips">
        <Seg label={t("type")} value={type} options={[{ value: "", label: t("anyType") }, ...TEMPLATE_TYPES.map((x) => ({ value: x as string, label: t(`t.${x}`) }))]} onChange={setType} />
      </div>

      <p className="opx-cm-sub">{t("note")}</p>

      {rows === null ? (
        <Skel heights={[180, 180]} />
      ) : !rows.length ? (
        <div className="opx-cm-card">
          <Empty icon={<IcDoc size={24} />} title={t("empty")} text={canManage ? t("emptyManage") : t("emptyText")} />
        </div>
      ) : (
        <div className="opx-cm-tpls">
          {rows.map((x) => (
            <article key={x.id} className="opx-cm-tpl">
              <header>
                <span className="opx-cm-card__ic" aria-hidden="true">
                  <IcDoc size={17} />
                </span>
                <span className="opx-cm-tpl__t">
                  <b>{x.title}</b>
                  <small>{langName(x.language)}</small>
                </span>
                <span className="opx-pill" data-tone="info">
                  {typeName(x.type)}
                </span>
              </header>
              <p className="opx-cm-tpl__body">{x.content}</p>
              <footer>
                <button type="button" className="opx-pbtn opx-cm-sm" onClick={() => copyText(x.content, t("copied"))}>
                  <IcCopy size={15} />
                  {t("copy")}
                </button>
                <button type="button" className="opx-pbtn opx-pbtn--ghost opx-cm-sm" onClick={() => setViewing(x)}>
                  {tx("view")}
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}

      {viewing ? <ViewTemplate tpl={viewing} typeName={typeName(viewing.type)} langName={langName(viewing.language)} onClose={() => setViewing(null)} /> : null}
      {creating ? <NewTemplate meta={meta} onClose={() => setCreating(false)} onSaved={() => void load()} /> : null}
    </div>
  );
}

function ViewTemplate({ tpl, typeName, langName, onClose }: { tpl: CrmTemplate; typeName: string; langName: string; onClose: () => void }) {
  const t = useTranslations("crm.templates");
  const tp = useTranslations("admin.ccx.panel");
  return (
    <Sheet
      label={tpl.title}
      onClose={onClose}
      head={
        <div className="opx-cm-shead">
          <span className="opx-phead__ic" aria-hidden="true">
            <IcDoc size={20} />
          </span>
          <span className="opx-cm-shead__t">
            <b>{tpl.title}</b>
            <small>{langName}</small>
          </span>
          <span className="opx-pill" data-tone="info">
            {typeName}
          </span>
        </div>
      }
    >
      <div className="opx-pscroll">
        <p className="opx-cm-full">{tpl.content}</p>
        <Note tone="info">{t("note")}</Note>
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={tp("close")} primary={() => copyText(tpl.content, t("copied"))} primaryLabel={t("copy")} kbd={false} />
    </Sheet>
  );
}

function NewTemplate({ meta, onClose, onSaved }: { meta: CrmMeta; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("crm.templates");
  const tl = useTranslations("admin.ccx.crm.lang");
  const crmErr = useCrmErr();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("chat");
  const [language, setLanguage] = useState(meta.languages[0] || "uz_latn");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = !!title.trim() && !!content.trim();

  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr("");
    try {
      await createCrmTemplate({ title, type, language, content });
      toast(t("saved"), { tone: "ok" });
      onSaved();
      onClose();
    } catch (e) {
      setErr(crmErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      label={t("new")}
      onClose={onClose}
      dirty={!!(title || content)}
      head={
        <div className="opx-cm-shead">
          <span className="opx-phead__ic" aria-hidden="true">
            <IcPlus size={20} />
          </span>
          <span className="opx-cm-shead__t">
            <b>{t("new")}</b>
          </span>
        </div>
      }
    >
      <div className="opx-pscroll">
        <Field label={t("titleLabel")} value={title} onChange={setTitle} required />
        <Choice label={t("type")} value={type} onChange={setType} options={TEMPLATE_TYPES.map((x) => ({ value: x, label: t(`t.${x}`) }))} />
        {meta.languages.length ? <Choice label={t("language")} value={language} onChange={setLanguage} options={meta.languages.map((l) => ({ value: l, label: tl.has(l) ? tl(l) : l }))} /> : null}
        <Field label={t("content")} value={content} onChange={setContent} multiline rows={8} required />
        {err ? <Note tone="bad">{err}</Note> : null}
      </div>
      <PanelFoot onCancel={onClose} cancelLabel={t("cancel")} primary={() => void save()} primaryLabel={t("save")} busy={busy} disabled={!ok} />
    </Sheet>
  );
}
