"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode, type SVGProps } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { registerReveal, revealTarget } from "@/lib/guide/targets";
import { useScrollEdges } from "@/lib/useScrollEdges";
import "./callcenter/console.css";
import { IconArrowRight, IconAward, IconBolt, IconCircleX, IconCoins, IconFlag, IconGrid, IconStar, IconHeadset, IconInbox, IconSearch, IconShield, IconShieldCheck, IconUsers } from "@/components/icons";

export type CcTab = "cockpit" | "queue" | "urgent" | "escalations" | "complaints" | "mpComplaints" | "warranty" | "cancellations" | "experience" | "achievements" | "licenses" | "payouts" | "leads" | "clients";
export type CcSearch = { q: string; n: number };
type Counted = "cockpit" | "queue" | "urgent" | "escalations" | "complaints" | "mpComplaints" | "warranty" | "cancellations" | "experience" | "achievements" | "licenses" | "payouts";

const ALL: CcTab[] = ["cockpit", "queue", "urgent", "escalations", "complaints", "mpComplaints", "warranty", "cancellations", "experience", "achievements", "licenses", "payouts", "leads", "clients"];
const OPEN: CcTab[] = ["leads", "clients"];
// The three verification queues need marketplace.experience.review (final
// contract 2026-10-29 §1), never a role name; a 403 still hides a tab.
export const REVIEW_PERMISSION = "marketplace.experience.review";
const REVIEW: CcTab[] = ["experience", "achievements", "licenses"];
const baseTabs = (cc: boolean, canReview: boolean): CcTab[] => (cc ? ALL : [...REVIEW, ...OPEN]).filter((k) => canReview || !REVIEW.includes(k));
const STORE = "lexgo_cc_tab";

const ICON: Record<CcTab, ComponentType<SVGProps<SVGSVGElement>>> = {
  cockpit: IconGrid,
  queue: IconInbox,
  urgent: IconBolt,
  escalations: IconArrowRight,
  complaints: IconFlag,
  mpComplaints: IconFlag,
  warranty: IconShield,
  cancellations: IconCircleX,
  experience: IconAward,
  achievements: IconStar,
  licenses: IconShieldCheck,
  payouts: IconCoins,
  leads: IconUsers,
  clients: IconHeadset,
};

const REVEAL: Record<CcTab, RegExp> = {
  cockpit: /^(?:call_center\.cockpit(?:\.|$)|callcenter:cockpit$)/,
  queue: /^(?:call_center\.leads(?:\.|$)|callcenter:queue$)/,
  urgent: /^(?:call_center\.urgent-advokat(?:\.|$)|callcenter:urgent(?:-[a-z]+)?$|button:urgent-claim$)/,
  complaints: /^(?:call_center\.complaints(?:\.|$)|callcenter:complaints$)/,
  cancellations: /^(?:call_center\.cancellations(?:\.|$)|callcenter:cancellations$)/,
  escalations: /^(?:call_center\.escalations(?:\.|$)|callcenter:escalations?$)/,
  mpComplaints: /^(?:call_center\.mp_complaints(?:\.|$)|callcenter:mp-complaints$)/,
  warranty: /^(?:call_center\.warranty(?:\.|$)|callcenter:warranty$)/,
  experience: /^(?:call_center\.experience(?:\.|$)|callcenter:experience(?:-review)?$)/,
  achievements: /^(?:call_center\.achievements(?:\.|$)|callcenter:achievements(?:-review)?$)/,
  licenses: /^(?:call_center\.licenses(?:\.|$)|callcenter:licenses?(?:-review)?$)/,
  payouts: /^(?:call_center\.payouts(?:\.|$)|callcenter:payouts$)/,
  leads: /^(?:call_center\.board(?:\.|$)|callcenter:board$|leads:filters$)/,
  clients: /^(?:call_center\.(?:calls|clients)(?:\.|$)|callcenter:(?:client-search|call-log)$|button:log-call$)/,
};

const FAMILIES = ["work", "disputes", "verify", "money", "people"] as const;
type CcFamily = (typeof FAMILIES)[number];

const FAMILY: Record<CcTab, CcFamily> = {
  cockpit: "work",
  queue: "work",
  urgent: "work",
  escalations: "disputes",
  complaints: "disputes",
  mpComplaints: "disputes",
  warranty: "disputes",
  cancellations: "disputes",
  experience: "verify",
  achievements: "verify",
  licenses: "verify",
  payouts: "money",
  leads: "people",
  clients: "people",
};

const TONE: Partial<Record<CcTab, "hot" | "warn">> = {
  cockpit: "hot",
  urgent: "hot",
  escalations: "hot",
  complaints: "warn",
  mpComplaints: "warn",
  warranty: "warn",
  cancellations: "warn",
  payouts: "warn",
};

const isTab = (v: string): v is CcTab => (ALL as string[]).includes(v);

function readTab(): string {
  try {
    return localStorage.getItem(STORE) ?? "";
  } catch {
    return "";
  }
}

function saveTab(k: CcTab) {
  try {
    localStorage.setItem(STORE, k);
  } catch {}
}

function writeUrl(k: CcTab) {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === k) return;
    url.searchParams.set("tab", k);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch {}
}

function until(test: () => boolean, ms = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const end = Date.now() + ms;
    const tick = () => {
      if (test()) resolve(true);
      else if (Date.now() > end) resolve(false);
      else window.setTimeout(tick, 30);
    };
    tick();
  });
}

export type CcConsole = {
  base: CcTab[];
  tabs: CcTab[];
  active: CcTab;
  counts: Partial<Record<Counted, number>>;
  count: Record<Counted, (n: number) => void>;
  search: CcSearch;
  select: (k: CcTab) => void;
  find: (q: string) => void;
  report: (k: CcTab, empty: boolean) => void;
  attach: (el: HTMLDivElement | null) => void;
};

export function useCcConsole(cc: boolean, canReview = false): CcConsole {
  const params = useSearchParams();
  const fromUrl = params.get("tab") ?? "";
  const base = useMemo(() => baseTabs(cc, canReview), [cc, canReview]);
  const [gone, setGone] = useState<CcTab[]>([]);
  const tabs = base.filter((k) => !gone.includes(k));
  const [pick, setPick] = useState(() => (isTab(fromUrl) ? fromUrl : readTab()));
  const [seenUrl, setSeenUrl] = useState(fromUrl);
  if (seenUrl !== fromUrl) {
    setSeenUrl(fromUrl);
    if (isTab(fromUrl)) setPick(fromUrl);
  }
  const active: CcTab = tabs.find((k) => k === pick) ?? tabs[0] ?? "clients";
  const [counts, setCounts] = useState<Partial<Record<Counted, number>>>({});
  const [search, setSearch] = useState<CcSearch>({ q: "", n: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const attach = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el;
  }, []);
  const activeRef = useRef(active);
  const tabsRef = useRef(tabs);
  useEffect(() => {
    activeRef.current = active;
    tabsRef.current = tabs;
  });

  const select = useCallback((k: CcTab) => {
    setPick(k);
    saveTab(k);
    writeUrl(k);
    const root = rootRef.current;
    const pane = root?.closest(".pbody");
    if (!root || !pane) return;
    const top = root.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
    if (pane.scrollTop > top) pane.scrollTop = top;
  }, [setPick]);

  const find = useCallback(
    (q: string) => {
      setSearch((s) => ({ q, n: s.n + 1 }));
      select("clients");
    },
    [select],
  );

  const report = useCallback((k: CcTab, empty: boolean) => {
    setGone((g) => (g.includes(k) === empty ? g : empty ? [...g, k] : g.filter((x) => x !== k)));
  }, []);

  const count = useMemo(() => {
    const put = (k: Counted) => (n: number) => setCounts((c) => (c[k] === n ? c : { ...c, [k]: n }));
    return { cockpit: put("cockpit"), queue: put("queue"), urgent: put("urgent"), escalations: put("escalations"), complaints: put("complaints"), mpComplaints: put("mpComplaints"), warranty: put("warranty"), cancellations: put("cancellations"), experience: put("experience"), achievements: put("achievements"), licenses: put("licenses"), payouts: put("payouts") };
  }, []);

  const hiddenKey = tabs.filter((k) => k !== active).join(",");
  useEffect(() => {
    const hidden = hiddenKey ? (hiddenKey.split(",") as CcTab[]) : [];
    let alive = true;
    let offs: (() => void)[] = [];
    const register = () => {
      if (!alive) return;
      offs.forEach((off) => off());
      offs = hidden.map((k) =>
        registerReveal(REVEAL[k], async (id) => {
          if (document.querySelector(".amodal")) return;
          select(k);
          if (await until(() => activeRef.current === k)) await revealTarget(id);
        }),
      );
    };
    register();
    let timer = 0;
    const root = rootRef.current;
    const mo = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(register, 150);
    });
    if (root) mo.observe(root, { childList: true, subtree: true });
    return () => {
      alive = false;
      mo.disconnect();
      window.clearTimeout(timer);
      offs.forEach((off) => off());
    };
  }, [hiddenKey, select]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest('a[href="#cc-urgent"]') : null;
      if (!link || !tabsRef.current.includes("urgent")) return;
      e.preventDefault();
      select("urgent");
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [select]);

  return { base, tabs, active, counts, count, search, select, find, report, attach };
}

export function CcTabPanel({ con, tab, children }: { con: CcConsole; tab: CcTab; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { report } = con;
  const shown = con.base.includes(tab);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => report(tab, el.childElementCount === 0);
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true });
    const first = window.setTimeout(check, 0);
    return () => {
      window.clearTimeout(first);
      mo.disconnect();
    };
  }, [tab, report, shown]);
  if (!shown) return null;
  return (
    <div ref={ref} role="tabpanel" id={`ccon-panel-${tab}`} aria-labelledby={`ccon-tab-${tab}`} className="ccon__panel" hidden={con.active !== tab}>
      {children}
    </div>
  );
}

export default function CallCenterConsole({ con, children }: { con: CcConsole; children: ReactNode }) {
  const t = useTranslations("admin.callCenter.console");
  const [q, setQ] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  useScrollEdges(listRef, { silent: true });
  const { active, tabs, counts, select, find, attach } = con;
  const activeCount = active === "leads" || active === "clients" ? undefined : counts[active];
  // New work across the queues, for the line above the tabs.
  const waiting = (["urgent", "escalations", "complaints", "mpComplaints", "warranty", "cancellations"] as const).reduce((n, k) => n + (tabs.includes(k) ? (counts[k] ?? 0) : 0), 0);

  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`#ccon-tab-${active}`);
    if (!list || !el) return;
    const box = list.getBoundingClientRect();
    const at = el.getBoundingClientRect();
    if (at.left < box.left + 32) list.scrollLeft -= box.left + 32 - at.left;
    else if (at.right > box.right - 32) list.scrollLeft += at.right - box.right + 32;
  }, [active, activeCount]);

  function onKey(e: KeyboardEvent<HTMLButtonElement>, k: CcTab) {
    const i = tabs.indexOf(k);
    const n = tabs.length;
    const fwd = e.key === "ArrowRight" || e.key === "ArrowDown";
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    const next = fwd ? tabs[(i + 1) % n] : back ? tabs[(i + n - 1) % n] : e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[n - 1] : null;
    if (!next) return;
    e.preventDefault();
    select(next);
    document.getElementById(`ccon-tab-${next}`)?.focus();
  }

  return (
    <div className="ccon" ref={attach}>
      <div className="ccon__bar">
        <div className="ccon__top">
          <p className="ccon__sum" data-calm={waiting ? undefined : ""} role="status">
            <i aria-hidden="true" />
            {waiting ? t("waiting", { n: waiting }) : t("calm")}
          </p>
          <SearchBox q={q} setQ={setQ} find={find} select={select} />
        </div>
      </div>
      <div className="ccon__body">
        <div className="ccq scue-x" role="tablist" aria-label={t("tabsAria")} aria-orientation="vertical" ref={listRef}>
          {FAMILIES.map((fam) => {
            const items = tabs.filter((k) => FAMILY[k] === fam);
            if (!items.length) return null;
            const sum = items.reduce((n, k) => n + (counts[k as Counted] ?? 0), 0);
            return (
              <div className="ccq__fam" key={fam}>
                <p className="ccq__famh">
                  <span>{t(`fam.${fam}`)}</span>
                  {sum ? <b className="cc-num">{sum}</b> : null}
                </p>
                {items.map((k) => {
                  const Icon = ICON[k];
                  const on = active === k;
                  const n = counts[k as Counted];
                  return (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      id={`ccon-tab-${k}`}
                      aria-controls={`ccon-panel-${k}`}
                      aria-selected={on}
                      tabIndex={on ? 0 : -1}
                      className="ccq__tab"
                      data-tone={n ? TONE[k] : undefined}
                      onClick={() => select(k)}
                      onKeyDown={(e) => onKey(e, k)}
                      data-ai-id={`call_center.console.tab.${k}`}
                      data-ai-type="tab"
                      data-ai-label={t(`tabs.${k}`)}
                    >
                      <Icon aria-hidden="true" />
                      <span>{t(`tabs.${k}`)}</span>
                      {n ? <b className="ccq__n cc-num">{n > 99 ? "99+" : n}</b> : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="ccon__panels">{children}</div>
      </div>
    </div>
  );
}

function SearchBox({ q, setQ, find, select }: { q: string; setQ: (v: string) => void; find: (q: string) => void; select: (k: CcTab) => void }) {
  const t = useTranslations("admin.callCenter.console");
  const tc = useTranslations("admin.callCenter");
  return (
    <form
      className="ccon__search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (term) find(term);
        else select("clients");
        setQ("");
      }}
      data-ai-id="call_center.console.search"
      data-ai-type="input"
      data-ai-label={tc("search")}
    >
      <IconSearch aria-hidden="true" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("searchPh")}
        aria-label={t("searchPh")}
        autoComplete="off"
        enterKeyHint="search"
        maxLength={120}
      />
      <button type="submit" className="ccon__go" aria-label={tc("searchBtn")} title={tc("searchBtn")}>
        <IconArrowRight aria-hidden="true" />
      </button>
    </form>
  );
}
