"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  initials,
  humanizeSlug,
  AREA_KEYS,
  REGION_KEYS,
  type Lawyer,
} from "@/lib/lawyers";
import { listLawyers, demoPrivateChat, getLawyerPrivateChat, type BackendLawyer } from "@/lib/services/backend";
import { isDemoUnavailable, isProviderUnavailable } from "@/lib/http";
import { useResource } from "@/lib/useResource";
import { fmtUzs } from "@/lib/money";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@/i18n/navigation";
import { Skeleton, EmptyState } from "../portal/DataState";
import Select, { type Option } from "../Select";
import { IconChevronLeft, IconChevronRight, IconInfo, IconSearch } from "../icons";

const priceNum = (p: string) => Number(p.replace(/\s/g, "")) || 0;

// Map a backend lawyer profile onto the directory card shape (best-effort;
// missing fields default sanely). Only runs when the backend returns data.
function toLawyer(b: BackendLawyer): Lawyer {
  const r = b.region.toLowerCase();
  const st = b.sellerType.toLowerCase();
  return {
    userId: b.userId,
    name: b.name || "—",
    regionKey: REGION_KEYS.find((k) => r.includes(k)) || "tashkent",
    areaKey: AREA_KEYS.find((a) => b.specializations.includes(a)) || b.specializations[0] || "civil",
    exp: b.experienceYears,
    rate: b.rating,
    rev: b.reviews,
    full: b.winsCount,
    part: b.partialWins,
    price: b.basePrice ? fmtUzs(b.basePrice) : "—",
    super: b.verified,
    kind: st.includes("advokat") ? "advocate" : "lawyer",
  };
}

export default function LawyersSection({
  initialArea = "",
  showFlow = true,
  standalone = false,
  compact = false,
}: {
  initialArea?: string;
  showFlow?: boolean;
  standalone?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("lawyers");
  const te = useTranslations("enums");
  const [area, setArea] = useState(initialArea);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const [sort, setSort] = useState("rating");
  const [kind, setKind] = useState<"" | "advocate" | "lawyer">("");
  const res = useResource<BackendLawyer>(() => listLawyers(), []);
  const source = useMemo(() => res.data.map(toLawyer), [res.data]);
  const { session } = useAuth();
  const tcommon = useTranslations("common");
  const router = useRouter();
  const [chatBusy, setChatBusy] = useState<string | null>(null);
  const [chatErr, setChatErr] = useState<string | null>(null);

  // Back from the checkout page may restore this page from the bfcache with the
  // button still busy (it stays busy while the browser navigates away).
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setChatBusy(null);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // "Choose" → start a paid private chat with this seller (demo purchase).
  async function choose(l: Lawyer) {
    if (!session) {
      router.push("/login");
      return;
    }
    if (!l.userId || chatBusy) return;
    setChatBusy(l.userId);
    setChatErr(null);
    let leaving = false; // stay busy while the browser opens the checkout
    try {
      // Reuse an existing private-chat room if one already exists; else pay for one.
      const existing = await getLawyerPrivateChat(l.userId);
      if (existing) {
        router.push(`/portal/chat/${existing.id}`);
        return;
      }
      const r = await demoPrivateChat({ lawyer_user_id: l.userId });
      if (r.chatRoomId) router.push(`/portal/chat/${r.chatRoomId}`);
      // Real checkout: same-tab navigation (a popup after an await is blocked).
      else if (r.paymentUrl) {
        leaving = true;
        window.location.assign(r.paymentUrl);
      }
    } catch (e) {
      setChatErr(isProviderUnavailable(e) || isDemoUnavailable(e) ? tcommon("paymentUnavailable") : null);
    } finally {
      if (!leaving) setChatBusy(null);
    }
  }
  const scroller = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const list = useMemo(() => {
    // Split the query into words and require every word to appear in the name,
    // so word order and extra spaces don't hide a match ("yurist civil" still
    // finds "Civil Yurist").
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = source.filter((l) => {
      const name = l.name.toLowerCase();
      return (
        (!area || l.areaKey === area) &&
        (!region || l.regionKey === region) &&
        (!kind || l.kind === kind) &&
        (!terms.length || terms.every((w) => name.includes(w)))
      );
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "experience") return b.exp - a.exp;
      if (sort === "priceAsc") return priceNum(a.price) - priceNum(b.price);
      if (sort === "priceDesc") return priceNum(b.price) - priceNum(a.price);
      return b.rate - a.rate;
    });
    return sorted;
  }, [area, region, sort, kind, query, source]);

  const syncNav = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth - 2;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft >= max);
  }, []);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = 0;
    syncNav();
  }, [area, region, sort, query, syncNav]);

  function scrollBy(dir: number) {
    const el = scroller.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(".advcard");
    const step = card ? card.offsetWidth + 12 : 320;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * step, behavior: reduce ? "auto" : "smooth" });
  }

  const regionOpts: Option[] = [
    { value: "", label: te("regions.all") },
    ...REGION_KEYS.map((r) => ({ value: r, label: te(`regions.${r}`) })),
  ];
  const sortOpts: Option[] = [
    { value: "rating", label: t("filters.sortRating") },
    { value: "experience", label: t("filters.sortExperience") },
    { value: "priceAsc", label: t("filters.sortPriceAsc") },
    { value: "priceDesc", label: t("filters.sortPriceDesc") },
  ];
  const stats = t.raw("stats") as { value: string; label: string }[];

  function card(l: Lawyer) {
    return (
      <article className="advcard" key={l.userId || l.name}>
        <div className="advcard__top">
          <div className="advcard__row">
            <div className="advcard__av">{initials(l.name)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="advcard__n">{l.name}</div>
              <div className="advcard__sp">
                {te.has(`areas.${l.areaKey}`) ? te(`areas.${l.areaKey}`) : humanizeSlug(l.areaKey)} · {te.has(`regions.${l.regionKey}`) ? te(`regions.${l.regionKey}`) : humanizeSlug(l.regionKey)}
              </div>
              <div className="advcard__tags">
                <span className={`advcard__kind advcard__kind--${l.kind ?? "lawyer"}`}>
                  {t(l.kind === "advocate" ? "card.kindAdvocate" : "card.kindLawyer")}
                </span>
                {l.super ? <span className="advcard__badge">{t("card.super")}</span> : null}
              </div>
            </div>
          </div>
        </div>
        <div className="advcard__b">
          <div className="rating">
            <b>{l.rate.toFixed(1)}</b>
            <span>{t("card.reviews", { count: l.rev, years: l.exp })}</span>
          </div>
          <div className="wins">
            <div className="win">
              <b>{l.full}</b>
              <span>{t("card.fullWin")}</span>
            </div>
            <div className="win">
              <b>{l.part}</b>
              <span>{t("card.partialWin")}</span>
            </div>
            <div className="win">
              <b>
                {t("card.responseValue")}
                <small>{t("card.responseUnit")}</small>
              </b>
              <span>{t("card.responseLabel")}</span>
            </div>
          </div>
          <div className="advcard__ft">
            <div className="price">
              <b>{l.price}</b>
              <span>{t("card.priceNote")}</span>
            </div>
            <button
              className="btn btn--pri btn--sm"
              type="button"
              onClick={() => choose(l)}
              disabled={chatBusy === l.userId}
            >
              {chatBusy === l.userId ? t("card.opening") : t("card.choose")}
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <section className="sec" id="lawyers" style={{ background: "var(--b50)" }}>
      <div className="wrap">
        <div className="head head--row">
          <div>
            <span className="kick">{t("kicker")}</span>
            <h2 className="h2">{t("title")}</h2>
            <p className="lead">{t("lead")}</p>
          </div>
          {!compact ? (
            <div className="navbtns">
              <button
                className="nbtn"
                onClick={() => scrollBy(-1)}
                disabled={atStart}
                aria-label="prev"
              >
                <IconChevronLeft />
              </button>
              <button
                className="nbtn"
                onClick={() => scrollBy(1)}
                disabled={atEnd}
                aria-label="next"
              >
                <IconChevronRight />
              </button>
            </div>
          ) : null}
        </div>

        {standalone ? (
          <div className="strip">
            {stats.map((s, i) => (
              <div className="strip__i" key={i}>
                <b>{s.value}</b>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        ) : null}

        {standalone ? (
          <div className="lsp__search" style={{ marginBottom: 14 }}>
            <IconSearch />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("filters.searchPh")}
              aria-label={t("filters.searchLabel")}
            />
          </div>
        ) : null}

        <div className="rolerow">
          {([
            ["", "roleAll"],
            ["advocate", "roleAdvocates"],
            ["lawyer", "roleLawyers"],
          ] as const).map(([v, k]) => (
            <button
              key={k}
              type="button"
              className="roletab"
              aria-pressed={kind === v}
              onClick={() => setKind(v)}
            >
              {t(k)}
            </button>
          ))}
        </div>

        <div className="chiprow">
          <button
            className="fchip"
            aria-pressed={area === ""}
            onClick={() => setArea("")}
          >
            {t("filterAll")}
          </button>
          {AREA_KEYS.map((a) => (
            <button
              key={a}
              className="fchip"
              aria-pressed={area === a}
              onClick={() => setArea(a)}
            >
              {te(`areas.${a}`)}
            </button>
          ))}
        </div>

        {standalone ? (
          <div className="filters">
            <div className="fld">
              <label>{t("filters.region")}</label>
              <Select
                value={region}
                onChange={setRegion}
                options={regionOpts}
                ariaLabel={t("filters.region")}
              />
            </div>
            <div className="fld">
              <label>{t("filters.sort")}</label>
              <Select
                value={sort}
                onChange={setSort}
                options={sortOpts}
                ariaLabel={t("filters.sort")}
              />
            </div>
          </div>
        ) : null}

        {res.status === "loading" ? (
          <Skeleton rows={3} />
        ) : !list.length ? (
          <EmptyState title={t("empty")} />
        ) : compact ? (
          <div className="advgrid">{list.map(card)}</div>
        ) : (
          <div className="scroller" ref={scroller} onScroll={syncNav}>
            {list.map(card)}
          </div>
        )}

        {chatErr ? (
          <div className="info" style={{ color: "var(--dk-txt-err, #dc2626)", borderColor: "var(--dk-bd-err, #fecaca)", background: "var(--dk-tint-err, #fef2f2)" }}>
            <IconInfo />
            <span>{chatErr}</span>
          </div>
        ) : null}
        <div className="info">
          <IconInfo />
          <span>{t("priceInfo")}</span>
        </div>

        {showFlow ? (
          <div className="flow">
            {(t.raw("flow") as { title: string; text: string }[]).map((f, i) => (
              <div className="fstep" key={i}>
                <b>{i + 1}</b>
                <strong>{f.title}</strong>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
