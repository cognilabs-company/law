"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { BackendService } from "@/lib/services/backend";
import {
  getSellerCatalogPage,
  getSellerCatalogTree,
  isAdvocateOnly,
  scopeKey,
  type CatalogCategory,
  type CatalogItem,
  type ServiceScope,
} from "@/lib/services/sellerServices";
import { IconCheck, IconChevronLeft, IconChevronRight, IconClose, IconFolder, IconLayers, IconLock, IconSearch } from "@/components/icons";
import ServicePicker from "./ServicePicker";
import { categoryTitleName } from "@/lib/categoryNames";
import { som } from "./bits";
import "./catalogPicker.css";

type TreeLoad = { key: string; ok: boolean; items: CatalogCategory[] };
type PageLoad = { key: string; ok: boolean; items: CatalogItem[]; hasMore: boolean; total: number | null; busy: boolean };
type Blocked = "" | "taken" | "advocate" | "locked";

const scopeOf = (orgId: string, memberId: string): ServiceScope => (orgId ? { kind: "org", orgId, memberId } : { kind: "me" });

function chain(items: CatalogCategory[], path: string[]): CatalogCategory[] {
  const out: CatalogCategory[] = [];
  let level = items;
  for (const id of path) {
    const hit = level.find((c) => c.id === id);
    if (!hit) break;
    out.push(hit);
    level = hit.children;
  }
  return out;
}

export default function CatalogPicker({
  value,
  onChange,
  taken,
  lawyer,
  invalid,
  inputId,
  scope,
  aiId,
}: {
  value: BackendService | null;
  onChange: (s: BackendService | null, item: CatalogItem | null) => void;
  taken: Set<string>;
  lawyer: boolean;
  invalid?: string;
  inputId: string;
  scope: ServiceScope;
  aiId?: string;
}) {
  const t = useTranslations("sellerServices.catalog");
  const tf = useTranslations("sellerServices.form");
  const tl = useTranslations("sellerServices.limits");
  const locale = useLocale();
  const uid = useId();
  const headRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const orgId = scope.kind === "org" ? scope.orgId : "";
  const memberId = scope.kind === "org" ? scope.memberId : "";
  const sk = scopeKey(scope);
  const [tree, setTree] = useState<TreeLoad | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [pages, setPages] = useState<Record<string, PageLoad>>({});
  const [nonce, setNonce] = useState(0);
  const query = q.trim();
  const treeKey = `${sk}|${nonce}`;

  useEffect(() => {
    const ac = new AbortController();
    getSellerCatalogTree(scopeOf(orgId, memberId), ac.signal).then(
      (r) => {
        if (!ac.signal.aborted) setTree({ key: treeKey, ok: true, items: r.items });
      },
      () => {
        if (!ac.signal.aborted) setTree({ key: treeKey, ok: false, items: [] });
      },
    );
    return () => ac.abort();
  }, [orgId, memberId, treeKey]);

  const treeNow = tree && tree.key === treeKey ? tree : null;
  const nodes = treeNow ? chain(treeNow.items, path) : [];
  const current = nodes.length ? nodes[nodes.length - 1] : null;
  const catId = current?.id ?? "";
  const listing = Boolean(query || catId);
  const pageKey = `${sk}|${locale}|${catId}|${query}|${nonce}`;

  useEffect(() => {
    if (!listing || !treeNow?.ok) return;
    const ac = new AbortController();
    const h = window.setTimeout(
      () => {
        getSellerCatalogPage(scopeOf(orgId, memberId), { categoryId: catId || undefined, q: query || undefined, offset: 0 }, locale, ac.signal).then(
          (r) => {
            if (!ac.signal.aborted) setPages((cur) => ({ ...cur, [pageKey]: { key: pageKey, ok: true, items: r.items, hasMore: r.hasMore, total: r.total, busy: false } }));
          },
          () => {
            if (!ac.signal.aborted) setPages((cur) => ({ ...cur, [pageKey]: { key: pageKey, ok: false, items: [], hasMore: false, total: null, busy: false } }));
          },
        );
      },
      query ? 280 : 0,
    );
    return () => {
      ac.abort();
      window.clearTimeout(h);
    };
  }, [listing, treeNow?.ok, orgId, memberId, catId, query, locale, pageKey]);

  const page = pages[pageKey] ?? null;

  const loadMore = () => {
    if (!page || !page.ok || page.busy || !page.hasMore) return;
    const key = pageKey;
    const offset = page.items.length;
    setPages((cur) => ({ ...cur, [key]: { ...page, busy: true } }));
    getSellerCatalogPage(scope, { categoryId: catId || undefined, q: query || undefined, offset }, locale).then(
      (r) => {
        setPages((cur) => {
          const prev = cur[key];
          if (!prev) return cur;
          const seen = new Set(prev.items.map((x) => x.service.id));
          return { ...cur, [key]: { ...prev, items: [...prev.items, ...r.items.filter((x) => !seen.has(x.service.id))], hasMore: r.hasMore && r.items.length > 0, total: r.total ?? prev.total, busy: false } };
        });
      },
      () => {
        setPages((cur) => (cur[key] ? { ...cur, [key]: { ...cur[key], busy: false, hasMore: true } } : cur));
      },
    );
  };

  const focusHead = () => window.setTimeout(() => headRef.current?.focus(), 0);
  const go = (next: string[]) => {
    setPath(next);
    setQ("");
    focusHead();
  };
  const retry = () => {
    setPages({});
    setNonce((n) => n + 1);
  };

  const blockedOf = (it: CatalogItem): Blocked => {
    if (it.selected || taken.has(it.service.id)) return "taken";
    if (!it.selectable) return "locked";
    if (lawyer && isAdvocateOnly(it.service)) return "advocate";
    return "";
  };

  const pick = (it: CatalogItem) => {
    onChange(it.service, it);
    setQ("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      return;
    }
    if (e.key === "Escape" && q) {
      e.preventDefault();
      e.stopPropagation();
      setQ("");
    }
  };

  if (value) {
    return (
      <div className="svpick__sel">
        <span className="svpick__ic" aria-hidden="true">
          <IconCheck />
        </span>
        <span className="svpick__selm">
          <b>{value.name}</b>
          <small>
            {[value.categoryTitle, value.subcategory].filter(Boolean).join(" · ")}
            {value.price ? ` · ${tf("fromPrice", { price: som(value.price) })}` : ` · ${tf("noPriceTag")}`}
          </small>
        </span>
        <button
          type="button"
          className="btn btn--line btn--sm"
          data-ai-id={aiId ? `${aiId}.change` : undefined}
          data-ai-type={aiId ? "button" : undefined}
          onClick={() => {
            onChange(null, null);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
        >
          {tf("change")}
        </button>
      </div>
    );
  }

  if (treeNow && (!treeNow.ok || !treeNow.items.length)) {
    return <ServicePicker inputId={inputId} value={value} onChange={(s) => onChange(s, null)} taken={taken} lawyer={lawyer} invalid={invalid} />;
  }

  const children = current ? current.children : (treeNow?.items ?? []);
  const items = page?.ok ? page.items : [];
  const status = !treeNow
    ? t("loading")
    : listing && !page
      ? t("loading")
      : listing && page && !page.ok
        ? t("failed")
        : listing && page && !items.length
          ? query
            ? tf("noResults")
            : t("empty")
          : "";
  // Category names in the reader's language (lib/categoryNames).
  const cat = (x: { title: string }) => categoryTitleName(x.title, locale);
  const live = [current && !query ? cat(current) : "", query && page?.ok ? t("found", { n: page.total ?? items.length }) : "", status].filter(Boolean).join(". ");
  const headText = query ? t("results") : current ? cat(current) : t("rootTitle");

  return (
    <div className={`svtree${invalid ? " is-bad" : ""}`} data-ai-id={aiId} data-ai-type={aiId ? "section" : undefined} data-ai-label={aiId ? tf("service") : undefined}>
      <div className="svpick__field">
        <IconSearch aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder={current ? t("searchIn", { name: cat(current) }) : tf("searchPh")}
          autoComplete="off"
          aria-controls={`${uid}-body`}
          aria-describedby={`${uid}-hint`}
          aria-invalid={invalid ? true : undefined}
          data-ai-id={aiId ? `${aiId}.search` : undefined}
          data-ai-type={aiId ? "input" : undefined}
        />
        {q ? (
          <button type="button" className="svpick__clear" onClick={() => setQ("")} aria-label={tf("clear")}>
            <IconClose />
          </button>
        ) : null}
      </div>

      <nav className="svtree__crumbs" aria-label={t("crumbsLabel")}>
        {path.length ? (
          <button type="button" className="svtree__back" onClick={() => go(path.slice(0, -1))} aria-label={t("back")} data-ai-id={aiId ? `${aiId}.back` : undefined} data-ai-type={aiId ? "button" : undefined}>
            <IconChevronLeft aria-hidden="true" />
          </button>
        ) : null}
        <ol>
          <li>
            {nodes.length ? (
              <button type="button" className="svtree__crumb" onClick={() => go([])}>
                {t("root")}
              </button>
            ) : (
              <span className="svtree__crumb is-cur" aria-current="page">
                {t("root")}
              </span>
            )}
          </li>
          {nodes.map((n, i) => (
            <li key={n.id}>
              <IconChevronRight aria-hidden="true" className="svtree__sep" />
              {i === nodes.length - 1 ? (
                <span className="svtree__crumb is-cur" aria-current="page">
                  {cat(n)}
                </span>
              ) : (
                <button type="button" className="svtree__crumb" onClick={() => go(path.slice(0, i + 1))}>
                  {cat(n)}
                </button>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="svtree__body" id={`${uid}-body`}>
        <h4 ref={headRef} tabIndex={-1} className="svtree__h">
          {headText}
          {current && !query && current.count ? <small>{t("count", { n: current.count })}</small> : null}
        </h4>

        {!treeNow ? <p className="svpick__msg">{t("loading")}</p> : null}

        {treeNow && !query && children.length ? (
          <>
            {current ? <p className="svtree__sub">{t("sections")}</p> : null}
            <ul className="svtree__list">
              {children.map((c) => {
                const empty = !c.count && !c.children.length;
                const meta = [t("count", { n: c.count }), c.children.length ? t("subCount", { n: c.children.length }) : ""].filter(Boolean).join(" · ");
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`svtree__row svtree__row--cat${empty ? " is-off" : ""}`}
                      aria-disabled={empty ? true : undefined}
                      onClick={() => {
                        if (!empty) go([...path, c.id]);
                      }}
                      data-ai-id={aiId ? `${aiId}.category.${c.id}` : undefined}
                      data-ai-type={aiId ? "list_item" : undefined}
                    >
                      <span className="svpick__oi" aria-hidden="true">
                        <IconFolder />
                      </span>
                      <span className="svpick__om">
                        <b>{cat(c)}</b>
                        <small>{meta}</small>
                      </span>
                      {c.selected ? <em className="svpick__tag svtree__got">{t("selectedShort", { n: c.selected })}</em> : null}
                      <IconChevronRight aria-hidden="true" className="svtree__go" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {treeNow && listing ? (
          <>
            {!query && children.length ? <p className="svtree__sub">{t("services")}</p> : null}
            {status ? (
              <p className={`svpick__msg${page && !page.ok ? " svpick__msg--bad" : ""}`}>
                {status}
                {page && !page.ok ? (
                  <button type="button" className="svtree__retry" onClick={retry}>
                    {t("retry")}
                  </button>
                ) : null}
              </p>
            ) : null}
            {items.length ? (
              <ul className="svtree__list">
                {items.map((it) => {
                  const b = blockedOf(it);
                  const sid = it.service.id;
                  const why = b === "locked" ? it.lockReason || t("locked") : b === "advocate" ? tf("advocateOnlyHint") : "";
                  const sub = [it.service.categoryTitle, it.service.subcategory].filter(Boolean).join(" · ");
                  const price = it.pricing && it.pricing.recommended > 0 ? it.pricing.recommended : (it.service.price ?? 0);
                  const lim = it.pricing && it.pricing.minimum > 0 && it.pricing.maximum >= it.pricing.minimum ? it.pricing : null;
                  return (
                    <li key={sid}>
                      <button
                        type="button"
                        className={`svtree__row${b ? " is-off" : ""}`}
                        aria-disabled={b ? true : undefined}
                        aria-describedby={why ? `${uid}-w-${sid}` : undefined}
                        onClick={() => {
                          if (!b) pick(it);
                        }}
                        data-ai-id={aiId ? `${aiId}.service.${sid}` : undefined}
                        data-ai-type={aiId ? "list_item" : undefined}
                      >
                        <span className="svpick__oi" aria-hidden="true">
                          {b === "locked" || b === "advocate" ? <IconLock /> : b === "taken" ? <IconCheck /> : <IconLayers />}
                        </span>
                        <span className="svpick__om">
                          <b>{it.service.name}</b>
                          {why ? <small id={`${uid}-w-${sid}`} className="svtree__why">{why}</small> : sub ? <small>{sub}</small> : null}
                        </span>
                        <span className="svpick__or">
                          {b === "taken" ? (
                            <em className="svpick__tag">{tf("added")}</em>
                          ) : b === "advocate" ? (
                            <em className="svpick__tag svpick__tag--lock">{tf("advocateOnly")}</em>
                          ) : b === "locked" ? (
                            <em className="svpick__tag svpick__tag--lock">{t("lockedTag")}</em>
                          ) : price ? (
                            <span className="svpick__price">
                              {tf("fromPrice", { price: som(price) })}
                              {lim ? <small className="svtree__lim">{tl("rangeValue", { min: som(lim.minimum), max: som(lim.maximum) })}</small> : null}
                            </span>
                          ) : (
                            <em className="svpick__tag svpick__tag--none">{tf("noPriceTag")}</em>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {page?.ok && page.hasMore ? (
              <button type="button" className="btn btn--line btn--sm svtree__more" onClick={loadMore} disabled={page.busy} aria-busy={page.busy || undefined} data-ai-id={aiId ? `${aiId}.more` : undefined} data-ai-type={aiId ? "button" : undefined}>
                {page.busy ? t("loading") : page.total ? t("moreOf", { shown: items.length, total: page.total }) : t("more")}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <p id={`${uid}-hint`} className="svpick__hint">
        {t("hint")}
      </p>
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
    </div>
  );
}
