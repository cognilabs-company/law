"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth";
import { getMyReferral, listCases, listClientDocumentFlowPage, listClientWorks, type BackendCase } from "@/lib/services/backend";
import { listMarketplaceOrders, marketStageOf } from "@/lib/services/marketplace";
import { statusLabel } from "@/lib/labels";
import { IconArrowRight, IconBolt, IconBriefcase, IconDocSearch, IconTrafficCase, IconFileText, IconGift, IconSend, IconSparkle, IconTag, IconUsers } from "@/components/icons";
import { App, Btn, Empty, Loading, Progress, Tag, useOs } from "../../kit/kit";
import type { NativeProps } from "../../native";
import { toneOf } from "./bits";
import "./client.css";

// The client's home as a desktop program — the Mac's widgets page, a
// Windows "Home": a greeting and one field to say what happened (the AI
// answers in its own program), the shortcuts to the help LexGo gives, the
// numbers of what is going on, the open requests, and the invite progress.

type Count = { works: number; orders: number; ready: number };

export default function HomeApp({ openLink }: NativeProps) {
  const t = useTranslations("portal.client.dashboard");
  const ta = useTranslations("portal.client.actions");
  const tc = useTranslations("portal.common");
  const tr = useTranslations("portal.referralProgress");
  const d = useTranslations("portal.desk.client");
  const os = useOs();
  const name = useAuth().session?.name?.split(" ")[0] ?? "";
  const [ask, setAsk] = useState("");
  const [cases, setCases] = useState<BackendCase[] | null>(null);
  const [count, setCount] = useState<Count | null>(null);
  const [ref, setRef] = useState<{ joined: number; after: number; unlocked: boolean; pct: number } | null>(null);
  const go = (route: string) => openLink({ appId: "", route });

  useEffect(() => {
    let alive = true;
    listCases()
      .then((l) => alive && setCases(l.filter((c) => c.status !== "completed" && c.status !== "archived")))
      .catch(() => alive && setCases([]));
    Promise.allSettled([listClientWorks({ limit: 1 }), listMarketplaceOrders("client"), listClientDocumentFlowPage({ status: "file_ready", limit: 1 })]).then(([w, o, r]) => {
      if (!alive) return;
      setCount({
        works: w.status === "fulfilled" ? w.value.total : 0,
        orders: o.status === "fulfilled" ? o.value.filter((x) => marketStageOf(x) === "active" || marketStageOf(x) === "pending").length : 0,
        ready: r.status === "fulfilled" ? r.value.total : 0,
      });
    });
    getMyReferral()
      .then((x) => alive && setRef({ joined: x.joined, after: x.eligibleAfter || 5, unlocked: x.discountUnlocked, pct: x.discountPercent }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const send = () => {
    const q = ask.trim();
    go(q ? `/portal/client/ai?q=${encodeURIComponent(q)}` : "/portal/client/ai");
  };
  const actions: { k: string; icon: ReactNode; route: string; tone: string }[] = [
    { k: "describe", icon: <IconSparkle />, route: "/portal/client/ai", tone: "violet" },
    { k: "urgent", icon: <IconBolt />, route: "/portal/client/urgent", tone: "orange" },
    { k: "findSpecialist", icon: <IconUsers />, route: "/portal/client/lawyers", tone: "blue" },
    { k: "consultation", icon: <IconTrafficCase />, route: "/portal/client/urgent?service=traffic_accident_consultation", tone: "red" },
    { k: "documents", icon: <IconFileText />, route: "/portal/client/services", tone: "teal" },
    { k: "upload", icon: <IconDocSearch />, route: "/portal/client/doc-analysis", tone: "green" },
  ];
  const tiles: { k: string; icon: ReactNode; v: number | undefined; label: string; route: string }[] = [
    { k: "works", icon: <IconBriefcase />, v: count?.works, label: d("kpiWorks"), route: "/portal/client/works" },
    { k: "orders", icon: <IconTag />, v: count?.orders, label: t("activeOrders"), route: "/portal/client/marketplace-orders" },
    { k: "ready", icon: <IconFileText />, v: count?.ready, label: d("kpiReady"), route: "/portal/client/documents" },
  ];

  return (
    <App name="chome">
      <div className="dxch dx-scroll">
        <header className="dxch-hero">
          <span className="dxch-hero__hi">{name ? t("hi", { name }) : t("title")}</span>
          <h1>{t("heroTitle")}</h1>
          <form
            className="dxch-ask"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <IconSparkle aria-hidden />
            <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={t("askPh")} aria-label={t("askPh")} maxLength={2000} />
            <Btn kind="primary" type="submit" icon={<IconSend />}>
              {os === "mac" ? undefined : t("askBtn")}
            </Btn>
          </form>
          <p className="dxch-trust">
            <span>{t("trust1")}</span>
            <span>{t("trust2")}</span>
            <span>{t("trust3")}</span>
          </p>
        </header>

        <section className="dxch-actions" aria-label={t("title")}>
          {actions.map((a) => (
            <button key={a.k} type="button" className={`dxch-act is-${a.tone}`} onClick={() => go(a.route)}>
              <span className="dxch-act__ic">{a.icon}</span>
              <b>{ta(a.k)}</b>
              {ta.has(`${a.k}Sub`) ? <small>{ta(`${a.k}Sub`)}</small> : null}
            </button>
          ))}
        </section>

        <div className="dxch-cols">
          <section className="dxch-box">
            <header>
              <h2>{t("requests")}</h2>
              <Btn small kind="plain" icon={<IconArrowRight />} onClick={() => go("/portal/client/cases")}>
                {tc("viewAll")}
              </Btn>
            </header>
            {cases === null ? (
              <Loading label={t("requests")} />
            ) : !cases.length ? (
              <Empty icon={<IconBriefcase />} title={t("emptyTitle")} text={t("emptyText")} />
            ) : (
              <ul className="dxch-list">
                {cases.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => go("/portal/client/cases")}>
                      <span>
                        <b>{c.caseType || c.caseNumber || "—"}</b>
                        <small>{[c.caseNumber, c.nextAction].filter(Boolean).join(" · ")}</small>
                      </span>
                      <Tag tone={toneOf(c.status)}>{statusLabel(tc, c.status)}</Tag>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="dxch-side">
            <section className="dxch-tiles">
              {tiles.map((x) => (
                <button key={x.k} type="button" className={`dxch-tile is-${x.k}`} onClick={() => go(x.route)}>
                  <span className="dxch-tile__ic">{x.icon}</span>
                  <b>{x.v ?? "—"}</b>
                  <small>{x.label}</small>
                </button>
              ))}
            </section>
            {ref ? (
              <section className="dxch-box dxch-ref">
                <header>
                  <h2>
                    <IconGift aria-hidden /> {tr("title")}
                  </h2>
                </header>
                <Progress value={Math.min(100, (ref.joined / Math.max(1, ref.after)) * 100)} label={`${ref.joined} / ${ref.after}`} />
                <p>{ref.unlocked ? tr("unlocked", { pct: ref.pct }) : d("inviteLeft", { n: Math.max(0, ref.after - ref.joined), pct: ref.pct || 10 })}</p>
                <Btn small onClick={() => go("/portal/client/referrals")}>
                  {d("inviteOpen")}
                </Btn>
              </section>
            ) : null}
            <section className="dxch-box dxch-ai">
              <h2>{t("sideAiTitle")}</h2>
              <p>{t("sideAiSub")}</p>
              <Btn kind="primary" icon={<IconSparkle />} onClick={() => go("/portal/client/ai")}>
                {t("sideAiCta")}
              </Btn>
            </section>
          </div>
        </div>
      </div>
    </App>
  );
}
