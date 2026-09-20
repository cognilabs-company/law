"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getServiceCategories, searchServices, type BackendCategory } from "@/lib/services/backend";
import { saveCategory, removeCategory, restoreCategory, resetCategory, type OverlaidCategory } from "@/lib/services/catalogOverrides";
import {
  createServiceCategory,
  createService,
  listAdminServices,
  deleteService,
  updateService,
  type AdminService,
} from "@/lib/services/admin";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { ApiError, errDetail } from "@/lib/http";
import { matchesSearch } from "@/lib/searchText";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { AdminForm, AdminItem, Notice, useReload } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import Select from "@/components/Select";
import ServiceEditModal from "@/components/admin/ServiceEditModal";
import { IconBriefcase, IconPlus, IconSearch, IconEdit, IconTrash, IconRefresh, IconClose, IconInfo, IconEye, IconEyeOff } from "@/components/icons";

function num(v: string | boolean): number {
  const n = parseInt(String(v || "0"), 10);
  return Number.isFinite(n) ? n : 0;
}
const som = (n?: number) => (n ? fmtUzs(n) : "—");

type StateFilter = "all" | "active" | "inactive";

const hayOf = (s: AdminService) =>
  [s.name, s.title, s.titleUzLatn, s.titleUzCyrl, s.titleRu, s.slug, s.catalogCode, s.categoryTitle].filter(Boolean).join(" ");

const isMissingEndpoint = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status === 501);

export default function AdminServices() {
  const t = useTranslations("admin");
  const ts = useTranslations("admin.services");
  const locale = useLocale();
  const [catKey, reloadCats] = useReload();
  const [svcKey, reloadSvcs] = useReload();
  // Admin sees hidden ("deleted") categories too, behind a toggle.
  const cats = useResource(() => getServiceCategories({ includeHidden: true }) as Promise<OverlaidCategory[]>, [catKey]);
  const [showHiddenCats, setShowHiddenCats] = useState(false);
  const visibleCats = useMemo(() => cats.data.filter((c) => !c.hidden), [cats.data]);
  const hiddenCats = useMemo(() => cats.data.filter((c) => c.hidden), [cats.data]);
  const [catEdit, setCatEdit] = useState<OverlaidCategory | null>(null);
  const [catDel, setCatDel] = useState<OverlaidCategory | null>(null);
  const [catBusy, setCatBusy] = useState("");
  const [catNote, setCatNote] = useState<{ ok: boolean; msg: string } | null>(null);
  async function catOp(c: BackendCategory, op: () => Promise<{ via: "backend" | "overlay" } | void>, msg: string) {
    if (catBusy) return;
    setCatBusy(c.id);
    setCatNote(null);
    try {
      const r = await op();
      setCatNote({ ok: true, msg: r && r.via === "overlay" ? `${msg} ${ts("cat.overlayNote")}` : msg });
      setCatEdit(null);
      setCatDel(null);
      reloadCats();
    } catch (e) {
      setCatNote({ ok: false, msg: errDetail(e) || t("form.error") });
    } finally {
      setCatBusy("");
    }
  }
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
  // category_id and is_active are real server-side filters (2026-09-19
  // backend); free-text stays client-side (matchesSearch below, merged with
  // the debounced /services/search remote hits) — no reason to run three
  // separate search paths for the same "q".
  const svcs = useResource(
    () => listAdminServices(locale, { categoryId: cat || undefined, isActive: state === "all" ? undefined : state === "active" }),
    [svcKey, locale, cat, state],
  );

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

  const all = svcs.data;

  const list = useMemo(() => {
    return all.filter((s) => {
      if (state === "active" && !s.isActive) return false;
      if (state === "inactive" && s.isActive) return false;
      if (cat && s.categoryId !== cat) return false;
      if (!term) return true;
      return matchesSearch(hayOf(s), term) || Boolean(remoteIds?.has(s.id));
    });
  }, [all, state, cat, term, remoteIds]);

  const catOpts = [{ value: "", label: ts("allCats") }, ...cats.data.map((c) => ({ value: c.id, label: c.name }))];

  function noteFor(e: unknown, fallback: string, ns: "edit" | "del"): string {
    if (e instanceof ApiError) {
      if (e.status === 404) return ts(`${ns}.errNotFound`);
      if (e.status === 403) return ts(`${ns}.errForbidden`);
      if (e.status >= 500) return ts(`${ns}.errServer`);
    }
    return errDetail(e) || fallback;
  }

  // GET /admin/services lists inactive rows too, so a PATCH just replaces the
  // row in place — no separate "local" bookkeeping needed any more.
  function onSaved(updated: AdminService) {
    setEdit(null);
    svcs.setData((cur) => (cur.some((s) => s.id === updated.id) ? cur.map((s) => (s.id === updated.id ? updated : s)) : [...cur, updated]));
    void svcs.refresh();
  }

  async function confirmDelete() {
    if (!del || delBusy) return;
    setDelBusy(true);
    setDelNote(null);
    try {
      await deleteService(del.id);
      svcs.setData((cur) => cur.map((s) => (s.id === del.id ? { ...s, isActive: false } : s)));
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
      svcs.setData((cur) => (cur.some((x) => x.id === updated.id) ? cur.map((x) => (x.id === updated.id ? updated : x)) : [...cur, updated]));
      setRowNote({ ok: true, msg: ts("reactivated") });
    } catch (e) {
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
            <span className="advmuted">{visibleCats.length}</span>
            {hiddenCats.length ? (
              <button type="button" className={`chip chip--muted${showHiddenCats ? " on" : ""}`} aria-pressed={showHiddenCats} onClick={() => setShowHiddenCats((v) => !v)}>
                <IconEyeOff />
                {ts("cat.hiddenChip", { n: hiddenCats.length })}
              </button>
            ) : null}
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setCatOpen(true)}>
              <IconPlus />
              {t("form.add")}
            </button>
          </span>
        </div>
        {catNote ? <Notice ok={catNote.ok} msg={catNote.msg} /> : null}
        {cats.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !cats.data.length ? (
          <EmptyState icon={<IconBriefcase />} title={t("services.catEmpty")} />
        ) : (
          <div className="alist">
            {(showHiddenCats ? hiddenCats : visibleCats).map((c, i) => (
              <AdminItem
                key={c.id}
                index={i + 1}
                title={c.name}
                meta={c.slug}
                tags={[...(c.overridden ? [{ label: ts("cat.overridden"), tone: "muted" as const }] : []), ...(c.hidden ? [{ label: ts("cat.hiddenTag"), tone: "muted" as const }] : [])]}
                actions={
                  <>
                    {c.hidden ? (
                      <button className="aitem__act" type="button" aria-label={ts("cat.restore")} title={ts("cat.restore")} disabled={catBusy === c.id} onClick={() => void catOp(c, () => restoreCategory(c.id), ts("cat.restored"))}>
                        <IconEye />
                      </button>
                    ) : null}
                    {c.overridden ? (
                      <button className="aitem__act" type="button" aria-label={ts("cat.reset")} title={ts("cat.reset")} disabled={catBusy === c.id} onClick={() => void catOp(c, () => resetCategory(c.id), ts("cat.resetDone"))}>
                        <IconRefresh />
                      </button>
                    ) : null}
                    <button className="aitem__act" type="button" aria-label={t("form.edit")} title={t("form.edit")} onClick={() => { setCatNote(null); setCatEdit(c); }}>
                      <IconEdit />
                    </button>
                    {!c.hidden ? (
                      <button className="aitem__act aitem__act--danger" type="button" aria-label={t("form.delete")} title={t("form.delete")} onClick={() => { setCatNote(null); setCatDel(c); }}>
                        <IconTrash />
                      </button>
                    ) : null}
                  </>
                }
              />
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
            {list.map((s, i) => (
              <AdminItem
                key={s.id}
                index={i + 1}
                title={s.name}
                meta={[s.categoryTitle, s.slug, s.catalogCode].filter(Boolean).join(" · ")}
                right={som(s.price)}
                tags={[
                  { label: s.isActive ? t("form.active") : t("form.inactive"), tone: s.isActive ? "ok" : "muted" },
                  { label: s.hasMetadata ? ts("tagCatalog") : ts("tagCustom"), tone: s.hasMetadata ? undefined : "muted" },
                ]}
                actions={
                  <>
                    {!s.isActive ? (
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
                    {s.isActive ? (
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
                    ) : null}
                  </>
                }
              />
            ))}
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
              options: visibleCats.map((c) => ({ value: c.id, label: c.name })),
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

      <ServiceEditModal service={edit} categories={visibleCats} onClose={() => setEdit(null)} onSaved={onSaved} />

      {/* Category edit */}
      <Modal open={catEdit !== null} onClose={() => setCatEdit(null)} title={ts("cat.editTitle")}>
        {catEdit ? (
          <AdminForm
            key={catEdit.id}
            fields={[{ name: "title", label: t("form.title"), required: true, placeholder: catEdit.slug }]}
            initialValues={{ title: catEdit.name }}
            resetOnDone={false}
            onSubmit={async (v) => void (await catOp(catEdit, () => saveCategory(catEdit.id, { title: String(v.title).trim() }), t("form.updated")))}
            submitLabel={t("form.update")}
            busyLabel={t("form.saving")}
            okMsg={t("form.updated")}
            errMsg={t("form.error")}
            onDone={() => setCatEdit(null)}
          />
        ) : null}
      </Modal>

      {/* Category delete (hide) confirm */}
      <Modal open={catDel !== null} onClose={() => setCatDel(null)} title={t("form.deleteConfirm")}>
        {catDel ? (
          <div className="cform" style={{ maxWidth: "none" }}>
            <p style={{ margin: 0 }}>
              <b>{catDel.name}</b> <span className="advmuted">{catDel.slug}</span>
            </p>
            <p className="advmuted" style={{ margin: 0 }}>{ts("cat.deleteText")}</p>
            <div className="svced__acts">
              <button className="btn btn--ghost" type="button" onClick={() => setCatDel(null)} disabled={catBusy === catDel.id}>
                {t("form.cancel")}
              </button>
              <button className="btn btn--danger" type="button" disabled={catBusy === catDel.id} onClick={() => void catOp(catDel, () => removeCategory(catDel.id), ts("cat.deleted"))}>
                {catBusy === catDel.id ? t("form.saving") : t("form.delete")}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

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
