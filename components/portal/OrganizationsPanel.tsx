"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  listOrganizations,
  createOrganization,
  listOrgMembers,
  addOrgMember,
  type Organization,
  type OrgMember,
} from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { useAuth } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import { Skeleton, EmptyState } from "./DataState";
import { AdminForm, AdminItem, UserSelect, Notice, useReload } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import { IconBuilding, IconChartBar, IconPlus, IconUsers } from "@/components/icons";

export default function OrganizationsPanel() {
  const t = useTranslations("portal.org");
  const ts = useTranslations("portal.org.statusMap");
  const [key, reload] = useReload();
  const orgs = useResource(listOrganizations, [key]);
  const { session } = useAuth();
  const me = session?.id ?? "";
  const mine = orgs.data.filter((o) => !o.ownerUserId || o.ownerUserId === me);
  const [createOpen, setCreateOpen] = useState(false);
  const [membersOrg, setMembersOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [mLoading, setMLoading] = useState(false);
  const [uid, setUid] = useState("");
  const [title, setTitle] = useState("");
  const [mBusy, setMBusy] = useState(false);
  const [mNote, setMNote] = useState<{ ok: boolean; msg: string } | null>(null);

  // Reset the members form when another organization is opened (during render,
  // not in the effect).
  const [prevOrg, setPrevOrg] = useState(membersOrg);
  if (membersOrg !== prevOrg) {
    setPrevOrg(membersOrg);
    if (membersOrg) {
      setMLoading(true);
      setMNote(null);
      setUid("");
      setTitle("");
    }
  }

  useEffect(() => {
    if (!membersOrg) return;
    listOrgMembers(membersOrg.id)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setMLoading(false));
  }, [membersOrg]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!membersOrg || !uid || mBusy) return;
    setMBusy(true);
    setMNote(null);
    try {
      await addOrgMember(membersOrg.id, { user_id: uid, title: title.trim() });
      const rows = await listOrgMembers(membersOrg.id);
      setMembers(rows);
      setUid("");
      setTitle("");
      setMNote({ ok: true, msg: t("memberAdded") });
    } catch (err) {
      const d = err && typeof err === "object" && "detail" in err ? String((err as { detail?: string }).detail) : "";
      setMNote({ ok: false, msg: d || t("error") });
    } finally {
      setMBusy(false);
    }
  }

  return (
    <div className="ppanel" data-ai-target={mine.length ? undefined : "organization:list"}>
      <div className="ppanel__h">
        <b>{t("title")}</b>
        <span className="ahdr">
          <span className="advmuted">{mine.length}</span>
          <button className="btn btn--pri btn--sm" type="button" onClick={() => setCreateOpen(true)} data-ai-target="button:create-organization">
            <IconPlus />
            {t("create")}
          </button>
        </span>
      </div>
      <p className="advmuted" style={{ marginBottom: 16 }}>{t("lead")}</p>

      {orgs.status === "loading" ? (
        <Skeleton rows={3} />
      ) : !mine.length ? (
        <EmptyState icon={<IconBuilding />} title={t("empty")} text={t("emptyText")} />
      ) : (
        <div className="alist" data-ai-target="organization:list" data-ai-label={t("title")}>
          {mine.map((o, i) => (
            <AdminItem
              key={o.id}
              index={i + 1}
              title={o.name}
              meta={[o.region, o.inn].filter(Boolean).join(" · ")}
              tags={[{ label: ts.has(o.verificationStatus) ? ts(o.verificationStatus) : o.verificationStatus || t("pending"), tone: o.verificationStatus === "verified" ? "ok" : "muted" }]}
              right={
                <span className="ahdr">
                  {o.ownerUserId === me ? (
                    <Link className="btn btn--pri btn--sm" href={`/portal/advocate/organization/${encodeURIComponent(o.id)}`}>
                      <IconChartBar />
                      {t("manage")}
                    </Link>
                  ) : null}
                  <button className="btn btn--soft btn--sm" type="button" onClick={() => setMembersOrg(o)}>
                    <IconUsers />
                    {t("members")}
                  </button>
                </span>
              }
            />
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t("create")}>
        <AdminForm
          fields={[
            { name: "name", label: t("name"), required: true },
            { name: "phone", label: t("phone"), placeholder: "+998 __ ___ __ __" },
            { name: "inn", label: t("inn") },
            { name: "region", label: t("region") },
            { name: "address", label: t("address"), type: "textarea" },
          ]}
          onSubmit={async (v) =>
            void (await createOrganization({
              name: String(v.name),
              organization_type: "advokat_tashkiloti",
              phone: String(v.phone),
              inn: String(v.inn),
              region: String(v.region),
              address: String(v.address),
            }))
          }
          submitLabel={t("save")}
          busyLabel={t("saving")}
          okMsg={t("created")}
          errMsg={t("error")}
          onDone={() => {
            reload();
            setCreateOpen(false);
          }}
        />
      </Modal>

      <Modal open={!!membersOrg} onClose={() => setMembersOrg(null)} title={membersOrg?.name || t("members")}>
        {mLoading ? (
          <Skeleton rows={2} />
        ) : (
          <>
            {members.length ? (
              <div className="alist" style={{ marginBottom: 14 }}>
                {members.map((m, i) => (
                  <AdminItem key={m.id} index={i + 1} title={m.title || t("member")} meta={m.status && ts.has(m.status) ? ts(m.status) : m.status} />
                ))}
              </div>
            ) : (
              <EmptyState icon={<IconUsers />} title={t("noMembers")} />
            )}
            <form className="cform" style={{ maxWidth: "none" }} onSubmit={addMember} data-ai-target="organization:add-member" data-ai-label={t("addMember")}>
              <UserSelect value={uid} onChange={setUid} label={t("member")} placeholder={t("selectMember")} />
              <div>
                <label>{t("memberTitle")}</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("memberTitlePh")} />
              </div>
              {mNote ? <Notice ok={mNote.ok} msg={mNote.msg} /> : null}
              <button className="btn btn--pri" type="submit" disabled={!uid || mBusy}>
                {mBusy ? t("saving") : t("addMember")}
              </button>
            </form>
          </>
        )}
      </Modal>
    </div>
  );
}
