"use client";

import "../now/now.css";
import "./clients.css";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import BusinessHoursBadge from "@/components/portal/BusinessHoursBadge";
import { ccSearchClients, type CcClient } from "@/lib/services/backend";
import { isForbidden } from "@/lib/http";
import { isCoarsePointer } from "@/lib/usePopover";
import { IcPhone, IcSearch, IcUser } from "../icons";
import ClientList, { type SearchState } from "./ClientList";
import ClientProfile from "./ClientProfile";
import CallLog from "./CallLog";
import { exactOf } from "./parts";

type View = "profile" | "calls";

const MIN = 2;
const DELAY = 350;
const IDLE: SearchState = { term: "", status: "ready", items: [] };

export default function CcxClients() {
  const t = useTranslations("admin.ccx.clients");
  const tc = useTranslations("admin.callCenter");
  const params = useSearchParams();
  const urlQ = (params.get("q") ?? "").trim();
  const urlCalls = params.get("mode") === "calls";
  const [url, setUrl] = useState({ q: urlQ, calls: urlCalls });
  const [view, setView] = useState<View>(urlCalls ? "calls" : "profile");
  const [logOpened, setLogOpened] = useState(urlCalls);
  const [q, setQ] = useState(urlQ);
  const [req, setReq] = useState({ term: urlQ, n: urlQ ? 1 : 0 });
  const [doneReq, setDoneReq] = useState(0);
  const [search, setSearch] = useState<SearchState>(IDLE);
  const [handled, setHandled] = useState<SearchState>(IDLE);
  const [denied, setDenied] = useState(false);
  const [picked, setPicked] = useState<CcClient | null>(null);
  const [logged, setLogged] = useState({ key: 0, phone: "" });
  const input = useRef<HTMLInputElement>(null);
  const listBox = useRef<HTMLDivElement>(null);
  const profileBox = useRef<HTMLDivElement>(null);
  const term = q.trim();

  if (url.q !== urlQ || url.calls !== urlCalls) {
    setUrl({ q: urlQ, calls: urlCalls });
    if (url.q !== urlQ && urlQ) {
      setQ(urlQ);
      setReq((r) => ({ term: urlQ, n: r.n + 1 }));
      setView("profile");
    }
    if (url.calls !== urlCalls) {
      setView(urlCalls ? "calls" : "profile");
      if (urlCalls) setLogOpened(true);
    }
  }

  if (search.status === "ready" && search !== handled) {
    setHandled(search);
    const asked = req.n !== doneReq && search.term === req.term;
    if (asked) setDoneReq(req.n);
    const hit = exactOf(search.items, search.term) ?? (asked ? search.items[0] : undefined);
    if (hit && hit.id !== picked?.id) setPicked(hit);
  }

  useEffect(() => {
    if (term.length < MIN) return;
    let live = true;
    const id = window.setTimeout(
      () => {
        setSearch((s) => ({ term, status: "loading", items: s.items }));
        ccSearchClients(term).then(
          (items) => {
            if (live) setSearch({ term, status: "ready", items });
          },
          (e: unknown) => {
            if (!live) return;
            if (isForbidden(e)) {
              setDenied(true);
              setSearch({ term, status: "ready", items: [] });
            } else {
              setSearch((s) => ({ term, status: "error", items: s.items }));
            }
          },
        );
      },
      term === req.term ? 0 : DELAY,
    );
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [term, req]);

  const askedQ = url.q;
  useEffect(() => {
    const el = input.current;
    if (!el || isCoarsePointer()) return;
    el.focus({ preventScroll: true });
    if (askedQ) el.select();
  }, [askedQ]);

  const runNow = () => {
    if (term.length < MIN) return;
    setReq((r) => ({ term, n: r.n + 1 }));
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    runNow();
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowDown") return;
    const first = listBox.current?.querySelector<HTMLButtonElement>("button.opx-cl-row");
    if (!first) return;
    e.preventDefault();
    first.focus();
  };

  const pick = (c: CcClient) => {
    setPicked(c);
    if (window.matchMedia("(max-width: 960px)").matches) profileBox.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openFromLog = (id: string, phone: string) => {
    if (picked?.id !== id) setPicked({ id, phone, name: "", lexgoId: "", status: "" });
    setView("profile");
  };

  const showView = (v: View) => {
    setView(v);
    if (v === "calls") setLogOpened(true);
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const to: View = e.key === "Home" ? "profile" : e.key === "End" ? "calls" : view === "profile" ? "calls" : "profile";
    showView(to);
    document.getElementById(`opx-cl-tab-${to}`)?.focus();
  };

  return (
    <div className="opx-cl">
      <div className="opx-cl-top">
        <h2 className="opx-cl-top__title">{t("title")}</h2>
        <form className="opx-cl-search" role="search" onSubmit={onSubmit} data-ai-target="callcenter:client-search">
          <IcSearch size={20} className="opx-cl-search__ic" />
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={t("searchPh")}
            aria-label={tc("search")}
            autoComplete="off"
            spellCheck={false}
          />
        </form>
        <div className="opx-cl-seg opx-cl-seg--view" role="tablist" aria-label={t("viewAria")}>
          <button type="button" role="tab" id="opx-cl-tab-profile" aria-selected={view === "profile"} aria-controls="opx-cl-view-profile" tabIndex={view === "profile" ? 0 : -1} className={view === "profile" ? "is-on" : undefined} onClick={() => showView("profile")} onKeyDown={onTabKey}>
            <IcUser size={17} />
            {t("profile")}
          </button>
          <button type="button" role="tab" id="opx-cl-tab-calls" aria-selected={view === "calls"} aria-controls="opx-cl-view-calls" tabIndex={view === "calls" ? 0 : -1} className={view === "calls" ? "is-on" : undefined} onClick={() => showView("calls")} onKeyDown={onTabKey}>
            <IcPhone size={17} />
            {t("calls")}
          </button>
        </div>
        <span className="opx-cl-top__hours">
          <BusinessHoursBadge holidayTitle={false} />
        </span>
      </div>

      <div id="opx-cl-view-profile" role="tabpanel" aria-labelledby="opx-cl-tab-profile" hidden={view !== "profile"} className="opx-cl-split">
        <div className="opx-cl-side" ref={listBox}>
          <ClientList term={term} min={MIN} search={search} denied={denied} pickedId={picked?.id ?? ""} onPick={pick} onRetry={runNow} />
        </div>
        <div className="opx-cl-main" ref={profileBox}>
          {picked ? (
            <ClientProfile key={picked.id} client={picked} onLogged={(phone) => setLogged((s) => ({ key: s.key + 1, phone }))} />
          ) : (
            <div className="opx-cl-pick">
              <span className="opx-cl-empty__orb" aria-hidden="true">
                <IcUser size={30} />
              </span>
              <h3>{t("pickTitle")}</h3>
              <p>{t("pickText")}</p>
            </div>
          )}
        </div>
      </div>

      <div id="opx-cl-view-calls" role="tabpanel" aria-labelledby="opx-cl-tab-calls" hidden={view !== "calls"}>
        {logOpened ? <CallLog reloadKey={logged.key} loggedPhone={logged.phone} onOpen={openFromLog} /> : null}
      </div>
    </div>
  );
}
