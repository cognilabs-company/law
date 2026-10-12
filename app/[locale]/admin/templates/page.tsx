"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { listEditorTemplates, type TemplateRow } from "@/lib/services/templateEditor";
import { updateDocumentTemplate, deleteDocumentTemplate } from "@/lib/services/admin";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { notify } from "@/lib/toast";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import { AdminItem, useReload } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import TemplateImport from "@/components/admin/TemplateImport";
import CreateDraftModal from "@/components/admin/templateEditor/CreateDraftModal";
import FilterBar from "@/components/filters/FilterBar";
import { IconDocLines, IconPlus, IconSearch, IconEdit, IconTrash, IconUpload, IconPower } from "@/components/icons";
import { aiId } from "@/lib/ai/ids";
import { useAiField, useAiModal } from "@/lib/ai/registry";

const som = (n?: number) => (n ? fmtUzs(n) : "—");

export default function AdminTemplates() {
  const t = useTranslations("admin");
  const te = useTranslations("admin.templateEditor");
  const router = useRouter();
  const [key, reload] = useReload();
  const tpls = useResource(() => listEditorTemplates(), [key]);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [del, setDel] = useState<TemplateRow | null>(null);
  const [q, setQ] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [toggling, setToggling] = useState("");

  const list = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return tpls.data;
    return tpls.data.filter((d) => {
      const hay = [d.name, d.category, d.slug, d.language, d.sourceFileName].join(" ").toLowerCase();
      return terms.every((w) => hay.includes(w));
    });
  }, [q, tpls.data]);
  useAiField("admin.templates.search.input", { get: () => q, set: setQ });
  useAiModal("admin.templates.create-modal", () => setOpen(true));

  const editorHref = (id: string) => `/admin/document-templates/${encodeURIComponent(id)}/editor`;

  async function confirmDelete() {
    if (!del || delBusy) return;
    setDelBusy(true);
    try {
      await deleteDocumentTemplate(del.id);
      setDel(null);
      reload();
      notify.success(t("form.deleted"), { id: `tpl-del-${del.id}`, body: del.name });
    } catch (e) {
      notify.error(t("form.deleteError"), { id: `tpl-del-${del.id}`, error: e });
    } finally {
      setDelBusy(false);
    }
  }

  async function toggleActive(d: TemplateRow) {
    if (toggling) return;
    setToggling(d.id);
    try {
      await updateDocumentTemplate(d.id, { is_active: !d.isActive });
      tpls.setData((cur) => cur.map((x) => (x.id === d.id ? { ...x, isActive: !d.isActive, status: !d.isActive ? "active" : "inactive" } : x)));
      notify.success(!d.isActive ? te("list.activated") : te("list.deactivated"), { id: `tpl-act-${d.id}`, body: d.name });
      void tpls.refresh();
    } catch (e) {
      notify.error(t("form.updateError"), { id: `tpl-act-${d.id}`, error: e });
    } finally {
      setToggling("");
    }
  }

  const statusTag = (d: TemplateRow) => {
    const s = d.status || (d.isActive ? "active" : "inactive");
    return { label: te.has(`status.${s}`) ? te(`status.${s}`) : s, tone: s === "active" ? ("ok" as const) : ("muted" as const) };
  };

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("templates.listTitle")}</b>
        <span className="ahdr">
          <span className="advmuted">{tpls.data.length}</span>
          <button className="btn btn--soft btn--sm" type="button" onClick={() => setImportOpen(true)} data-ai-target="button:import-templates" data-ai-id="admin.templates.import">
            <IconUpload />
            {t("templates.import.cta")}
          </button>
          <button className="btn btn--pri btn--sm" type="button" onClick={() => setOpen(true)} data-ai-target="button:new-template" data-ai-id="admin.templates.create">
            <IconPlus />
            {te("list.newWord")}
          </button>
        </span>
      </div>

      <FilterBar
        className="tplf"
        fields={[]}
        search={{ value: q, onChange: setQ, placeholder: t("templates.searchPh"), label: t("templates.search"), aiId: "admin.templates.search.input", aiTarget: "templates:search" }}
        count={tpls.status === "ready" ? list.length : undefined}
      />

      {tpls.status === "loading" ? (
        <Skeleton rows={3} />
      ) : tpls.status === "error" ? (
        <ErrorState error={tpls.error} onRetry={reload} />
      ) : !tpls.data.length ? (
        <EmptyState icon={<IconDocLines />} title={t("templates.empty")} />
      ) : !list.length ? (
        <EmptyState icon={<IconSearch />} title={t("templates.noResults")} />
      ) : (
        <div className="alist" data-ai-target="templates:list" data-ai-id="admin.templates.list" data-ai-type="list" data-ai-label={t("templates.listTitle")}>
          {list.map((d, i) => {
            const draft = d.status === "draft";
            return (
              <div
                key={d.id}
                data-ai-id={aiId("admin.templates.item", d.id)}
                data-ai-type="list_item"
                data-ai-entity-type="document_template"
                data-ai-entity-id={d.id}
                data-ai-entity-slug={d.slug || undefined}
                data-ai-label={d.name || d.slug}
              >
                <AdminItem
                  index={i + 1}
                  title={d.name || d.slug}
                  meta={[
                    d.category && t.has(`templates.import.cats.${d.category}`) ? t(`templates.import.cats.${d.category}`) : d.category,
                    d.language && t.has(`templates.import.langs.${d.language}`) ? t(`templates.import.langs.${d.language}`) : d.language,
                    d.slug,
                    te("list.counts", { s: d.sectionsCount, f: d.fieldsCount }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  right={d.price ? som(d.price) : undefined}
                  tags={[
                    statusTag(d),
                    ...(d.revision ? [{ label: te("list.revision", { n: d.revision }), tone: "muted" as const }] : []),
                    d.hasSourceFile ? { label: d.sourceFileName ? te("list.sourceNamed", { name: d.sourceFileName }) : te("list.source"), tone: "ok" as const } : { label: te("list.noSource"), tone: "muted" as const },
                  ]}
                  actions={
                    <>
                      <Link
                        className="aitem__act"
                        href={editorHref(d.id)}
                        aria-label={te("list.edit")}
                        title={te("list.edit")}
                        data-ai-id={aiId("admin.templates.item", d.id, "edit")}
                      >
                        <IconEdit />
                      </Link>
                      {draft ? null : (
                        <button
                          className="aitem__act"
                          type="button"
                          aria-label={d.isActive ? te("list.deactivate") : te("list.activate")}
                          title={d.isActive ? te("list.deactivate") : te("list.activate")}
                          aria-pressed={d.isActive}
                          disabled={toggling === d.id}
                          onClick={() => void toggleActive(d)}
                        >
                          <IconPower />
                        </button>
                      )}
                      <button className="aitem__act aitem__act--danger" type="button" aria-label={t("form.delete")} title={t("form.delete")} onClick={() => setDel(d)}>
                        <IconTrash />
                      </button>
                    </>
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      <TemplateImport open={importOpen} onClose={() => setImportOpen(false)} onDone={reload} />

      <CreateDraftModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(s) => {
          setOpen(false);
          reload();
          router.push(editorHref(s.templateId));
        }}
      />

      <Modal open={del !== null} onClose={() => setDel(null)} title={t("form.deleteConfirm")}>
        {del ? (
          <div className="cform" style={{ maxWidth: "none" }} data-ai-id="admin.templates.delete-modal" data-ai-type="modal" data-ai-label={t("form.deleteConfirm")}>
            <p style={{ margin: 0 }}>
              <b>{del.name}</b>
            </p>
            <p className="advmuted" style={{ margin: 0 }}>{t("form.deleteConfirmText")}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn--ghost" type="button" onClick={() => setDel(null)}>
                {t("form.cancel")}
              </button>
              <button className="btn btn--danger" type="button" onClick={confirmDelete} disabled={delBusy}>
                {delBusy ? t("form.saving") : t("form.delete")}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
