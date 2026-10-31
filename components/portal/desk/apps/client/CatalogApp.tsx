"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  getDocumentTemplateCategories,
  getLawyerServices,
  getServiceCategories,
  getServiceDocumentFields,
  getServicePassport,
  getServiceTemplateSourceFile,
  getServices,
  searchServices,
  type BackendCategory,
  type BackendService,
} from "@/lib/services/backend";
import { ApiError, asDict, asStr, errDetail, http } from "@/lib/http";
import { extFromMime, fetchAndDeliver } from "@/lib/download";
import { cleanDocTitle } from "@/lib/docTitle";
import { normalizeSearchText } from "@/lib/searchText";
import { useIsFreeAiTier } from "@/lib/useAiTier";
import { fmtUzs } from "@/lib/money";
import { IconAlert, IconBolt, IconBriefcase, IconDocLines, IconDownload, IconEdit, IconEye, IconFileText, IconFolder, IconGrid, IconLock, IconPlus, IconRefresh, IconScale, IconSparkle, IconUsers } from "@/components/icons";
import { App, Banner, Btn, Dialog, Empty, Loading, Search, Select, Sidebar, Table, Tag, Tool, Toolbar, useOs, useToast, type Col, type NavSection, type Tone } from "../../kit/kit";
import type { NativeProps } from "../../native";
import CatalogOrder from "./CatalogOrder";
import DocBuilder from "./DocBuilder";
import DocOrderDialog from "./DocOrder";
import DocPreview from "./DocPreview";
import Passport from "./Passport";
import "./client.css";
import { categoryName } from "@/lib/categoryNames";
import { categoryTitleName } from "@/lib/categoryNames";

// Legal documents and services as a desktop program — Finder / File
// Explorer over the catalog: the fields of law in the sidebar, their
// directions as folders, a direction's templates as a list with the chosen
// one on the right (what it is, its passport, its price) and what can be
// done with it: read the template, fill it in, download it, or have an
// advocate do it. Searching looks across the whole catalog. A template
// opens the builder in this window; an advocate's order opens its sheet,
// payment included. The rules are the web catalog's.

type Exec = "all" | "ai" | "yurist" | "advokat";
type Price = "all" | "free" | "low" | "mid" | "high";
type Sort = "rel" | "az" | "cheap" | "doc";
type Dir = { cat: string; catName: string; name: string; n: number; samples: string[] };
const PRICE_LOW = 300_000;
const PRICE_MID = 1_000_000;
const NO_SUBCAT = "Boshqa";
const SERVICES_PAGE = 500;
const FAMILY_TONES = ["#2f7cf6", "#8e5cf7", "#e5484d", "#2e9d57", "#f08a24", "#0f9fb0"];

// Runtime executor_types first, the singular executor_type only when the
// list is missing (answers 2026-10-31 §4.2).
function execOf(s: BackendService): Exclude<Exec, "all"> {
  if (s.advokatRequired) return "advokat";
  const n = normalizeSearchText((s.executorTypes?.length ? s.executorTypes.join(" ") : s.executorType) || "");
  if (/(?:^| )ai(?: |$)/.test(n)) return "ai";
  if (n.includes("advokat") && !n.includes("yurist")) return "advokat";
  if (n.includes("yurist") || n.includes("lawyer")) return "yurist";
  return "ai";
}
function inPrice(s: BackendService, v: Price) {
  const p = s.price ?? 0;
  return v === "all" ? true : v === "free" ? !p : v === "low" ? p > 0 && p <= PRICE_LOW : v === "mid" ? p > PRICE_LOW && p <= PRICE_MID : p > PRICE_MID;
}
function fileName(raw: string, service: string, mime: string, fallback: string) {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(raw)?.[1] || extFromMime(mime) || "docx";
  return `${cleanDocTitle(raw.replace(/\.([A-Za-z0-9]{1,8})$/, "")) || cleanDocTitle(service) || fallback}.${ext}`;
}

export default function CatalogApp(props: NativeProps) {
  const { route, base, openApp } = props;
  const path = route.split("?")[0];
  const m = /\/services\/document\/([^/?#]+)(\/view)?/.exec(path);
  const toCatalog = useCallback(() => openApp("services", `${base}/services`), [openApp, base]);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (m[2]) return <DocPreview key={id} serviceId={id} base={base} openApp={openApp} back={toCatalog} />;
    const lawyer = new URLSearchParams(route.split("?")[1] ?? "").get("mode") === "lawyer";
    return <DocBuilder key={`${id}:${lawyer}`} serviceId={id} lawyer={lawyer} back={toCatalog} preview={() => openApp("services", `${base}/services/document/${encodeURIComponent(id)}/view`)} openRoute={(route) => props.openLink({ appId: "", route })} />;
  }
  return <Browse {...props} />;
}

function Browse({ route, base, onRoute, openApp, openLink }: NativeProps) {
  const t = useTranslations("portal.client.services");
  const td = useTranslations("portal.client.documents");
  const d = useTranslations("portal.desk.client");
  const locale = useLocale();
  const os = useOs();
  const free = useIsFreeAiTier();
  const [toast, say] = useToast();
  const [cats, setCats] = useState<BackendCategory[] | null>(null);
  const [catsErr, setCatsErr] = useState(false);
  const [catsTry, setCatsTry] = useState(0);
  const [fam, setFam] = useState("");
  const [open, setOpen] = useState<{ cat: string; sub: string } | null>(null);
  const [svcs, setSvcs] = useState<{ cat: string; list: BackendService[] } | null>(null);
  const [svcErr, setSvcErr] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<{ q: string; list: BackendService[] } | null>(null);
  const [exec, setExec] = useState<Exec>("all");
  const [price, setPrice] = useState<Price>("all");
  const [sort, setSort] = useState<Sort>("rel");
  const [sel, setSel] = useState("");
  const [order, setOrder] = useState<BackendService | null>(null);
  const [newDoc, setNewDoc] = useState(false);
  const [gate, setGate] = useState<"" | "pro" | string>("");
  const [dl, setDl] = useState("");
  const [region, setRegion] = useState("");
  const [preSeller, setPreSeller] = useState<{ id: string; name: string } | null>(null);
  const [preIds, setPreIds] = useState<Set<string> | null>(null);
  const [packageId, setPackageId] = useState("");
  const [deep, setDeep] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([getServiceCategories(), getDocumentTemplateCategories().catch(() => [])])
      .then(([tree, doc]) => {
        if (!alive) return;
        const keys = new Set(doc.map((c) => c.key));
        setCats(keys.size ? tree.filter((c) => keys.has(c.slug)) : tree);
        setCatsErr(false);
      })
      .catch(() => alive && setCatsErr(true));
    return () => {
      alive = false;
    };
  }, [catsTry]);
  useEffect(() => {
    let alive = true;
    http("/auth/me")
      .then((x) => alive && setRegion(asStr(asDict(x).region)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  // What a link asks for: a search, a direction, one service, one
  // advocate's services, a package. Read, then dropped from the address.
  useEffect(() => {
    if (!route.includes("?")) return;
    const sp = new URLSearchParams(route.split("?")[1]);
    const h = setTimeout(() => {
      if (sp.get("q")) setQ(sp.get("q") ?? "");
      if (sp.get("cat")) setOpen({ cat: sp.get("cat") ?? "", sub: sp.get("subcat") ?? "" });
      if (sp.get("lawyer")) setPreSeller({ id: sp.get("lawyer") ?? "", name: sp.get("name") ?? "" });
      if (sp.get("package")) setPackageId(sp.get("package") ?? "");
      if (sp.get("service")) setDeep(sp.get("service") ?? "");
      onRoute(route.split("?")[0]);
    }, 0);
    return () => clearTimeout(h);
  }, [route, onRoute]);
  // One advocate's services only, when the client came from their page.
  useEffect(() => {
    if (!preSeller) return;
    let alive = true;
    getLawyerServices(preSeller.id)
      .then((rows) => alive && setPreIds(new Set(rows.map((r) => r.id).filter(Boolean))))
      .catch(() => alive && setPreIds(new Set()));
    return () => {
      alive = false;
    };
  }, [preSeller]);
  const narrowed = !!preSeller && !!preIds?.size;
  const offered = useCallback((s: BackendService) => !narrowed || !!preIds?.has(s.id), [narrowed, preIds]);
  // A service named by the link: a template opens its builder, anything
  // else its order.
  useEffect(() => {
    if (!deep) return;
    let alive = true;
    getServicePassport(deep, locale)
      .then((r) => {
        if (!alive || !r.service.id) return;
        if (r.service.documentTemplateId) openApp("services", `${base}/services/document/${encodeURIComponent(r.service.id)}`);
        else setOrder(r.service);
      })
      .catch(() => undefined)
      .finally(() => alive && setDeep(""));
    return () => {
      alive = false;
    };
  }, [deep, locale, openApp, base]);
  // The templates of an open field, page by page.
  const openCat = open?.cat ?? "";
  useEffect(() => {
    if (!openCat || svcs?.cat === openCat) return;
    let alive = true;
    (async () => {
      const all: BackendService[] = [];
      for (let offset = 0; ; ) {
        const page = await getServices({ category_id: openCat, catalog_only: true, limit: SERVICES_PAGE, offset }, locale);
        if (!alive) return;
        all.push(...page.filter((s) => s.documentTemplateId));
        if (page.length < SERVICES_PAGE) break;
        offset += page.length;
      }
      setSvcs({ cat: openCat, list: all });
      setSvcErr(false);
    })().catch(() => alive && setSvcErr(true));
    return () => {
      alive = false;
    };
  }, [openCat, svcs, locale]);
  // Search across the catalog after a pause.
  const term = q.trim();
  const searching = term.length >= 2;
  useEffect(() => {
    if (!searching) return;
    let alive = true;
    const h = setTimeout(() => {
      Promise.allSettled([searchServices(term, { limit: 50 }, locale), getServices({ q: term, catalog_only: false, limit: 50 }, locale)]).then(([ranked, plain]) => {
        if (!alive) return;
        const list = ranked.status === "fulfilled" ? ranked.value.map((x) => x.service) : [];
        const seen = new Set(list.map((s) => s.id));
        if (plain.status === "fulfilled")
          for (const s of plain.value)
            if (s.id && !seen.has(s.id)) {
              seen.add(s.id);
              list.push(s);
            }
        setRemote({ q: term, list: list.filter((s) => s.documentTemplateId) });
      });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [term, searching, locale]);

  const dirs = useMemo<Dir[]>(() => {
    const out: Dir[] = [];
    for (const c of cats ?? []) for (const sc of c.subcategories) out.push({ cat: c.id, catName: categoryName(c, locale), name: sc.title, n: sc.servicesCount, samples: sc.sampleServices.map((s) => s.title).filter(Boolean).slice(0, 3) });
    return out.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [cats, locale]);
  const shownDirs = fam ? dirs.filter((x) => x.cat === fam) : dirs;
  const list = useMemo(() => {
    const rows = searching ? (remote && remote.q === term ? remote.list : []) : open && svcs?.cat === open.cat ? svcs.list.filter((s) => (s.subcategory || NO_SUBCAT) === open.sub) : [];
    const out = rows.filter((s) => offered(s) && (exec === "all" || execOf(s) === exec) && inPrice(s, price));
    if (sort === "az") out.sort((a, b) => a.name.localeCompare(b.name, locale));
    else if (sort === "cheap") out.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    else if (sort === "doc") out.sort((a, b) => Number(!!b.documentTemplateId) - Number(!!a.documentTemplateId));
    else if (!searching) out.sort((a, b) => a.name.localeCompare(b.name, locale));
    return out;
  }, [searching, remote, term, open, svcs, offered, exec, price, sort, locale]);
  const listing = searching || !!open?.sub;
  const loadingList = searching ? !remote || remote.q !== term : !!open && svcs?.cat !== open.cat && !svcErr;
  const cur = list.find((s) => s.id === sel) ?? null;
  const famName = (id: string) => cats?.find((c) => c.id === id)?.name ?? "";

  const fill = (s: BackendService) => openApp("services", `${base}/services/document/${encodeURIComponent(s.id)}`);
  const view = (s: BackendService) => openApp("services", `${base}/services/document/${encodeURIComponent(s.id)}/view`);
  const toLawyer = (s: BackendService) => (s.documentTemplateId ? openApp("services", `${base}/services/document/${encodeURIComponent(s.id)}?mode=lawyer`) : setOrder(s));
  const dlRef = useRef<(s: BackendService) => void>(() => undefined);
  async function download(s: BackendService) {
    if (free) return setGate("pro");
    if (dl) return;
    setDl(s.id);
    try {
      const f = await getServiceDocumentFields(s.id);
      const src = f.cleanSourceFileUrl || f.cleanSourceFileInlineUrl || f.sourceFileUrl || f.sourceFileInlineUrl;
      if (!f.hasSourceFile || !src) return say(t("downloadError"), "err");
      const ok = await fetchAndDeliver(() => getServiceTemplateSourceFile(src), fileName(f.sourceFileName || "", s.name, f.sourceMimeType, t("docViewTitle")), true);
      if (!ok) say(t("downloadError"), "err");
    } catch (e) {
      if (e instanceof ApiError && e.status === 402 && e.code === "manual_document_plan_required") setGate(errDetail(e) || t("planRequired"));
      else say(t("downloadError"), "err");
    } finally {
      setDl("");
    }
  }
  useEffect(() => {
    dlRef.current = (s) => void download(s);
  });

  const sections: NavSection[] = [
    {
      id: "f",
      title: os === "mac" ? t("chooseFamily") : undefined,
      items: [{ id: "", label: t("allFamilies"), icon: <IconGrid />, count: dirs.length || undefined }, ...(cats ?? []).map((c, i) => ({ id: c.id, label: categoryName(c, locale), icon: <IconFolder style={{ color: FAMILY_TONES[i % FAMILY_TONES.length] }} />, count: c.servicesCount || undefined }))],
    },
  ];
  const tone = (s: BackendService): Tone => (execOf(s) === "advokat" ? "accent" : execOf(s) === "yurist" ? "info" : "neutral");
  const cols: Col<BackendService>[] = [
    {
      id: "name",
      label: t("title"),
      cell: (s) => (
        <span className="dxcw-name">
          <span className="dxcw-ic" aria-hidden>
            {s.documentTemplateId ? <IconDocLines /> : <IconBriefcase />}
          </span>
          <span>
            <b title={s.name}>{s.name}</b>
            <small>{[s.subcategory, searching ? categoryTitleName(s.categoryTitle ?? "", locale) : ""].filter(Boolean).join(" · ")}</small>
          </span>
        </span>
      ),
    },
    { id: "exec", label: t("filterExec"), width: "minmax(110px,auto)", cell: (s) => <Tag tone={tone(s)}>{s.advokatRequired ? t("advokatOnly") : t(execOf(s) === "ai" ? "execAi" : execOf(s) === "yurist" ? "execYurist" : "execAdvokat")}</Tag> },
    { id: "price", label: t("filterPrice"), width: "minmax(110px,auto)", align: "end", cell: (s) => <span className="dxcg-price">{s.price ? `${fmtUzs(s.price)} ${t("som")}` : t("filterFree")}</span> },
  ];
  const back = () => (searching ? setQ("") : setOpen(null));

  return (
    <App
      name="ccatalog"
      sidebar={<Sidebar label={t("chooseFamily")} sections={sections} value={fam} onChange={(id) => (setFam(id), setOpen(null), setQ(""), setSel(""))} />}
      inspector={listing && cur ? <Info key={cur.id} s={cur} busy={dl === cur.id} free={free} onView={() => view(cur)} onFill={() => fill(cur)} onDownload={() => dlRef.current(cur)} onLawyer={() => toLawyer(cur)} /> : undefined}
    >
      <Toolbar
        title={searching ? t("title") : open?.sub ? open.sub : fam ? famName(fam) : t("chooseSubcat")}
        subtitle={listing && !loadingList ? t("servicesN", { n: list.length }) : !listing && cats ? t("subcatsN", { n: shownDirs.length }) : undefined}
        back={listing ? { label: d("back"), onClick: back } : undefined}
        end={<Search value={q} onChange={(v) => (setQ(v.slice(0, 120)), setSel(""))} placeholder={t("search")} />}
      >
        <Tool icon={<IconPlus />} label={t("newDocOrder")} onClick={() => setNewDoc(true)} primary={os === "win"} />
        <Tool icon={<IconSparkle />} label={t("aiHelp")} onClick={() => openLink({ appId: "", route: "/portal/client/ai" })} />
        <Tool icon={<IconBolt />} label={t("urgent")} onClick={() => openLink({ appId: "", route: "/portal/client/urgent" })} />
      </Toolbar>
      {listing ? (
        <div className="dxcg-filters" role="group" aria-label={t("sortLabel")}>
          <Select value={exec} onChange={setExec} ariaLabel={t("filterExec")} options={(["all", "ai", "yurist", "advokat"] as const).map((v) => ({ value: v, label: v === "all" ? `${t("filterExec")}: ${t("filterAll")}` : t(v === "ai" ? "execAi" : v === "yurist" ? "execYurist" : "execAdvokat") }))} />
          <Select value={price} onChange={setPrice} ariaLabel={t("filterPrice")} options={(["all", "free", "low", "mid", "high"] as const).map((v) => ({ value: v, label: v === "all" ? `${t("filterPrice")}: ${t("filterAll")}` : t(v === "free" ? "filterFree" : v === "low" ? "priceBandLow" : v === "mid" ? "priceBandMid" : "priceBandHigh") }))} />
          <Select value={sort} onChange={setSort} ariaLabel={t("sortLabel")} options={(["rel", "az", "cheap", "doc"] as const).map((v) => ({ value: v, label: t(v === "rel" ? "sortRelevance" : v === "az" ? "sortByName" : v === "cheap" ? "sortCheapFirst" : "sortDocFirst") }))} />
          </div>
      ) : null}
      {preSeller ? (
        <div className="dxcg-bar">
          <Banner
            tone="info"
            title={t("preSellerTitle", { name: preSeller.name || t("preSellerAnon") })}
            action={
              <Btn small onClick={() => (setPreSeller(null), setPreIds(null))}>
                {t("preSellerClear")}
              </Btn>
            }
          >
            {narrowed ? t("preSellerOnly", { n: preIds?.size ?? 0 }) : preIds && !preIds.size ? t("preSellerNoList") : t("preSellerLead")}
          </Banner>
        </div>
      ) : null}
      <div className="dxcw-body dxcg-body">
        {catsErr ? (
          <Empty icon={<IconAlert />} title={t("empty")} action={<Btn icon={<IconRefresh />} onClick={() => (setCatsErr(false), setCatsTry((n) => n + 1))}>{d("refresh")}</Btn>} />
        ) : !cats ? (
          <Loading label={t("chooseSubcat")} />
        ) : listing ? (
          svcErr && !searching ? (
            <Empty icon={<IconAlert />} title={t("empty")} action={<Btn icon={<IconRefresh />} onClick={() => (setSvcErr(false), setSvcs(null))}>{d("refresh")}</Btn>} />
          ) : loadingList ? (
            <Loading label={t("title")} />
          ) : !list.length ? (
            <Empty icon={<IconFileText />} title={t("empty")} text={t("emptyText")} action={<Btn icon={<IconPlus />} onClick={() => setNewDoc(true)}>{t("newDocOrder")}</Btn>} />
          ) : (
            <Table label={t("title")} cols={cols} rows={list} rowKey={(s) => s.id} selected={sel} onSelect={(s) => setSel(s.id)} onOpen={(s) => (s.documentTemplateId ? fill(s) : setOrder(s))} />
          )
        ) : !shownDirs.length ? (
          <Empty icon={<IconFolder />} title={t("empty")} text={t("emptyText")} />
        ) : (
          <>
            <p className="dxcg-free">
              <IconEye aria-hidden /> {t("freeToView")}
            </p>
            <div className="dxcg-dirs" role="list">
              {shownDirs.map((x) => {
                const i = (cats ?? []).findIndex((c) => c.id === x.cat);
                return (
                  <button key={`${x.cat}-${x.name}`} type="button" role="listitem" className="dxcg-dir" style={{ ["--k" as string]: FAMILY_TONES[(i < 0 ? 0 : i) % FAMILY_TONES.length] }} onClick={() => setOpen({ cat: x.cat, sub: x.name })}>
                    <span className="dxcg-dir__ic" aria-hidden>
                      <IconFolder />
                      <IconScale />
                    </span>
                    <b>{x.name}</b>
                    <small>{fam ? t("servicesN", { n: x.n }) : `${x.catName} · ${t("servicesN", { n: x.n })}`}</small>
                    {x.samples.length ? <em title={x.samples.join(" · ")}>{x.samples.join(" · ")}</em> : null}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      {order ? <CatalogOrder service={order} packageId={packageId} preSeller={preSeller} region={region} openLink={openLink} onClose={() => setOrder(null)} /> : null}
      {newDoc ? <DocOrderDialog onClose={() => setNewDoc(false)} openLink={openLink} /> : null}
      {gate ? (
        <Dialog
          open
          title={gate === "pro" ? t("badgePro") : td("planGateTitle")}
          onClose={() => setGate("")}
          actions={
            <>
              <Btn onClick={() => setGate("")}>{d("close")}</Btn>
              <Btn kind="primary" onClick={() => (setGate(""), openApp("subscription"))}>
                {td("choosePlan")}
              </Btn>
            </>
          }
        >
          <Banner tone="warn">
            {gate === "pro" ? t("badgeProHint") : gate}
          </Banner>
        </Dialog>
      ) : null}
      {toast}
    </App>
  );
}

// The chosen template: what it is, the passport, the price, what to do.
function Info({ s, busy, free, onView, onFill, onDownload, onLawyer }: { s: BackendService; busy: boolean; free: boolean; onView: () => void; onFill: () => void; onDownload: () => void; onLawyer: () => void }) {
  const t = useTranslations("portal.client.services");
  const locale = useLocale();
  const doc = !!s.documentTemplateId;
  return (
    <aside className="dxcw-insp" aria-label={s.name}>
      <header>
        <span className="dxcw-ic is-big" aria-hidden>
          {doc ? <IconDocLines /> : <IconBriefcase />}
        </span>
        <h2>{s.name}</h2>
        <span className="dxcw-tags">
          {s.subcategory ? <Tag>{s.subcategory}</Tag> : null}
          {s.advokatRequired ? (
            <Tag tone="accent" title={t("advokatOnlyHint")}>
              {t("advokatOnly")}
            </Tag>
          ) : null}
        </span>
      </header>
      {s.description ? <p>{s.description}</p> : null}
      <dl>
        <div>
          <dt>{t("price")}</dt>
          <dd className="dxcg-price is-big">{s.price ? `${fmtUzs(s.price)} ${t("som")}` : t("filterFree")}</dd>
        </div>
        {s.categoryTitle ? (
          <div>
            <dt>{t("chooseFamily")}</dt>
            <dd>{categoryTitleName(s.categoryTitle, locale)}</dd>
          </div>
        ) : null}
      </dl>
      <div className="dxcw-acts">
        {doc ? (
          <Btn kind="primary" icon={<IconEdit />} onClick={onFill}>
            {t("fillDoc")}
          </Btn>
        ) : null}
        {doc ? (
          <Btn icon={<IconEye />} onClick={onView}>
            {t("viewDoc")}
          </Btn>
        ) : null}
        {doc ? (
          <Btn icon={free ? <IconLock /> : <IconDownload />} busy={busy} title={free ? t("badgeProHint") : undefined} onClick={onDownload}>
            {busy ? t("downloading") : t("download")}
            {free ? ` · ${t("badgePro")}` : ""}
          </Btn>
        ) : null}
        <Btn kind={doc ? "default" : "primary"} icon={<IconUsers />} onClick={onLawyer}>
          {t("sendToLawyer")}
        </Btn>
      </div>
      <Passport serviceId={s.id} />
    </aside>
  );
}
