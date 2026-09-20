"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { listAds, createAd, updateAd, deleteAd, type ModuleRecord } from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { AdminForm, AdminItem, Notice, useReload } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import { IconRocket, IconPlus, IconEdit, IconTrash } from "@/components/icons";

const som = (n?: number) => (n ? fmtUzs(n) : "—");
const num = (v: string | boolean) => parseInt(String(v || "0"), 10) || 0;

export default function AdminAds() {
  const t = useTranslations("admin");
  const [key, reload] = useReload();
  const ads = useResource(listAds, [key]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<ModuleRecord | null>(null);
  const [del, setDel] = useState<ModuleRecord | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delNote, setDelNote] = useState<{ ok: boolean; msg: string } | null>(null);

  async function confirmDelete() {
    if (!del || delBusy) return;
    setDelBusy(true);
    setDelNote(null);
    try {
      await deleteAd(del.id);
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
        <b>{t("ads.title")}</b>
        <span className="ahdr">
          <span className="advmuted">{ads.data.length}</span>
          <button className="btn btn--pri btn--sm" type="button" onClick={() => setOpen(true)}>
            <IconPlus />
            {t("form.add")}
          </button>
        </span>
      </div>
      <p className="advmuted" style={{ marginBottom: 16 }}>{t("ads.lead")}</p>

      {ads.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !ads.data.length ? (
        <EmptyState icon={<IconRocket />} title={t("ads.empty")} text={t("ads.emptyText")} />
      ) : (
        <div className="alist">
          {ads.data.map((a, i) => (
            <AdminItem
              key={a.id}
              index={i + 1}
              title={a.title}
              meta={a.recordType ? (t.has(`ads.recordType.${a.recordType}`) ? t(`ads.recordType.${a.recordType}`) : a.recordType) : undefined}
              right={som(a.price)}
              tags={a.status ? [{ label: t.has(`ads.status.${a.status}`) ? t(`ads.status.${a.status}`) : a.status }] : undefined}
              actions={
                <>
                  <button className="aitem__act" type="button" aria-label={t("form.edit")} title={t("form.edit")} onClick={() => setEdit(a)}>
                    <IconEdit />
                  </button>
                  <button className="aitem__act aitem__act--danger" type="button" aria-label={t("form.delete")} title={t("form.delete")} onClick={() => { setDelNote(null); setDel(a); }}>
                    <IconTrash />
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t("ads.create")}>
        <AdminForm
          fields={[
            { name: "title", label: t("form.title"), required: true },
            { name: "description", label: t("form.description"), type: "textarea" },
            { name: "price", label: t("form.price"), type: "number", placeholder: "0" },
          ]}
          onSubmit={async (v) =>
            void (await createAd({
              title: String(v.title),
              price: num(v.price),
              payload: { description: String(v.description) },
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
      </Modal>

      {/* Edit */}
      <Modal open={edit !== null} onClose={() => setEdit(null)} title={t("ads.editTitle")}>
        {edit ? (
          <AdminForm
            key={edit.id}
            fields={[
              { name: "title", label: t("form.title"), required: true },
              { name: "description", label: t("form.description"), type: "textarea" },
              { name: "price", label: t("form.price"), type: "number", placeholder: "0" },
              { name: "status", label: t("ads.statusLabel"), placeholder: "active" },
            ]}
            initialValues={{
              title: edit.title,
              description: String(edit.payload?.description ?? ""),
              price: edit.price ? String(Math.round(edit.price)) : "",
              status: edit.status,
            }}
            resetOnDone={false}
            onSubmit={async (v) =>
              void (await updateAd(edit.id, {
                title: String(v.title),
                price: num(v.price),
                status: String(v.status) || undefined,
                payload: { ...edit.payload, description: String(v.description) },
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
        ) : null}
      </Modal>

      {/* Delete confirm */}
      <Modal open={del !== null} onClose={() => setDel(null)} title={t("form.deleteConfirm")}>
        {del ? (
          <div className="cform" style={{ maxWidth: "none" }}>
            <p style={{ margin: 0 }}>
              <b>{del.title}</b>
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
