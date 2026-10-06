"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { getAdminDocumentTemplates, getDocumentTemplate, type BackendTemplate } from "@/lib/services/backend";
import {
  createDocumentTemplate,
  updateDocumentTemplate,
  deleteDocumentTemplate,
} from "@/lib/services/admin";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { AdminForm, AdminItem, Notice, useReload, type Field } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import TemplateImport from "@/components/admin/TemplateImport";
import FilterBar from "@/components/filters/FilterBar";
import { IconDocLines, IconPlus, IconSearch, IconEdit, IconTrash, IconUpload } from "@/components/icons";
import { aiId } from "@/lib/ai/ids";
import { useAiField, useAiModal } from "@/lib/ai/registry";

const som = (n?: number) => (n ? fmtUzs(n) : "—");
const num = (v: string | boolean) => parseInt(String(v || "0"), 10) || 0;

export default function AdminTemplates() {
  const t = useTranslations("admin");
  const [key, reload] = useReload();
  // GET /admin/document-templates (2026-09-19 backend): includes inactive
  // templates too, unlike the public listing this page used before.
  const tpls = useResource(() => getAdminDocumentTemplates(), [key]);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [edit, setEdit] = useState<BackendTemplate | null>(null);
  const [editFull, setEditFull] = useState<BackendTemplate | null>(null);
  const [del, setDel] = useState<BackendTemplate | null>(null);
  const [q, setQ] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delNote, setDelNote] = useState<{ ok: boolean; msg: string } | null>(null);

  // Full field set (with the template body). Used by both create and edit; the
  // edit form is prefilled from the single-template GET so the body can be
  // edited too without blanking it.
  const fields: Field[] = [
    { name: "title", label: t("form.title"), required: true },
    { name: "slug", label: t("form.slug"), required: true, placeholder: "lease-agreement" },
    { name: "category", label: t("form.category"), placeholder: "contract" },
    { name: "language", label: t("templates.language"), placeholder: "uz" },
    { name: "description", label: t("form.description"), type: "textarea" },
    { name: "template_text", label: t("templates.templateText"), type: "textarea", required: true },
    { name: "price", label: t("form.price"), type: "number", placeholder: "0" },
    { name: "is_active", label: t("form.active"), type: "checkbox" },
  ];

  // On opening edit, fetch the full template (incl. body) to prefill the form.
  // editFull is cleared when edit is opened, so it stays null while loading.
  function openEdit(d: BackendTemplate) {
    setEditFull(null);
    setEdit(d);
  }
  useEffect(() => {
    if (!edit) return;
    let alive = true;
    getDocumentTemplate(edit.id)
      .then((full) => {
        if (alive) setEditFull(full);
      })
      .catch(() => {
        // Fall back to list data (body unknown) so edit still opens.
        if (alive) setEditFull(edit);
      });
    return () => {
      alive = false;
    };
  }, [edit]);

  const list = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return tpls.data;
    return tpls.data.filter((d) => {
      const hay = [d.name, d.category, d.slug, d.language].join(" ").toLowerCase();
      return terms.every((w) => hay.includes(w));
    });
  }, [q, tpls.data]);
  useAiField("admin.templates.search.input", { get: () => q, set: setQ });
  useAiModal("admin.templates.create-modal", () => setOpen(true));

  async function confirmDelete() {
    if (!del || delBusy) return;
    setDelBusy(true);
    setDelNote(null);
    try {
      await deleteDocumentTemplate(del.id);
      setDel(null);
      reload();
    } catch (e) {
      const detail = e && typeof e === "object" && "detail" in e ? String((e as { detail?: string }).detail) : "";
      setDelNote({ ok: false, msg: detail || t("form.deleteError") });
    } finally {
      setDelBusy(false);
    }
  }

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
            {t("form.add")}
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
      ) : !tpls.data.length ? (
        <EmptyState icon={<IconDocLines />} title={t("templates.empty")} />
      ) : !list.length ? (
        <EmptyState icon={<IconSearch />} title={t("templates.noResults")} />
      ) : (
        <div className="alist" data-ai-target="templates:list" data-ai-id="admin.templates.list" data-ai-type="list" data-ai-label={t("templates.listTitle")}>
          {list.map((d, i) => (
            <div
              key={d.id}
              data-ai-id={d.id ? aiId("admin.templates.item", d.id) : undefined}
              data-ai-type="list_item"
              data-ai-entity-type="document_template"
              data-ai-entity-id={d.id || undefined}
              data-ai-entity-slug={d.slug || undefined}
              data-ai-label={d.name || d.slug}
            >
              <AdminItem
                index={i + 1}
                title={d.name}
                meta={[d.category, d.language, d.slug].filter(Boolean).join(" · ")}
                right={d.price ? som(d.price) : undefined}
                tags={[{ label: d.isActive ? t("form.active") : t("form.inactive"), tone: d.isActive ? "ok" : "muted" }]}
                actions={
                  <>
                    <button className="aitem__act" type="button" aria-label={t("form.edit")} title={t("form.edit")} onClick={() => openEdit(d)} data-ai-id={d.id ? aiId("admin.templates.item", d.id, "edit") : undefined}>
                      <IconEdit />
                    </button>
                    <button className="aitem__act aitem__act--danger" type="button" aria-label={t("form.delete")} title={t("form.delete")} onClick={() => { setDelNote(null); setDel(d); }}>
                      <IconTrash />
                    </button>
                  </>
                }
              />
            </div>
          ))}
        </div>
      )}

      <TemplateImport open={importOpen} onClose={() => setImportOpen(false)} onDone={reload} />

      {/* Create */}
      <Modal open={open} onClose={() => setOpen(false)} title={t("templates.create")}>
        <div data-ai-id="admin.templates.create-modal" data-ai-type="modal" data-ai-label={t("templates.create")}>
          <AdminForm
            fields={fields}
            onSubmit={async (v) =>
              void (await createDocumentTemplate({
                slug: String(v.slug),
                title: String(v.title),
                category: String(v.category),
                language: String(v.language),
                description: String(v.description),
                template_text: String(v.template_text),
                price: num(v.price),
                is_active: v.is_active as boolean,
              }))
            }
            submitLabel={t("form.save")}
            busyLabel={t("form.saving")}
            okMsg={t("form.created")}
            errMsg={t("form.error")}
            onDone={() => {
              reload();
              setOpen(false);
            }}
          />
        </div>
      </Modal>

      {/* Edit (full, incl. body) */}
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={t("templates.editTitle")}>
        {!editFull ? (
          <Skeleton rows={4} />
        ) : (
          <div data-ai-id="admin.templates.edit-modal" data-ai-type="modal" data-ai-label={t("templates.editTitle")}>
            <AdminForm
              key={editFull.id}
              fields={fields}
              initialValues={{
                title: editFull.name,
                slug: editFull.slug,
                category: editFull.category,
                language: editFull.language,
                description: editFull.description,
                template_text: editFull.templateText,
                price: editFull.price ? String(Math.round(editFull.price)) : "",
                is_active: editFull.isActive,
              }}
              resetOnDone={false}
              onSubmit={async (v) =>
                void (await updateDocumentTemplate(editFull.id, {
                  slug: String(v.slug),
                  title: String(v.title),
                  category: String(v.category),
                  language: String(v.language),
                  description: String(v.description),
                  template_text: String(v.template_text),
                  price: num(v.price),
                  is_active: v.is_active as boolean,
                }))
              }
              submitLabel={t("form.update")}
              busyLabel={t("form.saving")}
              okMsg={t("form.updated")}
              errMsg={t("form.updateError")}
              onDone={() => {
                reload();
                setEdit(null);
              }}
            />
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal open={del !== null} onClose={() => setDel(null)} title={t("form.deleteConfirm")}>
        {del ? (
          <div className="cform" style={{ maxWidth: "none" }} data-ai-id="admin.templates.delete-modal" data-ai-type="modal" data-ai-label={t("form.deleteConfirm")}>
            <p style={{ margin: 0 }}>
              <b>{del.name}</b>
            </p>
            <p className="advmuted" style={{ margin: 0 }}>{t("form.deleteConfirmText")}</p>
            {delNote ? <Notice ok={delNote.ok} msg={delNote.msg} /> : null}
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
