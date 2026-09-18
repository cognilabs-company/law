"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getRoles, getPermissions, createRole, assignRole } from "@/lib/services/admin";
import { getPermissionMatrix } from "@/lib/services/backend";
import { listAdminUsers } from "@/lib/services/users";
import { useResource, useResourceOne } from "@/lib/useResource";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { Notice, useReload, AdminItem, UserSelect } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import ChipMulti from "@/components/register/ChipMulti";
import Select from "@/components/Select";
import { IconShield, IconPlus, IconCheck } from "@/components/icons";

export default function AdminRoles() {
  const t = useTranslations("admin");
  const [key, reload] = useReload();
  const roles = useResource(getRoles, [key]);
  const perms = useResource(getPermissions, []);
  const matrix = useResourceOne(getPermissionMatrix, []);
  const permLabel = (code: string) => perms.data.find((p) => p.code === code)?.title || code;
  const [open, setOpen] = useState(false);

  // create-role form
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [cBusy, setCBusy] = useState(false);
  const [cNote, setCNote] = useState<{ ok: boolean; msg: string } | null>(null);

  // assign form
  const [userId, setUserId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [aBusy, setABusy] = useState(false);
  const [aNote, setANote] = useState<{ ok: boolean; msg: string } | null>(null);

  const detailOf = (err: unknown) =>
    err && typeof err === "object" && "detail" in err ? String((err as { detail?: string }).detail) : "";

  async function submitRole(e: React.FormEvent) {
    e.preventDefault();
    if (cBusy) return;
    if (!name.trim() || !title.trim()) {
      setCNote({ ok: false, msg: t("form.error") });
      return;
    }
    setCBusy(true);
    setCNote(null);
    try {
      await createRole({ name: name.trim(), title: title.trim(), description: desc.trim(), permissions: picked });
      setName("");
      setTitle("");
      setDesc("");
      setPicked([]);
      reload();
      setOpen(false);
    } catch (err) {
      setCNote({ ok: false, msg: detailOf(err) || t("form.error") });
    } finally {
      setCBusy(false);
    }
  }

  async function submitAssign(e: React.FormEvent) {
    e.preventDefault();
    if (aBusy) return;
    if (!userId || !roleId) {
      setANote({ ok: false, msg: t("form.error") });
      return;
    }
    setABusy(true);
    setANote(null);
    try {
      await assignRole(userId, roleId);
      setANote({ ok: true, msg: t("roles.assigned") });
      setUserId("");
      setRoleId("");
    } catch (err) {
      setANote({ ok: false, msg: detailOf(err) || t("form.error") });
    } finally {
      setABusy(false);
    }
  }

  return (
    <div className="agrid">
      {/* Roles list */}
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("roles.listTitle")}</b>
          <span className="ahdr">
            <span className="advmuted">{roles.data.length}</span>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setOpen(true)}>
              <IconPlus />
              {t("form.add")}
            </button>
          </span>
        </div>
        {roles.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !roles.data.length ? (
          <EmptyState icon={<IconShield />} title={t("roles.empty")} />
        ) : (
          <div className="alist">
            {roles.data.map((r, i) => (
              <AdminItem
                key={r.id}
                index={i + 1}
                title={r.title || r.name}
                meta={r.name}
                right={t("roles.permCount", { n: r.permissions.length })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Assign role */}
      <div className="ppanel">
        <div className="ppanel__h"><b>{t("roles.assignTitle")}</b></div>
        <p className="advmuted" style={{ marginBottom: 16 }}>{t("roles.assignLead")}</p>
        <form className="cform" style={{ maxWidth: "none" }} onSubmit={submitAssign}>
          <UserSelect
            value={userId}
            onChange={setUserId}
            label={t("roles.user")}
            placeholder={t("roles.selectUser")}
            search={(q) => listAdminUsers({ q }).then((users) => users.map((u) => ({ value: u.id, label: u.name || u.phone || u.lexgoId, sub: [u.phone, u.lexgoId].filter(Boolean).join(" · ") })))}
          />
          <div>
            <label>{t("roles.role")}</label>
            <Select
              value={roleId}
              onChange={setRoleId}
              options={roles.data.map((r) => ({ value: r.id, label: r.title || r.name }))}
              ariaLabel={t("roles.role")}
              placeholder={t("roles.selectRole")}
            />
          </div>
          {aNote ? <Notice ok={aNote.ok} msg={aNote.msg} /> : null}
          <button className="btn btn--pri" type="submit" disabled={aBusy}>
            {aBusy ? t("form.saving") : t("roles.assign")}
          </button>
        </form>
      </div>

      {/* Permission matrix (read-only): roles × permissions */}
      <div className="ppanel" style={{ gridColumn: "1 / -1" }}>
        <div className="ppanel__h"><b>{t("roles.matrixTitle")}</b></div>
        {matrix.status === "loading" ? (
          <Skeleton rows={4} />
        ) : !matrix.data || !matrix.data.roles.length ? (
          <EmptyState icon={<IconShield />} title={t("roles.empty")} />
        ) : (
          <>
            <div className="pmx__wrap">
              <table className="pmx">
                <thead>
                  <tr>
                    <th>{t("roles.matrixPermission")}</th>
                    {matrix.data.roles.map((r) => (
                      <th key={r.name} title={r.name}>{r.title || r.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.data.permissions.map((code) => (
                    <tr key={code}>
                      <td>{permLabel(code)}</td>
                      {matrix.data!.roles.map((r) => (
                        <td key={r.name} className="pmx__c">
                          {r.permissions.includes(code) ? <IconCheck /> : <span className="pmx__no">·</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {matrix.data.sellerRules.map((sr) => (
              <p className="advmuted pmx__rule" key={sr.sellerType}>
                <b>{sr.sellerType}:</b> {sr.rule}
              </p>
            ))}
          </>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t("roles.create")}>
        <form className="cform" style={{ maxWidth: "none" }} onSubmit={submitRole}>
          <div>
            <label>{t("roles.name")}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="content_manager" />
          </div>
          <div>
            <label>{t("form.title")}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label>{t("form.description")}</label>
            <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div>
            <label>{t("roles.permissions")}</label>
            {perms.status === "loading" ? (
              <Skeleton rows={1} />
            ) : (
              <ChipMulti
                options={perms.data.map((p) => ({ value: p.code, label: p.title }))}
                value={picked}
                onChange={setPicked}
              />
            )}
          </div>
          {cNote ? <Notice ok={cNote.ok} msg={cNote.msg} /> : null}
          <button className="btn btn--pri" type="submit" disabled={cBusy}>
            {cBusy ? t("form.saving") : t("form.save")}
          </button>
        </form>
      </Modal>
    </div>
  );
}
