"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { searchServices, type BackendCategory } from "@/lib/services/backend";
import { sessionRoles, useAuth } from "@/lib/auth";
import { CATEGORY_PATH_SEP, categoryPathLabel, descendantIds, flattenCategoryTree, getCategoryTree, invalidateCategoryTree, type CategoryRow } from "@/lib/services/categoryTree";
import {
  createService,
  listAdminServices,
  deleteService,
  replaceProfessionalCatalog,
  updateService,
  type AdminService,
  type AdminServiceScope,
} from "@/lib/services/admin";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { ApiError } from "@/lib/http";
import { notify } from "@/lib/toast";
import { matchesSearch } from "@/lib/searchText";
import { Skeleton, EmptyState } from "@/components/portal/DataState";
import { AdminForm, AdminItem, useReload } from "@/components/admin/AdminBits";
import Modal from "@/components/admin/Modal";
import FilterBar from "@/components/filters/FilterBar";
import ServiceEditModal from "@/components/admin/ServiceEditModal";
import { useAiSelection } from "@/lib/ai/registry";
import { IconAlert, IconBriefcase, IconChevronRight, IconPlus, IconSearch, IconEdit, IconTrash, IconRefresh, IconInfo, IconEye, IconLayers, IconCircleCheck } from "@/components/icons";
import "./categoryTree.css";

function num(v: string | boolean): number {
  const n = parseInt(String(v || "0"), 10);
  return Number.isFinite(n) ? n : 0;
}
const som = (n?: number) => (n ? fmtUzs(n) : "—");

type StateFilter = "all" | "active" | "inactive";
// Which catalog the page is looking at (10-13 spec §1, §5): the professional
// marketplace services, the services tied to a document template, or — for
// an administrator — everything.
type Scope = AdminServiceScope | "all";
const SCOPES: Scope[] = ["marketplace", "documents", "all"];

const hayOf = (s: AdminService) =>
  [s.name, s.title, s.titleUzLatn, s.titleUzCyrl, s.titleRu, s.slug, s.catalogCode, s.categoryTitle].filter(Boolean).join(" ");

const isMissingEndpoint = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status === 501);

const STUDIO_CATEGORIES_HREF = "/admin/studio/c/K01";

const loadCategoryRows = () =>
  getCategoryTree({ includeInactive: true })
    .catch(() => getCategoryTree())
    .then(flattenCategoryTree);

const categoryAsBackend = (r: CategoryRow): BackendCategory => ({
  id: r.node.id,
  name: categoryPathLabel(r),
  slug: r.node.slug,
  description: r.node.description,
  subcategoriesCount: r.node.childrenCount,
  servicesCount: 0,
  subcategories: [],
});

function CategoryTreeRow({ row, rootIndex, active, onShow }: { row: CategoryRow; rootIndex: number; active: boolean; onShow: () => void }) {
  const ts = useTranslations("admin.services");
  const meta = [row.path.slice(0, -1).join(CATEGORY_PATH_SEP), row.node.slug].filter(Boolean).join(" · ");
  return (
    <li className={`aitem${row.node.isActive ? "" : " is-off"}`} style={{ "--svc-depth": row.depth } as CSSProperties} aria-level={row.depth + 1}>
      {row.depth ? <IconChevronRight className="svcadm-tree__branch" aria-hidden="true" /> : <span className="aitem__n" aria-hidden="true">{rootIndex}</span>}
      <div className="aitem__m">
        <b title={row.node.title}>{row.node.title}</b>
        {meta ? <span className="aitem__meta">{meta}</span> : null}
        <div className="aitem__tags">
          {row.depth ? <em className="atag atag--muted">{ts("catTree.level", { n: row.depth + 1 })}</em> : null}
          {row.node.childrenCount ? <em className="atag atag--muted">{ts("catTree.children", { n: row.node.childrenCount })}</em> : null}
          {row.node.isActive ? null : <em className="atag atag--muted">{ts("catTree.inactive")}</em>}
        </div>
      </div>
      <div className="aitem__acts">
        <button className="aitem__act" type="button" aria-label={ts("catTree.showServices", { name: row.node.title })} title={ts("scope.showServices")} onClick={onShow} aria-pressed={active}>
          <IconEye />
        </button>
      </div>
    </li>
  );
}

export default function AdminServices() {
  const t = useTranslations("admin");
  const ts = useTranslations("admin.services");
  const locale = useLocale();
  const { session } = useAuth();
  const roles = sessionRoles(session);
  const canManage = roles.includes("superadmin") || roles.includes("admin") || Boolean(session?.permissions?.includes("services.manage"));
  const [scope, setScope] = useState<Scope>("marketplace");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [catKey, reloadCats] = useReload();
  const cats = useResource(loadCategoryRows, [catKey]);
  const refreshCats = () => {
    invalidateCategoryTree();
    reloadCats();
  };
  const activeCats = useMemo(() => cats.data.filter((r) => r.node.isActive), [cats.data]);
  const rootIndex = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of cats.data) if (!r.depth) m.set(r.node.id, m.size + 1);
    return m;
  }, [cats.data]);
  const [svcKey, reloadSvcs] = useReload();
  const [svcOpen, setSvcOpen] = useState(false);
  const [edit, setEdit] = useState<AdminService | null>(null);
  const [del, setDel] = useState<AdminService | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [reactivating, setReactivating] = useState("");

  // Filters
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  // The professional catalog is always asked for by is_active: the live
  // list by default, the archive on request.
  const [state, setState] = useState<StateFilter>("active");
  const catScope = useMemo(() => (cat ? new Set([cat, ...descendantIds(cat, cats.data)]) : null), [cat, cats.data]);
  const serverCat = catScope && catScope.size === 1 ? cat : "";
  // category_id and is_active are real server-side filters (2026-09-19
  // backend); free-text stays client-side (matchesSearch below, merged with
  // the debounced /services/search remote hits) — no reason to run three
  // separate search paths for the same "q".
  const svcs = useResource(
    () => listAdminServices(locale, { categoryId: serverCat || undefined, isActive: state === "all" ? undefined : state === "active", scope: scope === "all" ? undefined : scope }),
    [svcKey, locale, serverCat, state, scope],
  );
  // Categories and services used to pop in separately — whichever request
  // resolved first showed its panel while the other still sat on its own
  // skeleton. Wait for both to settle once, then render the page together;
  // a later reload (edit/delete/filter change) only re-triggers its own
  // resource and doesn't drop back to this full-page gate.
  const [everReady, setEverReady] = useState(false);
  const allLoading = cats.status === "loading" || svcs.status === "loading";
  if (!everReady && !allLoading) setEverReady(true);

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

  const all = useMemo(() => (catScope ? svcs.data.filter((s) => catScope.has(s.categoryId ?? "")) : svcs.data), [svcs.data, catScope]);

  const list = useMemo(() => {
    return all.filter((s) => {
      if (state === "active" && !s.isActive) return false;
      if (state === "inactive" && s.isActive) return false;
      if (!term) return true;
      return matchesSearch(hayOf(s), term) || Boolean(remoteIds?.has(s.id));
    });
  }, [all, state, term, remoteIds]);

  const scopeCats = cats.data.map((r) => ({ value: r.node.id, label: r.node.isActive ? categoryPathLabel(r) : `${categoryPathLabel(r)} · ${ts("catTree.inactive")}` }));
  const catOpts = [{ value: "", label: ts("allCats") }, ...scopeCats];
  const stateOpts = ((scope === "marketplace" ? ["active", "inactive"] : ["all", "active", "inactive"]) as StateFilter[]).map((k) => ({ value: k, label: scope === "marketplace" && k === "inactive" ? ts("scope.archive") : ts(`state.${k}`) }));
  const editCats = cats.data
    .filter((r) => r.node.isActive || r.node.id === edit?.categoryId)
    .map((r) => (r.node.isActive ? categoryAsBackend(r) : { ...categoryAsBackend(r), name: `${categoryPathLabel(r)} · ${ts("catTree.inactive")}` }));
  const pickScope = (next: Scope) => {
    setScope(next);
    setCat("");
    if (next === "marketplace" && state === "all") setState("active");
  };

  // One press, one request: the endpoint is idempotent, but nothing here
  // repeats it on its own.
  async function replaceCatalog() {
    if (replaceBusy) return;
    setReplaceBusy(true);
    try {
      await replaceProfessionalCatalog();
      setReplaceOpen(false);
      notify.success(ts("scope.replaceDone"), { id: "svc-replace" });
      refreshCats();
      reloadSvcs();
    } catch (e) {
      notify.error(ts("scope.replaceError"), { id: "svc-replace", error: e, map: { 403: ts("edit.errForbidden") } });
    } finally {
      setReplaceBusy(false);
    }
  }
  useAiSelection("admin_services_state", state === "all" ? "" : state);

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
    try {
      await deleteService(del.id);
      svcs.setData((cur) => cur.map((s) => (s.id === del.id ? { ...s, isActive: false } : s)));
      setDel(null);
      notify.success(ts("del.done"), { id: `svc-del-${del.id}`, body: del.name });
    } catch (e) {
      notify.error(t("form.deleteError"), { id: `svc-del-${del.id}`, error: e, map: { 404: ts("del.errNotFound"), 403: ts("del.errForbidden") } });
    } finally {
      setDelBusy(false);
    }
  }

  async function reactivate(s: AdminService) {
    if (reactivating) return;
    setReactivating(s.id);
    try {
      const updated = await updateService(s.id, { is_active: true }, locale);
      svcs.setData((cur) => (cur.some((x) => x.id === updated.id) ? cur.map((x) => (x.id === updated.id ? updated : x)) : [...cur, updated]));
      notify.success(ts("reactivated"), { id: `svc-react-${s.id}`, body: s.name });
    } catch (e) {
      notify.error(ts("reactivateError"), { id: `svc-react-${s.id}`, error: e, map: { 404: ts("edit.errNotFound"), 403: ts("edit.errForbidden") } });
    } finally {
      setReactivating("");
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
    <>
    <div className="svcadm__scope">
      <div className="hrm-tabs" role="tablist" aria-label={ts("scope.label")}>
        {SCOPES.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={scope === k} className={scope === k ? "on" : ""} onClick={() => pickScope(k)} data-ai-target={`services:scope-${k}`}>
            {ts(`scope.${k}`)}
          </button>
        ))}
      </div>
      <p className="svcadm__scopehint">{ts(`scope.${scope}Hint`)}</p>
      {scope === "marketplace" && canManage ? (
        <button type="button" className="btn btn--line btn--sm" onClick={() => setReplaceOpen(true)} data-ai-target="button:replace-professional">
          <IconRefresh />
          {ts("scope.replace")}
        </button>
      ) : null}
    </div>
    <div className="agrid svcadm__grid">
      <div className="ppanel" data-ai-target="services:categories">
        <div className="ppanel__h">
          <b>{t("services.catTitle")}</b>
          <span className="ahdr">
            <span className="advmuted">{cats.status === "ready" ? cats.data.length : ""}</span>
          </span>
        </div>
        <p className="svcadm__hint svcadm-tree__note">
          <IconInfo />
          <span>
            {ts("catTree.studioNote")} <Link href={STUDIO_CATEGORIES_HREF}>{ts("catTree.studioLink")}</Link>
          </span>
        </p>
        {cats.status === "loading" ? (
          <Skeleton rows={3} />
        ) : cats.status === "error" ? (
          <EmptyState icon={<IconAlert />} title={ts("catTree.loadError")} action={{ label: ts("catTree.retry"), onClick: refreshCats }} />
        ) : !cats.data.length ? (
          <EmptyState icon={<IconBriefcase />} title={t("services.catEmpty")} />
        ) : (
          <ul className="alist svcadm-tree" aria-label={t("services.catTitle")}>
            {cats.data.map((r) => (
              <CategoryTreeRow key={r.node.id} row={r} rootIndex={rootIndex.get(r.node.id) ?? 0} active={cat === r.node.id} onShow={() => setCat(cat === r.node.id ? "" : r.node.id)} />
            ))}
          </ul>
        )}
      </div>

      {/* Services */}
      <div className="ppanel svcadm">
        <div className="ppanel__h">
          <b>{t("services.svcTitle")}</b>
          <span className="ahdr">
            <span className="advmuted">{svcs.status === "ready" ? ts("shown", { n: list.length, total: all.length }) : svcs.data.length}</span>
            <button className="btn btn--pri btn--sm" type="button" onClick={() => setSvcOpen(true)} data-ai-target="button:new-service">
              <IconPlus />
              {t("form.add")}
            </button>
          </span>
        </div>

        <FilterBar
          className="uf--tray svcadm__filters"
          fields={[
            { key: "cat", label: ts("catFilter"), icon: IconLayers, value: cat, onChange: setCat, options: catOpts },
            { key: "state", label: ts("stateLabel"), icon: IconCircleCheck, value: state, empty: "all", onChange: (v) => setState(v as StateFilter), options: stateOpts },
          ]}
          search={{ value: q, onChange: setQ, placeholder: ts("searchPh"), label: ts("searchLabel") }}
          count={svcs.status === "ready" ? list.length : undefined}
          aiTarget="services:filters"
        />

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

        {svcs.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !all.length ? (
          <EmptyState icon={<IconBriefcase />} title={t("services.svcEmpty")} />
        ) : !list.length ? (
          <EmptyState icon={<IconSearch />} title={ts("noResults")} />
        ) : (
          <div className="alist" data-ai-target="services:list">
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
                        onClick={() => setDel(s)}
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

      <Modal open={svcOpen} onClose={() => setSvcOpen(false)} title={t("services.svcCreate")}>
        <AdminForm
          fields={[
            {
              name: "category_id",
              label: t("form.category"),
              type: "select",
              required: true,
              placeholder: t("form.selectCategory"),
              options: activeCats.map((r) => ({ value: r.node.id, label: categoryPathLabel(r) })),
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
          errMsg={t("form.saveFailed")}
          onDone={() => {
            reloadSvcs();
            setSvcOpen(false);
          }}
        />
      </Modal>

      <ServiceEditModal service={edit} categories={editCats} professional={Boolean(edit && !edit.documentTemplateId && scope === "marketplace")} onClose={() => setEdit(null)} onSaved={onSaved} />

      {/* Delete (soft) confirm */}
      <Modal open={del !== null} onClose={() => setDel(null)} title={ts("del.title")}>
        {del ? (
          <div className="cform" style={{ maxWidth: "none" }}>
            <p style={{ margin: 0 }}>
              <b>{del.name}</b>
              {del.slug ? <span className="advmuted"> · {del.slug}</span> : null}
            </p>
            <p className="advmuted" style={{ margin: 0 }}>{ts("del.text")}</p>
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

      {/* Replace the professional catalog */}
      <Modal open={replaceOpen} onClose={() => !replaceBusy && setReplaceOpen(false)} title={ts("scope.replaceTitle")}>
        <div className="cform" style={{ maxWidth: "none" }}>
          <p style={{ margin: 0 }}>{ts("scope.replaceText")}</p>
          <ul className="svcadm__rules">
            {(["archive", "orders", "templates", "docServices", "flows"] as const).map((k) => (
              <li key={k}>{ts(`scope.rule.${k}`)}</li>
            ))}
          </ul>
          <div className="svced__acts">
            <button className="btn btn--ghost" type="button" onClick={() => setReplaceOpen(false)} disabled={replaceBusy}>
              {t("form.cancel")}
            </button>
            <button className="btn btn--pri" type="button" onClick={() => void replaceCatalog()} disabled={replaceBusy}>
              {replaceBusy ? t("form.saving") : ts("scope.replaceCta")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
    </>
  );
}
