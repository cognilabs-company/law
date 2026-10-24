"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { getRoles, getPermissions, createRole, assignRole } from "@/lib/services/admin";
import { getPermissionMatrix } from "@/lib/services/backend";
import { listAdminUsers } from "@/lib/services/users";
import { useResource, useResourceOne } from "@/lib/useResource";
import { Skeleton, EmptyState, ErrorState } from "@/components/portal/DataState";
import { useReload, AdminItem, UserSelect } from "@/components/admin/AdminBits";
import FieldError from "@/components/ui/FieldError";
import ScrollCue from "@/components/ui/ScrollCue";
import Modal from "@/components/admin/Modal";
import ChipMulti from "@/components/register/ChipMulti";
import Select from "@/components/Select";
import { IconShield, IconPlus, IconCheck } from "@/components/icons";
import { notify } from "@/lib/toast";
import { useStudioText } from "@/components/admin/studio/bits";

export default function AdminRoles() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const uid = useId();
  const [key, reload] = useReload();
  const [mxKey, reloadMatrix] = useReload();
  const roles = useResource(getRoles, [key]);
  const perms = useResource(getPermissions, []);
  const matrix = useResourceOne(getPermissionMatrix, [mxKey]);
  const ts = useStudioText();
  // The backend names roles and permissions in English only; ours come in
  // every language, the backend's text stays for a role an admin created.
  const tr = useTranslations("studio");
  const roleLabel = (r: { name: string; title: string }) => {
    const k = r.name.trim().toLowerCase();
    return k && (tr.has(`roles.${k}`) || tr.has(`roles.studio_${k}`)) ? ts.role(r.name) : r.title || r.name;
  };
  const permLabel = (code: string) => (code && tr.has(`perm.${code.replace(/\./g, "__")}`) ? ts.perm(code) : perms.data.find((p) => p.code === code)?.title || code);
  // Three independent fetches used to mean the page visibly assembled in
  // steps — whichever resolved first popped its panel in while the others
  // still showed their own skeleton (the "assign role" panel had no gate at
  // all, so its role dropdown would silently fill in later). Wait for all
  // three to settle once, then render the whole page together; a later
  // `reload()` (e.g. after creating a role) only ever re-triggers `roles`
  // and doesn't drop back to this full-page gate.
  const [everReady, setEverReady] = useState(false);
  const allLoading = roles.status === "loading" || perms.status === "loading" || matrix.status === "loading";
  if (!everReady && !allLoading) setEverReady(true);
  const [open, setOpen] = useState(false);

  // create-role form
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [cBusy, setCBusy] = useState(false);
  const [cBad, setCBad] = useState<{ name?: boolean; title?: boolean }>({});

  // assign form
  const [userId, setUserId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [aBusy, setABusy] = useState(false);
  const [aBad, setABad] = useState<{ user?: boolean; role?: boolean }>({});
  const fid = (k: string) => `${uid}-${k}`;

  async function submitRole(e: React.FormEvent) {
    e.preventDefault();
    if (cBusy) return;
    const miss = { name: !name.trim(), title: !title.trim() };
    if (miss.name || miss.title) {
      setCBad(miss);
      document.getElementById(fid(miss.name ? "name" : "title"))?.focus();
      return;
    }
    setCBusy(true);
    try {
      await createRole({ name: name.trim(), title: title.trim(), description: desc.trim(), permissions: picked });
      notify.success(t("roles.created"), { id: "role-create", body: title.trim() });
      setName("");
      setTitle("");
      setDesc("");
      setPicked([]);
      reload();
      setOpen(false);
    } catch (err) {
      notify.error(t("roles.createFailed"), { id: "role-create", error: err });
    } finally {
      setCBusy(false);
    }
  }

  async function submitAssign(e: React.FormEvent) {
    e.preventDefault();
    if (aBusy) return;
    if (!userId || !roleId) {
      setABad({ user: !userId, role: !roleId });
      return;
    }
    setABusy(true);
    const role = roles.data.find((r) => r.id === roleId);
    try {
      await assignRole(userId, roleId);
      notify.success(t("roles.assigned"), { id: "role-assign", body: role ? roleLabel(role) : undefined });
      setUserId("");
      setRoleId("");
    } catch (err) {
      notify.error(t("roles.assignFailed"), { id: "role-assign", error: err });
    } finally {
      setABusy(false);
    }
  }

  if (!everReady) {
    return (
      <div className="ppanel">
        <Skeleton rows={8} />
      </div>
    );
  }

  return (
    <div className="agrid">
      {/* Roles list */}
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("roles.listTitle")}</b>
          <span className="ahdr">
            <span className="advmuted">{roles.data.length}</span>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setOpen(true)} data-ai-target="button:new-role">
              <IconPlus />
              {t("form.add")}
            </button>
          </span>
        </div>
        {roles.status === "loading" ? (
          <Skeleton rows={3} />
        ) : roles.status === "error" ? (
          <ErrorState error={roles.error} onRetry={roles.refresh} />
        ) : !roles.data.length ? (
          <EmptyState icon={<IconShield />} title={t("roles.empty")} />
        ) : (
          <div className="alist" data-ai-target="roles:list">
            {roles.data.map((r, i) => (
              <AdminItem
                key={r.id}
                index={i + 1}
                title={roleLabel(r)}
                meta={r.name}
                right={t("roles.permCount", { n: r.permissions.length })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Assign role */}
      <div className="ppanel" data-ai-target="roles:assign">
        <div className="ppanel__h"><b>{t("roles.assignTitle")}</b></div>
        <p className="advmuted" style={{ marginBottom: 16 }}>{t("roles.assignLead")}</p>
        <form className="cform" style={{ maxWidth: "none" }} onSubmit={submitAssign}>
          <div data-invalid={aBad.user ? "true" : undefined}>
            <UserSelect
              value={userId}
              onChange={(v) => {
                setUserId(v);
                setABad((b) => (b.user ? { ...b, user: false } : b));
              }}
              label={t("roles.user")}
              placeholder={t("roles.selectUser")}
              search={(q) => listAdminUsers({ q }).then((users) => users.map((u) => ({ value: u.id, label: u.name || u.phone || u.lexgoId, sub: [u.phone, u.lexgoId].filter(Boolean).join(" · ") })))}
              invalid={aBad.user}
              describedBy={aBad.user ? fid("user-err") : undefined}
            />
            <FieldError id={fid("user-err")} msg={aBad.user ? t("roles.selectUser") : null} />
          </div>
          <div data-invalid={aBad.role ? "true" : undefined}>
            <label>{t("roles.role")}</label>
            <Select
              value={roleId}
              onChange={(v) => {
                setRoleId(v);
                setABad((b) => (b.role ? { ...b, role: false } : b));
              }}
              options={roles.data.map((r) => ({ value: r.id, label: roleLabel(r) }))}
              ariaLabel={t("roles.role")}
              placeholder={t("roles.selectRole")}
              invalid={aBad.role}
              describedBy={aBad.role ? fid("role-err") : undefined}
            />
            <FieldError id={fid("role-err")} msg={aBad.role ? t("roles.selectRole") : null} />
          </div>
          <button className="btn btn--pri" type="submit" disabled={aBusy}>
            {aBusy ? t("form.saving") : t("roles.assign")}
          </button>
        </form>
      </div>

      {/* Permission matrix (read-only): roles × permissions */}
      <div className="ppanel" style={{ gridColumn: "1 / -1" }} data-ai-target="roles:matrix">
        <div className="ppanel__h"><b>{t("roles.matrixTitle")}</b></div>
        {matrix.status === "loading" ? (
          <Skeleton rows={4} />
        ) : matrix.status === "error" ? (
          <ErrorState onRetry={reloadMatrix} />
        ) : !matrix.data || !matrix.data.roles.length ? (
          <EmptyState icon={<IconShield />} title={t("roles.empty")} />
        ) : (
          <>
            <ScrollCue className="pmx__wrap">
              <table className="pmx">
                <thead>
                  <tr>
                    <th>{t("roles.matrixPermission")}</th>
                    {matrix.data.roles.map((r) => (
                      <th key={r.name} title={r.name}>{roleLabel(r)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.data.permissions.map((code) => (
                    <tr key={code}>
                      <td title={permLabel(code)}>{permLabel(code)}</td>
                      {matrix.data!.roles.map((r) => (
                        <td key={r.name} className="pmx__c">
                          {r.permissions.includes(code) ? <IconCheck /> : <span className="pmx__no">·</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollCue>
            {matrix.data.sellerRules.map((sr) => (
              <p className="advmuted pmx__rule" key={sr.sellerType}>
                <b>{t.has(`roles.sellerType.${sr.sellerType}`) ? t(`roles.sellerType.${sr.sellerType}`) : sr.sellerType}:</b> {sr.rule}
              </p>
            ))}
          </>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t("roles.create")}>
        <form className="cform" style={{ maxWidth: "none" }} onSubmit={submitRole}>
          <div>
            <label htmlFor={fid("name")}>{t("roles.name")}</label>
            <input
              id={fid("name")}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setCBad((b) => (b.name ? { ...b, name: false } : b));
              }}
              placeholder="content_manager"
              aria-invalid={cBad.name || undefined}
              aria-describedby={cBad.name ? fid("name-err") : undefined}
            />
            <FieldError id={fid("name-err")} msg={cBad.name ? tc("required") : null} />
          </div>
          <div>
            <label htmlFor={fid("title")}>{t("form.title")}</label>
            <input
              id={fid("title")}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setCBad((b) => (b.title ? { ...b, title: false } : b));
              }}
              aria-invalid={cBad.title || undefined}
              aria-describedby={cBad.title ? fid("title-err") : undefined}
            />
            <FieldError id={fid("title-err")} msg={cBad.title ? tc("required") : null} />
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
                options={perms.data.map((p) => ({ value: p.code, label: permLabel(p.code) }))}
                value={picked}
                onChange={setPicked}
              />
            )}
          </div>
          <button className="btn btn--pri" type="submit" disabled={cBusy}>
            {cBusy ? t("form.saving") : t("form.save")}
          </button>
        </form>
      </Modal>
    </div>
  );
}
