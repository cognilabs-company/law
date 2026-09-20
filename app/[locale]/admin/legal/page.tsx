"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  listAdminConsentDocs,
  listUserConsents,
  saveConsentDoc,
  cmpVersion,
  searchUsers,
  type ConsentDoc,
  type UserConsentRow,
} from "@/lib/services/backend";
import { useResource } from "@/lib/useResource";
import { Notice } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import SearchSelect from "@/components/SearchSelect";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { ApiError } from "@/lib/http";
import { IconFileText, IconShieldCheck, IconPlus, IconEye } from "@/components/icons";

// T0-18: the 10 legal documents (S-53) with their versions and the consents
// journal (who accepted what, when, from which IP). The seed only ships 3
// slugs with placeholder text; missing ones are listed as "not published"
// so the PM texts can be entered from here — never in code.
const REQUIRED_SLUGS = [
  "terms",
  "privacy",
  "cookie",
  "advocate_partnership",
  "organization_agreement",
  "client_provider_contract",
  "payment_refund_warranty",
  "platform_rules",
  "personal_data",
  "age_18",
] as const;
const PLACEHOLDER_MAX = 120; // shorter body = still a placeholder

function fmt(s: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s || "—" : d.toLocaleString("ru-RU");
}
const isForbidden = (e: unknown) => e instanceof ApiError && e.status === 403;
const isMissingRoute = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status === 501);

export default function AdminLegal() {
  const t = useTranslations("admin.legal");
  const [tab, setTab] = useState<"docs" | "journal">("docs");
  const [key, setKey] = useState(0);
  const docs = useResource(listAdminConsentDocs, [key]);
  const [view, setView] = useState<ConsentDoc | null>(null);
  const [edit, setEdit] = useState<Partial<ConsentDoc> | null>(null);

  // Slug → versions (newest first).
  const bySlug = useMemo(() => {
    const m = new Map<string, ConsentDoc[]>();
    for (const d of docs.data) { if (!m.has(d.slug)) m.set(d.slug, []); m.get(d.slug)!.push(d); }
    for (const v of m.values()) v.sort((a, b) => cmpVersion(b.version, a.version));
    return m;
  }, [docs.data]);
  const slugs = [...REQUIRED_SLUGS, ...[...bySlug.keys()].filter((s) => !(REQUIRED_SLUGS as readonly string[]).includes(s))];
  const nameOf = (slug: string) => (t.has(`slugs.${slug}`) ? t(`slugs.${slug}`) : slug);
  const published = slugs.filter((s) => bySlug.get(s)?.some((d) => d.active && d.body.length > PLACEHOLDER_MAX)).length;

  return (
    <>
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("title")}</b>
          <span className="advmuted">{t("readiness", { n: published, total: REQUIRED_SLUGS.length })}</span>
        </div>
        <p className="ppanel__note">{t("lead")}</p>
        <div className="tabs" role="tablist" style={{ marginBottom: 0 }}>
          <button type="button" role="tab" aria-selected={tab === "docs"} className="tab" onClick={() => setTab("docs")}><IconFileText />{t("tabDocs")}</button>
          <button type="button" role="tab" aria-selected={tab === "journal"} className="tab" onClick={() => setTab("journal")}><IconShieldCheck />{t("tabJournal")}</button>
        </div>
      </div>

      {tab === "docs" ? (
        <div className="ppanel">
          <div className="ppanel__h">
            <b>{t("docsTitle")}</b>
            <button type="button" className="btn btn--pri btn--sm" onClick={() => setEdit({ slug: "", version: "1.0", title: "", body: "", active: true })}><IconPlus />{t("newDoc")}</button>
          </div>
          {docs.status === "loading" ? (
            <Skeleton rows={5} />
          ) : docs.status === "error" ? (
            <Notice ok={false} msg={t("loadError")} />
          ) : (
            <div className="alist">
              {slugs.map((slug) => {
                const versions = bySlug.get(slug) ?? [];
                const cur = versions.find((d) => d.active) ?? versions[0];
                const state = !cur ? "missing" : cur.body.length <= PLACEHOLDER_MAX ? "placeholder" : "ready";
                return (
                  <div className="aitem" key={slug}>
                    <div className="aitem__m">
                      <b>{nameOf(slug)}</b>
                      <span className="aitem__meta">
                        <code>{slug}</code>
                        {cur ? ` · v${cur.version} · ${fmt(cur.createdAt)}` : ""}
                        {versions.length > 1 ? ` · ${t("versions", { n: versions.length })}` : ""}
                      </span>
                      <div className="aitem__tags">
                        <em className={`atag${state === "ready" ? " atag--ok" : state === "missing" ? "" : " atag--muted"}`}>{t(`state.${state}`)}</em>
                      </div>
                    </div>
                    <div className="aitem__acts">
                      {cur ? <button type="button" className="btn btn--line btn--sm" onClick={() => setView(cur)}><IconEye />{t("view")}</button> : null}
                      <button type="button" className="btn btn--soft btn--sm" onClick={() => setEdit(cur ? { ...cur, version: bump(cur.version) } : { slug, version: "1.0", title: nameOf(slug), body: "", active: true })}>
                        {cur ? t("newVersion") : t("publish")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <Journal />
      )}

      <Modal open={!!view} onClose={() => setView(null)} title={view ? `${view.title} · v${view.version}` : ""}>
        {view ? (
          <div className="legaldoc">
            <p className="advmuted">{fmt(view.createdAt)} · <code>{view.slug}</code> · {view.active ? t("active") : t("inactive")}</p>
            <pre className="legaldoc__body">{view.body}</pre>
          </div>
        ) : null}
      </Modal>

      <EditModal doc={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setKey((k) => k + 1); }} />
    </>
  );
}

// "1.2" → "1.3"; anything else → "<v>.1".
function bump(v: string): string {
  const m = /^(.*?)(\d+)$/.exec(v.trim());
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${v}.1`;
}

function EditModal({ doc, onClose, onSaved }: { doc: Partial<ConsentDoc> | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("admin.legal");
  const [form, setForm] = useState<{ slug: string; version: string; title: string; body: string; active: boolean; major: boolean; key: string }>({ slug: "", version: "", title: "", body: "", active: true, major: true, key: "" });
  // Re-seed the form when a different document opens (compared during render).
  const key = doc ? `${doc.slug}|${doc.version}|${doc.id ?? ""}` : "";
  if (doc && form.key !== key) setForm({ slug: doc.slug ?? "", version: doc.version ?? "1.0", title: doc.title ?? "", body: doc.body ?? "", active: doc.active ?? true, major: true, key });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      await saveConsentDoc({ slug: form.slug.trim(), version: form.version.trim(), title: form.title.trim(), body: form.body, active: form.active, major: form.major });
      setNote({ ok: true, msg: t("saved") });
      onSaved();
    } catch (err) {
      setNote({ ok: false, msg: isMissingRoute(err) ? t("noWriteApi") : isForbidden(err) ? t("forbidden") : err instanceof ApiError ? err.detail || t("saveError") : t("saveError") });
    } finally {
      setBusy(false);
    }
  }
  const levelOpts = [{ value: "major", label: t("levelMajor") }, { value: "minor", label: t("levelMinor") }];

  return (
    <Modal open={!!doc} onClose={onClose} title={doc?.id ? t("newVersionTitle") : t("newDocTitle")}>
      <form className="cform" style={{ maxWidth: "none" }} onSubmit={submit}>
        <div className="cform__row2">
          <div>
            <label>{t("slug")}</label>
            <input value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="terms" readOnly={!!doc?.id} className={doc?.id ? "rf__ro" : undefined} />
          </div>
          <div>
            <label>{t("version")}</label>
            <input value={form.version} onChange={(e) => set({ version: e.target.value })} placeholder="1.0" />
          </div>
        </div>
        <div>
          <label>{t("docTitle")}</label>
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div>
          <label>{t("body")}</label>
          <textarea rows={12} value={form.body} onChange={(e) => set({ body: e.target.value })} placeholder={t("bodyPh")} />
          <p className="rf__hint">{t("bodyHint", { n: form.body.length })}</p>
        </div>
        <div className="cform__row2">
          <div>
            <label>{t("level")}</label>
            <Select value={form.major ? "major" : "minor"} onChange={(v) => set({ major: v === "major" })} options={levelOpts} ariaLabel={t("level")} />
            <p className="rf__hint">{form.major ? t("levelMajorHint") : t("levelMinorHint")}</p>
          </div>
          <div>
            <label className="vac" style={{ marginTop: 26 }}>
              <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
              {t("activeNow")}
            </label>
          </div>
        </div>
        {note ? <Notice ok={note.ok} msg={note.msg} /> : null}
        <button type="submit" className="btn btn--pri btn--full" disabled={busy || !form.slug || !form.version || !form.title || !form.body.trim()}>
          {busy ? t("saving") : t("publish")}
        </button>
        <p className="rf__hint">{t("publishHint")}</p>
      </form>
    </Modal>
  );
}

function Journal() {
  const t = useTranslations("admin.legal");
  const [userSel, setUserSel] = useState<string[]>([]);
  const userId = userSel[0] ?? "";
  const [slug, setSlug] = useState("all");
  const rows = useResource(() => listUserConsents(userId), [userId]);
  const slugOpts = useMemo(() => {
    const s = [...new Set(rows.data.map((r) => r.slug).filter(Boolean))].sort();
    return [{ value: "all", label: t("allDocs") }, ...s.map((x) => ({ value: x, label: t.has(`slugs.${x}`) ? t(`slugs.${x}`) : x }))];
  }, [rows.data, t]);
  const list: UserConsentRow[] = slug === "all" ? rows.data : rows.data.filter((r) => r.slug === slug);

  return (
    <div className="ppanel">
      <div className="ppanel__h">
        <b>{t("journalTitle")}</b>
        <span className="advmuted">{rows.status === "ready" ? t("rows", { n: list.length }) : ""}</span>
      </div>
      <p className="ppanel__note">{t("journalLead")}</p>
      <div className="audit__filters">
        <div>
          <label>{t("userId")}</label>
          <SearchSelect
            value={userSel}
            onChange={setUserSel}
            onSearch={(q) => searchUsers(q).then((list) => list.map((u) => ({ value: u.id, label: u.name || u.lexgoId || u.id, sub: u.phone })))}
            placeholder={t("userIdPh")}
            searchPlaceholder={t("userIdPh")}
            emptyText={t("noUsers")}
            ariaLabel={t("userId")}
            removeLabel={t("clear")}
            single
          />
        </div>
        <div>
          <label>{t("doc")}</label>
          <Select value={slug} onChange={setSlug} options={slugOpts} ariaLabel={t("doc")} />
        </div>
      </div>
      {rows.status === "loading" ? (
        <Skeleton rows={5} />
      ) : rows.status === "error" ? (
        <Notice ok={false} msg={t("loadError")} />
      ) : !list.length ? (
        <EmptyState icon={<IconShieldCheck />} title={t("journalEmpty")} text={t("journalEmptyText")} />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="ptable">
            <thead>
              <tr><th>{t("when")}</th><th>{t("user")}</th><th>{t("doc")}</th><th>{t("version")}</th><th>IP</th></tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{fmt(r.acceptedAt)}</td>
                  <td><code>{r.userId.slice(0, 8)}…</code></td>
                  <td>{t.has(`slugs.${r.slug}`) ? t(`slugs.${r.slug}`) : r.slug || "—"}</td>
                  <td>v{r.version}</td>
                  <td>{r.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
