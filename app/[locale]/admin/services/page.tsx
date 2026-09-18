"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getServiceCategories, searchServices } from "@/lib/services/backend";
import {
  createServiceCategory,
  createService,
  listAdminServices,
  deleteService,
  updateService,
  type AdminService,
} from "@/lib/services/admin";
import { useResource } from "@/lib/useResource";
import { useAuth } from "@/lib/auth";
import { fmtUzs } from "@/lib/money";
import { ApiError, errDetail } from "@/lib/http";
import { matchesSearch } from "@/lib/searchText";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { AdminForm, AdminItem, Notice, useReload } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import ServiceEditModal from "@/components/admin/ServiceEditModal";
import { IconBriefcase, IconPlus, IconSearch, IconEdit, IconTrash, IconRefresh, IconClose, IconInfo } from "@/components/icons";

function num(v: string | boolean): number {
  const n = parseInt(String(v || "0"), 10);
  return Number.isFinite(n) ? n : 0;
}
const som = (n?: number) => (n ? fmtUzs(n) : "—");

type StateFilter = "all" | "active" | "inactive";

// GET /services lists active rows only, so a service deactivated here would
// vanish with no way to bring it back. Snapshots of rows deactivated from this
// browser are kept per admin user in localStorage (honestly labelled in the
// UI) so they can be reactivated with PATCH is_active=true. Entries drop out
// as soon as the backend lists the service as active again.
const LOCAL_KEY = (uid: string) => `lexgo_admin_svc_inactive_${uid || "anon"}`;
function readLocal(uid: string): AdminService[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY(uid));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as AdminService[]).filter((s) => s && typeof s.id === "string") : [];
  } catch {
    return [];
  }
}
function writeLocal(uid: string, list: AdminService[]) {
  try {
    localStorage.setItem(LOCAL_KEY(uid), JSON.stringify(list.slice(0, 200)));
  } catch {
    /* storage unavailable: the tab keeps its in-memory copy */
  }
}

const hayOf = (s: AdminService) =>
  [s.name, s.title, s.titleUzLatn, s.titleUzCyrl, s.titleRu, s.slug, s.catalogCode, s.categoryTitle].filter(Boolean).join(" ");

const isMissingEndpoint = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status === 501);

export default function AdminServices() {
  const t = useTranslations("admin");
  const ts = useTranslations("admin.services");
  const locale = useLocale();
  const { session } = useAuth();
  const uid = session?.id ?? "";
  const [catKey, reloadCats] = useReload();
  const [svcKey, reloadSvcs] = useReload();
  const cats = useResource(getServiceCategories, [catKey]);
  const svcs = useResource(() => listAdminServices(locale), [svcKey, locale]);
  const [catOpen, setCatOpen] = useState(false);
  const [svcOpen, setSvcOpen] = useState(false);
  const [edit, setEdit] = useState<AdminService | null>(null);
  const [del, setDel] = useState<AdminService | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delNote, setDelNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [rowNote, setRowNote] = useState<{ ok: boolean; msg: string } | null>(null);
  const [reactivating, setReactivating] = useState("");

  // Filters
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [state, setState] = useState<StateFilter>("all");

  // Locally remembered inactive rows (see LOCAL_KEY). Loaded after mount so
  // the server render and the first client render agree.
  const [local, setLocal] = useState<AdminService[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => setLocal(readLocal(uid)), 0);
    return () => clearTimeout(timer);
  }, [uid]);
  const saveLocal = useCallback(
    (next: AdminService[]) => {
      setLocal(next);
      writeLocal(uid, next);
    },
    [uid],
  );
  // Anything the backend lists as active is no longer inactive.
  useEffect(() => {
    if (svcs.status !== "ready" || !local.length) return;
    const active = new Set(svcs.data.map((s) => s.id));
    if (!local.some((s) => active.has(s.id))) return;
    const timer = setTimeout(() => saveLocal(local.filter((s) => !active.has(s.id))), 0);
    return () => clearTimeout(timer);
  }, [svcs.status, svcs.data, local, saveLocal]);

  // Server search (GET /services/search): Latin/Cyrillic/Russian spellings plus
  // category, subcategory and AI category. Debounced; its hits are merged with
  // the local match. A missing endpoint switches the page to local-only search
  // with a notice; other failures just fall back silently.
  const [remote, setRemote] = useState<{ q: string; ids: Set<string>; off: boolean } | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      searchServices(term, { limit: 50 }, locale)
        .then((hits) => alive && setRemote({ q: term, ids: new Set(hits.map((h) => h.service.id)), off: false }))
        .catch((e) => alive && setRemote({ q: term, ids: new Set(), off: isMissingEndpoint(e) }));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, locale]);

  const term = q.trim();
  const remoteIds = remote && remote.q === term ? remote.ids : null;
  const serverSearchOff = Boolean(remote?.off);

  const all = useMemo<AdminService[]>(() => {
    const seen = new Set(svcs.data.map((s) => s.id));
    return [...svcs.data, ...local.filter((s) => !seen.has(s.id)).map((s) => ({ ...s, isActive: false }))];
  }, [svcs.data, local]);

  const list = useMemo(() => {
    return all.filter((s) => {
      if (state === "active" && !s.isActive) return false;
      if (state === "inactive" && s.isActive) return false;
      if (cat && s.categoryId !== cat) return false;
      if (!term) return true;
      return matchesSearch(hayOf(s), term) || Boolean(remoteIds?.has(s.id));
    });
  }, [all, state, cat, term, remoteIds]);

  const localIds = useMemo(() => new Set(local.map((s) => s.id)), [local]);
  const catOpts = [{ value: "", label: ts("allCats") }, ...cats.data.map((c) => ({ value: c.id, label: c.name }))];

  function noteFor(e: unknown, fallback: string, ns: "edit" | "del"): string {
    if (e instanceof ApiError) {
      if (e.status === 404) return ts(`${ns}.errNotFound`);
      if (e.status === 403) return ts(`${ns}.errForbidden`);
      if (e.status >= 500) return ts(`${ns}.errServer`);
    }
    return errDetail(e) || fallback;
  }

  // After a PATCH: an active row replaces its list entry; a deactivated one
  // moves to the local inactive list.
  function onSaved(updated: AdminService) {
    setEdit(null);
    if (updated.isActive) {
      svcs.setData((cur) => (cur.some((s) => s.id === updated.id) ? cur.map((s) => (s.id === updated.id ? updated : s)) : [...cur, updated]));
      if (localIds.has(updated.id)) saveLocal(local.filter((s) => s.id !== updated.id));
    } else {
      svcs.setData((cur) => cur.filter((s) => s.id !== updated.id));
      saveLocal([updated, ...local.filter((s) => s.id !== updated.id)]);
    }
    void svcs.refresh();
  }

  async function confirmDelete() {
    if (!del || delBusy) return;
    setDelBusy(true);
    setDelNote(null);
    try {
      await deleteService(del.id);
      const gone = { ...del, isActive: false };
      svcs.setData((cur) => cur.filter((s) => s.id !== gone.id));
      saveLocal([gone, ...local.filter((s) => s.id !== gone.id)]);
      setDel(null);
      setRowNote({ ok: true, msg: ts("del.done") });
    } catch (e) {
      setDelNote({ ok: false, msg: noteFor(e, t("form.deleteError"), "del") });
    } finally {
      setDelBusy(false);
    }
  }

  async function reactivate(s: AdminService) {
    if (reactivating) return;
    setReactivating(s.id);
    setRowNote(null);
    try {
      const updated = await updateService(s.id, { is_active: true }, locale);
      saveLocal(local.filter((x) => x.id !== s.id));
      svcs.setData((cur) => (cur.some((x) => x.id === updated.id) ? cur : [...cur, updated]));
      setRowNote({ ok: true, msg: ts("reactivated") });
      void svcs.refresh();
    } catch (e) {
      // The backend no longer knows this id: the local memory is stale.
      if (e instanceof ApiError && e.status === 404) saveLocal(local.filter((x) => x.id !== s.id));
      setRowNote({ ok: false, msg: noteFor(e, ts("reactivateError"), "edit") });
    } finally {
      setReactivating("");
    }
  }

  return (
    <div className="agrid svcadm__grid">
      {/* Categories */}
      <div className="ppanel">
        <div className="ppanel__h">
          <b>{t("services.catTitle")}</b>
          <span className="ahdr">
            <span className="advmuted">{cats.data.length}</span>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setCatOpen(true)}>
              <IconPlus />
              {t("form.add")}
            </button>
          </span>
        </div>
        {cats.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !cats.data.length ? (
          <EmptyState icon={<IconBriefcase />} title={t("services.catEmpty")} />
        ) : (
          <div className="alist">
            {cats.data.map((c, i) => (
              <AdminItem key={c.id} index={i + 1} title={c.name} meta={c.slug} />
            ))}
          </div>
        )}
        <p className="svcadm__hint">
          <IconInfo />
          <span>{ts("catLimitNote")}</span>
        </p>
      </div>

      {/* Services */}
      <div className="ppanel svcadm">
        <div className="ppanel__h">
          <b>{t("services.svcTitle")}</b>
          <span className="ahdr">
            <span className="advmuted">{svcs.status === "ready" ? ts("shown", { n: list.length, total: all.length }) : svcs.data.length}</span>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setSvcOpen(true)}>
              <IconPlus />
              {t("form.add")}
            </button>
          </span>
        </div>

        <div className="svcadm__tools">
          <div className="lsearch">
            <IconSearch />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ts("searchPh")} aria-label={ts("searchLabel")} />
            {q ? (
              <button type="button" className="svcadm__clear" aria-label={t("form.cancel")} onClick={() => setQ("")}>
                <IconClose />
              </button>
            ) : null}
          </div>
          <Select value={cat} onChange={setCat} options={catOpts} ariaLabel={ts("catFilter")} />
          <div className="segs segs--sm" role="tablist">
            {(["all", "active", "inactive"] as StateFilter[]).map((k) => (
              <button key={k} type="button" role="tab" className="seg" aria-selected={state === k} onClick={() => setState(k)}>
                {ts(`state.${k}`)}
              </button>
            ))}
          </div>
        </div>

        {serverSearchOff && term.length >= 2 ? (
          <p className="svcadm__hint svcadm__hint--warn">
            <IconInfo />
            <span>{ts("serverSearchOff")}</span>
          </p>
        ) : null}
        {state === "inactive" ? (
          <p className="svcadm__hint">
            <IconInfo />
            <span>{ts("inactiveNote")}</span>
          </p>
        ) : null}
        {rowNote ? <Notice ok={rowNote.ok} msg={rowNote.msg} /> : null}

        {svcs.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !all.length ? (
          <EmptyState icon={<IconBriefcase />} title={t("services.svcEmpty")} />
        ) : !list.length ? (
          <EmptyState icon={<IconSearch />} title={ts("noResults")} />
        ) : (
          <div className="alist">
            {list.map((s, i) => {
              const isLocal = !s.isActive && localIds.has(s.id);
              return (
                <AdminItem
                  key={s.id}
                  index={i + 1}
                  title={s.name}
                  meta={[s.categoryTitle, s.slug, s.catalogCode].filter(Boolean).join(" · ")}
                  right={som(s.price)}
                  tags={[
                    { label: s.isActive ? t("form.active") : t("form.inactive"), tone: s.isActive ? "ok" : "muted" },
                    { label: s.hasMetadata ? ts("tagCatalog") : ts("tagCustom"), tone: s.hasMetadata ? undefined : "muted" },
                    ...(isLocal ? [{ label: ts("localOnly"), tone: "muted" as const }] : []),
                  ]}
                  actions={
                    <>
                      {isLocal ? (
                        <button
                          className="aitem__act"
                          type="button"
                          aria-label={ts("reactivate")}
                          title={ts("reactivate")}
                          disabled={reactivating === s.id}
                          onClick={() => void reactivate(s)}
                        >
                          <IconRefresh />
                        </button>
                      ) : null}
                      <button className="aitem__act" type="button" aria-label={t("form.edit")} title={t("form.edit")} onClick={() => setEdit(s)}>
                        <IconEdit />
                      </button>
                      {isLocal ? (
                        <button
                          className="aitem__act aitem__act--danger"
                          type="button"
                          aria-label={ts("forget")}
                          title={ts("forget")}
                          onClick={() => saveLocal(local.filter((x) => x.id !== s.id))}
                        >
                          <IconClose />
                        </button>
                      ) : (
                        <button
                          className="aitem__act aitem__act--danger"
                          type="button"
                          aria-label={t("form.delete")}
                          title={t("form.delete")}
                          onClick={() => {
                            setDelNote(null);
                            setDel(s);
                          }}
                        >
                          <IconTrash />
                        </button>
                      )}
                    </>
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      <Modal open={catOpen} onClose={() => setCatOpen(false)} title={t("services.catCreate")}>
        <AdminForm
          fields={[
            { name: "title", label: t("form.title"), required: true },
            { name: "slug", label: t("form.slug"), required: true, placeholder: "criminal" },
            { name: "description", label: t("form.description"), type: "textarea" },
          ]}
          onSubmit={async (v) =>
            void (await createServiceCategory({ slug: String(v.slug), title: String(v.title), description: String(v.description) }))
          }
          submitLabel={t("form.save")}
          busyLabel={t("form.saving")}
          okMsg={t("form.created")}
          errMsg={t("form.error")}
          onDone={() => {
            reloadCats();
            setCatOpen(false);
          }}
        />
      </Modal>

      <Modal open={svcOpen} onClose={() => setSvcOpen(false)} title={t("services.svcCreate")}>
        <AdminForm
          fields={[
            {
              name: "category_id",
              label: t("form.category"),
              type: "select",
              required: true,
              placeholder: t("form.selectCategory"),
              options: cats.data.map((c) => ({ value: c.id, label: c.name })),
            },
            { name: "title", label: t("form.title"), required: true },
            { name: "slug", label: t("form.slug"), required: true },
            { name: "description", label: t("form.description"), type: "textarea" },
            { name: "base_price", label: t("form.basePrice"), type: "number", placeholder: "150000" },
            { name: "delivery_minutes", label: t("form.deliveryMinutes"), type: "number", placeholder: "60" },
            { name: "is_active", label: t("form.active"), type: "checkbox" },
          ]}
          onSubmit={async (v) =>
            void (await createService({
              category_id: String(v.category_id),
              slug: String(v.slug),
              title: String(v.title),
              description: String(v.description),
              base_price: num(v.base_price),
              currency: "UZS",
              delivery_minutes: num(v.delivery_minutes),
              is_active: v.is_active as boolean,
            }))
          }
          submitLabel={t("form.save")}
          busyLabel={t("form.saving")}
          okMsg={t("form.created")}
          errMsg={t("form.error")}
          onDone={() => {
            reloadSvcs();
            setSvcOpen(false);
          }}
        />
      </Modal>

      <ServiceEditModal service={edit} categories={cats.data} onClose={() => setEdit(null)} onSaved={onSaved} />

      {/* Delete (soft) confirm */}
      <Modal open={del !== null} onClose={() => setDel(null)} title={ts("del.title")}>
        {del ? (
          <div className="cform" style={{ maxWidth: "none" }}>
            <p style={{ margin: 0 }}>
              <b>{del.name}</b>
              {del.slug ? <span className="advmuted"> · {del.slug}</span> : null}
            </p>
            <p className="advmuted" style={{ margin: 0 }}>{ts("del.text")}</p>
            <p className="advmuted" style={{ margin: 0 }}>{ts("del.localHint")}</p>
            {delNote ? <Notice ok={delNote.ok} msg={delNote.msg} /> : null}
            <div className="svced__acts">
              <button className="btn btn--ghost" type="button" onClick={() => setDel(null)} disabled={delBusy}>
                {t("form.cancel")}
              </button>
              <button className="btn btn--danger" type="button" onClick={() => void confirmDelete()} disabled={delBusy}>
                {delBusy ? ts("del.busy") : ts("del.cta")}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
