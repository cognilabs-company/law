"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { addOrgMember, createOrganization, listLawyers, listOrgMembers, listOrganizations, type BackendLawyer, type OrgMember, type Organization } from "@/lib/services/backend";
import { IconAlert, IconBriefcase, IconBuilding, IconChartBar, IconPlus, IconRefresh, IconUserPlus, IconUsers } from "@/components/icons";
import { App, Avatar, Banner, Btn, Dialog, Empty, Field, Input, Loading, Search, Sidebar, Tag, TextArea, Tool, Toolbar, useOs, useToast, type NavSection } from "../kit/kit";
import type { NativeProps } from "../native";
import "./org.css";

// The advocate's organization as a desktop program: the organizations on
// the side, the chosen one's card and its members, adding a member found
// among LexGo's lawyers, creating a new organization. The owner's dashboard
// and a member's services open in this window.

export default function OrgApp(props: NativeProps) {
  const deep = /\/organization\/[^/]+/.test(props.route);
  return deep ? <Deep {...props} /> : <Orgs {...props} />;
}

function Deep({ route, base, openApp }: NativeProps) {
  const t = useTranslations("portal.org");
  const d = useTranslations("portal.desk.org");
  const locale = useLocale();
  const os = useOs();
  return (
    <App name="org-deep">
      <Toolbar title={t("title")} back={{ label: d("back"), onClick: () => openApp("organization", `${base}/organization`) }} />
      <iframe className="dxg-deep" name={`lexgo-desk:${os}:org`} src={`/${locale}${route}`} title={t("title")} />
    </App>
  );
}

function Orgs({ base, openApp }: NativeProps) {
  const t = useTranslations("portal.org");
  const ts = useTranslations("portal.org.statusMap");
  const d = useTranslations("portal.desk.org");
  const os = useOs();
  const me = useAuth().session?.id ?? "";
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState("");
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [lawyers, setLawyers] = useState<BackendLawyer[]>([]);
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tick, setTick] = useState(0);
  const [toast, say] = useToast();

  useEffect(() => {
    let alive = true;
    listOrganizations()
      .then((l) => {
        if (!alive) return;
        const mine = l.filter((o) => !o.ownerUserId || o.ownerUserId === me);
        setOrgs(mine);
        setSel((s) => s || mine[0]?.id || "");
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [me, tick]);
  useEffect(() => {
    if (!sel) return;
    let alive = true;
    const h = setTimeout(() => alive && setMembers(null), 0);
    listOrgMembers(sel)
      .then((l) => alive && setMembers(l))
      .catch(() => alive && setMembers([]));
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [sel, tick]);
  useEffect(() => {
    if (!adding || lawyers.length) return;
    listLawyers()
      .then(setLawyers)
      .catch(() => undefined);
  }, [adding, lawyers.length]);

  const org = (orgs ?? []).find((o) => o.id === sel) ?? null;
  const owner = !!org && org.ownerUserId === me;
  const nameOf = useMemo(() => new Map(lawyers.map((l) => [l.userId, l.name])), [lawyers]);
  const sections: NavSection[] = [{ id: "o", title: os === "mac" ? t("title") : undefined, items: (orgs ?? []).map((o) => ({ id: o.id, label: o.name, icon: <IconBuilding /> })) }];
  const status = (s: string) => (s && ts.has(s) ? ts(s) : s || t("pending"));

  return (
    <App name="org" sidebar={<Sidebar label={t("title")} sections={sections} value={sel} onChange={setSel} footer={<Btn kind="plain" small icon={<IconPlus />} onClick={() => setCreating(true)}>{t("create")}</Btn>} />}>
      <Toolbar title={org?.name || t("title")} subtitle={org ? [org.region, org.inn].filter(Boolean).join(" · ") : t("lead")}>
        {org && owner ? <Tool icon={<IconChartBar />} label={t("manage")} onClick={() => openApp("organization", `${base}/organization/${encodeURIComponent(org.id)}`)} /> : null}
        {org ? <Tool icon={<IconUserPlus />} label={t("addMember")} primary onClick={() => setAdding(true)} /> : null}
        <Tool icon={<IconPlus />} label={t("create")} onClick={() => setCreating(true)} />
        <Tool icon={<IconRefresh />} label={d("refresh")} onClick={() => setTick((n) => n + 1)} />
      </Toolbar>
      {orgs === null ? (
        failed ? (
          <Empty icon={<IconAlert />} title={t("error")} />
        ) : (
          <Loading label={d("loading")} />
        )
      ) : !orgs.length ? (
        <Empty icon={<IconBuilding />} title={t("empty")} text={t("emptyText")} action={<Btn kind="primary" icon={<IconPlus />} onClick={() => setCreating(true)}>{t("create")}</Btn>} />
      ) : org ? (
        <div className="dxg dx-scroll">
          <section className="dxg-card">
            <span className="dxg-card__ic" aria-hidden>
              <IconBuilding />
            </span>
            <div>
              <h2>{org.name}</h2>
              <p>{[org.phone, org.address].filter(Boolean).join(" · ")}</p>
            </div>
            <Tag tone={org.verificationStatus === "verified" ? "ok" : "warn"}>{status(org.verificationStatus)}</Tag>
          </section>
          <section className="dxg-box">
            <h3>
              <IconUsers aria-hidden />
              {t("members")}
              {members ? <small>{members.length}</small> : null}
            </h3>
            {members === null ? (
              <Loading label={t("members")} />
            ) : !members.length ? (
              <p className="dxg-muted">{t("noMembers")}</p>
            ) : (
              <ul className="dxg-members">
                {members.map((m) => (
                  <li key={m.id}>
                    <Avatar name={nameOf.get(m.userId) || m.title || "?"} size={34} />
                    <span>
                      <b>{nameOf.get(m.userId) || m.title || t("member")}</b>
                      <small>{[m.title, status(m.status)].filter(Boolean).join(" · ")}</small>
                    </span>
                    {owner && m.userId ? (
                      <Btn small icon={<IconBriefcase />} onClick={() => openApp("organization", `${base}/organization/${encodeURIComponent(org.id)}/members/${encodeURIComponent(m.userId)}/services`)}>
                        {t("memberServices")}
                      </Btn>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <Empty icon={<IconBuilding />} title={d("pick")} />
      )}
      <CreateOrg open={creating} onClose={() => setCreating(false)} onDone={() => (setCreating(false), setTick((n) => n + 1), say(t("created")))} />
      {org ? <AddMember open={adding} org={org} lawyers={lawyers} onClose={() => setAdding(false)} onDone={() => (setAdding(false), setTick((n) => n + 1), say(t("memberAdded")))} /> : null}
      {toast}
    </App>
  );
}

function CreateOrg({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("portal.org");
  const d = useTranslations("portal.desk.org");
  const [f, setF] = useState({ name: "", phone: "", inn: "", region: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  async function save() {
    if (!f.name.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      await createOrganization({ name: f.name.trim(), organization_type: "advokat_tashkiloti", phone: f.phone, inn: f.inn, region: f.region, address: f.address });
      setF({ name: "", phone: "", inn: "", region: "", address: "" });
      onDone();
    } catch {
      setErr(t("createFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      title={t("create")}
      onClose={() => !busy && onClose()}
      onSubmit={() => void save()}
      actions={
        <>
          <Btn onClick={onClose} disabled={busy}>
            {d("cancel")}
          </Btn>
          <Btn kind="primary" type="submit" busy={busy} disabled={!f.name.trim()}>
            {t("save")}
          </Btn>
        </>
      }
    >
      <Field label={t("name")}>
        <Input value={f.name} onChange={(v) => set({ name: v })} required autoFocus maxLength={200} />
      </Field>
      <div className="dxg-form2">
        <Field label={t("phone")}>
          <Input type="tel" value={f.phone} onChange={(v) => set({ phone: v })} placeholder="+998 __ ___ __ __" />
        </Field>
        <Field label={t("inn")}>
          <Input value={f.inn} onChange={(v) => set({ inn: v.replace(/\D/g, "").slice(0, 9) })} />
        </Field>
      </div>
      <Field label={t("region")}>
        <Input value={f.region} onChange={(v) => set({ region: v })} />
      </Field>
      <Field label={t("address")}>
        <TextArea value={f.address} onChange={(v) => set({ address: v })} rows={2} />
      </Field>
      {err ? <Banner tone="err" title={err} /> : null}
    </Dialog>
  );
}

function AddMember({ open, org, lawyers, onClose, onDone }: { open: boolean; org: Organization; lawyers: BackendLawyer[]; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("portal.org");
  const d = useTranslations("portal.desk.org");
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<BackendLawyer | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const hits = q.trim().length >= 2 ? lawyers.filter((l) => `${l.name} ${l.phone} ${l.publicId ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12) : [];
  async function save() {
    if (!pick || busy) return;
    setBusy(true);
    setErr("");
    try {
      await addOrgMember(org.id, { user_id: pick.userId, title: title.trim() });
      setPick(null);
      setTitle("");
      onDone();
    } catch {
      setErr(t("memberAddFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      title={t("addMember")}
      onClose={() => !busy && onClose()}
      onSubmit={() => void save()}
      width={480}
      actions={
        <>
          <Btn onClick={onClose} disabled={busy}>
            {d("cancel")}
          </Btn>
          <Btn kind="primary" type="submit" busy={busy} disabled={!pick}>
            {t("addMember")}
          </Btn>
        </>
      }
    >
      {pick ? (
        <div className="dxg-picked">
          <Avatar name={pick.name} size={34} />
          <span>
            <b>{pick.name}</b>
            <small>{[pick.region, pick.phone].filter(Boolean).join(" · ")}</small>
          </span>
          <Btn small kind="plain" onClick={() => setPick(null)}>
            {d("change")}
          </Btn>
        </div>
      ) : (
        <Field label={t("member")}>
          <Search value={q} onChange={setQ} placeholder={t("selectMember")} wide />
          <div className="dxg-hits">
            {q.trim().length < 2 ? (
              <p className="dxg-muted">{d("typeMore")}</p>
            ) : !lawyers.length ? (
              <Loading label={t("selectMember")} />
            ) : !hits.length ? (
              <p className="dxg-muted">{d("noResults")}</p>
            ) : (
              hits.map((l) => (
                <button key={l.userId || l.id} type="button" onClick={() => setPick(l)}>
                  <Avatar name={l.name} size={28} />
                  <span>
                    <b>{l.name}</b>
                    <small>{[l.region, l.publicId].filter(Boolean).join(" · ")}</small>
                  </span>
                </button>
              ))
            )}
          </div>
        </Field>
      )}
      <Field label={t("memberTitle")}>
        <Input value={title} onChange={setTitle} placeholder={t("memberTitlePh")} maxLength={120} />
      </Field>
      {err ? <Banner tone="err" title={err} /> : null}
    </Dialog>
  );
}
